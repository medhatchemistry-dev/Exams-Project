import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, ArrowLeft, BookOpen, ClipboardList, Users } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';

const CARDS = [
  { to: '/admin/scores', title: 'الدرجات', description: 'عرض المحاولات ومراجعة الإجابات وتصدير النتائج.', icon: ClipboardList },
  { to: '/admin/certificates', title: 'الشهادات', description: 'عرض شهادات الطلاب الحاصلين على الدرجة الكاملة.', icon: Award },
  { to: '/admin/students', title: 'الطلاب', description: 'إدارة سجل الطلاب وإضافة الطلاب من ملف Excel.', icon: Users },
  { to: '/admin/exams', title: 'الاختبارات', description: 'استيراد الاختبارات وإصدار رموز الدخول.', icon: BookOpen },
];

export default function AdminHome() {
  const [counts, setCounts] = useState({ scores: null, students: null, exams: null });
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('exam_results').select('id', { count: 'exact', head: true }),
      supabase.from('students').select('id', { count: 'exact', head: true }),
      supabase.from('exams').select('id', { count: 'exact', head: true }).eq('status', 'available'),
    ]).then((results) => {
      if (!active) return;
      const failed = results.find((result) => result.error);
      if (failed) setError('تعذر تحميل ملخص اللوحة. تحقق من صلاحيات المعلم والاتصال.');
      setCounts({ scores: results[0].count, students: results[1].count, exams: results[2].count });
    }).catch(() => {
      if (active) setError('تعذر تحميل ملخص اللوحة. حاول تحديث الصفحة.');
    });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-6">
      <section className="mol-card p-6 md:p-8">
        <p className="text-sm font-extrabold" style={{ color: 'var(--mol-cobalt)' }}>مساحة المعلم</p>
        <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">مرحباً بك في لوحة الإدارة</h2>
        <p className="mt-2 max-w-2xl font-bold" style={{ color: 'var(--mol-muted)' }}>اختر القسم الذي تريد العمل عليه. تظهر أدوات الإدارة داخل صفحاتها المخصصة فقط.</p>
      </section>

      {error && <p role="alert" className="mol-card p-4 font-bold" style={{ color: 'var(--mol-red)' }}>{error}</p>}

      <section className="grid gap-4 sm:grid-cols-3" aria-label="ملخص">
        {[
          ['محاولات الاختبار', counts.scores],
          ['الطلاب المسجلون', counts.students],
          ['الاختبارات المتاحة', counts.exams],
        ].map(([label, value]) => (
          <div className="mol-card p-5" key={label}>
            <p className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{label}</p>
            <p className="mt-2 text-3xl font-extrabold" aria-label={value == null ? 'جار التحميل' : `${value}`}>{value ?? '—'}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-2" aria-label="أقسام الإدارة">
        {CARDS.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} className="mol-card group flex min-h-36 items-start gap-4 p-5 transition-transform hover:-translate-y-0.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--mol-cobalt-soft)', color: 'var(--mol-cobalt)' }}><Icon size={23} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 text-lg font-extrabold">{title}<ArrowLeft size={17} className="transition-transform group-hover:-translate-x-1" /></span>
              <span className="mt-1 block text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>{description}</span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
