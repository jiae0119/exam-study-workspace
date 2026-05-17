import type { Question, QuestionPack, QuestionType, ShortAnswerBlank } from "../types/models";

const TYPES: QuestionType[] = ["short_answer", "short_sentence", "essay"];

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** 외부 JSON 전용 타입 (`QuestionType` 에는 포함하지 않고 가져오기 때 short_answer 로 변환) */
const EXTRA_JSON_TYPES = new Set(["short_answer_triple"]);

/** "① … / ② … / …" 문자열 모델 → 빈칸별 정답 문구 */
function tripleModelSegments(modelStr: string): string[] {
  return modelStr
    .trim()
    .split(/\s*\/\s*/)
    .map((seg) => seg.replace(/^[①②③④⑤]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * 예: GPT·스크립트가 내보낸 `short_answer_triple` → 다중 blanks `short_answer`
 */
function coerceShortAnswerTriple(
  q: Record<string, unknown>,
  prefix: string,
): { ok: false; errors: string[] } | { ok: true; q: Record<string, unknown> } {
  const ans = q.answer;
  if (!isObj(ans)) {
    return { ok: false, errors: [`${prefix}: short_answer_triple은 answer 객체가 필요합니다.`] };
  }
  if (typeof ans.model !== "string" || !ans.model.trim()) {
    return { ok: false, errors: [`${prefix}.answer.model: 문자열(①… / ②… 형식)`] };
  }
  const segments = tripleModelSegments(ans.model);
  if (segments.length < 2) {
    return {
      ok: false,
      errors: [
        `${prefix}: short_answer_triple은 model에 / 로 구분된 빈칸이 2개 이상 필요합니다.`,
      ],
    };
  }

  let kwNested: string[][] = [];
  if (ans.keywords != null) {
    if (
      !Array.isArray(ans.keywords) ||
      ans.keywords.length === 0 ||
      !Array.isArray((ans.keywords as unknown[])[0])
    ) {
      return {
        ok: false,
        errors: [`${prefix}.answer.keywords: short_answer_triple은 빈칸별 string[][] 또는 생략`],
      };
    }
    kwNested = (ans.keywords as unknown[]).map((row) =>
      Array.isArray(row)
        ? (row as unknown[]).filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
        : [],
    );
    if (kwNested.length !== segments.length) {
      return {
        ok: false,
        errors: [
          `${prefix}: 빈칸 수(${segments.length})와 keywords 행 수(${kwNested.length})가 같아야 합니다.`,
        ],
      };
    }
  }

  const newAnswer: Record<string, unknown> = { ...ans, model: segments };
  if (kwNested.length > 0) {
    newAnswer.keywords = kwNested;
  } else {
    delete newAnswer.keywords;
  }
  return { ok: true, q: { ...q, type: "short_answer", answer: newAnswer } };
}

/** `keywords`가 `string[]`이거나 빈칸별 `string[][]`인지 구분해 한 줄로 합침. */
function flattenAnswerKeywords(kw: unknown): string[] {
  if (kw == null) return [];
  if (!Array.isArray(kw) || kw.length === 0) return [];
  if (typeof kw[0] === "string" && (kw as unknown[]).every((x) => typeof x === "string")) {
    return (kw as string[]).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray((kw as unknown[])[0])) {
    return (kw as string[][])
      .flat()
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * - model: 문자열(기본) / string[](빈칸 n개) 모두 허용
 * - keywords: string[] 또는 string[][](빈칸별 후보) 모두 허용
 */
function normalizeAnswerObject(
  ans: Record<string, unknown>,
  qPrefix: string
):
  | { ok: true; model: string; keywords: string[]; rubric?: string[]; synonyms: string[]; blanks?: ShortAnswerBlank[] }
  | { ok: false; errors: string[] } {
  const kwFlat = flattenAnswerKeywords(ans.keywords);
  const m = ans.model;
  if (m == null) {
    return { ok: false, errors: [`${qPrefix}.answer.model: 필수`] };
  }
  if (ans.rubric != null) {
    if (!Array.isArray(ans.rubric) || !ans.rubric.every((r) => typeof r === "string")) {
      return { ok: false, errors: [`${qPrefix}.answer.rubric: string[]`] };
    }
  }

  if (typeof m === "string" && m.trim()) {
    const rubric = ans.rubric
      ? (ans.rubric as string[]).map((r) => r.trim()).filter(Boolean)
      : undefined;
    if (ans.keywords == null) {
      return { ok: true, model: m.trim(), keywords: [], rubric, synonyms: [] };
    }
    const isFlat =
      (ans.keywords as unknown[]).every((x) => typeof x === "string") && Array.isArray(ans.keywords);
    const isNested =
      Array.isArray(ans.keywords) &&
      (ans.keywords as unknown[]).length > 0 &&
      Array.isArray((ans.keywords as unknown[])[0]);
    if (!isFlat && !isNested) {
      return { ok: false, errors: [`${qPrefix}.answer.keywords: string[]`] };
    }
    if (isFlat) {
      for (const t of ans.keywords as string[]) {
        if (typeof t === "string" && !t.trim()) {
          return { ok: false, errors: [`${qPrefix}.answer.keywords: 빈 문자열 불가`] };
        }
      }
    }
    return { ok: true, model: m.trim(), keywords: isNested ? kwFlat : (ans.keywords as string[]).map((s) => s.trim()).filter(Boolean), rubric, synonyms: [] };
  }
  if (Array.isArray(m) && m.length > 0 && m.every((x) => typeof x === "string")) {
    const parts = (m as string[]).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) {
      return { ok: false, errors: [`${qPrefix}.answer.model: 빈 배열`] };
    }
    const isNested =
      Array.isArray(ans.keywords) &&
      (ans.keywords as unknown[]).length > 0 &&
      Array.isArray((ans.keywords as unknown[])[0]);
    const kwNested = isNested ? (ans.keywords as string[][]) : null;
    const blanks: ShortAnswerBlank[] = parts.map((pm, i) => {
      const row = kwNested?.[i];
      const extra =
        row != null
          ? row
              .map((s) => s.trim())
              .filter(Boolean)
              .filter((s) => s !== pm)
          : [];
      return { model: pm, alts: extra };
    });
    const main = parts[0]!;
    const fromParts = new Set<string>([main, ...parts, ...kwFlat].filter(Boolean));
    const allKeywords = Array.from(fromParts);
    const synonyms: string[] = allKeywords.filter((s) => s && s !== main);
    const rubric = ans.rubric
      ? (ans.rubric as string[]).map((r) => r.trim()).filter(Boolean)
      : undefined;
    if (blanks.length >= 2) {
      return {
        ok: true,
        model: parts.join(" · "),
        keywords: allKeywords,
        rubric,
        synonyms: Array.from(new Set(synonyms)),
        blanks,
      };
    }
    return { ok: true, model: main, keywords: allKeywords, rubric, synonyms: Array.from(new Set(synonyms)) };
  }
  return { ok: false, errors: [`${qPrefix}.answer.model: 문자열 또는 string[]`] };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  data?: QuestionPack;
}

function validateQuestion(q: unknown, index: number): { ok: boolean; errors: string[]; q?: Question } {
  const prefix = `questions[${index}]`;
  const errors: string[] = [];
  if (!isObj(q)) {
    return { ok: false, errors: [`${prefix}: 객체만 가능합니다.`] };
  }
  let row = q;
  if (typeof q.type === "string" && q.type.trim() === "short_answer_triple") {
    const coerced = coerceShortAnswerTriple(row, prefix);
    if (!coerced.ok) {
      return { ok: false, errors: coerced.errors };
    }
    row = coerced.q;
  }
  if (typeof row.id !== "string" || !row.id.trim()) {
    errors.push(`${prefix}.id: 문자열 필수`);
  }
  if (typeof row.type !== "string" || !TYPES.includes(row.type as QuestionType)) {
    if (typeof row.type === "string" && EXTRA_JSON_TYPES.has(row.type.trim())) {
      errors.push(`${prefix}.type: ${TYPES.join(" | ")}, short_answer_triple(변환 실패)`);
    } else {
      errors.push(`${prefix}.type: ${TYPES.join(" | ")} 중 하나`);
    }
  }
  if (typeof row.prompt !== "string" || !row.prompt.trim()) {
    errors.push(`${prefix}.prompt: 문자열 필수`);
  }
  const ans = row.answer;
  let normalized: {
    model: string;
    keywords: string[];
    rubric?: string[];
    synonyms: string[];
    blanks?: ShortAnswerBlank[];
  } | null = null;
  if (!isObj(ans)) {
    errors.push(`${prefix}.answer: 객체 필수`);
  } else {
    if (ans.synonyms != null) {
      if (!Array.isArray(ans.synonyms) || !ans.synonyms.every((r) => typeof r === "string")) {
        errors.push(`${prefix}.answer.synonyms: string[] 또는 생략`);
      }
    }
    if (!errors.length) {
      const n = normalizeAnswerObject(ans, prefix);
      if (!n.ok) {
        errors.push(...n.errors);
      } else {
        const fileExtraSyn: string[] =
          ans.synonyms != null && Array.isArray(ans.synonyms)
            ? (ans.synonyms as string[]).map((s) => s.trim()).filter(Boolean)
            : [];
        const mergedSyns = Array.from(
          new Set([...n.synonyms, ...fileExtraSyn].map((s) => s).filter((s) => s !== n.model))
        );
        normalized = {
          model: n.model,
          keywords: n.keywords,
          rubric: n.rubric,
          synonyms: mergedSyns,
          ...(n.blanks && n.blanks.length > 0 ? { blanks: n.blanks } : {}),
        };
      }
    }
  }
  if (errors.length) return { ok: false, errors };
  if (!normalized) return { ok: false, errors: [`${prefix}.answer: 처리 실패`] };

  const a = normalized;

  const out: Question = {
    id: (row.id as string).trim(),
    type: row.type as QuestionType,
    prompt: (row.prompt as string).trim(),
    answer: {
      model: a.model,
      keywords: a.keywords,
      rubric: a.rubric,
      ...(a.synonyms.length > 0 ? { synonyms: a.synonyms } : {}),
      ...(a.blanks && a.blanks.length > 0 ? { blanks: a.blanks } : {}),
    },
  };
  if (typeof row.explanation === "string" && row.explanation.trim()) {
    out.explanation = row.explanation.trim();
  }
  if (
    isObj(row) &&
    typeof (row as Record<string, unknown>).source === "string" &&
    (row as Record<string, string>).source.trim()
  ) {
    out.source = (row as Record<string, string>).source.trim();
  } else if (
    isObj(row) &&
    typeof (row as Record<string, unknown>).source_slide === "string" &&
    (row as Record<string, string>).source_slide.trim()
  ) {
    out.source = (row as Record<string, string>).source_slide.trim();
  }
  if (Array.isArray(row.tags) && row.tags.length && row.tags.every((t) => typeof t === "string")) {
    out.tags = (row.tags as string[]).map((t) => t.trim()).filter(Boolean);
  }
  return { ok: true, errors: [], q: out };
}

export function validateQuestionPack(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) {
    return { ok: false, errors: ["루트는 객체여야 합니다."] };
  }
  if (!Array.isArray(input.questions)) {
    errors.push("questions: 배열 필수");
  } else if (input.questions.length === 0) {
    errors.push("questions: 최소 1문제");
  } else {
    const outQs: Question[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < input.questions.length; i++) {
      const v = validateQuestion(input.questions[i], i);
      if (!v.ok) {
        errors.push(...v.errors);
      } else if (v.q) {
        if (seen.has(v.q.id)) {
          errors.push(`questions: 중복 id "${v.q.id}"`);
        }
        seen.add(v.q.id);
        outQs.push(v.q);
      }
    }
    if (errors.length) return { ok: false, errors };
    const pack: QuestionPack = { questions: outQs };
    return { ok: true, errors: [], data: pack };
  }
  if (errors.length) return { ok: false, errors };
  return { ok: false, errors: ["알 수 없는 오류"] };
}
