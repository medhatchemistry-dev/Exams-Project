import { supabase } from '@/api/supabaseClient';
import { splitIntoBatches, toStudentWriteRows } from './studentRows.js';
export { splitIntoBatches, toStudentWriteRows } from './studentRows.js';

export async function listStudents({ search = '', grade = '', track = '', section = '', from = 0, pageSize = 100 } = {}) {
  let query = supabase.from('students').select('id, student_number, full_name, grade, track, section, created_at', { count: 'exact' }).order('grade').order('track').order('section').order('full_name').range(from, from + pageSize - 1);
  if (grade) query = query.eq('grade', grade);
  if (track) query = query.eq('track', track);
  if (section) query = query.eq('section', section);
  if (search.trim()) query = query.or(`full_name.ilike.%${search.trim().replace(/[,%()]/g, '')}%,student_number.ilike.%${search.trim().replace(/[,%()]/g, '')}%`);
  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}

export async function getExistingStudentNumbers(studentNumbers) {
  const existing = new Set();
  for (const batch of splitIntoBatches([...new Set(studentNumbers)])) {
    if (!batch.length) continue;
    const { data, error } = await supabase.from('students').select('student_number').in('student_number', batch);
    if (error) throw error;
    for (const row of data || []) existing.add(row.student_number);
  }
  return existing;
}

export async function upsertStudents(rows, onBatchComplete = () => {}) {
  let processed = 0;
  const batches = splitIntoBatches(toStudentWriteRows(rows));
  for (let index = 0; index < batches.length; index++) {
    const { error } = await supabase.from('students').upsert(batches[index], { onConflict: 'student_number' });
    if (error) throw Object.assign(new Error(error.message), { batchIndex: index + 1, processed });
    processed += batches[index].length;
    onBatchComplete({ batchIndex: index + 1, batchCount: batches.length, processed, total: rows.length });
  }
  return { processed, batchCount: batches.length };
}

export async function saveStudent(student, existingId = null) {
  const table = supabase.from('students');
  const result = existingId
    ? await table.update(toStudentWriteRows([student])[0]).eq('id', existingId).select('id').single()
    : await table.insert(toStudentWriteRows([student])[0]).select('id').single();
  if (result.error) throw result.error;
  return result.data;
}

export async function deleteStudent(id) {
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) throw error;
}
