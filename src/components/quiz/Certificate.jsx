import React, { useRef, useState } from 'react';
import { Award, Download, Loader2 } from 'lucide-react';
import { downloadSinglePagePdf } from '@/lib/pdfReport';

// Formal certificate of excellence, auto-shown/stored for a 100% score.
export default function Certificate({ student }) {
  const ref = useRef(null);
  const [generating, setGenerating] = useState(false);

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
          width: 900,
          height: 620,
          margin: '0 auto',
          background: '#fdfbf5',
          border: '10px solid #0f172a',
          outline: '2px solid #d97706',
          outlineOffset: '-18px',
          padding: '50px 60px',
          boxSizing: 'border-box',
          fontFamily: "'Cairo', serif",
          textAlign: 'center',
          color: '#0f172a'
        }}
      >
        <div style={{ fontSize: 14, letterSpacing: 4, fontWeight: 800, color: '#d97706' }}>MINISTRY OF EDUCATION</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
          مدرسة خالد بن الوليد — KHALID BIN AL WALEED SCHOOL
        </div>
        <div style={{ fontSize: 34, fontWeight: 900, fontFamily: "'Instrument Serif', serif", marginTop: 22 }}>شهادة تقدير</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#475569', marginTop: 4 }}>Certificate of Excellence</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', marginTop: 32 }}>تُمنح هذه الشهادة إلى</div>
        <div style={{ fontSize: 30, fontWeight: 900, color: '#dc2626', margin: '8px 0', fontFamily: "'Instrument Serif', serif" }}>
          {student.name}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#334155', lineHeight: 1.9 }}>
          لحصوله/ـا على العلامة الكاملة (100%) في اختبار الكيمياء التفاعلي
          <br />
          الصف: {student.grade} — الشعبة: {student.section}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 44 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>محمد مدحت</div>
            <div style={{ fontSize: 12, color: '#64748b', borderTop: '2px solid #0f172a', paddingTop: 4, marginTop: 4 }}>معلم المادة</div>
          </div>
          <Award size={48} style={{ color: '#d97706' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>خالد بن الوليد</div>
            <div style={{ fontSize: 12, color: '#64748b', borderTop: '2px solid #0f172a', paddingTop: 4, marginTop: 4 }}>المدرسة</div>
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