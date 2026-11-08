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


def test_factory_groq_with_key(monkeypatch) -> None:
    from app.providers.openai_provider import OpenAILessonProvider

    monkeypatch.setenv("VL_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "test-key-not-real")
    monkeypatch.delenv("GROQ_BASE_URL", raising=False)
    monkeypatch.delenv("GROQ_MODEL", raising=False)
    provider = create_provider()
    assert isinstance(provider, OpenAILessonProvider)
    assert provider._base_url == "https://api.groq.com/openai/v1"


def test_factory_groq_without_key_falls_back(monkeypatch) -> None:
    monkeypatch.setenv("VL_PROVIDER", "groq")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    assert isinstance(create_provider(), MockLessonProvider)
