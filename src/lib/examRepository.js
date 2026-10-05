import { supabase } from '@/api/supabaseClient';

export async function listExams() {
  const { data, error } = await supabase.from('exams')
    .select('id, title, source_filename, banks, status, certificate_template_id, target_grade, target_track, target_section, duration_minutes, current_revision, completed_at, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const { data: codes, error: codeError } = await supabase.from('exam_access_codes')
    .select('exam_id, expires_at').eq('is_active', true).not('exam_id', 'is', null);
  if (codeError) throw codeError;
  const runningExamIds = new Set((codes || [])
    .filter((code) => !code.expires_at || new Date(code.expires_at).getTime() > Date.now())
    .map((code) => Number(code.exam_id)));
  return (data || []).map((exam) => ({
    ...exam,
    isRunning: exam.status === 'available' && !exam.completed_at && runningExamIds.has(Number(exam.id)),
    bankSummary: Object.entries(exam.banks || {}).map(([key, questions]) => `${key}: ${Array.isArray(questions) ? questions.length : 0}`),
  }));
}

export async function saveExam(exam) {
  const { data, error } = await supabase.from('exams').insert(exam)
    .select('id, title, status, target_grade, target_track, target_section, duration_minutes, current_revision, completed_at').single();
  if (error) throw error;
  return data;
}

export async function archiveExam(examId) {
  const { error } = await supabase.rpc('set_exam_archived', { target_exam_id: Number(examId), should_archive: true });
  if (error) throw error;
}

export async function restoreExam(examId) {
  const { error } = await supabase.rpc('set_exam_archived', { target_exam_id: Number(examId), should_archive: false });
  if (error) throw error;
}

export async function publishExamRevision(exam) {
  const { data, error } = await supabase.rpc('publish_exam_revision', {
    target_exam_id: Number(exam.id),
    next_title: exam.title,
    next_source_filename: exam.source_filename,
    next_banks: exam.banks,
    next_target_grade: exam.target_grade || null,
    next_target_track: exam.target_track || null,
    next_target_section: exam.target_section || null,
    next_duration_minutes: exam.duration_minutes ? Number(exam.duration_minutes) : null,
  });
  if (error) throw error;
  return data;
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
      .select('id, title, source_filename, banks, status, target_grade, target_track, target_section, duration_minutes, current_revision, completed_at, created_at')
      .eq('id', numericId).single(),
    supabase.from('exam_access_codes')
      .select('code, expires_at, is_active, created_at')
      .eq('exam_id', numericId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('exam_results')
      .select('id, student_name, student_number, grade, track, section, score, total, percentage, created_at')
      .eq('exam_id', numericId).order('created_at', { ascending: false }),
    supabase.from('exam_attempts')
      .select('id, student_name, student_number, started_at, locked_at, warning_count, completed_at, closed_at')
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

export async function listExamRoster(exam) {
  if (!exam?.target_grade || !exam?.target_track || !exam?.target_section) return [];
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('students')
      .select('student_number, full_name, full_name_ar, full_name_en, grade, track, section')
      .eq('grade', exam.target_grade).eq('track', exam.target_track).eq('section', exam.target_section)
      .order('student_number').range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}
