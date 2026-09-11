from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.models import Depth, Lesson
from app.providers.mock import MockLessonProvider

CASES_PATH = Path(__file__).resolve().parents[1] / "eval" / "cases.json"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _cases() -> list[dict]:
    return json.loads(CASES_PATH.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", _cases(), ids=lambda c: c["id"])
def test_eval_case_mock_provider(case: dict) -> None:
    provider = MockLessonProvider()
    lesson = provider.generate_lesson(
        image_bytes=PNG,
        filename=case["filename"],
        depth=Depth.standard,
        subject=None,
    )
    validated = Lesson.model_validate(lesson.model_dump(by_alias=True))
    assert validated.contentType.value == case["expectedContentType"]
    assert validated.confidence >= case["minConfidence"]
    assert len(validated.questions) >= case["minQuestions"]
    assert validated.visual.kind
    assert validated.evidence
    assert validated.intuition
