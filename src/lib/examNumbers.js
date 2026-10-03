export function getExamNumbers(exams) {
  const chronological = [...exams].sort((left, right) => {
    const createdAtDifference = Date.parse(left.created_at) - Date.parse(right.created_at);
    return Number.isFinite(createdAtDifference) && createdAtDifference !== 0
      ? createdAtDifference
      : Number(left.id) - Number(right.id);
  });

  return new Map(chronological.map((exam, index) => [String(exam.id), index + 1]));
}

export function filterExamsByGrade(exams, grade) {
  if (!grade) return exams;
  return exams.filter((exam) => String(exam.target_grade || '') === String(grade));
}
