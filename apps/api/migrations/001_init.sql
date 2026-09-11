-- Visual Learner — Supabase schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → Run)

-- 1. Lessons (full Pydantic model stored as JSONB so they survive server restarts)
CREATE TABLE IF NOT EXISTS lessons (
  lesson_id  TEXT PRIMARY KEY,
  lesson_data JSONB NOT NULL,
  subject    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Concepts (one row per lesson × concept name)
CREATE TABLE IF NOT EXISTS concepts (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lesson_id          TEXT NOT NULL,
  name               TEXT NOT NULL,
  subject            TEXT,
  mastery_score      REAL NOT NULL DEFAULT 0.5,
  last_practiced_at  TIMESTAMPTZ,
  due_date           DATE,
  UNIQUE (lesson_id, name)
);

CREATE INDEX IF NOT EXISTS idx_concepts_due ON concepts (due_date)
  WHERE due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_concepts_subject ON concepts (subject)
  WHERE subject IS NOT NULL;

-- 3. Attempts (raw event log)
CREATE TABLE IF NOT EXISTS attempts (
  id              TEXT PRIMARY KEY,
  question_id     TEXT NOT NULL,
  selected_answer TEXT NOT NULL,
  is_correct      BOOLEAN NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL
);

-- 4. Mastery history (time-series, one row per attempt)
CREATE TABLE IF NOT EXISTS mastery_history (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lesson_id     TEXT NOT NULL,
  concept_name  TEXT NOT NULL,
  mastery_score REAL NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mastery_history_lookup
  ON mastery_history (lesson_id, concept_name, recorded_at);

-- Disable RLS so the service-role key can read/write without row policies.
-- (Enable RLS + policies later when adding user auth.)
ALTER TABLE lessons         DISABLE ROW LEVEL SECURITY;
ALTER TABLE concepts        DISABLE ROW LEVEL SECURITY;
ALTER TABLE attempts        DISABLE ROW LEVEL SECURITY;
ALTER TABLE mastery_history DISABLE ROW LEVEL SECURITY;
