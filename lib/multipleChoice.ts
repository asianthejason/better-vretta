export type MultipleChoiceSelectionMode = "single" | "multiple";

export type MultipleChoiceAnswerKey = {
  selectionMode?: MultipleChoiceSelectionMode;
  correctAnswer?: string;
  correctAnswers?: string[];
};

export function getMultipleChoiceSelectionMode(data: MultipleChoiceAnswerKey) {
  return data.selectionMode === "multiple" ? "multiple" : "single";
}

export function getMultipleChoiceCorrectAnswers(data: MultipleChoiceAnswerKey) {
  const answers = data.correctAnswers?.filter(Boolean) || [];
  if (answers.length > 0) return [...new Set(answers)];
  return data.correctAnswer ? [data.correctAnswer] : [];
}

export function normalizeMultipleChoiceResponse(answer: unknown, answers?: unknown) {
  if (Array.isArray(answers)) return [...new Set(answers.filter((value): value is string => typeof value === "string" && Boolean(value)))];
  if (Array.isArray(answer)) return [...new Set(answer.filter((value): value is string => typeof value === "string" && Boolean(value)))];
  return typeof answer === "string" && answer ? [answer] : [];
}

export function toggleMultipleChoiceAnswer(current: string[], answer: string, mode: MultipleChoiceSelectionMode) {
  if (mode === "single") return [answer];
  return current.includes(answer) ? current.filter((value) => value !== answer) : [...current, answer];
}

export function gradeMultipleChoice(data: MultipleChoiceAnswerKey, selectedAnswers: string[]) {
  const correct = getMultipleChoiceCorrectAnswers(data);
  const selected = [...new Set(selectedAnswers)];
  return correct.length > 0 && selected.length === correct.length && correct.every((answer) => selected.includes(answer));
}
