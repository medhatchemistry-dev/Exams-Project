import React from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, Phone, ShieldCheck, Settings } from 'lucide-react';
import StudentPicker from './StudentPicker';

export default function LoginScreen({ onStart, targetClass = null, durationMinutes = null }) {
  return (
    <div className="mol-wrap max-w-5xl mx-auto px-4 py-10 md:py-16">
      {/* Hero */}
      <header className="mol-card overflow-hidden mb-8 mol-fade-up">
        <div className="relative h-44 md:h-64">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(37,99,235,0.12), transparent 65%), linear-gradient(180deg, rgba(245,248,252,0.45), rgba(245,248,252,0.92))' }} />
          <Link
            to="/admin"
            className="mol-chip absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-extrabold"
            style={{ color: 'var(--mol-cobalt)', borderColor: 'var(--mol-cobalt)' }}
          >
            <Settings size={14} /> Admin
          </Link>
          <div className="relative h-full flex flex-col items-center justify-center text-center px-4">
            <img src="/icon.png" alt="شعار منصة لغة الكيمياء" className="absolute right-4 top-4 h-16 w-16 object-contain md:right-7 md:top-7 md:h-24 md:w-24" />
            <div className="mol-chip inline-flex items-center gap-2 px-4 py-1.5 mb-3 text-xs font-extrabold" style={{ color: 'var(--mol-green)', borderColor: 'var(--mol-green)' }}>
              <FlaskConical size={14} /> مادة الكيمياء التفاعلية
            </div>
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight" style={{ fontFamily: "'Instrument Serif', Cairo, serif" }}>
              منصة لغة الكيمياء
            </h1>
            <p className="text-base md:text-lg font-bold mt-1" style={{ color: 'var(--mol-muted)' }}>
              الاختبار التفاعلي المركزي — Chemistry Interactive Assessment
            </p>
          </div>
        </div>
        <div className="px-5 md:px-8 py-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-bold border-t" style={{ borderColor: 'var(--mol-line-strong)', color: 'var(--mol-muted)' }}>
          <span>مدرسة خالد بن الوليد</span>
          <span className="opacity-40">•</span>
          <span>إعداد المعلم: <span style={{ color: 'var(--mol-red)' }}>الأستاذ محمد مدحت</span></span>
          <span className="opacity-40">•</span>
          <a href="https://wa.me/971553074702" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5" style={{ color: 'var(--mol-red)' }}>
            <Phone size={14} /> 00971553074702
          </a>
        </div>
      </header>

      {/* Registration */}
      <div className="mol-card mol-fade-up p-6 md:p-10" style={{ animationDelay: '0.08s' }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="grid place-items-center" style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--mol-red-soft)', border: '1px solid var(--mol-red)' }}>
            <ShieldCheck size={22} style={{ color: 'var(--mol-red)' }} />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-extrabold">تسجيل بيانات الطالب للدخول</h2>
            <p className="text-sm font-bold" style={{ color: 'var(--mol-muted)' }}>
              اختر الصف والشعبة والمسار، ثم اختر اسمك من القائمة.
            </p>
          </div>
        </div>

        <StudentPicker onStart={onStart} targetClass={targetClass} />

        <p className="mt-4 text-center text-xs font-bold" style={{ color: 'var(--mol-muted)' }}>
          عند بدء الاختبار يطلب المتصفح ملء الشاشة ويجرّب صوت التنبيه. قد يمنع المتصفح تشغيل الصوت، ولا يستطيع الموقع تجاوز كتم الجهاز أو مستوى صوته.
        </p>

        <p className="text-center text-xs font-bold mt-6" style={{ color: 'var(--mol-muted)' }}>
          <span>المدة: {Number.isInteger(durationMinutes) && durationMinutes > 0 ? `${durationMinutes} دقيقة` : 'مفتوح دون حد زمني'} • مراقبة أمنية تلقائية</span>
        </p>
      </div>
    </div>
  );
}
