from __future__ import annotations

import os

from app.providers.base import LessonProvider
from app.providers.gemini_provider import GeminiLessonProvider
from app.providers.mock import MockLessonProvider
from app.providers.openai_provider import OpenAILessonProvider


def create_provider() -> LessonProvider:
    """Select provider from env. Mock is always the safe default."""
    name = os.getenv("VL_PROVIDER", "mock").strip().lower()

    if name in {"gemini", "google"}:
        api_key = (
            os.getenv("GEMINI_API_KEY", "").strip()
            or os.getenv("GOOGLE_API_KEY", "").strip()
        )
        if not api_key:
            return MockLessonProvider()
        return GeminiLessonProvider(
            api_key=api_key,
            model=os.getenv("GEMINI_MODEL"),
            base_url=os.getenv("GEMINI_BASE_URL"),
        )

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
