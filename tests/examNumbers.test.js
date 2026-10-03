import test from 'node:test';
import assert from 'node:assert/strict';
import { filterExamsByGrade, getExamNumbers } from '../src/lib/examNumbers.js';

test('assigns stable automatic numbers in creation order while preserving the input list', () => {
  const exams = [
    { id: 12, created_at: '2026-10-03T10:00:00Z' },
    { id: 7, created_at: '2026-10-01T10:00:00Z' },
    { id: 10, created_at: '2026-10-02T10:00:00Z' },
  ];

  const numbers = getExamNumbers(exams);

  assert.deepEqual([...numbers], [['7', 1], ['10', 2], ['12', 3]]);
  assert.deepEqual(exams.map((exam) => exam.id), [12, 7, 10]);
});

test('uses the database id to order exams created at the same time', () => {
  const numbers = getExamNumbers([
    { id: 4, created_at: '2026-10-01T10:00:00Z' },
    { id: 3, created_at: '2026-10-01T10:00:00Z' },
  ]);

  assert.equal(numbers.get('3'), 1);
  assert.equal(numbers.get('4'), 2);
});

test('filters exams by the selected grade and keeps unassigned exams in the all-grades view', () => {
  const exams = [
    { id: 1, target_grade: '10' },
    { id: 2, target_grade: 11 },
    { id: 3, target_grade: null },
  ];

  assert.deepEqual(filterExamsByGrade(exams, '10').map((exam) => exam.id), [1]);
  assert.deepEqual(filterExamsByGrade(exams, '11').map((exam) => exam.id), [2]);
  assert.deepEqual(filterExamsByGrade(exams, '').map((exam) => exam.id), [1, 2, 3]);
});
