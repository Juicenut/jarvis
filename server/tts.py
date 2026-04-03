"""Text-to-Speech via Google Cloud TTS.

Provides a server-side proxy so Google credentials stay on the server.
TalkingHead.js has native Google Cloud TTS support — the client calls
our /api/tts endpoint, and we proxy to Google.

For v1 we use a simple synchronous synthesis per sentence. Streaming
synthesis can be added in v2 for lower latency.
"""

import asyncio
import base64
import logging
from typing import Optional

logger = logging.getLogger("jarvis.tts")

# Lazy import — only load if Google Cloud credentials are available
_tts_client = None
_tts_available = False


def _get_client():
    """Lazy-init the Google Cloud TTS client."""
    global _tts_client, _tts_available
    if _tts_client is not None:
        return _tts_client
    try:
        from google.cloud import texttospeech
        _tts_client = texttospeech.TextToSpeechClient()
        _tts_available = True
        logger.info("Google Cloud TTS client initialized")
        return _tts_client
    except Exception as e:
        logger.warning("Google Cloud TTS not available: %s", e)
        _tts_available = False
        return None


class GoogleTTS:
    """Google Cloud TTS synthesis with word-level timepoints."""

    # British male voice — fits the Jarvis persona
    DEFAULT_VOICE = "en-GB-Neural2-B"
    DEFAULT_SAMPLE_RATE = 24000

    def __init__(self, voice: str = DEFAULT_VOICE):
        self.voice = voice

    async def synthesize(self, text: str) -> dict:
        """Synthesize text to speech.

        Returns:
            dict with:
                audio_base64: str — base64-encoded audio (MP3)
                content_type: str — MIME type
                timepoints: list — word-level timing data (if available)
        """
        client = _get_client()
        if not client:
            return StubTTS().synthesize_sync(text)

        from google.cloud import texttospeech

        # Build SSML with <mark> tags for word-level timestamps
        words = text.split()
        ssml_parts = ['<speak>']
        for i, word in enumerate(words):
            ssml_parts.append(f'<mark name="w{i}"/>{word}')
        ssml_parts.append('</speak>')
        ssml = ' '.join(ssml_parts)

        synthesis_input = texttospeech.SynthesisInput(ssml=ssml)

        voice_params = texttospeech.VoiceSelectionParams(
            language_code=self.voice[:5],  # e.g. "en-GB"
            name=self.voice,
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            sample_rate_hertz=self.DEFAULT_SAMPLE_RATE,
            speaking_rate=1.0,
        )

        # Run synchronous API call in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.synthesize_speech(
                input=synthesis_input,
                voice=voice_params,
                audio_config=audio_config,
                enable_time_pointing=[
                    texttospeech.SynthesizeSpeechRequest.TimepointType.SSML_MARK
                ],
            ),
        )

        # Extract timepoints
        timepoints = []
        for tp in response.timepoints:
            timepoints.append({
                "mark": tp.mark_name,
                "time": tp.time_seconds,
            })

        audio_b64 = base64.b64encode(response.audio_content).decode("utf-8")

        logger.info("TTS: %d chars -> %d bytes audio, %d timepoints",
                     len(text), len(response.audio_content), len(timepoints))

        return {
            "audio_base64": audio_b64,
            "content_type": "audio/mpeg",
            "timepoints": timepoints,
        }


class StubTTS:
    """Stub TTS for development without Google Cloud credentials."""

    def synthesize_sync(self, text: str) -> dict:
        logger.info("Using TTS stub for: %s", text[:50])
        # Return minimal valid response — no actual audio
        return {
            "audio_base64": "",
            "content_type": "audio/mpeg",
            "timepoints": [],
            "stub": True,
        }

    async def synthesize(self, text: str) -> dict:
        return self.synthesize_sync(text)


def create_tts(credentials_path: str) -> GoogleTTS | StubTTS:
    """Factory: return real or stub TTS based on credentials availability."""
    if credentials_path:
        return GoogleTTS()
    return StubTTS()
