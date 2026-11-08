from __future__ import annotations

import logging
import os

from app.providers.base import LessonProvider
from app.providers.gemini_provider import GeminiLessonProvider
from app.providers.mock import MockLessonProvider
from app.providers.openai_provider import OpenAILessonProvider
from app.providers.pipeline import PipelineLessonProvider

logger = logging.getLogger(__name__)


def _gemini() -> GeminiLessonProvider | None:
    api_key = os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()
    if not api_key:
        return None
    return GeminiLessonProvider(
        api_key=api_key,
        model=os.getenv("GEMINI_MODEL"),
        base_url=os.getenv("GEMINI_BASE_URL"),
    )


def _groq() -> OpenAILessonProvider | None:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return None
    # Groq is OpenAI-compatible; qwen3.8-27b is its current vision model with JSON mode.
    return OpenAILessonProvider(
        api_key=api_key,
        base_url=os.getenv("GROQ_BASE_URL") or "https://api.groq.com/openai/v1",
        model=os.getenv("GROQ_MODEL") or "qwen/qwen3.8-27b",
        # Free tier caps output at 1000 tokens/min; Groq rejects requests that reserve more.
        max_tokens=int(os.getenv("GROQ_MAX_TOKENS") or 1000),
    )


def create_provider() -> LessonProvider:
    """Select provider from env. Mock is always the safe default."""
    name = os.getenv("VL_PROVIDER", "mock").strip().lower()

    if name == "pipeline":
        reader, teacher = _groq(), _gemini()
        if reader and teacher:
            return PipelineLessonProvider(reader=reader, teacher=teacher)
        logger.warning("VL_PROVIDER=pipeline needs GROQ_API_KEY and GEMINI_API_KEY; using mock.")
        return MockLessonProvider()

    if name in {"gemini", "google"}:
        return _gemini() or MockLessonProvider()

    if name == "groq":
        return _groq() or MockLessonProvider()

    if name in {"openai", "live"}:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            return MockLessonProvider()
        return OpenAILessonProvider(
            api_key=api_key,
            base_url=os.getenv("OPENAI_BASE_URL"),
            model=os.getenv("OPENAI_MODEL"),
        )

    return MockLessonProvider()


def provider_name(provider: LessonProvider) -> str:
    return type(provider).__name__
