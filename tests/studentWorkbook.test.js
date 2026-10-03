import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentTemplate, parseStudentWorkbook, validateStudentRows } from '../src/lib/studentWorkbook.js';

test('creates a template with the required headers, example, and reference sheet', async () => {
  const workbook = createStudentTemplate();
  const students = workbook.getWorksheet('Students');
  const references = workbook.getWorksheet('Reference');
  assert.ok(students);
  assert.ok(references);
  assert.deepEqual(students.getRow(1).values.slice(1), ['student_number (رقم الطالب)', 'full_name_ar (الاسم بالعربية)', 'full_name_en (الاسم بالإنجليزية)', 'grade (الصف)', 'track (المسار)', 'section (الشعبة)']);
  assert.equal(students.getRow(2).getCell(2).value, 'مثال: أحمد محمد');
  assert.equal(students.getRow(2).getCell(3).value, 'Example: Ahmed Mohamed');
  assert.equal(references.getCell('A1').value, 'grade (الصف)');
  assert.ok((await workbook.xlsx.writeBuffer()).byteLength > 0);
});

test('validates valid rows and recognizes database IDs as updates', () => {
  const result = validateStudentRows([
    { student_number: '10001', full_name_ar: 'طالبة', full_name_en: 'Student A', grade: '12', track: 'عام', section: '1' },
    { student_number: '10002', full_name_ar: 'طالب', full_name_en: 'Student B', grade: '10', track: 'متقدم', section: '1' },
  ], new Set(['10001']));
  assert.equal(result.validRows.length, 2);
  assert.deepEqual(result.validRows.map((row) => row.action), ['update', 'insert']);
  assert.equal(result.invalidRows.length, 0);
});

test('rejects invalid academic combinations and duplicate IDs in one workbook', () => {
  const result = validateStudentRows([
    { student_number: '10001', full_name_ar: 'طالبة', full_name_en: 'Student A', grade: '10', track: 'عام', section: '1' },
    { student_number: '10002', full_name_ar: '', full_name_en: '', grade: '12', track: 'عام', section: '1' },
    { student_number: '10003', full_name_ar: 'طالب', full_name_en: 'Student C', grade: '12', track: 'عام', section: '2' },
    { student_number: '10003', full_name_ar: 'طالب مكرر', full_name_en: 'Duplicate Student', grade: '12', track: 'عام', section: '2' },
  ]);
  assert.equal(result.validRows.length, 0);
  assert.equal(result.invalidRows.length, 4);
  assert.match(result.invalidRows[0].errors.join(' '), /الصف|المسار|الشعبة/);
  assert.match(result.invalidRows[3].errors.join(' '), /مكرر/);
});

test('parses uploaded XLSX rows from the documented worksheet', async () => {
  const workbook = createStudentTemplate();
  const sheet = workbook.getWorksheet('Students');
  sheet.addRow(['20001', 'مريم', 'Maryam', '11', 'متقدم', '2']);
  const parsed = await parseStudentWorkbook(await workbook.xlsx.writeBuffer());
  assert.equal(parsed.validRows.length, 1);
  assert.equal(parsed.validRows[0].student_number, '20001');
});

test('rejects workbook without student data and oversized uploads', async () => {
  const workbook = createStudentTemplate();
  workbook.removeWorksheet(workbook.getWorksheet('Students').id);
  await assert.rejects(parseStudentWorkbook(await workbook.xlsx.writeBuffer()), /بيانات طلاب/);
  await assert.rejects(parseStudentWorkbook(new ArrayBuffer(10 * 1024 * 1024 + 1)), /10 MiB|size/i);
});

test('reads reordered bilingual headers below title rows from a differently named sheet', async () => {
  const workbook = createStudentTemplate();
  workbook.removeWorksheet(workbook.getWorksheet('Students').id);
  const roster = workbook.addWorksheet('Roster 2026');
  roster.addRow(['School roster']);
  roster.addRow([]);
  roster.addRow(['Arabic Student Name', 'Student No.', 'Grade', 'Track', 'Section']);
  roster.addRow(['مريم علي', '002001', '11', 'متقدم', '2']);

  const parsed = await parseStudentWorkbook(await workbook.xlsx.writeBuffer());
  assert.equal(parsed.worksheet, 'Roster 2026');
  assert.equal(parsed.headerRow, 3);
  assert.equal(parsed.validRows[0].student_number, '002001');
  assert.equal(parsed.validRows[0].full_name_ar, 'مريم علي');
  assert.equal(parsed.validRows[0].full_name_en, '');
});

test('combines split names and fills missing class columns from selected filters', async () => {
  const workbook = createStudentTemplate();
  const sheet = workbook.getWorksheet('Students');
  sheet.spliceRows(1, sheet.rowCount, ['رقم الطالب', 'First Name AR', 'Middle Name AR', 'Last Name AR', 'First Name EN', 'Last Name EN']);
  sheet.addRow(['002002', 'نور', 'محمد', 'علي', 'Noor', 'Ali']);

  const parsed = await parseStudentWorkbook(await workbook.xlsx.writeBuffer(), new Set(), {
    defaultValues: { grade: '12', track: 'عام', section: '1' },
  });
  assert.equal(parsed.validRows.length, 1);
  assert.equal(parsed.validRows[0].full_name_ar, 'نور محمد علي');
  assert.equal(parsed.validRows[0].full_name_en, 'Noor Ali');
  assert.equal(parsed.validRows[0].grade, '12');
});

test('uses an injected header suggestion only when deterministic matching misses a field', async () => {
  const workbook = new (await import('exceljs')).default.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow(['رقم مدرسي', 'اسم الطالبة', 'الصف', 'المسار', 'الشعبة']);
  sheet.addRow(['002003', 'أمل صالح', '11', 'عام', '1']);
  let suggestionRequest;
  const parsed = await parseStudentWorkbook(await workbook.xlsx.writeBuffer(), new Set(), {
    suggestHeaderMapping: async (headers, fields) => {
      suggestionRequest = { headers, fields };
      return { student_number: 1, full_name_ar: 2 };
    },
  });
  assert.equal(suggestionRequest.fields.includes('student_number'), true);
  assert.equal(parsed.validRows[0].student_number, '002003');
});
