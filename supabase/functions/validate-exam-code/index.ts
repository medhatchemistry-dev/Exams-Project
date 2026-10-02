import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, isAllowedOrigin, parseConfiguredOrigins } from '../_shared/cors.js';

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

    const { data: resolution, error: validationError } = await admin.rpc('resolve_exam_access_code', { candidate: code });
    if (validationError) throw validationError;
    if (body?.action === 'submit') {
      if (!resolution?.valid) return Response.json({ error: 'Exam access code is inactive or expired' }, { status: 409, headers });
      if (resolution.legacy) return Response.json({ error: 'Legacy exam uses the standard result flow' }, { status: 409, headers });
      const { data: submitted, error: submitError } = await admin.rpc('submit_exam_attempt', {
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
    if (!resolution?.valid) {
      const { data: allowed, error: rateLimitError } = await admin.rpc('consume_access_attempt', { client_hash: ipHash, attempt_purpose: 'exam_code' });
      if (rateLimitError) throw rateLimitError;
      if (!allowed) return Response.json({ error: 'Too many attempts' }, { status: 429, headers });
    }
    if (resolution?.valid && resolution.legacy === false && resolution.banks && typeof resolution.banks === 'object') {
      const publicBanks = Object.fromEntries(Object.entries(resolution.banks).map(([key, questions]) => [
        key,
        Array.isArray(questions) ? questions.map((question) => {
          const { answer: _answer, ...studentQuestion } = question;
          return studentQuestion;
        }) : [],
      ]));
      return Response.json({ ...resolution, banks: publicBanks }, { headers });
    }
    return Response.json(resolution ?? { valid: false }, { headers });
  } catch (error) {
    console.error('Exam code validation failed:', error);
    return Response.json({ error: 'Code validation is not available' }, { status: 500, headers });
  }
});
