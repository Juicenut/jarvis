"""Voice Activity Detection — stub for v1.

Deepgram's built-in endpointing (speech_final) handles utterance
boundary detection, so a separate VAD is not needed for v1.

This module provides the interface for future Silero VAD integration.
"""

import logging

logger = logging.getLogger("jarvis.vad")


class SileroVAD:
    """Placeholder VAD that always reports speech detected."""

    def __init__(self):
        logger.info("Using VAD stub (Deepgram endpointing handles utterance boundaries)")

    def process_frame(self, pcm_bytes: bytes) -> bool:
        """Returns True if speech detected in frame."""
        return True
