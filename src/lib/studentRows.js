export const STUDENT_UPSERT_BATCH_SIZE = 100;

export function splitIntoBatches(rows, batchSize = STUDENT_UPSERT_BATCH_SIZE) {
  if (!Array.isArray(rows) || !Number.isInteger(batchSize) || batchSize < 1) throw new TypeError('Invalid batch input');
  const batches = [];
  for (let index = 0; index < rows.length; index += batchSize) batches.push(rows.slice(index, index + batchSize));
  return batches;
}

export function toStudentWriteRows(rows) {
  return rows.map(({ student_number, full_name_ar, full_name_en, full_name, grade, track, section }) => ({
    student_number,
    full_name: full_name_ar || full_name,
    full_name_ar: full_name_ar || full_name,
    full_name_en,
    grade,
    track,
    section,
  }));
}
