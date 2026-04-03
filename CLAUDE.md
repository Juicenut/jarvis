# JARVIS — Claude Code Context

## Project Overview
Jarvis-style AI avatar assistant: wake word → voice conversation → lip-synced 3D avatar response. Web app with Python/FastAPI backend and vanilla JS frontend.

## Key Documents
- `docs/JARVIS-PRD.md` — Full PRD with research-validated tech choices
- `docs/JARVIS-CLAUDE.md` — Step-by-step implementation guide, message protocol, code patterns, common pitfalls

## Architecture
- **Server:** Python 3.11+ / FastAPI / WebSocket (`server/`)
- **Client:** Vanilla JS, no build step (`client/`)
- Streaming pipeline: Browser mic → WebSocket → Deepgram STT → Claude → Google Cloud TTS → WebSocket → Browser playback + TalkingHead.js avatar

## Build Order (Phase 1)
1. WebSocket server skeleton (FastAPI `/ws` endpoint)
2. Browser audio capture (WebAudio API, 16kHz mono PCM)
3. Porcupine wake word (WASM, browser-side)
4. Deepgram streaming STT integration
5. Claude LLM with streaming + sentence chunking
6. Google Cloud TTS via server proxy (TalkingHead.js native support)
7. TalkingHead.js avatar integration + lip sync
8. Wire full pipeline + state machine
9. Documentation cleanup

## State Machine
IDLE → LISTENING → PROCESSING → SPEAKING → IDLE
(user interrupt during SPEAKING → LISTENING)

## Key Decisions
- Google Cloud TTS for v1 (1M free chars/month, native TalkingHead.js viseme support, no custom adapter)
- Porcupine Web SDK over openWakeWord (browser WASM, no server audio streaming)
- Deepgram over Faster Whisper for v1 (streaming API, no GPU)
- WebSocket over WebRTC for v1 (simpler, adequate for PoC)
- Ready Player Me discontinued Jan 2026 — use MPFB/Blender for avatars
- Server proxies TTS requests (Google credentials stay server-side)
