import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Atom, FlaskConical, Loader2, LockKeyhole } from 'lucide-react';

export default function ExamCodeScreen({ onContinue }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const valid = await onContinue(code.trim());
      if (!valid) setError('رمز الاختبار غير صحيح أو انتهت صلاحيته. تحقق من الرمز مع المعلم.');
    } catch {
      setError('تعذر التحقق من الرمز. تحقق من اتصال الإنترنت وحاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mol-wrap max-w-5xl mx-auto px-4 py-8 md:py-14">
      <header className="mol-card overflow-hidden mb-7 mol-fade-up">
        <div className="px-5 py-8 md:py-12 text-center">
          <img src="/logo.svg" alt="شعار منصة لغة الكيمياء" className="mx-auto mb-4 h-32 w-32 object-contain drop-shadow-sm md:h-40 md:w-40" />
          <div className="mol-chip inline-flex items-center gap-2 px-4 py-1.5 mb-3 text-xs font-extrabold" style={{ color: 'var(--mol-green)', borderColor: 'var(--mol-green)' }}>
            <FlaskConical size={14} /> مادة الكيمياء التفاعلية
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight" style={{ color: '#173b64' }}>منصة لغة الكيمياء</h1>
          <p className="text-base md:text-lg font-bold mt-2" style={{ color: 'var(--mol-muted)' }}>الاختبارات المركزية التفاعلية</p>
          <p className="mt-3 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>مدرسة خالد بن الوليد · إعداد الأستاذ محمد مدحت</p>
        </div>
      </header>

      <section className="mol-card mol-fade-up mx-auto max-w-2xl p-6 md:p-10" style={{ animationDelay: '0.08s' }}>
        <div className="flex items-center gap-4 mb-6">
          <div className="grid place-items-center shrink-0" style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--mol-cobalt-soft)', border: '1px solid var(--mol-cobalt)' }}>
            <Atom size={26} style={{ color: 'var(--mol-cobalt)' }} />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-extrabold">أدخل رمز الاختبار</h2>
            <p className="text-sm font-bold mt-1" style={{ color: 'var(--mol-muted)' }}>احصل على الرمز من المعلم لفتح تسجيل بيانات الطالب.</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label htmlFor="exam-code" className="mol-label">رمز الاختبار</label>
          <div className="relative">
            <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--mol-muted)' }} />
            <input
              id="exam-code"
              className="mol-input pl-12 text-center text-lg tracking-[0.18em]"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\s+/g, '').toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="أدخل الرمز هنا"
              maxLength={64}
              required
            />
          </div>
          {error && <p role="alert" className="text-sm font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p>}
          <button type="submit" disabled={loading || !code.trim()} className="mol-btn mol-btn-primary w-full py-3.5 inline-flex justify-center items-center gap-2">
            {loading ? <><Loader2 className="animate-spin" size={18} /> جارٍ التحقق…</> : <>متابعة إلى بيانات الطالب <ArrowLeft size={18} /></>}
          </button>
        </form>
        <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5 text-sm font-bold" style={{ borderColor: 'var(--mol-line-strong)', color: 'var(--mol-muted)' }}>
          <span>المدة: 45 دقيقة</span>
          <Link to="/admin" className="hover:underline" style={{ color: 'var(--mol-cobalt)' }}>دخول المعلم</Link>
        </div>
      </section>
    </main>
  );
}
