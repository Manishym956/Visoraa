from __future__ import annotations

from app.models import PracticeQuestion


def score_attempt(question: PracticeQuestion, selected_answer: str) -> bool:
    if not question.choices:
        return False
    index = question.correctIndex
    if index < 0 or index >= len(question.choices):
        return False
    correct = question.choices[index]
    return selected_answer.strip() == correct.strip()


def select_practice(
    questions: list[PracticeQuestion],
    count: int,
    mastery_scores: list[float] | None = None,
) -> list[PracticeQuestion]:
    """Return `count` questions ordered by adaptive difficulty.

    If mastery_scores (historical scores for this concept/lesson, oldest-first)
    are provided, the target difficulty rises with the trend:
    - Upward trend or high current mastery (>= 0.7) → prefer harder questions
    - Downward trend or low mastery (< 0.4)          → prefer easier questions
    - Otherwise                                       → stable: easy → medium → hard

    Without history, falls back to the previous easy-first order.
    """
    if count >= len(questions):
        return list(questions)

    difficulty_order = _difficulty_order(mastery_scores)
    ranked = sorted(questions, key=lambda q: difficulty_order.get(q.difficulty, 1))
    return ranked[:count]


def _difficulty_order(mastery_scores: list[float] | None) -> dict[str, int]:
    """Return a sort key mapping difficulty → int (lower = picked first)."""
    if not mastery_scores:
        # Default: easy first, as before
        return {"easy": 0, "medium": 1, "hard": 2}

    current = mastery_scores[-1]
    trend = mastery_scores[-1] - mastery_scores[0] if len(mastery_scores) > 1 else 0.0

    if current >= 0.7 or trend > 0.1:
        # Learner is doing well or improving — push harder
        return {"hard": 0, "medium": 1, "easy": 2}
    if current < 0.4 or trend < -0.1:
        # Struggling or declining — stay easy to rebuild confidence
        return {"easy": 0, "medium": 1, "hard": 2}
    # Stable mid-range — standard progression
    return {"easy": 0, "medium": 1, "hard": 2}
