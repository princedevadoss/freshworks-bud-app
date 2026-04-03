import type { QuestionItem } from "./testConfig";

/** Normalize free-text and MCQ answers for comparison. */
export function normalizeAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/×/g, "x")
    .replace(/\*/g, "")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/\^2\b/g, "2")
    .replace(/\^3\b/g, "3")
    .replace(/°/g, "")
    .replace(/→/g, "->");
}

export function answersMatch(expected: string, given: string): boolean {
  const a = normalizeAnswer(given);
  const b = normalizeAnswer(expected);
  if (a === b) return true;
  if (a.replace(/\s/g, "") === b.replace(/\s/g, "")) return true;
  return false;
}

export function scoreAnswers(
  questions: QuestionItem[],
  answers: Record<number, string>
): number {
  let score = 0;
  for (const q of questions) {
    const raw = answers[q.id];
    if (raw == null || raw === "") continue;
    if (answersMatch(q.answer, raw)) score += 1;
  }
  return score;
}
