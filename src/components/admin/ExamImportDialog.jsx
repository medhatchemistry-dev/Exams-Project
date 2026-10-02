import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Upload } from 'lucide-react';
import { parseExamHtml } from '@/lib/examImport';
import { saveExam } from '@/lib/examRepository';

export default function ExamImportDialog({ onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const inspectFile = async (nextFile) => {
    setFile(nextFile);
    setPreview(null);
    setError('');
    if (!nextFile) return;
    try {
      const text = await nextFile.text();
      setPreview(parseExamHtml(text, nextFile.name));
      if (!title) setTitle(nextFile.name.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim());
    } catch (parseError) {
      console.error('Exam HTML import validation failed:', parseError);
      setError(parseError.message || 'تعذر قراءة ملف الاختبار.');
    }
  };

  const importExam = async () => {
    if (!file || !preview || !title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const { data, error: authError } = await (await import('@/api/supabaseClient')).supabase.auth.getUser();
      if (authError) throw authError;
      await saveExam({ title: title.trim(), source_filename: file.name, banks: preview.banks, created_by: data.user?.id ?? null });
      onImported();
    } catch (saveError) {
      console.error('Exam save failed:', saveError);
      setError('تعذر حفظ الاختبار. تحقق من قاعدة البيانات وصلاحية المعلم.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/50 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="exam-import-title" className="mol-card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h3 id="exam-import-title" className="text-xl font-extrabold">استيراد اختبار من HTML</h3>
        <p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>يدعم ملف البنك الحالي الذي يحتوي على questionBanksByGrade. لا يتم عرض صفحة HTML ولا تشغيل سكربتاتها.</p>
        <label className="mol-label mt-5 block">اسم الاختبار<input className="mol-input mt-1" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثال: اختبار الكيمياء - الوحدة الأولى" /></label>
        <label className="mol-btn mol-btn-ghost mt-3 inline-flex cursor-pointer items-center gap-2 px-4 py-2"><Upload size={17} />{file?.name || 'اختر ملف HTML'}<input className="sr-only" type="file" accept=".html,.htm,text/html" onChange={(event) => inspectFile(event.target.files?.[0])} /></label>
        {preview && <div className="mt-5"><h4 className="font-extrabold">معاينة بنوك الأسئلة</h4><div className="mt-2 grid gap-2 sm:grid-cols-2">{preview.bankSummaries.map((bank) => <div key={bank.bankKey} className="mol-card flex items-center justify-between gap-3 p-3"><span className="font-bold">{bank.bankKey}</span><span className="font-extrabold">{bank.questionCount} سؤال</span></div>)}</div><p className="mt-3 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--mol-green)' }}><CheckCircle2 size={17} /> تمت مراجعة {preview.bankSummaries.reduce((count, bank) => count + bank.questionCount, 0)} سؤالاً.</p></div>}
        {error && <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg p-3 text-sm font-bold" style={{ background: 'var(--mol-red-soft)', color: 'var(--mol-red)' }}><AlertTriangle size={17} className="mt-0.5 shrink-0" />{error}</p>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" className="mol-btn mol-btn-ghost px-4 py-2" disabled={saving} onClick={onClose}>إلغاء</button><button type="button" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-4 py-2" disabled={saving || !preview || !title.trim()} onClick={importExam}>{saving ? <Loader2 size={16} className="animate-spin" /> : null} حفظ الاختبار</button></div>
      </section>
    </div>
  );
}
