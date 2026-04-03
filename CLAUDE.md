# JARVIS — Claude Code Context

## Project Overview
Jarvis-style AI avatar assistant: wake word → voice conversation → lip-synced 3D avatar response. Web app with Python/FastAPI backend and vanilla JS frontend.

## Key Documents
- `docs/JARVIS-PRD.md` — Full PRD with research-validated tech choices
- `docs/JARVIS-CLAUDE.md` — Step-by-step implementation guide, message protocol, code patterns, common pitfalls

## Architecture
- **Server:** Python 3.11+ / FastAPI / WebSocket (`server/`)
- **Client:** Vanilla JS, no build step (`client/`)
- Streaming pipeline: Browser mic → WebSocket → Deepgram STT → Claude → Cartesia TTS → WebSocket → Browser playback + TalkingHead.js avatar

## Build Order (Phase 1)
1. WebSocket server skeleton (FastAPI `/ws` endpoint)
2. Deepgram streaming STT integration
3. Claude LLM with streaming + sentence chunking
4. Cartesia Sonic TTS with word timestamps
5. Viseme mapping (word timestamps → Oculus visemes)
6. Browser audio capture (WebAudio API, 16kHz mono PCM)
7. Porcupine wake word (WASM, browser-side)
8. TalkingHead.js avatar integration
9. Wire full pipeline + state machine

## State Machine
IDLE → LISTENING → PROCESSING → SPEAKING → IDLE
(user interrupt during SPEAKING → LISTENING)

## Key Decisions
- Cartesia Sonic over Kokoro for v1 TTS (native word timestamps, no forced alignment)
- Porcupine Web SDK over openWakeWord (browser WASM, no server audio streaming)
- Deepgram over Faster Whisper for v1 (streaming API, no GPU)
- WebSocket over WebRTC for v1 (simpler, adequate for PoC)
- Ready Player Me discontinued Jan 2026 — use MPFB/Blender for avatars
