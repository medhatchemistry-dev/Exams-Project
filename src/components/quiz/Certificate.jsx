import React, { useRef, useState } from 'react';
import { Award, Download, Loader2 } from 'lucide-react';
import { getCertificateTemplate } from '@/lib/certificateTemplates';
import { downloadSinglePagePdf } from '@/lib/pdfReport';

export default function Certificate({ student, examTitle, templateId = 1 }) {
  const ref = useRef(null);
  const [generating, setGenerating] = useState(false);
  const template = getCertificateTemplate(templateId);

  const download = async () => {
    if (!ref.current || generating) return;
    setGenerating(true);
    try {
      await downloadSinglePagePdf(ref.current, `شهادة-تقدير-${student.name}.pdf`, 'landscape');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="mol-card p-5 md:p-8 mol-fade-up">
      <div
        ref={ref}
        dir="rtl"
        style={{
          position: 'relative',
          overflow: 'hidden',
          width: 900,
          height: 620,
          margin: '0 auto',
          background: template.background,
          border: `12px double ${template.accent}`,
          outline: `2px solid ${template.frame}`,
          outlineOffset: '-20px',
          padding: '48px 60px',
          boxSizing: 'border-box',
          fontFamily: "'Cairo', serif",
          textAlign: 'center',
          color: '#172033',
        }}
      >
        <div aria-hidden="true" style={{ position: 'absolute', top: 18, left: 26, color: template.frame, fontSize: 42, opacity: 0.8 }}>{template.symbol}</div>
        <div aria-hidden="true" style={{ position: 'absolute', right: 26, bottom: 12, color: template.frame, fontSize: 42, opacity: 0.8 }}>{template.symbol}</div>
        <div style={{ fontSize: 14, letterSpacing: 4, fontWeight: 800, color: template.accent }}>MINISTRY OF EDUCATION</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
          مدرسة خالد بن الوليد — KHALID BIN AL WALEED SCHOOL
        </div>
        <div style={{ fontSize: 34, fontWeight: 900, marginTop: 22, color: template.accent }}>شهادة تقدير</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#475569', marginTop: 4 }}>Certificate of Excellence</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginTop: 28 }}>تُمنح هذه الشهادة إلى</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: template.accent, margin: '8px 0 2px' }}>
          {student.name || 'اسم الطالب'}
        </div>
        {student.nameEnglish && <div dir="ltr" style={{ fontSize: 18, fontWeight: 700, color: '#475569', marginBottom: 6 }}>{student.nameEnglish}</div>}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', lineHeight: 1.9 }}>
          لحصوله/ـا على العلامة الكاملة (100%) في
          <br />
          {examTitle || 'اختبار الكيمياء التفاعلي'}
          <br />
          الصف: {student.grade} — الشعبة: {student.section}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 30 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>محمد مدحت</div>
            <div style={{ fontSize: 12, color: '#64748b', borderTop: `2px solid ${template.frame}`, paddingTop: 4, marginTop: 4 }}>معلم المادة</div>
          </div>
          <Award size={48} style={{ color: template.accent }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>خالد بن الوليد</div>
            <div style={{ fontSize: 12, color: '#64748b', borderTop: `2px solid ${template.frame}`, paddingTop: 4, marginTop: 4 }}>المدرسة</div>
          </div>
        </div>
      </div>
      <div className="text-center mt-5 no-print">
        <button className="mol-btn mol-btn-primary px-8 py-3 inline-flex items-center gap-2" onClick={download} disabled={generating}>
          {generating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          تحميل شهادة التقدير
        </button>
      </div>
    </div>
  );
}
