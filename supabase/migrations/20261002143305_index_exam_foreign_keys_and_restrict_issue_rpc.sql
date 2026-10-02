create index if not exists exam_results_exam_id_idx on public.exam_results (exam_id);
create index if not exists exams_created_by_idx on public.exams (created_by);
revoke all on function public.issue_exam_access_code(bigint, text, timestamptz) from public, anon;
grant execute on function public.issue_exam_access_code(bigint, text, timestamptz) to authenticated;
