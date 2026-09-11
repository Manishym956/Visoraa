import type {
  ApiErrorBody,
  Depth,
  LessonResponse,
  PracticeQuestion,
  ProgressConcept,
  ReviewConcept,
  TutorResponse,
} from "./lessonView";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

/** Set to "mock" to force the mock provider on every request (offline demos / Settings screen). */
let _providerOverride: string | null = null;

export function setProviderOverride(value: string | null): void {
  _providerOverride = value;
}

function apiUrl(path: string): string {
  if (_providerOverride) {
    const sep = path.includes("?") ? "&" : "?";
    return `${API_URL}${path}${sep}provider=${encodeURIComponent(_providerOverride)}`;
  }
  return `${API_URL}${path}`;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error?.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export async function createLesson(params: {
  uri: string;
  name: string;
  mime: string;
  depth: Depth;
}): Promise<LessonResponse> {
  const form = new FormData();
  form.append("preferredDepth", params.depth);

  if (
    params.uri.startsWith("http") ||
    params.uri.startsWith("blob") ||
    params.uri.startsWith("data:")
  ) {
    const blob = await fetch(params.uri).then((res) => res.blob());
    form.append("image", blob, params.name);
  } else {
    form.append(
      "image",
      { uri: params.uri, name: params.name, type: params.mime } as unknown as Blob
    );
  }

  const response = await fetch(apiUrl("/api/v1/lessons"), {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as LessonResponse;
}

export async function askQuestion(
  lessonId: string,
  question: string
): Promise<TutorResponse> {
  const response = await fetch(apiUrl(`/api/v1/lessons/${lessonId}/questions`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as TutorResponse;
}

export async function fetchPractice(lessonId: string): Promise<PracticeQuestion[]> {
  const response = await fetch(apiUrl(`/api/v1/lessons/${lessonId}/practice`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: 4, difficulty: "adaptive" }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { questions: PracticeQuestion[] };
  return body.questions;
}

export async function recordAttempt(
  lessonId: string,
  questionId: string,
  selectedAnswer: string
): Promise<{ isCorrect: boolean; explanation: string; masteryScore: number }> {
  const response = await fetch(apiUrl(`/api/v1/lessons/${lessonId}/attempts`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, selectedAnswer }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as {
    isCorrect: boolean;
    explanation: string;
    masteryScore: number;
  };
}

export async function fetchProgress(): Promise<ProgressConcept[]> {
  const response = await fetch(apiUrl("/api/v1/progress"));
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { concepts: ProgressConcept[] };
  return body.concepts;
}

export async function fetchReview(): Promise<ReviewConcept[]> {
  const response = await fetch(apiUrl("/api/v1/review"));
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { concepts: ReviewConcept[] };
  return body.concepts;
}
