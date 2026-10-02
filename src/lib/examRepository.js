import { supabase } from '@/api/supabaseClient';

export async function listExams() {
  const { data, error } = await supabase.from('exams')
    .select('id, title, source_filename, banks, status, certificate_template_id, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((exam) => ({
    ...exam,
    bankSummary: Object.entries(exam.banks || {}).map(([key, questions]) => `${key}: ${Array.isArray(questions) ? questions.length : 0}`),
  }));
}

export async function saveExam(exam) {
  const { data, error } = await supabase.from('exams').insert(exam).select('id, title, status').single();
  if (error) throw error;
  return data;
}

export async function archiveExam(examId) {
  const { data: activeCodes, error: codeError } = await supabase.from('exam_access_codes')
    .select('id').eq('exam_id', examId).eq('is_active', true).limit(1);
  if (codeError) throw codeError;
  if (activeCodes?.length) throw new Error('Deactivate the active exam code before archiving this exam.');
  const { error } = await supabase.from('exams').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', examId);
  if (error) throw error;
}

export async function saveExamCertificateTemplate(examId, templateId) {
  const { data, error } = await supabase.from('exams')
    .update({ certificate_template_id: Number(templateId), updated_at: new Date().toISOString() })
    .eq('id', examId)
    .select('id, certificate_template_id')
    .single();
  if (error) throw error;
  return data;
}
