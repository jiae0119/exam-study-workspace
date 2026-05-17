export type QuestionType = "short_answer" | "short_sentence" | "essay";

/** ①~⑤ 빈칸 n개 (단답) — model + 추가 허용 표현 */
export interface ShortAnswerBlank {
  model: string;
  alts: string[];
}

export interface QuestionAnswer {
  model: string;
  keywords: string[];
  /** 서술형 루브릭(선택) */
  rubric?: string[];
  /** 단답형 유의어(선택) */
  synonyms?: string[];
  /** 5빈칸 등. 있으면 UI·채점이 빈칸별. 없으면 model·synonyms 단일 입력 */
  blanks?: ShortAnswerBlank[];
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  answer: QuestionAnswer;
  explanation?: string;
  source?: string;
  tags?: string[];
  /** JSON 한 번(한 파일) 가져온 묶음 — 시험지 구분 */
  packId?: string;
  packName?: string;
}

/** JSON 루트(가져오기 검증) — `questions`만 씀, 나머지 메타는 무시 */
export interface QuestionPack {
  questions: Question[];
}

export type ExamMode = "week" | "mixedRandom" | "byPack" | "byPackRandom";

export interface ExamSession {
  id: string;
  mode: ExamMode;
  weeks: number[];
  count: number;
  /** byPack / byPackRandom 일 때만 (시험지 = JSON 가져온 묶음) */
  packIds?: string[];
  packLabels?: string[];
  typeFilter?: QuestionType[] | null;
  startedAt: string;
  endedAt?: string;
  questionIds: string[];
  resultSummary?: {
    total: number;
    correct: number;
    byType: Partial<Record<QuestionType, { n: number; right: number }>>;
  };
}

export interface Attempt {
  id: string;
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  /** 0–1 */
  score?: number;
  feedback?: string;
  timestamp: string;
  examSessionId: string;
  /** essay AI/self-graded */
  essayGradingMode?: "ai" | "self" | "auto";
}

export type EssayAiProvider = "gemini" | "anthropic";

export interface AppSettings {
  animationOn: boolean;
  aiGradingOn: boolean;
  /** 서술형 AI: Gemini(권장·Google AI Studio 무료 배당) 또는 Anthropic */
  essayAiProvider: EssayAiProvider;
  /** Google AI Studio / Gemini API (브라우저·로컬만) */
  geminiApiKey?: string;
  /** 예: gemini-2.5-flash, gemini-2.5-flash-lite (빈 칸이면 앱 기본) */
  geminiModel?: string;
  /** Anthropic API key (local only) */
  anthropicApiKey?: string;
  /** 비우면 앱 기본(모델 상수) */
  anthropicModel?: string;
  duplicateIdStrategy: "skip" | "overwrite";
}

export interface UserState {
  bookmarkedQuestionIds: string[];
  wrongQuestionIds: string[];
  settings: AppSettings;
}

export const defaultSettings: AppSettings = {
  animationOn: true,
  aiGradingOn: true,
  essayAiProvider: "gemini",
  duplicateIdStrategy: "skip",
};
