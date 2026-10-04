import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const migrationDir = new URL('../supabase/migrations/', import.meta.url);
const migrationName = readdirSync(migrationDir).filter((name) => name.endsWith('_secure_imported_exam_submissions.sql')).sort().at(-1);
const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
const gradingMigrationName = readdirSync(migrationDir).filter((name) => name.endsWith('_secure_imported_exam_answer_grading.sql')).sort().at(-1);
const gradingMigration = readFileSync(new URL(`../supabase/migrations/${gradingMigrationName}`, import.meta.url), 'utf8');
const lifecycleMigration = readFileSync(new URL('../supabase/migrations/20261004070742_exam_lifecycle_attempts_and_events.sql', import.meta.url), 'utf8');
const validationFunction = readFileSync(new URL('../supabase/functions/validate-exam-code/index.ts', import.meta.url), 'utf8');
const quizApp = readFileSync(new URL('../src/pages/QuizApp.jsx', import.meta.url), 'utf8');

test('only the service role can submit and grade imported exam attempts', () => {
  assert.match(migration, /create or replace function public\.submit_exam_attempt/i);
  assert.match(migration, /revoke all on function public\.submit_exam_attempt[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.submit_exam_attempt[\s\S]*to service_role/i);
  assert.match(migration, /verify_exam_access_code|active_code public\.exam_access_codes/i);
  assert.match(migration, /computed_score := computed_score \+ 1/i);
  assert.match(migration, /insert into public\.exam_results[\s\S]*questions_json/i);
});

test('exam validation strips answer keys from the response payload', () => {
  assert.match(validationFunction, /const \{ answer: _answer, \.\.\.studentQuestion \} = question/);
  assert.match(validationFunction, /banks: publicBanks/);
});

test('dispatches imported exam submissions to the server-side grading RPC', () => {
  assert.match(validationFunction, /body\?\.action === 'submit'/);
  assert.match(validationFunction, /admin\.rpc\('submit_exam_attempt_for_attempt'/);
  assert.match(validationFunction, /presented_questions_input: body\.questions/);
  assert.match(validationFunction, /target_attempt_id: body\.attemptId/);
  assert.match(lifecycleMigration, /public\.submit_exam_attempt\(/);
  assert.match(validationFunction, /questions: result\?\.questions_json/);
});

test('server maps canonical answers to the displayed shuffled order and rejects option tampering', () => {
  assert.match(gradingMigration, /submitted_option\.value = canonical_option/i);
  assert.match(gradingMigration, /select option\.position - 1 into correct_answer/i);
  assert.match(gradingMigration, /Submitted options were modified or duplicated/i);
  assert.match(gradingMigration, /if is_auto_input then computed_score := 0/i);
  assert.match(gradingMigration, /for update/i);
  assert.match(gradingMigration, /for share/i);
});

test('server grading resolves canonical questions by id and aligns answers with the submitted display order', () => {
  assert.match(gradingMigration, /where bank\.question->>'id' = submitted_question->>'id'/i);
  assert.match(gradingMigration, /answers_input->>\(question_index - 1\)::text/i);
  assert.match(gradingMigration, /question IDs must be unique/i);
  assert.match(gradingMigration, /jsonb_array_length\(presented_questions_input\) <> jsonb_array_length\(source_bank\)/i);
});

test('all student exams withhold answer keys and submit through the trusted endpoint', () => {
  assert.match(quizApp, /selectExamBank\(validatedExam, info\.grade, info\.track, banks \|\| \{\}\)/);
  assert.match(quizApp, /action: 'submit'/);
  assert.match(quizApp, /isAuto: auto/);
  assert.doesNotMatch(quizApp, /from\('exam_results'\)\.insert/);
  assert.doesNotMatch(quizApp, /question\.answer/);
});
