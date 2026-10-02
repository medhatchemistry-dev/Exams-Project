const GRADES = new Set(['10', '11', '12']);
const TRACKS = new Set(['متقدم', 'عام']);
const SECTIONS = new Set(['1', '2']);

export class LegacySubmissionError extends Error {}

function reject(message) {
  throw new LegacySubmissionError(message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right);
}

export function toPublicQuestionBanks(banks) {
  if (!isRecord(banks)) reject('Legacy question bank is unavailable');
  return Object.fromEntries(Object.entries(banks).map(([bankKey, questions]) => [
    bankKey,
    Array.isArray(questions)
      ? questions.map((question) => {
        if (!isRecord(question)) reject('Legacy question bank is malformed');
        const { answer: _answer, ...publicQuestion } = question;
        return publicQuestion;
      })
      : [],
  ]));
}

export function buildLegacySubmission({ banks, student, answers, questions, submissionTime, isAuto = false }) {
  if (!isRecord(student)) reject('Invalid student details');
  const studentName = typeof student.name === 'string' ? student.name.trim() : '';
  const studentNumber = typeof student.id === 'string' ? student.id.trim() : '';
  if (!studentName || studentName.length > 160) reject('Invalid student name');
  if (!studentNumber || studentNumber.length > 80) reject('Invalid student number');
  if (!GRADES.has(student.grade) || !TRACKS.has(student.track) || !SECTIONS.has(student.section)) {
    reject('Invalid student class');
  }
  if (typeof submissionTime !== 'string' || !submissionTime.trim() || submissionTime.length > 100) {
    reject('Invalid submission time');
  }
  if (!isRecord(answers) || Object.keys(answers).length > 100) reject('Invalid answers payload');
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 100) reject('Invalid question snapshot');

  const bankKey = `${student.grade}-${student.track}`;
  const canonicalQuestions = banks?.[bankKey];
  if (!Array.isArray(canonicalQuestions) || canonicalQuestions.length !== questions.length) {
    reject('Submitted question list does not match the legacy bank');
  }

  const canonicalById = new Map();
  for (const question of canonicalQuestions) {
    if (!isRecord(question) || typeof question.id !== 'string' || !Array.isArray(question.options)
      || !Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length
      || canonicalById.has(question.id)) {
      reject('Legacy question bank is malformed');
    }
    canonicalById.set(question.id, question);
  }

  for (const key of Object.keys(answers)) {
    if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= questions.length) reject('Answer index is outside the question list');
  }

  let score = 0;
  const checkedQuestions = [];
  const seenQuestionIds = new Set();
  for (const [index, submittedQuestion] of questions.entries()) {
    if (!isRecord(submittedQuestion) || Object.hasOwn(submittedQuestion, 'answer')
      || typeof submittedQuestion.id !== 'string' || seenQuestionIds.has(submittedQuestion.id)) {
      reject('Invalid public question snapshot');
    }
    seenQuestionIds.add(submittedQuestion.id);
    const canonicalQuestion = canonicalById.get(submittedQuestion.id);
    if (!canonicalQuestion || !Array.isArray(submittedQuestion.options)
      || submittedQuestion.options.length !== canonicalQuestion.options.length) {
      reject('Question is not part of the legacy exam');
    }

    const canonicalOptionCounts = new Map();
    for (const option of canonicalQuestion.options) {
      const key = stableJson(option);
      canonicalOptionCounts.set(key, (canonicalOptionCounts.get(key) || 0) + 1);
    }
    for (const option of submittedQuestion.options) {
      const key = stableJson(option);
      const count = canonicalOptionCounts.get(key) || 0;
      if (!count) reject('Submitted options were modified or duplicated');
      if (count === 1) canonicalOptionCounts.delete(key);
      else canonicalOptionCounts.set(key, count - 1);
    }
    if (canonicalOptionCounts.size) reject('Submitted option set does not match the legacy exam');

    const correctOption = canonicalQuestion.options[canonicalQuestion.answer];
    const displayedCorrectAnswer = submittedQuestion.options.findIndex((option) => sameJson(option, correctOption));
    if (displayedCorrectAnswer < 0) reject('Correct option is missing from the submitted question');

    const answer = answers[String(index)];
    if (answer !== undefined) {
      if (!Number.isInteger(answer) || answer < 0 || answer >= submittedQuestion.options.length) {
        reject('Invalid answer option index');
      }
      if (sameJson(submittedQuestion.options[answer], correctOption)) score += 1;
    }

    const { answer: _canonicalAnswer, options: _canonicalOptions, ...questionSnapshot } = canonicalQuestion;
    checkedQuestions.push({
      ...questionSnapshot,
      options: submittedQuestion.options,
      answer: displayedCorrectAnswer,
      index: index + 1,
    });
  }
  if (seenQuestionIds.size !== canonicalById.size) reject('Submitted question list does not match the legacy bank');
  if (isAuto) score = 0;

  const total = checkedQuestions.length;
  return {
    score,
    total,
    result: {
      student_name: studentName,
      student_number: studentNumber,
      grade: student.grade,
      track: student.track,
      section: student.section,
      score,
      total,
      answers_json: answers,
      submission_time: submissionTime,
      is_other: Boolean(student.isOther),
      exam_id: null,
      exam_title_snapshot: 'الاختبار الحالي',
      questions_json: checkedQuestions,
    },
  };
}
