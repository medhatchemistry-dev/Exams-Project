create or replace function public.issue_exam_access_code(
  target_exam_id bigint,
  new_code text,
  new_expires_at timestamptz default null
)
returns public.exam_access_codes
language plpgsql
security definer
set search_path = ''
as $$
declare
  teacher_id uuid := auth.uid();
  created_code public.exam_access_codes;
begin
  if teacher_id is null or not exists (
    select 1 from public.teacher_roles where user_id = teacher_id
  ) then
    raise exception 'Teacher role required' using errcode = '42501';
  end if;

  if new_code is null or new_code !~ '^[0-9]{5,10}$' then
    raise exception 'Access code must contain 5 to 10 digits' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.exams
    where id = target_exam_id and status = 'available'
  ) then
    raise exception 'Exam is unavailable' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(73410291);
  update public.exam_access_codes set is_active = false where is_active;
  insert into public.exam_access_codes (code, expires_at, created_by, exam_id)
  values (new_code, new_expires_at, teacher_id, target_exam_id)
  returning * into created_code;

  return created_code;
end;
$$;

revoke all on function public.issue_exam_access_code(bigint, text, timestamptz) from public, anon;
grant execute on function public.issue_exam_access_code(bigint, text, timestamptz) to authenticated;
