from __future__ import annotations

import json
from pathlib import Path

from pydantic import ValidationError

from app.models import Lesson
from app.providers.mock import MockLessonProvider, classify_from_filename
from app.models import Depth

SCHEMA_PATH = (
    Path(__file__).resolve().parents[3] / "packages" / "schema" / "lesson.schema.json"
)


def test_schema_file_exists() -> None:
    assert SCHEMA_PATH.is_file()
    payload = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert payload["title"] == "Lesson"


def test_mock_lessons_match_pydantic() -> None:
    provider = MockLessonProvider()
    for name in (
        "page-equation.png",
        "diagram-flow.png",
        "notes-text.png",
        "plot-graph.png",
        "mix-both.png",
    ):
        lesson = provider.generate_lesson(
            image_bytes=b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,
            filename=name,
            depth=Depth.standard,
            subject=None,
        )
        Lesson.model_validate(lesson.model_dump())


def test_invalid_lesson_rejected() -> None:
    try:
        Lesson.model_validate({"title": "x"})
    except ValidationError:
        return
    raise AssertionError("expected validation error")


def test_classify_filename() -> None:
    assert classify_from_filename("hw-diagram.jpg").value == "diagram"
    assert classify_from_filename("slope-graph.png").value == "graph"
    assert classify_from_filename("photo.jpg").value == "equation"
