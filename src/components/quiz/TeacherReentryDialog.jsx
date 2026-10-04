import React, { useState } from 'react';
import { KeyRound, Loader2, Unlock } from 'lucide-react';

export default function TeacherReentryDialog({ onSubmit }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try { await onSubmit(password); }
    catch { setError('كلمة مرور المعلم غير صحيحة أو تعذر التحقق منها. اطلب من المعلم المحاولة مرة أخرى.'); }
    finally { setBusy(false); setPassword(''); }
  };

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="teacher-reentry-title">
    <form className="mol-card w-full max-w-md space-y-4 p-6" onSubmit={submit}>
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl" style={{ background: 'var(--mol-amber-soft, var(--mol-surface-2))', color: 'var(--mol-amber)' }}><KeyRound size={26} /></div>
      <div className="text-center"><h2 id="teacher-reentry-title" className="text-xl font-extrabold">المحاولة مقفلة</h2><p className="mt-2 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>أدخل كلمة مرور إدارة المعلم لمتابعة المحاولة نفسها. لا تُسلَّم إجاباتك عند القفل.</p></div>
      <label className="mol-label block">كلمة مرور المعلم<input autoComplete="current-password" className="mol-input mt-1" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={128} /></label>
      {error && <p role="alert" className="text-sm font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p>}
      <button className="mol-btn mol-btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3" type="submit" disabled={busy || !password}>{busy ? <Loader2 size={17} className="animate-spin" /> : <Unlock size={17} />} السماح بمتابعة الاختبار</button>
    </form>
  </div>;
}
