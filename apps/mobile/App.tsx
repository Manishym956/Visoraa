import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  askQuestion,
  createLesson,
  fetchPractice,
  fetchProgress,
  fetchReview,
  recordAttempt,
  setProviderOverride,
} from "./src/api";
import type {
  Depth,
  Lesson,
  PracticeQuestion,
  ProgressConcept,
  ReviewConcept,
  TutorResponse,
} from "./src/lessonView";
import { isLowConfidence, layersForDepth } from "./src/lessonView";
import {
  getLocalConcepts,
  getLocalLessons,
  saveLocalLesson,
  upsertLocalConcept,
  type LocalLesson,
} from "./src/localStore";
import { colors } from "./src/theme";
import { VisualSpecView } from "./src/VisualSpecView";

type Screen =
  | "capture"
  | "lesson"
  | "tutor"
  | "practice"
  | "progress"
  | "review"
  | "history"
  | "settings";

export default function App() {
  const [screen, setScreen] = useState<Screen>("capture");
  const [depth, setDepth] = useState<Depth>("beginner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [tutor, setTutor] = useState<TutorResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [concepts, setConcepts] = useState<ProgressConcept[]>([]);
  const [reviewConcepts, setReviewConcepts] = useState<ReviewConcept[]>([]);
  const [localLessons, setLocalLessons] = useState<LocalLesson[]>([]);
  const [localConcepts, setLocalConcepts] = useState<Awaited<ReturnType<typeof getLocalConcepts>>>([]);
  const [useMock, setUseMock] = useState(false);
  const [screenReaderOn, setScreenReaderOn] = useState(false);

  const layers = useMemo(
    () => (lesson ? layersForDepth(lesson, depth) : null),
    [lesson, depth]
  );

  // Phase 4 — detect screen reader on mount
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReaderOn);
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReaderOn);
    return () => sub.remove();
  }, []);

  // Phase 4 — load local data on mount
  useEffect(() => {
    void getLocalLessons().then(setLocalLessons).catch(() => {});
    void getLocalConcepts().then(setLocalConcepts).catch(() => {});
  }, []);

  // Phase 4 — sync provider setting to api module
  useEffect(() => {
    setProviderOverride(useMock ? "mock" : null);
  }, [useMock]);

  async function onPick(fromCamera: boolean) {
    setError(null);
    setBusy(true);
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Camera or library permission is required to capture a page.");
        return;
      }
      const pickerOptions: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.7,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);
      if (result.canceled || !result.assets[0]) {
        return;
      }
      const asset = result.assets[0];
      const name = asset.fileName || (fromCamera ? "capture.jpg" : "upload.png");
      const mime = asset.mimeType || "image/jpeg";
      const created = await createLesson({ uri: asset.uri, name, mime, depth });
      setLessonId(created.lessonId);
      setLesson(created.lesson);
      setScreen("lesson");
      setTutor(null);
      setFeedback(null);
      // Phase 4 — persist lesson metadata locally
      const localEntry: LocalLesson = {
        lessonId: created.lessonId,
        title: created.lesson.title,
        contentType: created.lesson.contentType,
        confidence: created.lesson.confidence,
        savedAt: new Date().toISOString(),
      };
      await saveLocalLesson(localEntry);
      setLocalLessons((prev) => [localEntry, ...prev.slice(0, 49)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a lesson.");
    } finally {
      setBusy(false);
    }
  }

  async function onAsk(prompt: string) {
    if (!lessonId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await askQuestion(lessonId, prompt);
      setTutor(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tutor request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onPractice() {
    if (!lessonId) return;
    setBusy(true);
    setError(null);
    try {
      const next = await fetchPractice(lessonId);
      setQuestions(next);
      setQIndex(0);
      setFeedback(null);
      setScreen("practice");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Practice failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onAnswer(choice: string) {
    if (!lessonId || !questions[qIndex]) return;
    setBusy(true);
    setError(null);
    try {
      const result = await recordAttempt(lessonId, questions[qIndex].id, choice);
      setFeedback(
        `${result.isCorrect ? "Correct" : "Not yet"}. ${result.explanation} Mastery ${result.masteryScore.toFixed(2)}.`
      );
      // Phase 4 — persist concept mastery locally
      await upsertLocalConcept({
        name: questions[qIndex].conceptName,
        masteryScore: result.masteryScore,
        lastPracticedAt: new Date().toISOString(),
      });
      setLocalConcepts(await getLocalConcepts());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the attempt.");
    } finally {
      setBusy(false);
    }
  }

  async function onProgress() {
    setBusy(true);
    setError(null);
    try {
      setConcepts(await fetchProgress());
      setScreen("progress");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Progress failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onReview() {
    setBusy(true);
    setError(null);
    try {
      setReviewConcepts(await fetchReview());
      setScreen("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review fetch failed.");
    } finally {
      setBusy(false);
    }
  }

  function resetToCapture() {
    setError(null);
    setBusy(false);
    setLessonId(null);
    setLesson(null);
    setTutor(null);
    setDraft("");
    setQuestions([]);
    setQIndex(0);
    setFeedback(null);
    setScreen("capture");
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand} accessibilityRole="header">
              Visual Learner
            </Text>
            <Text style={styles.lede}>Capture something you do not yet see clearly.</Text>
          </View>
          <Pressable
            onPress={() => setScreen("settings")}
            style={styles.settingsBtn}
            accessibilityLabel="Open settings"
            accessibilityRole="button"
            accessibilityHint="Configure provider and display options"
          >
            <Text style={styles.settingsIcon}>⚙</Text>
          </Pressable>
        </View>

        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
        {busy ? <ActivityIndicator color={colors.accent} accessibilityLabel="Loading" /> : null}

        {/* ── Capture ─────────────────────────────────────────────────── */}
        {screen === "capture" ? (
          <View style={styles.block}>
            <Text style={styles.empty} accessibilityRole="text">
              No lesson yet. Photograph a page, diagram, or equation.
            </Text>
            <DepthPicker depth={depth} onChange={setDepth} />
            <Pressable
              style={styles.button}
              onPress={() => void onPick(true)}
              accessibilityLabel="Use camera to capture learning material"
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Use camera</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={() => void onPick(false)}
              accessibilityLabel="Choose image from photo library"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Choose image</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={() => void onReview()}
              accessibilityLabel="Review concepts due today"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Review due concepts</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={() => setScreen("history")}
              accessibilityLabel="View history of saved lessons"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>
                Lesson history ({localLessons.length})
              </Text>
            </Pressable>
            <Text style={styles.hint}>
              {useMock
                ? "Provider: mock (offline). Switch in Settings to use Gemini."
                : "Provider: Gemini (live). Name files with equation/diagram/graph/text for mock fixtures."}
            </Text>
          </View>
        ) : null}

        {/* ── Lesson ──────────────────────────────────────────────────── */}
        {screen === "lesson" && lesson && layers ? (
          <View style={styles.block} accessibilityLabel={`Lesson: ${lesson.title}`}>
            <Text style={styles.kicker} accessibilityRole="text">
              {lesson.contentType} · confidence {(lesson.confidence * 100).toFixed(0)}%
            </Text>
            <Text style={styles.title} accessibilityRole="header">
              {lesson.title}
            </Text>
            {isLowConfidence(lesson.confidence) ? (
              <Text style={styles.warn} accessibilityRole="alert">
                Unsure — check the original page. This is extracted evidence plus inference.
              </Text>
            ) : null}
            <DepthPicker depth={depth} onChange={setDepth} />
            <Section label="What am I looking at?" body={lesson.summary} />
            <Section label="Evidence" body={lesson.evidence.join(" ")} />
            <Section label="Intuition" body={lesson.intuition} />
            <VisualSpecView visual={lesson.visual} />
            <Section
              label="Steps"
              body={layers.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}
            />
            {layers.technicalDetails.length ? (
              <Section label="Technical" body={layers.technicalDetails.join(" ")} />
            ) : null}
            {layers.showWorkedExample ? (
              <Section
                label="Worked example"
                body={`${lesson.workedExample.prompt}\n${lesson.workedExample.solution}`}
              />
            ) : null}
            {layers.showMistakes ? (
              <Section label="Common mistakes" body={lesson.commonMistakes.join("\n")} />
            ) : null}
            <Pressable
              style={styles.button}
              onPress={() => setScreen("tutor")}
              accessibilityLabel="Ask a question about this lesson"
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Ask about this</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={() => void onPractice()}
              accessibilityLabel="Start a practice quiz"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Quiz me</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={resetToCapture}
              accessibilityLabel="Capture another image"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Capture another</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── Tutor ───────────────────────────────────────────────────── */}
        {screen === "tutor" && lesson ? (
          <View style={styles.block}>
            <Text style={styles.title} accessibilityRole="header">
              Stay with this artifact
            </Text>
            {["Explain simpler", "Give another example", "Show the math", "Quiz me"].map(
              (label) => (
                <Pressable
                  key={label}
                  style={styles.secondary}
                  onPress={() => void onAsk(label)}
                  accessibilityLabel={label}
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryText}>{label}</Text>
                </Pressable>
              )
            )}
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask a specific question"
              placeholderTextColor={colors.muted}
              style={styles.input}
              accessibilityLabel="Custom question input"
              accessibilityHint="Type your question about the captured material"
              returnKeyType="send"
              onSubmitEditing={() => void onAsk(draft || "What is the main idea?")}
            />
            <Pressable
              style={styles.button}
              onPress={() => void onAsk(draft || "What is the main idea?")}
              accessibilityLabel="Submit question to tutor"
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Ask</Text>
            </Pressable>
            {tutor ? (
              <View accessibilityLabel={`Answer: ${tutor.answer}`}>
                <Section label="Answer" body={tutor.answer} />
                <Text style={styles.hint}>
                  Confidence {(tutor.confidence * 100).toFixed(0)}% ·{" "}
                  {tutor.references.join(" · ")}
                </Text>
              </View>
            ) : (
              <Text style={styles.empty}>
                No question yet. Keep it about the captured page.
              </Text>
            )}
            <Pressable
              style={styles.secondary}
              onPress={() => setScreen("lesson")}
              accessibilityLabel="Back to lesson"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Back to lesson</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={resetToCapture}
              accessibilityLabel="Capture another image"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Capture another</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── Practice ────────────────────────────────────────────────── */}
        {screen === "practice" && questions[qIndex] ? (
          <View style={styles.block}>
            <Text style={styles.kicker} accessibilityRole="text">
              Question {qIndex + 1} of {questions.length} · {questions[qIndex].kind}
            </Text>
            <Text style={styles.title} accessibilityRole="header">
              {questions[qIndex].prompt}
            </Text>
            {questions[qIndex].choices.map((choice, idx) => (
              <Pressable
                key={choice}
                style={styles.secondary}
                onPress={() => void onAnswer(choice)}
                accessibilityLabel={`Choice ${idx + 1}: ${choice}`}
                accessibilityRole="button"
                accessibilityHint="Tap to select this answer"
              >
                <Text style={styles.secondaryText}>{choice}</Text>
              </Pressable>
            ))}
            <Text style={styles.hint} accessibilityLabel={`Hint: ${questions[qIndex].hint}`}>
              Hint: {questions[qIndex].hint}
            </Text>
            {feedback ? (
              <Section label="After answering" body={feedback} />
            ) : (
              <Text style={styles.empty}>Choose an answer. You will get the explanation next.</Text>
            )}
            {feedback && qIndex < questions.length - 1 ? (
              <Pressable
                style={styles.button}
                onPress={() => {
                  setQIndex((i) => i + 1);
                  setFeedback(null);
                }}
                accessibilityLabel="Next question"
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Next question</Text>
              </Pressable>
            ) : null}
            {feedback && qIndex === questions.length - 1 ? (
              <Pressable
                style={styles.button}
                onPress={() => void onProgress()}
                accessibilityLabel="See weak concepts"
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>See weak concepts</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ── Progress ────────────────────────────────────────────────── */}
        {screen === "progress" ? (
          <View style={styles.block}>
            <Text style={styles.title} accessibilityRole="header">
              Concepts to revisit
            </Text>
            {concepts.length === 0 ? (
              <Text style={styles.empty}>No practice yet. Complete a question first.</Text>
            ) : (
              concepts.map((concept) => (
                <View
                  key={concept.name}
                  style={styles.row}
                  accessibilityLabel={`${concept.name}: mastery ${concept.masteryScore.toFixed(2)}`}
                >
                  <Text style={styles.nodeLabel}>{concept.name}</Text>
                  <Text style={styles.hint}>mastery {concept.masteryScore.toFixed(2)}</Text>
                </View>
              ))
            )}
            <Pressable
              style={styles.secondary}
              onPress={() => void onReview()}
              accessibilityLabel="See review due today"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>See review due today</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={resetToCapture}
              accessibilityLabel="Capture another image"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Capture another</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── Review ──────────────────────────────────────────────────── */}
        {screen === "review" ? (
          <View style={styles.block}>
            <Text style={styles.title} accessibilityRole="header">
              Review due today
            </Text>
            {reviewConcepts.length === 0 ? (
              <View>
                <Text style={styles.empty}>Nothing due — you are ahead of schedule.</Text>
                <Text style={styles.hint}>Practice more questions to schedule future reviews.</Text>
              </View>
            ) : (
              reviewConcepts.map((concept) => {
                const pct = Math.round(concept.masteryScore * 100);
                return (
                  <View
                    key={concept.name}
                    style={styles.reviewCard}
                    accessibilityLabel={`${concept.name}: mastery ${pct}%`}
                  >
                    <Text style={styles.nodeLabel}>{concept.name}</Text>
                    <View style={styles.masteryBarBg} accessibilityElementsHidden>
                      <View
                        style={[styles.masteryBarFill, { width: `${pct}%` as unknown as number }]}
                      />
                    </View>
                    <Text style={styles.hint}>mastery {pct}%</Text>
                  </View>
                );
              })
            )}
            <Pressable
              style={styles.button}
              onPress={resetToCapture}
              accessibilityLabel="Capture image to practise"
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Capture to practise</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={resetToCapture}
              accessibilityLabel="Back to home screen"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Back to home</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── History ─────────────────────────────────────────────────── */}
        {screen === "history" ? (
          <View style={styles.block}>
            <Text style={styles.title} accessibilityRole="header">
              Lesson history
            </Text>
            {localLessons.length === 0 ? (
              <Text style={styles.empty}>No lessons saved on device yet.</Text>
            ) : (
              localLessons.map((l) => (
                <View
                  key={l.lessonId}
                  style={styles.historyCard}
                  accessibilityLabel={`${l.title}, ${l.contentType}, confidence ${Math.round(l.confidence * 100)}%`}
                >
                  <Text style={styles.nodeLabel}>{l.title}</Text>
                  <Text style={styles.kicker}>
                    {l.contentType} · {Math.round(l.confidence * 100)}% confidence
                  </Text>
                  <Text style={styles.hint}>{l.savedAt.slice(0, 10)}</Text>
                </View>
              ))
            )}
            <Text style={styles.sectionDivider}>On-device mastery</Text>
            {localConcepts.length === 0 ? (
              <Text style={styles.empty}>No concept scores cached locally yet.</Text>
            ) : (
              localConcepts.map((c) => {
                const pct = Math.round(c.masteryScore * 100);
                return (
                  <View
                    key={c.name}
                    style={styles.reviewCard}
                    accessibilityLabel={`${c.name}: ${pct}% mastery`}
                  >
                    <Text style={styles.nodeLabel}>{c.name}</Text>
                    <View style={styles.masteryBarBg} accessibilityElementsHidden>
                      <View
                        style={[styles.masteryBarFill, { width: `${pct}%` as unknown as number }]}
                      />
                    </View>
                    <Text style={styles.hint}>{pct}%</Text>
                  </View>
                );
              })
            )}
            <Pressable
              style={styles.secondary}
              onPress={resetToCapture}
              accessibilityLabel="Back to home"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Back to home</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── Settings ────────────────────────────────────────────────── */}
        {screen === "settings" ? (
          <View style={styles.block}>
            <Text style={styles.title} accessibilityRole="header">
              Settings
            </Text>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.nodeLabel}>Use mock provider (offline)</Text>
                <Text style={styles.hint}>
                  {useMock
                    ? "Responses come from local fixtures — no API key needed."
                    : "Responses come from Gemini (requires GEMINI_API_KEY on the server)."}
                </Text>
              </View>
              <Switch
                value={useMock}
                onValueChange={setUseMock}
                thumbColor={useMock ? colors.accent : colors.muted}
                trackColor={{ false: colors.line, true: colors.line }}
                accessibilityLabel="Toggle mock provider"
                accessibilityHint={
                  useMock ? "Currently offline mock mode" : "Currently using Gemini live mode"
                }
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.nodeLabel}>Screen reader detected</Text>
                <Text style={styles.hint}>
                  {screenReaderOn ? "Active — all interactive elements have labels." : "Not active."}
                </Text>
              </View>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.nodeLabel}>Local lesson cache</Text>
                <Text style={styles.hint}>{localLessons.length} lessons stored on device.</Text>
              </View>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.nodeLabel}>Local concept mastery</Text>
                <Text style={styles.hint}>
                  {localConcepts.length} concepts cached on device.
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.secondary}
              onPress={resetToCapture}
              accessibilityLabel="Back to home"
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Back to home</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function DepthPicker({
  depth,
  onChange,
}: {
  depth: Depth;
  onChange: (value: Depth) => void;
}) {
  return (
    <View
      style={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel="Select learning depth"
    >
      {(["beginner", "standard", "advanced"] as Depth[]).map((value) => (
        <Pressable
          key={value}
          onPress={() => onChange(value)}
          style={[styles.chip, depth === value && styles.chipOn]}
          accessibilityRole="radio"
          accessibilityLabel={value}
          accessibilityState={{ selected: depth === value }}
        >
          <Text style={styles.chipText}>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <View style={styles.section} accessibilityLabel={`${label}: ${body}`}>
      <Text style={styles.kicker}>{label}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: 24,
    paddingTop: 56,
    gap: 16,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brand: {
    color: colors.accent,
    fontSize: 14,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  lede: { color: colors.text, fontSize: 28, fontWeight: "600", lineHeight: 34 },
  settingsBtn: { padding: 8 },
  settingsIcon: { color: colors.muted, fontSize: 22 },
  block: { gap: 12 },
  title: { color: colors.text, fontSize: 22, fontWeight: "600" },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  body: { color: colors.text, fontSize: 16, lineHeight: 24 },
  empty: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  error: { color: colors.danger, fontSize: 15 },
  warn: { color: colors.warn, fontSize: 15, lineHeight: 22 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  buttonText: { color: colors.bg, fontWeight: "700" },
  secondaryText: { color: colors.text, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    padding: 12,
    fontSize: 16,
    minHeight: 48,
  },
  section: { gap: 6 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  chipOn: { borderColor: colors.accent },
  chipText: { color: colors.text, textTransform: "capitalize" },
  nodeLabel: { color: colors.text, fontSize: 16, fontWeight: "600" },
  sectionDivider: {
    color: colors.muted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 8,
  },
  reviewCard: {
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 8,
  },
  historyCard: {
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 4,
  },
  masteryBarBg: {
    height: 6,
    backgroundColor: colors.line,
    borderRadius: 3,
    overflow: "hidden",
  },
  masteryBarFill: {
    height: 6,
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 12,
  },
  settingInfo: { flex: 1, gap: 4 },
});
