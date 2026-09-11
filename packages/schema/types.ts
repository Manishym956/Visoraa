export type ContentType = "equation" | "diagram" | "text" | "graph" | "mixed";
export type Depth = "beginner" | "standard" | "advanced";
export type VisualKind =
  | "equation_breakdown"
  | "flowchart"
  | "graph"
  | "concept_map";
export type QuestionKind =
  | "conceptual"
  | "application"
  | "calculation"
  | "misconception";

export interface VisualNode {
  id: string;
  label: string;
  detail?: string;
}

export interface VisualEdge {
  from: string;
  to: string;
  label?: string;
}

export interface VisualAnnotation {
  id: string;
  label: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface VisualSpec {
  kind: VisualKind;
  title: string;
  caption?: string;
  nodes: VisualNode[];
  edges?: VisualEdge[];
  annotations?: VisualAnnotation[];
}

export interface WorkedExample {
  prompt: string;
  solution: string;
}

export interface PracticeQuestion {
  id: string;
  conceptName: string;
  kind: QuestionKind;
  prompt: string;
  choices: string[];
  correctIndex: number;
  hint: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface Lesson {
  title: string;
  contentType: ContentType;
  summary: string;
  intuition: string;
  steps: string[];
  technicalDetails: string[];
  workedExample: WorkedExample;
  visual: VisualSpec;
  commonMistakes: string[];
  questions: PracticeQuestion[];
  confidence: number;
  evidence: string[];
}

export interface LessonResponse {
  lessonId: string;
  lesson: Lesson;
}

export interface TutorResponse {
  answer: string;
  references: string[];
  confidence: number;
}

export interface ProgressConcept {
  name: string;
  masteryScore: number;
  lastPracticedAt: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
