import type { Attempt, ExamSession, QuestionType } from "../types/models";

export function buildSessionSummary(
  attempts: Pick<Attempt, "isCorrect" | "questionId">[],
  getType: (qid: string) => QuestionType
): NonNullable<ExamSession["resultSummary"]> {
  const byType: NonNullable<ExamSession["resultSummary"]>["byType"] = {};
  let correct = 0;
  for (const a of attempts) {
    if (a.isCorrect) correct++;
    const t = getType(a.questionId);
    if (!byType[t]) byType[t] = { n: 0, right: 0 };
    byType[t]!.n++;
    if (a.isCorrect) byType[t]!.right++;
  }
  return { total: attempts.length, correct, byType };
}
