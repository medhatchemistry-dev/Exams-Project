import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callJevForHeaderMapping,
  createHeaderMappingRequest,
  resolveHeaderMapping,
} from '../supabase/functions/_shared/jevStudentHeaders.js';

const headers = [
  { index: 1, label: 'رقم مدرسي' },
  { index: 2, label: 'اسم الطالبة' },
  { index: 3, label: 'Class' },
];

test('builds a native TypeSafe System One request with only requested header fields', () => {
  const request = createHeaderMappingRequest(headers, ['student_number', 'full_name_ar']);
  assert.equal(request.model, 'jev-latest');
  assert.deepEqual(request.state, { headers });
  assert.equal(request.questions.column_1.type, 'choice');
  assert.ok(request.questions.column_1.criteria.student_number);
  assert.ok(request.questions.column_1.criteria.full_name_ar);
  assert.equal('grade' in request.questions.column_1.criteria, false);
});

test('keeps only high confidence unique field mappings', () => {
  const mapping = resolveHeaderMapping(headers, {
    column_1: { choice: 'student_number', confidence: 0.93 },
    column_2: { choice: 'full_name_ar', confidence: 0.89 },
    column_3: { choice: 'grade', confidence: 0.52 },
  }, ['student_number', 'full_name_ar', 'grade']);
  assert.deepEqual(mapping, { student_number: 1, full_name_ar: 2 });
});

test('calls the Experiential gateway server endpoint with bearer auth and no retries', async () => {
  let request;
  const mapping = await callJevForHeaderMapping(headers, ['student_number'], 'server-secret', {
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ answers: { column_1: { choice: 'student_number', confidence: 0.95 } } }) };
    },
  });
  assert.equal(request.url, 'https://api.experientiallabs.ai/v1/systemone');
  assert.equal(request.options.headers.Authorization, 'Bearer server-secret');
  assert.equal(request.body.model, 'jev-latest');
  assert.deepEqual(mapping, { student_number: 1 });
});

test('rejects missing credentials and surfaces provider status without exposing response bodies', async () => {
  await assert.rejects(callJevForHeaderMapping(headers, ['student_number'], ''), /EXPERIENTIAL_API_KEY/);
  await assert.rejects(callJevForHeaderMapping(headers, ['student_number'], 'key', {
    fetchImpl: async () => ({ ok: false, status: 429 }),
  }), /HTTP 429/);
});
