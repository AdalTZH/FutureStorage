"""
Structure-from-Motion module for multi-view object measurement.
Uses ORB feature matching + essential matrix + triangulation.
Scale resolved via phone IMU (DeviceMotion) or depth model fallback.
"""

import numpy as np

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


def estimate_intrinsics(w: int, h: int, hfov_deg: float = 65.0) -> np.ndarray:
    """Camera intrinsic matrix from image dimensions and horizontal FOV."""
    fx = w / (2 * np.tan(np.radians(hfov_deg / 2)))
    fy = fx
    return np.array([[fx, 0, w / 2], [0, fy, h / 2], [0, 0, 1]], dtype=np.float64)


def _frame_quality(gray: np.ndarray) -> dict:
    """Score frame quality: brightness, contrast, gradient energy.
    Returns {brightness, contrast, gradient, usable}."""
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    # Sobel gradient energy — measures edge/texture availability
    gx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    gradient = float(np.mean(np.sqrt(gx**2 + gy**2)))
    # Frame is usable if it has enough brightness AND texture
    usable = brightness > 30 and contrast > 20 and gradient > 5
    return {"brightness": brightness, "contrast": contrast, "gradient": gradient, "usable": usable}


def _enhance_for_matching(gray: np.ndarray) -> np.ndarray:
    """CLAHE enhancement for low-light feature extraction."""
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    return clahe.apply(gray)


def _extract_features(gray: np.ndarray):
    """Extract ORB features with CLAHE enhancement for low-light robustness."""
    enhanced = _enhance_for_matching(gray)
    orb = cv2.ORB_create(nfeatures=2000)
    kps, descs = orb.detectAndCompute(enhanced, None)
    return kps, descs


def _match(desc1, desc2, max_matches: int = 500):
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = bf.match(desc1, desc2)
    return sorted(matches, key=lambda m: m.distance)[:max_matches]


def triangulate_pair(frame1: np.ndarray, frame2: np.ndarray, K: np.ndarray):
    """Triangulate 3D points between two frames.
    Returns (points_3d Nx3, pts1 Nx2, pts2 Nx2) or (None, None, None)."""
    if not HAS_CV2:
        return None, None, None

    gray1 = cv2.cvtColor(frame1, cv2.COLOR_RGB2GRAY)
    gray2 = cv2.cvtColor(frame2, cv2.COLOR_RGB2GRAY)

    # Quality gate: reject frames too dark/noisy for reliable matching
    q1 = _frame_quality(gray1)
    q2 = _frame_quality(gray2)
    if not q1["usable"] or not q2["usable"]:
        return None, None, None

    kps1, desc1 = _extract_features(gray1)
    kps2, desc2 = _extract_features(gray2)

    if desc1 is None or desc2 is None or len(kps1) < 20 or len(kps2) < 20:
        return None, None, None

    matches = _match(desc1, desc2)
    if len(matches) < 20:
        return None, None, None

    pts1 = np.float64([kps1[m.queryIdx].pt for m in matches])
    pts2 = np.float64([kps2[m.trainIdx].pt for m in matches])

    E, mask = cv2.findEssentialMat(pts1, pts2, K, method=cv2.RANSAC, prob=0.999, threshold=1.0)
    if E is None:
        return None, None, None

    # Inlier ratio gate: if RANSAC can't find a coherent motion model, data is too noisy
    inlier_ratio = float(np.sum(mask)) / len(mask) if mask is not None else 0
    if inlier_ratio < 0.3:
        return None, None, None

    _, R, t, pose_mask = cv2.recoverPose(E, pts1, pts2, K, mask=mask)

    P1 = K @ np.hstack([np.eye(3), np.zeros((3, 1))])
    P2 = K @ np.hstack([R, t])

    inliers = pose_mask.ravel() > 0
    p1_in = pts1[inliers]
    p2_in = pts2[inliers]
    if len(p1_in) < 8:
        return None, None, None

    pts4d = cv2.triangulatePoints(P1, P2, p1_in.T, p2_in.T)
    pts3d = (pts4d[:3] / pts4d[3:]).T

    # Filter points behind camera or very far
    valid = (pts3d[:, 2] > 0) & (pts3d[:, 2] < 100)
    return pts3d[valid], p1_in[valid], p2_in[valid]


def imu_displacement(samples: list[dict], t_start_ms: float, t_end_ms: float) -> float:
    """Integrate accelerometer samples between two timestamps to estimate displacement.
    samples: [{t: ms, ax, ay, az}] — from DeviceMotion event.acceleration.
    Returns displacement in meters (magnitude)."""
    if not samples:
        return 0.0

    # Filter samples in the time window
    window = [s for s in samples if t_start_ms <= s["t"] <= t_end_ms]
    if len(window) < 2:
        return 0.0

    # Trapezoidal integration: acceleration → velocity → displacement
    vx, vy, vz = 0.0, 0.0, 0.0
    dx, dy, dz = 0.0, 0.0, 0.0

    for i in range(1, len(window)):
        dt = (window[i]["t"] - window[i - 1]["t"]) / 1000.0
        if dt <= 0 or dt > 0.2:
            continue
        ax = (window[i - 1].get("ax", 0) + window[i].get("ax", 0)) / 2
        ay = (window[i - 1].get("ay", 0) + window[i].get("ay", 0)) / 2
        az = (window[i - 1].get("az", 0) + window[i].get("az", 0)) / 2
        vx += ax * dt
        vy += ay * dt
        vz += az * dt
        dx += vx * dt
        dy += vy * dt
        dz += vz * dt

    return float(np.sqrt(dx**2 + dy**2 + dz**2))


def sfm_measure_object(
    frames: list[np.ndarray],
    detections: list[dict],
    frame_timestamps_ms: list[float],
    imu_samples: list[dict],
    depth_maps: list[np.ndarray] = None,
) -> dict | None:
    """Run SfM across frames and measure the primary detected object.
    Returns {width_m, height_m, depth_m, volume_m3, method} or None."""
    if not HAS_CV2 or len(frames) < 2:
        return None

    h, w = frames[0].shape[:2]
    K = estimate_intrinsics(w, h)

    # Find primary object class (most frequent storable detection)
    class_counts = {}
    for det in detections:
        if det.get("storable", True):
            cls = det["class"]
            class_counts[cls] = class_counts.get(cls, 0) + 1
    if not class_counts:
        return None
    target_cls = max(class_counts, key=class_counts.get)

    # Get representative bbox for the target class (median across detections)
    target_bboxes = [det["bbox"] for det in detections if det["class"] == target_cls]
    med_bbox = np.median(target_bboxes, axis=0).tolist()

    # Triangulate across frame pairs and collect 3D points within the object bbox
    all_obj_points = []
    scales = []

    for i in range(len(frames) - 1):
        j = min(i + 2, len(frames) - 1)  # skip 1 frame for wider baseline
        if j == i:
            continue

        pts3d, pts2d_1, pts2d_2 = triangulate_pair(frames[i], frames[j], K)
        if pts3d is None or len(pts3d) < 8:
            continue

        # Resolve scale from IMU displacement
        baseline_m = 0.0
        if imu_samples and len(frame_timestamps_ms) > j:
            baseline_m = imu_displacement(
                imu_samples,
                frame_timestamps_ms[i],
                frame_timestamps_ms[j],
            )

        # Fallback: use depth model to estimate scale
        if baseline_m < 0.005 and depth_maps is not None and len(depth_maps) > i:
            dm = depth_maps[i]
            d_min, d_max = dm.min(), dm.max()
            if d_max - d_min > 1e-6:
                depth_norm = (dm - d_min) / (d_max - d_min)
                # Compare triangulated Z with depth model at matched points
                ratios = []
                for pt3d, pt2d in zip(pts3d, pts2d_1):
                    px, py = int(pt2d[0]), int(pt2d[1])
                    if 0 <= px < w and 0 <= py < h and pt3d[2] > 0:
                        dv = depth_norm[py, px]
                        if dv > 0.05:
                            ratios.append(dv / pt3d[2])
                if ratios:
                    # depth_norm ∝ relative distance, pts3d[z] ∝ relative distance
                    # Assume median object is at ~0.4m for close-up scans
                    med_ratio = float(np.median(ratios))
                    # Scale so that median depth = 0.4m
                    baseline_m = 0.4 / (med_ratio * float(np.median([p[2] for p in pts3d if p[2] > 0])))
                    baseline_m = max(0.01, min(baseline_m, 2.0))

        if baseline_m < 0.005:
            baseline_m = 0.05  # minimal fallback

        # Scale the 3D points
        scaled_pts = pts3d * baseline_m

        # Filter points within the target object's bbox
        x1, y1, x2, y2 = med_bbox
        for pt3d, pt2d in zip(scaled_pts, pts2d_1):
            if x1 <= pt2d[0] <= x2 and y1 <= pt2d[1] <= y2:
                all_obj_points.append(pt3d)

    if len(all_obj_points) < 6:
        return None

    obj_points = np.array(all_obj_points)

    # IQR outlier removal per axis
    for dim in range(3):
        q1, q3 = np.percentile(obj_points[:, dim], [25, 75])
        iqr = q3 - q1
        if iqr > 1e-6:
            keep = (obj_points[:, dim] >= q1 - 1.5 * iqr) & (obj_points[:, dim] <= q3 + 1.5 * iqr)
            obj_points = obj_points[keep]

    if len(obj_points) < 4:
        return None

    extents = obj_points.max(axis=0) - obj_points.min(axis=0)
    dims = sorted(extents, reverse=True)
    w_m, h_m, d_m = float(dims[0]), float(dims[1]), float(dims[2])

    # Physical sanity gate: reject if any dimension exceeds plausible bounds
    # for a handheld/storable object being scanned up close
    if w_m > 1.5 or h_m > 1.5 or d_m > 1.0:
        print(f"[sfm] rejected: dimensions {w_m:.2f}×{h_m:.2f}×{d_m:.2f}m exceed physical bounds")
        return None

    vol = w_m * h_m * d_m

    # Determine if IMU data contributed to scale
    used_imu = False
    if imu_samples and len(frame_timestamps_ms) >= 2:
        for i in range(len(frames) - 1):
            j = min(i + 2, len(frames) - 1)
            if imu_displacement(imu_samples, frame_timestamps_ms[i], frame_timestamps_ms[j]) > 0.005:
                used_imu = True
                break

    return {
        "width_m": round(w_m, 3),
        "height_m": round(h_m, 3),
        "depth_m": round(d_m, 3),
        "volume_m3": round(vol, 4),
        "sfm_points": len(obj_points),
        "method": "sfm_imu" if used_imu else "sfm_depth",
    }
