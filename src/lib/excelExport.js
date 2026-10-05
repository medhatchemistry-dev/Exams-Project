// CSV export utilities (UTF-8 BOM so Arabic opens correctly in Excel).
import { getResultQuestions, parseQuestionSnapshot } from './resultQuestions.js';

const MARKERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function csvCell(v) {
  const s = String(v ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

function stripHtmlTags(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\\\(([^]*?)\\\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function downloadCsv(rows, filename) {
  const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Full results export: one row per student with grade info + score +
// per-question columns (student's answer vs the correct answer).
// Rebuilds each student's exam deterministically from their student number.
export async function exportResultsCsv(results) {
  const { loadQuestionBanks, buildExam } = await import('@/lib/quizBanks');
  const needsLegacyBanks = results.some((result) => !parseQuestionSnapshot(result.questions_json));
  const banks = needsLegacyBanks ? await loadQuestionBanks() : {};
  const questionColumnCount = Math.max(1, ...results.map((result) => Number(result.total) || 0));
  const rows = [
    ['اسم الطالب', 'رقم الطالب', 'الصف', 'المسار', 'الشعبة', 'الدرجة', 'من', 'النسبة', 'وقت التسليم', 'المصدر',
      'الاختبار', ...Array.from({ length: questionColumnCount }, (_, i) => [`س${i + 1} إجابة الطالب`, `س${i + 1} الصحيحة`]).flat()]
  ];

  for (const r of results) {
    const questions = getResultQuestions(r, () => buildExam(banks, r.grade, r.track, r.student_number, Number.isInteger(r.total) && r.total > 0 ? r.total : 25));
    const answers = safeParse(r.answers_json, {});
    const perQ = [];
    for (let i = 0; i < questionColumnCount; i++) {
      const q = questions[i];
      if (!q) {
        perQ.push('', '');
        continue;
      }
      const sa = answers[i];
      const saText = sa !== undefined && q.options[sa] ? stripHtmlTags(q.options[sa].ar) || MARKERS[sa] : 'لم تُجب';
      const corrText = q.options[q.answer] ? stripHtmlTags(q.options[q.answer].ar) || MARKERS[q.answer] : '';
      perQ.push(saText, corrText);
    }
    rows.push([
      r.student_name, r.student_number, r.grade, r.track, r.section,
      r.score, r.total, `${(r.percentage ?? 0).toFixed(1)}%`, r.submission_time, r.is_other ? 'Other' : 'قائمة',
      r.exam_title_snapshot || 'الاختبار الحالي',
      ...perQ
    ]);
  }
  downloadCsv(rows, 'نتائج-الطلاب.csv');
}

// Single-student export: grade + detailed exam (question, student's choice,
// correct choice, verdict).
export function exportSingleResultCsv(result) {
  const questions = result.questions || getResultQuestions(result) || [];
  const answers = safeParse(result.answers_json, {});
  const rows = [
    ['اسم الطالب', 'رقم الطالب', 'الصف', 'المسار', 'الشعبة', 'الاختبار', 'الدرجة', 'النسبة', 'وقت التسليم'],
    [result.student_name, result.student_number, result.grade, result.track, result.section, result.exam_title_snapshot || 'الاختبار الحالي',
      result.score, `${(result.percentage ?? 0).toFixed(1)}%`, result.submission_time],
    [],
    ['السؤال', 'إجابة الطالب', 'الإجابة الصحيحة', 'الحالة']
  ];
  questions.forEach((q, i) => {
    const sa = answers[i];
    const saText = sa !== undefined && q.options[sa] ? stripHtmlTags(q.options[sa].ar) : 'لم تُجب';
    const corrText = q.options[q.answer] ? stripHtmlTags(q.options[q.answer].ar) : '';
    const status = sa === undefined ? 'لم تُجب' : parseInt(sa, 10) === q.answer ? 'صحيحة ✓' : 'خاطئة ✗';
    rows.push([`السؤال ${i + 1} — ${stripHtmlTags(q.qAr)}`, saText, corrText, status]);
  });
  downloadCsv(rows, `تقرير-${result.student_name}.csv`);
}

export function exportExamGradesCsv({ exam, roster = [], results = [] }) {
  const byNumber = new Map();
  for (const result of results) {
    const key = String(result.student_number || '').trim();
    if (!key) continue;
    const previous = byNumber.get(key);
    if (!previous || new Date(result.created_at || 0) > new Date(previous.created_at || 0)) byNumber.set(key, result);
  }
  const rows = [['رقم ESE', 'اسم الطالب بالعربية', 'Student name (English)', 'الصف', 'المسار', 'الشعبة', 'الدرجة']];
  const seen = new Set();
  for (const student of roster) {
    const number = String(student.student_number || '').trim();
    if (!number) continue;
    seen.add(number);
    const result = byNumber.get(number);
    rows.push([
      number,
      student.full_name_ar || student.full_name || result?.student_name || '',
      student.full_name_en || '',
      student.grade || exam.target_grade || '',
      student.track || exam.target_track || '',
      student.section || exam.target_section || '',
      result ? `${result.score}/${result.total}` : 'لم يسلّم',
    ]);
  }
  for (const result of results) {
    const number = String(result.student_number || '').trim();
    if (number && seen.has(number)) continue;
    rows.push([
      number || '—', result.student_name || '', '', result.grade || '', result.track || '', result.section || '', `${result.score}/${result.total}`,
    ]);
  }
  downloadCsv(rows, `درجات-${String(exam.title || 'الاختبار').replace(/[\\/:*?"<>|]/g, '-')}.csv`);
}

function safeParse(str, fallback) {
  try {
    return (typeof str === 'string' ? JSON.parse(str || '') : str) || fallback;
  } catch (e) {
    return fallback;
  }
}
