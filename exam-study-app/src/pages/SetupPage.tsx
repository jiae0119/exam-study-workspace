import { useEffect, useMemo, useState } from "react";
import type { ExamMode, Question, QuestionType, UserState } from "../types/models";
import { buildExamQuestionIdsByPacks } from "../lib/examGen";
import { newId } from "../lib/id";
import { saveSession } from "../lib/db";
import type { ExamSession } from "../types/models";
import { comparePackNames, getPackId, listPackSummaries, type PackSummary } from "../lib/util";

const TYPES: QuestionType[] = ["short_answer", "short_sentence", "essay"];

function typeLabelK(t: QuestionType) {
  if (t === "short_answer") return "단답형";
  if (t === "short_sentence") return "짧은 문장형";
  return "서술형";
}

export function SetupPage({
  questions: allQuestions,
  packFilter,
  onClearPackFilter,
  onSessionStart,
  user,
}: {
  questions: Question[];
  /** null이면 전체 문제, 배열이면 해당 시험지(packId)만 */
  packFilter: string[] | null;
  onClearPackFilter?: () => void;
  onSessionStart: (s: ExamSession) => void;
  user: UserState;
}) {
  const questions = useMemo(() => {
    if (packFilter == null || packFilter.length === 0) return allQuestions;
    const allow = new Set(packFilter);
    return allQuestions.filter((q) => allow.has(getPackId(q)));
  }, [allQuestions, packFilter]);

  const packFilterLabel = useMemo((): string[] | null => {
    if (packFilter == null || packFilter.length === 0) return null;
    const want = new Set(packFilter);
    const byId = new Map<string, string>();
    for (const q of allQuestions) {
      const id = getPackId(q);
      if (!want.has(id)) continue;
      if (q.packName?.trim() && !byId.has(id)) byId.set(id, q.packName.trim());
    }
    return packFilter
      .map((id) => byId.get(id) ?? "알 수 없는 시험지")
      .sort(comparePackNames);
  }, [allQuestions, packFilter]);

  const packsList: PackSummary[] = useMemo(() => listPackSummaries(questions), [questions]);
  const [packSel, setPackSel] = useState<Set<string>>(() => new Set());
  const [packSub, setPackSub] = useState<"all" | "random">("all");
  const [count, setCount] = useState(5);
  const [typeFilter, setTypeFilter] = useState<Set<QuestionType>>(new Set(TYPES));
  const [err, setErr] = useState("");

  useEffect(() => {
    setPackSel((prev) => {
      const ids = new Set(packsList.map((p) => p.packId));
      if (prev.size > 0) {
        return new Set([...prev].filter((id) => ids.has(id)));
      }
      return new Set(packsList.map((p) => p.packId));
    });
  }, [packsList]);

  const togglePack = (pid: string) => {
    setPackSel((p) => {
      const n = new Set(p);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });
  };

  const toggleType = (t: QuestionType) => {
    setTypeFilter((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      if (n.size === 0) n.add(t);
      return n;
    });
  };

  async function start() {
    setErr("");
    const tf = typeFilter.size < TYPES.length && typeFilter.size > 0 ? Array.from(typeFilter) : null;
    if (packsList.length === 0) {
      setErr("가져온 JSON(시험지) 묶음이 없습니다.");
      return;
    }
    const pids = Array.from(packSel);
    if (pids.length === 0) {
      setErr("JSON(시험지)를 하나 이상 고르세요.");
      return;
    }
    const sub = packSub === "all" ? "all" : "random";
    const c = count;
    const ids = buildExamQuestionIdsByPacks(questions, pids, sub, c, tf);
    if (!ids.length) {
      setErr("해당 조건에 맞는 문제가 없습니다. 시험지·유형을 확인하세요.");
      return;
    }
    const labels = packsList
      .filter((p) => packSel.has(p.packId))
      .map((p) => p.packName);
    const s: ExamSession = {
      id: newId(),
      mode: (packSub === "all" ? "byPack" : "byPackRandom") as ExamMode,
      weeks: [],
      count: sub === "all" ? ids.length : Math.min(c, ids.length),
      typeFilter: tf,
      packIds: pids,
      packLabels: labels,
      startedAt: new Date().toISOString(),
      questionIds: ids,
    };
    await saveSession(s);
    onSessionStart(s);
  }

  if (allQuestions.length === 0) {
    return (
      <div className="card">
        <h2 className="card-title">시험을 시작하려면</h2>
        <p className="bad" style={{ margin: 0 }}>아직 저장된 문제가 없습니다. JSON을 먼저 가져와 주세요.</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="card">
        <h2 className="card-title">출제 범위</h2>
        <p className="bad" style={{ margin: 0 }}>선택한 시험지에 맞는 문제가 없어요. 홈에서 시험지를 다시 고르거나, 아래로 전체 문제를 쓰세요.</p>
        {onClearPackFilter && (
          <div className="section-actions" style={{ marginTop: "0.75rem" }}>
            <button className="btn btn-primary" type="button" onClick={onClearPackFilter}>
              전체 문제로 바꾸기
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="card">
        <h2 className="card-title">범위</h2>
        {packFilterLabel && packFilterLabel.length > 0 && (
          <div className="setup-pack-banner" role="status">
            <span>
              출제 풀: <strong>{packFilterLabel.join(" · ")}</strong> — 총 {questions.length}문제
            </span>
            {onClearPackFilter && (
              <button type="button" className="btn btn-ghost" onClick={onClearPackFilter}>
                전체 시험지
              </button>
            )}
          </div>
        )}
        <p className="tiny muted">중복 id: {user.settings.duplicateIdStrategy} (가져오기·설정에서 변경)</p>

        {packsList.length > 0 && (
          <>
            <p className="field" style={{ marginTop: "0.4rem" }}>
              시험지 (JSON 파일·가져온 묶음) 단위로 고릅니다
            </p>
            <div className="setup-pack-picks">
              {packsList.map((p) => (
                <label key={p.packId} className={packSel.has(p.packId) ? "setup-pack-pick is-on" : "setup-pack-pick"}>
                  <input
                    type="checkbox"
                    checked={packSel.has(p.packId)}
                    onChange={() => { togglePack(p.packId); }}
                  />
                  <span className="setup-pack-pick__t">{p.packName}</span>
                  <span className="setup-pack-pick__m">{p.questionCount}문</span>
                </label>
              ))}
            </div>
            <label className="field">이 풀에서</label>
            <div className="row option-row">
              <label className="option-chip">
                <input
                  type="radio"
                  name="pksub"
                  checked={packSub === "all"}
                  onChange={() => { setPackSub("all"); }}
                />
                문항 전부
              </label>
              <label className="option-chip">
                <input
                  type="radio"
                  name="pksub"
                  checked={packSub === "random"}
                  onChange={() => { setPackSub("random"); }}
                />
                n문제만 랜덤
              </label>
            </div>
            {packSub === "random" && (
              <>
                <label className="field" htmlFor="pkrand">
                  문제 수
                </label>
                <input
                  id="pkrand"
                  type="number"
                  min={1}
                  value={count}
                  onChange={(e) => { setCount(Math.max(1, parseInt(e.target.value, 10) || 1)); }}
                />
              </>
            )}
            <div className="spacer-sm" />
          </>
        )}

        <label className="field">유형(비우면 전체=현재 3가지)</label>
        <div className="row option-row">
          {TYPES.map((t) => (
            <label key={t} className="option-chip">
              <input
                type="checkbox"
                checked={typeFilter.has(t)}
                onChange={() => { toggleType(t); }}
              />
              {typeLabelK(t)}
            </label>
          ))}
        </div>
        {err && <p className="bad" style={{ margin: "8px 0" }}>{err}</p>}
        <div className="section-actions">
          <button className="btn btn-primary" type="button" onClick={() => { void start(); }}>
            이 설정으로 시험 시작
          </button>
        </div>
      </div>
    </div>
  );
}
