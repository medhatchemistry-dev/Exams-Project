import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AdminLogin from '@/components/admin/AdminLogin';
import { useAuth } from '@/lib/AuthContext';

export default function Admin() {
  const { isLoadingAuth, isTeacher, isAuthenticated, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const pageLabels = {
      '/admin': 'لوحة المعلم',
      '/admin/scores': 'الدرجات',
      '/admin/certificates': 'الشهادات',
      '/admin/students': 'الطلاب',
      '/admin/exams': 'الاختبارات',
      '/admin/settings': 'الإعدادات',
    };
    document.title = `${pageLabels[location.pathname] || (location.pathname.startsWith('/admin/exams/') ? 'تفاصيل الاختبار' : pageLabels['/admin'])} | منصة لغة الكيمياء`;
  }, [location.pathname]);

  return (
    <div className="molecular-app min-h-screen">
      <div className="mol-wrap">
        {isLoadingAuth ? <div role="status" className="py-20 text-center font-bold">جاري التحقق من تسجيل الدخول…</div> : isTeacher ? <Outlet /> : isAuthenticated ? (
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
