import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch (err) {
      setError(err.message || 'تعذر تسجيل الدخول');
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
          سجّل الدخول بحساب المعلم المصرّح به
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2 text-left">
            <label htmlFor="teacher-email" className="text-sm font-medium">البريد الإلكتروني</label>
            <input id="teacher-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className="mol-input" />
          </div>
          <div className="space-y-2 text-left">
            <label htmlFor="teacher-password" className="text-sm font-medium">كلمة المرور</label>
            <input id="teacher-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mol-input" />
          </div>
          {error && <p className="text-sm font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p>}
          <button type="submit" disabled={loading} className="mol-btn mol-btn-primary w-full py-3">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> جاري تسجيل الدخول…</> : 'دخول'}
          </button>
        </form>
        <Link to="/forgot-password" className="inline-block mt-4 text-sm font-bold text-primary hover:underline">نسيت كلمة المرور؟</Link>
        <Link to="/" className="inline-flex items-center gap-1.5 mt-6 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>
          <ArrowRight size={14} /> رجوع لصفحة الطالب
        </Link>
      </div>
    </div>
  );
}
