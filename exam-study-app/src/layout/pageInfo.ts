import type { ExamMode } from "../types/models";

export type AppView =
  | "home"
  | "import"
  | "setup"
  | "session"
  | "result"
  | "wrong"
  | "favorites"
  | "settings";

export const PAGE_INFO: Record<
  Exclude<AppView, "session">,
  { kicker: string; title: string; description: string }
> = {
  home: {
    kicker: "Overview",
    title: "학습 대시보드",
    description: "문제 현황을 확인하고, 바로 시험을 시작하세요.",
  },
  import: {
    kicker: "Library",
    title: "문제 가져오기",
    description: "템플릿·채팅으로 만든 JSON을 넣으면 이 브라우저에만 안전하게 저장됩니다.",
  },
  setup: {
    kicker: "Session",
    title: "시험 설정",
    description: "가져온 시험지(파일)와 범위를 골라 세션을 만듭니다.",
  },
  result: {
    kicker: "Report",
    title: "시험 결과",
    description: "유형별로 어디를 더 볼지 빠르게 짚어보세요.",
  },
  wrong: {
    kicker: "Review",
    title: "오답노트",
    description: "틀린·건너뛴 항목만 다시 풀 수 있어요.",
  },
  favorites: {
    kicker: "Saved",
    title: "찜",
    description: "중요하다고 표시한 문항을 모아 봅니다.",
  },
  settings: {
    kicker: "System",
    title: "설정",
    description: "AI·애니메이션·가져오기·백업/복원을 한곳에서 관리합니다.",
  },
};

export function getPageHeaderInfo(
  v: AppView
): { kicker: string; title: string; description: string } | null {
  if (v === "session") return null;
  return PAGE_INFO[v];
}

export function formatSessionSubtitle(
  mode: ExamMode,
  weeks: number[],
  count: number,
  packLabels?: string[] | null
) {
  if (mode === "byPack") {
    if (packLabels?.length) return `시험지: ${packLabels.join(" · ")} · 전체`;
    return "시험지(파일) · 전체";
  }
  if (mode === "byPackRandom") {
    const lab = packLabels?.length ? packLabels.join(" · ") : "선택 풀";
    return `시험지: ${lab} · 랜덤 ${count}문제`;
  }
  if (mode === "week") {
    return weeks.length ? `${weeks[0]}주차 · 전체 문항(구버전 세션)` : "—";
  }
  const wk = weeks.length
    ? [...new Set(weeks)]
        .sort((a, b) => a - b)
        .join(", ")
    : "—";
  return wk ? `랜덤 ${count}문제 · ${wk}주(구버전)` : `랜덤 ${count}문제`;
}
