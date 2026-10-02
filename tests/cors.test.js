import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, corsHeaders } from '../supabase/functions/_shared/cors.js';

const defaults = ['https://exams-project.vercel.app', 'https://exams-project-preview-1.vercel.app'];

test('allows local development origins only on localhost over HTTP', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173', defaults), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:4173', defaults), true);
  assert.equal(isAllowedOrigin('https://localhost:5173', defaults), false);
  assert.equal(isAllowedOrigin('http://evil.localhost:5173', defaults), false);
});

test('allows current project Vercel preview hosts and exact configured HTTPS origins', () => {
  assert.equal(isAllowedOrigin('https://exams-project.vercel.app', defaults), true);
  assert.equal(isAllowedOrigin('https://exams-project-pr-123.vercel.app', defaults), true);
  assert.equal(isAllowedOrigin('https://exams-project.evil.example', defaults), false);
  assert.equal(isAllowedOrigin('https://exams-project-preview-1.vercel.app', defaults), true);
  assert.equal(isAllowedOrigin('https://unrelated.example', defaults), false);
});

test('rejects malformed configured origins and normalizes no caller-supplied paths', () => {
  assert.equal(isAllowedOrigin('https://school.example', ['https://school.example/path']), false);
  assert.equal(isAllowedOrigin('https://school.example', ['http://school.example']), false);
  assert.equal(isAllowedOrigin('https://school.example.evil.example', ['https://school.example']), false);
  assert.equal(isAllowedOrigin('https://school.example/path', ['https://school.example']), false);
  assert.equal(isAllowedOrigin('null', defaults), false);
  assert.equal(isAllowedOrigin(null, defaults), false);
});

test('reflects only an allowed origin in CORS headers', () => {
  const allowed = corsHeaders('https://school.example', ['https://school.example']);
  const denied = corsHeaders('https://evil.example', ['https://school.example']);

  assert.equal(allowed['Access-Control-Allow-Origin'], 'https://school.example');
  assert.equal(allowed.Vary, 'Origin');
  assert.equal(denied['Access-Control-Allow-Origin'], undefined);
  assert.equal(denied.Vary, undefined);
});

test('disallowed origins receive no allow-origin header and must be rejected by handlers', () => {
  const headers = corsHeaders('https://hamzacross100.online', ['https://exams.example']);
  assert.equal(isAllowedOrigin('https://hamzacross100.online', ['https://exams.example']), false);
  assert.equal(headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
});
