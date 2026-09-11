from __future__ import annotations

from app.models import Depth, Lesson
from app.orchestrator import LearningOrchestrator
from app.providers.base import LessonProvider


class DummyBroken:
    def model_dump(self) -> dict[str, object]:
        return {"title": "nope"}


class BadProvider(LessonProvider):
    def generate_lesson(
        self,
        *,
        image_bytes: bytes,
        filename: str | None,
        depth: Depth,
        subject: str | None,
    ) -> Lesson:
        del image_bytes, filename, depth, subject
        return DummyBroken()  # type: ignore[return-value]

    def answer_question(self, lesson: Lesson, question: str) -> tuple[str, list[str], float]:
        del lesson, question
        return ("", [], 0.0)


def test_orchestrator_rejects_invalid_provider_output() -> None:
    orch = LearningOrchestrator(BadProvider())
    try:
        orch.create_lesson(
            image_bytes=b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,
            content_type="image/png",
            filename="ok.png",
            depth=Depth.standard,
            subject=None,
        )
    except Exception as exc:
        assert getattr(exc, "code", "") == "LESSON_INVALID"
        return
    raise AssertionError("expected LESSON_INVALID")
