"""
Generate placeholder PNG images for all 52 mascot frames.
Run this once: python scripts/generate_mascot_placeholders.py

Requires: pip install Pillow
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys

OUT_DIR = Path(__file__).parent.parent / "public" / "mascot"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SIZE = 512

FRAME_GROUPS = {
    "mouth":   ("#fef9c3", "#854d0e", "💬"),
    "idle":    ("#e0f2fe", "#075985", "📦"),
    "blink":   ("#e0f2fe", "#075985", "😑"),
    "listen":  ("#dcfce7", "#166534", "👂"),
    "think":   ("#ede9fe", "#5b21b6", "🤔"),
    "scan":    ("#fff7ed", "#92400e", "🔍"),
    "happy":   ("#fce7f3", "#9d174d", "🎉"),
    "book":    ("#d1fae5", "#065f46", "✅"),
    "alert":   ("#fef3c7", "#92400e", "⚠️"),
    "error":   ("#fee2e2", "#991b1b", "😰"),
    "trans":   ("#f1f5f9", "#334155", "↔️"),
}

FRAMES = [
    "mouth_M", "mouth_A", "mouth_E", "mouth_O", "mouth_F",
    "idle_center", "idle_left", "idle_right", "blink_half", "blink_closed",
    "listen_neutral", "listen_perk", "listen_lean", "listen_open",
    "think_start", "think_lookup", "think_bubble_sm", "think_bubble_lg",
    "scan_left", "scan_mid_l", "scan_mid_r", "scan_right",
    "happy_stand", "happy_crouch", "happy_rise", "happy_peak", "happy_fall", "happy_land",
    "book_hold", "book_pull", "book_pop", "book_confetti", "book_wide", "book_settle",
    "alert_notice", "alert_brow", "alert_worried", "alert_full",
    "error_start", "error_sweat", "error_wave1", "error_wave2",
    "trans_idle_listen", "trans_listen_scan", "trans_scan_think", "trans_think_speak",
    "trans_speak_happy", "trans_listen_alert", "trans_any_idle_1", "trans_any_idle_2",
    "trans_idle_speak", "trans_scan_book",
]


def get_group(frame_name: str) -> tuple:
    for key, val in FRAME_GROUPS.items():
        if frame_name.startswith(key):
            return val
    return ("#f1f5f9", "#334155", "📦")


def make_placeholder(frame_name: str):
    bg_color, text_color, emoji = get_group(frame_name)

    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background circle
    margin = 20
    draw.ellipse([margin, margin, SIZE - margin, SIZE - margin], fill=bg_color)

    # Box body
    bx1, by1, bx2, by2 = 140, 180, 370, 380
    draw.rounded_rectangle([bx1, by1, bx2, by2], radius=30, fill=text_color + "33", outline=text_color, width=3)

    # Eyes
    eye_y = 260
    draw.ellipse([180, eye_y, 220, eye_y + 40], fill=text_color)
    draw.ellipse([290, eye_y, 330, eye_y + 40], fill=text_color)

    # Label
    label = frame_name.replace("_", "\n")
    try:
        font_large = ImageFont.truetype("arial.ttf", 32)
        font_small = ImageFont.truetype("arial.ttf", 22)
    except OSError:
        font_large = ImageFont.load_default()
        font_small = ImageFont.load_default()

    draw.text((SIZE // 2, 430), label, fill=text_color, font=font_small, anchor="mm", align="center")
    draw.text((SIZE // 2, 120), emoji, fill=text_color, font=font_large, anchor="mm")

    out_path = OUT_DIR / f"{frame_name}.png"
    img.save(out_path, "PNG")
    return out_path


if __name__ == "__main__":
    print(f"Generating {len(FRAMES)} placeholder mascot PNGs in {OUT_DIR}…")
    for frame in FRAMES:
        path = make_placeholder(frame)
        print(f"  ✓ {path.name}")
    print(f"\nDone! {len(FRAMES)} files created.")
    print("Replace these with real Nana Banana Pro-generated PNGs before demo day.")
