"""JARVIS server — FastAPI app with WebSocket endpoint."""

import asyncio
import base64
import json
import logging
import time

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import load_config
from pipeline import VoicePipeline
from stt import create_stt
from tts import create_tts

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("jarvis")

config = load_config()

# Log missing keys as warnings (not fatal — stubs can fill in)
missing = config.validate()
if missing:
    logger.warning("Missing config keys (stubs will be used): %s", ", ".join(missing))

tts = create_tts(config.google_credentials_path)

app = FastAPI(title="JARVIS", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.client_origin, "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


class TTSRequest(BaseModel):
    text: str
    voice: str = "en-GB-Neural2-B"


@app.post("/api/tts")
async def tts_proxy(req: TTSRequest):
    """Proxy TTS requests to Google Cloud TTS.

    Keeps Google credentials server-side while letting the client
    (TalkingHead.js) handle audio playback and viseme animation.
    """
    result = await tts.synthesize(req.text)
    return JSONResponse(content=result)


@app.get("/config/porcupine")
async def porcupine_config():
    """Provide Picovoice access key to client (avoids hardcoding in JS)."""
    if not config.picovoice_access_key:
        return {"accessKey": "", "error": "PICOVOICE_ACCESS_KEY not configured"}
    return {"accessKey": config.picovoice_access_key}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    session = {
        "state": "idle",
        "conversation": [],
        "last_activity": time.time(),
    }
    stt = None
    stt_task = None
    pipeline = VoicePipeline()
    client_id = id(ws)
    logger.info("Client %s connected, state=idle", client_id)

    async def run_stt_receiver():
        """Background task: receive transcripts from STT and forward to client."""
        nonlocal stt
        try:
            async for result in stt.receive_transcripts():
                await ws.send_json({
                    "type": "transcript",
                    "text": result["text"],
                    "final": result["is_final"],
                })
                logger.info("Transcript [final=%s, speech_final=%s]: %s",
                            result["is_final"], result["speech_final"], result["text"])

                if result["speech_final"]:
                    # User stopped speaking — transition to processing
                    session["state"] = "processing"
                    await ws.send_json({"type": "state", "state": "processing"})
                    logger.info("Client %s: speech_final -> processing", client_id)

                    final_text = result["text"]
                    await stt.stop_session()
                    stt = None

                    # Run through LLM pipeline
                    await pipeline.process_utterance(final_text, ws)

                    # Return to idle
                    session["state"] = "idle"
                    await ws.send_json({"type": "state", "state": "idle"})
                    break
        except Exception as e:
            logger.error("STT receiver error: %s", e)

    try:
        while True:
            raw = await ws.receive_text()
            session["last_activity"] = time.time()

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = msg.get("type")

            if msg_type == "wake":
                session["state"] = "listening"
                await ws.send_json({"type": "state", "state": "listening"})
                logger.info("Client %s: wake -> listening", client_id)

                # Start STT session
                stt = create_stt(config.deepgram_api_key)
                await stt.start_session()
                stt_task = asyncio.create_task(run_stt_receiver())

            elif msg_type == "audio":
                if stt and session["state"] == "listening":
                    # Decode base64 audio and forward to STT
                    pcm_bytes = base64.b64decode(msg.get("data", ""))
                    await stt.send_audio(pcm_bytes)

            elif msg_type == "interrupt":
                pipeline.cancel()
                if stt:
                    await stt.stop_session()
                    stt = None
                if stt_task:
                    stt_task.cancel()
                    stt_task = None
                session["state"] = "listening"
                await ws.send_json({"type": "state", "state": "listening"})
                logger.info("Client %s: interrupt -> listening", client_id)

            elif msg_type == "ping":
                pass  # Heartbeat, no response needed

            else:
                await ws.send_json({"type": "echo", "original": msg})

    except WebSocketDisconnect:
        logger.info("Client %s disconnected", client_id)
        if stt:
            await stt.stop_session()
        if stt_task:
            stt_task.cancel()
