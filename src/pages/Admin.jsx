import React from 'react';
import AdminLogin from '@/components/admin/AdminLogin';
import AdminDashboard from '@/components/admin/AdminDashboard';
import { useAuth } from '@/lib/AuthContext';

export default function Admin() {
  const { isLoadingAuth, isTeacher, isAuthenticated, logout } = useAuth();

  return (
    <div className="molecular-app min-h-screen">
      <div className="mol-wrap">
        {isLoadingAuth ? <div className="py-20 text-center font-bold">جاري التحقق من تسجيل الدخول…</div> : isTeacher ? <AdminDashboard /> : isAuthenticated ? (
          <div className="max-w-md mx-auto px-4 py-20">
            <div className="mol-card p-8 text-center">
              <h2 className="text-xl font-extrabold mb-3">هذا الحساب غير مخوّل للوحة المعلم</h2>
              <p className="mb-5" style={{ color: 'var(--mol-muted)' }}>اطلب من مسؤول المشروع إضافة حسابك إلى دور المعلم.</p>
              <button className="mol-btn mol-btn-primary px-6 py-3" onClick={() => logout()}>تسجيل الخروج</button>
            </div>
          </div>
        ) : <AdminLogin />}
      </div>
    </div>
  );
}
