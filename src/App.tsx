import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./App.css";
import questionsJson from "./data/questions.json";
import { scoreAnswers } from "./scoring";
import {
  CHEMISTRY_TOPICS,
  MATHS_TOPICS,
  PASS_MARK,
  PHYSICS_TOPICS,
  REFERRAL_TYPE_LABEL,
  REFERRER_EMPLOYEE_EMAIL,
  REFERRER_EMPLOYEE_NAME,
  TEST_DURATION_SECONDS,
  TEST_WINDOW_END,
  TEST_WINDOW_START,
  TOTAL_MARKS,
  type QuestionItem,
  type Subject,
} from "./testConfig";

const QUESTIONS = questionsJson as QuestionItem[];

/** After the test ends, refresh shows this result again (same browser tab / session). */
const SESSION_FINAL_KEY = "bud-test-final-result";

type StoredFinalResult = { v: 1; score: number; passed: boolean };

function readStoredFinalResult(): StoredFinalResult | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_FINAL_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (
      o &&
      typeof o === "object" &&
      (o as StoredFinalResult).v === 1 &&
      typeof (o as StoredFinalResult).score === "number" &&
      typeof (o as StoredFinalResult).passed === "boolean"
    ) {
      return o as StoredFinalResult;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredFinalResult(score: number, passed: boolean): void {
  try {
    sessionStorage.setItem(
      SESSION_FINAL_KEY,
      JSON.stringify({ v: 1, score, passed } satisfies StoredFinalResult)
    );
  } catch {
    /* quota / private mode */
  }
}

const SUBJECT_ORDER: Subject[] = ["Maths", "Physics", "Chemistry"];

const SUBJECT_LABEL: Record<Subject, string> = {
  Maths: "Maths (15 topics) — 50 questions",
  Physics: "Physics (5 topics) — 25 questions",
  Chemistry: "Chemistry (5 topics) — 25 questions",
};

/** One clear point per line for the instructions panel. */
function getInstructionPoints(): string[] {
  return [
    "The test duration is 150 minutes (2 hours 30 minutes).",
    `The paper carries ${TOTAL_MARKS} marks. You need at least ${PASS_MARK} marks to pass.`,
    "Questions are from Mathematics, Physics, and Chemistry — Class 9 level (IIT foundation style).",
    "About half the questions are multiple choice; the other half are fill in the blanks.",
    "Malpractice is not allowed. Do not switch browser tabs or windows, do not minimize the test window, and do not leave the camera view.",
    "No one other than you may be in the room or help you during the test.",
    "If you lose internet or the session drops, the test may be ended. Use a stable connection before you start.",
    "You may use only a notebook and a pen. Do not use textbooks, phones, extra devices, or calculators unless the question says so.",
    "Your eyes and upper body are monitored. Keep your full upper half clearly visible in the camera at all times.",
    "Read every question carefully. You may scroll through the paper and change answers until the timer runs out.",
    "By starting the test, you agree to follow these instructions and the integrity rules of the Freshworks Bud program.",
  ];
}

function isValidEmail(value: string): boolean {
  const t = value.trim();
  if (t.length < 5 || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatCountdownMinutesSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} minute${m === 1 ? "" : "s"}, ${s} second${s === 1 ? "" : "s"}`;
}

type AnswersMap = Record<number, string>;

function isQuestionAnswered(q: QuestionItem, answers: AnswersMap): boolean {
  const raw = answers[q.id];
  if (raw == null) return false;
  return String(raw).trim().length > 0;
}

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Seconds remaining until scheduled window end (wall clock; survives refresh). */
function secondsRemainingInTestWindow(): number {
  return Math.max(
    0,
    Math.floor((+TEST_WINDOW_END - Date.now()) / 1000)
  );
}

export default function App() {
  const [page, setPage] = useState<1 | 2 | 3>(() =>
    readStoredFinalResult() ? 3 : 1
  );
  const [finalResult, setFinalResult] = useState<{
    score: number;
    passed: boolean;
  } | null>(() => {
    const s = readStoredFinalResult();
    return s ? { score: s.score, passed: s.passed } : null;
  });
  const [email, setEmail] = useState("");
  const [countdownToStart, setCountdownToStart] = useState(0);
  const [testTimeLeft, setTestTimeLeft] = useState(secondsRemainingInTestWindow);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [cameraPreviewReady, setCameraPreviewReady] = useState(false);
  /** Must click "Ready for test" (with valid email) before the test page can open when time is up. */
  const [readyConfirmed, setReadyConfirmed] = useState(false);
  const [tabSwitchWarning, setTabSwitchWarning] = useState(false);
  /** State (not only a ref) so attaching to the video element re-runs after refresh / mount. */
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const answersRef = useRef<AnswersMap>({});
  answersRef.current = answers;

  const emailOk = isValidEmail(email);

  const questionsBySubject = useMemo(() => {
    const map: Record<Subject, QuestionItem[]> = {
      Maths: [],
      Physics: [],
      Chemistry: [],
    };
    for (const q of QUESTIONS) {
      map[q.subject].push(q);
    }
    return map;
  }, []);

  const sectionProgress = useMemo(() => {
    return SUBJECT_ORDER.map((subject) => {
      const qs = questionsBySubject[subject];
      let answered = 0;
      for (const q of qs) {
        if (isQuestionAnswered(q, answers)) answered += 1;
      }
      const total = qs.length;
      return {
        subject,
        total,
        answered,
        unattended: total - answered,
      };
    });
  }, [questionsBySubject, answers]);

  // Countdown until scheduled test start; page 2 only if email + Ready clicked AND time reached
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((+TEST_WINDOW_START - now) / 1000));
      setCountdownToStart(diff);
      const canEnterTest =
        diff === 0 &&
        page === 1 &&
        emailOk &&
        readyConfirmed &&
        mediaStream != null;
      if (canEnterTest) {
        setTestTimeLeft(secondsRemainingInTestWindow());
        setPage(2);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [page, emailOk, readyConfirmed, mediaStream]);

  const goToFinalResults = useCallback(() => {
    const s = scoreAnswers(QUESTIONS, answersRef.current);
    const p = s >= PASS_MARK;
    writeStoredFinalResult(s, p);
    setFinalResult({ score: s, passed: p });
    setPage(3);
  }, []);

  // Test time left from wall clock (TEST_WINDOW_END) — refresh-safe
  useEffect(() => {
    if (page !== 2) return;
    const tick = () => {
      const left = secondsRemainingInTestWindow();
      setTestTimeLeft(left);
      if (left <= 0) goToFinalResults();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [page, goToFinalResults]);

  // Stop camera when the test ends (timer or early submit)
  useEffect(() => {
    if (page !== 3) return;
    setMediaStream((prev) => {
      stopMediaStream(prev);
      return null;
    });
  }, [page]);

  // Tab / window visibility (malpractice warning)
  useEffect(() => {
    if (page !== 2) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") setTabSwitchWarning(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [page]);

  useEffect(() => {
    if (page !== 1 || emailOk) return;
    setMediaStream((prev) => {
      stopMediaStream(prev);
      return null;
    });
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraPreviewReady(false);
    setReadyConfirmed(false);
  }, [page, emailOk]);

  // Bind camera stream to whichever <video> is mounted (fixes black preview after refresh)
  useLayoutEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (mediaStream) {
      el.srcObject = mediaStream;
      void el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [mediaStream, page, cameraPreviewReady]);

  const startCameraPreview = useCallback(async () => {
    if (!isValidEmail(email)) return;
    try {
      setMediaStream((prev) => {
        stopMediaStream(prev);
        return null;
      });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      setMediaStream(stream);
      setCameraPreviewReady(true);
    } catch {
      setMediaStream(null);
      setCameraPreviewReady(false);
      alert("Camera access was denied. Allow camera to proceed with the test.");
    }
  }, [email]);

  const handleReadyForTest = () => {
    if (!emailOk) return;
    setReadyConfirmed(true);
    void startCameraPreview();
  };

  const setAnswer = (id: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const score = useMemo(
    () => scoreAnswers(QUESTIONS, answers),
    [answers]
  );
  const passed = score >= PASS_MARK;

  const resultScore = finalResult?.score ?? score;
  const resultPassed = finalResult?.passed ?? passed;

  const handleSubmitTestEarly = () => {
    if (
      !window.confirm(
        "Submit your answers now?\n\n" +
          "• You will NOT be able to change your answers after this.\n" +
          "• Your result will be saved in this browser session.\n" +
          "• If you refresh the page later, you will ONLY see this result screen — not the instructions or the question paper again (until you clear this site’s session data or use a private window for a new attempt).\n\n" +
          "Only click OK if you are sure you want to finish the test now."
      )
    ) {
      return;
    }
    goToFinalResults();
  };

  // —— Page 1 ——
  if (page === 1) {
    return (
      <div className="bud-page bud-landing">
        <div className="bud-landing__card bud-landing__card--wide">
          <header className="bud-landing__hero">
            <img
              className="bud-brand-logo"
              src="/freshworks-wordmark.svg"
              alt="Freshworks"
              width={200}
              height={40}
              decoding="async"
            />
            <h1 className="bud-landing__title">
              Freshworks bud program Entrance test
            </h1>
            <dl className="bud-referral-meta" aria-label="Referral details">
              <div className="bud-referral-meta__row">
                <dt className="bud-referral-meta__label">Type</dt>
                <dd className="bud-referral-meta__value">{REFERRAL_TYPE_LABEL}</dd>
              </div>
              <div className="bud-referral-meta__row">
                <dt className="bud-referral-meta__label">Employee email ID</dt>
                <dd className="bud-referral-meta__value">
                  {REFERRER_EMPLOYEE_EMAIL}
                </dd>
              </div>
              <div className="bud-referral-meta__row">
                <dt className="bud-referral-meta__label">Employee name</dt>
                <dd className="bud-referral-meta__value">
                  {REFERRER_EMPLOYEE_NAME}
                </dd>
              </div>
            </dl>
            <p className="bud-landing__sub">
              Scheduled:{" "}
              {TEST_WINDOW_START.toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              —{" "}
              {TEST_WINDOW_END.toLocaleTimeString(undefined, {
                timeStyle: "short",
              })}{" "}
              ({formatDuration(TEST_DURATION_SECONDS)} paper)
            </p>
          </header>

          <section
            className="bud-rules-section"
            aria-labelledby="bud-rules-heading"
          >
            <h2 id="bud-rules-heading" className="bud-rules__heading">
              Instructions
            </h2>
            <ol className="bud-rules bud-rules--numbered" aria-label="Test instructions">
              {getInstructionPoints().map((text, index) => (
                <li key={index} className="bud-rules__item">
                  {text}
                </li>
              ))}
            </ol>
          </section>

          <section
            className="bud-submit-warning-section"
            aria-labelledby="bud-submit-warning-heading"
          >
            <h2 id="bud-submit-warning-heading" className="bud-submit-warning-section__title">
              Before you use “Submit answers”
            </h2>
            <div className="bud-submit-warning-section__body">
              <p>
                <strong>Submitting ends your test for good.</strong> After you confirm{" "}
                <strong>Submit answers</strong> on the question paper (or when the timer
                reaches zero), your score is final.
              </p>
              <p>
                <strong>Refreshing the page after that</strong> will{" "}
                <strong>only show your result again</strong> — not this instructions page
                or the questions. That is so your outcome is not lost by accident. To
                practice again in the same browser you would need to clear site data for
                this page or use a new private/incognito window.
              </p>
              <p className="bud-submit-warning-section__emphasis">
                Do not click Submit until you are finished and sure — there is no way to
                go back to the paper through refresh once the result is shown.
              </p>
            </div>
          </section>

          <section
            className="bud-syllabus"
            aria-labelledby="bud-syllabus-heading"
          >
            <h2 id="bud-syllabus-heading" className="bud-syllabus__title">
              Syllabus outline
            </h2>
            <div className="bud-syllabus__grid">
              <div>
                <h3 className="bud-syllabus__subject">Maths (15 topics)</h3>
                <ul className="bud-syllabus__list">
                  {MATHS_TOPICS.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="bud-syllabus__subject">Physics (5 topics)</h3>
                <ul className="bud-syllabus__list">
                  {PHYSICS_TOPICS.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="bud-syllabus__subject">Chemistry (5 topics)</h3>
                <ul className="bud-syllabus__list">
                  {CHEMISTRY_TOPICS.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <div className="bud-landing__row">
            <input
              type="email"
              className="bud-input"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <button
              type="button"
              className="bud-btn bud-btn--primary"
              disabled={!emailOk}
              onClick={handleReadyForTest}
            >
              {emailOk
                ? readyConfirmed
                  ? "Ready — waiting for start time"
                  : "Ready for test"
                : "Enter a valid email"}
            </button>
          </div>

          <p className="bud-hint">
            You need a valid email, must click <strong>Ready for test</strong>{" "}
            (and allow the camera), and the start time must be reached before the
            question paper opens. If you refresh <strong>before</strong> your final
            result is shown, you may lose your place on the paper and start again from
            here. After your result is shown, refresh only repeats the result screen
            (see warning above).
          </p>

          {countdownToStart === 0 &&
          page === 1 &&
          (!emailOk || !readyConfirmed) ? (
            <p className="bud-landing__gate-alert" role="status">
              The test window has started. To enter, enter a valid email address
              and click <strong>Ready for test</strong>. Until both are done, the
              paper will not open.
            </p>
          ) : null}

          {cameraPreviewReady ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="bud-video"
              aria-label="Camera preview"
            />
          ) : null}

          <div className="bud-countdown">
            <div className="bud-countdown__label">Test starts in</div>
            <div className="bud-countdown__value" aria-live="polite">
              {formatCountdownMinutesSeconds(countdownToStart)}
            </div>
            <div className="bud-countdown__alt">
              ({formatDuration(countdownToStart)})
            </div>
          </div>
        </div>
      </div>
    );
  }

  // —— Page 2 ——
  if (page === 2) {
    return (
      <div className="bud-page bud-test">
        <aside
          className="bud-test__float-panel"
          aria-label="Status: time remaining and section progress"
        >
          <div className="bud-test__timer-block">
            <span className="bud-test__timer-label">Time left</span>
            <div className="bud-timer" role="timer" aria-live="polite">
              {formatDuration(testTimeLeft)}
            </div>
          </div>
          <div className="bud-section-progress">
            <h3 className="bud-section-progress__title">Section progress</h3>
            <ul className="bud-section-progress__list">
              {sectionProgress.map(
                ({ subject, total, answered, unattended }) => (
                  <li key={subject} className="bud-section-progress__row">
                    <span className="bud-section-progress__name">{subject}</span>
                    <span className="bud-section-progress__counts">
                      <span className="bud-section-progress__done" title="Answered">
                        {answered} done
                      </span>
                      <span className="bud-section-progress__sep" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={
                          unattended > 0
                            ? "bud-section-progress__pending"
                            : "bud-section-progress__pending bud-section-progress__pending--zero"
                        }
                        title="Not attended"
                      >
                        {unattended} left
                      </span>
                    </span>
                    <span className="bud-section-progress__total">/ {total}</span>
                  </li>
                )
              )}
            </ul>
          </div>
          <div className="bud-test__submit-wrap">
            <p className="bud-test__submit-hint">
              Finished early? <strong>Submit answers</strong> locks your score. After
              that, refreshing will only show your result — not the paper. Only submit
              when you are sure.
            </p>
            <button
              type="button"
              className="bud-btn bud-btn--primary bud-test__submit-btn"
              onClick={handleSubmitTestEarly}
            >
              Submit answers
            </button>
          </div>
        </aside>

        <div className="bud-test__body">
          {tabSwitchWarning ? (
            <div className="bud-tab-warning" role="alert">
              Warning: You left the test tab. Stay on this page and keep the
              camera on. Repeated switching may be treated as malpractice.
              <button
                type="button"
                className="bud-tab-warning__dismiss"
                onClick={() => setTabSwitchWarning(false)}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          <header className="bud-test__header bud-test__header--with-brand">
            <img
              className="bud-brand-logo"
              src="/freshworks-wordmark.svg"
              alt="Freshworks"
              width={200}
              height={40}
              decoding="async"
            />
            <h2 className="bud-test__title">Freshworks Bud — Entrance test</h2>
          </header>

          <div className="bud-test__questions-wrap">
          <div className="bud-test__sections">
          {SUBJECT_ORDER.map((subject) => (
            <section key={subject} className="bud-section">
              <h3 className="bud-section__heading">
                {subject === "Physics" ? "⚛️ " : subject === "Chemistry" ? "🧪 " : ""}
                {SUBJECT_LABEL[subject]}
              </h3>
              <div className="bud-grid">
                {questionsBySubject[subject].map((q) => {
                  const answeredHere = isQuestionAnswered(q, answers);
                  return (
                  <div
                    key={q.id}
                    className={
                      answeredHere
                        ? "bud-qcard"
                        : "bud-qcard bud-qcard--unanswered"
                    }
                    aria-invalid={answeredHere ? undefined : true}
                  >
                    <p className="bud-qcard__meta">
                      Q{q.id} · {q.type === "mcq" ? "Multiple choice" : "Fill in the blank"}
                    </p>
                    <p className="bud-qcard__text">{q.question}</p>
                    {q.type === "mcq" && q.options ? (
                      <fieldset className="bud-mcq">
                        <legend className="bud-sr-only">Choose one answer</legend>
                        {q.options.map((opt) => (
                          <label key={opt} className="bud-mcq__option">
                            <input
                              type="radio"
                              name={`question-${q.id}`}
                              value={opt}
                              checked={answers[q.id] === opt}
                              onChange={() => setAnswer(q.id, opt)}
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </fieldset>
                    ) : (
                      <input
                        type="text"
                        className="bud-qcard__input"
                        placeholder="Type your answer"
                        value={answers[q.id] ?? ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        aria-label={`Answer for question ${q.id}`}
                      />
                    )}
                  </div>
                  );
                })}
              </div>
            </section>
          ))}
          </div>
          </div>
        </div>

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="bud-pip"
          aria-label="Camera preview"
        />
      </div>
    );
  }

  // —— Page 3 ——
  return (
    <div className="bud-page bud-result">
      <div className="bud-result__card">
        <header className="bud-result__header">
          <img
            className="bud-brand-logo"
            src="/freshworks-wordmark.svg"
            alt="Freshworks"
            width={200}
            height={40}
            decoding="async"
          />
          <h1 className="bud-result__title">Your result</h1>
        </header>
        <p className="bud-result__scoreline">Marks obtained</p>
        <p className="bud-result__score">
          {resultScore}
          <span className="bud-result__outof"> / {TOTAL_MARKS}</span>
        </p>
        <p
          className={
            resultPassed
              ? "bud-result__msg bud-result__msg--pass"
              : "bud-result__msg bud-result__msg--fail"
          }
        >
          {resultPassed
            ? "Congratulations! You have passed the Freshworks Bud program entrance test."
            : "We are sorry — you did not reach the pass mark this time. Better luck next time!"}
        </p>
        <p className="bud-result__refresh-note">
          If you refresh this page, you will keep seeing this result until you clear
          this site’s data for this browser or open a new private window.
        </p>
      </div>
    </div>
  );
}
