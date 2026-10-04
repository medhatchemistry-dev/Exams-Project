import React, { useEffect, useRef, useState } from 'react';
import { Clock, LogOut, AlertCircle } from 'lucide-react';
import NavGrid from './NavGrid';
import QuestionCard from './QuestionCard';

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export default function QuizScreen({ student, examTitle, questions, answers, onAnswer, onSubmit, onAlert, onRetryCapabilities, paused = false, locked = false, unavailable = false, browserCapabilities = { fullscreen: null, audio: null } }) {
  const [timeLeft, setTimeLeft] = useState(45 * 60);
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);
  const warned = useRef({ 30: false, 15: false });
  const active = !paused && !locked && !unavailable;

  useEffect(() => {
    if (!active) return undefined;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        const nt = t - 1;
        if (nt === 30 * 60 && !warned.current[30]) {
          warned.current[30] = true;
          onAlert('تنبيه الوقت', 'مضت 15 دقيقة، بقي لديك 30 دقيقة على نهاية الاختبار.');
        } else if (nt === 15 * 60 && !warned.current[15]) {
          warned.current[15] = true;
          onAlert('تنبيه هام', 'مضت 30 دقيقة، بقي لديك 15 دقيقة فقط على نهاية الاختبار!');
        }
        if (nt <= 0) {
          clearInterval(timerRef.current);
          onAlert('انتهى الوقت', 'انتهى وقت الاختبار وسيتم التسليم التلقائي.');
          onSubmit(true);
        }
        return nt < 0 ? 0 : nt;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const lowTime = timeLeft <= 5 * 60;

  const jump = (i) => {
    setCurrent(i);
    const el = document.getElementById(`q-${i}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleAnswer = (idx, optIdx) => {
    onAnswer(idx, optIdx);
    setCurrent(idx);
  };

  return (
    <div className="mol-wrap max-w-4xl mx-auto px-3 md:px-4 py-5">
      {/* sticky lab nav */}
      <div className="mol-card flex items-center justify-between gap-3 p-3 md:p-4 mb-4 sticky top-3 z-30">
        <div className="min-w-0">
          <div className="text-xs font-extrabold tracking-wider" style={{ color: 'var(--mol-muted)' }}>
            {examTitle || 'مرحلة التفاعل — Reaction Phase'}
          </div>
          <div className="text-sm font-extrabold truncate" style={{ color: 'var(--mol-text)' }}>
            {student.name} • {student.grade} ({student.track}) • شعبة {student.section}
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <div
            className="mol-chip inline-flex items-center gap-2 px-3 py-2 font-extrabold"
            style={{ color: lowTime ? 'var(--mol-red)' : 'var(--mol-green)', borderColor: lowTime ? 'var(--mol-red)' : 'var(--mol-green)' }}
          >
            <Clock size={16} />
            <span className="tabular-nums">{fmt(timeLeft)}</span>
          </div>
          <button
            className="mol-btn mol-btn-ghost px-3 py-2 text-sm inline-flex items-center gap-1.5"
            disabled={!active}
            onClick={() => onAlert('تأكيد التسليم', 'هل أنت متأكد؟ سيتم تسليم الاختبار نهائياً.', () => onSubmit(false))}
          >
            <LogOut size={16} /> <span className="hidden md:inline">تسليم</span>
          </button>
        </div>
      </div>

      <div className="mol-card mb-4 p-3 text-sm font-bold" style={{ color: active ? 'var(--mol-muted)' : 'var(--mol-amber)' }} role="status">
        {paused ? 'أوقف المعلم الاختبار مؤقتاً. ستبقى إجاباتك محفوظة هنا حتى إعادة فتحه.'
          : locked ? 'المحاولة مقفلة. أدخل كلمة مرور المعلم للمتابعة؛ لم يتم تسليم إجاباتك.'
            : unavailable ? 'تعذر التحقق من حالة المحاولة. الإجابة والتسليم متوقفان مؤقتاً.'
              : <>{`ملء الشاشة: ${browserCapabilities.fullscreen === null ? 'جارٍ التحقق' : browserCapabilities.fullscreen ? 'مفعّل' : 'غير متاح'} · صوت التنبيه: ${browserCapabilities.audio === null ? 'جارٍ التحقق' : browserCapabilities.audio ? 'جاهز' : 'غير متاح'}. يحتاج ملء الشاشة والصوت إلى دعم المتصفح، ولا يتحكم الموقع بصوت الجهاز أو كل اختصاراته.`}{(browserCapabilities.fullscreen === false || browserCapabilities.audio === false) && <button type="button" className="mol-btn mol-btn-ghost ms-3 px-3 py-1.5" onClick={onRetryCapabilities}>إعادة المحاولة</button>}</>}
      </div>

      <NavGrid total={questions.length} answers={answers} current={current} onJump={jump} />

      <div className="space-y-5">
        {questions.map((q, i) => (
          <QuestionCard key={i} q={q} index={i} selected={answers[i]} onSelect={handleAnswer} disabled={!active} />
        ))}
      </div>

      <div className="text-center mt-8 mb-12">
        <div className="mol-card inline-flex items-center gap-2 px-4 py-2.5 mb-4 text-sm font-bold" style={{ color: 'var(--mol-amber)' }}>
          <AlertCircle size={16} /> راجع إجاباتك قبل التسليم النهائي.
        </div>
        <div>
          <button
            className="mol-btn mol-btn-primary px-10 py-4 text-lg"
            disabled={!active}
            onClick={() => onSubmit(false)}
          >
            تسليم الاختبار النهائي
          </button>
        </div>
      </div>
    </div>
  );
}
