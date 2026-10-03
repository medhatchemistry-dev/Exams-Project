import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Download, Eye, FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { STRUCTURE, GRADE_LABELS } from '@/lib/academicStructure';
import { completeExam } from '@/lib/examRepository';
import { exportResultsCsv } from '@/lib/excelExport';
import ResultDetailModal from './ResultDetailModal';

const PAGE_SIZE = 50;
const EXPORT_BATCH_SIZE = 1000;

function resultQuery(filters, withCount = false) {
  let query = supabase.from('exam_results').select('*', withCount ? { count: 'exact' } : undefined)
    .eq('exam_id', Number(filters.examId)).order('created_at', { ascending: false });
  if (filters.grade) query = query.eq('grade', filters.grade);
  if (filters.track) query = query.eq('track', filters.track);
  if (filters.section) query = query.eq('section', filters.section);
  if (filters.search.trim()) query = query.ilike('student_name', `%${filters.search.trim().replace(/[%_,]/g, '')}%`);
  return query;
}

function classLabel(exam) {
  if (!exam.target_grade) return 'عدة صفوف';
  return `الصف ${exam.target_grade} · ${exam.target_track || 'كل المسارات'}${exam.target_section ? ` · شعبة ${exam.target_section}` : ''}`;
}

export default function ResultsPanel() {
  const [exams, setExams] = useState([]);
  const [counts, setCounts] = useState({});
  const [examId, setExamId] = useState('');
  const [grade, setGrade] = useState('');
  const [track, setTrack] = useState('');
  const [section, setSection] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [resultCount, setResultCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const tracks = grade ? Object.keys(STRUCTURE[grade]) : [];
  const sections = grade && track ? STRUCTURE[grade][track] || [] : [];
  const selectedExam = useMemo(() => exams.find((exam) => String(exam.id) === String(examId)), [exams, examId]);

  const loadExams = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase.from('exams')
        .select('id, title, status, target_grade, target_track, target_section, completed_at, created_at')
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      const rows = data || [];
      setExams(rows);
      if (examId && !rows.some((exam) => String(exam.id) === String(examId))) setExamId('');
      const nextCounts = {};
      await Promise.all(rows.map(async (exam) => {
        const { count, error: countError } = await supabase.from('exam_results').select('id', { count: 'exact', head: true }).eq('exam_id', exam.id);
        if (!countError) nextCounts[exam.id] = count || 0;
      }));
      setCounts(nextCounts);
    } catch (loadError) {
      console.error('Exam grade list load failed:', loadError);
      setError('تعذر تحميل الاختبارات والدرجات. تحقق من اتصالك وصلاحية حساب المعلم.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadExams(); }, [loadExams]);

  const loadResults = useCallback(async () => {
    if (!examId) { setResults([]); setResultCount(0); return; }
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError, count } = await resultQuery({ grade, track, section, examId, search }, true)
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (queryError) throw queryError;
      setResults(data || []);
      setResultCount(count || 0);
    } catch (loadError) {
      console.error('Exam results load failed:', loadError);
      setError('تعذر تحميل إجابات الطلاب. أعد المحاولة أو تحقق من صلاحية حساب المعلم.');
    } finally { setLoading(false); }
  }, [examId, grade, track, section, search, page]);

  useEffect(() => { if (examId) loadResults(); }, [examId, loadResults]);

  const downloadGrades = async () => {
    if (!selectedExam) return;
    setExporting(true);
    setError('');
    try {
      const allResults = [];
      for (let offset = 0; ; offset += EXPORT_BATCH_SIZE) {
        const { data, error: queryError } = await resultQuery({ grade, track, section, examId, search })
          .range(offset, offset + EXPORT_BATCH_SIZE - 1);
        if (queryError) throw queryError;
        allResults.push(...(data || []));
        if (!data || data.length < EXPORT_BATCH_SIZE) break;
      }
      await exportResultsCsv(allResults);
    } catch (exportError) {
      console.error('Exam grades export failed:', exportError);
      setError('تعذر تنزيل درجات الاختبار. حاول مرة أخرى.');
    } finally { setExporting(false); }
  };

  const markComplete = async () => {
    if (!selectedExam || !window.confirm(`إنهاء «${selectedExam.title}»؟ سيُوقف الرمز النشط ويمنع محاولات جديدة، وستبقى الدرجات متاحة.`)) return;
    setCompleting(true);
    setError('');
    try {
      await completeExam(selectedExam.id);
      setNotice(`تم إنهاء «${selectedExam.title}». ستبقى الإجابات والدرجات متاحة للمراجعة.`);
      await loadExams();
    } catch (completeError) {
      console.error('Exam completion failed:', completeError);
      setError('تعذر إنهاء الاختبار. تحقق من تحديث قاعدة البيانات ثم حاول مرة أخرى.');
    } finally { setCompleting(false); }
  };

  const changeClass = (setter) => (event) => { setter(event.target.value); setPage(0); };
  const openExam = (id) => { setExamId(String(id)); setGrade(''); setTrack(''); setSection(''); setSearch(''); setPage(0); setNotice(''); };

  return (
    <div className="space-y-4">
      {notice && <p role="status" className="mol-card p-4 font-bold" style={{ color: 'var(--mol-green)' }}>{notice}</p>}
      {error && <p role="alert" className="mol-card p-4 font-bold" style={{ color: 'var(--mol-red)' }}>{error}<button type="button" className="mol-btn mol-btn-ghost ml-3 px-3 py-1" onClick={examId ? loadResults : loadExams}>إعادة المحاولة</button></p>}
      {loading && !examId ? <div role="status" className="mol-card flex items-center gap-2 p-8 font-bold"><Loader2 size={18} className="animate-spin" /> جارٍ تحميل سجل الاختبارات…</div> : !examId ? (
        <>
          <header className="mol-card flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="text-xl font-extrabold">درجات الاختبارات</h2><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>اختر اختباراً لمراجعة إجابات الطلاب أو تنزيل درجاته.</p></div><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" onClick={loadExams} disabled={loading}><FileSpreadsheet size={16} /> تحديث السجل</button></header>
          {!loading && exams.length === 0 ? <div className="mol-card p-8 text-center font-bold" style={{ color: 'var(--mol-muted)' }}>لا توجد اختبارات بعد. أنشئ اختباراً من صفحة الاختبارات لتظهر درجاته هنا.</div> : <div className="grid gap-3 lg:grid-cols-2">{exams.map((exam) => {
            const completed = Boolean(exam.completed_at);
            return <button type="button" key={exam.id} onClick={() => openExam(exam.id)} className="mol-card flex w-full items-center justify-between gap-4 p-4 text-right transition hover:-translate-y-0.5" style={{ borderColor: completed ? 'var(--mol-cobalt)' : undefined }}>
              <span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="truncate">{exam.title}</strong><span className="rounded-full px-2 py-1 text-xs font-extrabold" style={{ color: completed ? 'var(--mol-cobalt)' : 'var(--mol-green)', background: completed ? 'var(--mol-cobalt-soft)' : 'var(--mol-green-soft)' }}>{completed ? 'مكتمل' : 'جارٍ'}</span></span><span className="mt-1 block text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{classLabel(exam)} · {new Date(exam.created_at).toLocaleDateString('ar')}</span><span className="mt-2 block text-sm font-extrabold">{counts[exam.id] ?? '—'} طالباً أرسل إجابته</span></span><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--mol-cobalt-soft)', color: 'var(--mol-cobalt)' }}><ArrowRight size={18} /></span>
            </button>;
          })}</div>}
        </>
      ) : (
        <>
          <header className="mol-card flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-start gap-3"><button type="button" aria-label="العودة إلى سجل الاختبارات" className="mol-btn mol-btn-ghost mt-1 grid h-9 w-9 place-items-center p-0" onClick={() => { setExamId(''); setError(''); }}><ArrowRight size={17} /></button><div><p className="text-sm font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>نتائج الاختبار</p><h2 className="text-xl font-extrabold">{selectedExam?.title}</h2><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{classLabel(selectedExam || {})} · {resultCount} إجابة</p></div></div>
            <div className="flex flex-wrap gap-2">{!selectedExam?.completed_at && <button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2" disabled={completing} onClick={markComplete}>{completing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} إنهاء الاختبار</button>}<button type="button" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-4 py-2.5" onClick={downloadGrades} disabled={resultCount === 0 || exporting}><Download size={17} />{exporting ? 'جارٍ تجهيز الملف…' : 'تنزيل درجات الاختبار'}</button></div>
          </header>
          <div className="mol-card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="mol-label">الصف<select className="mol-input mt-1" value={grade} onChange={(event) => { setGrade(event.target.value); setTrack(''); setSection(''); setPage(0); }}><option value="">كل الصفوف</option>{Object.keys(STRUCTURE).map((value) => <option key={value} value={value}>{GRADE_LABELS[value]} ({value})</option>)}</select></label>
            <label className="mol-label">المسار<select className="mol-input mt-1" value={track} onChange={(event) => { setTrack(event.target.value); setSection(''); setPage(0); }} disabled={!grade}><option value="">كل المسارات</option>{tracks.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="mol-label">الشعبة<select className="mol-input mt-1" value={section} onChange={changeClass(setSection)} disabled={!track}><option value="">كل الشعب</option>{sections.map((value) => <option key={value} value={value}>شعبة {value}</option>)}</select></label>
            <label className="mol-label relative">بحث باسم الطالب<Search className="absolute right-3 top-9" size={16} style={{ color: 'var(--mol-muted)' }} /><input className="mol-input mt-1 pr-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="اسم الطالب" /></label>
          </div>
          <div className="mol-card flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-extrabold">إجابات الطلاب ودرجاتهم</p><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>افتح إجابة أي طالب لمراجعة التصحيح التفصيلي.</p></div><strong>{resultCount} نتيجة</strong></div>
          {loading ? <div role="status" className="flex items-center gap-2 p-6 font-bold" style={{ color: 'var(--mol-muted)' }}><Loader2 className="animate-spin" size={18} /> جاري تحميل الإجابات…</div> : results.length === 0 ? <div className="mol-card p-8 text-center font-bold" style={{ color: 'var(--mol-muted)' }}>لا توجد إجابات مطابقة لهذا الاختبار.</div> : <div className="space-y-2">{results.map((result) => <article key={result.id} className="mol-card flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><div className="font-extrabold">{result.student_name} {result.is_other && <span className="text-xs" style={{ color: 'var(--mol-amber)' }}>(إدخال يدوي)</span>}</div><p className="mt-1 text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>الصف {result.grade} ({result.track}) · شعبة {result.section} · رقم: {result.student_number || '—'} · {result.submission_time}</p></div><div className="flex items-center gap-3"><div className="font-extrabold" style={{ color: result.percentage >= 50 ? 'var(--mol-green)' : 'var(--mol-red)' }}>{result.score} / {result.total} ({(result.percentage ?? 0).toFixed(1)}%)</div><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-1.5 px-3 py-2" onClick={() => setSelected(result)}><Eye size={16} /> الإجابات والتصحيح</button></div></article>)}<div className="flex items-center justify-between gap-3"><button type="button" className="mol-btn mol-btn-ghost px-4 py-2" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>السابق</button><span className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>صفحة {page + 1} من {Math.max(1, Math.ceil(resultCount / PAGE_SIZE))}</span><button type="button" className="mol-btn mol-btn-ghost px-4 py-2" disabled={(page + 1) * PAGE_SIZE >= resultCount} onClick={() => setPage((value) => value + 1)}>التالي</button></div></div>}
        </>
      )}
      {selected && <ResultDetailModal result={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
