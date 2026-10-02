import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { buildExam, selectExamBank } = await import('../src/lib/examExecution.js');

const banks = {
  '10-متقدم': [
    { id: 'A', qAr: 'السؤال الأول', options: [{ ar: 'أ' }, { ar: 'ب' }, { ar: 'ج' }, { ar: 'د' }], answer: 2 },
    { id: 'B', qAr: 'السؤال الثاني', options: [{ ar: '١' }, { ar: '٢' }, { ar: '٣' }, { ar: '٤' }], answer: 0 },
    { id: 'C', qAr: 'السؤال الثالث', options: [{ ar: 'س' }, { ar: 'ص' }, { ar: 'ع' }, { ar: 'غ' }], answer: 1 },
  ],
  '12-متقدم': [{ id: 'LEGACY', qAr: 'قديم', options: [{ ar: 'أ' }, { ar: 'ب' }], answer: 0 }],
};

test('selects the matching imported exam bank without falling back to another grade', () => {
  const result = selectExamBank({ legacy: false, banks }, '10', 'متقدم', {});
  assert.equal(result.bankKey, '10-متقدم');
  assert.equal(result.questions.length, 3);
  assert.throws(() => selectExamBank({ legacy: false, banks }, '11', 'عام', {}), /لا يحتوي الاختبار/);
});

test('re-sanitizes a stored imported bank and removes answer keys before student rendering', () => {
  const dirtyValidation = {
    legacy: false,
    banks: { '10-متقدم': [{ qAr: '<img src="x" onerror="alert(1)">سؤال', options: [{ ar: 'أ' }, { ar: 'ب' }], answer: 0 }] },
  };
  const selected = selectExamBank(dirtyValidation, '10', 'متقدم', {}, { exposeAnswers: false });
  assert.doesNotMatch(selected.questions[0].qAr, /onerror/i);
  assert.match(selected.questions[0].qAr, /سؤال/);
  assert.equal(Object.hasOwn(selected.questions[0], 'answer'), false);
});

test('accepts imported exam payload with no bundled bank loaded and withholds keys before submission', () => {
  const imported = selectExamBank({
    valid: true,
    legacy: false,
    examId: 15,
    examTitle: 'امتحان تجريبي',
    banks: { '10-متقدم': [{ id: 'I1', qAr: 'مستورد', options: [{ ar: 'أ' }, { ar: 'ب' }], answer: 1 }] },
  }, '10', 'متقدم', {}, { exposeAnswers: false });
  assert.equal(imported.examId, 15);
  assert.equal(imported.examTitle, 'امتحان تجريبي');
  assert.equal(imported.questions.length, 1);
  assert.equal(Object.hasOwn(imported.questions[0], 'answer'), false);
});

test('uses bundled question banks for legacy unlinked codes', () => {
  const legacy = selectExamBank({ legacy: true }, '12', 'متقدم', banks);
  assert.equal(legacy.bankKey, '12-متقدم');
  assert.equal(legacy.questions[0].id, 'LEGACY');
});

test('shuffles repeatably per student and exam while preserving answer mapping', () => {
  const first = buildExam(banks, '10', 'متقدم', 'student-1', { examId: 41 });
  const second = buildExam(banks, '10', 'متقدم', 'student-1', { examId: 41 });
  assert.deepEqual(first, second);
  for (const question of first) {
    assert.equal(question.options[question.answer].ar, banks['10-متقدم'].find((item) => item.id === question.id).options[banks['10-متقدم'].find((item) => item.id === question.id).answer].ar);
  }
});

test('question snapshots preserve exact question and option order', () => {
  const questions = buildExam(banks, '10', 'متقدم', 'student-2', { examId: 82 });
  const snapshot = JSON.parse(JSON.stringify(questions));
  banks['10-متقدم'][0].qAr = 'changed after start';
  assert.notEqual(snapshot.find((question) => question.id === 'A')?.qAr, 'changed after start');
});

test('legacy reports can reconstruct the result’s stored question count', () => {
  const result = { total: 3 };
  const reconstructed = buildExam(banks, '10', 'متقدم', 'legacy-student', { legacy: true, takeCount: result.total });
  assert.equal(reconstructed.length, result.total);
});
