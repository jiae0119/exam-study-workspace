import { useMemo, useState } from "react";
import type { Question, UserState } from "../types/models";
import { listPackSummaries } from "../lib/util";

type NavKey = "import" | "setup" | "wrong" | "favorites" | "settings";

const QUICK: { to: NavKey; label: string; hint: string }[] = [
  { to: "import", label: "JSON 가져오기", hint: "문제 추가" },
  { to: "wrong", label: "오답 복습", hint: "틀린 문항" },
  { to: "favorites", label: "찜 모아보기", hint: "북마크" },
  { to: "settings", label: "설정", hint: "AI·백업" },
];

export function HomePage({
  questions,
  user,
  onNav,
  onGotoSetup,
  onQuickRandom,
}: {
  questions: Question[];
  user: UserState;
  onNav: (p: NavKey) => void;
  onGotoSetup: (packIds: string[] | null) => void;
  onQuickRandom: (packIds: string[], count: number) => void;
}) {
  const packs = useMemo(() => listPackSummaries(questions), [questions]);
  const [multiMode, setMultiMode] = useState(false);
  const [singleId, setSingleId] = useState<string | null>(null);
  const [multiIds, setMultiIds] = useState<Set<string>>(() => new Set());
  const [singleRandomN, setSingleRandomN] = useState(10);
  const [multiRandomN, setMultiRandomN] = useState(15);

  function toggleMulti(id: string) {
    setMultiIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="page-stack">
      <section className="card home-hero">
        <h2 className="card-title">이번에 볼 수 있는 전체</h2>
        <p className="page-desc" style={{ margin: "0 0 0.6rem" }}>
          저장·오답·찜은 이 브라우저(IndexedDB)에만 쌓입니다. 기말 전엔 <strong>설정 → 백업</strong>으로 json을 남겨 두는 걸 권해요.
        </p>
        <div className="stats-grid">
          <div className="stat-box">
            <span className="stat-label">전체</span>
            <strong className="stat-value">{questions.length}문제</strong>
          </div>
          <div className="stat-box">
            <span className="stat-label">시험지</span>
            <strong className="stat-value" title="가져온 JSON·이전·미분류">
              {packs.length}개
            </strong>
          </div>
          <div className="stat-box">
            <span className="stat-label">찜</span>
            <strong className="stat-value">{user.bookmarkedQuestionIds.length}</strong>
          </div>
          <div className="stat-box">
            <span className="stat-label">오답</span>
            <strong className="stat-value">{user.wrongQuestionIds.length}</strong>
          </div>
        </div>
        <div className="home-hero__actions">
          <button className="btn btn-primary" type="button" onClick={() => onGotoSetup(null)}>
            시험 시작(전체 문제)
          </button>
          {questions.length === 0 && (
            <p className="home-hero__hint" style={{ margin: 0 }}>
              아직 문제가 없다면, 먼저 JSON을 가져오세요.
            </p>
          )}
        </div>
      </section>

      {questions.length > 0 && (
        <section className="card home-packs" aria-labelledby="packs-heading">
          <h2 className="card-title" id="packs-heading">
            가져온 시험지
          </h2>
          <p className="muted" style={{ margin: "0 0 0.75rem" }}>
            한 번에 JSON을 올릴 때마다 시험지가 생깁니다. 하나만 고르면 그 안에서, 여러 개를 켜고 섞어 랜덤 출제도 할 수 있어요.
          </p>
          <label className="home-packs__toggle">
            <input
              type="checkbox"
              checked={multiMode}
              onChange={(e) => {
                setMultiMode(e.target.checked);
                if (e.target.checked) setSingleId(null);
                else setMultiIds(new Set());
              }}
            />
            <span>여러 시험지 섞기 (다수 선택 + 랜덤 n문제)</span>
          </label>

          {!multiMode && (
            <>
              <ul className="pack-grid" role="list">
                {packs.map((p) => {
                  const selected = singleId === p.packId;
                  return (
                    <li key={p.packId}>
                      <button
                        type="button"
                        className={selected ? "pack-card is-selected" : "pack-card"}
                        onClick={() => setSingleId(p.packId)}
                        aria-pressed={selected}
                      >
                        <span className="pack-card__name">{p.packName}</span>
                        <span className="pack-card__meta">{p.questionCount}문</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="home-packs__actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!singleId}
                  onClick={() => singleId && onGotoSetup([singleId])}
                >
                  이 시험지로 시험 설정
                </button>
                <div className="home-packs__inline">
                  <span className="tiny muted">또는 이 시험지만</span>
                  <input
                    type="number"
                    className="home-packs__num"
                    min={1}
                    value={singleRandomN}
                    onChange={(e) => setSingleRandomN(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    disabled={!singleId}
                    aria-label="랜덤으로 낼 문항 수"
                  />
                  <span className="tiny muted">문제 랜덤</span>
                  <button
                    className="btn"
                    type="button"
                    disabled={!singleId}
                    onClick={() => {
                      if (singleId) onQuickRandom([singleId], singleRandomN);
                    }}
                  >
                    바로 시험
                  </button>
                </div>
              </div>
            </>
          )}

          {multiMode && (
            <>
              <ul className="pack-grid pack-grid--multi" role="list">
                {packs.map((p) => {
                  const on = multiIds.has(p.packId);
                  return (
                    <li key={p.packId}>
                      <label className={on ? "pack-card pack-card--check is-selected" : "pack-card pack-card--check"}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            toggleMulti(p.packId);
                          }}
                        />
                        <span className="pack-card__body">
                          <span className="pack-card__name">{p.packName}</span>
                          <span className="pack-card__meta">{p.questionCount}문</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="home-packs__actions home-packs__actions--multi">
                <div className="home-packs__inline">
                  <span className="tiny muted">선택한 풀에서</span>
                  <input
                    type="number"
                    className="home-packs__num"
                    min={1}
                    value={multiRandomN}
                    onChange={(e) => setMultiRandomN(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    aria-label="랜덤으로 낼 문항 수"
                  />
                  <span className="tiny muted">문제</span>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={multiIds.size === 0}
                    onClick={() => onQuickRandom(Array.from(multiIds), multiRandomN)}
                  >
                    랜덤으로 시험 시작
                  </button>
                </div>
                {multiIds.size === 0 && <p className="tiny bad">시험지를 하나 이상 골라 주세요.</p>}
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={multiIds.size === 0}
                  onClick={() => onGotoSetup(Array.from(multiIds))}
                >
                  선택 풀만 쓰고(주차·유형) 설정 화면으로
                </button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="card home-quick">
        <h2 className="card-title">빠른 링크</h2>
        <ul className="home-link-grid">
          {QUICK.map((q) => (
            <li key={q.to}>
              <button type="button" className="home-link-tile" onClick={() => onNav(q.to)}>
                <span className="home-link-tile__label">{q.label}</span>
                <span className="home-link-tile__hint">{q.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="card home-guide">
        <h2 className="card-title">학습 루프(한번에 끝내기)</h2>
        <ol className="home-steps">
          <li>
            <span className="home-steps__i">1</span>
            <div>
              <p className="home-steps__t">JSON 생성 (Claude·템플릿)</p>
              <p className="home-steps__d">문제·모범답·키워드가 <code>questions</code> 배열로 잘 읽혀야 합니다.</p>
            </div>
          </li>
          <li>
            <span className="home-steps__i">2</span>
            <div>
              <p className="home-steps__t">이 앱 · 가져오기</p>
              <p className="home-steps__d">가져올 때마다 시험지가 쌓입니다. 중복 id는 <strong>건너뛰기/덮어쓰기</strong>로 조절합니다.</p>
            </div>
          </li>
          <li>
            <span className="home-steps__i">3</span>
            <div>
              <p className="home-steps__t">시험</p>
              <p className="home-steps__d">시험지를 고르고 주차 전체만, 또는 랜덤 n문제, 또는 쪽 메뉴 &quot;시험&quot;에서 전체 범위로 설정하세요.</p>
            </div>
          </li>
          <li>
            <span className="home-steps__i">4</span>
            <div>
              <p className="home-steps__t">서술형</p>
              <p className="home-steps__d">Google Gemini(권장) 또는 Anthropic API 키는 설정에만, 없으면 자가채정으로 끝까지 갑니다.</p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
