import os
import io
import numpy as np
from PIL import Image

# Reduce CUDA memory fragmentation on 6GB GPUs
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "max_split_size_mb:512")

try:
    import torch
    from ultralytics import YOLO
    DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    _yolo = None
    _yolo_live = None

    def _load_yolo():
        global _yolo
        if _yolo is None:
            _yolo = YOLO("yolov8m.pt")
        return _yolo

    def _load_yolo_live():
        """Lightweight nano model for real-time per-frame inference — always on GPU."""
        global _yolo_live
        if _yolo_live is None:
            _yolo_live = YOLO("yolov8n.pt").to(DEVICE)
        return _yolo_live

    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False
    DEVICE = "cpu"
    print("[vision] ultralytics not installed — YOLO disabled")

try:
    import torch
    from transformers import pipeline as hf_pipeline
    _depth_pipe = None

    DA2_MODEL_ID = "depth-anything/Depth-Anything-V2-Metric-Indoor-Small-hf"

    def _load_depth():
        global _depth_pipe
        if _depth_pipe is None:
            _depth_pipe = hf_pipeline(
                "depth-estimation", model=DA2_MODEL_ID,
                device="cuda" if torch.cuda.is_available() else "cpu",
            )
            print(f"[vision] DA2 Metric Indoor loaded ({_depth_pipe.device})")
        return _depth_pipe

    HAS_DEPTH = True
    print("[vision] DA2 Metric Indoor available")
except ImportError:
    HAS_DEPTH = False
    print("[vision] transformers not installed — depth disabled")

try:
    import torch
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    from sam2.sam2_video_predictor import SAM2VideoPredictor
    _sam_predictor = None
    _sam_video_predictor = None

    def _load_sam():
        global _sam_predictor
        if _sam_predictor is None:
            _sam_predictor = SAM2ImagePredictor.from_pretrained("facebook/sam2-hiera-tiny")
            print("[vision] SAM 2 Tiny (image) loaded")
        return _sam_predictor

    def _load_sam_video():
        global _sam_video_predictor
        if _sam_video_predictor is None:
            _sam_video_predictor = SAM2VideoPredictor.from_pretrained("facebook/sam2-hiera-tiny")
            print("[vision] SAM 2 Tiny (video) loaded")
        return _sam_video_predictor

    HAS_SAM = True
except ImportError:
    HAS_SAM = False
    print("[vision] sam2 not available — using bbox fallback")


def _to_gpu(model):
    """Move a model to GPU."""
    if hasattr(model, 'to'):
        model.to(DEVICE)


def _to_cpu_and_clear():
    """Free GPU memory after a pipeline stage."""
    try:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except NameError:
        pass


def unload_yolo():
    """Move YOLOv8m off GPU after detection stage."""
    if HAS_YOLO and _yolo is not None:
        _yolo.to('cpu')
    _to_cpu_and_clear()


def unload_depth():
    """No-op for DA2 on CPU — no GPU memory to free."""
    _to_cpu_and_clear()


def unload_sam():
    """Move SAM 2 off GPU after segmentation stage."""
    if HAS_SAM and _sam_video_predictor is not None:
        _sam_video_predictor.cpu()
    if HAS_SAM and _sam_predictor is not None:
        try:
            _sam_predictor.model.cpu()
        except AttributeError:
            pass
    _to_cpu_and_clear()


def jpeg_to_numpy(jpeg_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(jpeg_bytes)).convert("RGB")
    return np.array(img)


def run_yolo(frame: np.ndarray) -> list[dict]:
    if not HAS_YOLO:
        return _mock_yolo_detections()
    model = _load_yolo()
    model.to(DEVICE)
    results = model(frame, verbose=False, conf=CONF_THRESHOLD)
    detections = []
    for r in results:
        for box in r.boxes:
            cls_name = r.names[int(box.cls)]
            detections.append({
                "class": cls_name,
                "confidence": float(box.conf),
                "bbox": box.xyxy[0].tolist(),
                "storable": cls_name.lower() not in EXCLUDE_CLASSES,
            })
    return detections


# Classes that represent storable items (COCO subset)
STORAGE_CLASSES = {
    'suitcase', 'backpack', 'handbag', 'umbrella', 'chair', 'couch', 'bed',
    'dining table', 'tv', 'laptop', 'mouse', 'keyboard', 'remote', 'cell phone',
    'book', 'clock', 'vase', 'scissors', 'teddy bear', 'bottle', 'cup',
    'sports ball', 'baseball bat', 'tennis racket', 'skateboard', 'surfboard',
    'snowboard', 'skis', 'frisbee', 'potted plant', 'microwave', 'oven',
    'toaster', 'sink', 'refrigerator', 'bench', 'box',
}

# Non-storage classes to always exclude from volume estimates
EXCLUDE_CLASSES = {
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train',
    'truck', 'boat', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
    'elephant', 'bear', 'zebra', 'giraffe', 'traffic light', 'fire hydrant',
    'stop sign', 'parking meter',
}

CONF_THRESHOLD = 0.40


def run_yolo_live(frame: np.ndarray) -> list[dict]:
    """YOLOv8n for real-time live detection (~6ms/frame on GPU)."""
    if not HAS_YOLO:
        return _mock_yolo_detections()
    model = _load_yolo_live()
    with torch.no_grad():
        results = model(frame, verbose=False, imgsz=320, half=True, conf=0.30)
    detections = []
    for r in results:
        for box in r.boxes:
            cls_name = r.names[int(box.cls)]
            conf = float(box.conf)
            detections.append({
                "class": cls_name,
                "confidence": conf,
                "bbox": box.xyxy[0].tolist(),
                "storable": cls_name.lower() not in EXCLUDE_CLASSES,
            })
    return detections


def run_depth(frame: np.ndarray) -> np.ndarray:
    """Run metric depth estimation via DA2 Metric Indoor. Returns depth map in METERS."""
    if not HAS_DEPTH:
        return _mock_depth_map(frame.shape[:2])
    import cv2
    pipe = _load_depth()
    pil_img = Image.fromarray(frame)
    result = pipe(pil_img)
    depth = result["predicted_depth"].squeeze().cpu().numpy().astype(np.float32)
    # Resize to original frame dimensions
    h_orig, w_orig = frame.shape[:2]
    if depth.shape != (h_orig, w_orig):
        depth = cv2.resize(depth, (w_orig, h_orig), interpolation=cv2.INTER_LINEAR)
    return depth


def run_sam_mask(frame: np.ndarray, bbox: list, confidence: float = 0.5) -> np.ndarray | None:
    """Get pixel-perfect segmentation mask for object within bbox.
    Returns boolean mask (H, W) or None if SAM unavailable."""
    if not HAS_SAM:
        return None
    predictor = _load_sam()
    predictor.model.to(DEVICE)
    import torch
    # Adaptive bbox expansion: high confidence = 15%, low confidence = 5%
    pad_ratio = 0.05 + 0.10 * max(0.0, min(1.0, (confidence - 0.3) / 0.4))
    h_frame, w_frame = frame.shape[:2]
    x1, y1, x2, y2 = bbox
    bw, bh = x2 - x1, y2 - y1
    pad_x, pad_y = bw * pad_ratio, bh * pad_ratio
    x1 = max(0, x1 - pad_x)
    y1 = max(0, y1 - pad_y)
    x2 = min(w_frame, x2 + pad_x)
    y2 = min(h_frame, y2 + pad_y)
    expanded_bbox = np.array([int(x1), int(y1), int(x2), int(y2)])
    with torch.inference_mode():
        predictor.set_image(frame)
        masks, scores, _ = predictor.predict(box=expanded_bbox, multimask_output=False)
    # masks shape: [1, H, W]
    mask = masks[0].astype(bool)
    return mask


def run_sam_video_masks(
    frames: list[np.ndarray],
    prompt_frame_idx: int,
    prompt_bbox: list,
    confidence: float = 0.5,
) -> list[np.ndarray | None]:
    """Track an object across all frames using SAM 2 video propagation.
    Returns one boolean mask per frame (or None where tracking lost).
    Falls back to single-frame SAM if video predictor unavailable."""
    if not HAS_SAM or len(frames) == 0:
        return [None] * len(frames)

    # Adaptive bbox expansion (same as single-frame SAM)
    pad_ratio = 0.05 + 0.10 * max(0.0, min(1.0, (confidence - 0.3) / 0.4))
    h_frame, w_frame = frames[0].shape[:2]
    x1, y1, x2, y2 = prompt_bbox
    bw, bh = x2 - x1, y2 - y1
    pad_x, pad_y = bw * pad_ratio, bh * pad_ratio
    expanded = [
        int(max(0, x1 - pad_x)), int(max(0, y1 - pad_y)),
        int(min(w_frame, x2 + pad_x)), int(min(h_frame, y2 + pad_y)),
    ]

    try:
        import torch, tempfile, os
        predictor = _load_sam_video()
        predictor.to(DEVICE)

        # SAM 2 video predictor expects a directory of JPEG frames
        with tempfile.TemporaryDirectory() as tmpdir:
            for i, frame in enumerate(frames):
                Image.fromarray(frame).save(os.path.join(tmpdir, f"{i:06d}.jpg"))

            with torch.inference_mode(), torch.autocast(str(DEVICE), dtype=torch.float16):
                state = predictor.init_state(video_path=tmpdir)
                predictor.add_new_points_or_box(
                    state,
                    frame_idx=prompt_frame_idx,
                    obj_id=1,
                    box=np.array(expanded, dtype=np.float32),
                )
                masks_out = [None] * len(frames)
                for fi, obj_ids, video_masks in predictor.propagate_in_video(state):
                    if len(video_masks) > 0:
                        mask = (video_masks[0] > 0.0).squeeze().cpu().numpy().astype(bool)
                        masks_out[fi] = mask
                predictor.reset_state(state)

        return masks_out
    except Exception as e:
        print(f"[vision] SAM 2 video tracking failed, falling back to single-frame: {e}")
        # Fallback: single-frame SAM on each frame
        masks_out = []
        for frame in frames:
            mask = run_sam_mask(frame, prompt_bbox, confidence)
            masks_out.append(mask)
        return masks_out


def _mock_yolo_detections() -> list[dict]:
    return [
        {"class": "suitcase", "confidence": 0.87, "bbox": [100, 150, 300, 400]},
        {"class": "backpack",  "confidence": 0.76, "bbox": [320, 120, 480, 350]},
    ]


def _mock_depth_map(shape: tuple) -> np.ndarray:
    h, w = shape
    depth = np.ones((h, w), dtype=np.float32) * 2.0
    depth[h//4:3*h//4, w//4:3*w//4] = 1.2
    return depth


def _refine_bbox_with_contours(frame: np.ndarray, bbox: list) -> tuple:
    """Use OpenCV edge detection to get tighter object dimensions from YOLO bbox.
    Returns (refined_width_px, refined_height_px) — tighter than raw bbox."""
    import cv2
    x1, y1, x2, y2 = [int(v) for v in bbox]
    h, w = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return (x2 - x1, y2 - y1)

    crop = frame[y1:y2, x1:x2]
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    # CLAHE enhancement for low-light robustness
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
    gray = clahe.apply(gray)
    # Adaptive threshold + Canny for robust edge detection
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 30, 100)
    # Dilate to connect nearby edges
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return (x2 - x1, y2 - y1)

    # Merge all contour points and get minimum area bounding rect
    all_points = np.concatenate(contours)
    rect = cv2.minAreaRect(all_points)
    (_, (rect_w, rect_h), _) = rect

    # Use the tighter dimensions (at least 50% of original bbox to avoid degenerate cases)
    orig_w, orig_h = x2 - x1, y2 - y1
    refined_w = max(rect_w, orig_w * 0.5)
    refined_h = max(rect_h, orig_h * 0.5)
    return (refined_w, refined_h)


def estimate_volume_from_detections(
    per_frame_dets: list[list[dict]],
    depth_maps: list[np.ndarray],
    all_frames: list[np.ndarray],
    camera_fov: float = None,
) -> dict:
    """Returns {total_m3, breakdown: [{class, width_m, height_m, depth_m, volume_m3}]}.
    Uses SAM 2 video tracking for temporally consistent masks across all frames,
    with per-frame depth maps (meters) + FOV geometry."""
    import math
    from collections import Counter

    if not per_frame_dets or not depth_maps or not all_frames:
        return {"total_m3": 0.0, "breakdown": []}

    n_frames = len(all_frames)
    h, w = depth_maps[0].shape
    fov_deg = camera_fov if camera_fov else 60
    H_FOV_RAD = math.radians(fov_deg)

    # ── Find the dominant storable class and best detection ────────────
    all_storable = [
        (fi, d) for fi, dets in enumerate(per_frame_dets)
        for d in dets if d.get("storable", True)
    ]
    if not all_storable:
        return {"total_m3": 0.0, "breakdown": []}

    cls_counts = Counter(d["class"] for _, d in all_storable)
    target_cls = cls_counts.most_common(1)[0][0]

    # Best detection = highest confidence for target class
    best_fi, best_det = max(
        ((fi, d) for fi, d in all_storable if d["class"] == target_cls),
        key=lambda x: x[1]["confidence"],
    )

    # ── SAM 2 video tracking: propagate mask across all frames ────────
    tracked_masks = run_sam_video_masks(
        all_frames, best_fi, best_det["bbox"], best_det.get("confidence", 0.5),
    )

    # ── Measure dimensions on each frame ──────────────────────────────
    measurements = []
    import cv2

    for fi in range(n_frames):
        mask = tracked_masks[fi] if tracked_masks else None
        depth_map = depth_maps[fi]

        # Find this frame's detection for the target class (for bbox/depth region)
        frame_det = next(
            (d for d in per_frame_dets[fi] if d["class"] == target_cls),
            None,
        )
        if frame_det is None and mask is None:
            continue

        # Bbox for depth sampling (from this frame's detection, or best as fallback)
        bbox = frame_det["bbox"] if frame_det else best_det["bbox"]
        x1, y1, x2, y2 = [int(v) for v in bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            continue

        # ── Object distance from this frame's depth map (meters) ──────
        obj_depth_region = depth_map[y1:y2, x1:x2]
        metric_depth = float(np.median(obj_depth_region))
        metric_depth = max(0.1, min(metric_depth, 10.0))

        # ── Pixel-to-meter via FOV geometry ───────────────────────────
        horiz_span_m = 2 * metric_depth * math.tan(H_FOV_RAD / 2)
        px_to_m = horiz_span_m / w

        # ── Object pixel dimensions from tracked mask ─────────────────
        obj_w_px, obj_h_px = float(x2 - x1), float(y2 - y1)
        if mask is not None:
            mask_uint8 = mask.astype(np.uint8) * 255
            contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if contours:
                all_pts = np.concatenate(contours)
                rect = cv2.minAreaRect(all_pts)
                (_, (rect_w, rect_h), _) = rect
                obj_w_px = float(max(rect_w, rect_h))
                obj_h_px = float(min(rect_w, rect_h))
            else:
                ys, xs = np.where(mask)
                if len(xs) > 10:
                    obj_w_px = float(xs.max() - xs.min())
                    obj_h_px = float(ys.max() - ys.min())
        else:
            obj_w_px, obj_h_px = _refine_bbox_with_contours(all_frames[fi], bbox)

        width_m = obj_w_px * px_to_m
        height_m = obj_h_px * px_to_m

        # ── Thickness from depth discontinuity (metric) ───────────────
        if mask is not None:
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
            dilated = cv2.dilate(mask.astype(np.uint8), kernel, iterations=1)
            ring = (dilated > 0) & (~mask)
            ring_depths = depth_map[ring]
            obj_depths = depth_map[mask]
            surr_med = float(np.median(ring_depths)) if ring_depths.size > 10 else metric_depth
            obj_med = float(np.median(obj_depths)) if obj_depths.size > 10 else metric_depth
        else:
            margin = int(max(x2 - x1, y2 - y1) * 0.4)
            surr_y1, surr_y2 = max(0, y1 - margin), min(h, y2 + margin)
            surr_x1, surr_x2 = max(0, x1 - margin), min(w, x2 + margin)
            surr_region = depth_map[surr_y1:surr_y2, surr_x1:surr_x2]
            surr_med = float(np.median(surr_region)) if surr_region.size > 0 else metric_depth
            obj_med = float(np.median(obj_depth_region)) if obj_depth_region.size > 0 else metric_depth
        thickness_from_depth = abs(surr_med - obj_med)

        # Heuristic fallback for thickness
        raw_aspect = max(x2 - x1, y2 - y1) / max(min(x2 - x1, y2 - y1), 1)
        min_dim = min(width_m, height_m)
        if raw_aspect > 1.8 or max(width_m, height_m) < 0.25:
            depth_ratio = 0.06
        elif raw_aspect > 1.3:
            depth_ratio = 0.12
        else:
            depth_ratio = 0.30
        thickness_heuristic = min_dim * depth_ratio

        if thickness_from_depth > 0.002:
            obj_depth_m = thickness_from_depth
        else:
            obj_depth_m = thickness_heuristic

        measurements.append((width_m, height_m, obj_depth_m))

    if not measurements:
        return {"total_m3": 0.0, "breakdown": []}

    # ── Aggregation (same filtering as before) ────────────────────────

    # Outlier mask rejection: drop frames with area >2 IQR from median
    if len(measurements) >= 4:
        areas = [m[0] * m[1] for m in measurements]
        q1, q3 = np.percentile(areas, [25, 75])
        iqr = q3 - q1
        if iqr > 0:
            measurements = [m for m, a in zip(measurements, areas)
                           if q1 - 2 * iqr <= a <= q3 + 2 * iqr]

    # Aspect ratio validation: weight frames matching expected object shape
    EXPECTED_ASPECTS = {
        'cell phone': 2.0, 'remote': 3.5, 'laptop': 1.5, 'book': 1.4,
        'keyboard': 3.0, 'mouse': 1.8, 'bottle': 3.0, 'suitcase': 1.4,
    }
    if target_cls in EXPECTED_ASPECTS and len(measurements) >= 3:
        expected = EXPECTED_ASPECTS[target_cls]
        scored = []
        for m in measurements:
            aspect = max(m[0], m[1]) / max(min(m[0], m[1]), 0.001)
            deviation = abs(aspect - expected) / expected
            scored.append((m, deviation))
        good = [m for m, dev in scored if dev < 0.5]
        if len(good) >= 2:
            measurements = good

    # Redundancy correction: cross-validate via proportional consistency.
    if len(measurements) >= 4:
        products = np.array([m[0] * m[1] for m in measurements])
        med_product = float(np.median(products))
        if med_product > 0:
            corrected = []
            for m in measurements:
                frame_product = m[0] * m[1]
                if frame_product > 0:
                    scale_ratio = np.sqrt(med_product / frame_product)
                    if 0.5 < scale_ratio < 2.0:
                        blend = 0.7 + 0.3 * (1.0 / max(abs(scale_ratio - 1.0) * 5, 1.0))
                        corrected_w = m[0] * (blend + (1 - blend) * scale_ratio)
                        corrected_h = m[1] * (blend + (1 - blend) * scale_ratio)
                        corrected.append((corrected_w, corrected_h, m[2]))
                    else:
                        corrected.append(m)
                else:
                    corrected.append(m)
            measurements = corrected

    widths  = [m[0] for m in measurements]
    heights = [m[1] for m in measurements]
    depths  = [m[2] for m in measurements]
    med_w = float(np.median(widths))
    med_h = float(np.median(heights))
    med_d = float(np.median(depths))
    item_vol = med_w * med_h * med_d

    breakdown = [{
        "class": target_cls,
        "width_m": round(med_w, 3),
        "height_m": round(med_h, 3),
        "depth_m": round(med_d, 3),
        "volume_m3": round(item_vol, 6),
        "samples": len(measurements),
    }]

    return {"total_m3": round(item_vol, 6), "breakdown": breakdown}
