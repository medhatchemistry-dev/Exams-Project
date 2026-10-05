import React, { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { publishExamRevision } from '@/lib/examRepository';
import { sanitizeExamBanks } from '@/lib/examImport';
import ExamQuestionEditor from './ExamQuestionEditor';

export default function ExamEditDialog({ exam, onClose, onPublished }) {
  const [title, setTitle] = useState(exam.title || '');
  const [sourceFilename, setSourceFilename] = useState(exam.source_filename || 'exam.html');
  const [duration, setDuration] = useState(exam.duration_minutes ? String(exam.duration_minutes) : '');
  const [banks, setBanks] = useState(exam.banks || {});
  const [selectedBank, setSelectedBank] = useState(Object.keys(exam.banks || {})[0] || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bankQuestions = banks[selectedBank] || [];
  const untranslated = useMemo(() => Object.values(banks).flat().reduce((count, question) => (
    count + Number(!question.qEn) + question.options.filter((option) => !option.en).length
  ), 0), [banks]);

  const save = async () => {
    setError('');
    if (!title.trim()) { setError('اكتب اسم الاختبار.'); return; }
    if (duration && (!Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 480)) {
      setError('أدخل مدة بين دقيقة واحدة و480 دقيقة، أو اتركها فارغة.');
      return;
    }
    let validated;
    try { validated = sanitizeExamBanks(banks); }
    catch (validationError) { setError(`راجع الأسئلة ومفتاح الإجابة: ${validationError.message}`); return; }

    setBusy(true);
    try {
      const revision = await publishExamRevision({
        id: exam.id,
        title: title.trim(),
        source_filename: sourceFilename.trim() || 'teacher-edited.html',
        banks: validated,
        target_grade: exam.target_grade,
        target_track: exam.target_track,
        target_section: exam.target_section,
        duration_minutes: duration || null,
      });
      onPublished(revision);
    } catch (publishError) {
      console.error('Exam revision publish failed:', publishError);
      setError('تعذر نشر التعديل. تأكد من تطبيق تحديث قاعدة البيانات وأن الاختبار غير مؤرشف.');
    } finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-[95] grid place-items-center bg-slate-950/55 p-3 sm:p-5" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="exam-edit-title" className="mol-card max-h-[94vh] w-full max-w-5xl overflow-y-auto p-5 sm:p-7">
      <header className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>نسخة جديدة · الإصدار الحالي {exam.current_revision || 1}</p><h3 id="exam-edit-title" className="mt-1 text-2xl font-extrabold">تحرير الاختبار المنشور</h3></div>
        <button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" disabled={busy} onClick={onClose}><X size={16} /> إغلاق</button>
      </header>
      <p className="mt-3 rounded-xl p-3 text-sm font-bold" style={{ background: 'var(--mol-cobalt-soft)', color: 'var(--mol-cobalt)' }}>
        النشر ينشئ إصداراً جديداً للمحاولات القادمة. الطلاب الذين بدأوا بالفعل ونتائجهم الحالية تبقى مرتبطة بالإصدار الأصلي.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="mol-label">اسم الاختبار<input className="mol-input mt-1" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="mol-label">مدة الاختبار بالدقائق (اختياري)<input className="mol-input mt-1" type="number" min="1" max="480" value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="بدون حد زمني" /></label>
      </div>
      <label className="mol-label mt-3 block">اسم ملف المصدر<input className="mol-input mt-1" maxLength={255} value={sourceFilename} onChange={(event) => setSourceFilename(event.target.value)} /></label>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="mol-label">بنك الأسئلة<select className="mol-input mt-1 min-w-52" value={selectedBank} onChange={(event) => setSelectedBank(event.target.value)}>{Object.keys(banks).map((key) => <option value={key} key={key}>{key} ({banks[key].length})</option>)}</select></label>
        <span className="text-xs font-bold" style={{ color: untranslated ? 'var(--mol-amber)' : 'var(--mol-green)' }}>{untranslated ? `${untranslated} ترجمة إنجليزية تحتاج مراجعة المعلم.` : 'تمت مراجعة الترجمات الإنجليزية.'}</span>
      </div>
      {selectedBank && <div className="mt-4"><ExamQuestionEditor questions={bankQuestions} onChange={(questions) => setBanks((current) => ({ ...current, [selectedBank]: questions }))} /></div>}
      {error && <p role="alert" className="mt-5 rounded-xl p-4 text-sm font-bold" style={{ background: 'var(--mol-red-soft)', color: 'var(--mol-red)' }}>{error}</p>}
      <footer className="mt-6 flex justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--mol-line-strong)' }}>
        <button type="button" className="mol-btn mol-btn-ghost px-4 py-2.5" disabled={busy} onClick={onClose}>إلغاء</button>
        <button type="button" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-5 py-2.5" disabled={busy} onClick={save}>{busy ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}{busy ? 'جارٍ نشر الإصدار…' : 'نشر الإصدار الجديد'}</button>
      </footer>
    </section>
  </div>;
}
