import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Award, BookOpen, LayoutDashboard, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';

const NAV_ITEMS = [
  { to: '/admin', end: true, label: 'الرئيسية', icon: LayoutDashboard },
  { to: '/admin/scores', label: 'الدرجات', icon: BookOpen, permission: 'view_grades' },
  { to: '/admin/certificates', label: 'الشهادات', icon: Award, permission: 'view_grades' },
  { to: '/admin/students', label: 'الطلاب', icon: Users, permission: 'manage_students' },
  { to: '/admin/exams', label: 'الاختبارات', icon: BookOpen, permission: 'manage_exams' },
  { to: '/admin/settings', label: 'الإعدادات', icon: Settings, ownerOnly: true },
];

export default function AdminLayout() {
  const { can, isOwner } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const current = NAV_ITEMS.find((item) => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to));
    document.title = `${current?.label || 'لوحة المعلم'} | منصة لغة الكيمياء`;
  }, [location.pathname]);

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const navigation = (
    <nav aria-label="قائمة الإدارة" className="flex flex-col gap-2">
      {NAV_ITEMS.filter((item) => (!item.permission || can(item.permission)) && (!item.ownerOnly || isOwner)).map(({ to, end, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-xl px-4 py-3 font-extrabold transition-colors ${isActive ? 'mol-btn-primary' : 'mol-btn-ghost'}`}
        >
          <Icon size={18} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[var(--mol-bg)]">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur" style={{ borderColor: 'var(--mol-line-strong)' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/icon.png" alt="" className="h-10 w-10 object-contain" />
            <div>
              <p className="text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>منصة لغة الكيمياء</p>
              <h1 className="font-extrabold">لوحة المعلم</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="mol-btn mol-btn-ghost hidden items-center gap-2 px-3 py-2 md:inline-flex" onClick={logout}>
              <LogOut size={16} /> خروج
            </button>
            <button
              type="button"
              className="mol-btn mol-btn-ghost p-2 md:hidden"
              aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {mobileOpen && <div className="border-t px-4 py-3 md:hidden" style={{ borderColor: 'var(--mol-line-strong)' }}>{navigation}<button type="button" className="mol-btn mol-btn-ghost mt-2 flex w-full items-center gap-3 px-4 py-3 font-extrabold" onClick={logout}><LogOut size={18} /> خروج</button></div>}
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[220px_minmax(0,1fr)] md:py-8">
        <aside className="hidden md:block">{navigation}</aside>
        <main className="min-w-0"><Outlet /></main>
      </div>
    </div>
  );
}
