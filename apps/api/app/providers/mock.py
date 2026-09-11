from __future__ import annotations

from app.models import (
    ContentType,
    Depth,
    Lesson,
    PracticeQuestion,
    QuestionKind,
    VisualAnnotation,
    VisualEdge,
    VisualKind,
    VisualNode,
    VisualSpec,
    WorkedExample,
)
from app.providers.base import LessonProvider


def classify_from_filename(filename: str | None) -> ContentType:
    name = (filename or "").lower()
    if "diagram" in name or "flow" in name:
        return ContentType.diagram
    if "graph" in name or "plot" in name:
        return ContentType.graph
    if "text" in name or "paragraph" in name or "notes" in name:
        return ContentType.text
    if "mix" in name:
        return ContentType.mixed
    return ContentType.equation


class MockLessonProvider(LessonProvider):
    def generate_lesson(
        self,
        *,
        image_bytes: bytes,
        filename: str | None,
        depth: Depth,
        subject: str | None,
    ) -> Lesson:
        del image_bytes, subject
        content_type = classify_from_filename(filename)
        lesson = _FIXTURES[content_type]
        if depth is Depth.beginner:
            return lesson.model_copy(
                update={"technicalDetails": lesson.technicalDetails[:1]}
            )
        return lesson

    def answer_question(self, lesson: Lesson, question: str) -> tuple[str, list[str], float]:
        q = question.strip().lower()
        refs = [lesson.title, *lesson.evidence[:2]]
        if "simpler" in q or "eli5" in q:
            return (lesson.intuition, refs, min(lesson.confidence, 0.93))
        if "example" in q:
            example = lesson.workedExample
            return (
                f"{example.prompt} {example.solution}",
                refs,
                lesson.confidence,
            )
        if "math" in q or "show the math" in q:
            details = " ".join(lesson.technicalDetails) or lesson.steps[-1]
            return (details, refs, lesson.confidence)
        if "quiz" in q:
            first = lesson.questions[0]
            return (
                f"Try this: {first.prompt}",
                [first.id],
                lesson.confidence,
            )
        if len(q) < 8:
            return (
                "That question is too thin to answer from the captured artifact. "
                "Ask about a specific symbol, step, or region in the image.",
                lesson.evidence[:1],
                0.35,
            )
        return (
            f"{lesson.summary} From the extracted evidence: {lesson.evidence[0]}",
            refs,
            max(0.4, lesson.confidence - 0.05),
        )


def _q(
    qid: str,
    concept: str,
    kind: QuestionKind,
    prompt: str,
    choices: list[str],
    correct: int,
    hint: str,
    explanation: str,
    difficulty: str,
) -> PracticeQuestion:
    return PracticeQuestion(
        id=qid,
        conceptName=concept,
        kind=kind,
        prompt=prompt,
        choices=choices,
        correctIndex=correct,
        hint=hint,
        explanation=explanation,
        difficulty=difficulty,  # type: ignore[arg-type]
    )


_EQUATION = Lesson(
    title="Derivative of a quadratic",
    contentType=ContentType.equation,
    summary="The image shows d/dx of x squared plus 3x, which simplifies to 2x plus 3.",
    intuition=(
        "A derivative asks how fast the height of a curve changes as you nudge x. "
        "For a bowl-shaped parabola, that rate itself grows in a straight line."
    ),
    steps=[
        "Identify the expression inside the derivative: x² + 3x.",
        "Differentiate term by term: d/dx(x²) = 2x and d/dx(3x) = 3.",
        "Add the pieces: 2x + 3.",
        "The result is a line, not another parabola.",
    ],
    technicalDetails=[
        "Power rule: d/dx(x^n) = n x^{n-1}.",
        "Linearity: d/dx(af + bg) = a f' + b g'.",
        "At x = 0 the slope is 3; the original function is still 0 there.",
    ],
    workedExample=WorkedExample(
        prompt="Evaluate the slope of y = x² + 3x at x = 2.",
        solution="y' = 2x + 3, so y'(2) = 7.",
    ),
    visual=VisualSpec(
        kind=VisualKind.equation_breakdown,
        title="Term-by-term derivative",
        caption="Each piece of the sum is differentiated, then added.",
        nodes=[
            VisualNode(id="expr", label="x² + 3x", detail="original"),
            VisualNode(id="left", label="2x", detail="from x²"),
            VisualNode(id="right", label="3", detail="from 3x"),
            VisualNode(id="sum", label="2x + 3", detail="derivative"),
        ],
        edges=[
            VisualEdge(from_="expr", to="left", label="power rule"),
            VisualEdge(from_="expr", to="right", label="constant multiple"),
            VisualEdge(from_="left", to="sum", label="add"),
            VisualEdge(from_="right", to="sum", label="add"),
        ],
        annotations=[
            VisualAnnotation(id="a1", label="d/dx operator", x=0.05, y=0.2, w=0.18, h=0.2),
            VisualAnnotation(id="a2", label="polynomial body", x=0.28, y=0.25, w=0.5, h=0.25),
        ],
    ),
    commonMistakes=[
        "Forgetting the +3 and writing only 2x.",
        "Treating d/dx(x² + 3x) as (2x + 3x) or 5x.",
        "Dropping the variable and writing the slope as the number 2.",
    ],
    questions=[
        _q(
            "eq-c1",
            "power rule",
            QuestionKind.conceptual,
            "What does 2x + 3 represent for y = x² + 3x?",
            ["The area under the curve", "The slope at each x", "The x-intercept", "The average value"],
            1,
            "Derivative = instantaneous rate of change.",
            "y' is the slope function. At each x it tells you how steep y is.",
            "easy",
        ),
        _q(
            "eq-a1",
            "power rule",
            QuestionKind.application,
            "What is the slope at x = −1?",
            ["1", "−1", "2", "5"],
            0,
            "Plug x into 2x + 3.",
            "2(−1) + 3 = 1.",
            "medium",
        ),
        _q(
            "eq-calc",
            "linearity",
            QuestionKind.calculation,
            "d/dx(x² + 3x) equals",
            ["2x", "2x + 3", "x + 3", "2x + 3x"],
            1,
            "Differentiate each term, then add.",
            "Power rule on x² and on 3x gives 2x + 3.",
            "easy",
        ),
        _q(
            "eq-mis",
            "power rule",
            QuestionKind.misconception,
            "Why is d/dx(x² + 3x) not 2x + 3x?",
            [
                "Because 3x is already a derivative",
                "Because the 3 is a coefficient, not an extra x to keep",
                "Because addition is illegal inside derivatives",
                "Because the power rule only works on one term",
            ],
            1,
            "d/dx(3x) = 3, not 3x.",
            "The extra x would mean you failed to drop the power on the linear term.",
            "medium",
        ),
    ],
    confidence=0.86,
    evidence=[
        "Notation includes d/dx and a polynomial in x.",
        "Two additive terms: a square and a linear term.",
        "No numerical table or plotted axes were required to read the symbols.",
    ],
)

_DIAGRAM = Lesson(
    title="Two-step process flowchart",
    contentType=ContentType.diagram,
    summary="The captured diagram is a left-to-right process: input, transform, output.",
    intuition=(
        "Read a flowchart as a story. Each box is a beat; each arrow is 'and then'. "
        "You only move forward when the previous beat is done."
    ),
    steps=[
        "Start at the leftmost box — that is the input.",
        "Follow the arrow to the process box. Something changes here.",
        "Follow the next arrow to the output. That is the result you keep.",
        "If a diamond appears later, it is a decision, not a step you skip.",
    ],
    technicalDetails=[
        "Boxes are activities; arrows are control flow, not data equality.",
        "MVP renderer treats this as a linear flowchart with three nodes.",
    ],
    workedExample=WorkedExample(
        prompt="Name the three beats in order.",
        solution="Input → Transform → Output.",
    ),
    visual=VisualSpec(
        kind=VisualKind.flowchart,
        title="Process flow",
        caption="Linear path extracted from the diagram.",
        nodes=[
            VisualNode(id="in", label="Input", detail="raw artifact"),
            VisualNode(id="tx", label="Transform", detail="rule applied"),
            VisualNode(id="out", label="Output", detail="result"),
        ],
        edges=[
            VisualEdge(from_="in", to="tx"),
            VisualEdge(from_="tx", to="out"),
        ],
        annotations=[
            VisualAnnotation(id="b1", label="Start box", x=0.08, y=0.35, w=0.22, h=0.25),
            VisualAnnotation(id="b2", label="Process", x=0.38, y=0.35, w=0.22, h=0.25),
            VisualAnnotation(id="b3", label="Result", x=0.68, y=0.35, w=0.22, h=0.25),
        ],
    ),
    commonMistakes=[
        "Reading boxes bottom-to-top when arrows point left-to-right.",
        "Treating every box as happening at the same time.",
    ],
    questions=[
        _q(
            "dg-c1",
            "control flow",
            QuestionKind.conceptual,
            "What does an arrow between boxes mean here?",
            ["The boxes are equal", "Sequence: finish the first, then the next", "Undo", "A formula"],
            1,
            "Arrows are 'and then'.",
            "Control flow is ordered. The transform does not start before input exists.",
            "easy",
        ),
        _q(
            "dg-a1",
            "control flow",
            QuestionKind.application,
            "If the transform fails, which box never produces a valid result?",
            ["Input only", "Output", "The title", "The legend"],
            1,
            "Output depends on a successful transform.",
            "Output is downstream. A failed transform leaves no trusted output.",
            "medium",
        ),
        _q(
            "dg-m1",
            "control flow",
            QuestionKind.misconception,
            "Why is a flowchart not a concept map?",
            [
                "It never has labels",
                "It encodes order and dependency, not just related ideas",
                "It cannot have three boxes",
                "It is always circular",
            ],
            1,
            "Time and sequence matter here.",
            "Concept maps show relations. Flowcharts show an ordered process.",
            "medium",
        ),
        _q(
            "dg-calc",
            "control flow",
            QuestionKind.calculation,
            "How many arrows are in the extracted linear path?",
            ["0", "1", "2", "4"],
            2,
            "Count edges between the three nodes.",
            "Input→Transform and Transform→Output: two arrows.",
            "easy",
        ),
    ],
    confidence=0.74,
    evidence=[
        "Boxes connected by directional arrows.",
        "Three labeled stages in a single path.",
        "No equations were required to parse the layout.",
    ],
)

_TEXT = Lesson(
    title="Dense paragraph: conservation of energy",
    contentType=ContentType.text,
    summary="The page states that energy can change form but the total in a closed system stays the same.",
    intuition=(
        "Think of energy as a budget. You can move money between wallets, "
        "but if nobody enters or leaves the room, the total cash is unchanged."
    ),
    steps=[
        "Identify the system (what is 'inside').",
        "List forms mentioned: kinetic, potential, heat, work.",
        "Apply the claim: losses in one form appear in another.",
        "If the system is not closed, track what crosses the boundary.",
    ],
    technicalDetails=[
        "ΔE_internal = Q − W in many intro thermo conventions.",
        "Mechanical conservation is a special case when non-conservative work is zero.",
    ],
    workedExample=WorkedExample(
        prompt="A ball falls in vacuum. What happens to gravitational potential energy?",
        solution="It converts to kinetic energy; the sum stays constant.",
    ),
    visual=VisualSpec(
        kind=VisualKind.concept_map,
        title="Energy ideas in the paragraph",
        nodes=[
            VisualNode(id="energy", label="Energy", detail="budget"),
            VisualNode(id="forms", label="Forms", detail="KE, PE, heat"),
            VisualNode(id="closed", label="Closed system", detail="nothing leaves"),
            VisualNode(id="conserve", label="Conserved total", detail="sum constant"),
        ],
        edges=[
            VisualEdge(from_="energy", to="forms", label="can be"),
            VisualEdge(from_="energy", to="closed", label="if"),
            VisualEdge(from_="closed", to="conserve", label="then"),
        ],
    ),
    commonMistakes=[
        "Saying energy is 'used up' when it became heat.",
        "Applying conservation to an open system without tracking transfers.",
    ],
    questions=[
        _q(
            "tx-c1",
            "conservation of energy",
            QuestionKind.conceptual,
            "In a closed system, energy is",
            ["Created from nothing", "Destroyed as heat", "Transformed but totaled", "Only kinetic"],
            2,
            "Budget metaphor.",
            "Forms change; the total does not, if nothing crosses the boundary.",
            "easy",
        ),
        _q(
            "tx-a1",
            "conservation of energy",
            QuestionKind.application,
            "A falling ball in vacuum mainly converts",
            ["PE → KE", "KE → mass", "Heat → PE", "Work → charge"],
            0,
            "Height is potential.",
            "Loss of height is loss of PE and gain of KE.",
            "medium",
        ),
        _q(
            "tx-m1",
            "conservation of energy",
            QuestionKind.misconception,
            "Why is 'the energy was used up' usually wrong here?",
            [
                "Energy cannot become heat",
                "It likely changed form rather than vanished",
                "Closed systems create energy",
                "Textbooks forbid the word heat",
            ],
            1,
            "Look for a destination form.",
            "Friction and heat are still energy. The accounting moved wallets.",
            "medium",
        ),
        _q(
            "tx-calc",
            "conservation of energy",
            QuestionKind.calculation,
            "If PE drops by 10 J and no heat leaves, KE rises by",
            ["0 J", "5 J", "10 J", "20 J"],
            2,
            "Total constant.",
            "ΔPE + ΔKE = 0 ⇒ ΔKE = +10 J.",
            "easy",
        ),
    ],
    confidence=0.81,
    evidence=[
        "Sentences mention energy, forms, and a closed system.",
        "No derivative symbols were visible in the extracted text.",
    ],
)

_GRAPH = Lesson(
    title="Increasing linear graph",
    contentType=ContentType.graph,
    summary="The captured plot is a straight line with positive slope through a labeled origin.",
    intuition=(
        "A straight line means a constant rate. Every step right, you rise by the same amount. "
        "That amount is the slope."
    ),
    steps=[
        "Confirm the axes: x horizontal, y vertical, origin labeled.",
        "Pick two readable points.",
        "Slope = rise/run between those points.",
        "If the line is straight, that slope is the same everywhere.",
    ],
    technicalDetails=[
        "Equation form y = mx + b. Positive m matches an up-right line.",
        "The derivative of a linear function is the constant m.",
    ],
    workedExample=WorkedExample(
        prompt="Points (0, 1) and (2, 5). What is m?",
        solution="(5 − 1)/(2 − 0) = 2. So y = 2x + 1.",
    ),
    visual=VisualSpec(
        kind=VisualKind.graph,
        title="Slope from two points",
        caption="Rise over run on a straight line.",
        nodes=[
            VisualNode(id="p1", label="(0, 1)", detail="intercept"),
            VisualNode(id="p2", label="(2, 5)", detail="second point"),
            VisualNode(id="m", label="m = 2", detail="rise/run"),
        ],
        edges=[
            VisualEdge(from_="p1", to="p2", label="run 2, rise 4"),
            VisualEdge(from_="p2", to="m", label="4/2"),
        ],
    ),
    commonMistakes=[
        "Inverting rise and run.",
        "Assuming a curve is linear because it 'looks steep'.",
    ],
    questions=[
        _q(
            "gr-c1",
            "slope",
            QuestionKind.conceptual,
            "A straight line on a y-vs-x plot means",
            ["Slope changes", "Constant rate of change", "Zero area", "No intercept"],
            1,
            "Straight = constant slope.",
            "m is the same between any pair of points on the line.",
            "easy",
        ),
        _q(
            "gr-a1",
            "slope",
            QuestionKind.application,
            "From (0, 1) to (2, 5), slope is",
            ["1/2", "2", "4", "5"],
            1,
            "Rise over run.",
            "Rise 4, run 2 → 2.",
            "easy",
        ),
        _q(
            "gr-calc",
            "slope",
            QuestionKind.calculation,
            "If m = 2 and b = 1, y(3) is",
            ["5", "6", "7", "8"],
            2,
            "y = mx + b.",
            "2·3 + 1 = 7.",
            "medium",
        ),
        _q(
            "gr-m1",
            "slope",
            QuestionKind.misconception,
            "Why is slope not 'how high the line is'?",
            [
                "Height is the intercept or a y-value; slope is a rate",
                "Slope is always 1",
                "Graphs cannot show height",
                "Slope only exists at the origin",
            ],
            0,
            "Separate b from m.",
            "A high intercept can still have a small slope.",
            "medium",
        ),
    ],
    confidence=0.79,
    evidence=[
        "Axes with an origin marker.",
        "A single straight stroke with positive tilt.",
        "Two sample points can be read from the mock visual spec.",
    ],
)

_MIXED = _EQUATION.model_copy(
    update={
        "contentType": ContentType.mixed,
        "title": "Equation beside a small sketch",
        "summary": "Mixed artifact: the derivative equation is primary; a tiny slope sketch supports it.",
        "confidence": 0.68,
        "evidence": [
            *_EQUATION.evidence,
            "A small line sketch appears next to the symbols (supporting, not primary).",
        ],
    }
)

_FIXTURES: dict[ContentType, Lesson] = {
    ContentType.equation: _EQUATION,
    ContentType.diagram: _DIAGRAM,
    ContentType.text: _TEXT,
    ContentType.graph: _GRAPH,
    ContentType.mixed: _MIXED,
}
