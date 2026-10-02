import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = (origin: string | null) => ({
  ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' } : {}),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:') return true;
    return url.protocol === 'https:' && /^exams-project(?:-[a-z0-9-]+)?\.vercel\.app$/.test(url.hostname);
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(isAllowedOrigin(origin) ? origin : null);

  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  if (!isAllowedOrigin(origin)) return Response.json({ error: 'Forbidden' }, { status: 403, headers });

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

    const { data: valid, error: validationError } = await admin.rpc('validate_exam_access_code', { candidate: code });
    if (validationError) throw validationError;
    if (!valid) {
      const { data: allowed, error: rateLimitError } = await admin.rpc('consume_access_attempt', { client_hash: ipHash, attempt_purpose: 'exam_code' });
      if (rateLimitError) throw rateLimitError;
      if (!allowed) return Response.json({ error: 'Too many attempts' }, { status: 429, headers });
    }
    return Response.json({ valid: Boolean(valid) }, { headers });
  } catch (error) {
    console.error('Exam code validation failed:', error);
    return Response.json({ error: 'Code validation is not available' }, { status: 500, headers });
  }
});
