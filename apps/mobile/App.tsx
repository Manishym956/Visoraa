import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  API_URL,
  askQuestion,
  createLesson,
  fetchPractice,
  fetchProgress,
  fetchReview,
  recordAttempt,
  setProviderOverride,
} from "./src/api";
import type {
  ContentType,
  Depth,
  Lesson,
  PracticeQuestion,
  ProgressConcept,
  ReviewConcept,
} from "./src/lessonView";
import { isLowConfidence, layersForDepth } from "./src/lessonView";
import {
  getLocalConcepts,
  getLocalLessons,
  saveLocalLesson,
  upsertLocalConcept,
  type LocalConcept,
  type LocalLesson,
} from "./src/localStore";
import { colors, icon, radius, shadow, space } from "./src/theme";
import {
  Badge,
  Body,
  Bullets,
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  MasteryRow,
  ProgressBar,
  SectionCard,
  Segmented,
  styles as ui,
  type IconName,
} from "./src/ui";
import { VisualSpecView } from "./src/VisualSpecView";

type Tab = "home" | "history" | "review" | "settings";
type Flow = "lesson" | "tutor" | "practice" | "progress";
type Screen = Tab | Flow;

type ChatMessage = { role: "user" | "tutor"; text: string; confidence?: number; references?: string[] };
type AnswerResult = { choice: number; isCorrect: boolean; explanation: string; masteryScore: number };
type AppErr = { message: string; retry?: () => void };

const TABS: { key: Tab; label: string; icon: IconName; iconOn: IconName }[] = [
  { key: "home", label: "Learn", icon: "scan-outline", iconOn: "scan" },
  { key: "history", label: "Library", icon: "book-outline", iconOn: "book" },
  { key: "review", label: "Review", icon: "trending-up-outline", iconOn: "trending-up" },
  { key: "settings", label: "Settings", icon: "settings-outline", iconOn: "settings" },
];

const DEPTHS: { value: Depth; label: string; blurb: string }[] = [
  { value: "beginner", label: "Beginner", blurb: "Plain language and the first few steps." },
  { value: "standard", label: "Standard", blurb: "Every step plus the key technical idea." },
  { value: "advanced", label: "Advanced", blurb: "Full technical depth and common mistakes." },
];

const TYPE_ICON: Record<ContentType, IconName> = {
  equation: "calculator-outline",
  diagram: "git-network-outline",
  text: "document-text-outline",
  graph: "analytics-outline",
  mixed: "layers-outline",
};

const SUGGESTIONS = ["Explain it simpler", "Give another example", "Show the math", "Why does this work?"];
const LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [depth, setDepth] = useState<Depth>("beginner");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<AppErr | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerResult>>({});
  const [showHint, setShowHint] = useState(false);
  const [quizDone, setQuizDone] = useState(false);
  const [concepts, setConcepts] = useState<ProgressConcept[]>([]);
  const [reviewConcepts, setReviewConcepts] = useState<ReviewConcept[] | null>(null);
  const [localLessons, setLocalLessons] = useState<LocalLesson[]>([]);
  const [localConcepts, setLocalConcepts] = useState<LocalConcept[]>([]);
  const [useMock, setUseMock] = useState(false);
  const [screenReaderOn, setScreenReaderOn] = useState(false);
  const chatScroll = useRef<ScrollView>(null);

  const layers = useMemo(() => (lesson ? layersForDepth(lesson, depth) : null), [lesson, depth]);
  const question = questions[qIndex];
  const answered = question ? answers[question.id] : undefined;

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReaderOn);
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReaderOn);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void getLocalLessons().then(setLocalLessons).catch(() => {});
    void getLocalConcepts().then(setLocalConcepts).catch(() => {});
  }, []);

  useEffect(() => {
    setProviderOverride(useMock ? "mock" : null);
  }, [useMock]);

  // Run an async action with a blocking loader and a retryable error banner.
  const run = useCallback(async (label: string, action: () => Promise<void>) => {
    setError(null);
    setBusy(label);
    try {
      await action();
    } catch (err) {
      setError({
        message: friendlyError(err),
        retry: () => void run(label, action),
      });
    } finally {
      setBusy(null);
    }
  }, []);

  const goBack = useCallback((): boolean => {
    if (busy) return true;
    if (screen === "tutor" || screen === "practice") setScreen("lesson");
    else if (screen === "progress") setScreen(lesson ? "lesson" : "home");
    else if (screen !== "home") setScreen("home");
    else return false;
    setError(null);
    return true;
  }, [screen, lesson, busy]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", goBack);
    return () => sub.remove();
  }, [goBack]);

  function navigate(next: Screen) {
    setError(null);
    setScreen(next);
    if (next === "review") void loadReview();
  }

  async function onPick(fromCamera: boolean) {
    setError(null);
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError({
        message: fromCamera
          ? "Camera access is off. Allow it in your device settings, or upload an image instead."
          : "Photo library access is off. Allow it in your device settings to upload an image.",
      });
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.7 };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const name = asset.fileName || (fromCamera ? "capture.jpg" : "upload.png");
    const mime = asset.mimeType || "image/jpeg";

    await run("Reading your image, then writing your lesson…", async () => {
      const created = await createLesson({ uri: asset.uri, name, mime, depth });
      setLessonId(created.lessonId);
      setLesson(created.lesson);
      setChat([]);
      setDraft("");
      resetQuiz([]);
      setScreen("lesson");
      const entry: LocalLesson = {
        lessonId: created.lessonId,
        title: created.lesson.title,
        contentType: created.lesson.contentType,
        confidence: created.lesson.confidence,
        savedAt: new Date().toISOString(),
      };
      setLocalLessons((prev) => [entry, ...prev.filter((l) => l.lessonId !== entry.lessonId)].slice(0, 50));
      await saveLocalLesson(entry).catch(() => {});
    });
  }

  async function onAsk(prompt: string) {
    const text = prompt.trim();
    if (!lessonId || !text || busy) return;
    setDraft("");
    setChat((prev) => [...prev, { role: "user", text }]);
    await run("Thinking…", async () => {
      const res = await askQuestion(lessonId, text);
      setChat((prev) => [
        ...prev,
        { role: "tutor", text: res.answer, confidence: res.confidence, references: res.references },
      ]);
    });
  }

  function resetQuiz(next: PracticeQuestion[]) {
    setQuestions(next);
    setQIndex(0);
    setAnswers({});
    setShowHint(false);
    setQuizDone(false);
  }

  async function onPractice() {
    if (!lessonId) return;
    await run("Writing practice questions…", async () => {
      resetQuiz(await fetchPractice(lessonId));
      setScreen("practice");
    });
  }

  async function onAnswer(choiceIndex: number) {
    // Lock after the first answer so an attempt is recorded once per question.
    if (!lessonId || !question || answered || busy) return;
    const q = question;
    await run("Checking your answer…", async () => {
      const result = await recordAttempt(lessonId, q.id, q.choices[choiceIndex]);
      setAnswers((prev) => ({ ...prev, [q.id]: { choice: choiceIndex, ...result } }));
      await upsertLocalConcept({
        name: q.conceptName,
        masteryScore: result.masteryScore,
        lastPracticedAt: new Date().toISOString(),
      }).catch(() => {});
      setLocalConcepts(await getLocalConcepts().catch(() => localConcepts));
    });
  }

  function onNextQuestion() {
    setShowHint(false);
    if (qIndex < questions.length - 1) setQIndex((i) => i + 1);
    else setQuizDone(true);
  }

  async function onProgress() {
    await run("Loading your progress…", async () => {
      setConcepts(await fetchProgress());
      setScreen("progress");
    });
  }

  async function loadReview() {
    await run("Loading review…", async () => {
      setReviewConcepts(await fetchReview());
    });
  }

  const isTab = (TABS as { key: Screen }[]).some((t) => t.key === screen);
  const score = Object.values(answers).filter((a) => a.isCorrect).length;

  // ── Screens ────────────────────────────────────────────────────────────────

  function HomeScreen() {
    const avg = localConcepts.length
      ? localConcepts.reduce((s, c) => s + c.masteryScore, 0) / localConcepts.length
      : null;
    const selected = DEPTHS.find((d) => d.value === depth)!;
    return (
      <>
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Icon name="sparkles" size={icon.lg} color={colors.accent} />
          </View>
          <Text style={s.heroTitle} accessibilityRole="header">
            Turn any page into a lesson
          </Text>
          <Text style={s.heroBody}>
            Snap an equation, diagram, graph or paragraph. Get a visual explanation, a tutor and a quick quiz.
          </Text>
          <View style={s.heroActions}>
            <Button
              label="Camera"
              iconName="camera"
              variant="inverse"
              onPress={() => void onPick(true)}
              disabled={!!busy}
              style={{ flex: 1 }}
            />
            <Button
              label="Upload"
              iconName="image-outline"
              variant="inverse"
              onPress={() => void onPick(false)}
              disabled={!!busy}
              hint="Choose an image from your photo library"
              style={{ flex: 1 }}
            />
          </View>
        </View>

        <Card style={{ gap: space.sm + 4 }}>
          <Text style={ui.itemTitle}>Explain it at</Text>
          <Segmented label="Learning depth" value={depth} options={DEPTHS} onChange={setDepth} />
          <Text style={ui.caption}>{selected.blurb}</Text>
        </Card>

        {lesson ? (
          <Pressable
            onPress={() => navigate("lesson")}
            accessibilityRole="button"
            accessibilityLabel={`Continue lesson: ${lesson.title}`}
            style={({ pressed }) => [ui.card, s.continueCard, pressed && { opacity: 0.85 }]}
          >
            <View style={[s.typeIcon, { backgroundColor: colors.highlightSoft }]}>
              <Icon name="play" color={colors.highlight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={ui.caption}>Continue where you left off</Text>
              <Text style={ui.itemTitle} numberOfLines={1}>
                {lesson.title}
              </Text>
            </View>
            <Icon name="chevron-forward" color={colors.muted} />
          </Pressable>
        ) : null}

        <View style={s.stats}>
          <Stat value={String(localLessons.length)} label="Lessons" iconName="book-outline" />
          <Stat value={String(localConcepts.length)} label="Concepts" iconName="bulb-outline" />
          <Stat value={avg == null ? "–" : `${Math.round(avg * 100)}%`} label="Mastery" iconName="ribbon-outline" />
        </View>

        {localLessons.length ? (
          <View style={{ gap: space.sm + 4 }}>
            <View style={ui.rowBetween}>
              <Text style={s.h2} accessibilityRole="header">
                Recent lessons
              </Text>
              <Button label="See all" variant="ghost" onPress={() => navigate("history")} />
            </View>
            {localLessons.slice(0, 3).map((l) => (
              <LessonRow key={l.lessonId} item={l} />
            ))}
          </View>
        ) : (
          <Card style={{ gap: space.sm }}>
            <Text style={ui.itemTitle}>How it works</Text>
            <Bullets
              iconName="checkmark-circle"
              items={[
                "Capture a page, a whiteboard or a screenshot.",
                "Read a step-by-step visual breakdown.",
                "Ask the tutor anything about it.",
                "Quiz yourself and track what to review.",
              ]}
            />
          </Card>
        )}

        {useMock ? (
          <Badge label="Offline demo mode is on" iconName="cloud-offline-outline" color={colors.warn} soft={colors.warnSoft} />
        ) : null}
      </>
    );
  }

  function LessonRow({ item }: { item: LocalLesson }) {
    const open = item.lessonId === lessonId && !!lesson;
    const content = (
      <>
        <View style={s.typeIcon}>
          <Icon name={TYPE_ICON[item.contentType as ContentType] ?? "document-outline"} color={colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={ui.itemTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={ui.caption}>
            {capitalize(item.contentType)} · {formatDate(item.savedAt)} · {Math.round(item.confidence * 100)}% sure
          </Text>
        </View>
        {open ? <Icon name="chevron-forward" color={colors.muted} /> : null}
      </>
    );
    if (!open) {
      return (
        <View style={[ui.card, s.listRow]} accessible accessibilityLabel={`${item.title}, ${item.contentType}, saved ${formatDate(item.savedAt)}`}>
          {content}
        </View>
      );
    }
    return (
      <Pressable
        onPress={() => navigate("lesson")}
        accessibilityRole="button"
        accessibilityLabel={`Open lesson: ${item.title}`}
        style={({ pressed }) => [ui.card, s.listRow, pressed && { opacity: 0.85 }]}
      >
        {content}
      </Pressable>
    );
  }

  function LessonScreen() {
    if (!lesson || !layers) return <NoLesson />;
    const low = isLowConfidence(lesson.confidence);
    const pct = Math.round(lesson.confidence * 100);
    return (
      <>
        <View style={{ gap: space.sm + 4 }}>
          <View style={s.badgeRow}>
            <Badge label={capitalize(lesson.contentType)} iconName={TYPE_ICON[lesson.contentType]} />
            <Badge
              label={`${pct}% confident`}
              iconName={low ? "alert-circle" : "shield-checkmark"}
              color={low ? colors.warn : colors.success}
              soft={low ? colors.warnSoft : colors.successSoft}
            />
          </View>
          <Text style={s.title} accessibilityRole="header">
            {lesson.title}
          </Text>
        </View>

        {low ? (
          <Notice
            tone="warn"
            iconName="eye-outline"
            text="I'm not fully sure I read this correctly. Compare with the original page before relying on it."
          />
        ) : null}

        <Segmented label="Learning depth" value={depth} options={DEPTHS} onChange={setDepth} />

        <SectionCard title="What am I looking at?" iconName="eye-outline">
          <Body>{lesson.summary}</Body>
        </SectionCard>

        <SectionCard title="The intuition" iconName="bulb-outline" tone={colors.highlight}>
          <Body>{lesson.intuition}</Body>
        </SectionCard>

        <VisualSpecView visual={lesson.visual} />

        {layers.steps.length ? (
          <SectionCard title="Step by step" iconName="footsteps-outline">
            <View style={{ gap: space.md }}>
              {layers.steps.map((step, i) => (
                <View key={i} style={s.stepRow}>
                  <View style={s.stepNum}>
                    <Text style={s.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={[ui.body, { flex: 1 }]}>{step}</Text>
                </View>
              ))}
            </View>
            {depth === "beginner" && lesson.steps.length > layers.steps.length ? (
              <Button
                label={`Show all ${lesson.steps.length} steps`}
                variant="ghost"
                iconName="chevron-down"
                onPress={() => setDepth("standard")}
              />
            ) : null}
          </SectionCard>
        ) : null}

        {layers.showWorkedExample && (lesson.workedExample.prompt || lesson.workedExample.solution) ? (
          <SectionCard title="Worked example" iconName="create-outline" tone={colors.success}>
            {lesson.workedExample.prompt ? <Body>{lesson.workedExample.prompt}</Body> : null}
            {lesson.workedExample.solution ? (
              <View style={s.solution}>
                <Text style={[ui.caption, { fontWeight: "700", color: colors.success }]}>SOLUTION</Text>
                <Body>{lesson.workedExample.solution}</Body>
              </View>
            ) : null}
          </SectionCard>
        ) : null}

        {layers.technicalDetails.length ? (
          <SectionCard title="Technical detail" iconName="code-slash-outline">
            <Bullets items={layers.technicalDetails} />
          </SectionCard>
        ) : null}

        {layers.showMistakes && lesson.commonMistakes.length ? (
          <SectionCard title="Common mistakes" iconName="warning-outline" tone={colors.danger}>
            <Bullets items={lesson.commonMistakes} iconName="close-circle" color={colors.danger} />
          </SectionCard>
        ) : null}

        {lesson.evidence.length ? (
          <SectionCard title="What I read from your image" iconName="scan-outline" tone={colors.muted}>
            <Bullets items={lesson.evidence} color={colors.muted} />
          </SectionCard>
        ) : null}
      </>
    );
  }

  function NoLesson() {
    return (
      <EmptyState iconName="scan-outline" title="No lesson open" body="Capture a page to start a lesson.">
        <Button label="Go to Learn" onPress={() => navigate("home")} style={{ alignSelf: "stretch", marginTop: space.sm }} />
      </EmptyState>
    );
  }

  function PracticeScreen() {
    if (quizDone) {
      const total = questions.length;
      return (
        <EmptyState
          iconName={score === total ? "trophy" : "ribbon-outline"}
          title={`You got ${score} of ${total}`}
          body={
            score === total
              ? "Perfect round. This concept is sticking."
              : score / total >= 0.5
                ? "Nice work. Another round on the ones you missed will lock them in."
                : "Good start. Re-read the steps, then try another round."
          }
        >
          <View style={{ alignSelf: "stretch", gap: space.sm, marginTop: space.sm }}>
            <Button label="See my progress" iconName="trending-up" onPress={() => void onProgress()} />
            <Button label="Try another round" variant="secondary" iconName="refresh" onPress={() => void onPractice()} />
            <Button label="Back to lesson" variant="ghost" onPress={() => setScreen("lesson")} />
          </View>
        </EmptyState>
      );
    }
    if (!question) {
      return (
        <EmptyState iconName="help-circle-outline" title="No questions yet" body="The tutor couldn't make questions for this page.">
          <Button label="Try again" onPress={() => void onPractice()} style={{ alignSelf: "stretch", marginTop: space.sm }} />
        </EmptyState>
      );
    }
    return (
      <>
        <View style={{ gap: space.sm }}>
          <View style={ui.rowBetween}>
            <Text style={ui.caption}>
              Question {qIndex + 1} of {questions.length}
            </Text>
            <Badge label={question.conceptName} />
          </View>
          <ProgressBar value={(qIndex + (answered ? 1 : 0)) / questions.length} />
        </View>
        <Text style={s.title} accessibilityRole="header">
          {question.prompt}
        </Text>
        <View style={{ gap: space.sm + 2 }} accessibilityRole="radiogroup">
          {question.choices.map((choice, idx) => {
            const isPicked = answered?.choice === idx;
            const isRight = !!answered && idx === question.correctIndex;
            const state = isRight ? "right" : isPicked ? "wrong" : answered ? "dim" : "idle";
            return (
              <Pressable
                key={`${question.id}-${idx}`}
                onPress={() => void onAnswer(idx)}
                disabled={!!answered || !!busy}
                accessibilityRole="radio"
                accessibilityLabel={`${LETTERS[idx] ?? idx + 1}: ${choice}${isRight ? ", correct answer" : isPicked ? ", your answer, incorrect" : ""}`}
                accessibilityState={{ checked: isPicked, disabled: !!answered }}
                style={({ pressed }) => [
                  s.choice,
                  state === "right" && s.choiceRight,
                  state === "wrong" && s.choiceWrong,
                  state === "dim" && { opacity: 0.6 },
                  pressed && { borderColor: colors.accent, backgroundColor: colors.accentSoft },
                ]}
              >
                <View
                  style={[
                    s.letter,
                    state === "right" && { backgroundColor: colors.success },
                    state === "wrong" && { backgroundColor: colors.danger },
                  ]}
                >
                  {state === "right" || state === "wrong" ? (
                    <Icon name={state === "right" ? "checkmark" : "close"} size={icon.sm} color="#fff" />
                  ) : (
                    <Text style={s.letterText}>{LETTERS[idx] ?? idx + 1}</Text>
                  )}
                </View>
                <Text style={[ui.body, { flex: 1 }]}>{choice}</Text>
              </Pressable>
            );
          })}
        </View>

        {answered ? (
          <Notice
            tone={answered.isCorrect ? "success" : "danger"}
            iconName={answered.isCorrect ? "checkmark-circle" : "information-circle"}
            title={answered.isCorrect ? "Correct!" : "Not quite"}
            text={`${answered.explanation}\nMastery now ${Math.round(answered.masteryScore * 100)}%.`}
          />
        ) : question.hint ? (
          showHint ? (
            <Notice tone="info" iconName="bulb-outline" title="Hint" text={question.hint} />
          ) : (
            <Button label="Show a hint" variant="ghost" iconName="bulb-outline" onPress={() => setShowHint(true)} />
          )
        ) : null}
      </>
    );
  }

  function TutorScreen() {
    if (!lesson) return <NoLesson />;
    return (
      <>
        <Card style={s.tutorIntro}>
          <View style={s.typeIcon}>
            <Icon name="chatbubbles-outline" color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={ui.caption}>Ask about</Text>
            <Text style={ui.itemTitle} numberOfLines={2}>
              {lesson.title}
            </Text>
          </View>
        </Card>
        {chat.length === 0 ? (
          <Text style={[ui.caption, { textAlign: "center" }]}>
            Answers stay grounded in the page you captured. Try one of these:
          </Text>
        ) : null}
        {chat.map((m, i) => (
          <View
            key={i}
            style={[s.bubble, m.role === "user" ? s.bubbleUser : s.bubbleTutor]}
            accessibilityLabel={`${m.role === "user" ? "You" : "Tutor"}: ${m.text}`}
          >
            <Text style={[ui.body, m.role === "user" && { color: colors.onAccent }]}>{m.text}</Text>
            {m.role === "tutor" && m.confidence != null ? (
              <Text style={ui.caption}>
                {Math.round(m.confidence * 100)}% confident
                {m.references?.length ? ` · ${m.references.join(" · ")}` : ""}
              </Text>
            ) : null}
          </View>
        ))}
        {busy && screen === "tutor" ? (
          <View style={[s.bubble, s.bubbleTutor, { flexDirection: "row", gap: space.sm, alignItems: "center" }]}>
            <ActivityIndicator color={colors.accent} />
            <Text style={ui.caption}>Thinking…</Text>
          </View>
        ) : null}
        <View style={s.chips}>
          {SUGGESTIONS.map((q) => (
            <Pressable
              key={q}
              onPress={() => void onAsk(q)}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityLabel={`Ask: ${q}`}
              style={({ pressed }) => [s.chip, pressed && { backgroundColor: colors.lineStrong }, busy && { opacity: 0.5 }]}
            >
              <Text style={s.chipText}>{q}</Text>
            </Pressable>
          ))}
        </View>
      </>
    );
  }

  function ProgressScreen() {
    return (
      <>
        <Text style={ui.caption}>Lowest mastery first — focus here next.</Text>
        {concepts.length === 0 ? (
          <EmptyState iconName="stats-chart-outline" title="No practice yet" body="Answer a quiz question to start tracking mastery." />
        ) : (
          concepts.map((c) => (
            <MasteryRow key={c.name} name={c.name} score={c.masteryScore} subtitle={c.lastPracticedAt ? `practiced ${formatDate(c.lastPracticedAt)}` : undefined} />
          ))
        )}
        <Button label="What's due for review" variant="secondary" iconName="calendar-outline" onPress={() => navigate("review")} />
      </>
    );
  }

  function HistoryScreen() {
    return localLessons.length === 0 ? (
      <EmptyState iconName="book-outline" title="Your library is empty" body="Every lesson you create is saved here on this device.">
        <Button label="Capture your first page" iconName="camera" onPress={() => navigate("home")} style={{ alignSelf: "stretch", marginTop: space.sm }} />
      </EmptyState>
    ) : (
      <>
        <Text style={ui.caption}>
          {localLessons.length} lesson{localLessons.length === 1 ? "" : "s"} saved on this device
        </Text>
        {localLessons.map((l) => (
          <LessonRow key={l.lessonId} item={l} />
        ))}
      </>
    );
  }

  function ReviewScreen() {
    return (
      <>
        <Text style={s.h2} accessibilityRole="header">
          Due today
        </Text>
        {reviewConcepts == null ? (
          busy ? null : (
            <Button label="Load review" iconName="refresh" variant="secondary" onPress={() => void loadReview()} />
          )
        ) : reviewConcepts.length === 0 ? (
          <EmptyState iconName="checkmark-done-circle-outline" title="You're all caught up" body="Nothing is due. Practice more to schedule future reviews." />
        ) : (
          reviewConcepts.map((c) => <MasteryRow key={c.name} name={c.name} score={c.masteryScore} />)
        )}
        {localConcepts.length ? (
          <>
            <Text style={[s.h2, { marginTop: space.sm }]} accessibilityRole="header">
              All concepts on this device
            </Text>
            {localConcepts.map((c) => (
              <MasteryRow
                key={c.name}
                name={c.name}
                score={c.masteryScore}
                subtitle={c.lastPracticedAt ? `practiced ${formatDate(c.lastPracticedAt)}` : undefined}
              />
            ))}
          </>
        ) : null}
      </>
    );
  }

  function SettingsScreen() {
    return (
      <>
        <Card style={{ gap: 0, paddingVertical: space.sm }}>
          <SettingRow
            iconName="cloud-offline-outline"
            title="Offline demo mode"
            body={useMock ? "Using built-in sample lessons. No AI calls." : "Using the live AI tutor on your server."}
            right={
              <Switch
                value={useMock}
                onValueChange={setUseMock}
                trackColor={{ false: colors.lineStrong, true: colors.accent }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Offline demo mode"
              />
            }
          />
          <Divider />
          <SettingRow iconName="server-outline" title="Server" body={API_URL} />
          <Divider />
          <SettingRow
            iconName="accessibility-outline"
            title="Screen reader"
            body={screenReaderOn ? "Detected. All controls are labelled." : "Not detected."}
          />
        </Card>
        <Card style={{ gap: 0, paddingVertical: space.sm }}>
          <SettingRow iconName="book-outline" title="Saved lessons" body={`${localLessons.length} on this device`} />
          <Divider />
          <SettingRow iconName="bulb-outline" title="Tracked concepts" body={`${localConcepts.length} on this device`} />
        </Card>
        <Text style={[ui.caption, { textAlign: "center" }]}>Visual Learner · v0.1.0</Text>
      </>
    );
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  const flowTitle: Record<Flow, string> = {
    lesson: "Lesson",
    tutor: "Ask the tutor",
    practice: quizDone ? "Results" : "Practice",
    progress: "Your progress",
  };
  const tabTitle: Record<Tab, { title: string; sub: string }> = {
    home: { title: "Visual Learner", sub: "See it clearly, then remember it." },
    history: { title: "Library", sub: "Lessons you've captured." },
    review: { title: "Review", sub: "Revisit concepts before they fade." },
    settings: { title: "Settings", sub: "Tutor and device options." },
  };

  const footer = (() => {
    if (screen === "lesson" && lesson)
      return (
        <View style={s.footerRow}>
          <Button label="Ask tutor" iconName="chatbubbles-outline" variant="secondary" onPress={() => navigate("tutor")} disabled={!!busy} style={{ flex: 1 }} />
          <Button label="Quiz me" iconName="flash" onPress={() => void onPractice()} disabled={!!busy} style={{ flex: 1 }} />
        </View>
      );
    if (screen === "practice" && answered && !quizDone)
      return (
        <Button
          label={qIndex < questions.length - 1 ? "Next question" : "See results"}
          iconName={qIndex < questions.length - 1 ? "arrow-forward" : "trophy-outline"}
          onPress={onNextQuestion}
        />
      );
    if (screen === "tutor" && lesson)
      return (
        <View style={s.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask anything about this page…"
            placeholderTextColor={colors.muted}
            style={s.input}
            accessibilityLabel="Your question"
            returnKeyType="send"
            onSubmitEditing={() => void onAsk(draft)}
            editable={!busy}
            multiline={false}
          />
          <Pressable
            onPress={() => void onAsk(draft)}
            disabled={!draft.trim() || !!busy}
            accessibilityRole="button"
            accessibilityLabel="Send question"
            accessibilityState={{ disabled: !draft.trim() || !!busy }}
            style={({ pressed }) => [s.send, (!draft.trim() || busy) && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
          >
            <Icon name="arrow-up" color={colors.onAccent} />
          </Pressable>
        </View>
      );
    return null;
  })();

  // Called as functions (not <Screen/>) so state-driven re-renders don't remount inputs.
  const body: Record<Screen, () => JSX.Element> = {
    home: HomeScreen,
    history: HistoryScreen,
    review: ReviewScreen,
    settings: SettingsScreen,
    lesson: LessonScreen,
    tutor: TutorScreen,
    practice: PracticeScreen,
    progress: ProgressScreen,
  };
  const showOverlay = !!busy && !(screen === "tutor" && busy === "Thinking…");

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}>
          {isTab ? (
            <View style={s.headerInner}>
              <Text style={s.brand} accessibilityRole="header">
                {tabTitle[screen as Tab].title}
              </Text>
              <Text style={ui.caption}>{tabTitle[screen as Tab].sub}</Text>
            </View>
          ) : (
            <View style={[s.headerInner, s.flowHeader]}>
              <IconButton name="arrow-back" label="Go back" onPress={goBack} disabled={!!busy} />
              <Text style={s.flowTitle} accessibilityRole="header" numberOfLines={1}>
                {flowTitle[screen as Flow]}
              </Text>
              <IconButton name="home-outline" label="Go home" onPress={() => navigate("home")} disabled={!!busy} />
            </View>
          )}
        </View>

        {error ? (
          <View style={s.errorWrap}>
            <View style={s.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
              <Icon name="alert-circle" color={colors.danger} />
              <Text style={[ui.body, { flex: 1, color: colors.danger, fontSize: 15 }]}>{error.message}</Text>
              {error.retry ? (
                <Pressable onPress={error.retry} accessibilityRole="button" accessibilityLabel="Retry" style={s.errorBtn}>
                  <Text style={{ color: colors.danger, fontWeight: "700" }}>Retry</Text>
                </Pressable>
              ) : null}
              <IconButton name="close" label="Dismiss error" color={colors.danger} onPress={() => setError(null)} />
            </View>
          </View>
        ) : null}

        <ScrollView
          key={screen}
          ref={screen === "tutor" ? chatScroll : undefined}
          onContentSizeChange={() => screen === "tutor" && chatScroll.current?.scrollToEnd({ animated: true })}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {body[screen]()}
        </ScrollView>

        {footer ? <View style={s.footer}>{footer}</View> : null}

        {isTab ? (
          <View style={s.tabBar} accessibilityRole="tablist">
            {TABS.map((t) => {
              const on = screen === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => navigate(t.key)}
                  disabled={!!busy}
                  accessibilityRole="tab"
                  accessibilityLabel={t.label}
                  accessibilityState={{ selected: on }}
                  style={s.tab}
                >
                  <View style={[s.tabPill, on && { backgroundColor: colors.accentSoft }]}>
                    <Icon name={on ? t.iconOn : t.icon} size={icon.lg} color={on ? colors.accent : colors.muted} />
                  </View>
                  <Text style={[s.tabLabel, on && { color: colors.accent }]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {showOverlay ? (
        <View style={s.overlay} accessibilityViewIsModal accessibilityLiveRegion="polite">
          <View style={s.overlayCard}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[ui.itemTitle, { textAlign: "center" }]}>{busy}</Text>
            {busy?.startsWith("Reading") ? (
              <Text style={[ui.caption, { textAlign: "center" }]}>This usually takes 5–15 seconds.</Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ── Small presentational pieces ──────────────────────────────────────────────

function Stat({ value, label, iconName }: { value: string; label: string; iconName: IconName }) {
  return (
    <View style={[ui.card, s.stat]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={iconName} color={colors.accent} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={ui.caption}>{label}</Text>
    </View>
  );
}

const NOTICE_TONES = {
  warn: { fg: colors.warn, bg: colors.warnSoft },
  success: { fg: colors.success, bg: colors.successSoft },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  info: { fg: colors.accent, bg: colors.accentSoft },
};

function Notice({ tone, iconName, title, text }: { tone: keyof typeof NOTICE_TONES; iconName: IconName; title?: string; text: string }) {
  const t = NOTICE_TONES[tone];
  return (
    <View style={[s.notice, { backgroundColor: t.bg }]} accessibilityLiveRegion="polite">
      <Icon name={iconName} color={t.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Text style={[ui.itemTitle, { color: t.fg }]}>{title}</Text> : null}
        <Text style={[ui.body, { color: colors.text, fontSize: 15 }]}>{text}</Text>
      </View>
    </View>
  );
}

function SettingRow({ iconName, title, body, right }: { iconName: IconName; title: string; body: string; right?: JSX.Element }) {
  return (
    <View style={s.settingRow}>
      <View style={s.typeIcon}>
        <Icon name={iconName} color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={ui.itemTitle}>{title}</Text>
        <Text style={ui.caption}>{body}</Text>
      </View>
      {right}
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.line, marginLeft: 56 }} />;
}

function capitalize(v: string): string {
  return v ? v[0].toUpperCase() + v.slice(1) : v;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (/network request failed|failed to fetch|load failed/i.test(msg)) {
    return "Can't reach the Visual Learner server. Check that the API is running and you're online.";
  }
  if (/provider returned HTTP (429|5\d\d)|provider request failed/i.test(msg)) {
    return "The AI tutor is busy right now. Wait a moment and retry, or turn on offline demo mode in Settings.";
  }
  return msg || "Something went wrong. Please try again.";
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight : 0,
  },
  header: { paddingHorizontal: space.lg - 4, paddingTop: space.sm, paddingBottom: space.sm },
  headerInner: { maxWidth: 720, width: "100%", alignSelf: "center", gap: 2 },
  flowHeader: { flexDirection: "row", alignItems: "center", marginHorizontal: -space.sm },
  brand: { color: colors.text, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  flowTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  scroll: {
    padding: space.lg - 4,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    gap: space.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  h2: { color: colors.text, fontSize: 18, fontWeight: "700" },
  title: { color: colors.text, fontSize: 24, fontWeight: "800", lineHeight: 31, letterSpacing: -0.3 },
  hero: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm + 4,
    ...shadow,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: colors.onAccent, fontSize: 26, fontWeight: "800", lineHeight: 32, letterSpacing: -0.4 },
  heroBody: { color: "#E0E7FF", fontSize: 16, lineHeight: 23 },
  heroActions: { flexDirection: "row", gap: space.sm + 4, marginTop: space.sm, flexWrap: "wrap" },
  continueCard: { flexDirection: "row", alignItems: "center", gap: space.md - 4, borderColor: colors.highlightSoft },
  stats: { flexDirection: "row", gap: space.sm + 4 },
  stat: { flex: 1, alignItems: "flex-start", gap: 4, padding: space.md },
  statValue: { color: colors.text, fontSize: 22, fontWeight: "800" },
  listRow: { flexDirection: "row", alignItems: "center", gap: space.md - 4, padding: space.md },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeRow: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  stepRow: { flexDirection: "row", gap: space.md - 4, alignItems: "flex-start" },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -1,
  },
  stepNumText: { color: colors.onAccent, fontWeight: "800", fontSize: 14 },
  solution: { backgroundColor: colors.successSoft, borderRadius: radius.md, padding: space.md, gap: 4 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md - 4,
    minHeight: 56,
    padding: space.md - 2,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  choiceRight: { borderColor: colors.success, backgroundColor: colors.successSoft },
  choiceWrong: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  letter: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  letterText: { color: colors.accent, fontWeight: "800" },
  notice: { flexDirection: "row", gap: space.sm + 4, padding: space.md, borderRadius: radius.md, alignItems: "flex-start" },
  tutorIntro: { flexDirection: "row", alignItems: "center", gap: space.md - 4, padding: space.md },
  bubble: { maxWidth: "88%", padding: space.md - 2, borderRadius: radius.md + 2, gap: 6 },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  bubbleTutor: {
    alignSelf: "flex-start",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomLeftRadius: 6,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space.md - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipText: { color: colors.accent, fontWeight: "600", fontSize: 15 },
  footer: {
    paddingHorizontal: space.lg - 4,
    paddingTop: space.md - 4,
    paddingBottom: space.md - 4,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  footerRow: { flexDirection: "row", gap: space.sm + 4, maxWidth: 720, width: "100%", alignSelf: "center" },
  inputRow: { flexDirection: "row", gap: space.sm, alignItems: "center", maxWidth: 720, width: "100%", alignSelf: "center" },
  input: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    paddingHorizontal: space.md + 2,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 6,
    paddingBottom: Platform.OS === "ios" ? 0 : 8,
  },
  tab: { flex: 1, alignItems: "center", gap: 2, minHeight: 56, justifyContent: "center" },
  tabPill: { paddingHorizontal: 18, paddingVertical: 4, borderRadius: radius.pill },
  tabLabel: { fontSize: 12, fontWeight: "700", color: colors.muted },
  errorWrap: { paddingHorizontal: space.lg - 4, maxWidth: 720 + 40, width: "100%", alignSelf: "center" },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    paddingLeft: space.md - 4,
    paddingVertical: 4,
  },
  errorBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.sm },
  settingRow: { flexDirection: "row", alignItems: "center", gap: space.md - 4, paddingVertical: space.md - 4 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(30, 27, 75, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  overlayCard: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md - 4,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    ...shadow,
  },
});
