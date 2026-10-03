import ExcelJS from 'exceljs';
import { STRUCTURE } from './academicStructure.js';

export const MAX_STUDENT_WORKBOOK_BYTES = 10 * 1024 * 1024;
export const MAX_STUDENT_ROWS = 5000;
export const STUDENT_COLUMNS = ['student_number', 'full_name_ar', 'full_name_en', 'grade', 'track', 'section'];

const HEADER_ALIASES = {
  student_number: ['student number', 'student id', 'student no', 'id number', 'id', 'رقم الطالب', 'الرقم الطلابي', 'الرقم المدرسي', 'رقم الطالب المدرسي'],
  full_name_ar: ['full name ar', 'arabic name', 'arabic student name', 'name ar', 'student name ar', 'اسم الطالب بالعربية', 'الاسم العربي', 'الاسم باللغة العربية', 'اسم الطالب', 'الاسم الكامل'],
  full_name_en: ['full name en', 'english name', 'name en', 'student name en', 'اسم الطالب بالانجليزية', 'الاسم الانجليزي', 'الاسم باللغة الانجليزية'],
  grade: ['grade', 'class grade', 'year level', 'الصف', 'الصف الدراسي', 'المرحلة'],
  track: ['track', 'stream', 'path', 'المسار', 'التخصص'],
  section: ['section', 'class section', 'classroom', 'الشعبة', 'الفصل', 'الصف الفرعي'],
};

const NAME_PART_ALIASES = {
  first_ar: ['first name ar', 'arabic first name', 'الاسم الاول', 'الاسم الأول'],
  middle_ar: ['middle name ar', 'arabic middle name', 'اسم الاب', 'اسم الأب', 'اسم الجد'],
  last_ar: ['last name ar', 'family name ar', 'arabic family name', 'اسم العائلة', 'اللقب'],
  first_en: ['first name en', 'english first name'],
  middle_en: ['middle name en', 'english middle name'],
  last_en: ['last name en', 'family name en', 'english family name'],
};

function normalizeHeader(value) {
  return stringValue(value)
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .toLowerCase()
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[_().:/\\-]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function headerField(value) {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => {
      const candidate = normalizeHeader(alias);
      const splitName = /^(first|middle|last) name /.test(normalized);
      return candidate === normalized || (!splitName && candidate.length >= 4 && normalized.includes(candidate));
    })) return field;
  }
  for (const [part, aliases] of Object.entries(NAME_PART_ALIASES)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) return part;
  }
  return null;
}

function inspectHeaderRow(row) {
  const labels = row.values.slice(1).map((value) => stringValue(value));
  const columns = Object.create(null);
  const parts = Object.create(null);
  let recognized = 0;
  labels.forEach((label, offset) => {
    const field = headerField(label);
    if (!field) return;
    recognized += 1;
    const target = field in NAME_PART_ALIASES ? parts : columns;
    if (target[field] === undefined) target[field] = offset + 1;
  });
  if (!columns.full_name_ar && (parts.first_ar || parts.middle_ar || parts.last_ar)) columns.full_name_ar = { first_ar: parts.first_ar, middle_ar: parts.middle_ar, last_ar: parts.last_ar };
  if (!columns.full_name_en && (parts.first_en || parts.middle_en || parts.last_en)) columns.full_name_en = { first_en: parts.first_en, middle_en: parts.middle_en, last_en: parts.last_en };
  return { labels, columns, recognized };
}

function findStudentSheet(workbook) {
  const preferred = workbook.getWorksheet('Students');
  const sheets = [preferred, ...workbook.worksheets.filter((sheet) => sheet !== preferred && sheet.name.toLowerCase() !== 'reference')].filter(Boolean);
  let best = null;
  for (const worksheet of sheets) {
    for (let rowNumber = 1; rowNumber <= Math.min(15, worksheet.rowCount); rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const inspected = inspectHeaderRow(row);
      const score = inspected.recognized + (worksheet === preferred ? 0.25 : 0);
      if (score >= 2 && (!best || score > best.score)) {
        best = { worksheet, headerRow: rowNumber, ...inspected, score };
      }
    }
  }
  if (best) return best;

  const worksheet = preferred || workbook.worksheets[0];
  if (!worksheet) throw new Error('لم يتم العثور على ورقة بيانات في الملف.');
  throw new Error('لم أجد ورقة بيانات طلاب بعناوين يمكن التعرف عليها. استخدم قالب الطلاب أو أضف عناوين مثل رقم الطالب والاسم بالعربية.');
}

function readMappedValue(row, column) {
  if (!column) return '';
  if (typeof column === 'number') return stringValue(row.getCell(column).value);
  return Object.values(column).filter(Number.isInteger).map((index) => stringValue(row.getCell(index).value)).filter(Boolean).join(' ').trim();
}

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
    if (row.full_name_en.length > 160) errors.push('الاسم بالإنجليزية يجب ألا يتجاوز 160 محرفاً.');
    if (!STRUCTURE[row.grade]?.[row.track]?.includes(row.section)) errors.push('الصف أو المسار أو الشعبة غير معتمدة.');
    if (row.student_number && counts.get(row.student_number) > 1) errors.push('رقم الطالب مكرر داخل الملف.');
    const { sourceRow = index + 2, ...student } = row;
    if (errors.length) invalidRows.push({ sourceRow, student, errors });
    else validRows.push({ ...student, action: existingStudentNumbers.has(student.student_number) ? 'update' : 'insert' });
  });

  return { validRows, invalidRows, rowCount: rows.length };
}

export async function parseStudentWorkbook(input, existingStudentNumbers = new Set(), options = {}) {
  const bytes = input instanceof ArrayBuffer ? input.byteLength : input?.byteLength ?? input?.size ?? 0;
  if (!bytes) throw new Error('اختر ملف Excel صالحاً.');
  if (bytes > MAX_STUDENT_WORKBOOK_BYTES) throw new Error('حجم ملف Excel يجب ألا يتجاوز 10 MiB.');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(input);
  const { worksheet, headerRow, columns } = findStudentSheet(workbook);
  const defaults = options.defaultValues || {};
  const unmappedFields = STUDENT_COLUMNS.filter((field) => !columns[field]);
  if (typeof options.suggestHeaderMapping === 'function' && unmappedFields.length) {
    try {
      const labels = worksheet.getRow(headerRow).values.slice(1).map((label, index) => ({ index: index + 1, label: stringValue(label) })).filter(({ label }) => label);
      const suggestions = await options.suggestHeaderMapping(labels, unmappedFields);
      const validIndexes = new Set(labels.map(({ index }) => index));
      for (const field of ['student_number', 'full_name_ar', 'full_name_en', 'grade', 'track', 'section']) {
        const index = suggestions?.[field];
        if (!columns[field] && Number.isInteger(index) && validIndexes.has(index)) columns[field] = index;
      }
    } catch {
      // Deterministic aliases and the review preview remain available if Jev is not configured.
    }
  }
  if (Math.max(0, worksheet.rowCount - 2) > MAX_STUDENT_ROWS) throw new Error(`الملف يتجاوز ${MAX_STUDENT_ROWS} طالب.`);

  const rows = [];
  worksheet.eachRow((excelRow, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const row = Object.fromEntries(STUDENT_COLUMNS.map((column) => [column, (columns[column] ? readMappedValue(excelRow, columns[column]) : '') || String(defaults[column] ?? '')]));
    if (Object.values(row).every((value) => !value)) return;
    if (row.student_number === '00000' && row.full_name_ar.startsWith('مثال:')) return;
    rows.push({ ...row, sourceRow: rowNumber });
  });
  if (!rows.length) throw new Error('لم أجد بيانات طلاب أسفل عناوين الأعمدة.');
  return { ...validateStudentRows(rows, existingStudentNumbers), worksheet: worksheet.name, headerRow };
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
