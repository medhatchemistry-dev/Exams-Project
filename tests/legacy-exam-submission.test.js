import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { buildLegacySubmission, toPublicQuestionBanks } from '../supabase/functions/_shared/legacyExamSubmission.js';

const edgeFunction = readFileSync(new URL('../supabase/functions/validate-exam-code/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261002170000_add_trusted_legacy_exam_banks.sql', import.meta.url), 'utf8');
const answerReport = readFileSync(new URL('../src/components/quiz/AnswerReport.jsx', import.meta.url), 'utf8');
const publicBankHtml = readFileSync(new URL('../public/question-bank.html', import.meta.url), 'utf8');

function readLiteral(node) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  if (node.type === 'ArrayExpression') return node.elements.map(readLiteral);
  if (node.type === 'ObjectExpression') {
    return Object.fromEntries(node.properties.map((property) => [property.key.name ?? property.key.value, readLiteral(property.value)]));
  }
  throw new Error(`Unsupported public bank syntax: ${node.type}`);
}

function readPublicBanks() {
  const script = [...publicBankHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map((match) => match[1])
    .find((source) => /questionBanksByGrade\s*=/.test(source));
  const program = parse(script, { ecmaVersion: 'latest' });
  const declaration = program.body
    .filter((statement) => statement.type === 'VariableDeclaration')
    .flatMap((statement) => statement.declarations)
    .find((item) => item.id?.name === 'questionBanksByGrade');
  return readLiteral(declaration.init);
}

const canonicalBank = [
  {
    id: 'L-1',
    qAr: 'السؤال الأول',
    options: [{ ar: 'أ' }, { ar: 'ب' }],
    answer: 0,
  },
  {
    id: 'L-2',
    qAr: 'السؤال الثاني',
    options: [{ ar: 'ج' }, { ar: 'د' }],
    answer: 1,
  },
];

const validSubmission = {
  banks: { '10-متقدم': canonicalBank },
  student: { name: 'طالب', id: 'S-1', grade: '10', track: 'متقدم', section: '1', isOther: false },
  questions: [
    { id: 'L-1', qAr: 'السؤال الأول', options: [{ ar: 'ب' }, { ar: 'أ' }], index: 1 },
    { id: 'L-2', qAr: 'السؤال الثاني', options: [{ ar: 'د' }, { ar: 'ج' }], index: 2 },
  ],
  answers: { 0: 1, 1: 0 },
  submissionTime: '02/10/2026 12:00 م',
};

test('valid legacy submission is graded from the trusted bank and stores a canonical answer snapshot', () => {
  const submission = buildLegacySubmission(validSubmission);
  assert.equal(submission.score, 2);
  assert.equal(submission.total, 2);
  assert.equal(submission.result.score, 2);
  assert.equal(submission.result.exam_id, null);
  assert.equal(submission.result.questions_json[0].answer, 1);
  assert.equal(submission.result.questions_json[1].answer, 0);
});

test('the server grade is calculated from answers and ignores a tampered client score', () => {
  const submission = buildLegacySubmission({ ...validSubmission, score: 0, clientScore: 0 });
  assert.equal(submission.score, 2);
  assert.equal(submission.result.score, 2);
  assert.doesNotMatch(edgeFunction, /body\.score/);
});

test('malformed or out-of-range answers are rejected', () => {
  assert.throws(() => buildLegacySubmission({ ...validSubmission, answers: [] }), /Invalid answers payload/);
  assert.throws(() => buildLegacySubmission({ ...validSubmission, answers: { nope: 0 } }), /Answer index/);
  assert.throws(() => buildLegacySubmission({ ...validSubmission, answers: { 2: 0 } }), /Answer index/);
  assert.throws(() => buildLegacySubmission({ ...validSubmission, answers: { 0: 2 } }), /Invalid answer option index/);
  assert.throws(() => buildLegacySubmission({ ...validSubmission, answers: { 0: '1' } }), /Invalid answer option index/);
});

test('unknown question IDs and modified choices are rejected', () => {
  const unknownQuestion = validSubmission.questions.map((question) => ({ ...question }));
  unknownQuestion[0].id = 'forged-question';
  assert.throws(() => buildLegacySubmission({ ...validSubmission, questions: unknownQuestion }), /not part of the legacy exam/);

  const tamperedChoices = validSubmission.questions.map((question) => ({ ...question, options: [...question.options] }));
  tamperedChoices[0].options[0] = { ar: 'خيار مزور' };
  assert.throws(() => buildLegacySubmission({ ...validSubmission, questions: tamperedChoices }), /modified or duplicated/);

  const answerKey = validSubmission.questions.map((question) => ({ ...question }));
  answerKey[0].answer = 1;
  assert.throws(() => buildLegacySubmission({ ...validSubmission, questions: answerKey }), /Invalid public question snapshot/);
});

test('invalid legacy access codes are rejected before loading banks or inserting results', () => {
  const invalidCodeGuard = edgeFunction.indexOf('if (!resolution?.valid)');
  const submitBranch = edgeFunction.indexOf("if (body?.action === 'submit')", invalidCodeGuard);
  const legacyBankRead = edgeFunction.indexOf(".from('legacy_exam_question_banks')", submitBranch);
  const resultInsert = edgeFunction.indexOf(".from('exam_results')", submitBranch);
  assert.ok(invalidCodeGuard >= 0 && invalidCodeGuard < submitBranch);
  assert.match(edgeFunction, /consume_access_attempt[\s\S]*if \(body\?\.action === 'submit'\) return Response\.json\(\{ error: 'Exam access code is inactive or expired' \}/);
  assert.ok(legacyBankRead < resultInsert);
});

test('the public legacy question response strips all answer keys', () => {
  const publicBanks = toPublicQuestionBanks({ '10-متقدم': canonicalBank });
  assert.equal(publicBanks['10-متقدم'].length, canonicalBank.length);
  assert.ok(publicBanks['10-متقدم'].every((question) => !Object.hasOwn(question, 'answer')));
  assert.match(edgeFunction, /toPublicQuestionBanks\(bankRecord\.banks\)/);
  assert.match(answerReport, /showAnswerKey && !isCorrect/);
  assert.match(answerReport, /showAnswerKey && isCorrectOpt/);
});

test('the trusted legacy bank migration is private to the service role and seeds the singleton source', () => {
  assert.match(migration, /create table public\.legacy_exam_question_banks/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.legacy_exam_question_banks from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.legacy_exam_question_banks to service_role/i);
  assert.match(migration, /insert into public\.legacy_exam_question_banks \(id, banks\)/i);
  const bankSeed = migration.match(/\$legacy_banks\$([\s\S]*?)\$legacy_banks\$::jsonb/);
  assert.ok(bankSeed);
  const banks = JSON.parse(bankSeed[1]);
  const publicBanks = readPublicBanks();
  assert.equal(Object.keys(banks).length, 5);
  assert.equal(Object.values(banks).reduce((count, questions) => count + questions.length, 0), 125);
  assert.ok(Object.values(banks).flat().every((question) => Number.isInteger(question.answer)));
  assert.deepEqual(publicBanks, Object.fromEntries(Object.entries(banks).map(([key, questions]) => [
    key,
    questions.map(({ answer: _answer, ...question }) => question),
  ])));
});

test('imported submissions retain the existing server-side grading RPC', () => {
  assert.match(edgeFunction, /admin\.rpc\('submit_exam_attempt'/);
  assert.match(edgeFunction, /if \(resolution\.legacy\)/);
  assert.match(edgeFunction, /buildLegacySubmission\(/);
});
