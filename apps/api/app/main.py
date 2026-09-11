from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.errors import AppError, RequestIdMiddleware, app_error_handler, http_error_handler
from app.orchestrator import LearningOrchestrator
from app.providers.factory import create_provider, provider_name
from app.routers import router
from app.store import LessonStore

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
API_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = API_ROOT.parent.parent

# Load env without overriding real shell variables. Prefer apps/api/.env, then repo root.
load_dotenv(API_ROOT / ".env", override=False)
load_dotenv(REPO_ROOT / ".env", override=False)


import logging
import os

logger = logging.getLogger(__name__)


def create_app(db_path: Path | None = None) -> FastAPI:
    app = FastAPI(title="Visual Learner API", version="0.3.0")
    provider = create_provider()
    app.state.provider = provider
    app.state.orchestrator = LearningOrchestrator(provider)

    # ── Storage: prefer Supabase when credentials are present ──────────────
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_key = os.getenv("SUPABASE_KEY", "").strip()
    if supabase_url and supabase_key:
        from app.supabase_store import SupabaseStore
        app.state.store = SupabaseStore(supabase_url, supabase_key)
        logger.info("Storage: Supabase (%s)", supabase_url)
    else:
        app.state.store = LessonStore(db_path or DATA_DIR / "visual_learner.db")
        logger.info("Storage: SQLite local")

    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(HTTPException, http_error_handler)
    app.include_router(router)

    @app.get("/health")
    def health() -> dict[str, str]:
        store_name = type(app.state.store).__name__
        return {
            "status": "ok",
            "provider": provider_name(provider),
            "store": store_name,
        }

    return app


app = create_app()
