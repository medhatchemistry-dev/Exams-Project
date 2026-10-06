import React from 'react';
import { Volume2, Loader2, Maximize } from 'lucide-react';

export default function ExamAudioGate({ audioReady, heard, error, onTest, onHeardChange, onEnter }) {
  return (
    <main className="mol-wrap mx-auto max-w-xl px-4 py-12">
      <section className="mol-card space-y-5 p-6 text-center md:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'var(--mol-cobalt-soft)', color: 'var(--mol-cobalt)' }}><Volume2 size={26} /></span>
        <div><h1 className="text-2xl font-extrabold">اختبار الصوت قبل ملء الشاشة</h1><p className="mt-2 font-bold" style={{ color: 'var(--mol-muted)' }}>شغّل نغمة الاختبار أولاً. إذا لم تسمعها، أزل كتم الجهاز وارفع الصوت ثم أعد المحاولة.</p></div>
        <button type="button" className="mol-btn mol-btn-ghost inline-flex items-center justify-center gap-2 px-5 py-3" onClick={onTest}>{audioReady ? <Volume2 size={18} /> : <Loader2 size={18} className="animate-spin" />} {audioReady ? 'إعادة تشغيل نغمة الاختبار' : 'تشغيل نغمة الاختبار'}</button>
        {audioReady && <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 text-sm font-extrabold" style={{ borderColor: 'var(--mol-line-strong)' }}><input type="checkbox" checked={heard} onChange={(event) => onHeardChange(event.target.checked)} /> سمعت النغمة بوضوح</label>}
        {error && <p role="alert" className="text-sm font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p>}
        <button type="button" className="mol-btn mol-btn-primary inline-flex w-full items-center justify-center gap-2 py-3" disabled={!audioReady || !heard} onClick={onEnter}><Maximize size={18} /> دخول الاختبار وطلب ملء الشاشة</button>
      </section>
    </main>
  );
}
