import type { Question } from "../types/models";

/** packId 없이 저장된(이전) 문항 */
export const UNASSIGNED_PACK_ID = "__unassigned__";

export function getPackId(q: Question): string {
  return q.packId ?? UNASSIGNED_PACK_ID;
}

/** 화면에 보이는 시험지 이름 — JSON 파일명(localfile:…) 우선 */
export function packDisplayName(packId: string, storedName?: string | null): string {
  if (packId === UNASSIGNED_PACK_ID) return "이전·미분류";
  if (packId.startsWith("localfile:")) {
    const rest = packId.slice("localfile:".length).replace(/\.json$/i, "");
    if (rest) return rest;
  }
  return storedName?.trim() || "이름 없는 시험지";
}

export interface PackSummary {
  packId: string;
  packName: string;
  questionCount: number;
}

/** 시험지 이름 가나다·숫자 순 (9주차 < 10주차) */
const packNameCollator = new Intl.Collator("ko-KR", {
  numeric: true,
  sensitivity: "base",
});

export function comparePackSummaries(a: PackSummary, b: PackSummary): number {
  if (a.packId === UNASSIGNED_PACK_ID && b.packId !== UNASSIGNED_PACK_ID) return 1;
  if (b.packId === UNASSIGNED_PACK_ID && a.packId !== UNASSIGNED_PACK_ID) return -1;
  const byName = packNameCollator.compare(a.packName, b.packName);
  if (byName !== 0) return byName;
  return a.packId.localeCompare(b.packId, "ko-KR");
}

export function comparePackNames(a: string, b: string): number {
  return packNameCollator.compare(a, b);
}

/** 시험지(가져온 JSON 배치)별로 묶은 목록 — 이름순 정렬 */
export function listPackSummaries(questions: Question[]): PackSummary[] {
  const m = new Map<string, Question[]>();
  for (const q of questions) {
    const id = getPackId(q);
    if (!m.has(id)) m.set(id, []);
    m.get(id)!.push(q);
  }
  return Array.from(m.entries())
    .map(([packId, qs]) => {
      const withName = qs.find((p) => p.packName?.trim());
      const packName = packDisplayName(packId, withName?.packName);
      return {
        packId,
        packName,
        questionCount: qs.length,
      };
    })
    .sort(comparePackSummaries);
}

export function typeLabel(t: string): string {
  if (t === "short_answer") return "단답형";
  if (t === "short_sentence") return "짧은 문장형";
  if (t === "essay") return "서술형";
  return t;
}
