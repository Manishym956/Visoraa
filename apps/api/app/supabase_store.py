"""
Supabase-backed store — drop-in replacement for LessonStore.

Implements the exact same public interface so routers / orchestrator
need no changes. Falls back gracefully: if the Supabase client raises,
errors propagate as AppError(502).

Lessons are cached in memory after first load (like the SQLite store)
but also persisted to the `lessons` table so they survive server restarts.
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import timedelta
from threading import Lock
from uuid import uuid4

from supabase import Client, create_client

from app.models import AttemptResponse, Lesson, PracticeQuestion, ProgressConcept, utcnow

CORRECT_DELTA = 0.15
WRONG_DELTA   = 0.20
DEFAULT_MASTERY = 0.5


def _review_interval_days(mastery: float) -> int:
    mastery = max(0.01, min(0.99, mastery))
    return min(14, math.ceil(1.0 / (1.0 - mastery)))


class SupabaseStore:
    """All persistence routed through the Supabase REST API (PostgREST)."""

    def __init__(self, url: str, key: str) -> None:
        self._client: Client = create_client(url, key)
        self._lessons: dict[str, Lesson] = {}   # memory cache
        self._lock = Lock()

    # ── Lessons ──────────────────────────────────────────────────────────────

    def save_lesson(self, lesson: Lesson, subject: str | None = None) -> str:
        lesson_id = str(uuid4())
        with self._lock:
            self._lessons[lesson_id] = lesson
            self._client.table("lessons").insert(
                {
                    "lesson_id": lesson_id,
                    "lesson_data": lesson.model_dump(mode="json"),
                    "subject": subject,
                }
            ).execute()
            for question in lesson.questions:
                self._client.table("concepts").upsert(
                    {
                        "lesson_id": lesson_id,
                        "name": question.conceptName,
                        "subject": subject,
                        "mastery_score": DEFAULT_MASTERY,
                    },
                    on_conflict="lesson_id,name",
                ).execute()
        return lesson_id

    def get_lesson(self, lesson_id: str) -> Lesson | None:
        with self._lock:
            if lesson_id in self._lessons:
                return self._lessons[lesson_id]
            resp = (
                self._client.table("lessons")
                .select("lesson_data")
                .eq("lesson_id", lesson_id)
                .maybe_single()
                .execute()
            )
            if not resp.data:
                return None
            lesson = Lesson.model_validate(resp.data["lesson_data"])
            self._lessons[lesson_id] = lesson
            return lesson

    def get_question(self, lesson_id: str, question_id: str) -> PracticeQuestion | None:
        lesson = self.get_lesson(lesson_id)
        if lesson is None:
            return None
        for q in lesson.questions:
            if q.id == question_id:
                return q
        return None

    # ── Mastery history ───────────────────────────────────────────────────────

    def get_mastery_scores(self, lesson_id: str, concept_name: str) -> list[float]:
        resp = (
            self._client.table("mastery_history")
            .select("mastery_score")
            .eq("lesson_id", lesson_id)
            .eq("concept_name", concept_name)
            .order("recorded_at")
            .execute()
        )
        return [float(r["mastery_score"]) for r in (resp.data or [])]

    # ── Attempts ──────────────────────────────────────────────────────────────

    def record_attempt(
        self,
        lesson_id: str,
        question: PracticeQuestion,
        selected_answer: str,
        is_correct: bool,
    ) -> AttemptResponse:
        now = utcnow()
        now_iso = now.isoformat()

        # Fetch current mastery
        resp = (
            self._client.table("concepts")
            .select("mastery_score")
            .eq("lesson_id", lesson_id)
            .eq("name", question.conceptName)
            .maybe_single()
            .execute()
        )
        score = float(resp.data["mastery_score"]) if resp.data else DEFAULT_MASTERY

        score = min(1.0, score + CORRECT_DELTA) if is_correct else max(0.0, score - WRONG_DELTA)
        interval = _review_interval_days(score)
        due_date = (now + timedelta(days=interval)).date().isoformat()

        with self._lock:
            # Record the attempt event
            self._client.table("attempts").insert(
                {
                    "id": str(uuid4()),
                    "question_id": question.id,
                    "selected_answer": selected_answer,
                    "is_correct": is_correct,
                    "created_at": now_iso,
                }
            ).execute()

            # Upsert concept mastery + due date
            self._client.table("concepts").upsert(
                {
                    "lesson_id": lesson_id,
                    "name": question.conceptName,
                    "mastery_score": score,
                    "last_practiced_at": now_iso,
                    "due_date": due_date,
                },
                on_conflict="lesson_id,name",
            ).execute()

            # Append mastery history row
            self._client.table("mastery_history").insert(
                {
                    "lesson_id": lesson_id,
                    "concept_name": question.conceptName,
                    "mastery_score": score,
                    "recorded_at": now_iso,
                }
            ).execute()

        return AttemptResponse(
            questionId=question.id,
            selectedAnswer=selected_answer,
            isCorrect=is_correct,
            explanation=question.explanation,
            masteryScore=score,
        )

    # ── Progress ──────────────────────────────────────────────────────────────

    def progress(self, subject: str | None = None) -> list[ProgressConcept]:
        query = self._client.table("concepts").select(
            "name,mastery_score,last_practiced_at,subject"
        )
        if subject:
            query = query.eq("subject", subject)
        resp = query.execute()
        return _aggregate_concepts(resp.data or [])

    # ── Review ────────────────────────────────────────────────────────────────

    def review_due(self, today: str | None = None) -> list[ProgressConcept]:
        today = today or utcnow().date().isoformat()
        resp = (
            self._client.table("concepts")
            .select("name,mastery_score,last_practiced_at")
            .lte("due_date", today)
            .not_.is_("due_date", "null")
            .execute()
        )
        return _aggregate_concepts(resp.data or [])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _aggregate_concepts(rows: list[dict]) -> list[ProgressConcept]:
    """Group by concept name and average mastery_score across lessons."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        groups[row["name"]].append(row)

    result = []
    for name, group in groups.items():
        avg_mastery = sum(r["mastery_score"] for r in group) / len(group)
        last = max(
            (r["last_practiced_at"] for r in group if r.get("last_practiced_at")),
            default=None,
        )
        result.append(
            ProgressConcept(
                name=name,
                masteryScore=round(avg_mastery, 4),
                lastPracticedAt=last,
            )
        )

    return sorted(result, key=lambda c: c.masteryScore)
