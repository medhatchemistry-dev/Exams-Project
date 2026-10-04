import { sanitizePublicExamQuestion } from './examImport.js';

export function selectExamBank(validation, grade, track, legacyBanks = {}) {
  const banks = validation?.legacy ? legacyBanks : validation?.banks;
  if (!banks || typeof banks !== 'object') throw new Error('بيانات الاختبار غير متاحة. أعد التحقق من الرمز.');
  const bankKey = `${grade}-${track}`;
  const questions = banks[bankKey];
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error(`لا يحتوي الاختبار على أسئلة للصف ${grade} والمسار ${track}.`);
  }
  const studentQuestions = questions.map((question, index) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)
      || typeof question.id !== 'string' || !question.id.trim()
      || !Array.isArray(question.options) || question.options.length < 2) {
      throw new Error(`${bankKey}, question ${index + 1}: بيانات السؤال غير صالحة.`);
    }
    return sanitizePublicExamQuestion(question, bankKey, index);
  });
  return { bankKey, questions: studentQuestions, examId: validation?.legacy ? null : validation.examId ?? null, examTitle: validation?.examTitle ?? null };
}

function makeRandom(seed) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280 - 0.5;
  };
}

export function buildExam(banks, grade, track, studentId, options = {}) {
  const key = `${grade}-${track}`;
  const bank = banks?.[key];
  if (!Array.isArray(bank)) throw new Error(`Question bank not found: ${key}`);
  const seedText = `${options.examId ?? 'legacy'}:${studentId}`;
  let seed = 0;
  for (let index = 0; index < seedText.length; index++) seed += seedText.charCodeAt(index);
  const random = makeRandom(seed);
  const shuffled = [...bank].sort(() => random());
  const takeCount = Number.isInteger(options.takeCount) && options.takeCount > 0
    ? options.takeCount
    : options.legacy === false ? shuffled.length : 25;

  return shuffled.slice(0, Math.min(takeCount, shuffled.length)).map((question, index) => {
    const choices = question.options.map((option, originalIndex) => ({ option, originalIndex }));
    choices.sort(() => random());
    const displayedQuestion = {
      ...question,
      options: choices.map(({ option }) => option),
      index: index + 1,
    };
    if (Number.isInteger(question.answer)) {
      displayedQuestion.answer = choices.findIndex(({ originalIndex }) => originalIndex === question.answer);
    } else {
      delete displayedQuestion.answer;
    }
    return displayedQuestion;
  });
}
