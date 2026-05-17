import type { ExamSession, QuestionType } from "../types/models";
import { typeLabel } from "../lib/util";

function tKey(t: QuestionType) {
  return typeLabel(t);
}

export function ResultPage({ session, onHome }: { session: ExamSession; onHome: () => void }) {
  const s = session.resultSummary;
  const acc = s && s.total > 0 ? Math.round((s.correct / s.total) * 100) : null;
  return (
    <div className="page-stack">
      <div className="card result-card">
        <h2 className="card-title">요약</h2>
        <p className="result-meta">
          {new Date(session.startedAt).toLocaleString()} 시작
          {session.endedAt && ` · ${new Date(session.endedAt).toLocaleString()} 종료`}
        </p>
        {s && (
          <>
            <div className="result-hero" aria-label="총점">
              <span className="result-hero__main">
                {s.correct} / {s.total}
              </span>
              <span className="result-hero__sub">맞힌 문항</span>
              {acc != null && <span className="result-hero__sub">· {acc}%</span>}
            </div>
            <p className="result-subline">유형별로 틀린 쪽에 시간을 쓰면 효율이 좋아요.</p>
            <div className="split" style={{ marginTop: 12 }}>
              {Object.entries(s.byType).map(([k, v]) => (
                <div key={k} className="list-item" style={{ margin: 0 }}>
                  <div>
                    <span className="badge">{tKey(k as QuestionType)}</span>
                  </div>
                  {v && <p className="tiny" style={{ margin: 0 }}>{v.right} / {v.n} 정답</p>}
                </div>
              ))}
            </div>
          </>
        )}
        {!s && <p className="warn" style={{ margin: "0.4rem 0" }}>요약 없음(세션 기록 누락?)</p>}
        <div className="row section-actions end" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" type="button" onClick={onHome}>
            대시보드로
          </button>
        </div>
      </div>
    </div>
  );
}
