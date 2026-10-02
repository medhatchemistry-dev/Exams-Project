import React, { useState } from 'react';
import { STRUCTURE, GRADE_LABELS } from '@/lib/academicStructure';

export default function StudentEditorDialog({ student, saving, onClose, onSave }) {
  const [values, setValues] = useState({
    student_number: student?.student_number || '',
    full_name: student?.full_name || '',
    grade: student?.grade || '',
    track: student?.track || '',
    section: student?.section || '',
  });
  const [error, setError] = useState('');
  const tracks = values.grade ? Object.keys(STRUCTURE[values.grade] || {}) : [];
  const sections = values.grade && values.track ? STRUCTURE[values.grade]?.[values.track] || [] : [];

  const change = (field, value) => setValues((previous) => ({
    ...previous,
    [field]: value,
    ...(field === 'grade' ? { track: '', section: '' } : {}),
    ...(field === 'track' ? { section: '' } : {}),
  }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await onSave(values);
    } catch (saveError) {
      setError(saveError.message || 'تعذر حفظ بيانات الطالب.');
    }
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/50 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="student-editor-title" className="mol-card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6">
        <h3 id="student-editor-title" className="text-xl font-extrabold">{student ? 'تعديل بيانات الطالب' : 'إضافة طالب'}</h3>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <label className="mol-label">رقم الطالب<input className="mol-input mt-1" required maxLength={80} value={values.student_number} disabled={Boolean(student)} onChange={(event) => change('student_number', event.target.value)} /></label>
          <label className="mol-label">اسم الطالب<input className="mol-input mt-1" required maxLength={160} value={values.full_name} onChange={(event) => change('full_name', event.target.value)} /></label>
          <label className="mol-label">الصف<select className="mol-input mt-1" required value={values.grade} onChange={(event) => change('grade', event.target.value)}><option value="">اختر الصف</option>{Object.keys(STRUCTURE).map((grade) => <option value={grade} key={grade}>{GRADE_LABELS[grade]} ({grade})</option>)}</select></label>
          <label className="mol-label">المسار<select className="mol-input mt-1" required disabled={!values.grade} value={values.track} onChange={(event) => change('track', event.target.value)}><option value="">اختر المسار</option>{tracks.map((track) => <option value={track} key={track}>{track}</option>)}</select></label>
          <label className="mol-label">الشعبة<select className="mol-input mt-1" required disabled={!values.track} value={values.section} onChange={(event) => change('section', event.target.value)}><option value="">اختر الشعبة</option>{sections.map((section) => <option value={section} key={section}>{section}</option>)}</select></label>
          {error && <p role="alert" className="font-bold sm:col-span-2" style={{ color: 'var(--mol-red)' }}>{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="mol-btn mol-btn-ghost px-4 py-2" disabled={saving} onClick={onClose}>إلغاء</button><button type="submit" className="mol-btn mol-btn-primary px-4 py-2" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ الطالب'}</button></div>
        </form>
      </section>
    </div>
  );
}
