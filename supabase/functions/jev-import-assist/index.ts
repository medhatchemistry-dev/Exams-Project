import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, isAllowedOrigin, parseConfiguredOrigins } from '../_shared/cors.js';
import { callJevForHeaderMapping } from '../_shared/jevStudentHeaders.js';

const ALLOWED_FIELDS = ['student_number', 'full_name_ar', 'full_name_en', 'grade', 'track', 'section'];

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const allowedOrigins = parseConfiguredOrigins(Deno.env.get('APP_ALLOWED_ORIGINS'));
  const headers = corsHeaders(origin, allowedOrigins);
  if (!isAllowedOrigin(origin, allowedOrigins)) return Response.json({ error: 'Forbidden origin' }, { status: 403, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });

  try {
    const authorization = request.headers.get('authorization') || '';
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return Response.json({ error: 'Teacher sign-in required' }, { status: 401, headers });

    const url = Deno.env.get('SUPABASE_URL');
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const serviceKey = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) throw new Error('Server configuration is incomplete');
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
    if (authError || !authData.user) return Response.json({ error: 'Teacher sign-in required' }, { status: 401, headers });
    const { data: teacher, error: roleError } = await admin.from('teacher_roles')
      .select('is_owner, permissions').eq('user_id', authData.user.id).maybeSingle();
    if (roleError) throw roleError;
    if (!teacher?.is_owner && !teacher?.permissions?.includes('manage_students')) {
      return Response.json({ error: 'Student management permission required' }, { status: 403, headers });
    }

    const body = await request.json();
    if (body?.action !== 'map-student-headers' || !Array.isArray(body.headers) || !Array.isArray(body.unmappedFields)) {
      return Response.json({ error: 'Invalid header mapping request' }, { status: 400, headers });
    }
    const columnHeaders = body.headers.slice(0, 32).map((header) => ({ index: header?.index, label: header?.label }));
    if (columnHeaders.some(({ index, label }) => !Number.isInteger(index) || index < 1 || typeof label !== 'string' || !label.trim() || label.length > 120)) {
      return Response.json({ error: 'Invalid column header' }, { status: 400, headers });
    }
    const fields = [...new Set(body.unmappedFields)].filter((field) => ALLOWED_FIELDS.includes(field));
    if (!fields.length) return Response.json({ mapping: {} }, { headers });

    const apiKey = Deno.env.get('EXPERIENTIAL_API_KEY');
    if (!apiKey) return Response.json({ error: 'Jev assist is not configured' }, { status: 503, headers });
    const mapping = await callJevForHeaderMapping(columnHeaders, fields, apiKey);
    return Response.json({ mapping }, { headers });
  } catch (error) {
    console.error('Jev import assist failed:', error);
    const timedOut = error instanceof DOMException && error.name === 'AbortError';
    return Response.json({ error: timedOut ? 'Jev request timed out' : 'Jev could not map these headers' }, { status: timedOut ? 504 : 502, headers });
  }
});
