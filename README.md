# FutureStorage

**Door-to-door storage, powered by AI — built for Singapore.**

MyStorey connects people who need storage with hosts who have space. Users point their phone at their belongings; the AI measures volume, prices the job, and handles the full booking flow end-to-end.

---

## The Problem

Self-storage in Singapore is expensive, inflexible, and physically distant. Most people just need somewhere nearby to keep a few boxes for a few months — but existing services require long-term contracts and a car trip to a warehouse.

MyStorey turns spare rooms, garage corners, and HDB storerooms into micro-storage units, bookable in minutes from a phone.

---

## How It Works

1. **Scan** — user opens the app on their phone and records a short video of their items
2. **Measure** — the AI vision pipeline estimates volume automatically (no tape measure needed)
3. **Match** — the app finds nearby hosts on a live map and suggests the fastest route
4. **Book & Pay** — Stripe handles payment; both parties receive a confirmation email
5. **Track** — inventory is stored in a knowledge graph; users can query it by voice at any time

---

## Key Technical Features

### AI Vision Pipeline
The most novel part of the system. Running on a consumer RTX 3050 (6 GB VRAM), models are loaded sequentially to stay within memory limits:

| Stage | Model | Role |
|---|---|---|
| Live preview | YOLOv8n | Real-time object detection overlay |
| Detection | YOLOv8m | High-accuracy final detection |
| Depth | DepthPro fp16 | Metric depth estimation (~2 GB VRAM) |
| Segmentation | SAM 2 Tiny (video mode) | Per-object masks for volume calculation |

Pipeline latency: **~1.1 seconds** for 8 frames. Peak VRAM: **~2.1 GB**.

### Voice Interface
ElevenLabs STT captures natural speech; GPT-4o-mini interprets intent; ElevenLabs TTS replies aloud. The animated **Nana Banana Pro** mascot reacts to conversation state with a CSS state machine (idle → listening → thinking → speaking).

### Smart Inventory Graph
All stored items live in a **Neo4j knowledge graph** with Supabase as fallback. Users can ask "where did I put my camping gear?" and get a spoken answer. Each host has a **TrustCard** with verified signals (response rate, reviews, item condition history).

### Routing
A **Dijkstra web worker** runs shortest-path on the Mapbox GL JS layer so route calculations never block the UI thread.

### Climate Alerts
Live temperature data from the **NEA API** surfaces a warning badge when storage conditions exceed safe thresholds for sensitive items.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 14 (App Router), TailwindCSS, Mapbox GL JS, Stripe.js |
| Backend | FastAPI (Python), WebSocket, JWT auth |
| AI / Vision | YOLOv8, DepthPro fp16, SAM 2 Tiny, OpenAI GPT-4o-mini, OpenRouter |
| Voice | ElevenLabs STT + TTS |
| Data | Neo4j AuraDB, Supabase |
| Payments | Stripe (test mode — full card flow with webhooks) |
| Notifications | SMTP (Gmail) — fires server-side, independent of browser |
| Infrastructure | ngrok HTTPS tunnel (required for mobile camera/mic access) |
