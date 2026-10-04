create or replace function public.start_exam_attempt(
  candidate_code text,
  student_name_input text,
  student_number_input text,
  grade_input text,
  track_input text,
  section_input text,
  presented_questions_input jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  active_code public.exam_access_codes;
  target_exam public.exams;
  presented jsonb;
  canonical jsonb;
  attempt_id uuid;
begin
  select * into active_code from public.exam_access_codes
    where code = candidate_code and is_active and (expires_at is null or expires_at > now())
    order by created_at desc limit 1 for update;
  if not found or active_code.exam_id is null then raise exception 'Exam unavailable' using errcode = '22023'; end if;
  select * into target_exam from public.exams where id = active_code.exam_id for update;
  if not found or target_exam.status <> 'available' or target_exam.completed_at is not null then
    raise exception 'Exam unavailable' using errcode = '22023';
  end if;
  if student_name_input is null or length(trim(student_name_input)) not between 1 and 160
    or student_number_input is null or length(trim(student_number_input)) not between 1 and 80
    or grade_input not in ('10','11','12') or track_input not in ('متقدم','عام') or section_input not in ('1','2')
    or jsonb_typeof(presented_questions_input) is distinct from 'array' then
    raise exception 'Invalid attempt details' using errcode = '22023';
  end if;
  if jsonb_array_length(presented_questions_input) not between 1 and 100 then
    raise exception 'Invalid attempt details' using errcode = '22023';
  end if;
  if target_exam.target_grade is not null and (grade_input is distinct from target_exam.target_grade
    or track_input is distinct from target_exam.target_track or section_input is distinct from target_exam.target_section) then
    raise exception 'Student class does not match this exam' using errcode = '22023';
  end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(presented_questions_input))
    <> jsonb_array_length(presented_questions_input) then
    raise exception 'Question IDs must be unique' using errcode = '22023';
  end if;
  for presented in select value from jsonb_array_elements(presented_questions_input) loop
    if presented ? 'answer' or jsonb_typeof(presented->'id') is distinct from 'string' then
      raise exception 'Invalid public question snapshot' using errcode = '22023';
    end if;
    select question into canonical from jsonb_array_elements(target_exam.banks->(grade_input || '-' || track_input)) bank(question)
      where bank.question->>'id' = presented->>'id' limit 1;
    if canonical is null or jsonb_typeof(canonical->'options') is distinct from 'array'
      or jsonb_typeof(presented->'options') is distinct from 'array' then
      raise exception 'Question is not part of this exam' using errcode = '22023';
    end if;
    if jsonb_array_length(presented->'options') <> jsonb_array_length(canonical->'options') then
      raise exception 'Question is not part of this exam' using errcode = '22023';
    end if;
    if canonical - 'answer' - 'options' <> presented - 'options' - 'index' then
      raise exception 'Question content does not match this exam' using errcode = '22023';
    end if;
    if (
      select array_agg(value::text order by value::text)
      from jsonb_array_elements(canonical->'options') as canonical_option(value)
    ) is distinct from (
      select array_agg(value::text order by value::text)
      from jsonb_array_elements(presented->'options') as presented_option(value)
    ) then
      raise exception 'Question options do not match this exam' using errcode = '22023';
    end if;
  end loop;
  insert into public.exam_attempts(exam_id, access_code_id, student_name, student_number, grade, track, section, presented_questions_json)
    values (target_exam.id, active_code.id, trim(student_name_input), trim(student_number_input), grade_input, track_input, section_input, presented_questions_input)
    returning id into attempt_id;
  insert into public.exam_activity_events(exam_id, attempt_id, event_type)
    values (target_exam.id, attempt_id, 'joined');
  return attempt_id;
end;
$$;
revoke all on function public.start_exam_attempt(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.start_exam_attempt(text, text, text, text, text, text, jsonb) to service_role;
