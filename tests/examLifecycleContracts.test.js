import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20261004070742_exam_lifecycle_attempts_and_events.sql', import.meta.url), 'utf8');

test('teacher password unlock is attempt-bound and unavailable to browser roles', () => {
  assert.match(migration, /function public\.unlock_exam_attempt\(target_attempt_id uuid\)/);
  assert.match(migration, /target\.locked_at is null or target\.completed_at is not null/);
  assert.match(migration, /exam_state is distinct from 'available'/);
  assert.match(migration, /grant execute on function public\.unlock_exam_attempt\(uuid\) to service_role/);
  assert.match(migration, /'exam_reentry', 'exam_event', 'exam_start'/);
  assert.match(migration, /attempt_purpose in \('exam_event', 'exam_start'\) then 120/);
});

test('imported submissions require an active unlocked attempt and preserve canonical grading', () => {
  assert.match(migration, /function public\.submit_exam_attempt_for_attempt\(/);
  assert.match(migration, /target\.locked_at is not null or target\.completed_at is not null/);
  assert.match(migration, /target\.presented_questions_json <> presented_questions_input/);
  assert.match(migration, /public\.submit_exam_attempt\(/);
  assert.match(migration, /completed_result_id = submitted\.result_id/);
});

test('pause and resume preserve the code expiry and are teacher-authorized', () => {
  assert.match(migration, /teacher_roles where user_id = teacher_id/);
  assert.match(migration, /expires_at = expires_at \+ pause_duration/);
  assert.match(migration, /insert into public\.exam_activity_events\(exam_id, event_type\) values \(target_exam_id, 'paused'\)/);
  assert.match(migration, /insert into public\.exam_activity_events\(exam_id, event_type\) values \(target_exam_id, 'resumed'\)/);
});
