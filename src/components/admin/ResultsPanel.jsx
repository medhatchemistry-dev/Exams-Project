import React, { useCallback, useEffect, useState } from 'react';
import { Eye, FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { STRUCTURE, GRADE_LABELS } from '@/lib/academicStructure';
import { exportResultsCsv } from '@/lib/excelExport';
import ResultDetailModal from './ResultDetailModal';

const PAGE_SIZE = 50;
const EXPORT_BATCH_SIZE = 1000;

function applyFilters(query, { grade, track, section, examId, search }) {
  if (grade) query = query.eq('grade', grade);
  if (track) query = query.eq('track', track);
  if (section) query = query.eq('section', section);
  if (examId) query = query.eq('exam_id', Number(examId));
  if (search.trim()) query = query.ilike('student_name', `%${search.trim().replace(/[%_,]/g, '')}%`);
  return query;
}

export default function ResultsPanel() {
  const [grade, setGrade] = useState('');
  const [track, setTrack] = useState('');
  const [section, setSection] = useState('');
  const [examId, setExamId] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [resultCount, setResultCount] = useState(0);
  const [exams, setExams] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [exportError, setExportError] = useState('');

  const tracks = grade ? Object.keys(STRUCTURE[grade]) : [];
  const sections = grade && track ? STRUCTURE[grade][track] || [] : [];

  const loadResults = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const query = applyFilters(supabase.from('exam_results').select('*', { count: 'exact' }).order('created_at', { ascending: false }), { grade, track, section, examId, search });
      const { data, error, count } = await query.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      setResults(data || []);
      setResultCount(count || 0);
    } catch (error) {
      console.error('Exam results load failed:', error);
      setLoadError('تعذر تحميل النتائج. تحقق من اتصالك وصلاحية حساب المعلم.');
    } finally {
      setLoading(false);
    }
  }, [grade, track, section, examId, search, page]);

  useEffect(() => { loadResults(); }, [loadResults]);
  useEffect(() => {
    supabase.from('exams').select('id, title').order('created_at', { ascending: false })
      .then(({ data }) => setExams(data || []));
  }, []);

  const downloadClass = async () => {
    setExporting(true);
    setExportError('');
    try {
      const allResults = [];
      for (let offset = 0; ; offset += EXPORT_BATCH_SIZE) {
        const query = applyFilters(supabase.from('exam_results').select('*').order('created_at', { ascending: false }), { grade, track, section, examId, search });
        const { data, error } = await query.range(offset, offset + EXPORT_BATCH_SIZE - 1);
        if (error) throw error;
        allResults.push(...(data || []));
        if (!data || data.length < EXPORT_BATCH_SIZE) break;
      }
      await exportResultsCsv(allResults);
    } catch (error) {
      console.error('Class results export failed:', error);
      setExportError('تعذر تنزيل ملف الدرجات. حاول مرة أخرى.');
    } finally {
      setExporting(false);
    }
  };

  const setClassFilter = (setter) => (event) => { setter(event.target.value); setPage(0); };
  const fullClassSelected = Boolean(grade && track && section);

  return (
    <div className="space-y-4">
      <div className="mol-card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="mol-label">الصف<select className="mol-input mt-1" value={grade} onChange={(event) => { setGrade(event.target.value); setTrack(''); setSection(''); setPage(0); }}><option value="">كل الصفوف</option>{Object.keys(STRUCTURE).map((value) => <option key={value} value={value}>{GRADE_LABELS[value]} ({value})</option>)}</select></label>
        <label className="mol-label">المسار<select className="mol-input mt-1" value={track} onChange={(event) => { setTrack(event.target.value); setSection(''); setPage(0); }} disabled={!grade}><option value="">كل المسارات</option>{tracks.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="mol-label">الشعبة<select className="mol-input mt-1" value={section} onChange={setClassFilter(setSection)} disabled={!track}><option value="">كل الشعب</option>{sections.map((value) => <option key={value} value={value}>شعبة {value}</option>)}</select></label>
        <label className="mol-label">الاختبار<select className="mol-input mt-1" value={examId} onChange={setClassFilter(setExamId)}><option value="">كل الاختبارات</option>{exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}</select></label>
        <label className="mol-label relative">بحث بالاسم<span className="sr-only">اسم الطالب</span><Search className="absolute right-3 top-9" size={16} style={{ color: 'var(--mol-muted)' }} /><input className="mol-input mt-1 pr-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="اسم الطالب" /></label>
      </div>

      <div className="mol-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="font-extrabold">{fullClassSelected ? `${GRADE_LABELS[grade]} · ${track} · شعبة ${section}` : 'نتائج جميع الصفوف'}</p><p className="mt-1 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{resultCount} نتيجة مطابقة · اختر إجابة الطالب لعرض التصحيح الكامل.</p></div>
        <button type="button" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-4 py-2.5" onClick={downloadClass} disabled={!fullClassSelected || resultCount === 0 || exporting}><FileSpreadsheet size={17} />{exporting ? 'جارٍ تجهيز الملف…' : 'تنزيل درجات الشعبة كاملة'}</button>
      </div>
      {!fullClassSelected && <p className="px-1 text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>لتنزيل درجات فصل محدد، اختر الصف والمسار والشعبة.</p>}
      {exportError && <p role="alert" className="mol-card p-3 font-bold" style={{ color: 'var(--mol-red)' }}>{exportError}</p>}

      {loadError ? <div className="mol-card p-6 text-center font-bold" style={{ color: 'var(--mol-red)' }}>{loadError}<button type="button" className="mol-btn mol-btn-ghost ml-3 px-3 py-1" onClick={loadResults}>إعادة المحاولة</button></div> : loading ? <div role="status" className="flex items-center gap-2 p-6 font-bold" style={{ color: 'var(--mol-muted)' }}><Loader2 className="animate-spin" size={18} /> جاري تحميل النتائج…</div> : results.length === 0 ? <div className="mol-card p-8 text-center font-bold" style={{ color: 'var(--mol-muted)' }}>لا توجد نتائج مطابقة</div> : (
        <div className="space-y-2">
          {results.map((result) => (
            <article key={result.id} className="mol-card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0"><div className="font-extrabold">{result.student_name} {result.is_other && <span className="text-xs" style={{ color: 'var(--mol-amber)' }}>(إدخال يدوي)</span>}</div><p className="mt-1 text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>{result.exam_title_snapshot || 'الاختبار العام'} · الصف {result.grade} ({result.track}) · شعبة {result.section} · رقم: {result.student_number || '—'} · {result.submission_time}</p></div>
              <div className="flex items-center gap-3"><div className="font-extrabold" style={{ color: result.percentage >= 50 ? 'var(--mol-green)' : 'var(--mol-red)' }}>{result.score} / {result.total} ({(result.percentage ?? 0).toFixed(1)}%)</div><button type="button" className="mol-btn mol-btn-ghost inline-flex items-center gap-1.5 px-3 py-2" onClick={() => setSelected(result)}><Eye size={16} /> الإجابات والتصحيح</button></div>
            </article>
          ))}
          <div className="flex items-center justify-between gap-3"><button type="button" className="mol-btn mol-btn-ghost px-4 py-2" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>السابق</button><span className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>صفحة {page + 1} من {Math.max(1, Math.ceil(resultCount / PAGE_SIZE))}</span><button type="button" className="mol-btn mol-btn-ghost px-4 py-2" disabled={(page + 1) * PAGE_SIZE >= resultCount} onClick={() => setPage((value) => value + 1)}>التالي</button></div>
        </div>
      )}

      {selected && <ResultDetailModal result={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
