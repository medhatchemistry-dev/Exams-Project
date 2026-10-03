import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { parse } from 'acorn';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { parseExamHtml, sanitizeExamBanks } = await import('../src/lib/examImport.js');
const { parseExamPdfText } = await import('../src/lib/examPdfText.js');

function htmlFor(expression) {
  return `<!doctype html><html><body><script>const questionBanksByGrade = ${expression};</script></body></html>`;
}

const validBank = JSON.stringify({
  '10-متقدم': [{
    id: 'Q1',
    qAr: '<span style="color:#173b64">ما الناتج؟</span>',
    qEn: 'What is the result?',
    mediaHtml: '<div><img src="https://images.example.test/diagram.png" alt="diagram"></div>',
    options: [{ ar: 'واحد' }, { ar: 'اثنان' }, { ar: 'ثلاثة' }, { ar: 'أربعة' }],
    answer: 1,
  }],
});

test('parses literal question bank data and sanitizes safe markup', () => {
  const result = parseExamHtml(htmlFor(validBank), 'exam.html');
  assert.deepEqual(Object.keys(result.banks), ['10-متقدم']);
  assert.equal(result.bankSummaries[0].questionCount, 1);
  assert.match(result.banks['10-متقدم'][0].qAr, /ما الناتج/);
  assert.match(result.banks['10-متقدم'][0].mediaHtml, /https:\/\/images\.example\.test/);
});

test('rejects executable JavaScript instead of evaluating it', () => {
  const expression = `(()=>{globalThis.__examImportPwned=true;return ${validBank}})()`;
  assert.throws(() => parseExamHtml(htmlFor(expression), 'evil.html'), /unsupported|literal|expression/i);
  assert.equal(globalThis.__examImportPwned, undefined);
});

test('accepts no-substitution template strings as static data', () => {
  const html = '<html><script>const questionBanksByGrade = {"10-متقدم":[{qAr:`سؤال`,options:[{ar:`أ`},{ar:`ب`}],answer:0}]};</script></html>';
  const result = parseExamHtml(html, 'template-literal.html');
  assert.equal(result.banks['10-متقدم'][0].qAr, 'سؤال');
});

test('rejects interpolated template strings', () => {
  const html = '<html><script>const questionBanksByGrade = {"10-متقدم":[{qAr:`${globalThis.pwned=true}`,options:[{ar:`أ`},{ar:`ب`}],answer:0}]};</script></html>';
  assert.throws(() => parseExamHtml(html, 'interpolated.html'), /template|expression/i);
  assert.equal(globalThis.pwned, undefined);
});

test('requires the bank assignment to be declared in a script block', () => {
  assert.throws(() => parseExamHtml(`<!-- const questionBanksByGrade = ${validBank}; -->`, 'comment.html'), /missing.*assignment/i);
  assert.throws(() => parseExamHtml(`<div>const questionBanksByGrade = ${validBank};</div>`, 'text.html'), /missing.*assignment/i);
});

test('rejects invalid bank shape and answer index', () => {
  const invalid = JSON.stringify({ '13-advanced': [{ qAr: 'سؤال', options: [{ ar: 'A' }, { ar: 'B' }], answer: 3 }] });
  assert.throws(() => parseExamHtml(htmlFor(invalid), 'invalid.html'), /bank|answer|grade|track/i);
});

test('removes script and event handler markup and unsafe image URI schemes', () => {
  const bank = JSON.stringify({
    '10-متقدم': [{
      qAr: '<img src="x" onerror="alert(1)"><svg onload="alert(1)"></svg>',
      options: [{ ar: 'A' }, { ar: 'B' }],
      answer: 0,
      mediaHtml: '<img src="javascript:alert(1)" onerror="alert(1)"><img src="data:image/png;base64,AAAA" alt="safe">',
    }],
  });
  const parsed = parseExamHtml(htmlFor(bank), 'unsafe-markup.html');
  const question = parsed.banks['10-متقدم'][0];
  assert.doesNotMatch(question.qAr, /svg|onload|onerror/i);
  assert.doesNotMatch(question.mediaHtml, /javascript:|onerror/i);
  assert.match(question.mediaHtml, /data:image\/png/);
});

test('sanitizes stored exam banks again at the student rendering boundary', () => {
  const banks = sanitizeExamBanks({
    '10-متقدم': [{ qAr: '<img src="x" onerror="alert(1)">سؤال', options: [{ ar: 'أ' }, { ar: 'ب' }], answer: 0 }],
  });
  assert.doesNotMatch(banks['10-متقدم'][0].qAr, /onerror/i);
  assert.match(banks['10-متقدم'][0].qAr, /سؤال/);
  assert.throws(() => sanitizeExamBanks({ '10-متقدم': [{ qAr: 'x', options: [{ ar: 'a' }, { ar: 'b' }], answer: 3 }] }), /answer index/i);
});

test('rejects files over five mebibytes', () => {
  assert.throws(() => parseExamHtml(' '.repeat(5 * 1024 * 1024 + 1), 'large.html'), /5 MiB|size/i);
});

test('public legacy question bank contains questions but no answer keys', () => {
  const bundled = readFileSync(new URL('../public/question-bank.html', import.meta.url), 'utf8');
  const script = [...bundled.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map((match) => match[1])
    .find((source) => /questionBanksByGrade\s*=/.test(source));
  assert.ok(script);
  const program = parse(script, { ecmaVersion: 'latest' });
  const declaration = program.body
    .filter((statement) => statement.type === 'VariableDeclaration')
    .flatMap((statement) => statement.declarations)
    .find((item) => item.id?.name === 'questionBanksByGrade');
  assert.ok(declaration?.init?.type === 'ObjectExpression');
  assert.equal(declaration.init.properties.length, 5);
  const questions = declaration.init.properties.flatMap((bank) => bank.value.elements);
  assert.equal(questions.length, 125);
  for (const question of questions) {
    assert.ok(!question.properties.some((property) => property.key?.name === 'answer'));
  }
});

test('keeps safe exam layout styles and drops unsupported positioning styles', () => {
  const bank = JSON.stringify({
    '10-متقدم': [{
      qAr: 'أي اختيار؟',
      mediaHtml: '<div style="display:flex;justify-content:center;gap:20px;position:fixed;">محتوى</div>',
      options: [{ ar: 'أ' }, { ar: 'ب' }],
      answer: 1,
    }],
  });
  const parsed = parseExamHtml(htmlFor(bank), 'layout-styles.html');
  assert.match(parsed.banks['10-متقدم'][0].mediaHtml, /display: flex/);
  assert.match(parsed.banks['10-متقدم'][0].mediaHtml, /justify-content: center/);
  assert.match(parsed.banks['10-متقدم'][0].mediaHtml, /gap: 20px/);
  assert.doesNotMatch(parsed.banks['10-متقدم'][0].mediaHtml, /position/);
});

test('imports questions with English-only choices and fills the display-language fallback', () => {
  const bank = JSON.stringify({
    '10-متقدم': [{
      qEn: 'Which particle has a negative charge?',
      options: [{ ar: '', en: 'Electron' }, { ar: '', en: 'Proton' }],
      answer: 0,
    }],
  });

  const parsed = parseExamHtml(htmlFor(bank), 'english-only-choices.html');
  const question = parsed.banks['10-متقدم'][0];
  assert.equal(question.qAr, 'Which particle has a negative charge?');
  assert.equal(question.qEn, 'Which particle has a negative charge?');
  assert.deepEqual(question.options, [
    { ar: 'Electron', en: 'Electron' },
    { ar: 'Proton', en: 'Proton' },
  ]);
});

test('imports sectioned HTML question arrays through a static section map', () => {
  const sectionQuestion = (id, text, answer = 0) => ({
    id,
    qAr: text,
    options: [{ ar: 'أ' }, { ar: 'ب' }],
    answer,
  });
  const html = `<html><script>
    const section1Questions = ${JSON.stringify([sectionQuestion('Q1', 'الأول')])};
    const section2Questions = ${JSON.stringify([sectionQuestion('Q1', 'الثاني', 1)])};
    const sectionQuestionsMap = { 'القسم الأول': section1Questions, 'القسم الثاني': section2Questions };
  </script></html>`;

  const parsed = parseExamHtml(html, 'sectioned-exam.html');
  assert.deepEqual(parsed.bankSummaries, [{ bankKey: 'الاختبار كاملاً', questionCount: 2 }]);
  assert.deepEqual(parsed.generalQuestions.map((question) => question.qAr), ['الأول', 'الثاني']);
  assert.deepEqual(parsed.generalQuestions.map((question) => question.id), ['القسم الأول-Q1', 'القسم الثاني-Q1']);
  assert.equal(parsed.generalQuestions[1].answer, 1);
});

test('rejects executable section-map references without running them', () => {
  const html = `<html><script>
    const sectionQuestionsMap = { first: (() => { globalThis.__sectionMapPwned = true; return []; })() };
  </script></html>`;
  assert.throws(() => parseExamHtml(html, 'executable-section-map.html'), /static object literal|static question arrays|unsupported/i);
  assert.equal(globalThis.__sectionMapPwned, undefined);
});

test('imports text PDFs only when explicit options and an answer key are present', () => {
  const text = [
    '1) ما رمز الماء؟',
    'A) H2O',
    'B) CO2',
    'C) O2',
    'D) H2',
    '2. ما رمز الأكسجين؟',
    'أ) H2',
    'ب) O2',
    'ج) N2',
    'د) CO2',
    'Answer Key: 1-A, 2-B',
  ].join('\n');
  const parsed = parseExamPdfText(text, '10-متقدم');
  assert.equal(parsed.bankSummaries[0].questionCount, 2);
  assert.equal(parsed.banks['10-متقدم'][0].answer, 0);
  assert.equal(parsed.banks['10-متقدم'][1].answer, 1);
});

test('never asks Jev to guess missing answer keys for imported PDFs', () => {
  assert.throws(() => parseExamPdfText('1) سؤال\nA) أ\nB) ب', '10-متقدم'), /مفتاح الإجابة/);
  assert.throws(() => parseExamPdfText('', '10-متقدم'), /استخراج نص/);
});
