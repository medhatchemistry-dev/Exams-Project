import test from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoBatches, toStudentWriteRows } from '../src/lib/studentRows.js';

test('splits roster writes into bounded batches', () => {
  const rows = Array.from({ length: 205 }, (_, index) => ({ student_number: String(index) }));
  const batches = splitIntoBatches(rows, 100);
  assert.deepEqual(batches.map((batch) => batch.length), [100, 100, 5]);
});

test('strips import preview metadata before database writes', () => {
  const rows = toStudentWriteRows([{ student_number: '1', full_name_ar: 'مريم', full_name_en: 'Maryam', grade: '12', track: 'عام', section: '1', action: 'update', sourceRow: 3 }]);
  assert.deepEqual(rows, [{ student_number: '1', full_name: 'مريم', full_name_ar: 'مريم', full_name_en: 'Maryam', grade: '12', track: 'عام', section: '1' }]);
});
