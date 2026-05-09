import os
import json
import uuid
import asyncio
import numpy as np
from typing import Optional
from datetime import datetime, timedelta

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import httpx
import stripe

from utils.email import send_email
from utils.email_templates import booking_confirmed, climate_alert, lease_expiry_reminder
from utils.nea_api import get_district_temperature, get_all_station_readings
from utils.accuracy import (
    get_accuracy_display, update_correction_factor,
    record_live_feedback, get_correction_factor,
)
from utils.graph_db import inventory_store, QUERY_TEMPLATES
from utils.vision import (
    jpeg_to_numpy, run_yolo, run_yolo_live, run_depth,
    estimate_volume_from_detections, unload_yolo, unload_depth, unload_sam,
)
from utils.calibration import calibrate_scale, fuse_depth_maps
from utils.sfm import sfm_measure_object

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

ELEVENLABS_API_KEY  = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_STT_MODEL = "scribe_v1"
ELEVENLABS_TTS_MODEL = "eleven_turbo_v2"
VOICE_ID             = os.getenv("ELEVENLABS_VOICE_ID", "SDNKIYEpTz0h56jQX8rA")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

app = FastAPI(title="MyStorey API", version="4.0.0")


@app.on_event("startup")
async def preload_models():
    """Pre-load YOLO to GPU so first WS frame doesn't block."""
    try:
        import numpy as np
        print("[startup] pre-loading YOLOv8n to CUDA…")
        run_yolo_live(np.zeros((720, 1280, 3), dtype=np.uint8))
        print("[startup] YOLOv8n ready ✓")
    except Exception as e:
        print(f"[startup] YOLO preload failed (will use mock): {e}")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── In-memory stores (replace with DB in production) ──────────────
_bookings: dict[str, dict] = {}
_users: dict[str, dict] = {
    "demo_user": {
        "id": "demo_user",
        "name": "Alex Lim",
        "email": os.getenv("DEMO_EMAIL", "demo@example.com"),
    }
}
_hosts: list[dict] = [
    {
        "id": "host_1",
        "name": "Jane Tan",
        "avatarUrl": "/avatars/jane.png",
        "memberSince": "Jan 2022",
        "rating": 4.9,
        "reviewCount": 47,
        "trustScore": 92,
        "address": "Tampines Ave 8, #04-22",
        "district": "tampines",
        "pricePerMonth": 85,
        "availableM3": 3.2,
        "lat": 1.3521,
        "lng": 103.9458,
        "climate_controlled": False,
    },
    {
        "id": "host_2",
        "name": "Raj Kumar",
        "avatarUrl": "/avatars/raj.png",
        "memberSince": "Mar 2021",
        "rating": 4.7,
        "reviewCount": 89,
        "trustScore": 88,
        "address": "Jurong West St 42, #02-11",
        "district": "jurong",
        "pricePerMonth": 70,
        "availableM3": 5.0,
        "lat": 1.3404,
        "lng": 103.7090,
        "climate_controlled": True,
    },
    {
        "id": "host_3",
        "name": "Mei Ling",
        "avatarUrl": "/avatars/mei.png",
        "memberSince": "Jun 2023",
        "rating": 5.0,
        "reviewCount": 12,
        "trustScore": 79,
        "address": "Bishan St 13, #10-05",
        "district": "bishan",
        "pricePerMonth": 95,
        "availableM3": 2.1,
        "lat": 1.3526,
        "lng": 103.8352,
        "climate_controlled": True,
    },
    {
        "id": "host_4",
        "name": "Ahmad Fauzi",
        "avatarUrl": "/avatars/ahmad.png",
        "memberSince": "Sep 2020",
        "rating": 4.8,
        "reviewCount": 134,
        "trustScore": 95,
        "address": "Woodlands Ave 3, #06-18",
        "district": "woodlands",
        "pricePerMonth": 60,
        "availableM3": 8.0,
        "lat": 1.4382,
        "lng": 103.7891,
        "climate_controlled": False,
    },
    {
        "id": "host_5",
        "name": "Priya Nair",
        "avatarUrl": "/avatars/priya.png",
        "memberSince": "Feb 2022",
        "rating": 4.6,
        "reviewCount": 58,
        "trustScore": 84,
        "address": "Little India, Serangoon Rd, #03-07",
        "district": "serangoon",
        "pricePerMonth": 110,
        "availableM3": 1.8,
        "lat": 1.3066,
        "lng": 103.8553,
        "climate_controlled": True,
    },
    {
        "id": "host_6",
        "name": "David Lim",
        "avatarUrl": "/avatars/david.png",
        "memberSince": "Nov 2019",
        "rating": 4.5,
        "reviewCount": 201,
        "trustScore": 91,
        "address": "Clementi Ave 2, #12-33",
        "district": "clementi",
        "pricePerMonth": 75,
        "availableM3": 4.5,
        "lat": 1.3151,
        "lng": 103.7649,
        "climate_controlled": False,
    },
    {
        "id": "host_7",
        "name": "Sarah Goh",
        "avatarUrl": "/avatars/sarah.png",
        "memberSince": "Apr 2023",
        "rating": 4.9,
        "reviewCount": 27,
        "trustScore": 82,
        "address": "Punggol Central, #08-14",
        "district": "punggol",
        "pricePerMonth": 65,
        "availableM3": 6.5,
        "lat": 1.4043,
        "lng": 103.9022,
        "climate_controlled": False,
    },
    {
        "id": "host_8",
        "name": "Kevin Ong",
        "avatarUrl": "/avatars/kevin.png",
        "memberSince": "Jul 2021",
        "rating": 4.7,
        "reviewCount": 76,
        "trustScore": 87,
        "address": "Queenstown, Margaret Dr, #05-09",
        "district": "queenstown",
        "pricePerMonth": 100,
        "availableM3": 3.0,
        "lat": 1.2966,
        "lng": 103.8006,
        "climate_controlled": True,
    },
    {
        "id": "host_9",
        "name": "Lin Wei",
        "avatarUrl": "/avatars/linwei.png",
        "memberSince": "Jan 2024",
        "rating": 4.4,
        "reviewCount": 8,
        "trustScore": 74,
        "address": "Sengkang Sq, #02-21",
        "district": "sengkang",
        "pricePerMonth": 55,
        "availableM3": 10.0,
        "lat": 1.3912,
        "lng": 103.8950,
        "climate_controlled": False,
    },
    {
        "id": "host_10",
        "name": "Nurul Huda",
        "avatarUrl": "/avatars/nurul.png",
        "memberSince": "Oct 2022",
        "rating": 5.0,
        "reviewCount": 33,
        "trustScore": 90,
        "address": "Bedok North Ave 4, #07-02",
        "district": "bedok",
        "pricePerMonth": 80,
        "availableM3": 4.0,
        "lat": 1.3268,
        "lng": 103.9302,
        "climate_controlled": True,
    },
]


# ── WebSocket connection manager ───────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, WebSocket] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active[user_id] = ws

    def disconnect(self, user_id: str):
        self.active.pop(user_id, None)

    async def send_if_connected(self, user_id: str, data: dict):
        ws = self.active.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                pass


ws_manager = ConnectionManager()


# ── Auth helper (demo: user_id passed via header) ──────────────────
async def get_current_user(request: Request) -> dict:
    user_id = request.headers.get("x-user-id", "demo_user")
    user = _users.get(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Unknown user")
    return user


# ── Health ─────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "version": "4.0.0", "timestamp": datetime.utcnow().isoformat()}


# ── Hosts ──────────────────────────────────────────────────────────
@app.get("/api/hosts")
async def list_hosts():
    return {"hosts": _hosts}


@app.get("/api/hosts/{host_id}")
async def get_host(host_id: str):
    host = next((h for h in _hosts if h["id"] == host_id), None)
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")
    return host


# ── STT (ElevenLabs) ───────────────────────────────────────────────
@app.post("/api/stt")
async def speech_to_text(request: Request):
    audio_blob = await request.body()
    if not ELEVENLABS_API_KEY:
        return {"text": "[ElevenLabs API key not configured — using mock transcript]"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.elevenlabs.io/v1/speech-to-text",
                headers={"xi-api-key": ELEVENLABS_API_KEY},
                files={"file": ("audio.webm", audio_blob, "audio/webm")},
                data={
                    "model_id": ELEVENLABS_STT_MODEL,
                    "language_code": "en",
                    "diarize": "false",
                    "tag_audio_events": "false",
                },
            )
            resp.raise_for_status()
            return {"text": resp.json()["text"]}
    except Exception as e:
        print(f"[stt] ElevenLabs error: {e}")
        return {"text": "I heard you — ElevenLabs STT unavailable, please type your message."}


# ── TTS (ElevenLabs) ───────────────────────────────────────────────
@app.post("/api/tts")
async def text_to_speech(request: Request):
    body = await request.json()
    text = body.get("text", "")
    if not ELEVENLABS_API_KEY:
        return JSONResponse(status_code=503, content={"error": "TTS not configured"})
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/stream",
                headers={"xi-api-key": ELEVENLABS_API_KEY},
                json={
                    "text": text,
                    "model_id": ELEVENLABS_TTS_MODEL,
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.8,
                        "style": 0.0,
                        "use_speaker_boost": True,
                    },
                    "output_format": "mp3_44100_128",
                },
            )
            resp.raise_for_status()
            from fastapi.responses import Response
            return Response(content=resp.content, media_type="audio/mpeg")
    except Exception as e:
        print(f"[tts] ElevenLabs error: {e}")
        return JSONResponse(status_code=503, content={"error": str(e)})


# ── LLM Chat ───────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    history: list = []
    user_id: str = "demo_user"


SYSTEM_PROMPT = """You are Nana, the cheeky and warm AI assistant for MyStorey — Singapore's 
AI-powered door-to-door storage service. You speak with natural Singlish flavour:
- Use particles like "lah", "leh", "lor", "sia", "hor" naturally (not every sentence)
- Use local expressions: "can" (yes), "cannot" (no), "shiok" (great), "atas" (high-end), "walao" (surprise), "steady" (reliable)
- Reference SG context: MRT stations, HDB, hawker centres, districts
- Keep it warm, playful, slightly cheeky — like a helpful younger sister
- Still be professional about storage advice

Help users store their items with local hosts. When users want to store items, ask them 
to use the camera to scan their room. When they mention specific items, suggest nearby hosts.
Always respond in 1-3 sentences. Keep it concise and punchy."""


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not OPENAI_API_KEY:
        return {"reply": _mock_chat_reply(req.message), "intent": _detect_intent(req.message)}
    try:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for h in req.history[-6:]:
            messages.append(h)
        messages.append({"role": "user", "content": req.message})

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={"model": "gpt-5.4-mini", "messages": messages, "max_completion_tokens": 150},
            )
            resp.raise_for_status()
            reply = resp.json()["choices"][0]["message"]["content"]
        return {"reply": reply, "intent": _detect_intent(req.message)}
    except Exception as e:
        print(f"[chat] OpenAI error: {e}")
        return {"reply": _mock_chat_reply(req.message), "intent": _detect_intent(req.message)}


def _detect_intent(text: str) -> str:
    text = text.lower()
    if any(w in text for w in ["scan", "camera", "video", "room", "show"]):
        return "scan_request"
    if any(w in text for w in ["book", "store", "storage", "host", "space"]):
        return "booking_request"
    if any(w in text for w in ["inventory", "my items", "what do i have", "stored"]):
        return "inventory_query"
    if any(w in text for w in ["temperature", "climate", "hot", "alert"]):
        return "climate_query"
    return "general"


def _mock_chat_reply(message: str) -> str:
    intent = _detect_intent(message)
    replies = {
        "scan_request": "Can! Tap the camera button — I scan your room in 8 seconds flat. Steady one, just pan slowly hor.",
        "booking_request": "Wah, got 3 hosts near you leh! Auntie Jane in Tampines damn steady — 4.9 stars, 47 reviews. Want me show you?",
        "inventory_query": "You got 3 items with Jane in Tampines lah: 1 big suitcase, 4 cardboard boxes, and your guitar. All safe and sound!",
        "climate_query": "Eh the temperature near your Tampines unit is 30.2°C — still okay lah, your stuff won't melt. I keep watch for you!",
        "general": "Hey! I'm Nana lah, your storage kakis. Need help scanning your room, finding hosts, or checking your stuff? Just say the word!",
    }
    return replies.get(intent, replies["general"])


# ── NL → Cypher query ──────────────────────────────────────────────
class QueryRequest(BaseModel):
    nl_query: str
    user_id: str = "demo_user"


@app.post("/api/inventory/query")
async def nl_query(req: QueryRequest):
    text = req.nl_query.lower()
    template_key = None
    params = {"user_id": req.user_id}

    if "expire" in text or "lease" in text:
        template_key = "check_lease_expiry"
        params["days"] = 7
    elif "climate" in text or "temperature" in text:
        template_key = "climate_mismatch"
    elif any(w in text for w in ["find", "where", "location"]):
        template_key = "find_item_by_name"
        words = req.nl_query.split()
        params["item_query"] = words[-1] if words else ""
    else:
        template_key = "list_all_items"

    items = await inventory_store.get_items(req.user_id)
    return {
        "template_used": template_key,
        "items": items,
        "answer": f"Found {len(items)} items in your inventory.",
    }


# ── Inventory ──────────────────────────────────────────────────────
@app.get("/api/inventory")
async def get_inventory(user: dict = Depends(get_current_user)):
    items = await inventory_store.get_items(user["id"])
    return {"items": items}


# ── NEA Climate ────────────────────────────────────────────────────
@app.get("/api/climate/{district}")
async def get_climate(district: str):
    temp = await get_district_temperature(district)
    return {"district": district, "temperature_c": temp, "source": "NEA live data"}


@app.get("/api/climate")
async def get_all_climate():
    readings = await get_all_station_readings()
    return {"readings": readings, "source": "NEA live data"}


# ── Payments ───────────────────────────────────────────────────────
class PaymentRequest(BaseModel):
    amount_sgd: float
    booking_id: str
    host_id: str
    duration_days: int = 30


class CaptureRequest(BaseModel):
    payment_intent_id: str


@app.post("/api/payments/create-intent")
async def create_payment_intent(body: PaymentRequest, user: dict = Depends(get_current_user)):
    if not stripe.api_key:
        mock_secret = f"pi_mock_{uuid.uuid4().hex[:12]}_secret_mock"
        return {"client_secret": mock_secret, "mock": True}
    try:
        intent = stripe.PaymentIntent.create(
            amount=int(body.amount_sgd * 100),
            currency="sgd",
            capture_method="manual",
            metadata={
                "user_id":    user["id"],
                "booking_id": body.booking_id,
                "host_id":    body.host_id,
            },
            description=f"MyStorey — {body.duration_days}d storage booking",
        )
        return {"client_secret": intent.client_secret}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/payments/capture")
async def capture_payment(body: CaptureRequest):
    if not stripe.api_key:
        return {"status": "captured", "mock": True}
    try:
        stripe.PaymentIntent.capture(body.payment_intent_id)
        return {"status": "captured"}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig     = request.headers.get("stripe-signature")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not webhook_secret:
        return {"ok": True, "note": "webhook secret not configured"}
    try:
        event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "payment_intent.payment_failed":
        pi = event["data"]["object"]
        user_id = pi.get("metadata", {}).get("user_id")
        if user_id:
            user = _users.get(user_id)
            if user:
                send_email(
                    user["email"],
                    "Payment failed — MyStorey",
                    f"<p>Hi {user['name']}, your payment failed. Please try again.</p>",
                )
    return {"ok": True}


# ── Bookings ───────────────────────────────────────────────────────
class BookingCreate(BaseModel):
    host_id: str
    start_date: str
    end_date: str
    items: list = []
    total_sgd: float
    volume_m3: float = 0.0


@app.post("/api/bookings")
async def create_booking(body: BookingCreate, user: dict = Depends(get_current_user)):
    booking_id = f"bk_{uuid.uuid4().hex[:8]}"
    host = next((h for h in _hosts if h["id"] == body.host_id), None)
    if not host:
        raise HTTPException(status_code=404, detail="Host not found")

    booking = {
        "id":          booking_id,
        "user_id":     user["id"],
        "host_id":     body.host_id,
        "host_name":   host["name"],
        "address":     host["address"],
        "start_date":  body.start_date,
        "end_date":    body.end_date,
        "items":       body.items,
        "total_sgd":   body.total_sgd,
        "volume_m3":   body.volume_m3,
        "status":      "active",
        "created_at":  datetime.utcnow().isoformat(),
    }
    _bookings[booking_id] = booking

    for item in body.items:
        await inventory_store.create_item(item, booking_id, user["id"])

    try:
        subj, html = booking_confirmed(booking, user["name"])
        send_email(user["email"], subj, html)
    except Exception as e:
        print(f"[booking] Email failed: {e}")

    return {"booking": booking}


@app.get("/api/bookings")
async def list_bookings(user: dict = Depends(get_current_user)):
    user_bookings = [b for b in _bookings.values() if b["user_id"] == user["id"]]
    return {"bookings": user_bookings}


@app.get("/api/bookings/{booking_id}")
async def get_booking(booking_id: str, user: dict = Depends(get_current_user)):
    booking = _bookings.get(booking_id)
    if not booking or booking["user_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


# ── Accuracy ───────────────────────────────────────────────────────
@app.get("/api/accuracy")
async def get_accuracy():
    return get_accuracy_display()


class FeedbackRequest(BaseModel):
    booking_id: str
    item_class: str
    feedback: str


@app.post("/api/accuracy/feedback")
async def submit_feedback(body: FeedbackRequest):
    update_correction_factor(body.item_class, body.feedback)
    accurate = body.feedback not in ("needed_more_space", "leftover_space")
    record_live_feedback(body.booking_id, accurate)
    return {"ok": True, "new_factor": get_correction_factor(body.item_class)}


# ── Proactive Agent ────────────────────────────────────────────────
class ProactiveEvent(BaseModel):
    type: str
    user_id: str
    district: str = ""
    temp_c: float = 0.0
    flagged_items: list = []
    booking: dict = {}
    days_left: int = 0


@app.post("/api/proactive/trigger")
async def proactive_trigger(event: ProactiveEvent):
    user = _users.get(event.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if event.type == "climate_alert":
        subject, html = climate_alert(
            user_name=user["name"],
            district=event.district,
            temp=event.temp_c,
            items=event.flagged_items,
        )
        send_email(user["email"], subject, html)
        await ws_manager.send_if_connected(user["id"], {
            "type": "mascot", "state": "alert",
            "text": f"It's {event.temp_c:.1f}°C near your unit!",
        })

    elif event.type == "booking_confirmed":
        subject, html = booking_confirmed(event.booking, user["name"])
        send_email(user["email"], subject, html)

    elif event.type == "lease_expiry":
        subject, html = lease_expiry_reminder(user["name"], event.booking, event.days_left)
        send_email(user["email"], subject, html)
        await ws_manager.send_if_connected(user["id"], {
            "type": "mascot", "state": "alert",
            "text": f"Your lease expires in {event.days_left} days!",
        })

    return {"ok": True, "event_type": event.type}


def _live_mock_detections(frame_idx: int) -> list[dict]:
    """Fast mock detections for live overlay — slight bbox jitter per frame."""
    import random
    random.seed(frame_idx * 7)
    jx = random.randint(-15, 15)
    jy = random.randint(-10, 10)
    dets = [
        {"class": "suitcase",  "confidence": round(0.84 + random.uniform(-0.03, 0.05), 2),
         "bbox": [120 + jx, 180 + jy, 340 + jx, 430 + jy]},
        {"class": "backpack",  "confidence": round(0.77 + random.uniform(-0.02, 0.04), 2),
         "bbox": [500 + jx, 140 + jy, 690 + jx, 380 + jy]},
        {"class": "box",       "confidence": round(0.72 + random.uniform(-0.04, 0.06), 2),
         "bbox": [800 + jx, 350 + jy, 1020 + jx, 560 + jy]},
    ]
    # Sometimes detect fewer objects for realism
    if frame_idx % 4 == 0:
        dets = dets[:2]
    return dets


# ── Video WebSocket ────────────────────────────────────────────────
@app.websocket("/ws/video/{user_id}")
async def video_ws(websocket: WebSocket, user_id: str):
    import time as _time
    print(f"[ws] ── client {user_id} connecting ──")
    await ws_manager.connect(user_id, websocket)
    print(f"[ws] ── client {user_id} accepted ──")
    frames_data: list[bytes] = []
    try:
        while True:
            msg = await websocket.receive()

            if "bytes" in msg:
                fsize = len(msg["bytes"])
                frames_data.append(msg["bytes"])
                t0 = _time.perf_counter()
                # Live detection: YOLOv8n on CUDA (~6ms/frame)
                live_dets = []
                hint = None
                try:
                    frame_np = jpeg_to_numpy(msg["bytes"])
                    live_dets = run_yolo_live(frame_np)
                    # Guided capture: compute quality hints
                    brightness = float(frame_np.mean())
                    storable_dets = [d for d in live_dets if d.get("storable", True)]
                    if brightness < 40:
                        hint = "More light needed"
                    elif not storable_dets:
                        hint = "Point at the item to store"
                    else:
                        # Check bbox coverage
                        best = max(storable_dets, key=lambda d: d["confidence"])
                        bx1, by1, bx2, by2 = best["bbox"]
                        coverage = max(bx2 - bx1, by2 - by1) / max(1280, 720)
                        if coverage < 0.15:
                            hint = "Move closer"
                        elif coverage > 0.85:
                            hint = "Move further back"
                        elif len(frames_data) > 3 and len(frames_data) < 10:
                            hint = "Slowly move around the item"
                except Exception as e:
                    print(f"[ws] live YOLO failed: {e}")
                    import traceback; traceback.print_exc()
                    live_dets = _live_mock_detections(len(frames_data))
                dt = (_time.perf_counter() - t0) * 1000
                print(f"[ws] frame {len(frames_data)}: {fsize}B, {len(live_dets)} dets, {dt:.0f}ms")
                await websocket.send_json({
                    "type": "frame_received",
                    "count": len(frames_data),
                    "detections": live_dets,
                    "hint": hint,
                    "frame_w": 1280,
                    "frame_h": 720,
                })

            elif "text" in msg:
                data = json.loads(msg["text"])
                if data.get("type") == "process":
                    print(f"[ws] processing {len(frames_data)} frames...")
                    imu_samples = data.get("imu_samples", [])
                    frame_timestamps = data.get("frame_timestamps", [])
                    camera_fov = data.get("camera_fov", None)
                    result = await _process_video_frames(frames_data, imu_samples, frame_timestamps, camera_fov)
                    await websocket.send_json({"type": "result", **result})
                    print(f"[ws] result sent: {result.get('volume_m3')} m³")
                    frames_data = []

    except (WebSocketDisconnect, RuntimeError):
        print(f"[ws] ── client {user_id} disconnected ──")
        ws_manager.disconnect(user_id)
    except Exception as e:
        print(f"[ws] ── UNEXPECTED ERROR: {e} ──")
        import traceback; traceback.print_exc()
        ws_manager.disconnect(user_id)


MAX_DEPTH_FRAMES = 5  # Only run DepthPro + SAM on the best N frames


def _select_best_frames(
    all_frames: list[np.ndarray],
    per_frame_dets: list[list[dict]],
    max_frames: int = MAX_DEPTH_FRAMES,
) -> list[int]:
    """Score each frame and return indices of the best ones for heavy processing.
    Criteria: detection confidence, brightness, bbox stability, temporal spread."""
    if len(all_frames) <= max_frames:
        return list(range(len(all_frames)))

    # Find the dominant storable class
    from collections import Counter
    all_storable = [
        d for dets in per_frame_dets for d in dets if d.get("storable", True)
    ]
    if not all_storable:
        # No detections — just pick evenly spaced frames
        step = max(1, len(all_frames) // max_frames)
        return list(range(0, len(all_frames), step))[:max_frames]

    cls_counts = Counter(d["class"] for d in all_storable)
    target_cls = cls_counts.most_common(1)[0][0]

    scores = []
    bbox_areas = []
    for fi, (frame, dets) in enumerate(zip(all_frames, per_frame_dets)):
        brightness = float(frame.mean())
        target_dets = [d for d in dets if d["class"] == target_cls]

        if not target_dets or brightness < 40:
            scores.append(-1.0)
            bbox_areas.append(0.0)
            continue

        best_det = max(target_dets, key=lambda d: d["confidence"])
        conf = best_det["confidence"]
        x1, y1, x2, y2 = best_det["bbox"]
        area = (x2 - x1) * (y2 - y1)
        bbox_areas.append(area)

        # Score: weighted sum of confidence + brightness (normalised)
        score = conf * 0.6 + min(brightness / 200.0, 1.0) * 0.4
        scores.append(score)

    # Penalise bbox area outliers (object partially out of frame)
    valid_areas = [a for a in bbox_areas if a > 0]
    if valid_areas:
        median_area = float(np.median(valid_areas))
        for i in range(len(scores)):
            if scores[i] > 0 and median_area > 0:
                area_ratio = bbox_areas[i] / median_area
                if area_ratio < 0.3 or area_ratio > 2.5:
                    scores[i] *= 0.3  # heavy penalty for unstable bbox

    # Select top frames with temporal spread (min gap between selected)
    ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    selected = []
    min_gap = max(1, len(all_frames) // (max_frames + 1))
    for idx in ranked:
        if scores[idx] <= 0:
            continue
        if all(abs(idx - s) >= min_gap for s in selected):
            selected.append(idx)
        if len(selected) >= max_frames:
            break

    # If temporal spread was too strict, relax and fill remaining
    if len(selected) < max_frames:
        for idx in ranked:
            if idx not in selected and scores[idx] > 0:
                selected.append(idx)
            if len(selected) >= max_frames:
                break

    selected.sort()  # Keep temporal order
    print(f"[frames] selected {len(selected)}/{len(all_frames)} best frames: {selected}")
    return selected


async def _process_video_frames(
    raw_frames: list[bytes],
    imu_samples: list[dict] = None,
    frame_timestamps: list[float] = None,
    camera_fov: float = None,
) -> dict:
    if not raw_frames:
        return {"error": "No frames received", "volume_m3": 0.0, "items": []}

    imu_samples = imu_samples or []
    frame_timestamps = frame_timestamps or []

    all_frames = []
    all_depths = []
    all_scales = []
    all_detections = []
    dark_frame_count = 0

    # ── Decode all frames ──────────────────────────────────────────────
    for jpeg in raw_frames:
        frame = jpeg_to_numpy(jpeg)
        brightness = float(frame.mean())
        if brightness < 40:
            dark_frame_count += 1
        all_frames.append(frame)

    # ── Stage 1: YOLO detection on ALL frames (fast, ~25ms each) ──────
    per_frame_dets_all = []
    for frame in all_frames:
        dets = run_yolo(frame)
        per_frame_dets_all.append(dets)
        all_detections.extend(dets)
    unload_yolo()

    # ── Select best frames for heavy processing ───────────────────────
    best_indices = _select_best_frames(all_frames, per_frame_dets_all)
    best_frames    = [all_frames[i] for i in best_indices]
    per_frame_dets = [per_frame_dets_all[i] for i in best_indices]
    print(f"[pipeline] processing {len(best_frames)}/{len(all_frames)} frames through DepthPro + SAM")

    # ── Stage 2: Depth estimation on BEST frames only ─────────────────
    for frame in best_frames:
        depth = run_depth(frame)
        scale = calibrate_scale(frame, depth)
        all_depths.append(depth)
        all_scales.append(scale)
    unload_depth()

    low_light = dark_frame_count > len(raw_frames) * 0.5

    # ── Primary: SfM triangulation with IMU scale ──────────────────
    sfm_result = None
    try:
        sfm_result = sfm_measure_object(
            best_frames, all_detections, frame_timestamps, imu_samples, all_depths,
        )
        if sfm_result:
            print(f"[sfm] {sfm_result['method']}: {sfm_result['width_m']}×{sfm_result['height_m']}×{sfm_result['depth_m']}m ({sfm_result['sfm_points']} pts)")
    except Exception as e:
        print(f"[sfm] failed, falling back to depth: {e}")

    # ── Fallback: depth-based estimation ───────────────────────────
    fused_depth = fuse_depth_maps(best_frames, all_depths, all_scales)
    # ── Stage 3: SAM 2 video tracking on BEST frames only ─────────
    depth_result = estimate_volume_from_detections(per_frame_dets, all_depths, best_frames, camera_fov=camera_fov)
    unload_sam()

    # SfM trust logic:
    # - sfm_imu (real accelerometer data): fully trust if >=50 points
    # - sfm_depth (desktop, depth-anchored): use as weighted average with depth result
    sfm_trustworthy = (
        sfm_result
        and sfm_result["sfm_points"] >= 50
        and sfm_result["method"] == "sfm_imu"
    )
    # Desktop hybrid: blend SfM with depth result if within 2x agreement
    sfm_usable_hybrid = (
        sfm_result
        and not sfm_trustworthy
        and sfm_result["sfm_points"] >= 30
        and depth_result["breakdown"]
        and depth_result["total_m3"] > 0
        and 0.5 < sfm_result["volume_m3"] / max(depth_result["total_m3"], 1e-9) < 2.0
    )
    if sfm_trustworthy:
        volume = sfm_result["volume_m3"]
        breakdown = [{
            "class": depth_result["breakdown"][0]["class"] if depth_result["breakdown"] else "unknown",
            "width_m": sfm_result["width_m"],
            "height_m": sfm_result["height_m"],
            "depth_m": sfm_result["depth_m"],
            "volume_m3": sfm_result["volume_m3"],
            "method": sfm_result["method"],
            "sfm_points": sfm_result["sfm_points"],
        }]
    elif sfm_usable_hybrid:
        # Weighted average: 60% depth (more reliable), 40% SfM (independent check)
        d = depth_result["breakdown"][0]
        s = sfm_result
        blend_w = d["width_m"] * 0.6 + s["width_m"] * 0.4
        blend_h = d["height_m"] * 0.6 + s["height_m"] * 0.4
        blend_d = d["depth_m"] * 0.6 + s["depth_m"] * 0.4
        volume = blend_w * blend_h * blend_d
        breakdown = [{
            "class": d["class"],
            "width_m": round(blend_w, 3),
            "height_m": round(blend_h, 3),
            "depth_m": round(blend_d, 3),
            "volume_m3": round(volume, 6),
            "method": "hybrid_sfm_depth",
            "sfm_points": s["sfm_points"],
            "samples": d.get("samples", 1),
        }]
    else:
        volume = depth_result["total_m3"]
        breakdown = depth_result["breakdown"]

    seen = set()
    unique_items = []
    for d in all_detections:
        if d["class"] not in seen:
            seen.add(d["class"])
            unique_items.append({"name": d["class"], "confidence": d["confidence"], "storable": d.get("storable", True)})

    # Generate depth heatmap visualization
    depth_heatmap_b64 = _depth_to_heatmap_b64(fused_depth)

    method_used = "sfm" if sfm_trustworthy else "depth"
    summary = f"Detected {len(unique_items)} item type(s), estimated {volume:.2f} m³ total."
    if low_light:
        summary += " ⚠️ Low light detected — results may be inaccurate. Try with better lighting."

    # Depth map statistics (metric meters)
    depth_stats = {
        "min_m": round(float(fused_depth.min()), 3),
        "max_m": round(float(fused_depth.max()), 3),
        "median_m": round(float(np.median(fused_depth)), 3),
    }

    # Average brightness across frames (0-255)
    avg_brightness = round(sum(float(f.mean()) for f in all_frames) / len(all_frames), 1)

    return {
        "volume_m3": volume,
        "items": unique_items,
        "breakdown": breakdown,
        "depth_heatmap": depth_heatmap_b64,
        "frames_captured": len(raw_frames),
        "frames_processed": len(best_frames),
        "calibration_used": any(s is not None for s in all_scales),
        "low_light": low_light,
        "method": method_used,
        "summary": summary,
        "depth_stats": depth_stats,
        "avg_brightness": avg_brightness,
        "dark_frames": dark_frame_count,
        "total_detections": len(all_detections),
        "imu_samples": len(imu_samples),
    }


def _depth_to_heatmap_b64(depth_map) -> str:
    """Convert depth map to a colourful heatmap and return as base64 JPEG."""
    import base64, io
    import numpy as np
    from PIL import Image

    # Normalize to 0-255
    d_min, d_max = depth_map.min(), depth_map.max()
    if d_max - d_min > 1e-6:
        norm = ((depth_map - d_min) / (d_max - d_min) * 255).astype(np.uint8)
    else:
        norm = np.zeros_like(depth_map, dtype=np.uint8)

    # Apply turbo-like colormap (red=close, blue=far)
    # Simple 3-stop gradient: blue → green → red
    h, w = norm.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    # Red channel: high for close (high depth values)
    rgb[:, :, 0] = norm
    # Green channel: peak in middle
    rgb[:, :, 1] = (255 - np.abs(norm.astype(np.int16) - 128) * 2).clip(0, 255).astype(np.uint8)
    # Blue channel: high for far (low depth values)
    rgb[:, :, 2] = 255 - norm

    img = Image.fromarray(rgb)
    # Resize to reasonable size for transfer
    img = img.resize((320, 180), Image.BILINEAR)
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=75)
    return base64.b64encode(buf.getvalue()).decode('ascii')


# ── Chat WebSocket (for real-time voice + mascot sync) ────────────
@app.websocket("/ws/chat/{user_id}")
async def chat_ws(websocket: WebSocket, user_id: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "message":
                reply = _mock_chat_reply(data.get("text", ""))
                intent = _detect_intent(data.get("text", ""))
                await websocket.send_json({
                    "type": "reply",
                    "text": reply,
                    "intent": intent,
                    "mascot_state": _intent_to_mascot(intent),
                })
    except WebSocketDisconnect:
        pass


def _intent_to_mascot(intent: str) -> str:
    return {
        "scan_request":    "scanning",
        "booking_request": "happy",
        "inventory_query": "thinking",
        "climate_query":   "alert",
        "general":         "listening",
    }.get(intent, "listening")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
