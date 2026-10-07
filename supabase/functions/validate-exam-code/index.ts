import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, isAllowedOrigin, parseConfiguredOrigins } from '../_shared/cors.js';
import { buildLegacySubmission, LegacySubmissionError, toPublicQuestionBanks } from '../_shared/legacyExamSubmission.js';

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const allowedOrigins = parseConfiguredOrigins(Deno.env.get('APP_ALLOWED_ORIGINS'));
  const allowed = isAllowedOrigin(origin, allowedOrigins);
  const headers = corsHeaders(origin, allowedOrigins);

  if (!allowed) return Response.json({ error: 'Forbidden origin' }, { status: 403, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });

  try {
    const body = await request.json();
    const code = body?.code;
    if (typeof code !== 'string' || code.length < 1 || code.length > 64) {
      return Response.json({ error: 'Invalid code' }, { status: 400, headers });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const secretKey = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secretKey) throw new Error('Supabase secret key is not configured');

    const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
    const clientIp = forwardedFor.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
    const ipDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientIp));
    const ipHash = Array.from(new Uint8Array(ipDigest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

    if (body?.action === 'event') {
      if (typeof body.attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.attemptId)) {
        return Response.json({ error: 'Invalid attempt' }, { status: 400, headers });
      }
      const eventName = body.event;
      const allowedEvents = ['warning', 'fullscreen_exit', 'tab_hidden', 'window_blur', 'audio_unavailable'];
      if (!allowedEvents.includes(eventName)) return Response.json({ error: 'Invalid event' }, { status: 400, headers });
      const signal = body.details?.signal;
      const { data: attempt, error: attemptError } = await admin.from('exam_attempts')
        .select('access_code_id').eq('id', body.attemptId).maybeSingle();
      if (attemptError) throw attemptError;
      const { data: activeCode, error: codeError } = await admin.from('exam_access_codes')
        .select('id').eq('id', attempt?.access_code_id).eq('code', code).maybeSingle();
      if (codeError) throw codeError;
      if (!attempt || !activeCode) return Response.json({ error: 'Attempt unavailable' }, { status: 404, headers });
      const { data: eventAllowed, error: rateLimitError } = await admin.rpc('consume_access_attempt', {
        client_hash: ipHash,
        attempt_purpose: 'exam_event',
      });
      if (rateLimitError) throw rateLimitError;
      if (!eventAllowed) return Response.json({ error: 'Too many events' }, { status: 429, headers });
      const { data: warningCount, error: eventError } = await admin.rpc('record_exam_attempt_event', {
        target_attempt_id: body.attemptId,
        event_name: eventName,
        event_details: { signal: ['fullscreen_exit', 'tab_hidden', 'window_blur'].includes(signal) ? signal : null },
      });
      if (eventError) throw eventError;
      return Response.json({ recorded: true, warningCount }, { headers });
    }

    if (body?.action === 'answer') {
      if (typeof body.attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.attemptId)
        || typeof body.deviceToken !== 'string' || body.deviceToken.length < 32 || body.deviceToken.length > 128
        || !Number.isInteger(body.questionIndex) || !Number.isInteger(body.optionIndex)) {
        return Response.json({ error: 'Invalid answer draft' }, { status: 400, headers });
      }
      const { data, error: saveError } = await admin.rpc('save_exam_attempt_answer', {
        target_attempt_id: body.attemptId,
        candidate_code: code,
        target_device_token_hash: await sha256Hex(body.deviceToken),
        question_index: body.questionIndex,
        option_index: body.optionIndex,
      });
      if (saveError) {
        if (saveError.code === '22023') return Response.json({ error: saveError.message }, { status: 409, headers });
        throw saveError;
      }
      return Response.json({ saved: true }, { headers });
    }

    if (body?.action === 'answers') {
      if (typeof body.attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.attemptId)
        || typeof body.deviceToken !== 'string' || body.deviceToken.length < 32 || body.deviceToken.length > 128
        || !body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
        return Response.json({ error: 'Invalid answer draft' }, { status: 400, headers });
      }
      const { error: saveError } = await admin.rpc('save_exam_attempt_answers', {
        target_attempt_id: body.attemptId,
        candidate_code: code,
        target_device_token_hash: await sha256Hex(body.deviceToken),
        answers_input: body.answers,
      });
      if (saveError) {
        if (saveError.code === '22023') return Response.json({ error: saveError.message }, { status: 409, headers });
        throw saveError;
      }
      return Response.json({ saved: true }, { headers });
    }

    if (body?.action === 'attempt-state') {
      if (typeof body.attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.attemptId)) {
        return Response.json({ error: 'Invalid attempt' }, { status: 400, headers });
      }
      const { data: attempt, error: attemptError } = await admin.from('exam_attempts')
        .select('exam_id, access_code_id, locked_at, warning_count, completed_at, closed_at, started_at, duration_minutes, paused_duration_seconds, paused_at')
        .eq('id', body.attemptId).maybeSingle();
      if (attemptError) throw attemptError;
      if (!attempt) return Response.json({ found: false }, { headers });
      const [{ data: exam, error: examError }, { data: access, error: accessError }] = await Promise.all([
        admin.from('exams').select('status').eq('id', attempt.exam_id).maybeSingle(),
        admin.from('exam_access_codes').select('code, is_active, expires_at').eq('id', attempt.access_code_id).maybeSingle(),
      ]);
      if (examError) throw examError;
      if (accessError) throw accessError;
      if (!access || access.code !== code) return Response.json({ found: false }, { headers });
      let remainingSeconds: number | null = null;
      if (attempt.duration_minutes) {
        const elapsedEnd = attempt.paused_at ? new Date(attempt.paused_at).getTime() : Date.now();
        const elapsed = Math.max(0, Math.floor((elapsedEnd - new Date(attempt.started_at).getTime()) / 1000)
          - Number(attempt.paused_duration_seconds || 0));
        remainingSeconds = Math.max(0, Number(attempt.duration_minutes) * 60 - elapsed);
      }
      return Response.json({
        found: true,
        examStatus: exam?.status ?? 'archived',
        codeValid: access.is_active && (!access.expires_at || new Date(access.expires_at).getTime() > Date.now()),
        locked: Boolean(attempt.locked_at),
        completed: Boolean(attempt.completed_at),
        closed: Boolean(attempt.closed_at),
        warningCount: attempt.warning_count,
        durationMinutes: attempt.duration_minutes,
        remainingSeconds,
      }, { headers });
    }

    const { data: resolution, error: validationError } = await admin.rpc('resolve_exam_access_code', { candidate: code });
    if (validationError) throw validationError;
    if (!resolution?.valid) {
      const { data: allowed, error: rateLimitError } = await admin.rpc('consume_access_attempt', { client_hash: ipHash, attempt_purpose: 'exam_code' });
      if (rateLimitError) throw rateLimitError;
      if (!allowed) return Response.json({ error: 'Too many attempts' }, { status: 429, headers });
      if (body?.action === 'submit') return Response.json({ error: 'Exam access code is inactive or expired' }, { status: 409, headers });
    }
    if (body?.action === 'bank') {
      const grade = typeof body.grade === 'string' ? body.grade.trim() : '';
      const track = typeof body.track === 'string' ? body.track.trim() : '';
      if (!grade || !track) {
        return Response.json({ error: 'Grade and track are required' }, { status: 400, headers });
      }

      const bankKey = `${grade}-${track}`;

      if (resolution?.legacy) {
        const { data: bankRecord, error: bankError } = await admin
          .from('legacy_exam_question_banks')
          .select('banks')
          .eq('id', true)
          .single();
        if (bankError) throw bankError;

        const publicBanks = toPublicQuestionBanks(bankRecord.banks);
        const questions = publicBanks?.[bankKey];
        if (!Array.isArray(questions) || questions.length === 0) {
          return Response.json({
            valid: true,
            legacy: true,
            bankKey,
            questions: [],
          }, { headers });
        }

        return Response.json({
          valid: true,
          legacy: true,
          bankKey,
          questions,
        }, { headers });
      }

      if (!resolution?.valid || !resolution.banks || typeof resolution.banks !== 'object') {
        return Response.json({ error: 'Exam question bank is unavailable' }, { status: 409, headers });
      }

      const rawQuestions = resolution.banks[bankKey];
      const questions = Array.isArray(rawQuestions)
        ? rawQuestions.map((question) => {
          const { answer: _answer, ...studentQuestion } = question;
          return studentQuestion;
        })
        : [];

      return Response.json({
        valid: true,
        legacy: false,
        examId: resolution.examId,
        examTitle: resolution.examTitle,
        bankKey,
        questions,
      }, { headers });
    }

    if (body?.action === 'roster') {
      if (!resolution?.valid || resolution.legacy || !resolution.examId) {
        return Response.json({ students: [] }, { headers });
      }
      const { data: allowed, error: rateLimitError } = await admin.rpc('consume_access_attempt', {
        client_hash: ipHash,
        attempt_purpose: 'exam_code',
      });
      if (rateLimitError) throw rateLimitError;
      if (!allowed) return Response.json({ error: 'Too many roster requests' }, { status: 429, headers });
      const { data: exam, error: examError } = await admin.from('exams')
        .select('target_grade, target_track, target_section').eq('id', resolution.examId).single();
      if (examError) throw examError;
      if (!exam.target_grade || !exam.target_track || !exam.target_section) {
        return Response.json({ students: [] }, { headers });
      }
      const { data: students, error: studentsError } = await admin.from('students')
        .select('id, full_name, full_name_ar, full_name_en, student_number, grade, track, section')
        .eq('grade', exam.target_grade).eq('track', exam.target_track).eq('section', exam.target_section)
        .order('full_name').limit(500);
      if (studentsError) throw studentsError;
      return Response.json({ students: students ?? [] }, { headers });
    }
    if (body?.action === 'check') return Response.json(resolution ?? { valid: false }, { headers });
    if (body?.action === 'start') {
      if (!resolution?.valid || resolution.legacy || !body.student || !Array.isArray(body.questions)
        || typeof body.deviceToken !== 'string' || body.deviceToken.length < 32 || body.deviceToken.length > 128) {
        return Response.json({ error: 'Exam attempt cannot start' }, { status: 409, headers });
      }
      const { data: startAllowed, error: startRateLimitError } = await admin.rpc('consume_access_attempt', {
        client_hash: ipHash,
        attempt_purpose: 'exam_start',
      });
      if (startRateLimitError) throw startRateLimitError;
      if (!startAllowed) return Response.json({ error: 'Too many attempts started' }, { status: 429, headers });
      const { data: attemptId, error: startError } = await admin.rpc('start_exam_attempt_v2', {
        candidate_code: code,
        student_name_input: body.student.name,
        student_number_input: body.student.id,
        grade_input: body.student.grade,
        track_input: body.student.track,
        section_input: body.student.section,
        presented_questions_input: body.questions,
        device_token_hash_input: await sha256Hex(body.deviceToken),
      });
      if (startError) {
        if (startError.code === '22023') return Response.json({ error: startError.message }, { status: 409, headers });
        throw startError;
      }
      const { data: attempt, error: attemptReadError } = await admin.from('exam_attempts')
        .select('id, exam_id, exam_revision, presented_questions_json, answers_json, started_at, duration_minutes, paused_duration_seconds, paused_at, locked_at, warning_count')
        .eq('id', attemptId).single();
      if (attemptReadError) throw attemptReadError;
      const { data: revision, error: revisionError } = await admin.from('exam_revisions')
        .select('title').eq('exam_id', attempt.exam_id).eq('revision', attempt.exam_revision).single();
      if (revisionError) throw revisionError;
      const elapsedEnd = attempt.paused_at ? new Date(attempt.paused_at).getTime() : Date.now();
      const elapsed = Math.max(0, Math.floor((elapsedEnd - new Date(attempt.started_at).getTime()) / 1000)
        - Number(attempt.paused_duration_seconds || 0));
      const remainingSeconds = attempt.duration_minutes == null
        ? null : Math.max(0, Number(attempt.duration_minutes) * 60 - elapsed);
      return Response.json({
        started: true,
        attemptId,
        examId: attempt.exam_id,
        examTitle: revision.title,
        revision: attempt.exam_revision,
        questions: attempt.presented_questions_json,
        answers: attempt.answers_json || {},
        durationMinutes: attempt.duration_minutes,
        remainingSeconds,
        paused: Boolean(attempt.paused_at),
        locked: Boolean(attempt.locked_at),
        warningCount: attempt.warning_count,
      }, { headers });
    }
    if (body?.action === 'submit') {
      if (resolution.legacy) {
        const { data: bankRecord, error: bankError } = await admin
          .from('legacy_exam_question_banks')
          .select('banks')
          .eq('id', true)
          .single();
        if (bankError) throw bankError;

        let submission;
        try {
          submission = buildLegacySubmission({
            banks: bankRecord.banks,
            student: body.student,
            answers: body.answers,
            questions: body.questions,
            submissionTime: body.submissionTime,
            isAuto: Boolean(body.isAuto),
          });
        } catch (submissionError) {
          if (submissionError instanceof LegacySubmissionError) {
            return Response.json({ error: submissionError.message }, { status: 400, headers });
          }
          throw submissionError;
        }

        const { data: savedResult, error: saveError } = await admin
          .from('exam_results')
          .insert(submission.result)
          .select('id')
          .single();
        if (saveError) throw saveError;

        return Response.json({
          submitted: true,
          resultId: savedResult.id,
          score: submission.score,
          total: submission.total,
          examTitle: 'الاختبار الحالي',
        }, { headers });
      }
      const { data: submitted, error: submitError } = await admin.rpc('submit_exam_attempt_for_attempt', {
        candidate_code: code,
        student_name_input: body.student?.name,
        student_number_input: body.student?.id,
        grade_input: body.student?.grade,
        track_input: body.student?.track,
        section_input: body.student?.section,
        answers_input: body.answers,
        presented_questions_input: body.questions,
        submission_time_input: body.submissionTime,
        is_other_input: Boolean(body.student?.isOther),
        is_auto_input: Boolean(body.isAuto),
        target_attempt_id: body.attemptId,
      });
      if (submitError) {
        if (submitError.code === '22023') return Response.json({ error: submitError.message }, { status: 409, headers });
        throw submitError;
      }
      const result = Array.isArray(submitted) ? submitted[0] : submitted;
      return Response.json({
        submitted: true,
        resultId: result?.result_id,
        score: result?.score,
        total: result?.total,
        examId: result?.exam_id,
        examTitle: result?.exam_title,
        questions: result?.questions_json,
      }, { headers });
    }
    if (body?.action === 'validate') {
      if (resolution?.legacy) return Response.json(resolution, { headers });
      const { data: targetClass, error: classError } = await admin.from('exams')
        .select('target_grade, target_track, target_section').eq('id', resolution.examId).single();
      if (classError) throw classError;
      const { banks: _banks, ...publicResolution } = resolution;
      return Response.json({
        ...publicResolution,
        targetClass: targetClass.target_grade && targetClass.target_track && targetClass.target_section
          ? { grade: targetClass.target_grade, track: targetClass.target_track, section: targetClass.target_section }
          : null,
      }, { headers });
    }

    if (resolution?.valid && resolution.legacy === true) {
      const { data: bankRecord, error: bankError } = await admin
        .from('legacy_exam_question_banks')
        .select('banks')
        .eq('id', true)
        .single();
      if (bankError) throw bankError;
      const publicBanks = toPublicQuestionBanks(bankRecord.banks);
      return Response.json({ ...resolution, banks: publicBanks }, { headers });
    }
    if (resolution?.valid && resolution.legacy === false) {
      const { data: targetClass, error: classError } = await admin.from('exams')
        .select('target_grade, target_track, target_section').eq('id', resolution.examId).single();
      if (classError) throw classError;
      const publicBanks = Object.fromEntries(Object.entries(resolution.banks || {}).map(([key, questions]) => [
        key,
        Array.isArray(questions) ? questions.map((question) => {
          const { answer: _answer, ...studentQuestion } = question;
          return studentQuestion;
        }) : [],
      ]));
      return Response.json({
        ...resolution,
        targetClass: targetClass.target_grade && targetClass.target_track && targetClass.target_section
          ? { grade: targetClass.target_grade, track: targetClass.target_track, section: targetClass.target_section }
          : null,
        banks: publicBanks,
      }, { headers });
    }
    return Response.json(resolution ?? { valid: false }, { headers });
  } catch (error) {
    console.error('Exam code validation failed:', error);
    return Response.json({ error: 'Code validation is not available' }, { status: 500, headers });
  }
});
