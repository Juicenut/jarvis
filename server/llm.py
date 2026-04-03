"""Claude LLM integration with streaming and sentence chunking.

Streams responses from Claude API and yields complete sentences as soon
as they're detected. This enables sentence-level TTS — each sentence
can be spoken while the next is still being generated.
"""

import asyncio
import logging
from typing import AsyncGenerator

import anthropic

logger = logging.getLogger("jarvis.llm")

SYSTEM_PROMPT = """\
You are Jarvis, a helpful AI assistant. You speak in a warm, slightly formal British style — \
think capable butler meets knowledgeable friend.

Rules for your responses:
- Keep responses concise: 1-3 sentences for simple questions, more for complex topics.
- You are speaking out loud, so write naturally as speech, not as text.
- Do not use markdown, bullet points, numbered lists, or any formatting.
- Do not use asterisks, hashes, or special characters for emphasis.
- Just natural spoken language, as if you were talking to someone in the room.
- Be helpful, warm, and occasionally witty.
"""

SENTENCE_ENDINGS = (". ", "! ", "? ", ".\n", "!\n", "?\n")


class ClaudeLLM:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514"):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def stream_response(
        self, conversation: list[dict]
    ) -> AsyncGenerator[str, None]:
        """Stream Claude's response, yielding complete sentences.

        Args:
            conversation: List of {"role": "user"|"assistant", "content": str}

        Yields:
            Complete sentences as they're detected in the stream.
        """
        buffer = ""

        async with self.client.messages.stream(
            model=self.model,
            system=SYSTEM_PROMPT,
            messages=conversation,
            max_tokens=300,
        ) as stream:
            async for text in stream.text_stream:
                buffer += text

                # Check for sentence boundaries and yield complete sentences
                while True:
                    split_pos = -1
                    for ending in SENTENCE_ENDINGS:
                        pos = buffer.find(ending)
                        if pos != -1 and (split_pos == -1 or pos < split_pos):
                            split_pos = pos + len(ending)

                    if split_pos == -1:
                        break

                    sentence = buffer[:split_pos].strip()
                    buffer = buffer[split_pos:]
                    if sentence:
                        yield sentence

        # Flush any remaining text
        remaining = buffer.strip()
        if remaining:
            yield remaining


class StubLLM:
    """Stub LLM for development without an Anthropic key."""

    async def stream_response(
        self, conversation: list[dict]
    ) -> AsyncGenerator[str, None]:
        logger.info("Using LLM stub (no Anthropic key)")
        sentences = [
            "Very good, sir.",
            "I'm Jarvis, your AI assistant.",
            "I'm afraid I'm running in stub mode at the moment, so my conversational range is rather limited.",
        ]
        for sentence in sentences:
            await asyncio.sleep(0.5)
            yield sentence


def create_llm(api_key: str) -> ClaudeLLM | StubLLM:
    """Factory: return real or stub LLM based on key availability."""
    if api_key:
        return ClaudeLLM(api_key)
    return StubLLM()
