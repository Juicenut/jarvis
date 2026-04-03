"""Voice pipeline orchestration.

Connects STT output to Claude LLM to TTS, managing state transitions
and conversation history for each WebSocket session.
"""

import asyncio
import logging
import time

from fastapi import WebSocket

from config import load_config
from llm import create_llm

logger = logging.getLogger("jarvis.pipeline")

config = load_config()
llm = create_llm(config.anthropic_api_key)


class VoicePipeline:
    def __init__(self):
        self.state = "idle"
        self.conversation: list[dict] = []
        self.last_activity = time.time()
        self._cancelled = False

    async def process_utterance(self, transcript: str, ws: WebSocket):
        """Process a user utterance through the LLM and send responses.

        Args:
            transcript: The user's transcribed speech
            ws: WebSocket to send responses to
        """
        self._cancelled = False
        self.last_activity = time.time()

        # Add user message to conversation history
        self.conversation.append({"role": "user", "content": transcript})

        try:
            sentence_count = 0
            full_response = ""

            async for sentence in llm.stream_response(self.conversation):
                if self._cancelled:
                    logger.info("Pipeline cancelled mid-response")
                    break

                sentence_count += 1
                full_response += sentence + " "

                # Send sentence for TTS (client will handle speech + avatar)
                await ws.send_json({"type": "speak", "text": sentence})

                # Also send as response_text for UI display
                await ws.send_json({
                    "type": "response_text",
                    "text": sentence,
                    "done": False,
                })

            # Signal response complete
            await ws.send_json({"type": "response_text", "text": "", "done": True})

            # Add assistant response to conversation history
            if full_response.strip():
                self.conversation.append({
                    "role": "assistant",
                    "content": full_response.strip(),
                })

            logger.info("Response: %d sentences", sentence_count)

        except Exception as e:
            logger.error("Pipeline error: %s", e)
            await ws.send_json({"type": "error", "message": str(e)})

    def cancel(self):
        """Cancel in-progress response (e.g. user interrupted)."""
        self._cancelled = True

    def check_session_timeout(self) -> bool:
        """Returns True if session has timed out."""
        return (time.time() - self.last_activity) > config.session_timeout_seconds

    def reset_session(self):
        """Clear conversation history."""
        self.conversation.clear()
        self.last_activity = time.time()
        logger.info("Session reset")
