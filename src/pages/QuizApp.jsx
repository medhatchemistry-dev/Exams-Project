import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, hasTeacherRole } from '@/api/supabaseClient';
import { loadQuestionBanks } from '@/lib/quizBanks';
import { buildExam, selectExamBank } from '@/lib/examExecution';
import LoginScreen from '@/components/quiz/LoginScreen';
import QuizScreen from '@/components/quiz/QuizScreen';
import ResultScreen from '@/components/quiz/ResultScreen';
import SecurityOverlay from '@/components/quiz/SecurityOverlay';
import { AlertModal, TeacherCodeModal } from '@/components/quiz/AlertModal';
import ExamCodeScreen from '@/components/quiz/ExamCodeScreen';

const ATTEMPTS_KEY = 'student_attempts';

function readAttempts() {
  try {
    const attempts = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}');
    return attempts && typeof attempts === 'object' ? attempts : {};
  } catch {
    return {};
  }
}

export default function QuizApp() {
  const [banks, setBanks] = useState(null);
  const [banksError, setBanksError] = useState(false);
  const [screen, setScreen] = useState('access'); // access | login | quiz | result
  const [student, setStudent] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [validatedExam, setValidatedExam] = useState(null);

  const [alert, setAlert] = useState({ open: false, title: '', message: '', onConfirm: undefined });
  const [teacherModal, setTeacherModal] = useState(false);
  const [security, setSecurity] = useState({ open: false, warningsLeft: 3 });

  const warningCount = useRef(0);
  const isSubmitting = useRef(false);
  const alarmCtx = useRef(null);
  const alarmOsc = useRef(null);
  const pendingStudent = useRef(null);
  const [accessCode, setAccessCode] = useState('');

  // alarm sound (WebAudio beep)
  const startAlarm = useCallback(() => {
    try {
      if (!alarmCtx.current) {
        const AudioContextConstructor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
        alarmCtx.current = new AudioContextConstructor();
      }
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

  const validateExamCode = useCallback(async (code) => {
    const { data, error } = await supabase.functions.invoke('validate-exam-code', { body: { code } });
    if (error) throw error;
    if (data?.valid) {
      if (data.legacy) {
        try {
          setBanks(await loadQuestionBanks());
          setBanksError(false);
        } catch (bankError) {
          console.error('Legacy question bank load failed:', bankError);
          setBanksError(true);
          throw new Error('تعذر تحميل بنك الأسئلة الحالي.');
        }
      } else {
        setBanks(null);
        setBanksError(false);
      }
      setAccessCode(code);
      setValidatedExam(data);
      setScreen('login');
    }
    return Boolean(data?.valid);
  }, []);

  const isExamCodeActive = useCallback(async () => {
    if (!accessCode) return false;
    try {
      const { data, error } = await supabase.functions.invoke('validate-exam-code', { body: { code: accessCode } });
      if (error) throw error;
      if (data?.valid) setValidatedExam(data);
      return Boolean(data?.valid);
    } catch (error) {
      console.error('Active exam code check failed:', error);
      return false;
    }
  }, [accessCode]);

  useEffect(() => {
    if (screen !== 'quiz') return undefined;

    let checking = false;
    const checkAccess = async () => {
      if (checking || isSubmitting.current) return;
      checking = true;
      const stillActive = await isExamCodeActive();
      checking = false;
      if (stillActive || isSubmitting.current) return;

      stopAlarm();
      isSubmitting.current = false;
      setSecurity({ open: false, warningsLeft: 3 });
      setScreen('access');
      setStudent(null);
      setQuestions([]);
      setAnswers({});
      setAccessCode('');
      showAlert('انتهت صلاحية الرمز', 'أوقف المعلم الاختبار أو انتهت صلاحية الرمز. لم يتم حفظ هذه المحاولة.');
    };

    const interval = window.setInterval(checkAccess, 15000);
    return () => window.clearInterval(interval);
  }, [screen, isExamCodeActive, showAlert, stopAlarm]);

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
    async (info) => {
      if (validatedExam?.legacy && !banks) return;
      if (!await isExamCodeActive()) {
        setScreen('access');
        showAlert('انتهت صلاحية الرمز', 'أوقف المعلم الاختبار أو انتهت صلاحية الرمز. اطلب رمزاً صالحاً للمتابعة.');
        return;
      }
      let selectedBank;
      try {
        selectedBank = selectExamBank(validatedExam, info.grade, info.track, banks || {}, { exposeAnswers: Boolean(validatedExam?.legacy) });
      } catch (error) {
        showAlert('الصف غير متاح في هذا الاختبار', error.message);
        return;
      }
      const exam = buildExam({ [selectedBank.bankKey]: selectedBank.questions }, info.grade, info.track, info.id, {
        examId: selectedBank.examId,
        legacy: Boolean(validatedExam?.legacy),
      });
      setStudent(info);
      setQuestions(exam);
      setAnswers({});
      warningCount.current = 0;
      isSubmitting.current = false;
      setScreen('quiz');
      window.scrollTo({ top: 0 });
    },
    [banks, isExamCodeActive, showAlert, validatedExam]
  );

  const handleStart = useCallback(
    (info) => {
      if (!info.name || !info.id || !info.grade || !info.track || !info.section) {
        showAlert('تنبيه', 'الرجاء إدخال كافة البيانات المطلوبة بدقة.');
        return;
      }
      pendingStudent.current = info;
      const attempts = readAttempts();
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
    async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && await hasTeacherRole(user.id)) {
        setTeacherModal(false);
        const info = pendingStudent.current;
        const attempts = readAttempts();
        attempts[info.id] = 1;
        localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
        showAlert('نجاح', 'تم السماح بمحاولة إضافية بواسطة المعلم. يمكنك بدء المحاولة الآن.');
        beginExam(info);
      } else {
        showAlert('يلزم تسجيل دخول المعلم', 'سجّل الدخول بحساب المعلم المصرّح به من صفحة الإدارة، ثم أعد المحاولة.');
      }
    },
    [beginExam, showAlert]
  );

  const handleAnswer = useCallback((idx, optIdx) => {
    setAnswers((a) => ({ ...a, [idx]: optIdx }));
  }, []);

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (isSubmitting.current) return;
      if (!await isExamCodeActive()) {
        isSubmitting.current = false;
        setScreen('access');
        setStudent(null);
        setQuestions([]);
        setAnswers({});
        setAccessCode('');
        showAlert('انتهت صلاحية الرمز', 'أوقف المعلم الاختبار أو انتهت صلاحية الرمز. لم يتم حفظ هذه المحاولة.');
        return;
      }
      isSubmitting.current = true;
      stopAlarm();
      setSecurity({ open: false, warningsLeft: 3 });

      const submissionTime = new Date().toLocaleString('ar-AE');
      let score = 0;
      let total = questions.length;
      let finalQuestions = questions;

      if (student) {
        if (validatedExam?.legacy) {
          if (!auto) {
            questions.forEach((question, index) => {
              if (answers[index] !== undefined && Number.parseInt(answers[index], 10) === question.answer) score++;
            });
          }
          const { error } = await supabase.from('exam_results').insert({
            student_name: student.name,
            student_number: student.id,
            grade: student.grade,
            track: student.track,
            section: student.section,
            score,
            total,
            answers_json: answers,
            exam_id: null,
            exam_title_snapshot: 'الاختبار الحالي',
            questions_json: questions,
            submission_time: submissionTime,
            is_other: !!student.isOther,
          });
          if (error) {
            console.error('Exam result save failed:', error);
            isSubmitting.current = false;
            showAlert('تعذر حفظ النتيجة', 'لم نتمكن من حفظ إجابتك. تحقق من اتصال الإنترنت ثم أعد الإرسال.');
            return;
          }
        } else {
          const { data, error } = await supabase.functions.invoke('validate-exam-code', {
            body: {
              action: 'submit',
              code: accessCode,
              student,
              answers,
              questions,
              submissionTime,
              isAuto: auto,
            },
          });
          if (error || !data?.submitted) {
            console.error('Imported exam submission failed:', error || data?.error);
            isSubmitting.current = false;
            showAlert('تعذر حفظ النتيجة', 'لم نتمكن من حفظ إجابتك. تحقق من اتصال الإنترنت ثم أعد الإرسال.');
            return;
          }
          score = data.score;
          total = data.total;
          finalQuestions = data.questions;
        }
      }

      setQuestions(finalQuestions);
      setResult({ score, total, submissionTime, examTitle: validatedExam?.legacy ? 'الاختبار الحالي' : validatedExam?.examTitle || 'الاختبار' });
      setScreen('result');
      window.scrollTo({ top: 0 });
    },
    [questions, answers, student, stopAlarm, showAlert, isExamCodeActive, validatedExam, accessCode]
  );

  const restart = useCallback(() => {
    setScreen('access');
    setAccessCode('');
    setValidatedExam(null);
    setStudent(null);
    setQuestions([]);
    setAnswers({});
    setResult(null);
    warningCount.current = 0;
    isSubmitting.current = false;
  }, []);

  if (banksError && validatedExam?.legacy) {
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
      {!banks && screen === 'login' && validatedExam?.legacy && (
        <div className="mol-wrap min-h-[60vh] flex items-center justify-center">
          <div className="flex items-center gap-3 font-extrabold" style={{ color: 'var(--mol-muted)' }}>
            <Loader2 className="animate-spin" size={22} /> جاري تجهيز المختبر…
          </div>
        </div>
      )}

      {screen === 'access' && <ExamCodeScreen onContinue={validateExamCode} />}

      {screen === 'login' && (validatedExam?.legacy ? Boolean(banks) : Boolean(validatedExam?.banks)) && (
        <LoginScreen onStart={handleStart} />
      )}

      {screen === 'quiz' && (validatedExam?.legacy ? Boolean(banks) : Boolean(validatedExam?.banks)) && (
        <QuizScreen
          student={student}
          examTitle={validatedExam?.examTitle}
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
          examTitle={result.examTitle}
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
        onClose={() => setAlert({ open: false, title: '', message: '', onConfirm: undefined })}
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
