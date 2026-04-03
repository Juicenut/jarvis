# JARVIS AI Avatar Assistant — Claude Code Implementation Guide

> **Purpose:** This file provides all context a Claude Code session needs to implement the JARVIS project correctly. Read the companion `JARVIS-PRD.md` for full product requirements and research.

-----

## Project Overview

JARVIS is a web-based AI avatar assistant with wake word activation, voice conversation, and real-time lip-synced 3D avatar. It runs as a standalone web application with a Python backend and browser frontend.

### Quick Architecture Summary

```
Browser (Client)                    Server (Python/FastAPI)
├── Porcupine WASM (wake word)      ├── Silero VAD (speech boundaries)
├── WebAudio API (mic capture)      ├── Deepgram/Faster Whisper (STT)
├── TalkingHead.js (3D avatar)      ├── Claude API (LLM, streaming)
├── Web Audio (playback)            ├── Cartesia Sonic (TTS + timestamps)
└── WebSocket client                └── WebSocket server (FastAPI)
```

Audio flows: Browser mic → WebSocket → Server STT → Claude → TTS → WebSocket → Browser playback + avatar lip sync.

-----

## Repository Structure

```
/jarvis                          # Root of JARVIS project (standalone)
├── /server                      # Python backend
│   ├── main.py                  # FastAPI app + WebSocket server
│   ├── pipeline.py              # Voice pipeline orchestration
│   ├── stt.py                   # Speech-to-text (Deepgram / Faster Whisper)
│   ├── llm.py                   # Claude API integration
│   ├── tts.py                   # Cartesia Sonic TTS + timestamp handling
│   ├── vad.py                   # Silero VAD wrapper
│   ├── viseme.py                # Convert word timestamps → Oculus viseme data
│   ├── config.py                # Environment config + defaults
│   ├── requirements.txt         # Python dependencies
│   └── .env.example             # Required API keys
├── /client                      # Browser frontend
│   ├── index.html               # Main page
│   ├── /js
│   │   ├── app.js               # Main application logic + state machine
│   │   ├── wake-word.js         # Porcupine WASM integration
│   │   ├── audio-capture.js     # WebAudio mic capture + streaming
│   │   ├── audio-playback.js    # Audio playback with viseme sync
│   │   ├── avatar.js            # TalkingHead.js wrapper
│   │   ├── websocket.js         # WebSocket client + reconnection
│   │   └── ui.js                # UI state indicators
│   ├── /css
│   │   └── style.css            # Avatar display + UI styling
│   └── /assets
│       └── /avatar              # GLB avatar model files
├── /docs
│   ├── JARVIS-PRD.md            # Full PRD with research
│   └── JARVIS-CLAUDE.md         # This file
├── docker-compose.yml           # Optional: containerised deployment
└── README.md                    # Setup instructions
```

-----

## Tech Stack & Versions

### Server (Python 3.11+)
| Package | Purpose | Install |
|---------|---------|---------|
| fastapi | HTTP + WebSocket server | `pip install fastapi[standard]` |
| uvicorn | ASGI server | `pip install uvicorn` |
| websockets | WebSocket support | `pip install websockets` |
| anthropic | Claude API client | `pip install anthropic` |
| cartesia | Cartesia Sonic TTS API | `pip install cartesia` |
| deepgram-sdk | Deepgram streaming STT | `pip install deepgram-sdk` |
| silero-vad | Voice activity detection | `pip install silero-vad` or torch-based |
| faster-whisper | Local STT (optional) | `pip install faster-whisper` |
| python-dotenv | Env config | `pip install python-dotenv` |

### Client (Browser, no build step)
| Library | Purpose | Load Via |
|---------|---------|----------|
| TalkingHead.js | 3D avatar + lip sync | Script tag or ES module from GitHub |
| Three.js | 3D rendering (TalkingHead dep) | Loaded by TalkingHead |
| Porcupine Web SDK | Wake word detection (WASM) | npm or CDN `@picovoice/porcupine-web` |

### API Keys Required (server/.env)
```
ANTHROPIC_API_KEY=sk-ant-...          # Claude API
CARTESIA_API_KEY=...                   # Cartesia Sonic TTS
DEEPGRAM_API_KEY=...                   # Deepgram STT (if using cloud STT)
PICOVOICE_ACCESS_KEY=...               # Porcupine wake word (free tier available)
```

-----

## Implementation Guide

### Critical Path (Phase 1 — get it working end-to-end)

Build in this order. Each step should be independently testable.

#### Step 1: WebSocket Server Skeleton
- FastAPI app with a `/ws` WebSocket endpoint
- Accept binary audio frames from client
- Send back JSON messages (state changes) and binary audio (TTS output)
- Message protocol:

```json
// Client → Server
{"type": "audio", "data": "<base64 PCM>"}
{"type": "wake", "timestamp": 1234567890}
{"type": "interrupt"}

// Server → Client
{"type": "state", "state": "listening|processing|speaking|idle"}
{"type": "transcript", "text": "user said this", "final": true}
{"type": "response_text", "text": "partial response", "done": false}
{"type": "audio_chunk", "data": "<base64 audio>", "visemes": [...]}
{"type": "error", "message": "what went wrong"}
```

#### Step 2: STT Integration
- Integrate Deepgram streaming STT via their WebSocket API
- Pipe incoming audio frames from client → Deepgram
- Return interim and final transcripts to client
- Use Silero VAD to detect utterance boundaries (end-of-speech)

#### Step 3: Claude LLM Integration
- Use `anthropic` Python SDK with streaming
- System prompt for Jarvis personality
- Stream response token-by-token
- Buffer into sentences (split on `.!?`) for sentence-level TTS chunking
- Maintain conversation history per WebSocket session (list of messages)
- Clear session after 5 min inactivity

#### Step 4: TTS Integration (Cartesia Sonic)
- Use Cartesia streaming API
- Send each sentence as it completes from LLM
- Receive audio chunks + word-level timestamps
- Convert word timestamps to Oculus viseme format (see viseme.py)
- Stream audio + viseme data back to client

#### Step 5: Viseme Mapping
- Cartesia returns word-level timestamps (start_ms, end_ms, word)
- Map each word's phonemes to Oculus viseme blend shape IDs
- TalkingHead expects viseme data in this format:
```json
[
  {"time": 0.0, "value": "viseme_PP"},
  {"time": 0.1, "value": "viseme_aa"},
  {"time": 0.2, "value": "viseme_SS"}
]
```
- Use a simple phoneme-to-viseme lookup table (CMU phoneme set → 15 Oculus visemes)
- Alternatively, use ElevenLabs which provides Oculus visemes natively (TalkingHead has built-in support)

#### Step 6: Browser Client — Audio Capture
- Use WebAudio API to capture mic input (16kHz, mono, PCM)
- Stream audio frames to server via WebSocket
- Handle mic permissions gracefully

#### Step 7: Browser Client — Wake Word
- Integrate Porcupine Web SDK
- Listen for "Jarvis" keyword continuously
- On detection, send `{"type": "wake"}` to server and switch UI to listening state
- Porcupine processes audio locally in WASM — no server round-trip

#### Step 8: Browser Client — TalkingHead Avatar
- Load TalkingHead.js and a placeholder GLB avatar
- On receiving audio + viseme data from server, feed into TalkingHead
- TalkingHead handles lip sync, eye contact, head movement automatically
- Set avatar state based on server state messages (idle, listening, speaking)

#### Step 9: Wire It All Together
- State machine: IDLE → WAKE_DETECTED → LISTENING → PROCESSING → SPEAKING → IDLE
- Handle edge cases: user interrupts while speaking, network disconnects, API errors
- Test full loop: say "Hey Jarvis" → ask a question → hear response with lip sync

-----

## Key Integration Details

### TalkingHead.js Integration

TalkingHead natively supports ElevenLabs WebSocket API with viseme data. For Cartesia, you need a custom approach:

**Option A (recommended for v1):** Use ElevenLabs instead of Cartesia for TTS. TalkingHead has built-in support:
```javascript
const head = new TalkingHead(container, { ttsEndpoint: 'elevenlabs' });
await head.speakAudio(audioBlob, { visemes: visemeData });
```

**Option B:** Feed Cartesia audio + custom viseme data manually:
```javascript
// Convert Cartesia word timestamps to visemes server-side
// Send both audio blob and viseme array to client
// Use TalkingHead's manual viseme input API
await head.speakAudio(audioBlob, visemeTimeline);
```

### Sentence Chunking for Low Latency
```python
# In llm.py — buffer Claude's streaming response into sentences
buffer = ""
async for chunk in stream:
    buffer += chunk.text
    # Check for sentence boundaries
    for sep in ['. ', '! ', '? ', '.\n', '!\n', '?\n']:
        if sep in buffer:
            sentence, buffer = buffer.split(sep, 1)
            sentence += sep.strip()
            yield sentence  # Send to TTS immediately
```

### State Machine
```
IDLE ──(wake word)──→ LISTENING
LISTENING ──(VAD end-of-speech)──→ PROCESSING
PROCESSING ──(TTS audio ready)──→ SPEAKING
SPEAKING ──(audio complete)──→ IDLE
SPEAKING ──(user interrupt)──→ LISTENING
ANY ──(error)──→ IDLE (with error display)
ANY ──(5 min timeout)──→ IDLE (clear session)
```

-----

## Common Pitfalls & Solutions

| Pitfall | Solution |
|---------|----------|
| TalkingHead requires specific avatar format | Must use GLB with ARKit blend shapes + Mixamo rig. Use MPFB/Blender. Ready Player Me is discontinued (Jan 2026) |
| Browser throttles background audio | Wake word only works when tab is focused. Accept for v1; kiosk mode for v2 |
| WebSocket drops on network hiccup | Implement exponential backoff reconnection in client |
| Claude streaming + TTS streaming = complexity | Use sentence-level chunking as the boundary — simpler than token-level |
| Viseme timing drift | Sync viseme timestamps relative to audio chunk start, not absolute time |
| Echo: avatar speech triggers wake word | Mute Porcupine during SPEAKING state, re-enable on IDLE |

-----

## Testing Strategy

1. **Unit test each component independently** — STT, LLM, TTS, viseme mapping
2. **Integration test the pipeline** — Feed a WAV file → get audio + visemes out
3. **Manual test the full loop** — Browser → wake → speak → response → lip sync
4. **Latency benchmarking** — Measure each stage; target <3s end-to-end

-----

## Future Considerations (Phase 2+)

- **Pipecat or LiveKit Agents** — Migrate from custom pipeline to framework for production-grade turn management, interruptions, and WebRTC
- **Local TTS (Kokoro/Orpheus)** — Requires adding forced-alignment step for viseme data
- **Custom avatar** — Design via MPFB/Blender with unique Jarvis appearance
- **Lodge integration** — Connect to Supabase for room availability, booking info, FAQs
- **Tool use** — Claude function calling for weather, calendar, web search
- **Persistent memory** — Store conversation summaries across sessions

-----

## Quick Start Commands

```bash
# Server
cd jarvis/server
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in API keys
uvicorn main:app --reload --port 8000

# Client (serve static files)
cd jarvis/client
python -m http.server 3001
# Open http://localhost:3001 in Chrome/Edge
```

-----

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cloud TTS over local for v1 | Cartesia Sonic / ElevenLabs | Native word timestamps for lip sync; no forced-alignment needed |
| Porcupine over openWakeWord | Porcupine Web SDK | Browser-native WASM; no server audio streaming for wake detection |
| WebSocket over WebRTC for v1 | WebSocket | Simpler; adequate latency for PoC |
| Standalone project, not Next.js integration | Separate /jarvis directory | Different runtime (Python), different deployment, cleaner separation |
| Deepgram over Faster Whisper for v1 | Deepgram | Streaming API, no GPU needed, fast setup |
| Session-based memory | 5 min timeout | Good UX without persistence complexity |
