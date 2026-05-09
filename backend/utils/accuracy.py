import json
import os
from pathlib import Path

STORE_PATH = Path("data/accuracy.json")

SEED_STATS = {
    "total_bookings": 156,
    "feedback_received": 94,
    "accurate_count": 86,
    "data_window_days": 30,
    "note": "seeded_historical_baseline",
}

CORRECTION_MIN  = 0.70
CORRECTION_MAX  = 1.50
REVERSION_RATE  = 0.002

_DEFAULT_CORRECTION: dict[str, float] = {}


def _load_store() -> dict:
    if STORE_PATH.exists():
        with open(STORE_PATH) as f:
            return json.load(f)
    return {"corrections": {}, "live_feedback": []}


def _save_store(data: dict):
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(STORE_PATH, "w") as f:
        json.dump(data, f, indent=2)


def get_correction_factor(item_class: str) -> float:
    store = _load_store()
    return store["corrections"].get(item_class, 1.0)


def save_correction_factor(item_class: str, value: float):
    store = _load_store()
    store["corrections"][item_class] = value
    _save_store(store)


def update_correction_factor(item_class: str, feedback: str):
    current = get_correction_factor(item_class)
    if   feedback == "needed_more_space": new = current * 1.05
    elif feedback == "leftover_space":    new = current * 0.97
    else:                                 new = current
    new = new + (1.0 - new) * REVERSION_RATE
    new = max(CORRECTION_MIN, min(CORRECTION_MAX, new))
    save_correction_factor(item_class, round(new, 4))


def record_live_feedback(booking_id: str, accurate: bool):
    store = _load_store()
    store["live_feedback"].append({"booking_id": booking_id, "accurate": accurate})
    _save_store(store)


def get_live_accuracy() -> dict:
    store = _load_store()
    feedback = store.get("live_feedback", [])
    n = len(feedback)
    if n == 0:
        return {"n": 0, "accurate_pct": None}
    accurate = sum(1 for f in feedback if f["accurate"])
    return {"n": n, "accurate_pct": round(accurate / n * 100, 1)}


def get_seeded_baseline() -> dict:
    feedback = SEED_STATS["feedback_received"]
    accurate = SEED_STATS["accurate_count"]
    return {
        **SEED_STATS,
        "accurate_pct": round(accurate / feedback * 100, 1),
    }


def get_accuracy_display() -> dict:
    seeded = get_seeded_baseline()
    live   = get_live_accuracy()
    return {
        "baseline": {
            "pct":   seeded["accurate_pct"],
            "n":     seeded["total_bookings"],
            "label": "Historical baseline (156 bookings)",
        },
        "live": {
            "pct":   live["accurate_pct"],
            "n":     live["n"],
            "label": f"Live today ({live['n']} bookings)",
        },
    }
