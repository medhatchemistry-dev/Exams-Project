import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight } from 'lucide-react';

const ADMIN_PASSWORD = 'Medhat@2027';

export default function AdminLogin({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setError('');
      onLogin();
    } else {
      setError('كلمة المرور غير صحيحة');
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
          الوصول إلى لوحة التحكم الخاصة بالمعلم
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            className="mol-input text-center"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p>}
          <button type="submit" className="mol-btn mol-btn-primary w-full py-3">دخول</button>
        </form>
        <Link to="/" className="inline-flex items-center gap-1.5 mt-6 text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>
          <ArrowRight size={14} /> رجوع لصفحة الطالب
        </Link>
      </div>
    </div>
  );
}