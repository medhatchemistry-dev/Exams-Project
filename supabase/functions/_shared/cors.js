const LEGACY_VERCEL_ORIGIN = /^https:\/\/exams-project(?:-[a-z0-9-]+)?\.vercel\.app$/;

function parseOrigin(value) {
  if (typeof value !== 'string' || value.length === 0 || value === 'null') return null;
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

export function parseConfiguredOrigins(value) {
  return String(value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => {
      const parsed = parseOrigin(origin);
      return parsed && parsed.protocol === 'https:';
    });
}

export function isAllowedOrigin(origin, configuredOrigins = []) {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;

  const local = (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    && parsed.protocol === 'http:';
  if (local) return true;

  if (parsed.protocol !== 'https:') return false;
  if (LEGACY_VERCEL_ORIGIN.test(parsed.origin)) return true;

  const configured = Array.isArray(configuredOrigins)
    ? configuredOrigins
    : parseConfiguredOrigins(configuredOrigins);
  return configured.includes(parsed.origin);
}

export function corsHeaders(origin, configuredOrigins = []) {
  const allowed = isAllowedOrigin(origin, configuredOrigins);
  return {
    ...(allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
