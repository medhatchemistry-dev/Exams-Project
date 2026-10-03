import React, { useCallback, useEffect, useState } from 'react';
import { Archive, BookOpen, CheckCircle2, Clock3, Loader2, Plus, RefreshCw } from 'lucide-react';
import { archiveExam, completeExam, listExams } from '@/lib/examRepository';
import ExamAccessPanel from './ExamAccessPanel';
import ExamImportDialog from './ExamImportDialog';

function classLabel(exam) {
  if (!exam.target_grade) return 'عدة صفوف';
  return `الصف ${exam.target_grade} · ${exam.target_track} · شعبة ${exam.target_section}`;
}

export default function ExamsPage() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [pendingActivationId, setPendingActivationId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setExams(await listExams()); } catch (loadError) {
      console.error('Exam list load failed:', loadError);
      setError('تعذر تحميل سجل الاختبارات. أعد المحاولة أو تحقق من صلاحية حساب المعلم.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const finish = async (exam) => {
    if (!window.confirm(`إنهاء «${exam.title}» سيوقف رمز الطلاب النشط ويمنع محاولات جديدة. ستبقى الإجابات والدرجات متاحة. هل تريد المتابعة؟`)) return;
    setSavingId(exam.id);
    setError('');
    try {
      await completeExam(exam.id);
      setNotice({ text: `تم إنهاء ${exam.title}. النتائج محفوظة وجاهزة للمراجعة.`, code: '' });
      await refresh();
    } catch (finishError) {
      console.error('Exam completion failed:', finishError);
      setError('تعذر إنهاء الاختبار. تحقق من تحديث قاعدة البيانات ثم حاول مرة أخرى.');
    } finally { setSavingId(null); }
  };

  const archive = async (exam) => {
    if (!window.confirm(`أرشفة «${exam.title}»؟ ستبقى نتائجه محفوظة، ولن يمكن إصدار رمز جديد له.`)) return;
    setSavingId(exam.id);
    setError('');
    try {
      await archiveExam(exam.id);
      setNotice({ text: `تمت أرشفة ${exam.title}.`, code: '' });
      await refresh();
    } catch (archiveError) {
      console.error('Exam archive failed:', archiveError);
      setError('أوقف رمز الاختبار النشط أو أنهِ الاختبار أولاً ثم أعد المحاولة.');
    } finally { setSavingId(null); }
  };

  const activeCount = exams.filter((exam) => exam.status === 'available' && !exam.completed_at).length;
  const completedCount = exams.filter((exam) => exam.completed_at).length;

  return (
    <section className="space-y-5">
      <header className="mol-card flex flex-wrap items-center justify-between gap-4 overflow-hidden p-5 sm:p-7">
        <div><p className="text-sm font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>سجل الاختبارات</p><h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">اختباراتك في مكان واحد</h2><p className="mt-2 max-w-xl text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>أنشئ الاختبار، حدّد صفه وموعده، ثم شارك الرمز مع الطلاب.</p></div>
        <button type="button" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-5 py-3" onClick={() => setShowImport(true)}><Plus size={18} /> إنشاء اختبار</button>
      </header>

      {notice && <div role="status" className="mol-card flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-2 font-bold" style={{ color: 'var(--mol-green)' }}><CheckCircle2 size={18} />{notice.text}</div>{notice.code && <div className="flex items-center gap-2"><span className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>رمز الطلاب</span><code dir="ltr" className="rounded-lg px-3 py-1.5 font-mono font-extrabold" style={{ background: 'var(--mol-green-soft)', color: 'var(--mol-green)' }}>{notice.code}</code></div>}</div>}
      {error && <p role="alert" className="mol-card p-4 font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-extrabold">سجلّك</h3><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{activeCount} متاح · {completedCount} مكتمل · {exams.length} إجمالاً</p></div><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" onClick={refresh} disabled={loading}><RefreshCw size={15} /> تحديث</button></div>
        {loading ? <div role="status" className="mol-card flex items-center gap-2 p-8 font-bold"><Loader2 size={18} className="animate-spin" /> جارٍ تحميل سجل الاختبارات…</div> : exams.length === 0 ? <div className="mol-card p-10 text-center"><BookOpen size={30} className="mx-auto mb-3" style={{ color: 'var(--mol-muted)' }} /><h3 className="font-extrabold">ابدأ بأول اختبار</h3><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>ارفع بنك أسئلة HTML أو PDF أو الصق رابط صفحة الاختبار.</p><button type="button" className="mol-btn mol-btn-primary mt-5 inline-flex items-center gap-2 px-4 py-2.5" onClick={() => setShowImport(true)}><Plus size={17} /> إنشاء اختبار</button></div> : <div className="grid gap-3 lg:grid-cols-2">{exams.map((exam) => {
          const complete = Boolean(exam.completed_at);
          const archived = exam.status === 'archived';
          const state = complete ? 'مكتمل' : archived ? 'مؤرشف' : 'جاهز للتفعيل';
          const iconColor = complete ? 'var(--mol-cobalt)' : archived ? 'var(--mol-muted)' : 'var(--mol-green)';
          const bgColor = complete ? 'var(--mol-cobalt-soft)' : archived ? 'var(--mol-surface-2)' : 'var(--mol-green-soft)';
          return <article key={exam.id} className="mol-card flex min-w-0 flex-col justify-between gap-4 p-4 sm:p-5">
            <div className="flex min-w-0 items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: bgColor, color: iconColor }}><BookOpen size={20} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-extrabold">{exam.title}</h4><span className="rounded-full px-2.5 py-1 text-xs font-extrabold" style={{ background: bgColor, color: iconColor }}>{state}</span></div><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{classLabel(exam)} · {Object.values(exam.banks || {}).reduce((sum, questions) => sum + (Array.isArray(questions) ? questions.length : 0), 0)} سؤال</p><p className="mt-1 truncate text-xs font-bold" title={exam.source_filename} style={{ color: 'var(--mol-muted)' }}>{exam.source_filename} · {new Date(exam.created_at).toLocaleDateString('ar')}</p>{exam.completed_at && <p className="mt-2 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--mol-cobalt)' }}><Clock3 size={13} /> انتهى {new Date(exam.completed_at).toLocaleString('ar')}</p>}</div></div>
            {!archived && <div className="flex flex-wrap justify-end gap-2 border-t pt-3" style={{ borderColor: 'var(--mol-line-strong)' }}>{!complete && <button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm" disabled={savingId === exam.id} onClick={() => finish(exam)}>{savingId === exam.id ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} إنهاء الاختبار</button>}<button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm" disabled={savingId === exam.id} onClick={() => archive(exam)}><Archive size={15} /> أرشفة</button></div>}
          </article>;
        })}</div>}
      </section>

      <details className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: 'var(--mol-line-strong)', background: 'var(--mol-surface)' }}><summary className="cursor-pointer list-none font-extrabold">رمز الدخول النشط وإدارة التفعيل</summary><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>يمكنك نسخ الرمز أو إيقافه. لا يمكن تفعيل أكثر من اختبار في الوقت نفسه.</p><div className="mt-4"><ExamAccessPanel exams={exams} onChanged={refresh} selectedExamId={pendingActivationId} /></div></details>

      {showImport && <ExamImportDialog onClose={() => setShowImport(false)} onImported={async (savedExam) => { setShowImport(false); setPendingActivationId(String(savedExam.id)); setNotice({ text: `تم إنشاء وتفعيل ${savedExam.title}.`, code: savedExam.accessCode }); await refresh(); }} />}
    </section>
  );
}
