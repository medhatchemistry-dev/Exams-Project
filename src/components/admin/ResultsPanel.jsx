import React, { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Loader2, Eye, Download } from 'lucide-react';
import { STRUCTURE, GRADE_LABELS } from '@/lib/academicStructure';
import { exportResultsCsv } from '@/lib/excelExport';
import ResultDetailModal from './ResultDetailModal';

export default function ResultsPanel() {
  const [grade, setGrade] = useState('');
  const [track, setTrack] = useState('');
  const [section, setSection] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [loadError, setLoadError] = useState('');

  const tracks = grade ? Object.keys(STRUCTURE[grade]) : [];
  const sections = grade && track ? STRUCTURE[grade][track] || [] : [];

  const loadResults = async () => {
    setLoading(true);
    setLoadError('');
    try {
      let request = supabase.from('exam_results').select('*').order('created_at', { ascending: false }).limit(200);
      if (grade) request = request.eq('grade', grade);
      if (track) request = request.eq('track', track);
      if (section) request = request.eq('section', section);
      const { data, error } = await request;
      if (error) throw error;
      setResults(data || []);
    } catch (error) {
      console.error('Exam results load failed:', error);
      setLoadError('تعذر تحميل النتائج. تحقق من اتصالك وصلاحية حساب المعلم.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, [grade, track, section]);

  return (
    <div>
      <div className="mol-card p-4 md:p-5 mb-5 grid md:grid-cols-3 gap-4">
        <select className="mol-input" value={grade} onChange={(e) => { setGrade(e.target.value); setTrack(''); setSection(''); }}>
          <option value="">كل الصفوف</option>
          {Object.keys(STRUCTURE).map((g) => <option key={g} value={g}>{GRADE_LABELS[g]} ({g})</option>)}
        </select>
        <select className="mol-input" value={track} onChange={(e) => { setTrack(e.target.value); setSection(''); }} disabled={!grade}>
          <option value="">كل المسارات</option>
          {tracks.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="mol-input" value={section} onChange={(e) => setSection(e.target.value)} disabled={!track}>
          <option value="">كل الشعب</option>
          {sections.map((s) => <option key={s} value={s}>شعبة {s}</option>)}
        </select>
        <button
          className="mol-btn mol-btn-ghost md:col-span-3 inline-flex items-center justify-center gap-2 py-2.5"
          onClick={() => exportResultsCsv(results)}
          disabled={results.length === 0}
        >
          <Download size={16} /> تصدير Excel — الدرجات مع الامتحانات
        </button>
      </div>

      {loadError ? (
        <div className="mol-card p-6 text-center font-bold" style={{ color: 'var(--mol-red)' }}>
          {loadError}
          <button type="button" className="mol-btn mol-btn-ghost ml-3 px-3 py-1" onClick={loadResults}>إعادة المحاولة</button>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 font-bold p-6" style={{ color: 'var(--mol-muted)' }}>
          <Loader2 className="animate-spin" size={18} /> جاري التحميل…
        </div>
      ) : results.length === 0 ? (
        <div className="mol-card p-8 text-center font-bold" style={{ color: 'var(--mol-muted)' }}>لا توجد نتائج مطابقة</div>
      ) : (
        <div className="space-y-2.5">
          {results.map((r) => (
            <div key={r.id} className="mol-card p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-extrabold">
                  {r.student_name} {r.is_other && <span className="text-xs" style={{ color: 'var(--mol-amber)' }}>(Other)</span>}
                </div>
                <div className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>
                  الصف {r.grade} ({r.track}) • شعبة {r.section} • رقم: {r.student_number || '—'} • {r.submission_time}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="font-extrabold" style={{ color: r.percentage >= 50 ? 'var(--mol-green)' : 'var(--mol-red)' }}>
                  {r.score} / {r.total} ({(r.percentage ?? 0).toFixed(1)}%)
                </div>
                <button className="mol-btn mol-btn-ghost px-4 py-2 inline-flex items-center gap-1.5" onClick={() => setSelected(r)}>
                  <Eye size={16} /> التصحيح
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && <ResultDetailModal result={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
