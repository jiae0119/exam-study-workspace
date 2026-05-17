export interface EssayAiResult {
  score: number;
  feedback: string;
  suggestedPass: boolean;
  rawText?: string;
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";
/**
 * [가격/무료 등급](https://ai.google.dev/gemini-api/docs/pricing?hl=ko) 기준, 표준(텍스트) **무료** 입·출력이 있는 Flash 계열.
 * `gemini-2.0-flash`는 Google 문서상 지원 중단 예정(무료 쿼터 0로 보일 수 있음)이라 기본은 2.5로 둡니다. 더 가볍게 쓰려면 `gemini-2.5-flash-lite` 등.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const SYSTEM_TEXT = `You are a fair exam grader. Respond with ONLY a JSON object, no markdown, in this exact shape:
{"score":0.0-1.0,"feedback":"한국어로 짧은 코멘트","suggestedPass":true or false}
Score 1.0 means fully meets model answer and rubric. suggestedPass: true if score >= 0.7.`;

function buildUserBlock(
  prompt: string,
  modelAnswer: string,
  rubric: string[] | undefined,
  keywords: string[],
  userAnswer: string
) {
  const rubText = (rubric?.length ? rubric : []).map((r) => `- ${r}`).join("\n");
  const kw = keywords.length ? keywords.join(", ") : "(없음)";
  return `문제: ${prompt}

모범답안: ${modelAnswer}

채점 루브릭(있으면):
${rubText}

핵심 키워드(참고): ${kw}

학습자 답안:
${userAnswer}
`;
}

function toResultFromModelText(text: string): EssayAiResult {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      score: 0.5,
      feedback: "응답 파싱 실패. 자가채점으로 확인해 주세요.",
      suggestedPass: false,
      rawText: text,
    };
  }
  let parsed: { score?: number; feedback?: string; suggestedPass?: boolean };
  try {
    parsed = JSON.parse(match[0]!) as typeof parsed;
  } catch {
    return {
      score: 0.5,
      feedback: "JSON 파싱 실패. 자가채점으로 확인해 주세요.",
      suggestedPass: false,
      rawText: text,
    };
  }
  const score = typeof parsed.score === "number" ? Math.max(0, Math.min(1, parsed.score)) : 0.5;
  return {
    score,
    feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
    suggestedPass: Boolean(parsed.suggestedPass),
    rawText: text,
  };
}

/**
 * Anthropic — 키·요청은 클라이언트에만(로컬).
 */
export async function gradeEssayWithAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  modelAnswer: string,
  rubric: string[] | undefined,
  keywords: string[],
  userAnswer: string
): Promise<EssayAiResult> {
  const user = buildUserBlock(prompt, modelAnswer, rubric, keywords, userAnswer);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: user }],
      system: SYSTEM_TEXT,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const text = data.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
  return toResultFromModelText(text);
}

type GeminiContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string; code?: number; status?: string };
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
};

/** API 키가 Google에 인식되는지 가볍게 확인(모델 목록 GET). */
export async function verifyGeminiApiKey(apiKey: string): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const k = apiKey.trim();
  if (!k) {
    return { ok: false, message: "키를 먼저 입력하세요." };
  }
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    method: "GET",
    headers: { "x-goog-api-key": k },
  });
  if (res.ok) {
    return { ok: true };
  }
  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
  const m = j.error?.message ?? res.statusText;
  return { ok: false, message: `${res.status} ${j.error?.status ?? ""} ${m}`.trim().slice(0, 400) };
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => {
    setTimeout(r, ms);
  });
}

/** 서버/한도 쪽 일시 오류(재시도 가치가 있는 경우) */
const GEMINI_RETRIABLE = new Set([429, 500, 502, 503, 504]);

/**
 * Google Gemini `generateContent` (REST) — [빠른 시작](https://ai.google.dev/gemini-api/docs/quickstart?hl=ko)과 동일하게 `x-goog-api-key` 헤더 사용.
 * 무료·유료 한도·모델명은 Google 쪽 정책을 따릅니다.
 * 503/429 등이 나오면 **짧게 몇 번 자동 재시도**합니다(수요 스파이크·일시 부하).
 */
export async function gradeEssayWithGemini(
  apiKey: string,
  model: string,
  prompt: string,
  modelAnswer: string,
  rubric: string[] | undefined,
  keywords: string[],
  userAnswer: string
): Promise<EssayAiResult> {
  const userBlock = buildUserBlock(prompt, modelAnswer, rubric, keywords, userAnswer);
  const full = `${SYSTEM_TEXT}

---
${userBlock}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const maxAttempts = 4;
  let lastStatus = 0;
  let lastMessage = "요청 실패";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const wait = [1000, 2000, 3600][attempt - 1] ?? 2000;
      await sleepMs(wait);
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: full }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.2,
        },
      }),
    });

    const data = (await res.json().catch(() => ({}))) as GeminiContentResponse;
    lastStatus = res.status;
    lastMessage = data.error?.message != null ? String(data.error.message) : res.statusText;

    if (res.ok) {
      if (data.promptFeedback?.blockReason) {
        const b = data.promptFeedback.blockReasonMessage ?? data.promptFeedback.blockReason;
        throw new Error(`요청이 차단됨: ${b} (프롬프트/안전 정책. 문항·답을 짧게 나눠 보세요.)`);
      }
      const c0 = data.candidates?.[0];
      const text =
        c0?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("\n")
          .trim() ?? "";
      if (!text) {
        const fr = c0?.finishReason ?? "—";
        const hint =
          fr === "SAFETY" || fr === "BLOCKLIST"
            ? "안전 필터. 프롬프트를 짧게 조정하세요."
            : fr === "MAX_TOKENS"
              ? "출력 토큰 부족. 모델명/한도를 확인하세요."
              : "응답 본문 없음(모델·한도·모델 ID)";
        return {
          score: 0.5,
          feedback: `빈 응답(finishReason: ${fr}). ${hint}`,
          suggestedPass: false,
        };
      }
      return toResultFromModelText(text);
    }

    const canRetry = GEMINI_RETRIABLE.has(res.status) && attempt < maxAttempts - 1;
    if (canRetry) {
      continue;
    }

    const base = `Gemini ${res.status}: ${String(lastMessage).slice(0, 500)}`;
    const hint503 =
      res.status === 503
        ? " (Google 쪽 수요가 몰릴 때 나옵니다. 잠시 뒤 “AI로 채점”을 다시 누르거나, 설정에서 `gemini-2.5-flash-lite` 등 가벼운 모델로 바꿔 보세요.)"
        : res.status === 429
          ? " (한도·할당을 확인하세요. 잠시 뒤 다시 시도.)"
          : "";
    throw new Error(base + hint503);
  }

  throw new Error(`Gemini ${lastStatus}: ${String(lastMessage).slice(0, 500)}`);
}
