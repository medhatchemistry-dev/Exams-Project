alter table public.exams
  add column target_grade text,
  add column target_track text,
  add column target_section text,
  add column completed_at timestamptz,
  add constraint exams_target_class_valid check (
    (target_grade is null and target_track is null and target_section is null)
    or (target_grade = '10' and target_track = 'متقدم' and target_section = '1')
    or (target_grade = '11' and target_track = 'متقدم' and target_section in ('1', '2'))
    or (target_grade = '11' and target_track = 'عام' and target_section = '1')
    or (target_grade = '12' and target_track in ('متقدم', 'عام') and target_section in ('1', '2'))
  );

create or replace function public.resolve_exam_access_code(candidate text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_code public.exam_access_codes;
  matched_exam public.exams;
begin
  if candidate is null or length(candidate) not between 1 and 64 then
    return jsonb_build_object('valid', false);
  end if;

  select * into matched_code
  from public.exam_access_codes
  where code = candidate
    and is_active
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  if matched_code.exam_id is null then
    return jsonb_build_object('valid', true, 'legacy', true);
  end if;

  select * into matched_exam
  from public.exams
  where id = matched_code.exam_id and status = 'available' and completed_at is null;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  return jsonb_build_object(
    'valid', true,
    'legacy', false,
    'examId', matched_exam.id,
    'examTitle', matched_exam.title,
    'certificateTemplateId', matched_exam.certificate_template_id,
    'targetGrade', matched_exam.target_grade,
    'targetTrack', matched_exam.target_track,
    'targetSection', matched_exam.target_section,
    'banks', matched_exam.banks
  );
end;
$$;

revoke all on function public.resolve_exam_access_code(text) from public, anon, authenticated;
grant execute on function public.resolve_exam_access_code(text) to service_role;

create or replace function public.reject_access_code_for_completed_exam()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target public.exams;
begin
  if new.is_active and new.exam_id is not null then
    select * into target from public.exams where id = new.exam_id for update;
    if target.completed_at is not null then
      raise exception 'Exam is already marked complete' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger exam_access_code_not_completed
  before insert or update of is_active, exam_id on public.exam_access_codes
  for each row execute function public.reject_access_code_for_completed_exam();

create or replace function public.enforce_exam_result_target_class()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target public.exams;
begin
  if new.exam_id is null then return new; end if;

  select * into target from public.exams where id = new.exam_id for update;
  if not found then
    raise exception 'Exam is unavailable' using errcode = '22023';
  end if;
  if target.completed_at is not null then
    raise exception 'Exam has been marked complete' using errcode = '22023';
  end if;
  if target.target_grade is not null and (
    new.grade is distinct from target.target_grade
    or new.track is distinct from target.target_track
    or new.section is distinct from target.target_section
  ) then
    raise exception 'Student class does not match this exam' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger exam_result_target_class
  before insert or update of exam_id, grade, track, section on public.exam_results
  for each row execute function public.enforce_exam_result_target_class();

create or replace function public.complete_exam(target_exam_id bigint)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  teacher_id uuid := auth.uid();
  completed_time timestamptz;
begin
  if teacher_id is null or not exists (
    select 1 from public.teacher_roles where user_id = teacher_id
  ) then
    raise exception 'Teacher role required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(73410291);
  perform 1 from public.exams where id = target_exam_id and status = 'available' for update;
  if not found then
    raise exception 'Exam is unavailable' using errcode = '22023';
  end if;

  update public.exam_access_codes set is_active = false
  where exam_id = target_exam_id and is_active;

  update public.exams set completed_at = coalesce(completed_at, now()), updated_at = now()
  where id = target_exam_id and status = 'available'
  returning completed_at into completed_time;

  if completed_time is null then
    raise exception 'Exam is unavailable' using errcode = '22023';
  end if;
  return completed_time;
end;
$$;

revoke all on function public.complete_exam(bigint) from public, anon;
grant execute on function public.complete_exam(bigint) to authenticated;
