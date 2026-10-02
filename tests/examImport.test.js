import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { parseExamHtml, sanitizeExamBanks } = await import('../src/lib/examImport.js');

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

test('parses the bundled HTML question bank without executing it', () => {
  const bundled = readFileSync(new URL('../public/question-bank.html', import.meta.url), 'utf8');
  const parsed = parseExamHtml(bundled, 'question-bank.html');
  assert.equal(parsed.bankSummaries.length, 5);
  assert.equal(parsed.bankSummaries.reduce((total, bank) => total + bank.questionCount, 0), 125);
});
