import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, isAllowedOrigin, parseConfiguredOrigins } from '../_shared/cors.js';

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99)))
    || (a === 198 && ((b === 18 || b === 19) || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113);
}

function isPrivateIpv6(address: string) {
  const value = address.toLowerCase().replace(/^\[|\]$/g, '');
  const mappedIpv4 = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4[1]);
  const mappedHex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return value === '::' || value === '::1' || value.startsWith('::')
    || value.startsWith('64:ff9b:') || value.startsWith('2001:0:') || value.startsWith('2002:')
    || value.startsWith('fc') || value.startsWith('fd')
    || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea')
    || value.startsWith('feb') || value.startsWith('fec') || value.startsWith('fed')
    || value.startsWith('fee') || value.startsWith('fef') || value.startsWith('ff')
    || value.startsWith('2001:db8:');
}

async function validatePublicHttpsUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a valid website URL.'); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || !host
    || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
    || host.endsWith('.internal') || host.endsWith('.test')) {
    throw new Error('Only public HTTPS pages without embedded credentials are supported.');
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) && isPrivateIpv4(host)) {
    throw new Error('Private network addresses cannot be imported.');
  }
  if (host.includes(':') && isPrivateIpv6(host)) throw new Error('Private network addresses cannot be imported.');
  if (!/^[\d.]+$/.test(host) && !host.includes(':')) {
    const records = await Promise.allSettled([
      Deno.resolveDns(host, 'A'),
      Deno.resolveDns(host, 'AAAA'),
    ]);
    const ipv4 = records[0].status === 'fulfilled' ? records[0].value : [];
    const ipv6 = records[1].status === 'fulfilled' ? records[1].value : [];
    if ((!ipv4.length && !ipv6.length) || ipv4.some(isPrivateIpv4) || ipv6.some(isPrivateIpv6)) {
      throw new Error('This website does not resolve to a public address.');
    }
  }
  return url;
}

async function readBoundedBytes(response: Response, maxBytes: number) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('The remote file is too large.');
  if (!response.body) throw new Error('The website returned an empty page.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('The remote file is too large.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function readBoundedText(response: Response) {
  const bytes = await readBoundedBytes(response, MAX_HTML_BYTES);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const allowedOrigins = parseConfiguredOrigins(Deno.env.get('APP_ALLOWED_ORIGINS'));
  const headers = corsHeaders(origin, allowedOrigins);
  if (!isAllowedOrigin(origin, allowedOrigins)) return Response.json({ error: 'Forbidden origin' }, { status: 403, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });

  const authorization = request.headers.get('authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!authorization || !supabaseUrl || !apiKey) {
    return Response.json({ error: 'Teacher sign-in is required.' }, { status: 401, headers });
  }
  const supabase = createClient(supabaseUrl, apiKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: 'Teacher sign-in is required.' }, { status: 401, headers });
  }
  const { data: teacherRole, error: roleError } = await supabase.from('teacher_roles')
    .select('user_id').eq('user_id', userData.user.id).maybeSingle();
  if (roleError || !teacherRole) {
    return Response.json({ error: 'Teacher access is required.' }, { status: 403, headers });
  }

  try {
    const body = await request.json();
    if (typeof body?.url !== 'string' || body.url.length > 2048) {
      return Response.json({ error: 'Invalid website URL.' }, { status: 400, headers });
    }
    let target = await validatePublicHttpsUrl(body.url);
    if (body?.action === 'asset') {
      if (typeof body.sourceUrl !== 'string' || body.sourceUrl.length > 2048) {
        return Response.json({ error: 'Invalid source page URL.' }, { status: 400, headers });
      }
      const source = await validatePublicHttpsUrl(body.sourceUrl);
      const allowedHost = (url: URL) => url.hostname === source.hostname || url.hostname.endsWith(`.${source.hostname}`);
      if (!allowedHost(target)) throw new Error('An image must come from the page host or one of its subdomains.');
      let assetResponse: Response | null = null;
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        assetResponse = await fetch(target, {
          method: 'GET',
          redirect: 'manual',
          headers: { Accept: 'image/png,image/jpeg,image/gif,image/webp' },
          signal: AbortSignal.timeout(12_000),
        });
        if (assetResponse.status < 300 || assetResponse.status >= 400) break;
        const location = assetResponse.headers.get('location');
        if (!location || redirects === MAX_REDIRECTS) throw new Error('The image redirected too many times.');
        target = await validatePublicHttpsUrl(new URL(location, target).href);
        if (!allowedHost(target)) throw new Error('The image redirected outside the source website.');
      }
      if (!assetResponse?.ok) throw new Error(`The image returned HTTP ${assetResponse?.status ?? 'error'}.`);
      const contentType = (assetResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(contentType)) {
        throw new Error('Only PNG, JPEG, GIF, and WebP images can be imported.');
      }
      const bytes = await readBoundedBytes(assetResponse, 700 * 1024);
      return Response.json({ dataUrl: `data:${contentType};base64,${toBase64(bytes)}` }, { headers });
    }
    let response: Response | null = null;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      response = await fetch(target, {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'text/html,application/xhtml+xml;q=0.9' },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error('The website redirected too many times.');
      target = await validatePublicHttpsUrl(new URL(location, target).href);
    }
    if (!response?.ok) throw new Error(`The website returned HTTP ${response?.status ?? 'error'}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(contentType)) {
      throw new Error('This link does not return a static HTML page.');
    }
    const source = await readBoundedText(response);
    return Response.json({ source, baseUrl: target.href }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load this website.';
    console.error('Exam website import failed:', message);
    return Response.json({ error: message }, { status: 400, headers });
  }
});
