from datetime import datetime, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ContentType(str, Enum):
    equation = "equation"
    diagram = "diagram"
    text = "text"
    graph = "graph"
    mixed = "mixed"


class Depth(str, Enum):
    beginner = "beginner"
    standard = "standard"
    advanced = "advanced"


class VisualKind(str, Enum):
    equation_breakdown = "equation_breakdown"
    flowchart = "flowchart"
    graph = "graph"
    concept_map = "concept_map"


class QuestionKind(str, Enum):
    conceptual = "conceptual"
    application = "application"
    calculation = "calculation"
    misconception = "misconception"


class VisualNode(BaseModel):
    id: str
    label: str
    detail: str | None = None


class VisualEdge(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    from_: str = Field(alias="from", serialization_alias="from")
    to: str
    label: str | None = None


class VisualAnnotation(BaseModel):
    """Normalized region label on the source image (0–1 coords when present)."""

    id: str
    label: str
    x: float | None = Field(default=None, ge=0, le=1)
    y: float | None = Field(default=None, ge=0, le=1)
    w: float | None = Field(default=None, ge=0, le=1)
    h: float | None = Field(default=None, ge=0, le=1)


class VisualSpec(BaseModel):
    kind: VisualKind
    title: str
    caption: str | None = None
    nodes: list[VisualNode]
    edges: list[VisualEdge] = Field(default_factory=list)
    annotations: list[VisualAnnotation] = Field(default_factory=list)


class WorkedExample(BaseModel):
    prompt: str
    solution: str


class PracticeQuestion(BaseModel):
    id: str
    conceptName: str
    kind: QuestionKind
    prompt: str
    choices: list[str] = Field(min_length=2)
    correctIndex: int = Field(ge=0)
    hint: str
    explanation: str
    difficulty: Literal["easy", "medium", "hard"]


class Lesson(BaseModel):
    title: str
    contentType: ContentType
    summary: str
    intuition: str
    steps: list[str]
    technicalDetails: list[str]
    workedExample: WorkedExample
    visual: VisualSpec
    commonMistakes: list[str]
    questions: list[PracticeQuestion]
    confidence: float = Field(ge=0, le=1)
    evidence: list[str]


class LessonCreateResponse(BaseModel):
    lessonId: str
    lesson: Lesson


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1)


class TutorResponse(BaseModel):
    answer: str
    references: list[str]
    confidence: float = Field(ge=0, le=1)


class PracticeRequest(BaseModel):
    count: int = Field(default=4, ge=3, le=5)
    difficulty: Literal["adaptive"] = "adaptive"


class PracticeResponse(BaseModel):
    questions: list[PracticeQuestion]


class AttemptRequest(BaseModel):
    questionId: str
    selectedAnswer: str
    isCorrect: bool | None = None


class AttemptResponse(BaseModel):
    questionId: str
    selectedAnswer: str
    isCorrect: bool
    explanation: str
    masteryScore: float


class ProgressConcept(BaseModel):
    name: str
    masteryScore: float
    lastPracticedAt: datetime | None = None


class ProgressResponse(BaseModel):
    concepts: list[ProgressConcept]


class ReviewConcept(BaseModel):
    name: str
    masteryScore: float
    lastPracticedAt: datetime | None = None


class ReviewResponse(BaseModel):
    concepts: list[ReviewConcept]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
