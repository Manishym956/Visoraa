/**
 * Phase 4 — Local-first persistence layer.
 *
 * Uses expo-sqlite on native (iOS/Android) and falls back to a lightweight
 * in-memory + localStorage shim on web, so the app never crashes on either platform.
 */
import { Platform } from "react-native";

export interface LocalLesson {
  lessonId: string;
  title: string;
  contentType: string;
  confidence: number;
  savedAt: string;
}

export interface LocalConcept {
  name: string;
  masteryScore: number;
  lastPracticedAt: string | null;
}

// ── Web shim using localStorage ──────────────────────────────────────────────

const LS_LESSONS = "vl_lessons";
const LS_CONCEPTS = "vl_concepts";

const webStore = {
  getLessons(): LocalLesson[] {
    try {
      return JSON.parse(localStorage.getItem(LS_LESSONS) ?? "[]") as LocalLesson[];
    } catch {
      return [];
    }
  },
  saveLesson(lesson: LocalLesson): void {
    const existing = this.getLessons().filter((l) => l.lessonId !== lesson.lessonId);
    localStorage.setItem(LS_LESSONS, JSON.stringify([lesson, ...existing].slice(0, 50)));
  },
  getConcepts(): LocalConcept[] {
    try {
      return JSON.parse(localStorage.getItem(LS_CONCEPTS) ?? "[]") as LocalConcept[];
    } catch {
      return [];
    }
  },
  upsertConcept(concept: LocalConcept): void {
    const others = this.getConcepts().filter((c) => c.name !== concept.name);
    localStorage.setItem(
      LS_CONCEPTS,
      JSON.stringify([...others, concept].sort((a, b) => a.masteryScore - b.masteryScore))
    );
  },
};

// ── Native SQLite path ────────────────────────────────────────────────────────

let _db: import("expo-sqlite").SQLiteDatabase | null = null;

async function getNativeDb(): Promise<import("expo-sqlite").SQLiteDatabase> {
  if (!_db) {
    const SQLite = await import("expo-sqlite");
    _db = await SQLite.openDatabaseAsync("visual_learner_local.db");
    await _db.execAsync(`
      CREATE TABLE IF NOT EXISTS local_lessons (
        lesson_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content_type TEXT NOT NULL,
        confidence REAL NOT NULL,
        saved_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS local_concepts (
        name TEXT PRIMARY KEY,
        mastery_score REAL NOT NULL,
        last_practiced_at TEXT
      );
    `);
  }
  return _db;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function saveLocalLesson(lesson: LocalLesson): Promise<void> {
  if (Platform.OS === "web") {
    webStore.saveLesson(lesson);
    return;
  }
  const db = await getNativeDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO local_lessons
       (lesson_id, title, content_type, confidence, saved_at)
     VALUES (?, ?, ?, ?, ?)`,
    lesson.lessonId,
    lesson.title,
    lesson.contentType,
    lesson.confidence,
    lesson.savedAt
  );
}

export async function getLocalLessons(): Promise<LocalLesson[]> {
  if (Platform.OS === "web") {
    return webStore.getLessons();
  }
  const db = await getNativeDb();
  const rows = await db.getAllAsync<{
    lesson_id: string;
    title: string;
    content_type: string;
    confidence: number;
    saved_at: string;
  }>("SELECT * FROM local_lessons ORDER BY saved_at DESC LIMIT 50");
  return rows.map((r) => ({
    lessonId: r.lesson_id,
    title: r.title,
    contentType: r.content_type,
    confidence: r.confidence,
    savedAt: r.saved_at,
  }));
}

export async function upsertLocalConcept(concept: LocalConcept): Promise<void> {
  if (Platform.OS === "web") {
    webStore.upsertConcept(concept);
    return;
  }
  const db = await getNativeDb();
  await db.runAsync(
    `INSERT INTO local_concepts (name, mastery_score, last_practiced_at)
     VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       mastery_score = excluded.mastery_score,
       last_practiced_at = excluded.last_practiced_at`,
    concept.name,
    concept.masteryScore,
    concept.lastPracticedAt ?? null
  );
}

export async function getLocalConcepts(): Promise<LocalConcept[]> {
  if (Platform.OS === "web") {
    return webStore.getConcepts();
  }
  const db = await getNativeDb();
  const rows = await db.getAllAsync<{
    name: string;
    mastery_score: number;
    last_practiced_at: string | null;
  }>("SELECT * FROM local_concepts ORDER BY mastery_score ASC");
  return rows.map((r) => ({
    name: r.name,
    masteryScore: r.mastery_score,
    lastPracticedAt: r.last_practiced_at,
  }));
}
