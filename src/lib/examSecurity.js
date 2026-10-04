export function nextWarningState(currentCount) {
  const warningCount = Math.min(3, Math.max(0, Number(currentCount) || 0) + 1);
  return { warningCount, locked: warningCount >= 3 };
}

export function isDuplicateViolation(previousAt, currentAt, debounceMs = 1500) {
  return Number.isFinite(previousAt)
    && Number.isFinite(currentAt)
    && currentAt - previousAt >= 0
    && currentAt - previousAt < debounceMs;
}
