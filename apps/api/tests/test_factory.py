from app.providers.factory import create_provider, provider_name
from app.providers.gemini_provider import GeminiLessonProvider
from app.providers.mock import MockLessonProvider


def test_factory_defaults_to_mock(monkeypatch) -> None:
    monkeypatch.delenv("VL_PROVIDER", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    provider = create_provider()
    assert isinstance(provider, MockLessonProvider)
    assert "Mock" in provider_name(provider)


def test_factory_openai_without_key_falls_back(monkeypatch) -> None:
    monkeypatch.setenv("VL_PROVIDER", "openai")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert isinstance(create_provider(), MockLessonProvider)


def test_factory_gemini_without_key_falls_back(monkeypatch) -> None:
    monkeypatch.setenv("VL_PROVIDER", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    assert isinstance(create_provider(), MockLessonProvider)


def test_factory_gemini_with_key(monkeypatch) -> None:
    monkeypatch.setenv("VL_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-real")
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    provider = create_provider()
    assert isinstance(provider, GeminiLessonProvider)
