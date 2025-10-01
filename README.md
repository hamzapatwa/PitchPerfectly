# Retro Arcade Karaoke – Demo Skeleton

This is a minimal scaffold with API spec, JSON schemas, frontend HUD, backend stubs, and a Python analysis script placeholder.

## Quickstart (dev)
- Node 20+, Python 3.10+
- `cd backend && npm init -y && npm i express ws multer && node server.js`
- Serve the frontend with your favorite dev server and import `LiveHUD.jsx`.
- Python analysis (placeholder): `python/python -m venv .venv && source .venv/bin/activate && pip install -r python/requirements.txt`
  Then: `python/python analyze.py <audio.wav> /tmp/reference.json`

## Files
- `api.openapi.yaml` – OpenAPI for endpoints
- `schemas/` – JSON schemas for reference/live/results payloads
- `frontend/` – HUD component, retro styles, CRT shader, AudioWorklet pitch/energy demo
- `backend/server.js` – Express + WebSocket relay (room-scoped broadcast)
- `python/analyze.py` – librosa-based analysis (swap YIN with CREPE for production)

**Note:** The AudioWorklet pitch is a demo-level autocorrelation just to light up the HUD; final pitch should come from CREPE on the Python side.