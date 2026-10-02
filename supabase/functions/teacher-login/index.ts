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

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  }
  if (!isAllowedOrigin(origin)) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers });
  }

  try {
    const body = await request.json();
    const password = body?.password;
    if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
      return Response.json({ error: 'Invalid password' }, { status: 400, headers });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    const secretKey = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const publishableKey = publishableKeys.default ?? Deno.env.get('SUPABASE_ANON_KEY');
    if (!secretKey || !publishableKey) throw new Error('Supabase keys are not configured');

    const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const forwardedFor = request.headers.get('x-forwarded-for') ?? '';
    const clientIp = forwardedFor.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
    const ipDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientIp));
    const ipHash = Array.from(new Uint8Array(ipDigest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const { data: passwordMatches, error: passwordCheckError } = await admin.rpc('verify_teacher_password', { candidate: password });
    if (passwordCheckError) throw passwordCheckError;
    if (!passwordMatches) {
      const { data: allowed, error: rateLimitError } = await admin.rpc('consume_access_attempt', { client_hash: ipHash, attempt_purpose: 'teacher_login' });
      if (rateLimitError) throw rateLimitError;
      if (!allowed) return Response.json({ error: 'Too many attempts' }, { status: 429, headers });
      return Response.json({ error: 'Invalid password' }, { status: 401, headers });
    }

    const auth = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const email = Deno.env.get('TEACHER_LOGIN_EMAIL') ?? 'medhat.chemistry@gmail.com';
    const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) throw usersError;
    let user = users.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) throw createError;
      user = created.user;
    }

    const { data: role, error: roleError } = await admin
      .from('teacher_roles')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) {
      const { error: insertRoleError } = await admin.from('teacher_roles').insert({ user_id: user.id });
      if (insertRoleError) throw insertRoleError;
    }

    let { data: sessionData, error: sessionError } = await auth.auth.signInWithPassword({ email, password });
    if (sessionError && user) {
      const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
      if (passwordError) throw passwordError;
      ({ data: sessionData, error: sessionError } = await auth.auth.signInWithPassword({ email, password }));
    }
    if (sessionError) throw sessionError;
    if (!sessionData.session) throw new Error('Could not create a teacher session');
    return Response.json({
      session: {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      },
    }, { headers });
  } catch (error) {
    console.error('Teacher login error:', error);
    return Response.json({ error: 'Teacher login is not available' }, { status: 500, headers });
  }
});
