import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Clock3, Loader2, RefreshCw, Users, CheckCircle2 } from 'lucide-react';
import { getExamDetail } from '@/lib/examRepository';

export default function ExamDetailPage() {
  const { examId } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setDetail(await getExamDetail(examId)); }
    catch (loadError) {
      console.error('Exam detail load failed:', loadError);
      setError('تعذر تحميل تفاصيل الاختبار. تحقق من صلاحية حساب المعلم أو أن الاختبار موجود.');
    } finally { setLoading(false); }
  }, [examId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading && !detail) return <div role="status" className="mol-card flex items-center gap-2 p-8 font-bold"><Loader2 size={18} className="animate-spin" /> جارٍ تحميل بيانات الاختبار…</div>;
  if (error && !detail) return <section className="space-y-4"><Link className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" to="/admin/exams"><ArrowRight size={16} /> الاختبارات</Link><p role="alert" className="mol-card p-4 font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p></section>;
  if (!detail) return null;

  const { exam, accessCode, results, attempts, events } = detail;
  const completed = results.length;
  const average = completed ? Math.round(results.reduce((sum, row) => sum + Number(row.percentage || 0), 0) / completed) : 0;
  const questionCount = Object.values(exam.banks || {}).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);

  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" to="/admin/exams"><ArrowRight size={16} /> الاختبارات</Link><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" onClick={refresh} disabled={loading}><RefreshCw size={15} /> تحديث</button></div>
    {error && <p role="alert" className="mol-card p-4 font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p>}
    <header className="mol-card p-5 sm:p-7"><p className="text-sm font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>تفاصيل الاختبار</p><h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">{exam.title}</h2><p className="mt-2 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{exam.target_grade ? `الصف ${exam.target_grade} · ${exam.target_track} · شعبة ${exam.target_section}` : 'عدة صفوف'} · {questionCount} سؤال · أُنشئ {new Date(exam.created_at).toLocaleString('ar')}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-bold"><span>الحالة: {exam.completed_at ? 'مكتمل' : exam.status === 'archived' ? 'مؤرشف' : exam.status === 'paused' ? 'متوقف مؤقتاً' : 'متاح'}</span>{accessCode?.code && <span>رمز الاختبار: <code dir="ltr" className="font-mono text-lg">{accessCode.code}</code>{accessCode.expires_at && ` · ينتهي ${new Date(accessCode.expires_at).toLocaleString('ar')}`}</span>}</div>
    </header>
    <div className="grid gap-3 sm:grid-cols-3"><article className="mol-card p-5"><p className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>الطلاب الذين أكملوا</p><p className="mt-2 flex items-center gap-2 text-3xl font-extrabold"><CheckCircle2 size={24} style={{ color: 'var(--mol-green)' }} />{completed}</p></article><article className="mol-card p-5"><p className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>متوسط الدرجات</p><p className="mt-2 text-3xl font-extrabold">{completed ? `${average}%` : '—'}</p></article><article className="mol-card p-5"><p className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>محاولات الانضمام</p><p className="mt-2 flex items-center gap-2 text-3xl font-extrabold"><Users size={24} style={{ color: 'var(--mol-cobalt)' }} />{attempts.length}</p></article></div>
    <section className="mol-card overflow-hidden"><div className="border-b p-4" style={{ borderColor: 'var(--mol-line-strong)' }}><h3 className="font-extrabold">الدرجات المسجلة</h3></div>{results.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-right text-sm"><thead style={{ background: 'var(--mol-surface-2)' }}><tr>{['الطالب', 'الرقم', 'الصف', 'الدرجة', 'النسبة', 'وقت الإكمال'].map((label) => <th key={label} className="px-4 py-3 font-extrabold">{label}</th>)}</tr></thead><tbody>{results.map((row) => <tr key={row.id} className="border-t" style={{ borderColor: 'var(--mol-line-strong)' }}><td className="px-4 py-3 font-bold">{row.student_name}</td><td className="px-4 py-3">{row.student_number || '—'}</td><td className="px-4 py-3">{row.grade} · {row.track} · {row.section}</td><td className="px-4 py-3 font-extrabold">{row.score}/{row.total}</td><td className="px-4 py-3">{row.percentage}%</td><td className="px-4 py-3"><span className="inline-flex items-center gap-1"><Clock3 size={14} />{new Date(row.created_at).toLocaleString('ar')}</span></td></tr>)}</tbody></table></div> : <p className="p-6 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>لا توجد نتائج مكتملة بعد.</p>}</section>
    <section className="mol-card overflow-hidden"><div className="border-b p-4" style={{ borderColor: 'var(--mol-line-strong)' }}><h3 className="font-extrabold">سجل المحاولات</h3></div>{attempts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-right text-sm"><thead style={{ background: 'var(--mol-surface-2)' }}><tr>{['الطالب', 'الرقم', 'بدأ', 'التحذيرات', 'الحالة'].map((label) => <th key={label} className="px-4 py-3 font-extrabold">{label}</th>)}</tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.id} className="border-t" style={{ borderColor: 'var(--mol-line-strong)' }}><td className="px-4 py-3 font-bold">{attempt.student_name}</td><td className="px-4 py-3">{attempt.student_number}</td><td className="px-4 py-3">{new Date(attempt.started_at).toLocaleString('ar')}</td><td className="px-4 py-3">{attempt.warning_count}</td><td className="px-4 py-3">{attempt.completed_at ? 'مكتمل' : attempt.locked_at ? 'مقفل بانتظار المعلم' : 'جارٍ'}</td></tr>)}</tbody></table></div> : <p className="p-6 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>لا توجد محاولات محفوظة.</p>}</section>
    <section className="mol-card overflow-hidden"><div className="border-b p-4" style={{ borderColor: 'var(--mol-line-strong)' }}><h3 className="font-extrabold">سجل النشاط المرصود</h3><p className="mt-1 text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>تعرض الأحداث التي سجلها الخادم من إشارات المتصفح المتاحة فقط. لا يمكن استعادة الأحداث التي سبقت بدء التسجيل، وهذه الإشارات لا تثبت وحدها نية الطالب.</p></div>{events.length ? <ol className="divide-y" style={{ borderColor: 'var(--mol-line-strong)' }}>{events.map((event) => <li key={event.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm"><span className="font-bold">{event.event_type}{event.details?.signal ? ` · ${event.details.signal}` : ''}{event.details?.warning_count ? ` · التحذير ${event.details.warning_count}` : ''}</span><time className="text-xs" style={{ color: 'var(--mol-muted)' }}>{new Date(event.created_at).toLocaleString('ar')}</time></li>)}</ol> : <p className="p-6 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>لا توجد أحداث مسجلة منذ بدء التتبع؛ الأحداث الأقدم غير متاحة.</p>}</section>
  </section>;
}
