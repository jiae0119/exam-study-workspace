import { useMemo } from "react";
import type { Question, UserState, ExamSession } from "../types/models";
import { newId } from "../lib/id";
import { saveSession } from "../lib/db";
import { getPackId, packDisplayName, typeLabel } from "../lib/util";

export function WrongPage({
  questions,
  user,
  patchUser,
  onStartSession,
}: {
  questions: Question[];
  user: UserState;
  patchUser: (p: (u: UserState) => UserState) => void;
  onStartSession: (s: ExamSession) => void;
}) {
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const list = useMemo(
    () => user.wrongQuestionIds.map((id) => byId.get(id)).filter(Boolean) as Question[],
    [byId, user.wrongQuestionIds]
  );

  return (
    <div className="page-stack">
      <div className="card">
        <h2 className="card-title">오답 목록</h2>
        <p className="tiny muted" style={{ margin: "0 0 6px" }}>틀리거나, 건너뛴 항목이 쌓여요. 맞으면 자동에서 빠집니다.</p>
        <div className="row" style={{ margin: "0 0 6px" }}>
          <button
            className="btn btn-primary"
            type="button"
            disabled={list.length === 0}
            onClick={async () => {
              const packIds = [...new Set(list.map((q) => getPackId(q)))];
              const packLabels = packIds.map((id) => {
                const x = list.find((q) => getPackId(q) === id);
                return packDisplayName(id, x?.packName);
              });
              const s: ExamSession = {
                id: newId(),
                mode: "byPack",
                weeks: [],
                count: list.length,
                typeFilter: null,
                packIds,
                packLabels,
                startedAt: new Date().toISOString(),
                questionIds: list.map((q) => q.id),
              };
              await saveSession(s);
              onStartSession(s);
            }}
          >{list.length ? `이 ${list.length}문항으로 시험` : "풀 항목 없음"}
          </button>
        </div>
        {list.length === 0 && <p className="muted" style={{ margin: 0 }}>아직 오답이 없어요. 시험을 풀어보세요.</p>}
        {list.map((q) => (
          <div className="list-item" key={q.id}>
            <div>
              <span className="badge" style={{ marginRight: 4 }}>{typeLabel(q.type)}</span>{" "}
            </div>
            <p style={{ margin: "2px 0" }}>{q.prompt}</p>
            <div className="actions">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  patchUser((u) => ({ ...u, wrongQuestionIds: u.wrongQuestionIds.filter((x) => x !== q.id) }));
                }}
              >리스트에서 제거
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
