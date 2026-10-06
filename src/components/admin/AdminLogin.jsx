import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, Loader2, LockKeyhole } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: loginError } = await supabase.functions.invoke('teacher-login', {
        body: { password },
      });
      if (loginError) throw loginError;
      if (!data?.session?.access_token || !data?.session?.refresh_token) {
        throw new Error('تعذر تسجيل الدخول. تحقق من إعداد دخول المعلم.');
      }
      const { error: sessionError } = await supabase.auth.setSession(data.session);
      if (sessionError) throw sessionError;
    } catch (err) {
      console.error('Teacher sign-in failed:', err);
      const status = err?.context?.status ?? err?.status;
      if (status === 401) {
        setError('كلمة المرور غير صحيحة.');
      } else if (status === 429) {
        setError('تم إيقاف محاولات الدخول مؤقتًا بسبب تكرار المحاولة. حاول لاحقًا.');
      } else {
        setError('تعذر الاتصال بخدمة الدخول. حاول مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <div className="mol-card p-8 mol-fade-up text-center">
        <div className="mx-auto mb-4 grid place-items-center" style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--mol-cobalt-soft)', border: '1px solid var(--mol-cobalt)' }}>
          <ShieldCheck size={30} style={{ color: 'var(--mol-cobalt)' }} />
        </div>
        <h2 className="text-xl font-extrabold mb-1">تسجيل دخول المعلم</h2>
        <p className="text-sm font-bold mb-6" style={{ color: 'var(--mol-muted)' }}>
          أدخل كلمة المرور المخصصة لحسابك
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2 text-left">
            <label htmlFor="teacher-password" className="text-sm font-medium">كلمة المرور</label>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2" size={17} style={{ color: 'var(--mol-muted)' }} />
              <input id="teacher-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mol-input pl-10" />
            </div>
          </div>
          {error && <p className="text-sm font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p>}
          <button type="submit" disabled={loading} className="mol-btn mol-btn-primary w-full py-3">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> جاري تسجيل الدخول…</> : 'دخول'}
          </button>
        </form>
        <Link to="/" className="inline-flex items-center gap-1.5 mt-6 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>
          <ArrowRight size={14} /> رجوع لصفحة الطالب
        </Link>
      </div>
    </div>
  );
}
