export const MAX_EXAM_QUESTION_COUNT = 100;

export function getQuestionGroups(preview, bankKey) {
  if (Array.isArray(preview?.questionGroups) && preview.questionGroups.length) {
    return preview.questionGroups.filter((group) => Array.isArray(group.questions) && group.questions.length);
  }

  const questions = preview?.banks?.[bankKey] || preview?.generalQuestions || [];
  return questions.length ? [{ groupKey: bankKey || 'الاختبار كاملاً', questions }] : [];
}

export function getBalancedQuestionCounts(groups, requestedCount) {
  const capacities = groups.map((group) => group.questions.length);
  const totalAvailable = capacities.reduce((total, count) => total + count, 0);
  const requested = Number.isFinite(requestedCount) ? Math.floor(requestedCount) : 0;
  const count = Math.max(0, Math.min(requested, totalAvailable, MAX_EXAM_QUESTION_COUNT));
  const allocations = capacities.map(() => 0);
  let remaining = count;

  while (remaining > 0) {
    let allocatedThisRound = 0;
    for (let index = 0; index < capacities.length && remaining > 0; index += 1) {
      if (allocations[index] >= capacities[index]) continue;
      allocations[index] += 1;
      remaining -= 1;
      allocatedThisRound += 1;
    }
    if (!allocatedThisRound) break;
  }

  return allocations;
}

function sampleQuestions(questions, count, random) {
  const pool = [...questions];
  for (let index = 0; index < count; index += 1) {
    const swapIndex = index + Math.floor(random() * (pool.length - index));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

export function selectBalancedQuestions(groups, requestedCount, random = Math.random) {
  const allocations = getBalancedQuestionCounts(groups, requestedCount);
  const count = allocations.reduce((total, allocation) => total + allocation, 0);
  if (!count) throw new Error('اختر سؤالاً واحداً على الأقل للاختبار.');
  return groups.flatMap((group, index) => sampleQuestions(group.questions, allocations[index], random));
}
