import { supabase } from '@/api/supabaseClient';

export async function listExams() {
  const { data, error } = await supabase.from('exams')
    .select('id, title, source_filename, banks, status, certificate_template_id, target_grade, target_track, target_section, completed_at, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((exam) => ({
    ...exam,
    bankSummary: Object.entries(exam.banks || {}).map(([key, questions]) => `${key}: ${Array.isArray(questions) ? questions.length : 0}`),
  }));
}

export async function saveExam(exam) {
  const { data, error } = await supabase.from('exams').insert(exam)
    .select('id, title, status, target_grade, target_track, target_section, completed_at').single();
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

export async function completeExam(examId) {
  const { data, error } = await supabase.rpc('complete_exam', { target_exam_id: Number(examId) });
  if (error) throw error;
  return data;
}

export async function setExamPaused(examId, paused) {
  const { data, error } = await supabase.rpc('set_exam_paused', {
    target_exam_id: Number(examId),
    should_pause: Boolean(paused),
  });
  if (error) throw error;
  return data;
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

export async function getExamDetail(examId) {
  const numericId = Number(examId);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error('Invalid exam id');

  const [examResult, codeResult, resultResult, attemptResult, eventResult] = await Promise.all([
    supabase.from('exams')
      .select('id, title, source_filename, banks, status, target_grade, target_track, target_section, completed_at, created_at')
      .eq('id', numericId).single(),
    supabase.from('exam_access_codes')
      .select('code, expires_at, is_active, created_at')
      .eq('exam_id', numericId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('exam_results')
      .select('id, student_name, student_number, grade, track, section, score, total, percentage, created_at')
      .eq('exam_id', numericId).order('created_at', { ascending: false }),
    supabase.from('exam_attempts')
      .select('id, student_name, student_number, started_at, locked_at, warning_count, completed_at')
      .eq('exam_id', numericId).order('started_at', { ascending: false }),
    supabase.from('exam_activity_events')
      .select('id, attempt_id, event_type, details, created_at')
      .eq('exam_id', numericId).order('created_at', { ascending: false }).limit(200),
  ]);

  if (examResult.error) throw examResult.error;
  if (codeResult.error) throw codeResult.error;
  if (resultResult.error) throw resultResult.error;
  if (attemptResult.error) throw attemptResult.error;
  if (eventResult.error) throw eventResult.error;

  return { exam: examResult.data, accessCode: codeResult.data, results: resultResult.data || [], attempts: attemptResult.data || [], events: eventResult.data || [] };
}
