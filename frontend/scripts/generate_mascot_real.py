"""
generate_mascot_real.py
=======================
Three-phase mascot generator for MyStorey.

Phase 0 (--reference):
    Generates ONE canonical reference image of Nana (the mascot) using a
    very detailed character-design prompt. Saved as scripts/nana_reference.png.
    All subsequent generations include this image so the model keeps the
    character consistent across all 52 frames.

Phase 1 (--prompts):
    Uses GPT-5.4-mini to write a precise visual description for every one of
    the 52 animation frames. Outputs a JSON cache at scripts/mascot_prompts.json.

Phase 2 (--generate):
    For each frame, sends [reference_image + frame_prompt] to Nano Banana Pro
    (google/gemini-3-pro-image-preview via OpenRouter). The model sees the
    reference and knows exactly what Nana should look like.
    Saves PNGs to frontend/public/mascot/.

Usage
-----
    python scripts/generate_mascot_real.py --reference          # Phase 0 (run first)
    python scripts/generate_mascot_real.py --prompts            # Phase 1
    python scripts/generate_mascot_real.py --generate           # Phase 2
    python scripts/generate_mascot_real.py --all                # All three phases
    python scripts/generate_mascot_real.py --generate --resume  # Resume partial run

Requirements
------------
    pip install httpx python-dotenv Pillow
    OPENAI_API_KEY     in backend/.env  (Phase 1)
    OPENROUTER_API_KEY in backend/.env  (Phase 0 + 2)
"""

import argparse
import base64
import io
import json
import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv
from PIL import Image

# ── Paths ─────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent
FRONTEND_DIR = SCRIPT_DIR.parent
BACKEND_DIR  = FRONTEND_DIR.parent / "backend"
OUT_DIR        = FRONTEND_DIR / "public" / "mascot"
CACHE_FILE     = SCRIPT_DIR / "mascot_prompts.json"
REFERENCE_FILE = SCRIPT_DIR / "nana_reference.png"

OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Load env ───────────────────────────────────────────────────────
load_dotenv(BACKEND_DIR / ".env")
OPENAI_API_KEY     = os.getenv("OPENAI_API_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

# ── Config ─────────────────────────────────────────────────────────
IMAGE_MODEL  = "google/gemini-3-pro-image-preview"
PROMPT_MODEL = "gpt-5.4-mini"
IMAGE_SIZE   = "1K"
ASPECT_RATIO = "1:1"
DELAY_S      = 2.0   # pause between image API calls to avoid rate-limits

# ── Character bible (injected into every image prompt) ─────────────
CHARACTER = """
Nana: a cute chibi kawaii storage cardboard box mascot.
Body: cream/white rounded cardboard box, subtle fold lines, soft pastel tones.
Eyes: large expressive anime-style eyes with sparkle highlights; no nose.
Arms: two tiny stubby mitten-like arms extending from the sides.
Legs: none — Nana floats/hovers very slightly.
Style: clean flat cel-shaded illustration, 2-px soft dark outline, transparent background,
       centred in frame, subtle drop shadow underneath. No text, no labels, no UI.
Consistent character across all frames.
""".strip()

# ── Detailed reference prompt (Phase 0) ────────────────────────────
REFERENCE_PROMPT = """
Create the canonical character-sheet reference image for Nana, a cute chibi kawaii mascot.

Character details (follow exactly):
- Body: short, squat, rounded cardboard box shape. Warm cream colour (#F5F0E8).
  Subtle dark-brown fold lines on top forming an 'X'. Soft drop shadow underneath.
- Eyes: two large circular eyes, roughly 1/3 of face width each. White sclera.
  Vivid sky-blue circular irises. Round black pupils centred in iris.
  Single small white highlight dot at top-right of each pupil.
  Upper eyelid: gentle curved dark line. No eyelashes.
- Mouth: small, simple curved smile in warm brown, centred below eyes.
- Arms: two short, rounded, mitten-shaped arms extending outward from lower sides
  of the box. Same cream colour as body. Tiny dark outline.
- No legs, no feet — the box base is flat and floats 4 px above a transparent background.
- No nose, no ears, no hat, no accessories.

Pose: neutral idle, facing directly forward, arms relaxed at sides.
Background: fully transparent (PNG alpha).
Style: flat 2-D vector illustration, clean 2-px dark-brown outlines, cel-shaded,
       soft pastel palette, no gradients, no textures, no shadows except the drop shadow.
Composition: centred, full character visible, approximately 80% of frame height.
No text, no labels, no watermarks.
""".strip()

# ── Sequential animation chains: frame → its immediate predecessor ──
# Only frames that are part of a multi-frame action sequence are listed.
# The generator will attach the previous rendered PNG so the model can
# keep pose, lighting and motion arc consistent across frames.
PREV_FRAME: dict[str, str] = {
    # Blink (2-frame)
    "blink_closed":  "blink_half",
    # Scan sweep (left→right)
    "scan_mid_l":    "scan_left",
    "scan_mid_r":    "scan_mid_l",
    "scan_right":    "scan_mid_r",
    # Happy jump (6-frame)
    "happy_crouch":  "happy_stand",
    "happy_rise":    "happy_crouch",
    "happy_peak":    "happy_rise",
    "happy_fall":    "happy_peak",
    "happy_land":    "happy_fall",
    # Booking celebration (6-frame)
    "book_pull":     "book_hold",
    "book_pop":      "book_pull",
    "book_confetti": "book_pop",
    "book_wide":     "book_confetti",
    "book_settle":   "book_wide",
    # Alert escalation (4-frame)
    "alert_brow":    "alert_notice",
    "alert_worried": "alert_brow",
    "alert_full":    "alert_worried",
    # Error reaction (4-frame)
    "error_sweat":   "error_start",
    "error_wave1":   "error_sweat",
    "error_wave2":   "error_wave1",
}

# ── All 52 frame names ─────────────────────────────────────────────
FRAMES = [
    # Lip-sync
    "mouth_M", "mouth_A", "mouth_E", "mouth_O", "mouth_F",
    # Idle / blink
    "idle_center", "idle_left", "idle_right", "blink_half", "blink_closed",
    # Listening
    "listen_neutral", "listen_perk", "listen_lean", "listen_open",
    # Thinking
    "think_start", "think_lookup", "think_bubble_sm", "think_bubble_lg",
    # Scanning
    "scan_left", "scan_mid_l", "scan_mid_r", "scan_right",
    # Happy jump
    "happy_stand", "happy_crouch", "happy_rise", "happy_peak",
    "happy_fall", "happy_land",
    # Booking celebration
    "book_hold", "book_pull", "book_pop", "book_confetti",
    "book_wide", "book_settle",
    # Alert
    "alert_notice", "alert_brow", "alert_worried", "alert_full",
    # Error
    "error_start", "error_sweat", "error_wave1", "error_wave2",
    # Transitions
    "trans_idle_listen", "trans_listen_scan", "trans_scan_think",
    "trans_think_speak", "trans_speak_happy", "trans_listen_alert",
    "trans_any_idle_1", "trans_any_idle_2",
    "trans_idle_speak", "trans_scan_book",
]

# ── Short semantic hint for each frame (used in the GPT prompt) ────
FRAME_HINTS = {
    "mouth_M":        "Lips gently pressed together, neutral relaxed expression (M/bilabial phoneme).",
    "mouth_A":        "Mouth wide open in an 'Ahh' shape, excited eyes.",
    "mouth_E":        "Wide horizontal smile, teeth showing — 'Eee' sound.",
    "mouth_O":        "Mouth forms a small round 'O', surprised brow.",
    "mouth_F":        "Lower lip slightly tucked, corners down — 'F' sound.",
    "idle_center":    "Floating upright, eyes open and calm, gentle neutral smile.",
    "idle_left":      "Gently drifting/tilting 5° to its left, same calm expression.",
    "idle_right":     "Gently drifting/tilting 5° to its right.",
    "blink_half":     "Eyes half-closed mid-blink, same idle pose.",
    "blink_closed":   "Eyes fully closed (two curved lines) mid-blink.",
    "listen_neutral": "Head slightly tilted, eyes attentive and wide, ready to listen.",
    "listen_perk":    "Both arms raised slightly like perked ears, leaning forward.",
    "listen_lean":    "Leaning 10° forward, intent gaze, one eyebrow up.",
    "listen_open":    "Mouth slightly open, eyebrows raised — actively processing audio.",
    "think_start":    "Looking slightly upward, one arm raised and touching chin area.",
    "think_lookup":   "Eyes rolled/glanced upward to the corner, thinking hard.",
    "think_bubble_sm":"Small single thought bubble above Nana's head, eyes still upward.",
    "think_bubble_lg":"Large cloud-shaped thought bubble above head, question mark inside.",
    "scan_left":      "Eyes shifted far left like a radar sweep, body facing forward.",
    "scan_mid_l":     "Eyes shifted slightly left of centre.",
    "scan_mid_r":     "Eyes shifted slightly right of centre.",
    "scan_right":     "Eyes shifted far right, intense focused gaze.",
    "happy_stand":    "Standing pose, big happy grin, arms out to sides.",
    "happy_crouch":   "Crouching down, legs bent, coiling for a jump, eyes excited.",
    "happy_rise":     "Launching upward, arms thrown up, huge grin.",
    "happy_peak":     "At the peak of a jump, highest point, pure joy on face.",
    "happy_fall":     "Falling back down, arms trailing upward, still smiling.",
    "happy_land":     "Just landed, slight crouch/squish on landing, triumphant expression.",
    "book_hold":      "Holding a tiny confirmation card/ticket with both arms, neutral face.",
    "book_pull":      "Pulling the card out dramatically, eyes widening.",
    "book_pop":       "Card pops open — eyes wide with delight.",
    "book_confetti":  "Confetti exploding from the sides, Nana cheering with arms raised.",
    "book_wide":      "Arms stretched as wide as possible, massive celebratory smile.",
    "book_settle":    "Calming down, warm satisfied smile, confetti drifting.",
    "alert_notice":   "Eyes suddenly wide, just noticed something off-screen.",
    "alert_brow":     "One eyebrow raised, concerned look, leaning forward.",
    "alert_worried":  "Both brows furrowed inward, small sweat drop, mouth slightly open.",
    "alert_full":     "Full worry face — brows knitted, eyes large, mouth open in alarm.",
    "error_start":    "Realising something went wrong, expression shifting from neutral to worried.",
    "error_sweat":    "Large sweat drop on forehead, nervous grin, eyes averted.",
    "error_wave1":    "Waving one arm quickly side-to-side as if apologising.",
    "error_wave2":    "Waving the other arm, sheepish smile, sweat still there.",
    "trans_idle_listen":   "Smooth in-between frame transitioning from calm idle to attentive listen.",
    "trans_listen_scan":   "Eyes beginning to sweep left, body pivoting slightly.",
    "trans_scan_think":    "Scan completed, eyes now moving upward into thinking pose.",
    "trans_think_speak":   "Thought bubble dissolving, mouth beginning to open.",
    "trans_speak_happy":   "Mid-speech face shifting to surprise-joy as good news lands.",
    "trans_listen_alert":  "Alert expression overlaying the listening pose.",
    "trans_any_idle_1":    "Generic relaxation — shoulders dropping, eyes softening mid-motion.",
    "trans_any_idle_2":    "Settling back to idle, a tiny exhale expression.",
    "trans_idle_speak":    "Mouth just starting to open from idle, eyes brightening.",
    "trans_scan_book":     "Scan finishing, first glimpse of booking confirmation appearing.",
}


# ══════════════════════════════════════════════════════════════════════
# PHASE 1 — Generate prompts with GPT
# ══════════════════════════════════════════════════════════════════════

def build_gpt_messages() -> list:
    frame_list = "\n".join(
        f'  "{name}": {hint}' for name, hint in FRAME_HINTS.items()
    )
    system = (
        "You are an expert at writing detailed image-generation prompts for "
        "consistent 2-D cartoon sprite sheets. You will receive a character bible "
        "and a list of animation frame names with semantic hints. For each frame, "
        "write a concise but precise image-generation prompt (2-4 sentences) that:\n"
        "1. References the character bible to ensure visual consistency.\n"
        "2. Describes the exact pose, expression, and any props for that frame.\n"
        "3. Ends with the style tag: 'transparent background, flat cel-shaded illustration, 512x512.'\n\n"
        "Return ONLY a JSON object mapping frame_name → prompt string. No markdown fences."
    )
    user = (
        f"Character bible:\n{CHARACTER}\n\n"
        f"Frames:\n{frame_list}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user",   "content": user},
    ]


def generate_prompts() -> dict:
    if not OPENAI_API_KEY:
        sys.exit("ERROR: OPENAI_API_KEY not set in backend/.env")

    print("Phase 1 — asking GPT-4o-mini to write prompts for all 52 frames…")
    messages = build_gpt_messages()

    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={
                "model":       PROMPT_MODEL,
                "messages":    messages,
                "temperature": 0.7,
                "max_completion_tokens": 4096,
            },
        )
        resp.raise_for_status()

    raw = resp.json()["choices"][0]["message"]["content"].strip()
    # Strip accidental markdown fences
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    prompts: dict = json.loads(raw)

    # Ensure every frame has a prompt (fallback for any GPT omission)
    for name in FRAMES:
        if name not in prompts:
            prompts[name] = (
                f"{CHARACTER}\n{FRAME_HINTS.get(name, name)}. "
                "Transparent background, flat cel-shaded illustration, 512x512."
            )

    CACHE_FILE.write_text(json.dumps(prompts, indent=2, ensure_ascii=False))
    print(f"  Saved {len(prompts)} prompts → {CACHE_FILE}")
    return prompts


# ══════════════════════════════════════════════════════════════════════
# PHASE 2 — Generate images with Nano Banana Pro
# ══════════════════════════════════════════════════════════════════════

def build_image_prompt(frame_name: str, gpt_prompt: str) -> str:
    return (
        f"{CHARACTER}\n\n"
        f"Frame: {frame_name}\n"
        f"{gpt_prompt}"
    )


def _load_reference_b64() -> str | None:
    """Return base64-encoded reference PNG, or None if file missing."""
    if not REFERENCE_FILE.exists():
        return None
    raw = REFERENCE_FILE.read_bytes()
    return base64.b64encode(raw).decode()


def call_nano_banana(
    prompt: str,
    reference_b64: str | None = None,
    prev_frame_b64: str | None = None,
) -> bytes:
    """Call Nano Banana Pro, return raw PNG bytes.

    reference_b64  – canonical character-sheet image; keeps Nana's design
                     consistent across all 52 frames.
    prev_frame_b64 – the immediately preceding frame in an animation sequence;
                     keeps pose continuity and motion arc correct.
    """
    if not OPENROUTER_API_KEY:
        sys.exit("ERROR: OPENROUTER_API_KEY not set in backend/.env")

    if reference_b64 or prev_frame_b64:
        content = []
        if reference_b64:
            content += [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{reference_b64}"},
                },
                {
                    "type": "text",
                    "text": "[Image 1: canonical character reference — match this design exactly.]",
                },
            ]
        if prev_frame_b64:
            content += [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{prev_frame_b64}"},
                },
                {
                    "type": "text",
                    "text": "[Image 2: the immediately preceding animation frame — continue naturally from this pose.]",
                },
            ]
        content.append({"type": "text", "text": prompt})
    else:
        content = prompt

    with httpx.Client(timeout=90.0) as client:
        resp = client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization":  f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type":   "application/json",
                "HTTP-Referer":   "https://mystorey.app",
                "X-Title":        "MyStorey Mascot Generator",
            },
            json={
                "model":    IMAGE_MODEL,
                "messages": [{"role": "user", "content": content}],
                "modalities": ["image", "text"],
                "image_config": {
                    "aspect_ratio": ASPECT_RATIO,
                    "image_size":   IMAGE_SIZE,
                },
            },
        )
        resp.raise_for_status()

    data = resp.json()
    images = data["choices"][0]["message"].get("images", [])
    if not images:
        raise ValueError(f"No images returned. Response: {json.dumps(data)[:300]}")

    data_url: str = images[0]["image_url"]["url"]
    _, b64 = data_url.split(",", 1)
    return base64.b64decode(b64)


def save_png(frame_name: str, png_bytes: bytes):
    # Ensure it's a valid PNG and re-save (normalises size)
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    out_path = OUT_DIR / f"{frame_name}.png"
    img.save(out_path, "PNG")
    return out_path


# ══════════════════════════════════════════════════════════════════════
# PHASE 0 — Generate the reference image
# ══════════════════════════════════════════════════════════════════════

def generate_reference():
    print("Phase 0 — generating canonical Nana reference image…")
    png_bytes = call_nano_banana(REFERENCE_PROMPT)  # no reference yet
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    img.save(REFERENCE_FILE, "PNG")
    size_kb = REFERENCE_FILE.stat().st_size // 1024
    print(f"  Saved reference → {REFERENCE_FILE} ({size_kb} KB)")
    print("  Review it before running --generate. If it looks wrong, re-run --reference.")


def generate_images(prompts: dict, resume: bool = False):
    total   = len(FRAMES)
    done    = 0
    skipped = 0
    failed  = []

    reference_b64 = _load_reference_b64()
    if reference_b64:
        print(f"  Reference image loaded ({REFERENCE_FILE.name}, "
              f"{REFERENCE_FILE.stat().st_size // 1024} KB) — will be sent with every request.")
    else:
        print("  WARNING: No reference image found. Run --reference first for consistency.")

    seq_count = sum(1 for f in FRAMES if f in PREV_FRAME)
    print(f"  {seq_count} frames will also receive their preceding animation frame.")

    print(f"\nPhase 2 — generating {total} frames with Nano Banana Pro…")
    print(f"  Model: {IMAGE_MODEL}")
    print(f"  Output: {OUT_DIR}\n")

    for i, frame_name in enumerate(FRAMES, 1):
        out_path = OUT_DIR / f"{frame_name}.png"

        # Skip if resuming and file already looks like a real generation
        # (real PNGs tend to be larger than the 512-byte placeholder SVGs)
        if resume and out_path.exists() and out_path.stat().st_size > 10_000:
            print(f"  [{i:02d}/{total}] SKIP (already generated) — {frame_name}")
            skipped += 1
            continue

        gpt_prompt = prompts.get(frame_name, FRAME_HINTS.get(frame_name, ""))
        full_prompt = build_image_prompt(frame_name, gpt_prompt)

        # Load previous frame PNG if this is part of a sequence
        prev_frame_b64: str | None = None
        prev_name = PREV_FRAME.get(frame_name)
        if prev_name:
            prev_path = OUT_DIR / f"{prev_name}.png"
            if prev_path.exists() and prev_path.stat().st_size > 10_000:
                prev_frame_b64 = base64.b64encode(prev_path.read_bytes()).decode()

        seq_tag = f" [seq←{prev_name}]" if prev_frame_b64 else ""

        for attempt in range(1, 4):
            try:
                print(f"  [{i:02d}/{total}] Generating {frame_name}{seq_tag}…", end=" ", flush=True)
                png_bytes = call_nano_banana(
                    full_prompt,
                    reference_b64=reference_b64,
                    prev_frame_b64=prev_frame_b64,
                )
                path      = save_png(frame_name, png_bytes)
                size_kb   = path.stat().st_size // 1024
                print(f"✓ {size_kb} KB")
                done += 1
                break
            except Exception as e:
                if attempt < 3:
                    wait = DELAY_S * attempt * 2
                    print(f"retry {attempt}/3 (wait {wait:.0f}s)…", end=" ", flush=True)
                    time.sleep(wait)
                else:
                    print(f"FAILED — {e}")
                    failed.append(frame_name)

        if i < total:
            time.sleep(DELAY_S)

    print(f"\n{'='*50}")
    print(f"Done: {done} generated, {skipped} skipped, {len(failed)} failed")
    if failed:
        print(f"Failed frames: {', '.join(failed)}")
        print("Re-run with --generate --resume to retry failed frames.")


# ══════════════════════════════════════════════════════════════════════
# Entry point
# ══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="MyStorey mascot image generator")
    parser.add_argument("--reference", action="store_true", help="Phase 0: generate canonical reference image")
    parser.add_argument("--prompts",   action="store_true", help="Phase 1: generate prompt cache with GPT")
    parser.add_argument("--generate",  action="store_true", help="Phase 2: generate images with Nano Banana Pro")
    parser.add_argument("--all",       action="store_true", help="Run all three phases sequentially")
    parser.add_argument("--resume",    action="store_true", help="Skip frames with existing large PNGs")
    args = parser.parse_args()

    if not (args.reference or args.prompts or args.generate or args.all):
        parser.print_help()
        sys.exit(0)

    prompts = None

    if args.reference or args.all:
        generate_reference()

    if args.prompts or args.all:
        prompts = generate_prompts()

    if args.generate or args.all:
        if prompts is None:
            if not CACHE_FILE.exists():
                sys.exit(f"ERROR: Prompt cache not found at {CACHE_FILE}. Run --prompts first.")
            prompts = json.loads(CACHE_FILE.read_text())
            print(f"Loaded {len(prompts)} prompts from cache.")
        generate_images(prompts, resume=args.resume)


if __name__ == "__main__":
    main()
