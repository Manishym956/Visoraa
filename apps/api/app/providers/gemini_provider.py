from __future__ import annotations

import base64
import json
import re
import time
from typing import Any

import httpx

from app.errors import AppError
from app.models import Depth, Lesson
from app.providers.base import LessonProvider

SYSTEM_PROMPT = """You are Visual Learner's teaching engine.
Return ONLY valid JSON matching the lesson schema.
Rules: start from observable evidence; distinguish extraction from inference;
intuition before heavy math; short steps; state uncertainty in confidence (0-1);
never invent unread symbols; prefer visual structures; include 3-5 practice questions.
Visual.kind must be one of: equation_breakdown, flowchart, graph, concept_map.
contentType must be one of: equation, diagram, text, graph, mixed.
Each visual.annotations item needs id and label, plus optional x,y,w,h in 0..1.
Required keys: title, contentType, summary, intuition, steps, technicalDetails,
workedExample {prompt, solution}, visual {kind, title, nodes, edges?, annotations?},
commonMistakes, questions, confidence, evidence.
Each question needs: id, conceptName, kind, prompt, choices, correctIndex, hint, explanation, difficulty.
question.kind must be one of: conceptual, application, calculation, misconception.
question.difficulty must be one of: easy, medium, hard. correctIndex is 0-based.
Each visual node needs: id, label, detail?. Each edge needs: from, to, label?.
steps, technicalDetails, commonMistakes and evidence are arrays of strings.
"""

RETRY_DELAY_S = 2.0


class GeminiLessonProvider(LessonProvider):
    """Google Gemini multimodal → structured Lesson JSON."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
        timeout: float = 90.0,
    ) -> None:
        self._api_key = api_key
        self._model = model or "gemini-3.5-flash"
        self._base_url = (
            base_url or "https://generativelanguage.googleapis.com/v1beta"
        ).rstrip("/")
        self._timeout = timeout

    def generate_lesson(
        self,
        *,
        image_bytes: bytes,
        filename: str | None,
        depth: Depth,
        subject: str | None,
    ) -> Lesson:
        mime = _guess_mime(filename, image_bytes)
        b64 = base64.b64encode(image_bytes).decode("ascii")
        user_text = (
            f"Create a structured lesson for this learning artifact. "
            f"preferredDepth={depth.value}. subject={subject or 'unspecified'}. "
            f"filename={filename or 'upload'}."
        )
        return self._lesson_from_parts(
            [{"text": user_text}, {"inlineData": {"mimeType": mime, "data": b64}}]
        )

    def generate_lesson_from_extraction(
        self, *, extraction: dict[str, Any], depth: Depth, subject: str | None
    ) -> Lesson:
        """Teach step of the pipeline: Gemini never sees the image, only the extracted features."""
        user_text = (
            "Create a structured lesson from these features, extracted from the learner's image. "
            "You cannot see the image: use ONLY these features and never add symbols that are not "
            "in the transcription. Build visual.nodes from the elements, add one "
            "visual.annotations item per element ({id, label, x, y, w, h}), list what was read in evidence, and keep "
            "confidence at or below the extraction confidence. "
            f"preferredDepth={depth.value}. subject={subject or extraction.get('subjectGuess') or 'unspecified'}.\n"
            f"FEATURES:\n{json.dumps(extraction, ensure_ascii=False)}"
        )
        return self._lesson_from_parts([{"text": user_text}])

    def _lesson_from_parts(self, parts: list[dict[str, Any]]) -> Lesson:
        payload = {
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
                # default thinking took 90s+ per lesson on gemini-3.x; low answers in seconds
                "thinkingConfig": {"thinkingLevel": "low"},
            },
        }
        data = self._generate(payload)
        parsed = _parse_json_object(_text_from_gemini(data))
        return Lesson.model_validate(parsed)

    def answer_question(self, lesson: Lesson, question: str) -> tuple[str, list[str], float]:
        payload = {
            "systemInstruction": {
                "parts": [
                    {
                        "text": (
                            "Answer using ONLY the provided lesson JSON. "
                            "If evidence is missing, say what is missing. "
                            'Return JSON: {"answer": string, "references": string[], "confidence": number}.'
                        )
                    }
                ]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "lesson": lesson.model_dump(by_alias=True),
                                    "question": question,
                                }
                            )
                        }
                    ],
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
                # default thinking took 90s+ per lesson on gemini-3.x; low answers in seconds
                "thinkingConfig": {"thinkingLevel": "low"},
            },
        }
        data = self._generate(payload)
        parsed = _parse_json_object(_text_from_gemini(data))
        return (
            str(parsed.get("answer", "")),
            list(parsed.get("references") or []),
            float(parsed.get("confidence", 0.5)),
        )

    def _generate(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._base_url}/models/{self._model}:generateContent"
        for attempt in range(2):
            try:
                response = httpx.post(
                    url,
                    params={"key": self._api_key},
                    headers={"Content-Type": "application/json"},
                    json=payload,
                    timeout=self._timeout,
                )
            except httpx.HTTPError as exc:
                raise AppError("PROVIDER_ERROR", f"Gemini request failed: {exc}", 502) from exc
            # Gemini flash often returns transient 503 "overloaded"; one short retry usually clears it.
            if response.status_code not in (429, 503) or attempt == 1:
                break
            time.sleep(RETRY_DELAY_S)
        if response.status_code >= 400:
            detail = response.text[:300]
            raise AppError(
                "PROVIDER_ERROR",
                f"Gemini returned HTTP {response.status_code}: {detail}",
                502,
            )
        return response.json()


def _guess_mime(filename: str | None, content: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".png") or content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if name.endswith(".webp"):
        return "image/webp"
    if name.endswith(".gif"):
        return "image/gif"
    return "image/jpeg"


def _text_from_gemini(data: dict[str, Any]) -> str:
    try:
        parts = data["candidates"][0]["content"]["parts"]
        texts = [p.get("text", "") for p in parts if isinstance(p, dict)]
        text = "".join(texts).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise AppError("PROVIDER_ERROR", "Gemini response missing text content.", 502) from exc
    if not text:
        raise AppError("PROVIDER_ERROR", "Gemini returned empty content.", 502)
    return text


def _parse_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)
