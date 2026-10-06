import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function AdminPermissionGate({ permission, ownerOnly = false, children }) {
  const { can, isOwner } = useAuth();
  const allowed = ownerOnly ? isOwner : can(permission);
  if (allowed) return children;

  return (
    <section className="mol-card mx-auto max-w-xl p-8 text-center">
      <h2 className="text-xl font-extrabold">لا تملك صلاحية الوصول إلى هذه الصفحة</h2>
      <p className="mt-2 font-bold" style={{ color: 'var(--mol-muted)' }}>اطلب من مالك المنصة تحديث صلاحيات حسابك.</p>
      <Link to="/admin" className="mol-btn mol-btn-primary mt-5 inline-flex px-5 py-2.5">العودة إلى لوحة الإدارة</Link>
    </section>
  );
}
