import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentTemplate, parseStudentWorkbook, validateStudentRows } from '../src/lib/studentWorkbook.js';

test('creates a template with the required headers, example, and reference sheet', async () => {
  const workbook = createStudentTemplate();
  const students = workbook.getWorksheet('Students');
  const references = workbook.getWorksheet('Reference');
  assert.ok(students);
  assert.ok(references);
  assert.deepEqual(students.getRow(1).values.slice(1), ['student_number', 'full_name', 'grade', 'track', 'section']);
  assert.equal(students.getRow(2).getCell(2).value, 'مثال: أحمد محمد');
  assert.equal(references.getCell('A1').value, 'grade');
  assert.ok((await workbook.xlsx.writeBuffer()).byteLength > 0);
});

test('validates valid rows and recognizes database IDs as updates', () => {
  const result = validateStudentRows([
    { student_number: '10001', full_name: 'طالبة', grade: '12', track: 'عام', section: '1' },
    { student_number: '10002', full_name: 'طالب', grade: '10', track: 'متقدم', section: '1' },
  ], new Set(['10001']));
  assert.equal(result.validRows.length, 2);
  assert.deepEqual(result.validRows.map((row) => row.action), ['update', 'insert']);
  assert.equal(result.invalidRows.length, 0);
});

test('rejects invalid academic combinations and duplicate IDs in one workbook', () => {
  const result = validateStudentRows([
    { student_number: '10001', full_name: 'طالبة', grade: '10', track: 'عام', section: '1' },
    { student_number: '10002', full_name: '', grade: '12', track: 'عام', section: '1' },
    { student_number: '10003', full_name: 'طالب', grade: '12', track: 'عام', section: '2' },
    { student_number: '10003', full_name: 'طالب مكرر', grade: '12', track: 'عام', section: '2' },
  ]);
  assert.equal(result.validRows.length, 0);
  assert.equal(result.invalidRows.length, 4);
  assert.match(result.invalidRows[0].errors.join(' '), /الصف|المسار|الشعبة/);
  assert.match(result.invalidRows[3].errors.join(' '), /مكرر/);
});

test('parses uploaded XLSX rows from the documented worksheet', async () => {
  const workbook = createStudentTemplate();
  const sheet = workbook.getWorksheet('Students');
  sheet.addRow(['20001', 'مريم', '11', 'متقدم', '2']);
  const parsed = await parseStudentWorkbook(await workbook.xlsx.writeBuffer());
  assert.equal(parsed.validRows.length, 1);
  assert.equal(parsed.validRows[0].student_number, '20001');
});

test('rejects workbook without the Students sheet and oversized uploads', async () => {
  const workbook = createStudentTemplate();
  workbook.removeWorksheet(workbook.getWorksheet('Students').id);
  await assert.rejects(parseStudentWorkbook(await workbook.xlsx.writeBuffer()), /ورقة باسم Students/);
  await assert.rejects(parseStudentWorkbook(new ArrayBuffer(10 * 1024 * 1024 + 1)), /10 MiB|size/i);
});
