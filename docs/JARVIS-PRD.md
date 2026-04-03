# Project JARVIS — Product Requirements Document

> **Version:** 1.0
> **Date:** April 2026
> **Author:** Fred Schwass
> **Status:** Draft

-----

## 1. Executive Summary

Build a personal "Jarvis-style" interactive AI assistant with a visible, animated 3D avatar face — always listening passively for a wake word, then engaging in natural voice conversation with real-time lip-synced visual feedback. Deployed as a web application, accessible from any browser.

-----

## 2. Problem Statement

Current voice assistants (Alexa, Siri, Google) are faceless and impersonal. There is no open-source solution that combines:
- A visually engaging animated avatar
- Wake word activation for hands-free use
- Natural conversational AI (Claude-powered)
- Real-time lip-synced speech output
- Self-hosted privacy (audio never leaves your network)

-----

## 3. Core User Experience

1. A browser window displays a 3D avatar face in an idle state (subtle breathing, blinking)
2. The system passively listens for a wake word ("Hey Jarvis")
3. On activation, the avatar visually acknowledges and begins listening
4. The user speaks naturally; the system transcribes, reasons via LLM, and responds with synthesised voice
5. The avatar's mouth/face animates in real-time lip-sync with the spoken response
6. The system returns to passive listening after the conversation ends

-----

## 4. Architecture

### 4.1 Recommended: Streaming Pipeline Architecture

Research confirms the **streaming pipeline** (STT → LLM → TTS → Avatar) is the dominant production pattern. Each stage begins processing before the previous completes, minimising end-to-end latency.

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Mic Input     │  │ Audio Output  │  │ 3D Avatar Display │  │
│  │ (WebAudio API)│  │ (Web Audio)   │  │ (TalkingHead.js)  │  │
│  └──────┬───────┘  └──────▲───────┘  └────────▲──────────┘  │
│         │                 │                    │              │
│  ┌──────────────┐         │                    │              │
│  │ Wake Word     │         │                    │              │
│  │ (Porcupine    │         │                    │              │
│  │  WASM)        │         │                    │              │
│  └──────┬───────┘         │                    │              │
│         │ wake event      │ audio chunks       │ viseme data  │
└─────────┼─────────────────┼────────────────────┼──────────────┘
          │ audio stream    │                    │
          ▼                 │                    │
┌─────────────────────────────────────────────────────────────┐
│              SERVER (Python / FastAPI)                        │
│                                                              │
│  ┌──────────────┐                                            │
│  │ VAD           │  Silero VAD (utterance boundaries)        │
│  └──────┬───────┘                                            │
│         ▼                                                    │
│  ┌──────────────┐                                            │
│  │ STT Engine    │  Faster Whisper (large-v3-turbo)          │
│  └──────┬───────┘  OR Deepgram streaming API                 │
│         │ transcribed text                                   │
│         ▼                                                    │
│  ┌──────────────┐                                            │
│  │ LLM / Brain   │  Anthropic Claude API (streaming)         │
│  │               │  claude-sonnet-4-20250514 / opus          │
│  └──────┬───────┘                                            │
│         │ response text (streamed sentence-by-sentence)      │
│         ▼                                                    │
│  ┌──────────────┐                                            │
│  │ TTS Engine    │  Cartesia Sonic (word timestamps)         │
│  │               │  OR Kokoro (local) + forced alignment     │
│  └──────┬───────┘                                            │
│         │ audio + viseme/timing stream                       │
│         ▼                                                    │
│  ┌──────────────┐                                            │
│  │ WebSocket     │  Streams audio + viseme data to client    │
│  │ Server        │  (FastAPI + WebSockets)                   │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Alternative: End-to-End API

OpenAI's Realtime API provides STT+LLM+TTS in a single WebSocket/WebRTC connection (~300-500ms voice-to-voice). Simpler but less flexible, more expensive, and no Claude. Consider as a comparison benchmark only.

-----

## 5. Technology Stack — Research-Validated Choices

### 5.1 Wake Word Detection

| Option | Verdict | Notes |
|--------|---------|-------|
| **Picovoice Porcupine (Web SDK)** | **PRIMARY** | WASM-based, runs in browser, "Jarvis" built-in keyword, cross-platform. Free tier has limits; paid ~$5/device/month |
| openWakeWord | FALLBACK (server) | Apache 2.0, "hey jarvis" model, runs on CPU. No browser SDK — requires server-side processing |

**Key insight from research:** Porcupine's Web SDK (WASM) enables wake word detection entirely in the browser, avoiding always-streaming audio to the server. Browser tab must be active/focused.

### 5.2 Voice Activity Detection (VAD)

| Option | Verdict | Notes |
|--------|---------|-------|
| **Silero VAD** | **PRIMARY** | Industry standard, lightweight, CPU-friendly. Integrated into Faster Whisper pipeline |

### 5.3 Speech-to-Text (STT)

| Option | Verdict | Notes |
|--------|---------|-------|
| **Faster Whisper (large-v3-turbo)** | **PRIMARY (self-hosted)** | CTranslate2-optimised, 4x faster than original Whisper, excellent accuracy. Needs GPU for real-time |
| **Deepgram Nova-2** | **PRIMARY (cloud)** | Sub-300ms streaming STT, WebSocket API, ~$0.0043/min. Best hosted option |
| Web Speech API | REJECTED | Chrome-only, unreliable, routes to Google servers, randomly stops listening |
| Whisper.cpp/WASM | REJECTED | Only tiny/base models usable in browser — accuracy too low |

**Recommendation:** Deepgram for v1 (simplicity + speed), Faster Whisper for v2 (privacy + cost).

### 5.4 LLM (The Brain)

| Option | Verdict | Notes |
|--------|---------|-------|
| **Anthropic Claude API** | **PRIMARY** | claude-sonnet-4-20250514 for speed, opus for complex reasoning. Streaming responses, tool use for future integrations |

- **Latency:** ~0.5-2s first token (streaming)
- **System prompt:** Defines Jarvis personality, knowledge boundaries, conversation style
- **Session management:** Maintain conversation context for ~5 min after last interaction
- **Privacy:** Only transcribed text sent to API, never raw audio

### 5.5 Text-to-Speech (TTS)

| Option | Verdict | Notes |
|--------|---------|-------|
| **Cartesia Sonic** | **PRIMARY (cloud)** | Ultra-low latency (~90ms TTFB), word-level timestamps for lip sync, streaming-first. Best for real-time avatar use |
| **ElevenLabs** | ALTERNATIVE (cloud) | Best voice quality, word timestamps via alignment API, higher latency than Cartesia |
| **Kokoro 82M** | ALTERNATIVE (local) | CPU-friendly, Apache 2.0, good quality. No native viseme output — needs forced alignment |
| Orpheus TTS | FUTURE | Emotion tags, 3B params, needs GPU. Great for expressiveness in v2 |

**Critical finding:** No local TTS natively outputs viseme/timing data. For lip sync with local TTS, you must run a separate forced-alignment step (e.g., Montreal Forced Aligner or Whisper alignment). Cloud APIs (Cartesia, ElevenLabs) provide timestamps natively — strongly favoured for v1.

### 5.6 3D Avatar / Talking Head

| Option | Verdict | Notes |
|--------|---------|-------|
| **TalkingHead.js (met4citizen)** | **PRIMARY** | v1.7, actively maintained (March 2026), 1,145 stars. Real-time lip sync with Oculus visemes, full-body avatars, dynamic physics, emotion system. Chrome/Edge desktop |
| React Three Fiber + custom GLB | ALTERNATIVE | More flexible, React-native. Requires building lip sync logic manually |
| MuseTalk (Tencent) | REJECTED for v1 | Photo-realistic but GPU-heavy server-side rendering. Consider for v2 |
| Commercial (HeyGen, D-ID) | REJECTED | Closed, expensive, no self-hosting |

**Key finding:** Ready Player Me avatars were discontinued Jan 31, 2026. TalkingHead now uses MPFB/Blender pipeline for avatar creation. Must use custom GLB models with ARKit blend shapes + Mixamo-compatible rigs.

**TTS integration in TalkingHead:** Natively supports ElevenLabs (WebSocket), Google Cloud TTS, and Azure Speech SDK — all provide word-level timestamps and Oculus viseme IDs. Cartesia would need a custom adapter to feed timestamps into TalkingHead's viseme system.

### 5.7 Voice Pipeline Frameworks

| Option | Verdict | Notes |
|--------|---------|-------|
| **Pipecat (by Daily.co)** | **EVALUATE** | Python framework for voice AI pipelines, ~5k+ stars, supports multiple STT/TTS/LLM backends. Handles turn management, interruptions |
| **LiveKit Agents** | **EVALUATE** | Production-grade. WebRTC infrastructure, VAD + STT + LLM + TTS pipeline with plugins for Deepgram, OpenAI, ElevenLabs, Cartesia. Best infrastructure for production real-time voice AI |
| Custom FastAPI + WebSocket | FALLBACK | Full control, more work. Good for learning/PoC |

**Research strongly suggests using Pipecat or LiveKit Agents** rather than building a custom pipeline from scratch. Both handle the hard parts (turn-taking, interruptions, streaming orchestration, VAD) that are error-prone to implement manually.

### 5.8 Communication Layer

| Option | Verdict | Notes |
|--------|---------|-------|
| **WebSocket** | **PRIMARY for v1** | Simpler setup, adequate for PoC. ~100-300ms added latency vs WebRTC |
| **WebRTC (via LiveKit)** | **TARGET for v2** | Sub-200ms round-trip, built-in echo cancellation, noise suppression, adaptive bitrate |

-----

## 6. Latency Optimisation Patterns

Research-validated techniques for minimising end-to-end response time:

1. **Sentence-level chunking** — Begin TTS as soon as each sentence completes from LLM (don't wait for full response)
2. **Streaming STT** — Use Deepgram/Whisper streaming, not batch transcription
3. **Fast TTS first-byte** — Cartesia Sonic (~90ms TTFB), ElevenLabs Turbo (~300ms)
4. **Aggressive VAD** — Detect end-of-speech quickly with Silero VAD to minimise dead time
5. **Interruption handling** — Cancel in-progress LLM/TTS generation when user starts speaking
6. **Connection keep-alive** — Maintain persistent WebSocket connections to avoid handshake overhead

### Latency Budget (Target)

| Stage | Target | Notes |
|-------|--------|-------|
| Wake word detection | <500ms | From utterance end to system activation |
| STT transcription | <1s | From end of speech to transcript ready |
| LLM first token | <1.5s | Claude streaming response start |
| TTS first audio | <500ms | From first LLM tokens to audio playback |
| **End-to-end** | **<3s** | From user finishes speaking to avatar starts responding |
| Avatar lip-sync | Real-time | No perceptible lag between audio and mouth |

-----

## 7. Avatar Design

### Appearance
- Stylised 3D humanoid (not photorealistic — avoids uncanny valley)
- Custom GLB model with ARKit blend shapes for facial expressions
- Mixamo-compatible rig for body animations
- Created via MPFB (MakeHuman) + Blender pipeline

### States
| State | Visual Behaviour |
|-------|------------------|
| **Idle** | Subtle breathing, occasional blinks, slight head movement |
| **Listening** | Eyes widen slightly, head tilts, visual "listening" indicator |
| **Processing** | Thinking animation, subtle expression change |
| **Speaking** | Real-time lip sync, hand gestures, emotional expressions |
| **Error** | Confused expression, visual error indicator |

### Emotions
TalkingHead supports mood/emoji-to-expression mapping. The LLM response can include emotion hints that drive avatar expressions (happy, concerned, thoughtful, amused).

-----

## 8. Conversation Management

### Session-Based (Recommended for v1)
- Conversation context maintained for ~5 minutes after last interaction
- Claude system prompt defines personality and knowledge boundaries
- Multi-turn dialogue with full conversation history within session
- Session expires → context reset

### Personality (System Prompt)
- British-Australian butler-style assistant (warm, slightly formal, helpful)
- Knowledgeable about the lodge, local area, wildlife, activities
- Can answer general questions
- Gracefully declines out-of-scope requests

-----

## 9. Implementation Phases

### Phase 1: Proof of Concept (Priority)
**Goal:** End-to-end voice conversation with animated avatar in a browser.

- [ ] Set up Python/FastAPI backend with WebSocket server
- [ ] Integrate Porcupine Web SDK for browser-based wake word
- [ ] Integrate Deepgram streaming STT (or Faster Whisper)
- [ ] Integrate Claude API with streaming responses
- [ ] Integrate Cartesia Sonic TTS with word-level timestamps
- [ ] Set up TalkingHead.js with a stock/placeholder avatar
- [ ] Wire up the full pipeline: wake → listen → transcribe → reason → speak → animate
- [ ] Basic conversation flow (wake → listen → respond → idle)
- [ ] Deploy as standalone web page

### Phase 2: Polish & UX
- [ ] Custom avatar creation (MPFB + Blender pipeline)
- [ ] Avatar idle animations (breathing, blinking, subtle movement)
- [ ] Visual feedback states (listening indicator, processing animation)
- [ ] Interruption handling (user can interrupt while avatar speaks)
- [ ] Session-based conversation memory (~5 min context)
- [ ] Voice tuning — select preferred "Jarvis" voice character
- [ ] Error handling and graceful degradation
- [ ] Mobile-responsive layout

### Phase 3: Framework Migration
- [ ] Evaluate and migrate to Pipecat or LiveKit Agents for pipeline management
- [ ] Upgrade to WebRTC for lower latency audio
- [ ] Add Silero VAD for better utterance boundary detection
- [ ] Implement sentence-level chunking for TTS

### Phase 4: Integration & Features
- [ ] Claude tool use for calendar, weather, web search
- [ ] Lodge-specific knowledge base (rooms, booking, FAQs, local attractions)
- [ ] Smart home control via Home Assistant (future)
- [ ] Dedicated kiosk mode (Raspberry Pi + display)
- [ ] Persistent memory / user preferences across sessions
- [ ] Custom wake word training

-----

## 10. Non-Goals (v1)

- Production-grade animation quality
- Multi-room / distributed microphone arrays
- Smart home integrations
- Mobile app (browser-based is sufficient)
- Photo-realistic avatar rendering
- Offline LLM (no local Ollama in v1)

-----

## 11. Hardware Requirements

### Minimum (Cloud TTS/STT)
- Modern desktop/laptop with decent CPU
- 8GB RAM
- USB microphone (or laptop mic)
- Display for avatar
- Chrome or Edge browser
- Internet connection (for Claude API, Deepgram, Cartesia)

### Recommended (Local STT)
- NVIDIA GPU (RTX 3060+ or equivalent) for Faster Whisper
- 16-32GB RAM
- USB condenser microphone or array mic
- Dedicated display/monitor

### Future: Kiosk
- Raspberry Pi 5 as satellite display
- Separate server for processing
- Wall-mounted screen or tablet

-----

## 12. Security & Privacy

- Wake word detection runs in browser (Porcupine WASM) — no audio streamed until activated
- Audio for STT can be processed locally (Faster Whisper) — no audio leaves network
- Only transcribed text sent to Claude API
- No persistent audio recording or storage
- Session data cleared after timeout
- All API keys server-side only (never exposed to browser)

-----

## 13. Key Technical Risks

| Risk | Mitigation |
|------|------------|
| TalkingHead.js + Cartesia integration gap | Cartesia provides word timestamps; build adapter to convert to Oculus viseme format. TalkingHead natively supports ElevenLabs as fallback |
| Browser wake word reliability (tab must be focused) | Accept limitation for v1. Kiosk mode (Phase 4) keeps tab focused. Consider server-side openWakeWord as alternative |
| Ready Player Me discontinuation | Use MPFB/Blender pipeline for custom avatars. TalkingHead v1.7 supports this |
| End-to-end latency >3s | Use Cartesia Sonic (90ms TTFB) + sentence chunking + streaming pipeline. Deepgram STT is sub-300ms |
| Porcupine free tier limits | Budget for paid tier (~$5/device/month) or fall back to openWakeWord server-side |

-----

## 14. Success Metrics

| Metric | Target |
|--------|--------|
| End-to-end latency | <3 seconds |
| False wake rate | <0.5/hour |
| Conversation success rate | >90% of queries get useful response |
| Avatar lip-sync quality | No perceptible audio-visual lag |
| User engagement | >30s average conversation length |

-----

## 15. Reference Implementations

| Project | Use As Reference For | URL |
|---------|---------------------|-----|
| TalkMateAI | TalkingHead + Kokoro + WebSocket integration | https://github.com/kiranbaby14/TalkMateAI |
| Pipecat | Voice AI pipeline framework patterns | https://github.com/pipecat-ai/pipecat |
| LiveKit Agents | Production voice AI infrastructure | https://github.com/livekit/agents |
| AIAvatarKit | Modular architecture patterns | https://github.com/uezo/aiavatarkit |
| Linly-Talker | Feature-complete digital human reference | https://github.com/Kedreamix/Linly-Talker |

-----

## 16. Technology Links

| Resource | URL |
|----------|-----|
| TalkingHead.js (3D Avatar) | https://github.com/met4citizen/TalkingHead |
| Picovoice Porcupine | https://github.com/Picovoice/porcupine |
| openWakeWord | https://github.com/dscripka/openWakeWord |
| Faster Whisper | https://github.com/SYSTRAN/faster-whisper |
| Deepgram | https://deepgram.com |
| Cartesia Sonic TTS | https://cartesia.ai |
| ElevenLabs | https://elevenlabs.io |
| Kokoro TTS | https://huggingface.co/hexgrad/Kokoro-82M |
| Orpheus TTS | https://github.com/canopyai/Orpheus-TTS |
| Silero VAD | https://github.com/snakers4/silero-vad |
| Pipecat | https://github.com/pipecat-ai/pipecat |
| LiveKit Agents | https://github.com/livekit/agents |
| Anthropic Claude API | https://docs.anthropic.com |
| MPFB (MakeHuman) | https://static.makehumancommunity.org/mpfb.html |
