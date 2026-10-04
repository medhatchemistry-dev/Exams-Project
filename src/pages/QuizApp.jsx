import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, hasTeacherRole } from '@/api/supabaseClient';
import { buildExam, selectExamBank } from '@/lib/examExecution';
import LoginScreen from '@/components/quiz/LoginScreen';
import QuizScreen from '@/components/quiz/QuizScreen';
import ResultScreen from '@/components/quiz/ResultScreen';
import SecurityOverlay from '@/components/quiz/SecurityOverlay';
import TeacherReentryDialog from '@/components/quiz/TeacherReentryDialog';
import { AlertModal, TeacherCodeModal } from '@/components/quiz/AlertModal';
import ExamCodeScreen from '@/components/quiz/ExamCodeScreen';
import { isDuplicateViolation, nextWarningState } from '@/lib/examSecurity';

const ATTEMPTS_KEY = 'student_attempts';

function readAttempts() {
  try {
    const attempts = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}');
    return attempts && typeof attempts === 'object' ? attempts : {};
  } catch {
    return {};
  }
}

async function getEdgeFunctionErrorMessage(error) {
  const response = error?.context;
  if (!(response instanceof Response)) return null;

  try {
    const payload = await response.clone().json();
    return typeof payload?.error === 'string' ? payload.error : null;
  } catch {
    return null;
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
  const [attemptId, setAttemptId] = useState(null);
  const [attemptLocked, setAttemptLocked] = useState(false);
  const [examPaused, setExamPaused] = useState(false);
  const [attemptUnavailable, setAttemptUnavailable] = useState(false);
  const [browserCapabilities, setBrowserCapabilities] = useState({ fullscreen: null, audio: null });

  const warningCount = useRef(0);
  const isSubmitting = useRef(false);
  const alarmCtx = useRef(null);
  const alarmOsc = useRef(null);
  const pendingStudent = useRef(null);
  const lastViolationAt = useRef(null);
  const pendingViolationSignal = useRef(null);
  const audioStartPromise = useRef(null);
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
        if (!data.banks || typeof data.banks !== 'object') {
          setBanksError(true);
          throw new Error('تعذر تحميل بنك الأسئلة الحالي.');
        }
        setBanks(data.banks);
        setBanksError(false);
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
      const { data, error } = await supabase.functions.invoke('validate-exam-code', { body: { action: 'check', code: accessCode } });
      if (error) throw error;
      return Boolean(data?.valid);
    } catch (error) {
      console.error('Active exam code check failed:', error);
      return false;
    }
  }, [accessCode]);

  const recordAttemptEvent = useCallback(async (event, details = {}) => {
    if (!attemptId) return null;
    const { data, error } = await supabase.functions.invoke('validate-exam-code', {
      body: { action: 'event', code: accessCode, attemptId, event, details },
    });
    if (error) throw error;
    return data;
  }, [accessCode, attemptId]);

  const startBrowserCapabilities = useCallback(() => {
    let fullscreenPromise;
    try {
      if (document.fullscreenElement) fullscreenPromise = Promise.resolve(true);
      else if (document.documentElement.requestFullscreen) {
        fullscreenPromise = document.documentElement.requestFullscreen().then(() => true).catch(() => false);
      } else fullscreenPromise = Promise.resolve(false);
    } catch {
      fullscreenPromise = Promise.resolve(false);
    }

    try {
      if (!alarmCtx.current) {
        const AudioContextConstructor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
        if (AudioContextConstructor) alarmCtx.current = new AudioContextConstructor();
      }
      audioStartPromise.current = alarmCtx.current
        ? Promise.resolve(alarmCtx.current.resume()).then(() => alarmCtx.current.state === 'running').catch(() => false)
        : Promise.resolve(false);
    } catch {
      audioStartPromise.current = Promise.resolve(false);
    }

    fullscreenPromise.then((fullscreen) => setBrowserCapabilities((current) => ({ ...current, fullscreen })));
    audioStartPromise.current.then((audio) => setBrowserCapabilities((current) => ({ ...current, audio })));
  }, []);

  useEffect(() => {
    if (screen !== 'quiz') return undefined;

    let checking = false;
    const checkAccess = async () => {
      if (checking || isSubmitting.current) return;
      checking = true;
      if (attemptId) {
        try {
          const { data, error } = await supabase.functions.invoke('validate-exam-code', {
            body: { action: 'attempt-state', code: accessCode, attemptId },
          });
          if (error) throw error;
          if (!data?.found) {
            checking = false;
            setAttemptUnavailable(true);
            return;
          }
          let recoveredWarningCount = null;
          if (pendingViolationSignal.current) {
            const signal = pendingViolationSignal.current;
            const { data: eventData, error: eventError } = await supabase.functions.invoke('validate-exam-code', {
              body: { action: 'event', code: accessCode, attemptId, event: 'warning', details: { signal } },
            });
            if (!eventError && eventData?.recorded) {
              pendingViolationSignal.current = null;
              warningCount.current = eventData.warningCount;
              recoveredWarningCount = eventData.warningCount;
              if (eventData.warningCount >= 3) setAttemptLocked(true);
              else setSecurity({ open: true, warningsLeft: 3 - eventData.warningCount });
            }
          }
          const paused = data.examStatus === 'paused';
          const active = data.examStatus === 'available' && data.codeValid && !data.completed;
          setExamPaused(paused);
          setAttemptLocked(Boolean(data.locked) || recoveredWarningCount >= 3);
          setAttemptUnavailable(Boolean(pendingViolationSignal.current) || (!paused && !active && !data.locked));
          checking = false;
          return;
        } catch (error) {
          checking = false;
          console.error('Exam attempt state check failed:', error);
          return;
        }
      }
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
  }, [screen, isExamCodeActive, showAlert, stopAlarm, attemptId, accessCode]);

  // security monitoring (only during quiz)
  useEffect(() => {
    if (screen !== 'quiz') return;
    const trigger = async (signal) => {
      if (isSubmitting.current) return;
      const now = Date.now();
      if (isDuplicateViolation(lastViolationAt.current, now)) return;
      lastViolationAt.current = now;
      let nextCount;
      if (attemptId) {
        try {
          const data = await recordAttemptEvent('warning', { signal });
          nextCount = data.warningCount;
        } catch (error) {
          console.error('Could not record exam security event:', error);
          pendingViolationSignal.current = signal;
          setAttemptUnavailable(true);
          showAlert('تعذر تسجيل التنبيه', 'تم إيقاف الإجابة مؤقتاً حتى نتمكن من التحقق من حالة المحاولة.');
          return;
        }
      } else {
        nextCount = nextWarningState(warningCount.current).warningCount;
      }
      warningCount.current = nextCount;
      startAlarm();
      if (nextCount >= 3 && attemptId) {
        setAttemptLocked(true);
        stopAlarm();
      } else if (nextCount >= 3) {
        setSecurity({ open: true, warningsLeft: 0 });
        showAlert('إقصاء', 'تم تسليم الاختبار تلقائياً بسبب تكرار مغادرة نافذة الاختبار!');
        handleSubmit(true);
      } else {
        setSecurity({ open: true, warningsLeft: 3 - nextCount });
      }
    };
    const onVis = () => document.hidden && trigger('tab_hidden');
    const onBlur = () => trigger('window_blur');
    const onFullscreen = () => !document.fullscreenElement && trigger('fullscreen_exit');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, attemptId, recordAttemptEvent, showAlert, startAlarm, stopAlarm]);

  const closeSecurity = useCallback(() => {
    stopAlarm();
    setSecurity({ open: false, warningsLeft: 3 - warningCount.current });
  }, [stopAlarm]);

  const beginExam = useCallback(
    async (info) => {
      if (validatedExam?.legacy && !banks) return;
      if (validatedExam?.targetGrade && (
        info.grade !== validatedExam.targetGrade
        || info.track !== validatedExam.targetTrack
        || info.section !== validatedExam.targetSection
      )) {
        showAlert('هذا الاختبار مخصص لشعبة أخرى', `الاختبار مخصص للصف ${validatedExam.targetGrade} · ${validatedExam.targetTrack} · شعبة ${validatedExam.targetSection}.`);
        return;
      }
      if (!await isExamCodeActive()) {
        setScreen('access');
        showAlert('انتهت صلاحية الرمز', 'أوقف المعلم الاختبار أو انتهت صلاحية الرمز. اطلب رمزاً صالحاً للمتابعة.');
        return;
      }
      let selectedBank;
      try {
        selectedBank = selectExamBank(validatedExam, info.grade, info.track, banks || {});
      } catch (error) {
        showAlert('الصف غير متاح في هذا الاختبار', error.message);
        return;
      }
      const exam = buildExam({ [selectedBank.bankKey]: selectedBank.questions }, info.grade, info.track, info.id, {
        examId: selectedBank.examId,
        legacy: Boolean(validatedExam?.legacy),
      });
      let startedAttemptId = null;
      if (!validatedExam?.legacy) {
        const { data, error } = await supabase.functions.invoke('validate-exam-code', {
          body: { action: 'start', code: accessCode, student: info, questions: exam },
        });
        if (error || !data?.started) {
          const serverMessage = await getEdgeFunctionErrorMessage(error);
          console.error('Exam attempt start failed:', {
            errorName: error?.name,
            errorMessage: error?.message,
            status: error?.context?.status,
            serverMessage,
          });
          if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen().catch(() => {});
          }
          const backendMessage = data?.error || serverMessage;
          const unsupportedStartMessage = !error && data?.valid
            ? 'الخادم المتصل بهذا الموقع لا يدعم بدء المحاولات بعد. تحقق من ربط معاينة master بمشروع Supabase الخاص بـ master ثم أعد نشرها.'
            : null;
          showAlert('تعذر بدء المحاولة', backendMessage || unsupportedStartMessage || 'تعذر تسجيل بدء الاختبار. تحقق من الاتصال ثم أعد المحاولة.');
          return;
        }
        startedAttemptId = data.attemptId;
        const audioReady = await audioStartPromise.current;
        if (!audioReady) {
          const { error: eventError } = await supabase.functions.invoke('validate-exam-code', {
            body: { action: 'event', code: accessCode, attemptId: startedAttemptId, event: 'audio_unavailable' },
          });
          if (eventError) console.error('Could not record unavailable audio:', eventError);
        }
      }
      setAttemptId(startedAttemptId);
      setAttemptLocked(false);
      setExamPaused(false);
      setAttemptUnavailable(false);
      lastViolationAt.current = null;
      const attempts = readAttempts();
      attempts[info.id] = 1;
      localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
      setStudent(info);
      setQuestions(exam);
      setAnswers({});
      warningCount.current = 0;
      isSubmitting.current = false;
      setScreen('quiz');
      window.scrollTo({ top: 0 });
    },
    [banks, isExamCodeActive, showAlert, validatedExam, accessCode]
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
      startBrowserCapabilities();
      beginExam(info);
    },
    [beginExam, showAlert, startBrowserCapabilities]
  );

  const verifyTeacherCode = useCallback(
    async () => {
      startBrowserCapabilities();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && await hasTeacherRole(user.id)) {
        setTeacherModal(false);
        const info = pendingStudent.current;
        showAlert('نجاح', 'تم السماح بمحاولة إضافية بواسطة المعلم. يمكنك بدء المحاولة الآن.');
        beginExam(info);
      } else {
        showAlert('يلزم تسجيل دخول المعلم', 'سجّل الدخول بحساب المعلم المصرّح به من صفحة الإدارة، ثم أعد المحاولة.');
      }
    },
    [beginExam, showAlert, startBrowserCapabilities]
  );

  const handleAnswer = useCallback((idx, optIdx) => {
    if (attemptLocked || examPaused || attemptUnavailable) return;
    setAnswers((a) => ({ ...a, [idx]: optIdx }));
  }, [attemptLocked, examPaused, attemptUnavailable]);

  const handleTeacherReentry = useCallback(async (password) => {
    const { data, error } = await supabase.functions.invoke('verify-exam-reentry', {
      body: { attemptId, password },
    });
    if (error || !data?.unlocked) throw error || new Error(data?.error || 'Unlock rejected');
    setAttemptLocked(false);
    setAttemptUnavailable(false);
    setExamPaused(false);
    warningCount.current = data.warningCount ?? warningCount.current;
  }, [attemptId]);

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (isSubmitting.current || attemptLocked || examPaused || attemptUnavailable) return;
      let canSubmit = await isExamCodeActive();
      if (attemptId) {
        try {
          const { data, error } = await supabase.functions.invoke('validate-exam-code', {
            body: { action: 'attempt-state', code: accessCode, attemptId },
          });
          if (error) throw error;
          canSubmit = data?.examStatus === 'available' && data?.codeValid && !data?.locked && !data?.completed;
          setAttemptLocked(Boolean(data?.locked));
          setExamPaused(data?.examStatus === 'paused');
          setAttemptUnavailable(!canSubmit && data?.examStatus !== 'paused' && !data?.locked);
        } catch (error) {
          console.error('Could not verify attempt before submission:', error);
          canSubmit = false;
          setAttemptUnavailable(true);
        }
      }
      if (!canSubmit) {
        if (!attemptId) {
        isSubmitting.current = false;
        setScreen('access');
        setStudent(null);
        setQuestions([]);
        setAnswers({});
        setAccessCode('');
        showAlert('انتهت صلاحية الرمز', 'أوقف المعلم الاختبار أو انتهت صلاحية الرمز. لم يتم حفظ هذه المحاولة.');
        }
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
        const { data, error } = await supabase.functions.invoke('validate-exam-code', {
          body: {
            action: 'submit',
            code: accessCode,
            student,
            answers,
            questions,
            submissionTime,
            isAuto: auto,
            attemptId,
          },
        });
        if (error || !data?.submitted) {
          console.error('Exam submission failed:', error || data?.error);
          isSubmitting.current = false;
          showAlert('تعذر حفظ النتيجة', 'لم نتمكن من حفظ إجابتك. تحقق من اتصال الإنترنت ثم أعد الإرسال.');
          return;
        }
        score = data.score;
        total = data.total;
        finalQuestions = data.questions || questions;
      }

      setQuestions(finalQuestions);
      setResult({ score, total, submissionTime, isLegacy: Boolean(validatedExam?.legacy), examTitle: validatedExam?.legacy ? 'الاختبار الحالي' : validatedExam?.examTitle || 'الاختبار', certificateTemplateId: validatedExam?.certificateTemplateId || 1 });
      setScreen('result');
      window.scrollTo({ top: 0 });
    },
    [questions, answers, student, stopAlarm, showAlert, isExamCodeActive, validatedExam, accessCode, attemptId, attemptLocked, examPaused, attemptUnavailable]
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
    setAttemptId(null);
    setAttemptLocked(false);
    setExamPaused(false);
    setAttemptUnavailable(false);
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
    <LoginScreen
      onStart={handleStart}
      targetClass={validatedExam?.targetGrade ? {
        grade: validatedExam.targetGrade,
        track: validatedExam.targetTrack,
        section: validatedExam.targetSection,
      } : null}
    />
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
          paused={examPaused}
          locked={attemptLocked}
          unavailable={attemptUnavailable}
          browserCapabilities={browserCapabilities}
          onRetryCapabilities={startBrowserCapabilities}
        />
      )}

      {screen === 'result' && result && (
        <ResultScreen
          student={student}
          examTitle={result.examTitle}
          certificateTemplateId={result.certificateTemplateId}
          score={result.score}
          total={result.total}
          submissionTime={result.submissionTime}
          questions={questions}
          answers={answers}
          isLegacy={result.isLegacy}
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
      {attemptLocked && !examPaused && <TeacherReentryDialog onSubmit={handleTeacherReentry} />}
    </div>
  );
}
