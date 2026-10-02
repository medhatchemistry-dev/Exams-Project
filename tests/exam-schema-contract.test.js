import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const codeGuardMigration = readFileSync(new URL('../supabase/migrations/20261002141722_protect_active_exam_access_codes.sql', import.meta.url), 'utf8');
const submissionMigration = readFileSync(new URL('../supabase/migrations/20261002144846_secure_imported_exam_submissions.sql', import.meta.url), 'utf8');
const gradingMigration = readFileSync(new URL('../supabase/migrations/20261002145514_secure_imported_exam_answer_grading.sql', import.meta.url), 'utf8');

test('prevents archiving or deleting an exam while its code is active', () => {
  assert.match(codeGuardMigration, /create trigger exams_prevent_active_code_archive/i);
  assert.match(codeGuardMigration, /new\.status = 'archived'[\s\S]*?exam_access_codes[\s\S]*?is_active/i);
  assert.match(codeGuardMigration, /create trigger exams_prevent_active_code_delete/i);
  assert.match(codeGuardMigration, /old\.id[\s\S]*?is_active/i);
});

test('keeps imported exam submission and grading service-only', () => {
  assert.match(submissionMigration, /revoke all on function public\.submit_exam_attempt[\s\S]*from public, anon, authenticated/i);
  assert.match(submissionMigration, /grant execute on function public\.submit_exam_attempt[\s\S]*to service_role/i);
  assert.match(gradingMigration, /revoke all on function public\.submit_exam_attempt[\s\S]*from public, anon, authenticated/i);
  assert.match(gradingMigration, /grant execute on function public\.submit_exam_attempt[\s\S]*to service_role/i);
});
