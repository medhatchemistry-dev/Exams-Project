import React from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

export default function StudentImportDialog({ preview, saving, onClose, onConfirm }) {
  const inserts = preview.validRows.filter((row) => row.action === 'insert').length;
  const updates = preview.validRows.length - inserts;

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/50 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="student-import-title" className="mol-card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
        <p className="text-xs font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>{preview.filename}</p>
        <h3 id="student-import-title" className="mt-1 text-xl font-extrabold">معاينة استيراد الطلاب</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="mol-card p-3"><p className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>صفوف صالحة</p><p className="text-2xl font-extrabold">{preview.validRows.length}</p></div>
          <div className="mol-card p-3"><p className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>إضافات جديدة</p><p className="text-2xl font-extrabold">{inserts}</p></div>
          <div className="mol-card p-3"><p className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>تحديثات موجودة</p><p className="text-2xl font-extrabold">{updates}</p></div>
        </div>
        {preview.invalidRows.length > 0 ? (
          <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--mol-amber)', background: 'var(--mol-amber-soft, var(--mol-surface-2))' }}>
            <div className="flex items-center gap-2 font-extrabold" style={{ color: 'var(--mol-amber)' }}><AlertTriangle size={18} /> {preview.invalidRows.length} صف يحتاج مراجعة. يمكنك استيراد الصفوف الصالحة الآن؛ سيتم تخطي هذه الصفوف.</div>
            <ul className="mt-3 max-h-56 space-y-2 overflow-auto text-sm font-bold">{preview.invalidRows.slice(0, 100).map((row) => <li key={row.sourceRow}><span>صف {row.sourceRow} — {row.student.student_number || 'بدون رقم'}:</span> {row.errors.join(' ')}</li>)}</ul>
            {preview.invalidRows.length > 100 && <p className="mt-2 text-xs font-bold">يتم عرض أول 100 خطأ فقط.</p>}
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-2 rounded-xl border p-4 font-extrabold" style={{ borderColor: 'var(--mol-green)', background: 'var(--mol-green-soft)', color: 'var(--mol-green)' }}><CheckCircle2 size={18} /> جميع الصفوف صالحة وجاهزة للحفظ.</div>
        )}
        <div className="mt-6 flex justify-end gap-2"><button type="button" className="mol-btn mol-btn-ghost px-4 py-2" disabled={saving} onClick={onClose}>إلغاء</button><button type="button" className="mol-btn mol-btn-primary inline-flex items-center gap-2 px-4 py-2" disabled={saving || preview.validRows.length === 0} onClick={onConfirm}>{saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} استيراد {preview.validRows.length} طالب{preview.invalidRows.length ? ` وتخطي ${preview.invalidRows.length} صف` : ''}</button></div>
      </section>
    </div>
  );
}
