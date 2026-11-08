from __future__ import annotations

import httpx

from app.models import Depth
from app.providers import gemini_provider
from app.providers.factory import create_provider
from app.providers.gemini_provider import GeminiLessonProvider
from app.providers.mock import MockLessonProvider
from app.providers.pipeline import PipelineLessonProvider

FEATURES = {"contentType": "equation", "transcription": "x^2", "confidence": 0.9}


class FakeReader:
    def __init__(self) -> None:
        self.asked: list[str] = []

    def extract_features(self, *, image_bytes: bytes, filename: str | None) -> dict:
        assert image_bytes == b"img"
        return FEATURES

    def answer_question(self, lesson, question):
        self.asked.append(question)
        assert lesson.sourceExtraction == FEATURES  # tutor sees the extracted features
        return ("answer", [], 0.8)


class FakeTeacher:
    def __init__(self) -> None:
        self.got: dict | None = None

    def generate_lesson_from_extraction(self, *, extraction, depth, subject):
        self.got = extraction
        return MockLessonProvider().generate_lesson(
            image_bytes=b"", filename="equation.png", depth=depth, subject=subject
        )


def test_pipeline_extracts_then_teaches_then_tutors() -> None:
    reader, teacher = FakeReader(), FakeTeacher()
    p = PipelineLessonProvider(reader=reader, teacher=teacher)  # type: ignore[arg-type]
    lesson = p.generate_lesson(image_bytes=b"img", filename="x.png", depth=Depth.beginner, subject=None)
    assert teacher.got == FEATURES
    assert lesson.sourceExtraction == FEATURES
    assert p.answer_question(lesson, "why?") == ("answer", [], 0.8)
    assert reader.asked == ["why?"]


def test_factory_pipeline_needs_both_keys(monkeypatch) -> None:
    monkeypatch.setenv("VL_PROVIDER", "pipeline")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini")
    assert isinstance(create_provider(), PipelineLessonProvider)
    monkeypatch.delenv("GEMINI_API_KEY")
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    assert isinstance(create_provider(), MockLessonProvider)


def test_gemini_retries_once_on_overload(monkeypatch) -> None:
    calls: list[int] = []
    ok = {"candidates": [{"content": {"parts": [{"text": '{"answer": "a", "references": [], "confidence": 1}'}]}}]}

    def fake_post(*args, **kwargs):
        calls.append(1)
        req = httpx.Request("POST", "http://x")
        return httpx.Response(503, request=req) if len(calls) == 1 else httpx.Response(200, json=ok, request=req)

    monkeypatch.setattr(gemini_provider.httpx, "post", fake_post)
    monkeypatch.setattr(gemini_provider, "RETRY_DELAY_S", 0)
    lesson = MockLessonProvider().generate_lesson(image_bytes=b"", filename="e.png", depth=Depth.beginner, subject=None)
    answer = GeminiLessonProvider(api_key="k").answer_question(lesson, "q")
    assert answer[0] == "a" and len(calls) == 2
