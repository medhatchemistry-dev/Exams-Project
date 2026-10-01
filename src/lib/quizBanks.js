// Loads the chemistry question banks from the original assessment HTML
// (permanent public file on Base44 media) and caches the parsed object in sessionStorage.
// Blocked external image hosts (e.g. postimg.cc) are swapped for embedded
// data URIs shipped inside the app bundle, so images always render.
import imageMap from './quizImages.json';

const BANKS_URL =
  'https://media.base44.com/files/public/user_6aafb485bce75c5f36e8c6dc/038a70744_chemistry_quiz_fixed.html';
const CACHE_KEY = 'chemistry_quiz_banks_v2';

function rewriteMedia(banks) {
  for (const questions of Object.values(banks)) {
    for (const q of questions) {
      if (q.mediaHtml) {
        for (const [blockedUrl, dataUri] of Object.entries(imageMap)) {
          q.mediaHtml = q.mediaHtml.split(blockedUrl).join(dataUri);
        }
      }
    }
  }
  return banks;
}

export async function loadQuestionBanks() {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    /* ignore */
  }

  const res = await fetch(BANKS_URL);
  if (!res.ok) throw new Error('تعذر تحميل بنك الأسئلة');
  const html = await res.text();

  const marker = 'questionBanksByGrade = {';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('بنك الأسئلة غير موجود في المصدر');
  const objStart = html.indexOf('{', start);
  const close = html.indexOf('};', objStart);
  if (close === -1) throw new Error('بنك الأسئلة غير مكتمل');
  const code = html.slice(objStart, close + 1);

  // eslint-disable-next-line no-new-func
  const banks = rewriteMedia(new Function('return ' + code)());

  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(banks));
  } catch (e) {
    /* sessionStorage may be full; ignore */
  }
  return banks;
}

// Seeded shuffle (same student id => same order), mirrors the original algorithm
export function buildExam(banks, grade, track, studentId, takeCount = 25) {
  const key = `${grade}-${track}`;
  const bank = banks[key] || banks['12-متقدم'] || [];

  let seed = 0;
  for (let i = 0; i < studentId.length; i++) seed += studentId.charCodeAt(i);

  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280 - 0.5;
  };

  const shuffledBank = [...bank].sort(() => next());
  const count = Math.min(takeCount, shuffledBank.length);

  return shuffledBank.slice(0, count).map((q, qIndex) => {
    const optionsWithIndex = q.options.map((opt, idx) => ({ ...opt, originalIdx: idx }));
    const shuffledOptions = optionsWithIndex.sort(() => next());
    const newCorrect = shuffledOptions.findIndex((opt) => opt.originalIdx === q.answer);
    return {
      ...q,
      options: shuffledOptions.map(({ originalIdx, ...rest }) => rest),
      answer: newCorrect,
      index: qIndex + 1
    };
  });
}