# JARVIS — AI Avatar Assistant

A personal "Jarvis-style" interactive AI assistant with a visible, animated 3D avatar face — always listening passively for a wake word, then engaging in natural voice conversation with real-time lip-synced visual feedback. Deployed as a web application.

## Architecture

```
Browser (Client)                    Server (Python/FastAPI)
├── Porcupine WASM (wake word)      ├── Silero VAD (speech boundaries)
├── WebAudio API (mic capture)      ├── Deepgram (STT)
├── TalkingHead.js (3D avatar)      ├── Claude API (LLM, streaming)
├── Web Audio (playback)            ├── Google Cloud TTS (+ timestamps)
└── WebSocket client                └── WebSocket server (FastAPI)
```

## Quick Start

```bash
# Server
cd server
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in API keys
uvicorn main:app --reload --port 8000

# Client (serve static files)
cd client
python -m http.server 3001
# Open http://localhost:3001 in Chrome/Edge
```

## API Keys Required

| Key | Service | Purpose |
|-----|---------|---------|
| `ANTHROPIC_API_KEY` | Anthropic | Claude LLM |
| `DEEPGRAM_API_KEY` | Deepgram | Streaming STT |
| `PICOVOICE_ACCESS_KEY` | Picovoice | Porcupine wake word detection |
| `GOOGLE_APPLICATION_CREDENTIALS` | Google Cloud | Text-to-Speech (service account JSON) |

## Documentation

- [Full PRD](docs/JARVIS-PRD.md) — Product requirements, research, and technology decisions
- [Implementation Guide](docs/JARVIS-CLAUDE.md) — Step-by-step build order and code patterns

## Tech Stack

- **Wake Word:** Picovoice Porcupine (WASM, runs in browser)
- **STT:** Deepgram Nova-2 (streaming)
- **LLM:** Anthropic Claude (streaming)
- **TTS:** Google Cloud TTS (word-level timestamps, native TalkingHead.js support)
- **Avatar:** TalkingHead.js (3D, Oculus visemes)
- **Backend:** Python / FastAPI / WebSocket
- **Frontend:** Vanilla JS (no build step)
