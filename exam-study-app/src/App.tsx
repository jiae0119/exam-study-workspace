import { useCallback, useEffect, useState } from "react";
import { useBoot } from "./hooks/useBoot";
import { HomePage } from "./pages/HomePage";
import { ImportPage } from "./pages/ImportPage";
import { SetupPage } from "./pages/SetupPage";
import { SessionPage } from "./pages/SessionPage";
import { ResultPage } from "./pages/ResultPage";
import { WrongPage } from "./pages/WrongPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { saveSession } from "./lib/db";
import { buildExamQuestionIdsByPacks } from "./lib/examGen";
import { getPackId, listPackSummaries } from "./lib/util";
import { newId } from "./lib/id";
import type { ExamSession } from "./types/models";
import { PageHeader } from "./components/PageHeader";
import { getPageHeaderInfo, type AppView } from "./layout/pageInfo";

const NAV: { id: AppView; label: string; short: string; desc: string }[] = [
  { id: "home", label: "대시보드", short: "홈", desc: "요약" },
  { id: "import", label: "문제 가져오기", short: "JSON", desc: "라이브러리" },
  { id: "setup", label: "시험 시작", short: "시험", desc: "설정" },
  { id: "wrong", label: "오답노트", short: "오답", desc: "복습" },
  { id: "favorites", label: "찜", short: "찜", desc: "북마크" },
  { id: "settings", label: "설정", short: "설정", desc: "시스템" },
];

export function App() {
  const { questions, user, patchUser, loading, error, refresh } = useBoot();
  const [view, setView] = useState<AppView>("home");
  const [active, setActive] = useState<ExamSession | null>(null);
  const [result, setResult] = useState<ExamSession | null>(null);
  const [setupPackFilter, setSetupPackFilter] = useState<string[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isExam = view === "session";
  const headerInfo = getPageHeaderInfo(view);

  useEffect(() => {
    if (toast == null) return;
    const id = setTimeout(() => {
      setToast(null);
    }, 4500);
    return () => {
      clearTimeout(id);
    };
  }, [toast]);

  const startQuickRandom = useCallback(
    async (packIds: string[], count: number) => {
      const want = new Set(packIds);
      const pool = questions.filter((q) => want.has(getPackId(q)));
      if (pool.length === 0) {
        setToast("선택한 시험지에 문제가 없어요.");
        return;
      }
      const labels = listPackSummaries(questions)
        .filter((p) => want.has(p.packId))
        .map((p) => p.packName);
      const ids = buildExamQuestionIdsByPacks(questions, packIds, "random", count, null);
      if (!ids.length) {
        setToast("지금 조건으로는 뽑을 문항이 없어요.");
        return;
      }
      const s: ExamSession = {
        id: newId(),
        mode: "byPackRandom",
        weeks: [],
        count: Math.min(count, ids.length),
        typeFilter: null,
        packIds,
        packLabels: labels,
        startedAt: new Date().toISOString(),
        questionIds: ids,
      };
      await saveSession(s);
      setActive(s);
      setView("session");
      setResult(null);
      setToast(`${ids.length}문제 랜덤 시험을 시작해요.`);
    },
    [questions]
  );

  function go(v: AppView) {
    if (v === "setup") {
      setSetupPackFilter(null);
    }
    setView(v);
    if (v !== "session" && v !== "result") {
      setResult(null);
    }
    if (v !== "session") {
      setActive(null);
    }
  }

  function goSetupWithPacks(packIds: string[] | null) {
    setSetupPackFilter(packIds);
    setView("setup");
    setResult(null);
    setActive(null);
  }

  if (loading) {
    return (
      <div className="app-load">
        <div className="app-load__inner" aria-live="polite" aria-busy>
          <span className="app-load__dot" />
          <p className="app-load__text">데이터를 불러오는 중</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="app-load app-load--error">
        <div className="card app-load__inner">
          <h2 className="card-title">문제가 발생했습니다</h2>
          <p className="app-load__err">{error}</p>
          <button className="btn btn-primary" type="button" onClick={() => { void refresh(); }}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const mainContent = (
    <>
      {!isExam && headerInfo && <PageHeader kicker={headerInfo.kicker} title={headerInfo.title} description={headerInfo.description} />}
      {view === "home" && (
        <HomePage
          questions={questions}
          user={user}
          onNav={go}
          onGotoSetup={goSetupWithPacks}
          onQuickRandom={(packIds, n) => {
            void startQuickRandom(packIds, n);
          }}
        />
      )}
      {view === "import" && (
        <ImportPage
          user={user}
          patchUser={patchUser}
          onImported={(s) => {
            void refresh();
            const m = s.skipped
              ? `「${s.label}」 — 추가 ${s.added} / 건너뜀 ${s.skipped} / 갱신 ${s.updated} (파일 ${s.total}문)`
              : s.updated > 0
                ? `「${s.label}」 — 추가 ${s.added} / 갱신 ${s.updated} (총 ${s.total}문)`
                : `「${s.label}」 — ${s.added}문제를 불러왔어요.`;
            setToast(m);
          }}
        />
      )}
      {view === "setup" && (
        <SetupPage
          questions={questions}
          packFilter={setupPackFilter}
          onClearPackFilter={() => {
            setSetupPackFilter(null);
          }}
          user={user}
          onSessionStart={(s) => {
            setActive(s);
            setView("session");
            setResult(null);
          }}
        />
      )}
      {view === "session" && active && (
        <SessionPage
          key={active.id}
          session={active}
          questions={questions}
          user={user}
          patchUser={patchUser}
          onBack={() => {
            setView("setup");
            setActive(null);
          }}
          onResult={(s) => {
            setResult(s);
            setActive(null);
            setView("result");
            void refresh();
          }}
        />
      )}
      {view === "result" && result && <ResultPage session={result} onHome={() => { go("home"); setResult(null); }} />}
      {view === "wrong" && (
        <WrongPage
          questions={questions}
          user={user}
          patchUser={patchUser}
          onStartSession={(s) => {
            setActive(s);
            setView("session");
            setResult(null);
          }}
        />
      )}
      {view === "favorites" && (
        <FavoritesPage
          questions={questions}
          user={user}
          patchUser={patchUser}
          onStartSession={(s) => {
            setActive(s);
            setView("session");
            setResult(null);
          }}
        />
      )}
      {view === "settings" && (
        <SettingsPage
          user={user}
          patchUser={patchUser}
          onDataRestored={() => { void refresh(); }}
          onReloadData={() => { void refresh(); }}
        />
      )}
    </>
  );

  if (isExam) {
    return (
      <>
        <div className="app-exam-layer" id="main-content">
          <div className="app-main app-main--exam">{mainContent}</div>
        </div>
        {toast && (
          <div className="app-toast" role="status" aria-live="polite">
            {toast}
          </div>
        )}
      </>
    );
  }

  return (
    <>
    <div className="app-root">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <aside className="app-sidenav" aria-label="주 메뉴">
        <div className="app-sidenav__brand">
          <span className="app-sidenav__logo" aria-hidden>
            ◆
          </span>
          <div>
            <p className="app-sidenav__name">시험 학습</p>
            <p className="app-sidenav__meta">로컬 · 1인용</p>
          </div>
        </div>
        <p className="app-sidenav__label">이동</p>
        <nav className="app-sidenav__nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={view === n.id ? "sidenav-link is-active" : "sidenav-link"}
              onClick={() => {
                go(n.id);
              }}
            >
              <span className="sidenav-link__k">{n.short}</span>
              <span className="sidenav-link__body">
                <span className="sidenav-link__title">{n.label}</span>
                <span className="sidenav-link__sub">{n.desc}</span>
              </span>
            </button>
          ))}
        </nav>
        <div className="app-sidenav__foot">
          <p>
            {questions.length}문항
            {user.wrongQuestionIds.length > 0 && (
              <span className="app-sidenav__pill">오답 {user.wrongQuestionIds.length}</span>
            )}
          </p>
        </div>
      </aside>
      <div className="app-canvas" id="main-content">
        <div className="app-main">
          {mainContent}
        </div>
      </div>
    </div>
    {toast && (
      <div className="app-toast" role="status" aria-live="polite">
        {toast}
      </div>
    )}
    </>
  );
}
