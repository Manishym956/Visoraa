from __future__ import annotations

from abc import ABC, abstractmethod

from app.models import Depth, Lesson


class LessonProvider(ABC):
    @abstractmethod
    def generate_lesson(
        self,
        *,
        image_bytes: bytes,
        filename: str | None,
        depth: Depth,
        subject: str | None,
    ) -> Lesson:
        raise NotImplementedError

    @abstractmethod
    def answer_question(self, lesson: Lesson, question: str) -> tuple[str, list[str], float]:
        raise NotImplementedError
