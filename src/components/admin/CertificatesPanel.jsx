import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Award, Download, X } from 'lucide-react';
import Certificate from '@/components/quiz/Certificate';

export default function CertificatesPanel() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    base44.entities.ExamResult.filter({ is_perfect: true }, { sort: '-created_date', limit: 200 })
      .then((page) => setResults(page.items || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 font-bold p-6" style={{ color: 'var(--mol-muted)' }}>
        <Loader2 className="animate-spin" size={18} /> جاري التحميل…
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="mol-card p-8 text-center font-bold" style={{ color: 'var(--mol-muted)' }}>
        لا توجد شهادات بعد — تُمنح تلقائياً لمن يحقق 100%.
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2.5">
        {results.map((r) => (
          <div key={r.id} className="mol-card p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Award size={20} style={{ color: 'var(--mol-amber)' }} />
              <div>
                <div className="font-extrabold">{r.student_name}</div>
                <div className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>
                  الصف {r.grade} ({r.track}) • شعبة {r.section} • {r.submission_time}
                </div>
              </div>
            </div>
            <button className="mol-btn mol-btn-ghost px-4 py-2 inline-flex items-center gap-1.5" onClick={() => setSelected(r)}>
              <Download size={16} /> عرض / تحميل الشهادة
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.5)' }} onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[88vh] overflow-y-auto mol-scroll p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button onClick={() => setSelected(null)} aria-label="إغلاق"><X size={20} /></button>
            </div>
            <Certificate student={{ name: selected.student_name, grade: selected.grade, section: selected.section }} />
          </div>
        </div>
      )}
    </div>
  );
}