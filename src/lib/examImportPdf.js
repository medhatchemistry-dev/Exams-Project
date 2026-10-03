import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseExamPdfText } from './examPdfText.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function groupTextByLine(items) {
  const rows = new Map();
  for (const item of items) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    const y = Math.round(item.transform?.[5] ?? 0);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x: item.transform?.[4] ?? 0, text: item.str });
  }
  return [...rows.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, fragments]) => fragments.sort((left, right) => left.x - right.x).map((fragment) => fragment.text).join(' ').trim())
    .filter(Boolean);
}

export async function parseExamPdf(input, bankKey, filename = 'exam.pdf') {
  if (!/\.pdf$/i.test(filename)) throw new Error('اختر ملف PDF.');
  const bytes = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) throw new Error('حجم ملف PDF يجب أن يكون بين 1 بايت و10 MiB.');
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const document = await loadingTask.promise;
  try {
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(groupTextByLine(content.items));
    }
    return parseExamPdfText(pages.flat().join('\n'), bankKey);
  } finally {
    await document.destroy();
  }
}
