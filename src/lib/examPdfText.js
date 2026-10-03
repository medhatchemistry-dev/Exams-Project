import { sanitizeExamBanks } from './examImport.js';

const ANSWER_LABELS = new Map([
  ['A', 0], ['B', 1], ['C', 2], ['D', 3],
  ['أ', 0], ['ا', 0], ['ب', 1], ['ج', 2], ['د', 3],
]);

function normalizeDigits(value) {
  return String(value).replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function answerIndex(label) {
  return ANSWER_LABELS.get(normalizeDigits(label).trim().replace(/[.)：:]/g, '').toUpperCase());
}

function questionLinesToBank(text) {
  const lines = normalizeDigits(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const keyedAnswers = new Map();
  for (const line of lines) {
    const keyLine = line.match(/^(?:answer\s*key|الإجابات\s*الصحيحة|مفتاح\s*الإجابة)\s*[:：-]\s*(.+)$/i);
    if (!keyLine) continue;
    for (const match of keyLine[1].matchAll(/(\d{1,3})\s*[-.)：:]?\s*([A-Dأابجد])/gi)) {
      keyedAnswers.set(Number(match[1]), answerIndex(match[2]));
    }
  }

  const questions = [];
  let current = null;
  const finishQuestion = () => {
    if (!current) return;
    const key = keyedAnswers.get(current.number);
    if (Number.isInteger(key)) current.answer = key;
    questions.push(current);
    current = null;
  };

  for (const line of lines) {
    if (/^(?:answer\s*key|الإجابات\s*الصحيحة|مفتاح\s*الإجابة)\s*[:：-]/i.test(line)) continue;
    const start = line.match(/^(?:q\s*)?(\d{1,3})\s*[.)\-:：]\s*(.+)$/i);
    if (start) {
      finishQuestion();
      current = { number: Number(start[1]), stem: start[2].trim(), options: [], answer: null };
      continue;
    }
    if (!current) continue;

    const option = line.match(/^([A-Dأابجد])\s*[.)\-:：]\s*(.+)$/i);
    if (option) {
      current.options.push({ label: option[1], text: option[2].trim() });
      continue;
    }
    const inlineAnswer = line.match(/^(?:answer|correct answer|الإجابة الصحيحة|الاجابة الصحيحة|الإجابة|الجواب)\s*[:：-]\s*([A-Dأابجد])\s*$/i);
    if (inlineAnswer) current.answer = answerIndex(inlineAnswer[1]);
    else current.stem = `${current.stem} ${line}`.trim();
  }
  finishQuestion();

  if (!questions.length) throw new Error('لم أجد أسئلة نصية منظمة في PDF. إذا كان ممسوحاً ضوئياً، ارفع نسخة قابلة للبحث أو ملف HTML.');
  for (const question of questions) {
    if (question.options.length < 2) throw new Error(`السؤال ${question.number} يحتاج خيارين على الأقل بعلامات A) أو أ).`);
    if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= question.options.length) {
      throw new Error(`مفتاح الإجابة للسؤال ${question.number} غير موجود أو غير صالح. أضف Answer: B بجانب السؤال أو Answer Key في نهاية الملف.`);
    }
  }

  return questions.map((question) => ({
    id: `PDF-${question.number}`,
    qAr: question.stem,
    options: question.options.map(({ text: option }) => ({ ar: option })),
    answer: question.answer,
  }));
}

export function parseExamPdfText(text, bankKey) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('لم أستطع استخراج نص من PDF. قد يكون الملف صورة ممسوحة ضوئياً.');
  if (!/^(10|11|12)-(متقدم|عام)$/.test(bankKey)) throw new Error('اختر الصف والمسار قبل معاينة ملف PDF.');
  const banks = sanitizeExamBanks({ [bankKey]: questionLinesToBank(text) });
  const questions = banks[bankKey];
  return { banks, bankSummaries: [{ bankKey, questionCount: questions.length }] };
}
