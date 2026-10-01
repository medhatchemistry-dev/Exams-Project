import React, { useState } from 'react';
import AdminLogin from '@/components/admin/AdminLogin';
import AdminDashboard from '@/components/admin/AdminDashboard';

const ADMIN_SESSION_KEY = 'admin_session_authed';

export default function Admin() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(ADMIN_SESSION_KEY) === '1');

  const handleLogin = () => {
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    setAuthed(true);
  };

  return (
    <div className="molecular-app min-h-screen">
      <div className="mol-wrap">
        {!authed ? <AdminLogin onLogin={handleLogin} /> : <AdminDashboard />}
      </div>
    </div>
  );
}