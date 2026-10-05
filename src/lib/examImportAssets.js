import { supabase } from '@/api/supabaseClient';

const MAX_INLINE_BYTES = 3 * 1024 * 1024;

export async function embedExamRemoteImages(parsedExam, sourceUrl) {
  const imageCache = new Map();
  let embeddedBytes = 0;
  const failedImages = new Set();

  const rewriteHtml = async (value) => {
    const html = String(value || '');
    if (!html.includes('<img')) return html;
    const template = document.createElement('template');
    template.innerHTML = html;
    for (const image of template.content.querySelectorAll('img[src^="https://"]')) {
      const url = image.getAttribute('src');
      if (!url) continue;
      if (!imageCache.has(url)) {
        if (embeddedBytes >= MAX_INLINE_BYTES) continue;
        const { data, error } = await supabase.functions.invoke('fetch-exam-source', {
          body: { action: 'asset', url, sourceUrl: sourceUrl || new URL(url).origin },
        });
        if (!error && typeof data?.dataUrl === 'string') {
          const bytes = Math.ceil(data.dataUrl.length * 0.75);
          if (embeddedBytes + bytes <= MAX_INLINE_BYTES) {
            imageCache.set(url, data.dataUrl);
            embeddedBytes += bytes;
          } else { imageCache.set(url, ''); failedImages.add(url); }
        } else { imageCache.set(url, ''); failedImages.add(url); }
      }
      const dataUrl = imageCache.get(url);
      if (dataUrl) image.setAttribute('src', dataUrl);
    }
    return template.innerHTML;
  };

  const rewriteQuestion = async (question) => ({
    ...question,
    qAr: await rewriteHtml(question.qAr),
    ...(question.qEn ? { qEn: await rewriteHtml(question.qEn) } : {}),
    ...(question.mediaHtml ? { mediaHtml: await rewriteHtml(question.mediaHtml) } : {}),
    options: await Promise.all(question.options.map(async (option) => ({
      ...option,
      ar: await rewriteHtml(option.ar),
      ...(option.en ? { en: await rewriteHtml(option.en) } : {}),
    }))),
  });

  const banks = {};
  for (const [key, questions] of Object.entries(parsedExam.banks || {})) {
    banks[key] = await Promise.all(questions.map(rewriteQuestion));
  }
  const generalQuestions = parsedExam.generalQuestions
    ? await Promise.all(parsedExam.generalQuestions.map(rewriteQuestion)) : parsedExam.generalQuestions;
  const questionGroups = parsedExam.questionGroups
    ? await Promise.all(parsedExam.questionGroups.map(async (group) => ({ ...group, questions: await Promise.all(group.questions.map(rewriteQuestion)) })))
    : parsedExam.questionGroups;
  return { ...parsedExam, banks, generalQuestions, questionGroups, unresolvedImageCount: failedImages.size };
}
