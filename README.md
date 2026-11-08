# Visual Learner AI

Capture a page, diagram, or equation. Get a structured visual lesson, ask follow-ups, practice, and track weak concepts. Mock teaching engine in Phase 1 — no live model required.

Obsidian second brain: `Documents/Obsidian Vault/Visual-Learner` (start at `Visual-Learner.md` / `final-plan.md`).

## Layout

```text
apps/api        FastAPI orchestrator + mock provider
apps/mobile     Expo (camera / picker + lesson flow)
packages/schema JSON Schema + TypeScript types
```

## Run

```bash
# API
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pytest
uvicorn app.main:app --reload --port 8000
```

```bash
# Mobile (web is the fastest check)
cd apps/mobile
npm install
npx expo start --web
```

Point the app at the API with `EXPO_PUBLIC_API_URL` (default `http://127.0.0.1:8000`).

## Phase 2 providers

```bash
# safe default
set VL_PROVIDER=mock

# Gemini (preferred live — never commit the key)
set VL_PROVIDER=gemini
set GEMINI_API_KEY=your-key
# optional: set GEMINI_MODEL=gemini-3.5-flash

# OpenAI-compatible alternative
set VL_PROVIDER=openai
set OPENAI_API_KEY=sk-...
```

Copy `apps/api/.env.example` → `apps/api/.env`, add your key, restart uvicorn.
`GET /health` should report `GeminiLessonProvider` when configured.

Eval set: `apps/api/eval/cases.json` — covered by `pytest`.

## API

- `GET /health`
- `POST /api/v1/lessons` multipart `image`, `preferredDepth`, `subject`
- `POST /api/v1/lessons/{id}/questions`
- `POST /api/v1/lessons/{id}/practice`
- `POST /api/v1/lessons/{id}/attempts`
- `GET /api/v1/progress`
