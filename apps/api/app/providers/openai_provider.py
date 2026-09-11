from __future__ import annotations

import base64
import json
import os
import re
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
Optional visual.annotations may use normalized x,y,w,h in 0..1.
"""


class OpenAILessonProvider(LessonProvider):
    """OpenAI-compatible multimodal chat → structured Lesson JSON."""

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self._api_key = api_key
        self._base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
        self._model = model or "gpt-4o-mini"
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
        payload = {
            "model": self._model,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{b64}"},
                        },
                    ],
                },
            ],
        }
        data = self._post("/chat/completions", payload)
        content = data["choices"][0]["message"]["content"]
        parsed = _parse_json_object(content)
        return Lesson.model_validate(parsed)

    def answer_question(self, lesson: Lesson, question: str) -> tuple[str, list[str], float]:
        payload = {
            "model": self._model,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Answer using ONLY the provided lesson JSON. "
                        "If evidence is missing, say what is missing. "
                        'Return JSON: {"answer": string, "references": string[], "confidence": number}.'
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {"lesson": lesson.model_dump(by_alias=True), "question": question}
                    ),
                },
            ],
        }
        data = self._post("/chat/completions", payload)
        parsed = _parse_json_object(data["choices"][0]["message"]["content"])
        return (
            str(parsed.get("answer", "")),
            list(parsed.get("references") or []),
            float(parsed.get("confidence", 0.5)),
        )

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            response = httpx.post(
                f"{self._base_url}{path}",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise AppError("PROVIDER_ERROR", f"Live provider request failed: {exc}", 502) from exc
        if response.status_code >= 400:
            raise AppError(
                "PROVIDER_ERROR",
                f"Live provider returned HTTP {response.status_code}.",
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


def _parse_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)
