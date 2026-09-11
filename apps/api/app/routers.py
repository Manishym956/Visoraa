from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, Query, Request, UploadFile

from app.errors import AppError
from app.models import (
    AttemptRequest,
    AttemptResponse,
    Depth,
    LessonCreateResponse,
    PracticeRequest,
    PracticeResponse,
    ProgressResponse,
    QuestionRequest,
    ReviewResponse,
    TutorResponse,
)
from app.orchestrator import LearningOrchestrator
from app.providers.factory import create_provider
from app.scoring import score_attempt, select_practice

router = APIRouter(prefix="/api/v1")


def _state(request: Request):
    return request.app.state


def _provider_for_request(request: Request, provider_override: str | None):
    """Return the request-scoped provider.

    If the caller passes ?provider=mock, spin up a fresh MockLessonProvider
    for this request only (no env change, no restart required).
    This powers the Settings screen 'offline mode' toggle.
    """
    if provider_override and provider_override.strip().lower() == "mock":
        from app.providers.mock import MockLessonProvider
        return MockLessonProvider()
    return _state(request).provider


@router.post("/lessons", response_model=LessonCreateResponse)
async def create_lesson(
    request: Request,
    image: Annotated[UploadFile, File()],
    preferredDepth: Annotated[Depth, Form()] = Depth.standard,
    subject: Annotated[str | None, Form()] = None,
    provider: Annotated[str | None, Query(description="Override provider for this request")] = None,
) -> LessonCreateResponse:
    content = await image.read()
    active_provider = _provider_for_request(request, provider)
    orchestrator = LearningOrchestrator(active_provider)
    lesson = orchestrator.create_lesson(
        image_bytes=content,
        content_type=image.content_type,
        filename=image.filename,
        depth=preferredDepth,
        subject=subject,
    )
    lesson_id = _state(request).store.save_lesson(lesson, subject=subject)
    return LessonCreateResponse(lessonId=lesson_id, lesson=lesson)


@router.post("/lessons/{lesson_id}/questions", response_model=TutorResponse)
async def ask_question(
    request: Request,
    lesson_id: str,
    body: QuestionRequest,
    provider: Annotated[str | None, Query()] = None,
) -> TutorResponse:
    lesson = _state(request).store.get_lesson(lesson_id)
    if lesson is None:
        raise AppError("NOT_FOUND", "Lesson could not be found.", 404)
    active_provider = _provider_for_request(request, provider)
    answer, references, confidence = active_provider.answer_question(lesson, body.question)
    return TutorResponse(answer=answer, references=references, confidence=confidence)


@router.post("/lessons/{lesson_id}/practice", response_model=PracticeResponse)
async def generate_practice(
    request: Request, lesson_id: str, body: PracticeRequest
) -> PracticeResponse:
    lesson = _state(request).store.get_lesson(lesson_id)
    if lesson is None:
        raise AppError("NOT_FOUND", "Lesson could not be found.", 404)

    # Gather mastery history for the concept with the most history to inform difficulty.
    history: list[float] = []
    for q in lesson.questions:
        scores = _state(request).store.get_mastery_scores(lesson_id, q.conceptName)
        if len(scores) > len(history):
            history = scores

    questions = select_practice(lesson.questions, body.count, mastery_scores=history or None)
    return PracticeResponse(questions=questions)


@router.post("/lessons/{lesson_id}/attempts", response_model=AttemptResponse)
async def record_attempt(
    request: Request, lesson_id: str, body: AttemptRequest
) -> AttemptResponse:
    lesson = _state(request).store.get_lesson(lesson_id)
    if lesson is None:
        raise AppError("NOT_FOUND", "Lesson could not be found.", 404)
    question = _state(request).store.get_question(lesson_id, body.questionId)
    if question is None:
        raise AppError("NOT_FOUND", "Practice question could not be found.", 404)
    is_correct = (
        body.isCorrect
        if body.isCorrect is not None
        else score_attempt(question, body.selectedAnswer)
    )
    return _state(request).store.record_attempt(
        lesson_id, question, body.selectedAnswer, is_correct
    )


@router.get("/progress", response_model=ProgressResponse)
async def progress(
    request: Request,
    subject: Annotated[str | None, Query(description="Filter by subject tag")] = None,
) -> ProgressResponse:
    return ProgressResponse(concepts=_state(request).store.progress(subject=subject))


@router.get("/review", response_model=ReviewResponse)
async def review_due(request: Request) -> ReviewResponse:
    """Return concepts due for spaced review today."""
    concepts = _state(request).store.review_due()
    return ReviewResponse(
        concepts=[
            {"name": c.name, "masteryScore": c.masteryScore, "lastPracticedAt": c.lastPracticedAt}
            for c in concepts
        ]
    )
