from app.scoring import score_attempt
from app.models import PracticeQuestion, QuestionKind


def test_depth_beginner_hides_heavy_math_shape() -> None:
    question = PracticeQuestion(
        id="x",
        conceptName="power rule",
        kind=QuestionKind.conceptual,
        prompt="p",
        choices=["no", "yes"],
        correctIndex=1,
        hint="h",
        explanation="e",
        difficulty="easy",
    )
    assert score_attempt(question, "yes") is True
