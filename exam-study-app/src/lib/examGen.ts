import type { Question, QuestionType } from "../types/models";
import { getPackId } from "./util";

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function filterByTypes(questions: Question[], types: QuestionType[] | null | undefined): Question[] {
  if (!types || types.length === 0) return questions;
  const set = new Set(types);
  return questions.filter((q) => set.has(q.type));
}

/**
 * JSON(시험지) 단위: 선택한 packId들만 풀에 넣고 전체 또는 랜덤 n문제
 */
export function buildExamQuestionIdsByPacks(
  all: Question[],
  packIds: string[],
  sub: "all" | "random",
  count: number,
  typeFilter?: QuestionType[] | null
): string[] {
  if (packIds.length === 0) return [];
  const allow = new Set(packIds);
  const pool = filterByTypes(
    all.filter((q) => allow.has(getPackId(q))),
    typeFilter
  );
  if (pool.length === 0) return [];
  if (sub === "all") {
    return pool.map((q) => q.id);
  }
  if (count <= 0) return [];
  const sh = shuffle(pool);
  return sh.slice(0, Math.min(count, sh.length)).map((q) => q.id);
}
