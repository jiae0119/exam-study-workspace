import type { Question, QuestionType } from "../types/models";

/** 공백·따옴표·구두점 정리, 소문자(영문) */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[""''`]/g, "")
    .replace(/[^\p{L}\p{N}\s가-힣]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  const t = new Set<string>();
  for (const w of normalize(s).split(" ")) {
    if (w.length > 0) t.add(w);
  }
  return t;
}

/**
 * 한 빈칸: model + alts(추가 허용)와 정규화 일치. 빈 입력은 오답.
 */
export function gradeOneBlank(model: string, alts: string[], user: string): boolean {
  const cands = [model, ...alts].map(normalize);
  const u = normalize(user);
  if (!u) return false;
  if (cands.includes(u)) return true;
  return cands.some((c) => c && (u === c || u.replace(/\s/g, "") === c.replace(/\s/g, "")));
}

/**
 * 단답형(단일 입력)
 */
export function gradeShortAnswer(q: Question, userAnswer: string): boolean {
  return gradeOneBlank(q.answer.model, [...(q.answer.synonyms ?? [])], userAnswer);
}

export function gradeShortAnswerBlanks(
  q: Question,
  userPerBlank: string[]
): { allCorrect: boolean; per: boolean[]; right: number; n: number } {
  const b = q.answer.blanks;
  if (!b || b.length === 0) {
    const u = userPerBlank[0] ?? "";
    const ok = gradeShortAnswer(q, u);
    return { allCorrect: ok, per: [ok], right: ok ? 1 : 0, n: 1 };
  }
  const per = b.map((def, i) => gradeOneBlank(def.model, def.alts, userPerBlank[i] ?? ""));
  const right = per.filter(Boolean).length;
  return {
    allCorrect: per.length > 0 && per.every(Boolean),
    per,
    right,
    n: per.length,
  };
}

const STOP: Set<string> = new Set([
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "의",
  "로",
  "으로",
  "도",
  "과",
  "와",
  "a",
  "an",
  "the",
  "is",
  "are",
  "and",
  "or",
  "of",
  "in",
  "to",
  "for",
  "it",
  "this",
  "that",
  "as",
  "on",
  "at",
  "be",
  "not",
  "so",
  "또한",
  "때문",
  "때",
]);

/**
 * 짧은 문장형: 키워드가 일정 비율 포함되면 정답(기본 0.6)
 */
export function gradeShortSentence(
  q: Question,
  userAnswer: string,
  threshold = 0.6
): { ok: boolean; ratio: number; matched: number; total: number } {
  const kws = q.answer.keywords;
  if (!kws.length) {
    const t = tokenize(userAnswer);
    const ref = new Set(
      [q.answer.model, ...(q.answer.synonyms ?? []), ...(q.tags ?? [])]
        .filter(Boolean)
        .flatMap((s) => [...tokenize(s as string)])
    );
    const m = [...ref].filter((x) => t.has(x)).length;
    const r = ref.size ? m / ref.size : 0;
    return { ok: r >= threshold, ratio: r, matched: m, total: ref.size };
  }
  const userNorm = normalize(userAnswer);
  if (!userNorm) return { ok: false, ratio: 0, matched: 0, total: kws.length };
  const meaningful = kws.filter((k) => !STOP.has(normalize(k)));
  const toCheck = meaningful.length > 0 ? meaningful : kws;
  let hit = 0;
  for (const k of toCheck) {
    const kn = normalize(k);
    if (!kn) continue;
    if (userNorm.includes(kn) || kn.split(" ").every((part) => part && userNorm.includes(part))) {
      hit++;
    }
  }
  const ratio = toCheck.length ? hit / toCheck.length : 0;
  return { ok: ratio >= threshold, ratio, matched: hit, total: toCheck.length };
}

export function gradeByType(
  type: QuestionType,
  q: Question,
  userAnswer: string,
  userBlanks?: string[] | null
): { isCorrect: boolean; detail?: string; perBlank?: boolean[] } {
  if (type === "short_answer" && q.answer.blanks && q.answer.blanks.length > 0) {
    const nB = q.answer.blanks.length;
    const row = Array.from({ length: nB }, (_, i) => (userBlanks && userBlanks[i] != null ? userBlanks[i]! : ""));
    const g = gradeShortAnswerBlanks(q, row);
    return {
      isCorrect: g.allCorrect,
      detail: `빈칸: ${g.right} / ${g.n} 맞음`,
      perBlank: g.per,
    };
  }
  if (type === "short_answer") {
    return { isCorrect: gradeShortAnswer(q, userAnswer) };
  }
  if (type === "short_sentence") {
    const g = gradeShortSentence(q, userAnswer);
    return { isCorrect: g.ok, detail: `${g.matched}/${g.total} 키워드` };
  }
  if (type === "essay") {
    return { isCorrect: false, detail: "essay" };
  }
  return { isCorrect: false };
}
