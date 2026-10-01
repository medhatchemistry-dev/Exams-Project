import React, { useState } from 'react';
import { GRADE_LABELS, STRUCTURE } from '@/lib/academicStructure';

export default function OtherStudentForm({ defaultGrade, defaultTrack, defaultSection, onCancel, onStart }) {
  const [name, setName] = useState('');
  const [idNum, setIdNum] = useState('');
  const [grade, setGrade] = useState(defaultGrade);
  const [track, setTrack] = useState(defaultTrack);
  const [section, setSection] = useState(defaultSection);

  const tracks = Object.keys(STRUCTURE[grade] || {});
  const sections = STRUCTURE[grade]?.[track] || [];

  const submit = () => {
    onStart({ name: name.trim(), id: idNum.trim(), grade, track, section, isOther: true });
  };

  const canSubmit = name.trim() && idNum.trim() && grade && track && section;

  return (
    <div className="mol-card p-5" style={{ background: 'var(--mol-surface-2)' }}>
      <h4 className="font-extrabold mb-4">إدخال بيانات الطالب يدوياً — Other</h4>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="mol-label">اسم الطالب</label>
          <input className="mol-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم الكامل" />
        </div>
        <div>
          <label className="mol-label">الرقم التعريفي</label>
          <input className="mol-input" value={idNum} onChange={(e) => setIdNum(e.target.value)} placeholder="رقم الطالب" />
        </div>
        <div>
          <label className="mol-label">الصف</label>
          <select className="mol-input" value={grade} onChange={(e) => { setGrade(e.target.value); setTrack(''); setSection(''); }}>
            {Object.keys(STRUCTURE).map((g) => <option key={g} value={g}>{GRADE_LABELS[g]} ({g})</option>)}
          </select>
        </div>
        <div>
          <label className="mol-label">المسار</label>
          <select className="mol-input" value={track} onChange={(e) => { setTrack(e.target.value); setSection(''); }}>
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
      <div className="flex gap-3 mt-5">
        <button type="button" className="mol-btn mol-btn-primary flex-1 py-3" disabled={!canSubmit} onClick={submit}>
          بدء الاختبار الآن
        </button>
        <button type="button" className="mol-btn mol-btn-ghost px-6 py-3" onClick={onCancel}>
          رجوع
        </button>
      </div>
    </div>
  );
}