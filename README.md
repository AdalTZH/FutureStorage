# MyStorey v4

> AI-powered door-to-door storage with physical inventory orchestration, scoped to Singapore.

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env        # fill in your keys
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in your keys
npm run dev                         # → http://localhost:3000
```

### 3. Generate mascot placeholder images (one-time)

```bash
cd frontend
pip install Pillow
python scripts/generate_mascot_placeholders.py
```

Replace the generated placeholders with real **Nana Banana Pro** PNGs before demo day (see specs §5).

---

## Environment Variables

### Backend (`backend/.env`)

| Key | Description |
|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs STT + TTS |
| `STRIPE_SECRET_KEY` | Stripe test-mode secret |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `SMTP_USER` / `SMTP_PASSWORD` | Gmail App Password for email |
| `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | Neo4j AuraDB |
| `SUPABASE_URL` / `SUPABASE_KEY` | Supabase (fallback) |
| `OPENAI_API_KEY` | GPT-4o-mini for chat |

### Frontend (`frontend/.env.local`)

| Key | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend URL (default: http://localhost:8000) |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe test publishable key |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Mapbox GL JS token |

---

## GPU Setup (RTX 3050, 6 GB VRAM)

Models are loaded sequentially — only one heavy model on GPU at a time. Peak VRAM ≈ 2.1 GB.

```bash
pip install torch==2.3.0+cu118 torchvision==0.18.0+cu118 --index-url https://download.pytorch.org/whl/cu118
pip install ultralytics==8.2.18
pip install git+https://github.com/apple/ml-depth-pro.git   # DepthPro (fp16)
pip install git+https://github.com/facebookresearch/sam2.git # SAM 2 Tiny
```

---

## Demo Day Checklist

```
□ Set laptop static IP (192.168.1.200)
□ Start FastAPI:  uvicorn main:app --host 0.0.0.0 --port 8000
□ Start Next.js:  npm run dev (in frontend/)
□ Start ngrok:    ngrok http 3000
□ Copy ngrok URL → open on phone
□ Confirm camera works (requires HTTPS = ngrok)
□ Test voice: tap mic → speak → confirm TTS reply + mascot animates
□ Test booking: browse hosts → pay with 4242 4242 4242 4242
□ Trigger climate alert: tap temperature badge in header
□ Confirm email arrives (requires SMTP config)
```

---

## Architecture

```
Laptop (RTX 3050)
├── FastAPI backend        0.0.0.0:8000
│   ├── YOLO v8m/n         CUDA (sequential GPU loading)
│   ├── DepthPro fp16      CUDA (~2 GB)
│   ├── SAM 2 Tiny (video) CUDA (~1.3 GB)
│   ├── Neo4j driver       → AuraDB cloud
│   ├── Supabase client    → Supabase cloud (fallback)
│   └── SMTP               → Gmail
│
├── Next.js frontend       0.0.0.0:3000
│   ├── Mascot component   → public/mascot/*.png
│   ├── Stripe Elements    → Stripe test mode
│   └── ngrok tunnel       → https://abc123.ngrok-free.app
│
└── External APIs
    ├── ElevenLabs STT/TTS
    ├── OpenAI GPT-4o-mini
    ├── NEA temperature API
    ├── Stripe API
    └── Mapbox GL JS
```

## Test Cards (Stripe)

| Card | Behaviour |
|---|---|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 3220` | 3DS auth required |
| `4000 0000 0000 9995` | Declined |
