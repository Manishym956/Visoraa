export type Depth = "beginner" | "standard" | "advanced";
export type ContentType = "equation" | "diagram" | "text" | "graph" | "mixed";

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
  kind: "equation_breakdown" | "flowchart" | "graph" | "concept_map";
  title: string;
  caption?: string;
  nodes: VisualNode[];
  edges?: VisualEdge[];
  annotations?: VisualAnnotation[];
}

export interface PracticeQuestion {
  id: string;
  conceptName: string;
  kind: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  hint: string;
  explanation: string;
  difficulty: string;
}

export interface Lesson {
  title: string;
  contentType: ContentType;
  summary: string;
  intuition: string;
  steps: string[];
  technicalDetails: string[];
  workedExample: { prompt: string; solution: string };
  visual: VisualSpec;
  commonMistakes: string[];
  questions: PracticeQuestion[];
  confidence: number;
  evidence: string[];
  sourceExtraction?: Record<string, unknown> | null;
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

export interface ReviewConcept {
  name: string;
  masteryScore: number;
  lastPracticedAt: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string };
}

export function layersForDepth(lesson: Lesson, depth: Depth): {
  steps: string[];
  technicalDetails: string[];
  showWorkedExample: boolean;
  showMistakes: boolean;
} {
  if (depth === "beginner") {
    return {
      steps: lesson.steps.slice(0, 3),
      technicalDetails: [],
      showWorkedExample: true,
      showMistakes: false,
    };
  }
  if (depth === "standard") {
    return {
      steps: lesson.steps,
      technicalDetails: lesson.technicalDetails.slice(0, 1),
      showWorkedExample: true,
      showMistakes: true,
    };
  }
  return {
    steps: lesson.steps,
    technicalDetails: lesson.technicalDetails,
    showWorkedExample: true,
    showMistakes: true,
  };
}

export function isLowConfidence(confidence: number): boolean {
  return confidence < 0.75;
}
