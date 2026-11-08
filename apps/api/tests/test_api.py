from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.errors import AppError
from app.image_validation import validate_image
from app.main import create_app
from app.models import PracticeQuestion, QuestionKind
from app.scoring import score_attempt, select_practice

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture()
def client(tmp_path, monkeypatch):
    # Always use mock provider in tests — never hit a live API regardless of env
    monkeypatch.setenv("VL_PROVIDER", "mock")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_KEY", raising=False)
    app = create_app(tmp_path / "test.db")
    return TestClient(app)


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "provider" in body


def test_invalid_image(client: TestClient) -> None:
    files = {"image": ("notes.txt", b"not-an-image", "text/plain")}
    response = client.post("/api/v1/lessons", files=files)
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "INVALID_IMAGE"
    assert "requestId" in body["error"]


def test_tiny_image_rejected() -> None:
    try:
        validate_image(b"x", "image/png", "x.png")
    except AppError as exc:
        assert exc.code == "INVALID_IMAGE"
        return
    raise AssertionError("expected AppError")


def test_create_lesson_and_tutor(client: TestClient) -> None:
    files = {"image": ("page-equation.png", PNG, "image/png")}
    data = {"preferredDepth": "beginner"}
    response = client.post("/api/v1/lessons", files=files, data=data)
    assert response.status_code == 200
    payload = response.json()
    lesson_id = payload["lessonId"]
    assert payload["lesson"]["contentType"] == "equation"
    assert payload["lesson"]["confidence"] > 0
    asked = client.post(
        f"/api/v1/lessons/{lesson_id}/questions",
        json={"question": "Explain simpler"},
    )
    assert asked.status_code == 200
    answer = asked.json()["answer"]
    assert len(answer) > 0


def test_unknown_lesson(client: TestClient) -> None:
    response = client.post(
        "/api/v1/lessons/missing/questions",
        json={"question": "Why?"},
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_practice_attempt_progress(client: TestClient) -> None:
    files = {"image": ("diagram-flow.png", PNG, "image/png")}
    created = client.post("/api/v1/lessons", files=files)
    lesson_id = created.json()["lessonId"]
    practice = client.post(
        f"/api/v1/lessons/{lesson_id}/practice",
        json={"count": 3, "difficulty": "adaptive"},
    )
    assert practice.status_code == 200
    question = practice.json()["questions"][0]
    wrong = question["choices"][0]
    if question["choices"].index(wrong) == question["correctIndex"]:
        wrong = question["choices"][1]
    attempt = client.post(
        f"/api/v1/lessons/{lesson_id}/attempts",
        json={"questionId": question["id"], "selectedAnswer": wrong},
    )
    assert attempt.status_code == 200
    assert attempt.json()["isCorrect"] is False
    progress = client.get("/api/v1/progress")
    assert progress.status_code == 200
    names = [c["name"] for c in progress.json()["concepts"]]
    assert question["conceptName"] in names
    assert progress.json()["concepts"][0]["masteryScore"] <= 0.5


def test_score_attempt() -> None:
    question = PracticeQuestion(
        id="t",
        conceptName="c",
        kind=QuestionKind.conceptual,
        prompt="p",
        choices=["a", "b"],
        correctIndex=1,
        hint="h",
        explanation="e",
        difficulty="easy",
    )
    assert score_attempt(question, "b") is True
    assert score_attempt(question, "a") is False


def test_select_practice_caps() -> None:
    questions = [
        PracticeQuestion(
            id=str(i),
            conceptName="c",
            kind=QuestionKind.conceptual,
            prompt="p",
            choices=["a", "b"],
            correctIndex=0,
            hint="h",
            explanation="e",
            difficulty="hard" if i else "easy",
        )
        for i in range(4)
    ]
    picked = select_practice(questions, 3)
    assert len(picked) == 3
    assert picked[0].difficulty == "easy"
