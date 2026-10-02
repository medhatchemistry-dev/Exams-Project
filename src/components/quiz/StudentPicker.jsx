import React, { useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Loader2 } from 'lucide-react';
import { STRUCTURE, GRADE_LABELS } from '@/lib/academicStructure';
import OtherStudentForm from './OtherStudentForm';

export default function StudentPicker({ onStart }) {
  const [grade, setGrade] = useState('');
  const [track, setTrack] = useState('');
  const [section, setSection] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [showOther, setShowOther] = useState(false);

  const tracks = grade ? Object.keys(STRUCTURE[grade]) : [];
  const sections = grade && track ? STRUCTURE[grade][track] || [] : [];
  const ready = grade && track && section;

  useEffect(() => { setTrack(''); setSection(''); setStudents([]); setSelectedId(''); setShowOther(false); }, [grade]);
  useEffect(() => { setSection(''); setStudents([]); setSelectedId(''); setShowOther(false); }, [track]);

  useEffect(() => {
    if (!ready) { setStudents([]); return; }
    setLoading(true);
    setLoadError('');
    setSelectedId('');
    setShowOther(false);
    let active = true;
    const loadStudents = async () => {
      try {
        const { data, error } = await supabase
          .from('students')
          .select('id, full_name, full_name_ar, full_name_en, student_number, grade, track, section')
          .eq('grade', grade)
          .eq('track', track)
          .eq('section', section)
          .order('full_name')
          .limit(500);
        if (error) throw error;
        if (active) setStudents(data || []);
      } catch (error) {
        if (!active) return;
        console.error('Student roster load failed:', error);
        setLoadError('تعذر تحميل قائمة الطلاب. يمكنك إدخال بياناتك يدوياً.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { active = false; };
  }, [grade, track, section]);

  const selected = students.find((s) => s.student_number === selectedId);

  const confirmSelected = () => {
    if (!selected) return;
    onStart({ name: selected.full_name_ar || selected.full_name, nameEnglish: selected.full_name_en || '', id: selected.student_number, grade, track, section, isOther: false });
  };

  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-3 gap-5">
        <div>
          <label className="mol-label">الصف الدراسي</label>
          <select className="mol-input" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">اختر الصف</option>
            {Object.keys(STRUCTURE).map((g) => <option key={g} value={g}>{GRADE_LABELS[g]} ({g})</option>)}
          </select>
        </div>
        <div>
          <label className="mol-label">المسار</label>
          <select className="mol-input" value={track} onChange={(e) => setTrack(e.target.value)} disabled={!grade}>
            <option value="">اختر المسار</option>
            {tracks.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="mol-label">الشعبة</label>
          <select className="mol-input" value={section} onChange={(e) => setSection(e.target.value)} disabled={!track}>
            <option value="">اختر الشعبة</option>
            {sections.map((s) => <option key={s} value={s}>شعبة {s}</option>)}
          </select>
        </div>
      </div>

      {ready && !showOther && (
        <div>
          <label className="mol-label">اختر اسمك من القائمة</label>
          {loading ? (
            <div className="flex items-center gap-2 font-bold py-2" style={{ color: 'var(--mol-muted)' }}>
              <Loader2 className="animate-spin" size={18} /> جاري التحميل…
            </div>
          ) : loadError ? (
            <div className="font-bold py-2" style={{ color: 'var(--mol-red)' }}>{loadError}</div>
          ) : (
            <select className="mol-input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">— اختر اسمك — ({students.length} طالب)</option>
              {students.map((s) => <option key={s.id} value={s.student_number}>{s.full_name_ar || s.full_name}{s.full_name_en ? ` — ${s.full_name_en}` : ''}</option>)}
            </select>
          )}
          <div className="flex flex-wrap gap-3 mt-4">
            <button type="button" className="mol-btn mol-btn-primary mol-pulse flex-1 py-3.5" disabled={!selected} onClick={confirmSelected}>
              بدء الاختبار الآن
            </button>
            <button type="button" className="mol-btn mol-btn-ghost px-6 py-3.5" onClick={() => setShowOther(true)}>
              Other — اسمي غير موجود
            </button>
          </div>
        </div>
      )}

      {ready && showOther && (
        <OtherStudentForm
          defaultGrade={grade}
          defaultTrack={track}
          defaultSection={section}
          onCancel={() => setShowOther(false)}
          onStart={onStart}
        />
      )}
    </div>
  );
}
