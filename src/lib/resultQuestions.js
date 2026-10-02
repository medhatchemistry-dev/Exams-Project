export function parseQuestionSnapshot(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const questions = JSON.parse(value);
    return Array.isArray(questions) ? questions : null;
  } catch {
    return null;
  }
}

export function getResultQuestions(result, legacyQuestionFactory) {
  const snapshot = parseQuestionSnapshot(result.questions_json);
  if (snapshot) return snapshot;
  if (typeof legacyQuestionFactory !== 'function') return null;
  return legacyQuestionFactory();
}
