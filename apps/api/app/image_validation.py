from __future__ import annotations

from app.errors import AppError, ImageLimits


def validate_image(
    content: bytes,
    content_type: str | None,
    filename: str | None,
    limits: ImageLimits | None = None,
) -> None:
    limits = limits or ImageLimits()
    if not content or len(content) < limits.min_bytes:
        raise AppError(
            "INVALID_IMAGE",
            "The uploaded image is empty or too small to process.",
            400,
        )
    if len(content) > limits.max_bytes:
        raise AppError(
            "INVALID_IMAGE",
            "The uploaded image exceeds the maximum size.",
            400,
        )
    mime = (content_type or "").split(";")[0].strip().lower()
    name = (filename or "").lower()
    looks_like_image = name.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))
    if mime and mime not in limits.allowed_types and not looks_like_image:
        raise AppError(
            "INVALID_IMAGE",
            "The uploaded file is not a supported image type.",
            400,
        )
    if mime == "application/octet-stream" and not looks_like_image:
        if not _has_image_magic(content):
            raise AppError(
                "INVALID_IMAGE",
                "The uploaded file is not a supported image type.",
                400,
            )


def _has_image_magic(content: bytes) -> bool:
    if content[:3] == b"\xff\xd8\xff":
        return True
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return True
    if content[:6] in (b"GIF87a", b"GIF89a"):
        return True
    return False
