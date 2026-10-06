import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, isAllowedOrigin, parseConfiguredOrigins } from '../_shared/cors.js';

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const allowedOrigins = parseConfiguredOrigins(Deno.env.get('APP_ALLOWED_ORIGINS'));
  const headers = corsHeaders(origin, allowedOrigins);
  if (!isAllowedOrigin(origin, allowedOrigins)) return Response.json({ error: 'Forbidden origin' }, { status: 403, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });

  try {
    const body = await request.json();
    const { attemptId, password } = body ?? {};
    if (typeof attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(attemptId)
      || typeof password !== 'string' || password.length < 1 || password.length > 128) {
      return Response.json({ error: 'Invalid re-entry request' }, { status: 400, headers });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const secretKey = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secretKey) throw new Error('Supabase secret key is not configured');
    const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
    const clientIp = forwardedFor.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientIp));
    const ipHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');

    const { data: allowed, error: rateLimitError } = await admin.rpc('consume_access_attempt', {
      client_hash: ipHash,
      attempt_purpose: 'exam_reentry',
    });
    if (rateLimitError) throw rateLimitError;
    if (!allowed) return Response.json({ error: 'Too many attempts' }, { status: 429, headers });

    const { data: matches, error: verifyError } = await admin.rpc('verify_exam_reentry_password', { candidate: password });
    if (verifyError) throw verifyError;
    if (!matches) {
      const { error: auditError } = await admin.rpc('record_exam_unlock_failure', { target_attempt_id: attemptId });
      if (auditError) throw auditError;
      return Response.json({ error: 'Teacher verification failed' }, { status: 401, headers });
    }

    const { data: warningCount, error: unlockError } = await admin.rpc('unlock_exam_attempt', { target_attempt_id: attemptId });
    if (unlockError) return Response.json({ error: 'Attempt cannot be unlocked' }, { status: 409, headers });
    return Response.json({ unlocked: true, warningCount }, { headers });
  } catch (error) {
    console.error('Exam re-entry verification failed:', error);
    return Response.json({ error: 'Teacher verification is unavailable' }, { status: 500, headers });
  }
});
