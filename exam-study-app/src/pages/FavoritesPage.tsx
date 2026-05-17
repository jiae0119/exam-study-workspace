import { useMemo } from "react";
import type { Question, UserState, ExamSession } from "../types/models";
import { newId } from "../lib/id";
import { saveSession } from "../lib/db";
import { getPackId, packDisplayName, typeLabel } from "../lib/util";

export function FavoritesPage({
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
    () => user.bookmarkedQuestionIds.map((id) => byId.get(id)).filter(Boolean) as Question[],
    [byId, user.bookmarkedQuestionIds]
  );

  return (
    <div className="page-stack">
      <div className="card">
        <h2 className="card-title">북마크</h2>
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
            }}>{list.length ? `이 ${list.length}문항으로 시험` : "없음"}
          </button>
        </div>
        {list.length === 0 && <p className="muted" style={{ margin: 0 }}>문제 풀 때 별(☆) 누르면 여기로 모아요.</p>}
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
                  patchUser((u) => ({ ...u, bookmarkedQuestionIds: u.bookmarkedQuestionIds.filter((x) => x !== q.id) }));
                }}>찜 해제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
