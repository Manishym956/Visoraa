from __future__ import annotations

import math
import sqlite3
from datetime import timedelta
from pathlib import Path
from threading import Lock
from uuid import uuid4

from app.models import AttemptResponse, Lesson, PracticeQuestion, ProgressConcept, utcnow

CORRECT_DELTA = 0.15
WRONG_DELTA = 0.2
DEFAULT_MASTERY = 0.5

# Spaced-review: days until a concept is due again, based on mastery band.
# SM-2 simplified: interval = ceil(1 / (1 - mastery)) days, capped at 14.
def _review_interval_days(mastery: float) -> int:
    mastery = max(0.01, min(0.99, mastery))
    return min(14, math.ceil(1.0 / (1.0 - mastery)))


class LessonStore:
    def __init__(self, db_path: Path) -> None:
        self._lessons: dict[str, Lesson] = {}
        self._lock = Lock()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS concepts (
              id INTEGER PRIMARY KEY,
              lesson_id TEXT NOT NULL,
              name TEXT NOT NULL,
              subject TEXT,
              mastery_score REAL NOT NULL,
              last_practiced_at TEXT,
              due_date TEXT,
              UNIQUE(lesson_id, name)
            );
            CREATE TABLE IF NOT EXISTS attempts (
              id TEXT PRIMARY KEY,
              question_id TEXT NOT NULL,
              selected_answer TEXT NOT NULL,
              is_correct INTEGER NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mastery_history (
              id INTEGER PRIMARY KEY,
              lesson_id TEXT NOT NULL,
              concept_name TEXT NOT NULL,
              mastery_score REAL NOT NULL,
              recorded_at TEXT NOT NULL
            );
            """
        )
        # Idempotent column migrations for existing DBs
        for sql in [
            "ALTER TABLE concepts ADD COLUMN subject TEXT",
            "ALTER TABLE concepts ADD COLUMN due_date TEXT",
        ]:
            try:
                self._conn.execute(sql)
            except Exception:
                pass  # Column already exists
        self._conn.commit()

    def save_lesson(self, lesson: Lesson, subject: str | None = None) -> str:
        lesson_id = str(uuid4())
        with self._lock:
            self._lessons[lesson_id] = lesson
            for question in lesson.questions:
                self._conn.execute(
                    """
                    INSERT INTO concepts (lesson_id, name, subject, mastery_score, last_practiced_at, due_date)
                    VALUES (?, ?, ?, ?, NULL, NULL)
                    ON CONFLICT(lesson_id, name) DO NOTHING
                    """,
                    (lesson_id, question.conceptName, subject, DEFAULT_MASTERY),
                )
            self._conn.commit()
        return lesson_id

    def get_lesson(self, lesson_id: str) -> Lesson | None:
        with self._lock:
            return self._lessons.get(lesson_id)

    def get_question(self, lesson_id: str, question_id: str) -> PracticeQuestion | None:
        lesson = self.get_lesson(lesson_id)
        if lesson is None:
            return None
        for question in lesson.questions:
            if question.id == question_id:
                return question
        return None

    def get_mastery_scores(self, lesson_id: str, concept_name: str) -> list[float]:
        """Return all historical mastery scores for a concept, oldest first."""
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT mastery_score FROM mastery_history
                WHERE lesson_id = ? AND concept_name = ?
                ORDER BY recorded_at ASC
                """,
                (lesson_id, concept_name),
            ).fetchall()
        return [float(r["mastery_score"]) for r in rows]

    def record_attempt(
        self,
        lesson_id: str,
        question: PracticeQuestion,
        selected_answer: str,
        is_correct: bool,
    ) -> AttemptResponse:
        now = utcnow()
        now_iso = now.isoformat()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO attempts (id, question_id, selected_answer, is_correct, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (str(uuid4()), question.id, selected_answer, int(is_correct), now_iso),
            )
            row = self._conn.execute(
                """
                SELECT mastery_score FROM concepts
                WHERE lesson_id = ? AND name = ?
                """,
                (lesson_id, question.conceptName),
            ).fetchone()
            score = float(row["mastery_score"]) if row else DEFAULT_MASTERY
            if is_correct:
                score = min(1.0, score + CORRECT_DELTA)
            else:
                score = max(0.0, score - WRONG_DELTA)

            # Compute next due date using spaced review interval
            interval = _review_interval_days(score)
            due_date = (now + timedelta(days=interval)).date().isoformat()

            self._conn.execute(
                """
                INSERT INTO concepts (lesson_id, name, mastery_score, last_practiced_at, due_date)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(lesson_id, name) DO UPDATE SET
                  mastery_score = excluded.mastery_score,
                  last_practiced_at = excluded.last_practiced_at,
                  due_date = excluded.due_date
                """,
                (lesson_id, question.conceptName, score, now_iso, due_date),
            )
            # Record history entry
            self._conn.execute(
                """
                INSERT INTO mastery_history (lesson_id, concept_name, mastery_score, recorded_at)
                VALUES (?, ?, ?, ?)
                """,
                (lesson_id, question.conceptName, score, now_iso),
            )
            self._conn.commit()
        return AttemptResponse(
            questionId=question.id,
            selectedAnswer=selected_answer,
            isCorrect=is_correct,
            explanation=question.explanation,
            masteryScore=score,
        )

    def progress(self, subject: str | None = None) -> list[ProgressConcept]:
        with self._lock:
            if subject:
                rows = self._conn.execute(
                    """
                    SELECT name, AVG(mastery_score) AS mastery_score, MAX(last_practiced_at) AS last_practiced_at
                    FROM concepts
                    WHERE subject = ?
                    GROUP BY name
                    ORDER BY mastery_score ASC, name ASC
                    """,
                    (subject,),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    """
                    SELECT name, AVG(mastery_score) AS mastery_score, MAX(last_practiced_at) AS last_practiced_at
                    FROM concepts
                    GROUP BY name
                    ORDER BY mastery_score ASC, name ASC
                    """
                ).fetchall()
        return [
            ProgressConcept(
                name=row["name"],
                masteryScore=round(float(row["mastery_score"]), 4),
                lastPracticedAt=row["last_practiced_at"],
            )
            for row in rows
        ]

    def review_due(self, today: str | None = None) -> list[ProgressConcept]:
        """Return concepts whose due_date is today or in the past (needs review)."""
        today = today or utcnow().date().isoformat()
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT name, AVG(mastery_score) AS mastery_score, MAX(last_practiced_at) AS last_practiced_at
                FROM concepts
                WHERE due_date IS NOT NULL AND due_date <= ?
                GROUP BY name
                ORDER BY due_date ASC, mastery_score ASC
                """,
                (today,),
            ).fetchall()
        return [
            ProgressConcept(
                name=row["name"],
                masteryScore=round(float(row["mastery_score"]), 4),
                lastPracticedAt=row["last_practiced_at"],
            )
            for row in rows
        ]
