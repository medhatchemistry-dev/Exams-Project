import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { loadQuestionBanks, buildExam } from '@/lib/quizBanks';
import LoginScreen from '@/components/quiz/LoginScreen';
import QuizScreen from '@/components/quiz/QuizScreen';
import ResultScreen from '@/components/quiz/ResultScreen';
import SecurityOverlay from '@/components/quiz/SecurityOverlay';
import { AlertModal, TeacherCodeModal } from '@/components/quiz/AlertModal';

const HERO_URL = 'https://media.base44.com/images/public/6abb52435e4800b8582e545c/59917e705_generated_31e52d8c.jpg';
const SHEETDB_URL = 'https://sheetdb.io/api/v1/1udcjvrvkr4sh';
const ATTEMPTS_KEY = 'student_attempts';
const TEACHER_CODE = '1984';

export default function QuizApp() {
  const [banks, setBanks] = useState(null);
  const [banksError, setBanksError] = useState(false);
  const [screen, setScreen] = useState('login'); // login | quiz | result
  const [student, setStudent] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);

  const [alert, setAlert] = useState({ open: false });
  const [teacherModal, setTeacherModal] = useState(false);
  const [security, setSecurity] = useState({ open: false, warningsLeft: 3 });

  const warningCount = useRef(0);
  const isSubmitting = useRef(false);
  const alarmCtx = useRef(null);
  const alarmOsc = useRef(null);
  const pendingStudent = useRef(null);

  // load banks once
  useEffect(() => {
    loadQuestionBanks().then(setBanks).catch(() => setBanksError(true));
  }, []);

  // alarm sound (WebAudio beep)
  const startAlarm = useCallback(() => {
    try {
      if (!alarmCtx.current) alarmCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = alarmCtx.current;
      if (ctx.state === 'suspended') ctx.resume();
      stopAlarm();
      // Loud continuous siren — all pulsing is done inside WebAudio (audio-rate LFO),
      // so it keeps sounding even while the page/tab is hidden (no setInterval throttling).
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 880;
      const gain = ctx.createGain();
      gain.gain.value = 0.2;
      // volume LFO: pulses 0 → 0.4 (loud) 4 times per second
      const volLfo = ctx.createOscillator();
      volLfo.type = 'square';
      volLfo.frequency.value = 4;
      const volDepth = ctx.createGain();
      volDepth.gain.value = 0.2;
      volLfo.connect(volDepth).connect(gain.gain);
      // pitch LFO: wails between ~660 and ~1100 Hz
      const pitchLfo = ctx.createOscillator();
      pitchLfo.type = 'sine';
      pitchLfo.frequency.value = 2;
      const pitchDepth = ctx.createGain();
      pitchDepth.gain.value = 220;
      pitchLfo.connect(pitchDepth).connect(osc.frequency);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      volLfo.start();
      pitchLfo.start();
      alarmOsc.current = { osc, volLfo, pitchLfo };
    } catch (e) {
      /* audio not available */
    }
  }, []);

  const stopAlarm = useCallback(() => {
    if (alarmOsc.current) {
      ['osc', 'volLfo', 'pitchLfo'].forEach((k) => {
        try {
          alarmOsc.current[k].stop();
        } catch (e) {
          /* ignore */
        }
      });
      alarmOsc.current = null;
    }
  }, []);

  const showAlert = useCallback((title, message, onConfirm) => {
    setAlert({ open: true, title, message, onConfirm });
  }, []);

  // security monitoring (only during quiz)
  useEffect(() => {
    if (screen !== 'quiz') return;
    const trigger = () => {
      if (isSubmitting.current) return;
      warningCount.current += 1;
      startAlarm();
      if (warningCount.current >= 3) {
        setSecurity({ open: true, warningsLeft: 0 });
        showAlert('إقصاء', 'تم تسليم الاختبار تلقائياً بسبب تكرار مغادرة نافذة الاختبار!');
        handleSubmit(true);
      } else {
        setSecurity({ open: true, warningsLeft: 3 - warningCount.current });
      }
    };
    const onVis = () => document.hidden && trigger();
    const onBlur = () => trigger();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const closeSecurity = useCallback(() => {
    stopAlarm();
    setSecurity({ open: false, warningsLeft: 3 - warningCount.current });
  }, [stopAlarm]);

  const beginExam = useCallback(
    (info) => {
      if (!banks) return;
      const exam = buildExam(banks, info.grade, info.track, info.id);
      setStudent(info);
      setQuestions(exam);
      setAnswers({});
      warningCount.current = 0;
      isSubmitting.current = false;
      setScreen('quiz');
      window.scrollTo({ top: 0 });
    },
    [banks]
  );

  const handleStart = useCallback(
    (info) => {
      if (!info.name || !info.id || !info.grade || !info.track || !info.section) {
        showAlert('تنبيه', 'الرجاء إدخال كافة البيانات المطلوبة بدقة.');
        return;
      }
      pendingStudent.current = info;
      const attempts = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}');
      if ((attempts[info.id] || 0) >= 1) {
        setTeacherModal(true);
        return;
      }
      attempts[info.id] = 1;
      localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
      beginExam(info);
    },
    [beginExam, showAlert]
  );

  const verifyTeacherCode = useCallback(
    (code) => {
      if (String(code).trim() === TEACHER_CODE) {
        setTeacherModal(false);
        const info = pendingStudent.current;
        const attempts = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}');
        attempts[info.id] = 1;
        localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
        showAlert('نجاح', 'تم قبول كود المعلم بنجاح. يمكنك بدء المحاولة الآن.');
        beginExam(info);
      } else {
        showAlert('خطأ', 'كود المعلم غير صحيح!');
      }
    },
    [beginExam, showAlert]
  );

  const handleAnswer = useCallback((idx, optIdx) => {
    setAnswers((a) => ({ ...a, [idx]: optIdx }));
  }, []);

  const handleSubmit = useCallback(
    (auto = false) => {
      if (isSubmitting.current) return;
      isSubmitting.current = true;
      stopAlarm();
      setSecurity({ open: false, warningsLeft: 3 });

      let score = 0;
      if (!auto) {
        questions.forEach((q, idx) => {
          if (answers[idx] !== undefined && parseInt(answers[idx], 10) === q.answer) score++;
        });
      }
      const total = questions.length;
      const submissionTime = new Date().toLocaleString('ar-AE');

      // save to Google Sheet (best-effort, mirrors original)
      if (student) {
        fetch(SHEETDB_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: {
              name: student.name,
              id: student.id,
              grade: student.grade,
              track: student.track,
              section: student.section,
              score,
              time: submissionTime
            }
          })
        }).catch(() => {});

        // save the full detailed result for the teacher's admin panel (best-effort)
        base44.entities.ExamResult.create({
          student_name: student.name,
          student_number: student.id,
          grade: student.grade,
          track: student.track,
          section: student.section,
          score,
          total,
          percentage: total ? (score / total) * 100 : 0,
          answers_json: JSON.stringify(answers),
          submission_time: submissionTime,
          is_other: !!student.isOther,
          is_perfect: total > 0 && score === total
        }).catch((e) => console.error('ExamResult save failed:', e));
      }

      setResult({ score, total, submissionTime });
      setScreen('result');
      window.scrollTo({ top: 0 });
    },
    [questions, answers, student, stopAlarm]
  );

  const restart = useCallback(() => {
    setScreen('login');
    setStudent(null);
    setQuestions([]);
    setAnswers({});
    setResult(null);
    warningCount.current = 0;
    isSubmitting.current = false;
  }, []);

  if (banksError) {
    return (
      <div className="molecular-app">
        <div className="mol-wrap max-w-md mx-auto px-4 py-24 text-center">
          <div className="mol-card p-8">
            <h2 className="text-xl font-extrabold mb-2" style={{ color: 'var(--mol-red)' }}>تعذر تحميل بنك الأسئلة</h2>
            <p className="font-bold" style={{ color: 'var(--mol-muted)' }}>تحقق من الاتصال بالإنترنت ثم أعد تحميل الصفحة.</p>
            <button className="mol-btn mol-btn-primary mt-5 px-6 py-2.5" onClick={() => window.location.reload()}>
              إعادة المحاولة
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="molecular-app min-h-screen">
      {!banks && screen === 'login' && (
        <div className="mol-wrap min-h-[60vh] flex items-center justify-center">
          <div className="flex items-center gap-3 font-extrabold" style={{ color: 'var(--mol-muted)' }}>
            <Loader2 className="animate-spin" size={22} /> جاري تجهيز المختبر…
          </div>
        </div>
      )}

      {banks && screen === 'login' && (
        <LoginScreen heroUrl={HERO_URL} onStart={handleStart} />
      )}

      {screen === 'quiz' && banks && (
        <QuizScreen
          student={student}
          questions={questions}
          answers={answers}
          onAnswer={handleAnswer}
          onSubmit={handleSubmit}
          onAlert={showAlert}
        />
      )}

      {screen === 'result' && result && (
        <ResultScreen
          student={student}
          score={result.score}
          total={result.total}
          submissionTime={result.submissionTime}
          questions={questions}
          answers={answers}
          onPrint={() => window.print()}
          onRestart={restart}
        />
      )}

      <AlertModal
        open={alert.open}
        title={alert.title}
        message={alert.message}
        onClose={() => setAlert({ open: false })}
        onConfirm={alert.onConfirm}
        confirmLabel="تأكيد التسليم"
      />
      <TeacherCodeModal
        open={teacherModal}
        onClose={() => setTeacherModal(false)}
        onSubmit={verifyTeacherCode}
      />
      {security.open && (
        <SecurityOverlay warningsLeft={security.warningsLeft} onClose={closeSecurity} />
      )}
    </div>
  );
}