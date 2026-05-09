import numpy as np

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    print("[calibration] OpenCV not available — calibration will use fallback scale")

REFERENCES = {
    "a4_paper":    {"w": 0.210, "h": 0.297},
    "credit_card": {"w": 0.0856, "h": 0.054},
    "door_frame":  {"w": 0.900, "h": 2.100},
}


def detect_rectangular_reference(
    frame: np.ndarray,
    depth_map: np.ndarray,
    aspect_ratio: float,
    tol: float,
    real_w: float,
) -> float | None:
    if not HAS_CV2:
        return None
    gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    for cnt in contours:
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) != 4:
            continue
        x, y, w, h = cv2.boundingRect(approx)
        if h == 0:
            continue
        ratio = w / h
        if abs(ratio - aspect_ratio) / aspect_ratio > tol:
            continue
        cx, cy = x + w // 2, y + h // 2
        h_d, w_d = depth_map.shape
        if 0 <= cy < h_d and 0 <= cx < w_d:
            depth_val = float(depth_map[cy, cx])
            if depth_val > 0:
                scale = real_w / (w * depth_val)
                return float(scale)
    return None


def detect_door_frame(
    frame: np.ndarray,
    depth_map: np.ndarray,
    real_w: float,
) -> float | None:
    if not HAS_CV2:
        return None
    gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 30, 100)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80, minLineLength=frame.shape[0] * 0.4, maxLineGap=20)
    if lines is None:
        return None
    vertical = [ln[0] for ln in lines if abs(ln[0][0] - ln[0][2]) < 15]
    if len(vertical) < 2:
        return None
    xs = [ln[0] for ln in vertical]
    xs.sort()
    gap_px = xs[-1] - xs[0]
    if gap_px < 10:
        return None
    mid_x = (xs[-1] + xs[0]) // 2
    mid_y = frame.shape[0] // 2
    h_d, w_d = depth_map.shape
    if 0 <= mid_y < h_d and 0 <= mid_x < w_d:
        depth_val = float(depth_map[mid_y, mid_x])
        if depth_val > 0:
            scale = real_w / (gap_px * depth_val)
            return float(scale)
    return None


def calibrate_scale(frame: np.ndarray, depth_map: np.ndarray) -> float | None:
    scale = detect_rectangular_reference(
        frame, depth_map,
        aspect_ratio=297 / 210, tol=0.05,
        real_w=REFERENCES["a4_paper"]["w"],
    )
    if scale:
        return scale

    scale = detect_rectangular_reference(
        frame, depth_map,
        aspect_ratio=85.6 / 54, tol=0.05,
        real_w=REFERENCES["credit_card"]["w"],
    )
    if scale:
        return scale

    scale = detect_door_frame(
        frame, depth_map,
        real_w=REFERENCES["door_frame"]["w"],
    )
    return scale


def fuse_depth_maps(
    frames: list,
    depth_maps: list,
    scale_factors: list,
) -> np.ndarray:
    """Fuse multiple metric depth maps (already in meters) via weighted median."""
    if not depth_maps:
        return np.ones((720, 1280), dtype=np.float32) * 0.5

    # Depth maps are already in meters from metric DA2; just average
    stacked = np.stack(depth_maps, axis=0)
    fused = np.median(stacked, axis=0)
    return fused
