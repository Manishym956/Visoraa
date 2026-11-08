from __future__ import annotations

from pydantic import ValidationError

from app.errors import AppError
from app.image_validation import validate_image
from app.models import Depth, Lesson
from app.providers.base import LessonProvider

# One retry: each attempt spends rate-limited LLM quota.
MAX_RETRIES = 1


class LearningOrchestrator:
    def __init__(self, provider: LessonProvider) -> None:
        self._provider = provider

    def create_lesson(
        self,
        *,
        image_bytes: bytes,
        content_type: str | None,
        filename: str | None,
        depth: Depth,
        subject: str | None,
    ) -> Lesson:
        validate_image(image_bytes, content_type, filename)
        last_error: Exception | None = None
        for _ in range(MAX_RETRIES + 1):
            try:
                lesson = self._provider.generate_lesson(
                    image_bytes=image_bytes,
                    filename=filename,
                    depth=depth,
                    subject=subject,
                )
                return Lesson.model_validate(lesson.model_dump())
            except ValidationError as exc:
                last_error = exc
                continue
        raise AppError(
            "LESSON_INVALID",
            "The teaching engine returned a lesson that failed schema validation.",
            502,
        ) from last_error
