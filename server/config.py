"""Environment configuration for JARVIS server."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


@dataclass
class Config:
    anthropic_api_key: str = ""
    deepgram_api_key: str = ""
    picovoice_access_key: str = ""
    google_credentials_path: str = ""
    host: str = "0.0.0.0"
    port: int = 8000
    client_origin: str = "http://localhost:3001"
    session_timeout_seconds: int = 300  # 5 minutes

    def validate(self) -> list[str]:
        """Return list of missing required keys (empty = all good)."""
        missing = []
        if not self.anthropic_api_key:
            missing.append("ANTHROPIC_API_KEY")
        if not self.deepgram_api_key:
            missing.append("DEEPGRAM_API_KEY")
        if not self.picovoice_access_key:
            missing.append("PICOVOICE_ACCESS_KEY")
        if not self.google_credentials_path:
            missing.append("GOOGLE_APPLICATION_CREDENTIALS")
        elif not Path(self.google_credentials_path).exists():
            missing.append(f"GOOGLE_APPLICATION_CREDENTIALS (file not found: {self.google_credentials_path})")
        return missing


def load_config() -> Config:
    """Load config from environment / .env file."""
    env_path = Path(__file__).parent / ".env"
    load_dotenv(env_path)

    return Config(
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        deepgram_api_key=os.getenv("DEEPGRAM_API_KEY", ""),
        picovoice_access_key=os.getenv("PICOVOICE_ACCESS_KEY", ""),
        google_credentials_path=os.getenv("GOOGLE_APPLICATION_CREDENTIALS", ""),
        host=os.getenv("JARVIS_HOST", "0.0.0.0"),
        port=int(os.getenv("JARVIS_PORT", "8000")),
        client_origin=os.getenv("JARVIS_CLIENT_ORIGIN", "http://localhost:3001"),
        session_timeout_seconds=int(os.getenv("JARVIS_SESSION_TIMEOUT", "300")),
    )
