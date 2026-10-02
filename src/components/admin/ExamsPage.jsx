import React, { useCallback, useEffect, useState } from 'react';
import { Archive, BookOpen, Loader2, Plus, RefreshCw } from 'lucide-react';
import { archiveExam, listExams } from '@/lib/examRepository';
import ExamAccessPanel from './ExamAccessPanel';
import ExamImportDialog from './ExamImportDialog';

export default function ExamsPage() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showImport, setShowImport] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setExams(await listExams());
    } catch (loadError) {
      console.error('Exam list load failed:', loadError);
      setError('تعذر تحميل قائمة الاختبارات. تحقق من صلاحية حساب المعلم.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const archive = async (exam) => {
    if (!window.confirm(`أرشفة الاختبار «${exam.title}»؟ لن يمكن إصدار رموز جديدة له، وستبقى النتائج محفوظة.`)) return;
    setSavingId(exam.id);
    setError('');
    setNotice('');
    try {
      await archiveExam(exam.id);
      setNotice('تمت أرشفة الاختبار.');
      await refresh();
    } catch (archiveError) {
      console.error('Exam archive failed:', archiveError);
      setError('تعذر أرشفة الاختبار. أوقف رمزه النشط ثم أعد المحاولة.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>بنك الاختبارات</p><h2 className="text-2xl font-extrabold">الاختبارات</h2><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>استورد بنك HTML المنظم ثم أنشئ رمزاً لفتح اختبار محدد.</p></div><button type="button" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-4 py-2.5" onClick={() => setShowImport(true)}><Plus size={17} /> استيراد اختبار</button></header>
      {error && <p role="alert" className="mol-card p-4 font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p>}
      {notice && <p role="status" className="mol-card p-4 font-bold" style={{ color: 'var(--mol-green)' }}>{notice}</p>}
      <ExamAccessPanel exams={exams} onChanged={refresh} />
      <section className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-lg font-extrabold">مكتبة الاختبارات</h3><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" onClick={refresh} disabled={loading}><RefreshCw size={15} /> تحديث</button></div>
        {loading ? <div role="status" className="mol-card flex items-center gap-2 p-8 font-bold"><Loader2 size={18} className="animate-spin" /> جارٍ تحميل الاختبارات…</div> : exams.length === 0 ? <div className="mol-card p-10 text-center"><BookOpen size={30} className="mx-auto mb-3" style={{ color: 'var(--mol-muted)' }} /><h3 className="font-extrabold">لا توجد اختبارات مستوردة</h3><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>استورد ملف HTML يحتوي على questionBanksByGrade.</p></div> : <div className="space-y-3">{exams.map((exam) => <article key={exam.id} className="mol-card flex flex-wrap items-center justify-between gap-4 p-4 md:p-5"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: exam.status === 'available' ? 'var(--mol-green-soft)' : 'var(--mol-surface-2)', color: exam.status === 'available' ? 'var(--mol-green)' : 'var(--mol-muted)' }}><BookOpen size={19} /></span><div><h4 className="font-extrabold">{exam.title}</h4><p className="mt-1 break-all text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>{exam.source_filename} · {exam.bankSummary?.join(' · ') || 'بنوك غير محددة'}</p><span className="mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-extrabold" style={{ background: exam.status === 'available' ? 'var(--mol-green-soft)' : 'var(--mol-surface-2)', color: exam.status === 'available' ? 'var(--mol-green)' : 'var(--mol-muted)' }}>{exam.status === 'available' ? 'متاح' : 'مؤرشف'}</span></div></div>{exam.status === 'available' && <button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" disabled={savingId === exam.id} onClick={() => archive(exam)}>{savingId === exam.id ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />} أرشفة</button>}</article>)}</div>}
      </section>
      {showImport && <ExamImportDialog onClose={() => setShowImport(false)} onImported={async () => { setShowImport(false); setNotice('تم استيراد الاختبار وحفظه.'); await refresh(); }} />}
    </section>
  );
}
