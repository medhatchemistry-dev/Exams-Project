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
    try {
      return parseExamPdfText(pages.flat().join('\n'), bankKey);
    } catch (parseError) {
      const searchableText = pages.flat().join(' ').trim();
      if (searchableText.length > 40) throw parseError;
      if (document.numPages > 50) throw new Error('الملف الممسوح ضوئياً يتجاوز 50 صفحة. قسّمه ثم ارفع كل جزء على حدة.');
      const questions = [];
      let totalBytes = 0;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        let viewport = page.getViewport({ scale: 1.05 });
        let canvas = globalThis.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        let context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('تعذر تجهيز معاينة صفحات PDF.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        let image = canvas.toDataURL('image/jpeg', 0.58);
        if (image.length > 650_000) {
          viewport = page.getViewport({ scale: 0.72 });
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          context = canvas.getContext('2d', { alpha: false });
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport }).promise;
          image = canvas.toDataURL('image/jpeg', 0.48);
        }
        totalBytes += Math.ceil(image.length * 0.75);
        if (totalBytes > 3 * 1024 * 1024) throw new Error('حجم صور صفحات PDF كبير. قسّم الملف إلى أجزاء أصغر.');
        questions.push({
          id: `PDF-PAGE-${pageNumber}`,
          qAr: `أضف نص السؤال من صفحة PDF رقم ${pageNumber}`,
          options: [{ ar: '' }, { ar: '' }, { ar: '' }, { ar: '' }],
          answer: null,
          mediaHtml: `<img src="${image}" alt="معاينة صفحة PDF رقم ${pageNumber}" />`,
        });
      }
      return {
        banks: { [bankKey]: questions },
        bankSummaries: [{ bankKey, questionCount: questions.length }],
        scannedPdf: true,
      };
    }
  } finally {
    await document.destroy();
  }
}
