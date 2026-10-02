import ExcelJS from 'exceljs';
import { STRUCTURE } from './academicStructure.js';

export const MAX_STUDENT_WORKBOOK_BYTES = 10 * 1024 * 1024;
export const MAX_STUDENT_ROWS = 5000;
export const STUDENT_COLUMNS = ['student_number', 'full_name_ar', 'full_name_en', 'grade', 'track', 'section'];

function stringValue(value) {
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value) return String(value.text ?? '').trim();
  if (typeof value === 'object' && 'result' in value) return stringValue(value.result);
  if (typeof value === 'object' && Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? '').join('').trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return String(value).trim();
}

function makeStudentWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Students');
  worksheet.columns = [
    { header: 'student_number (رقم الطالب)', key: 'student_number', width: 26, style: { numFmt: '@' } },
    { header: 'full_name_ar (الاسم بالعربية)', key: 'full_name_ar', width: 32 },
    { header: 'full_name_en (الاسم بالإنجليزية)', key: 'full_name_en', width: 34 },
    { header: 'grade (الصف)', key: 'grade', width: 18 },
    { header: 'track (المسار)', key: 'track', width: 24 },
    { header: 'section (الشعبة)', key: 'section', width: 20 },
  ];
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B64' } };
  worksheet.addRow({ student_number: '00000', full_name_ar: 'مثال: أحمد محمد', full_name_en: 'Example: Ahmed Mohamed', grade: '12', track: 'عام', section: '1' });
  worksheet.getRow(2).font = { italic: true, color: { argb: 'FF64748B' } };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = 'A1:F1';

  const reference = workbook.addWorksheet('Reference');
  reference.columns = [
    { header: 'grade (الصف)', key: 'grade', width: 18 },
    { header: 'track (المسار)', key: 'track', width: 24 },
    { header: 'section (الشعبة)', key: 'section', width: 20 },
  ];
  for (const [grade, tracks] of Object.entries(STRUCTURE)) {
    for (const [track, sections] of Object.entries(tracks)) {
      for (const section of sections) reference.addRow({ grade, track, section });
    }
  }
  reference.state = 'visible';
  return workbook;
}

export function createStudentTemplate() {
  return makeStudentWorkbook();
}

export function validateStudentRows(rows, existingStudentNumbers = new Set()) {
  if (!Array.isArray(rows)) throw new TypeError('Student rows must be an array');
  if (rows.length > MAX_STUDENT_ROWS) throw new Error(`Workbook exceeds ${MAX_STUDENT_ROWS} student rows`);

  const normalized = rows.map((row) => ({
    student_number: stringValue(row.student_number),
    full_name_ar: stringValue(row.full_name_ar),
    full_name_en: stringValue(row.full_name_en),
    grade: stringValue(row.grade),
    track: stringValue(row.track),
    section: stringValue(row.section),
    sourceRow: row.sourceRow,
  }));
  const counts = new Map();
  for (const row of normalized) {
    if (row.student_number) counts.set(row.student_number, (counts.get(row.student_number) || 0) + 1);
  }

  const validRows = [];
  const invalidRows = [];
  normalized.forEach((row, index) => {
    const errors = [];
    if (!row.student_number || row.student_number.length > 80) errors.push('رقم الطالب مطلوب ويجب ألا يتجاوز 80 محرفاً.');
    if (!row.full_name_ar || row.full_name_ar.length > 160) errors.push('الاسم بالعربية مطلوب ويجب ألا يتجاوز 160 محرفاً.');
    if (!row.full_name_en || row.full_name_en.length > 160) errors.push('الاسم بالإنجليزية مطلوب ويجب ألا يتجاوز 160 محرفاً.');
    if (!STRUCTURE[row.grade]?.[row.track]?.includes(row.section)) errors.push('الصف أو المسار أو الشعبة غير معتمدة.');
    if (row.student_number && counts.get(row.student_number) > 1) errors.push('رقم الطالب مكرر داخل الملف.');
    const { sourceRow = index + 2, ...student } = row;
    if (errors.length) invalidRows.push({ sourceRow, student, errors });
    else validRows.push({ ...student, action: existingStudentNumbers.has(student.student_number) ? 'update' : 'insert' });
  });

  return { validRows, invalidRows, rowCount: rows.length };
}

export async function parseStudentWorkbook(input, existingStudentNumbers = new Set()) {
  const bytes = input instanceof ArrayBuffer ? input.byteLength : input?.byteLength ?? input?.size ?? 0;
  if (!bytes) throw new Error('اختر ملف Excel صالحاً.');
  if (bytes > MAX_STUDENT_WORKBOOK_BYTES) throw new Error('حجم ملف Excel يجب ألا يتجاوز 10 MiB.');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input);
  const worksheet = workbook.getWorksheet('Students');
  if (!worksheet) throw new Error('الملف لا يحتوي ورقة باسم Students. حمّل القالب واستخدمه.');
  const headerValues = worksheet.getRow(1).values.slice(1).map((value) => stringValue(value).toLowerCase().split(' (')[0].trim());
  const columnIndexes = Object.fromEntries(STUDENT_COLUMNS.map((column) => [column, headerValues.indexOf(column) + 1]));
  const missing = STUDENT_COLUMNS.filter((column) => !columnIndexes[column]);
  if (missing.length) throw new Error(`الأعمدة المطلوبة غير موجودة: ${missing.join(', ')}`);
  if (Math.max(0, worksheet.rowCount - 2) > MAX_STUDENT_ROWS) throw new Error(`الملف يتجاوز ${MAX_STUDENT_ROWS} طالب.`);

  const rows = [];
  worksheet.eachRow((excelRow, rowNumber) => {
    const row = Object.fromEntries(STUDENT_COLUMNS.map((column) => [column, stringValue(excelRow.getCell(columnIndexes[column]).value)]));
    if (Object.values(row).every((value) => !value)) return;
    if (rowNumber === 2 && row.student_number === '00000' && row.full_name_ar.startsWith('مثال:')) return;
    rows.push({ ...row, sourceRow: rowNumber });
  });
  if (!rows.length) throw new Error('لم يتم العثور على طلاب بعد صف المثال.');
  return validateStudentRows(rows, existingStudentNumbers);
}

export async function downloadStudentTemplate() {
  const workbook = createStudentTemplate();
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'student-roster-template.xlsx';
  anchor.click();
  URL.revokeObjectURL(url);
}
