from __future__ import annotations

from app.models import Depth, Lesson
from app.providers.base import LessonProvider
from app.providers.gemini_provider import GeminiLessonProvider
from app.providers.openai_provider import OpenAILessonProvider


class PipelineLessonProvider(LessonProvider):
    """Multi-LLM pipeline, routed by output size.

    1. extract (Groq vision): image → compact features (short output, fits Groq's token limit)
    2. teach   (Gemini text): features → full lesson (long output)
    3. tutor   (Groq):        lesson + features → short answer

    The features ride along on the lesson as `sourceExtraction`, so they are stored with it
    (Supabase lessons.lesson_data or the in-memory store) and the tutor sees them.
    """

    def __init__(self, *, reader: OpenAILessonProvider, teacher: GeminiLessonProvider) -> None:
        self._reader = reader
        self._teacher = teacher

    def generate_lesson(
        self,
        *,
        image_bytes: bytes,
        filename: str | None,
        depth: Depth,
        subject: str | None,
    ) -> Lesson:
        features = self._reader.extract_features(image_bytes=image_bytes, filename=filename)
        lesson = self._teacher.generate_lesson_from_extraction(
            extraction=features, depth=depth, subject=subject
        )
        return lesson.model_copy(update={"sourceExtraction": features})

    def answer_question(self, lesson: Lesson, question: str) -> tuple[str, list[str], float]:
        return self._reader.answer_question(lesson, question)
