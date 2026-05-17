import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Attempt, ExamSession, Question, UserState } from "../types/models";
import { addAttempt, getAttemptsBySession, saveSession } from "../lib/db";
import { gradeByType } from "../lib/grading";
import { newId } from "../lib/id";
import { buildSessionSummary } from "../lib/stats";
import { Celebration } from "../components/Celebration";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GEMINI_MODEL,
  gradeEssayWithAnthropic,
  gradeEssayWithGemini,
} from "../lib/aiGrading";
import { typeLabel } from "../lib/util";
import { formatSessionSubtitle } from "../layout/pageInfo";

const PASS = 0.7;

/** 다빈칸 답을 시도(userAnswer)에 JSON으로 저장 */
const BLANK_ANS_PREFIX = "SA_BLANKS:";
function encodeBlanks(b: string[]): string {
  return BLANK_ANS_PREFIX + JSON.stringify(b);
}
function decodeBlanks(s: string | undefined): string[] | null {
  if (!s || !s.startsWith(BLANK_ANS_PREFIX)) return null;
  try {
    const v = JSON.parse(s.slice(BLANK_ANS_PREFIX.length)) as unknown;
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
  } catch {
    /* ignore */
  }
  return null;
}

function qToMap(questions: Question[]) {
  const m = new Map<string, Question>();
  for (const q of questions) m.set(q.id, q);
  return m;
}

type Props = {
  session: ExamSession;
  questions: Question[];
  user: UserState;
  patchUser: (p: (u: UserState) => UserState) => void;
  onBack: () => void;
  onResult: (s: ExamSession) => void;
};

function attemptRecord(
  sessionId: string,
  q: Question,
  userAnswer: string,
  isCorrect: boolean,
  score: number,
  feedback: string,
  mode?: Attempt["essayGradingMode"]
): Attempt {
  return {
    id: newId(),
    questionId: q.id,
    userAnswer,
    isCorrect,
    score,
    feedback,
    timestamp: new Date().toISOString(),
    examSessionId: sessionId,
    essayGradingMode: mode,
  };
}

export function SessionPage({ session, questions, user, patchUser, onBack, onResult }: Props) {
  const byId = useMemo(() => qToMap(questions), [questions]);
  const [idx, setIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [detail, setDetail] = useState<string | undefined>(undefined);
  const [showParty, setShowParty] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFeedback, setAiFeedback] = useState("");
  const [attemptByQ, setAttemptByQ] = useState(() => new Map<string, Attempt>());
  const [attemptsReady, setAttemptsReady] = useState(false);
  const lastIdxRef = useRef(0);
  /** short_answer + blanks: 빈칸별 입력 */
  const [blankInputs, setBlankInputs] = useState<string[]>([]);
  const [perBlankResult, setPerBlankResult] = useState<boolean[] | null>(null);

  const list = session.questionIds;
  const current = byId.get(list[idx]!);

  const isBookmarked = current ? user.bookmarkedQuestionIds.includes(current.id) : false;

  const playCorrect = useCallback(() => {
    if (user.settings.animationOn) {
      setShowParty(true);
      setTimeout(() => {
        setShowParty(false);
      }, 1000);
    }
  }, [user.settings.animationOn]);

  const applyResult = useCallback(
    (correct: boolean) => {
      patchUser((u) => {
        const wrong = new Set(u.wrongQuestionIds);
        if (current && !correct) wrong.add(current.id);
        if (current && correct) wrong.delete(current.id);
        return { ...u, wrongQuestionIds: Array.from(wrong) };
      });
    },
    [current, patchUser]
  );

  const persist = useCallback(
    async (at: Attempt) => {
      await addAttempt(at);
      setAttemptByQ((prev) => {
        const m = new Map(prev);
        m.set(at.questionId, at);
        return m;
      });
    },
    []
  );

  const onToggleBookmark = useCallback(() => {
    if (!current) return;
    patchUser((u) => {
      const s = new Set(u.bookmarkedQuestionIds);
      if (s.has(current.id)) s.delete(current.id);
      else s.add(current.id);
      return { ...u, bookmarkedQuestionIds: Array.from(s) };
    });
  }, [current, patchUser]);

  useEffect(() => {
    lastIdxRef.current = 0;
    setIdx(0);
    setAttemptsReady(false);
    let c = true;
    void (async () => {
      const all = await getAttemptsBySession(session.id);
      if (!c) return;
      const m = new Map<string, Attempt>();
      for (const a of all) {
        const p = m.get(a.questionId);
        if (!p || p.timestamp < a.timestamp) m.set(a.questionId, a);
      }
      setAttemptByQ(m);
      setAttemptsReady(true);
    })();
    return () => { c = false; };
  }, [session.id]);

  useEffect(() => {
    if (!attemptsReady) return;
    const qid = list[idx]!;
    const a = attemptByQ.get(qid);
    const currentQ = byId.get(qid);
    if (!currentQ) return;

    setShowParty(false);
    if (a) {
      setSubmitted(true);
      setIsCorrect(a.isCorrect);
      setAiError(null);

      if (
        (currentQ.type === "essay" || currentQ.type === "short_sentence") &&
        a.essayGradingMode === "ai" &&
        a.feedback
      ) {
        setUserAnswer(a.userAnswer);
        setBlankInputs([]);
        setPerBlankResult(null);
        setAiError(null);
        setAiFeedback(a.feedback);
        setDetail(
          a.score != null
            ? `AI: ${(a.score * 100).toFixed(0)}점${a.feedback ? " · (피드백 저장됨)" : ""}`
            : a.feedback
        );
        return;
      }
      if (currentQ.type === "short_answer" && (currentQ.answer.blanks?.length ?? 0) > 0) {
        const n = currentQ.answer.blanks!.length;
        const dec = decodeBlanks(a.userAnswer);
        const row = dec && dec.length === n ? dec : Array(n).fill("").map((_, i) => (i === 0 && !dec ? a.userAnswer : ""));
        setBlankInputs(row);
        setUserAnswer("");
        setAiFeedback("");
        setDetail(a.feedback);
        const g = gradeByType("short_answer", currentQ, "", row);
        setPerBlankResult(g.perBlank ?? null);
        return;
      }
      setUserAnswer(a.userAnswer);
      setBlankInputs([]);
      setPerBlankResult(null);
      setAiFeedback("");
      setDetail(a.feedback);
    } else {
      if (lastIdxRef.current !== idx) {
        if (currentQ.type === "short_answer" && (currentQ.answer.blanks?.length ?? 0) > 0) {
          setBlankInputs(Array(currentQ.answer.blanks!.length).fill(""));
        } else {
          setBlankInputs([]);
        }
        setUserAnswer("");
        setSubmitted(false);
        setIsCorrect(false);
        setDetail(undefined);
        setAiFeedback("");
        setAiError(null);
        setPerBlankResult(null);
      }
    }
    lastIdxRef.current = idx;
  }, [idx, list, attemptByQ, attemptsReady, byId]);

  const goNext = useCallback(() => {
    if (idx + 1 < list.length) {
      setIdx((i) => i + 1);
      return;
    }
    void (async () => {
      const attempts = await getAttemptsBySession(session.id);
      const tps = (qid: string) => byId.get(qid)!.type;
      const sm = buildSessionSummary(attempts, tps);
      const s2: ExamSession = { ...session, endedAt: new Date().toISOString(), resultSummary: sm };
      await saveSession(s2);
      onResult(s2);
    })();
  }, [byId, idx, list.length, onResult, session]);

  const goPrev = useCallback(() => {
    if (idx > 0) setIdx((i) => i - 1);
  }, [idx]);

  const goNextUnsub = useCallback(() => {
    if (idx + 1 < list.length) setIdx((i) => i + 1);
  }, [idx, list.length]);

  if (!current) {
    return (
      <div className="card">
        <p className="bad">문제 id가 누락됐어요(삭제됨?)</p>
        <button className="btn btn-ghost" type="button" onClick={onBack}>
          ← 돌아가기
        </button>
      </div>
    );
  }

  const isMultiShort =
    current.type === "short_answer" && (current.answer.blanks?.length ?? 0) > 0;

  const submitShort = async () => {
    setAiError(null);
    if (isMultiShort) {
      const g = gradeByType("short_answer", current, "", blankInputs);
      setIsCorrect(g.isCorrect);
      setDetail(g.detail);
      setPerBlankResult(g.perBlank ?? null);
      setSubmitted(true);
      if (g.isCorrect) playCorrect();
      const stored = encodeBlanks(blankInputs);
      await persist(
        attemptRecord(
          session.id,
          current,
          stored,
          g.isCorrect,
          g.isCorrect ? 1 : 0,
          g.detail ?? "",
          undefined
        )
      );
      applyResult(g.isCorrect);
      return;
    }
    const g = gradeByType(current.type, current, userAnswer);
    setIsCorrect(g.isCorrect);
    setDetail(g.detail);
    setPerBlankResult(g.perBlank ?? null);
    setSubmitted(true);
    if (g.isCorrect) playCorrect();
    await persist(
      attemptRecord(
        session.id,
        current,
        userAnswer,
        g.isCorrect,
        g.isCorrect ? 1 : 0,
        g.detail ?? "",
        undefined
      )
    );
    applyResult(g.isCorrect);
  };

  const runAi = async () => {
    if (!userAnswer.trim()) return;
    setAiError(null);
    const prov = user.settings.essayAiProvider ?? "gemini";
    if (prov === "gemini" && !user.settings.geminiApiKey?.trim()) {
      setAiError("Gemini API 키를 설정(서술형·AI)에 넣은 뒤 다시 누르세요.");
      return;
    }
    if (prov === "anthropic" && !user.settings.anthropicApiKey?.trim()) {
      setAiError("Anthropic API 키를 설정에 넣은 뒤 다시 누르세요.");
      return;
    }
    setAiBusy(true);
    setAiFeedback("");
    try {
      const r =
        prov === "gemini"
          ? await gradeEssayWithGemini(
              user.settings.geminiApiKey!,
              (user.settings.geminiModel ?? DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL,
              current.prompt,
              current.answer.model,
              current.answer.rubric,
              current.answer.keywords,
              userAnswer
            )
          : await gradeEssayWithAnthropic(
              user.settings.anthropicApiKey!,
              (user.settings.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL).trim() || DEFAULT_ANTHROPIC_MODEL,
              current.prompt,
              current.answer.model,
              current.answer.rubric,
              current.answer.keywords,
              userAnswer
            );
      const correct = r.score >= PASS;
      setAiFeedback(r.feedback);
      setIsCorrect(correct);
      setDetail(
        `AI: ${(r.score * 100).toFixed(0)}점 · ${r.suggestedPass ? "합격 제안" : "재검토 제안"}`
      );
      setSubmitted(true);
      if (correct) playCorrect();
      await persist(
        attemptRecord(session.id, current, userAnswer, correct, r.score, r.feedback, "ai")
      );
      applyResult(correct);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(`AI 실패: ${msg}`);
      setDetail(undefined);
    } finally {
      setAiBusy(false);
    }
  };

  const selfEssay = async (ok: boolean) => {
    if (!userAnswer.trim()) return;
    setIsCorrect(ok);
    setDetail("자가채정");
    setSubmitted(true);
    if (ok) playCorrect();
    await persist(
      attemptRecord(
        session.id,
        current,
        userAnswer,
        ok,
        ok ? 1 : 0,
        ok ? "자가: 정답" : "자가: 오답",
        "self"
      )
    );
    applyResult(ok);
  };

  const skip = async () => {
    if (!current) return;
    if (!confirm("건너뛰기는 오답으로 기록돼요. 계속?")) return;
    setIsCorrect(false);
    setDetail("건너뜀");
    setSubmitted(true);
    await persist(
      attemptRecord(session.id, current, "[건너뜀]", false, 0, "건너뜀", undefined)
    );
    applyResult(false);
  };

  const isEssay = current.type === "essay";
  const isShortSentence = current.type === "short_sentence";
  const isOpenForAi = isEssay || isShortSentence;
  const prov = user.settings.essayAiProvider ?? "gemini";
  const hasAiKey =
    prov === "gemini" ? Boolean(user.settings.geminiApiKey?.trim()) : Boolean(user.settings.anthropicApiKey?.trim());
  const canAI = isOpenForAi && user.settings.aiGradingOn && hasAiKey;
  const showSelfAlways = isEssay;

  const progressPct = list.length > 0 ? ((idx + 1) / list.length) * 100 : 0;
  const rangeLabel = formatSessionSubtitle(
    session.mode,
    session.weeks,
    session.count,
    session.packLabels
  );

  return (
    <div className="exam" aria-label="시험 풀이">
      <Celebration show={showParty} />
      <div className="exam__shell">
        <div className="exam__toolbar">
          <button className="btn btn-ghost exam__back" type="button" onClick={onBack} aria-label="시험 설정으로 돌아가기">
            ← 나가기
          </button>
          <div className="exam__meta">
            <span className="badge" title="문제 유형">
              {typeLabel(current.type)}
            </span>
            <button
              className="btn"
              type="button"
              disabled={idx === 0}
              onClick={goPrev}
              title="이전 문항"
            >
              ← 이전
            </button>
            <button
              className="btn"
              type="button"
              disabled={idx + 1 >= list.length}
              onClick={goNextUnsub}
              title="다음(미채점이면 제출·기록 없음)"
            >
              다음 →
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={submitted}
              onClick={() => {
                void skip();
              }}
            >
              건너뛰기
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={onToggleBookmark}
              aria-pressed={isBookmarked}
              title="찜"
            >
              {isBookmarked ? "★" : "☆"}
            </button>
            <span className="exam__count">
              {idx + 1} / {list.length}
            </span>
          </div>
        </div>
        <div className="exam__progress-wrap">
          <p className="exam__range">{rangeLabel}</p>
          <div className="exam__track" aria-hidden>
            <div className="exam__fill" style={{ width: `${Math.min(100, progressPct)}%` }} />
          </div>
        </div>
        <div className="exam__body">
        <h2 className="question-title">{current.prompt}</h2>
        {current.source && <p className="question-source">출처: {current.source}</p>}

        {isOpenForAi ? (
          <>
            {aiError && (
              <p className="bad" style={{ margin: "0 0 8px" }} role="alert">
                {aiError}
              </p>
            )}
            <label className="field" htmlFor="ans">답{isShortSentence && " (짧은 문장)"}</label>
            <textarea
              id="ans"
              value={userAnswer}
              onChange={(e) => {
                setAiError(null);
                setUserAnswer(e.target.value);
              }}
              style={{ minHeight: isEssay ? 200 : 120 }}
              disabled={submitted}
            />
            {!submitted && (
              <div className="row section-actions" style={{ flexWrap: "wrap" }}>
                {canAI && (
                  <button className="btn btn-primary" type="button" disabled={aiBusy || !userAnswer.trim()} onClick={() => {
                    void runAi();
                  }}>{aiBusy ? "AI…" : "AI로 채점"}
                  </button>
                )}
                {isShortSentence && (
                  <button
                    className="btn"
                    type="button"
                    disabled={aiBusy}
                    onClick={() => {
                      void submitShort();
                    }}
                  >채점(키워드)
                  </button>
                )}
                {showSelfAlways && (
                  <>
                    <button
                      className="btn"
                      type="button"
                      disabled={!userAnswer.trim()}
                      onClick={() => {
                        void selfEssay(true);
                      }}>스스로: 정답
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={!userAnswer.trim()}
                      onClick={() => {
                        void selfEssay(false);
                      }}>스스로: 오답
                    </button>
                  </>
                )}
                <span className="tiny muted" style={{ flex: "1 1 200px" }}>
                  {!canAI &&
                    "설정 → 서술형·AI에서 API 키, 그리고 ‘서술형에서 AI로 채점’을 켜면 AI 버튼이 켜집니다(서술·짧은 문장). "}
                </span>
              </div>
            )}
            {submitted && (
              <div className="feedback-card">
                <p className={isCorrect ? "ok" : "bad"} style={{ margin: "0 0 6px" }}>{isCorrect ? "이번 항목: 맞음" : "이번 항목: 틀림/재검토"}</p>
                {aiFeedback && <p className="tiny" style={{ margin: 0 }}>AI: {aiFeedback}</p>}
                {detail && <p className="tiny muted" style={{ margin: "4px 0" }}>{detail}</p>}
                {current.explanation && <p className="tiny" style={{ margin: 0 }}>해설: {current.explanation}</p>}
                <p className="tiny" style={{ margin: "4px 0" }}>모범/참고: {current.answer.model}</p>
                {current.answer.rubric && <p className="tiny" style={{ margin: 0 }}>루브릭: {current.answer.rubric.join(" / ")}</p>}
                <p className="tiny" style={{ margin: 0 }}>키워드: {current.answer.keywords?.join(", ") || "—"}</p>
              </div>
            )}
          </>
        ) : isMultiShort ? (
          <>
            <p className="field" style={{ marginBottom: 6 }}>
              빈칸마다 답을 입력하세요. <strong>Enter</strong>는 다음 칸으로 이동하고, <strong>마지막 칸에서 Enter</strong>는 채점합니다(또는
              <strong> 채점</strong> 버튼).
            </p>
            <div className="blanks-list" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {current.answer.blanks!.map((def, i) => {
                const v = blankInputs[i] ?? "";
                const showCell = submitted && perBlankResult && i < perBlankResult.length;
                return (
                  <div key={i}>
                    <label className="field" htmlFor={`b${i}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      빈칸 {i + 1}
                      {showCell && (
                        <span className={perBlankResult![i] ? "ok" : "bad"} style={{ fontSize: "0.85em" }}>
                          {perBlankResult![i] ? "맞음" : "틀림"}
                        </span>
                      )}
                    </label>
                    <input
                      id={`b${i}`}
                      value={v}
                      onChange={(e) => {
                        const nB = current.answer!.blanks!.length;
                        setBlankInputs((prev) =>
                          Array.from({ length: nB }, (_, j) => (j === i ? e.target.value : prev[j] ?? ""))
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key !== "Enter" || e.shiftKey) return;
                        e.preventDefault();
                        if (submitted) return;
                        const nB = current.answer!.blanks!.length;
                        if (i < nB - 1) {
                          document.getElementById(`b${i + 1}`)?.focus();
                        } else {
                          void submitShort();
                        }
                      }}
                      disabled={submitted}
                      autoComplete="off"
                    />
                    {submitted && (
                      <p className="tiny muted" style={{ margin: "4px 0 0" }}>
                        정답: {def.model}
                        {def.alts?.length ? ` (허용: ${def.alts.join(", ")})` : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {!submitted && (
              <div className="row section-actions" style={{ marginTop: 12 }}>
                <button className="btn btn-primary" type="button" onClick={() => { void submitShort(); }}>채점
                </button>
              </div>
            )}
            {submitted && (
              <AnimatePresence mode="wait">
                <motion.div key="r" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 10 }}>
                  <p className={isCorrect ? "ok" : "bad"} style={{ margin: "0 0 6px" }}>
                    {isCorrect ? "전부 맞음" : "하나 이상 틀림"}{" "}
                    {detail && <span className="tiny muted" style={{ fontWeight: 400 }}>({detail})</span>}
                  </p>
                  {current.explanation && <p className="tiny" style={{ margin: 0 }}>해설: {current.explanation}</p>}
                  {current.answer.model && (
                    <p className="tiny" style={{ margin: 0 }}>요약: {current.answer.model}</p>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </>
        ) : (
          <>
            <label className="field" htmlFor="ans2">답</label>
            <input
              id="ans2"
              value={userAnswer}
              onChange={(e) => { setUserAnswer(e.target.value); }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key !== "Enter" || e.shiftKey) return;
                e.preventDefault();
                if (submitted) return;
                void submitShort();
              }}
              disabled={submitted}
            />
            {!submitted && (
              <div className="row section-actions">
                <button className="btn btn-primary" type="button" onClick={() => { void submitShort(); }}>채점
                </button>
              </div>
            )}
            {submitted && (
              <AnimatePresence mode="wait">
                <motion.div key="r" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 10 }}>
                  <p className={isCorrect ? "ok" : "bad"} style={{ margin: "0 0 6px" }}>{isCorrect ? "정답" : "오답"} {detail && <span className="tiny muted" style={{ fontWeight: 400 }}>({detail})</span>}</p>
                  {current.explanation && <p className="tiny" style={{ margin: 0 }}>해설: {current.explanation}</p>}
                  <p className="tiny" style={{ margin: 0 }}>모범/정답: {current.answer.model}</p>
                </motion.div>
              </AnimatePresence>
            )}
          </>
        )}

        {submitted && (
          <div className="row section-actions end">
            <button
              className="btn btn-primary"
              type="button"
              onClick={goNext}
            >{idx + 1 < list.length ? "다음" : "결과 보기"}
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
