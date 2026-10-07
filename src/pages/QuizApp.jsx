import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase, hasTeacherPermission } from '@/api/supabaseClient';
import { buildExam } from '@/lib/examExecution';
import LoginScreen from '@/components/quiz/LoginScreen';
import QuizScreen from '@/components/quiz/QuizScreen';
import ResultScreen from '@/components/quiz/ResultScreen';
import SecurityOverlay from '@/components/quiz/SecurityOverlay';
import TeacherReentryDialog from '@/components/quiz/TeacherReentryDialog';
import { AlertModal, TeacherCodeModal } from '@/components/quiz/AlertModal';
import ExamCodeScreen from '@/components/quiz/ExamCodeScreen';
import ExamAudioGate from '@/components/quiz/ExamAudioGate';
import { isDuplicateViolation, nextWarningState } from '@/lib/examSecurity';

const ATTEMPTS_KEY = 'student_attempts';
const ACTIVE_ATTEMPTS_KEY = 'student_active_attempts';

function readLocalObject(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}

function attemptDraftKey(examId, studentId, currentAttemptId) {
  return `exam_draft_${examId}_${studentId}_${currentAttemptId}`;
}

async function hashDeviceToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
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
  const [attemptDeviceToken, setAttemptDeviceToken] = useState('');
  const [attemptDurationMinutes, setAttemptDurationMinutes] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [attemptExamTitle, setAttemptExamTitle] = useState('');
  const [attemptLocked, setAttemptLocked] = useState(false);
  const [examPaused, setExamPaused] = useState(false);
  const [attemptUnavailable, setAttemptUnavailable] = useState(false);
  const [browserCapabilities, setBrowserCapabilities] = useState({ fullscreen: null, audio: null });
  const [audioHeard, setAudioHeard] = useState(false);
  const [audioGateError, setAudioGateError] = useState('');

  const warningCount = useRef(0);
  const isSubmitting = useRef(false);
  const alarmCtx = useRef(null);
  const alarmOsc = useRef(null);
  const pendingStudent = useRef(null);
  const pendingDeviceRecovery = useRef(false);
  const lastViolationAt = useRef(null);
  const pendingViolationSignal = useRef(null);
  const audioStartPromise = useRef(null);
  const answerSaveQueue = useRef(Promise.resolve());
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
    const { data, error } = await supabase.functions.invoke('validate-exam-code', { body: { action: 'validate', code } });
    if (error) throw error;
    if (data?.valid) {
      setBanks(null);
      setBanksError(false);
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

  const startBrowserAudio = useCallback(async () => {
    try {
      if (!alarmCtx.current) {
        const AudioContextConstructor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
        if (AudioContextConstructor) alarmCtx.current = new AudioContextConstructor();
      }
      audioStartPromise.current = alarmCtx.current
        ? Promise.resolve(alarmCtx.current.resume()).then(() => {
          if (alarmCtx.current?.state !== 'running') return false;
          const oscillator = alarmCtx.current.createOscillator();
          const gain = alarmCtx.current.createGain();
          gain.gain.value = 0.04;
          oscillator.frequency.value = 660;
          oscillator.connect(gain).connect(alarmCtx.current.destination);
          oscillator.start();
          oscillator.stop(alarmCtx.current.currentTime + 0.12);
          return true;
        }).catch(() => false)
        : Promise.resolve(false);
    } catch {
      audioStartPromise.current = Promise.resolve(false);
    }
    const audio = await audioStartPromise.current;
    setBrowserCapabilities((current) => ({ ...current, audio }));
    return audio;
  }, []);

  const requestExamFullscreen = useCallback(async () => {
    let fullscreen = false;
    try {
      if (document.fullscreenElement) fullscreen = true;
      else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        fullscreen = Boolean(document.fullscreenElement);
      }
    } catch {
      fullscreen = false;
    }
    setBrowserCapabilities((current) => ({ ...current, fullscreen }));
    return fullscreen;
  }, []);

  const startBrowserCapabilities = useCallback(async () => {
    const audio = await startBrowserAudio();
    if (!audio) return false;
    return requestExamFullscreen();
  }, [requestExamFullscreen, startBrowserAudio]);

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
          if (data.closed) {
            const activeAttempts = readLocalObject(ACTIVE_ATTEMPTS_KEY);
            const attemptKey = `${validatedExam?.examId}:${student?.id}`;
            delete activeAttempts[attemptKey];
            localStorage.setItem(ACTIVE_ATTEMPTS_KEY, JSON.stringify(activeAttempts));
            localStorage.removeItem(attemptDraftKey(validatedExam?.examId, student?.id, attemptId));
            setAttemptId(null);
            setAttemptDeviceToken('');
            setStudent(null);
            setQuestions([]);
            setAnswers({});
            setScreen('access');
            setAccessCode('');
            setValidatedExam(null);
            showAlert('أُغلق الاختبار نهائياً', 'أغلق المعلم هذا الاختبار. الإجابات غير المرسلة حُذفت، والنتائج المسلّمة محفوظة.');
            checking = false;
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
          setRemainingSeconds(data.remainingSeconds ?? null);
          setAttemptDurationMinutes(data.durationMinutes ?? null);
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
  }, [screen, isExamCodeActive, showAlert, stopAlarm, attemptId, accessCode, validatedExam, student]);

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
    async (info, recoverDevice = false) => {
      if (!await isExamCodeActive()) {
        setScreen('access');
        showAlert('انتهت صلاحية الرمز', 'أوقف المعلم الاختبار أو انتهت صلاحية الرمز. اطلب رمزاً صالحاً للمتابعة.');
        return;
      }
      let exam = [];
      try {
        const { data: bankData, error: bankError } = await supabase.functions.invoke('validate-exam-code', {
          body: { action: 'bank', code: accessCode, grade: info.grade, track: info.track },
        });
        if (bankError) throw bankError;
        if (!bankData?.valid || !Array.isArray(bankData.questions) || bankData.questions.length === 0) {
          throw new Error(`لا يحتوي الاختبار على أسئلة للصف ${info.grade} والمسار ${info.track}.`);
        }
        const selectedBank = {
          bankKey: bankData.bankKey || `${info.grade}-${info.track}`,
          questions: bankData.questions,
          examId: bankData.examId ?? validatedExam?.examId ?? null,
        };
        exam = buildExam({ [selectedBank.bankKey]: selectedBank.questions }, info.grade, info.track, info.id, {
          examId: selectedBank.examId,
          legacy: Boolean(validatedExam?.legacy),
        });
        setBanks({ [selectedBank.bankKey]: selectedBank.questions });
        setBanksError(false);
      } catch (error) {
        showAlert('الصف غير متاح في هذا الاختبار', error?.message || 'تعذر تحميل بنك الأسئلة.');
        return;
      }
      let startedAttemptId = null;
      let attemptToken = '';
      let attemptQuestions = exam;
      let restoredAnswers = {};
      let attemptPaused = false;
      let attemptIsLocked = false;
      if (!validatedExam?.legacy) {
        const attemptKey = `${validatedExam.examId}:${info.id}`;
        const tokens = readLocalObject('exam_device_tokens');
        attemptToken = typeof tokens[attemptKey] === 'string' ? tokens[attemptKey] : crypto.randomUUID();
        tokens[attemptKey] = attemptToken;
        localStorage.setItem('exam_device_tokens', JSON.stringify(tokens));
        if (recoverDevice) {
          const { error: rebindError } = await supabase.rpc('rebind_exam_attempt_device_for_student', {
            target_exam_id: Number(validatedExam.examId),
            candidate_code: accessCode,
            student_name_input: info.name,
            student_number_input: info.id,
            grade_input: info.grade,
            track_input: info.track,
            section_input: info.section,
            device_token_hash_input: await hashDeviceToken(attemptToken),
          });
          if (rebindError) {
            console.error('Teacher approved attempt recovery failed:', rebindError);
            showAlert('تعذر استعادة المحاولة', 'لم يتم العثور على محاولة نشطة تطابق بيانات الطالب. لم يتم إنشاء محاولة جديدة.');
            return;
          }
        }
        const { data, error } = await supabase.functions.invoke('validate-exam-code', {
          body: { action: 'start', code: accessCode, student: info, questions: exam, deviceToken: attemptToken },
        });
        if (error || !data?.started) {
          console.error('Exam attempt start failed:', {
            category: error?.name || (data?.valid ? 'unsupported_response' : 'unexpected_response'),
            status: error?.context?.status,
          });
          if (data?.error?.includes('another device') || data?.error?.includes('An active attempt already exists')) {
            pendingStudent.current = info;
            pendingDeviceRecovery.current = true;
            setTeacherModal(true);
            return;
          }
          if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen().catch(() => {});
          }
          showAlert('تعذر بدء المحاولة', 'حدثت مشكلة أثناء بدء الاختبار. أعد المحاولة، وإذا استمرت المشكلة فتواصل مع المعلم.');
          return;
        }
        startedAttemptId = data.attemptId;
        attemptQuestions = Array.isArray(data.questions) ? data.questions : exam;
        const draftKey = attemptDraftKey(validatedExam.examId, info.id, startedAttemptId);
        const localDraft = readLocalObject(draftKey);
        const validLocalDraft = Object.fromEntries(Object.entries(localDraft).filter(([questionKey, optionValue]) => {
          const questionIndex = Number(questionKey);
          const optionIndex = Number(optionValue);
          return /^(0|[1-9][0-9]*)$/.test(questionKey)
            && Number.isInteger(questionIndex) && questionIndex >= 0 && questionIndex < attemptQuestions.length
            && Number.isInteger(optionIndex) && optionIndex >= 0
            && optionIndex < attemptQuestions[questionIndex]?.options?.length;
        }).map(([questionKey, optionValue]) => [questionKey, Number(optionValue)]));
        restoredAnswers = { ...(data.answers || {}), ...validLocalDraft };
        if (Object.keys(restoredAnswers).length) {
          const { error: restoreError } = await supabase.functions.invoke('validate-exam-code', {
            body: { action: 'answers', code: accessCode, attemptId: startedAttemptId, deviceToken: attemptToken, answers: restoredAnswers },
          });
          if (restoreError) {
            console.error('Could not sync restored answer draft:', restoreError);
            showAlert('تعذر استعادة الإجابات', 'تم تحميل الإجابات المحفوظة محلياً، لكن تحقق من الاتصال قبل متابعة الاختبار.');
          }
        }
        data.durationMinutes = data.durationMinutes ?? validatedExam.durationMinutes ?? null;
        setAttemptDurationMinutes(data.durationMinutes);
        setRemainingSeconds(data.remainingSeconds ?? null);
        setAttemptExamTitle(data.examTitle || validatedExam.examTitle || 'الاختبار');
        attemptPaused = Boolean(data.paused);
        attemptIsLocked = Boolean(data.locked);
        warningCount.current = Number(data.warningCount || 0);
        const activeAttempts = readLocalObject(ACTIVE_ATTEMPTS_KEY);
        const previousAttemptId = activeAttempts[attemptKey];
        if (previousAttemptId && previousAttemptId !== startedAttemptId) {
          localStorage.removeItem(attemptDraftKey(validatedExam.examId, info.id, previousAttemptId));
        }
        activeAttempts[attemptKey] = startedAttemptId;
        localStorage.setItem(ACTIVE_ATTEMPTS_KEY, JSON.stringify(activeAttempts));
        localStorage.setItem(draftKey, JSON.stringify(restoredAnswers));
        const audioReady = await audioStartPromise.current;
        if (!audioReady) {
          const { error: eventError } = await supabase.functions.invoke('validate-exam-code', {
            body: { action: 'event', code: accessCode, attemptId: startedAttemptId, event: 'audio_unavailable' },
          });
          if (eventError) console.error('Could not record unavailable audio:', eventError);
        }
      }
      setAttemptId(startedAttemptId);
      setAttemptDeviceToken(attemptToken);
      setAttemptLocked(attemptIsLocked);
      setExamPaused(attemptPaused);
      setAttemptUnavailable(false);
      lastViolationAt.current = null;
      const attempts = readLocalObject(ATTEMPTS_KEY);
      const attemptStorageKey = validatedExam?.legacy ? info.id : `${validatedExam?.examId}:${info.id}`;
      attempts[attemptStorageKey] = 1;
      localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
      setStudent(info);
      setQuestions(attemptQuestions);
      setAnswers(restoredAnswers);
      if (validatedExam?.legacy) warningCount.current = 0;
      answerSaveQueue.current = Promise.resolve();
      isSubmitting.current = false;
      setScreen('quiz');
      window.scrollTo({ top: 0 });
    },
    [isExamCodeActive, showAlert, validatedExam, accessCode]
  );

  const beginWithAudioGate = useCallback((info, recoverDevice = false) => {
    pendingStudent.current = info;
    pendingDeviceRecovery.current = recoverDevice;
    setAudioHeard(false);
    setAudioGateError('');
    setBrowserCapabilities((current) => ({ ...current, audio: false }));
    audioStartPromise.current = null;
    setScreen('audio-gate');
  }, []);

  const playExamAudioTest = useCallback(async () => {
    setAudioGateError('');
    const ready = await startBrowserAudio();
    if (!ready) setAudioGateError('تعذر تشغيل الصوت. فعّل الصوت في المتصفح والجهاز ثم أعد المحاولة.');
  }, [startBrowserAudio]);

  const enterExamAfterAudio = useCallback(async () => {
    if (!browserCapabilities.audio || !audioHeard) return;
    // Called directly from the student's click after the audio check.
    await requestExamFullscreen();
    const info = pendingStudent.current;
    const recoverDevice = pendingDeviceRecovery.current;
    pendingDeviceRecovery.current = false;
    if (info) await beginExam(info, recoverDevice);
  }, [audioHeard, beginExam, browserCapabilities.audio, requestExamFullscreen]);

  const handleStart = useCallback(
    async (info) => {
      if (!info.name || !info.id || !info.grade || !info.track || !info.section) {
        showAlert('تنبيه', 'الرجاء إدخال كافة البيانات المطلوبة بدقة.');
        return;
      }
      pendingStudent.current = info;
      const attempts = readLocalObject(ATTEMPTS_KEY);
      const attemptKey = validatedExam?.legacy ? info.id : `${validatedExam?.examId}:${info.id}`;
      const activeAttempts = readLocalObject(ACTIVE_ATTEMPTS_KEY);
      const deviceTokens = readLocalObject('exam_device_tokens');
      let hasSavedAttempt = Boolean(activeAttempts[attemptKey]);
      let needsDeviceRecovery = !validatedExam?.legacy && hasSavedAttempt && !deviceTokens[attemptKey];
      if (needsDeviceRecovery) {
        const { data, error } = await supabase.functions.invoke('validate-exam-code', {
          body: { action: 'attempt-state', code: accessCode, attemptId: activeAttempts[attemptKey] },
        });
        if (error) {
          showAlert('تعذر التحقق من المحاولة', 'تحقق من الاتصال ثم أعد المحاولة لاستعادة الإجابات بأمان.');
          return;
        }
        if (data?.closed) {
          localStorage.removeItem(attemptDraftKey(validatedExam.examId, info.id, activeAttempts[attemptKey]));
          delete activeAttempts[attemptKey];
          localStorage.setItem(ACTIVE_ATTEMPTS_KEY, JSON.stringify(activeAttempts));
          showAlert('أُغلق الاختبار نهائياً', 'أغلق المعلم هذا الاختبار. الإجابات غير المرسلة حُذفت، والنتائج المسلّمة محفوظة.');
          return;
        }
        if (data?.completed || !data?.found) {
          hasSavedAttempt = false;
          needsDeviceRecovery = false;
        }
      }
      if (needsDeviceRecovery || ((attempts[attemptKey] || 0) >= 1 && (!hasSavedAttempt || validatedExam?.legacy))) {
        pendingDeviceRecovery.current = needsDeviceRecovery;
        setTeacherModal(true);
        return;
      }
      beginWithAudioGate(info, false);
    },
    [beginWithAudioGate, showAlert, validatedExam, accessCode]
  );

  const verifyTeacherCode = useCallback(
    async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && await hasTeacherPermission(user.id, 'manage_exams')) {
        setTeacherModal(false);
        const info = pendingStudent.current;
        const recoverDevice = pendingDeviceRecovery.current;
        showAlert('نجاح', 'تم السماح بمحاولة إضافية بواسطة المعلم. يمكنك بدء المحاولة الآن.');
        beginWithAudioGate(info, recoverDevice);
      } else {
        showAlert('يلزم تسجيل دخول المعلم', 'سجّل الدخول بحساب المعلم المصرّح به من صفحة الإدارة، ثم أعد المحاولة.');
      }
    },
    [beginWithAudioGate, showAlert]
  );

  const handleAnswer = useCallback((idx, optIdx) => {
    if (attemptLocked || examPaused || attemptUnavailable) return;
    setAnswers((a) => ({ ...a, [idx]: optIdx }));
    if (attemptId && attemptDeviceToken) {
      const draftKey = attemptDraftKey(validatedExam?.examId, student?.id, attemptId);
      const nextAnswers = { ...answers, [idx]: optIdx };
      localStorage.setItem(draftKey, JSON.stringify(nextAnswers));
      answerSaveQueue.current = answerSaveQueue.current.catch(() => {}).then(async () => {
        const { error } = await supabase.functions.invoke('validate-exam-code', {
          body: { action: 'answer', code: accessCode, attemptId, deviceToken: attemptDeviceToken, questionIndex: idx, optionIndex: optIdx },
        });
        if (error) {
          console.error('Answer autosave failed:', error);
          setAttemptUnavailable(true);
          showAlert('تعذر حفظ الإجابة الآن', 'احتفظت الصفحة بإجابتك مؤقتاً. تحقق من الاتصال قبل متابعة الاختبار.');
          throw error;
        }
      });
    }
  }, [attemptLocked, examPaused, attemptUnavailable, attemptId, attemptDeviceToken, validatedExam, student, answers, accessCode, showAlert]);

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
      if (attemptId && attemptDeviceToken && !auto) {
        await answerSaveQueue.current.catch(() => {});
        const { error: saveError } = await supabase.functions.invoke('validate-exam-code', {
          body: { action: 'answers', code: accessCode, attemptId, deviceToken: attemptDeviceToken, answers },
        });
        if (saveError) {
          console.error('Final answer draft sync failed:', saveError);
          setAttemptUnavailable(true);
          showAlert('تعذر حفظ الإجابات', 'لم يتم تسليم الاختبار. تحقق من الاتصال ثم أعد المحاولة.');
          return;
        }
        setAttemptUnavailable(false);
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
      if (!validatedExam?.legacy) {
        const attemptKey = `${validatedExam?.examId}:${student?.id}`;
        const activeAttempts = readLocalObject(ACTIVE_ATTEMPTS_KEY);
        delete activeAttempts[attemptKey];
        localStorage.setItem(ACTIVE_ATTEMPTS_KEY, JSON.stringify(activeAttempts));
        localStorage.removeItem(attemptDraftKey(validatedExam?.examId, student?.id, attemptId));
      }
      }

      setQuestions(finalQuestions);
      setResult({ score, total, submissionTime, isLegacy: Boolean(validatedExam?.legacy), examTitle: validatedExam?.legacy ? 'الاختبار الحالي' : attemptExamTitle || validatedExam?.examTitle || 'الاختبار', certificateTemplateId: validatedExam?.certificateTemplateId || 1 });
      setScreen('result');
      window.scrollTo({ top: 0 });
    },
    [questions, answers, student, stopAlarm, showAlert, isExamCodeActive, validatedExam, accessCode, attemptId, attemptDeviceToken, attemptLocked, examPaused, attemptUnavailable, attemptExamTitle]
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
    setAttemptDeviceToken('');
    setAttemptDurationMinutes(null);
    setRemainingSeconds(null);
    setAttemptExamTitle('');
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

      {screen === 'login' && validatedExam && (
    <LoginScreen
      onStart={handleStart}
      durationMinutes={validatedExam?.durationMinutes}
      targetClass={validatedExam?.targetClass || null}
      accessCode={accessCode}
    />
      )}

      {screen === 'audio-gate' && <ExamAudioGate
        audioReady={Boolean(browserCapabilities.audio)}
        heard={audioHeard}
        error={audioGateError}
        onTest={playExamAudioTest}
        onHeardChange={setAudioHeard}
        onEnter={enterExamAfterAudio}
      />}

      {screen === 'quiz' && validatedExam && (
        <QuizScreen
          student={student}
          examTitle={attemptExamTitle || validatedExam?.examTitle}
          questions={questions}
          answers={answers}
          onAnswer={handleAnswer}
          onSubmit={handleSubmit}
          onAlert={showAlert}
          paused={examPaused}
          locked={attemptLocked}
          unavailable={attemptUnavailable}
          browserCapabilities={browserCapabilities}
          durationMinutes={attemptDurationMinutes}
          remainingSeconds={remainingSeconds}
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
        onClose={() => { pendingDeviceRecovery.current = false; setTeacherModal(false); }}
        onSubmit={verifyTeacherCode}
      />
      {security.open && (
        <SecurityOverlay warningsLeft={security.warningsLeft} onClose={closeSecurity} />
      )}
      {attemptLocked && !examPaused && <TeacherReentryDialog onSubmit={handleTeacherReentry} />}
    </div>
  );
}
