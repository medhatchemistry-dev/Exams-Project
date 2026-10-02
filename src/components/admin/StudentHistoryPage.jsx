import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import ResultDetailModal from './ResultDetailModal';

export default function StudentHistoryPage() {
  const { studentId } = useParams();
  const [student, setStudent] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      const { data: studentData, error: studentError } = await supabase.from('students')
        .select('id, student_number, full_name, full_name_ar, full_name_en, grade, track, section')
        .eq('id', studentId)
        .maybeSingle();
      if (!active) return;
      if (studentError || !studentData) {
        setError('تعذر العثور على سجل هذا الطالب. ارجع إلى قائمة الطلاب وحاول مرة أخرى.');
        setLoading(false);
        return;
      }
      setStudent(studentData);
      const { data: resultData, error: resultError } = await supabase.from('exam_results')
        .select('id, student_name, student_number, grade, track, section, score, total, percentage, submission_time, exam_title_snapshot, exam_id, questions_json, answers_json, created_at, is_perfect')
        .eq('student_number', studentData.student_number)
        .order('created_at', { ascending: false })
        .limit(500);
      if (!active) return;
      if (resultError) setError('تعذر تحميل نتائج الطالب. حاول مرة أخرى.');
      else setResults(resultData || []);
      setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [studentId]);

  if (loading) return <div role="status" className="mol-card flex items-center gap-2 p-8 font-bold" style={{ color: 'var(--mol-muted)' }}><Loader2 size={18} className="animate-spin" /> جارٍ تحميل ملف الطالب…</div>;

  return (
    <section className="space-y-5">
      <Link to="/admin/students" className="mol-btn mol-btn-ghost inline-flex items-center gap-2 px-3 py-2"><ArrowRight size={16} /> العودة إلى الطلاب</Link>
      {error && <div role="alert" className="mol-card p-4 font-bold" style={{ color: 'var(--mol-red)' }}>{error}</div>}
      {student && <>
        <header className="mol-card p-5 md:p-6">
          <p className="text-xs font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>ملف الطالب · {student.student_number}</p>
          <h2 className="mt-1 text-2xl font-extrabold">{student.full_name_ar || student.full_name}</h2>
          {student.full_name_en && <p className="mt-1 font-bold" dir="ltr">{student.full_name_en}</p>}
          <p className="mt-2 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>الصف {student.grade} · {student.track} · شعبة {student.section}</p>
        </header>
        <div className="flex items-center justify-between"><h3 className="text-lg font-extrabold">الاختبارات والنتائج</h3><span className="rounded-full px-3 py-1 text-xs font-extrabold" style={{ background: 'var(--mol-cobalt-soft)', color: 'var(--mol-cobalt)' }}>{results.length} محاولة</span></div>
        {results.length === 0 ? <div className="mol-card p-8 text-center font-bold" style={{ color: 'var(--mol-muted)' }}>لم يسجل هذا الطالب أي محاولة اختبار بعد.</div> : <div className="space-y-2">
          {results.map((result) => <article key={result.id} className="mol-card flex flex-wrap items-center justify-between gap-3 p-4"><div><h4 className="font-extrabold">{result.exam_title_snapshot || 'الاختبار العام'}</h4><p className="mt-1 text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>{result.submission_time || new Date(result.created_at).toLocaleString('ar')}</p></div><div className="flex items-center gap-3"><span className="font-extrabold" style={{ color: result.is_perfect ? 'var(--mol-green)' : 'var(--mol-cobalt)' }}>{result.score} / {result.total} · {(result.percentage ?? 0).toFixed(1)}%</span><button type="button" className="mol-btn mol-btn-ghost px-3 py-2 font-extrabold" onClick={() => setSelectedResult(result)}>الإجابات والتصحيح</button></div></article>)}
        </div>}
      </>}
      {selectedResult && <ResultDetailModal result={selectedResult} onClose={() => setSelectedResult(null)} />}
    </section>
  );
}
