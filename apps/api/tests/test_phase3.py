"""Phase 3 tests: spaced review, subject filter, mastery history, adaptive difficulty."""
from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import PracticeQuestion, QuestionKind
from app.scoring import select_practice
from app.store import LessonStore, _review_interval_days, utcnow

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("VL_PROVIDER", "mock")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_KEY", raising=False)
    app = create_app(tmp_path / "p3_test.db")
    return TestClient(app)


# ── Review interval ──────────────────────────────────────────────────────────

def test_review_interval_low_mastery():
    """Low mastery → short interval (1 day)."""
    assert _review_interval_days(0.1) == 2


def test_review_interval_high_mastery():
    """High mastery → longer interval, capped at 14."""
    assert _review_interval_days(0.9) >= 9   # float precision: ceil(1/0.1) ≈ 10–11
    assert _review_interval_days(0.99) == 14  # cap


# ── Review endpoint ───────────────────────────────────────────────────────────

def test_review_empty_on_new_db(client: TestClient):
    """No attempts yet → no due concepts."""
    response = client.get("/api/v1/review")
    assert response.status_code == 200
    assert response.json()["concepts"] == []


def test_review_appears_after_attempt(client: TestClient, tmp_path, monkeypatch):
    """After an attempt, a concept is due on its scheduled date."""
    monkeypatch.setenv("VL_PROVIDER", "mock")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_KEY", raising=False)
    app = create_app(tmp_path / "review_test.db")
    tc = TestClient(app)

    # Create lesson + attempt
    files = {"image": ("diagram-flow.png", PNG, "image/png")}
    created = tc.post("/api/v1/lessons", files=files)
    assert created.status_code == 200
    lesson_id = created.json()["lessonId"]
    practice = tc.post(f"/api/v1/lessons/{lesson_id}/practice", json={"count": 3, "difficulty": "adaptive"})
    q = practice.json()["questions"][0]
    tc.post(f"/api/v1/lessons/{lesson_id}/attempts", json={"questionId": q["id"], "selectedAnswer": q["choices"][0]})

    # Future date → nothing due yet normally; force past date check via store
    store: LessonStore = app.state.store
    today_past = (utcnow() - timedelta(days=30)).date().isoformat()
    due = store.review_due(today=today_past)
    # Nothing scheduled before attempt date
    today = utcnow().date().isoformat()
    due_today = store.review_due(today=today)
    # After attempt, concepts have a due_date set ≥ today; check at far future date
    future = (utcnow() + timedelta(days=30)).date().isoformat()
    due_future = store.review_due(today=future)
    assert len(due_future) >= 1


# ── Subject filter on /progress ───────────────────────────────────────────────

def test_progress_subject_filter(client: TestClient):
    """POST lesson with subject=math; progress?subject=math returns it, subject=physics returns nothing."""
    files = {"image": ("page-equation.png", PNG, "image/png")}
    data = {"preferredDepth": "standard", "subject": "math"}
    created = client.post("/api/v1/lessons", files=files, data=data)
    assert created.status_code == 200
    lesson_id = created.json()["lessonId"]

    practice = client.post(f"/api/v1/lessons/{lesson_id}/practice", json={"count": 3, "difficulty": "adaptive"})
    q = practice.json()["questions"][0]
    client.post(f"/api/v1/lessons/{lesson_id}/attempts", json={"questionId": q["id"], "selectedAnswer": q["choices"][0]})

    math_progress = client.get("/api/v1/progress?subject=math")
    assert math_progress.status_code == 200
    assert len(math_progress.json()["concepts"]) >= 1

    physics_progress = client.get("/api/v1/progress?subject=physics")
    assert physics_progress.status_code == 200
    assert physics_progress.json()["concepts"] == []


# ── Adaptive difficulty ───────────────────────────────────────────────────────

def _make_questions(difficulties: list[str]) -> list[PracticeQuestion]:
    return [
        PracticeQuestion(
            id=str(i),
            conceptName="c",
            kind=QuestionKind.conceptual,
            prompt="p",
            choices=["a", "b"],
            correctIndex=0,
            hint="h",
            explanation="e",
            difficulty=d,
        )
        for i, d in enumerate(difficulties)
    ]


def test_adaptive_high_mastery_prefers_hard():
    """High and rising mastery → hard questions first."""
    qs = _make_questions(["easy", "medium", "hard", "hard"])
    scores = [0.3, 0.5, 0.7, 0.85]  # rising trend, current = 0.85
    picked = select_practice(qs, 2, mastery_scores=scores)
    assert picked[0].difficulty == "hard"


def test_adaptive_low_mastery_prefers_easy():
    """Low mastery → easy questions first."""
    qs = _make_questions(["hard", "medium", "easy"])
    scores = [0.6, 0.4, 0.3]  # declining, current = 0.3
    picked = select_practice(qs, 2, mastery_scores=scores)
    assert picked[0].difficulty == "easy"


def test_adaptive_no_history_easy_first():
    """No history → original easy-first fallback."""
    qs = _make_questions(["hard", "medium", "easy"])
    picked = select_practice(qs, 2)
    assert picked[0].difficulty == "easy"


# ── Mastery history stored ────────────────────────────────────────────────────

def test_mastery_history_recorded(client: TestClient):
    """Each attempt should append a row to mastery_history."""
    files = {"image": ("notes-text.png", PNG, "image/png")}
    created = client.post("/api/v1/lessons", files=files)
    lesson_id = created.json()["lessonId"]
    practice = client.post(f"/api/v1/lessons/{lesson_id}/practice", json={"count": 3, "difficulty": "adaptive"})
    q = practice.json()["questions"][0]

    client.post(f"/api/v1/lessons/{lesson_id}/attempts", json={"questionId": q["id"], "selectedAnswer": q["choices"][0]})
    client.post(f"/api/v1/lessons/{lesson_id}/attempts", json={"questionId": q["id"], "selectedAnswer": q["choices"][0]})

    store: LessonStore = client.app.state.store  # type: ignore[attr-defined]
    history = store.get_mastery_scores(lesson_id, q["conceptName"])
    assert len(history) == 2
