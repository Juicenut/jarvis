"""Speech-to-Text via Deepgram streaming API.

Deepgram's Nova-2 model provides real-time streaming transcription over
WebSocket. Its built-in endpointing (speech_final) detects when the user
stops speaking, eliminating the need for a separate VAD in v1.
"""

import asyncio
import json
import logging

import websockets

logger = logging.getLogger("jarvis.stt")
logger.setLevel(logging.DEBUG)

DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"


class DeepgramSTT:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.ws = None
        self._closed = False

    async def start_session(self):
        """Open streaming WebSocket to Deepgram."""
        params = (
            f"?model=nova-2"
            f"&language=en"
            f"&encoding=linear16"
            f"&sample_rate=16000"
            f"&channels=1"
            f"&interim_results=true"
            f"&endpointing=300"  # 300ms silence = end of utterance
            f"&smart_format=true"
        )
        headers = {"Authorization": f"Token {self.api_key}"}

        self.ws = await websockets.connect(
            DEEPGRAM_WS_URL + params,
            additional_headers=headers,
        )
        self._closed = False
        logger.info("Deepgram session started")

    async def send_audio(self, pcm_bytes: bytes):
        """Forward raw PCM audio bytes to Deepgram."""
        if self.ws and not self._closed:
            try:
                await self.ws.send(pcm_bytes)
            except websockets.ConnectionClosed:
                logger.warning("Deepgram connection closed while sending audio")
                self._closed = True

    async def receive_transcripts(self):
        """Async generator yielding transcript events.

        Yields dicts with:
            text: str - the transcript
            is_final: bool - whether this is a final (not interim) result
            speech_final: bool - whether Deepgram detected end of utterance
        """
        if not self.ws:
            return

        msg_count = 0
        try:
            async for raw in self.ws:
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    logger.warning("Deepgram: non-JSON message")
                    continue

                msg_type = msg.get("type", "unknown")
                msg_count += 1

                # Log every message to debug the flow
                logger.debug("Deepgram msg #%d: type=%s, raw=%s",
                             msg_count, msg_type, json.dumps(msg)[:300])

                if msg_type == "Results":
                    channel = msg.get("channel", {})
                    alternatives = channel.get("alternatives", [])
                    if not alternatives:
                        continue

                    transcript = alternatives[0].get("transcript", "")
                    is_final = msg.get("is_final", False)
                    speech_final = msg.get("speech_final", False)

                    # Log results that have text or signal end of speech
                    if transcript or speech_final:
                        logger.info("Deepgram result: text=%r final=%s speech_final=%s",
                                    transcript[:50] if transcript else "", is_final, speech_final)

                    # Skip empty non-final results (interim silence)
                    # But ALWAYS yield speech_final — it signals end of utterance
                    if not transcript and not speech_final:
                        continue

                    yield {
                        "text": transcript,
                        "is_final": is_final,
                        "speech_final": speech_final,
                    }

                elif msg_type == "Metadata":
                    logger.info("Deepgram metadata: %s", json.dumps(msg)[:200])

                elif msg_type == "Error" or msg_type == "CloseStream":
                    logger.error("Deepgram error/close: %s", json.dumps(msg)[:200])

        except websockets.ConnectionClosed as e:
            logger.info("Deepgram connection closed: %s", e)
        except Exception as e:
            logger.error("Deepgram receiver error: %s", e)

    async def stop_session(self):
        """Close Deepgram WebSocket cleanly."""
        if self.ws and not self._closed:
            self._closed = True
            try:
                # Send close message to Deepgram
                await self.ws.send(b"")  # empty byte = close signal
                await self.ws.close()
            except Exception:
                pass
            logger.info("Deepgram session stopped")


class StubSTT:
    """Stub STT for development without a Deepgram key.

    Returns a hardcoded transcript after a short delay.
    """

    async def start_session(self):
        logger.info("Using STT stub (no Deepgram key)")

    async def send_audio(self, pcm_bytes: bytes):
        pass

    async def receive_transcripts(self):
        await asyncio.sleep(2.0)
        yield {
            "text": "What can you help me with?",
            "is_final": True,
            "speech_final": True,
        }

    async def stop_session(self):
        pass


def create_stt(api_key: str) -> DeepgramSTT | StubSTT:
    """Factory: return real or stub STT based on key availability."""
    if api_key:
        return DeepgramSTT(api_key)
    return StubSTT()
