import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function SecurityOverlay({ warningsLeft, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && warningsLeft > 0) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [warningsLeft, onClose]);

  return (
    <div
      className="alarm-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(6px)' }}
      onClick={() => warningsLeft > 0 && onClose()}
    >
      <div
        className="mol-card mol-fade-up max-w-lg w-full p-8 text-center"
        style={{ borderColor: 'var(--mol-red)', boxShadow: '0 0 60px -10px rgba(239,68,68,0.6)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-5 grid place-items-center"
          style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--mol-red-soft)', border: '1px solid var(--mol-red)' }}
        >
          <AlertTriangle size={36} style={{ color: 'var(--mol-red)' }} />
        </div>
        <h2 className="text-2xl font-extrabold mb-3" style={{ color: 'var(--mol-red)' }}>
          تنبيه أمني — مغادرة نافذة الاختبار
        </h2>
        <p className="text-base font-bold mb-2" style={{ color: 'var(--mol-text)' }}>
          يُمنع منعاً باتاً مغادرة الصفحة أو فتح تبويب آخر أثناء الاختبار.
        </p>
        <p className="text-lg font-extrabold mt-4" style={{ color: 'var(--mol-amber)' }}>
          التحذيرات المتبقية قبل التسليم التلقائي: {warningsLeft}
        </p>
        {warningsLeft > 0 ? (
          <button className="mol-btn mol-btn-ghost mt-6 px-6 py-2.5" onClick={onClose}>
            <span className="inline-flex items-center gap-2">
              <X size={18} /> العودة للاختبار
            </span>
          </button>
        ) : (
          <p className="mt-6 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>
            جاري التسليم التلقائي…
          </p>
        )}
      </div>
    </div>
  );
}