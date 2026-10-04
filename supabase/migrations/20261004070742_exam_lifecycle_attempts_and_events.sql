alter table public.exams
  drop constraint exams_status_check,
  add constraint exams_status_check check (status in ('available', 'paused', 'archived')),
  add column paused_at timestamptz;

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id bigint not null references public.exams(id) on delete cascade,
  access_code_id bigint not null references public.exam_access_codes(id) on delete restrict,
  student_name text not null check (length(trim(student_name)) between 1 and 160),
  student_number text not null check (length(trim(student_number)) between 1 and 80),
  grade text not null,
  track text not null,
  section text not null,
  started_at timestamptz not null default now(),
  locked_at timestamptz,
  warning_count integer not null default 0 check (warning_count between 0 and 3),
  answers_json jsonb not null default '{}'::jsonb,
  presented_questions_json jsonb not null,
  completed_result_id bigint references public.exam_results(id) on delete set null,
  completed_at timestamptz
);
create index exam_attempts_exam_started_idx on public.exam_attempts(exam_id, started_at desc);
alter table public.exam_attempts add column unlock_count integer not null default 0 check (unlock_count >= 0);
alter table public.exam_attempts enable row level security;
revoke all on public.exam_attempts from public, anon, authenticated, service_role;
grant select on public.exam_attempts to authenticated, service_role;
create policy "Teachers can read exam attempts"
  on public.exam_attempts for select to authenticated
  using (exists (select 1 from public.teacher_roles where user_id = (select auth.uid())));

create table public.exam_activity_events (
  id bigint generated always as identity primary key,
  exam_id bigint not null references public.exams(id) on delete cascade,
  attempt_id uuid references public.exam_attempts(id) on delete set null,
  event_type text not null check (event_type in ('joined', 'warning', 'locked', 'unlocked', 'fullscreen_exit', 'tab_hidden', 'window_blur', 'audio_unavailable')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.exam_activity_events drop constraint exam_activity_events_event_type_check;
alter table public.exam_activity_events add constraint exam_activity_events_event_type_check
  check (event_type in ('joined', 'warning', 'locked', 'unlocked', 'unlock_denied', 'submitted', 'paused', 'resumed', 'fullscreen_exit', 'tab_hidden', 'window_blur', 'audio_unavailable'));
create index exam_activity_events_exam_created_idx on public.exam_activity_events(exam_id, created_at desc);
alter table public.exam_activity_events enable row level security;
revoke all on public.exam_activity_events from public, anon, authenticated, service_role;
grant select on public.exam_activity_events to authenticated;
create policy "Teachers can read exam activity"
  on public.exam_activity_events for select to authenticated
  using (exists (select 1 from public.teacher_roles where user_id = (select auth.uid())));

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
    if exists (
      select 1 from jsonb_array_elements(canonical->'options') as canonical_option(value)
      where (select count(*) from jsonb_array_elements(presented->'options') as presented_option(value)
        where presented_option.value = canonical_option.value) <> 1
    ) then raise exception 'Question options do not match this exam' using errcode = '22023'; end if;
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

create or replace function public.record_exam_attempt_event(target_attempt_id uuid, event_name text, event_details jsonb default '{}'::jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  target_attempt public.exam_attempts;
  next_warnings integer;
begin
  if event_name not in ('warning','fullscreen_exit','tab_hidden','window_blur','audio_unavailable') then
    raise exception 'Invalid event type' using errcode = '22023';
  end if;
  select * into target_attempt from public.exam_attempts where id = target_attempt_id for update;
  if not found or target_attempt.completed_at is not null then raise exception 'Attempt unavailable' using errcode = '22023'; end if;
  next_warnings := target_attempt.warning_count;
  if event_name = 'warning' then next_warnings := least(3, next_warnings + 1); end if;
  update public.exam_attempts set warning_count = next_warnings,
    locked_at = case when next_warnings >= 3 then coalesce(locked_at, now()) else locked_at end
    where id = target_attempt_id;
  insert into public.exam_activity_events(exam_id, attempt_id, event_type, details)
    values (target_attempt.exam_id, target_attempt_id,
      case when event_name = 'warning' and next_warnings >= 3 then 'locked' else event_name end,
      jsonb_build_object(
        'signal', case when event_details->>'signal' in ('fullscreen_exit','tab_hidden','window_blur') then event_details->>'signal' else null end,
        'warning_count', next_warnings
      ));
  return next_warnings;
end;
$$;
revoke all on function public.record_exam_attempt_event(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_exam_attempt_event(uuid, text, jsonb) to service_role;

create or replace function public.set_exam_paused(target_exam_id bigint, should_pause boolean)
returns public.exams
language plpgsql security definer set search_path = ''
as $$
declare
  teacher_id uuid := auth.uid();
  target public.exams;
  pause_duration interval;
begin
  if teacher_id is null or not exists (select 1 from public.teacher_roles where user_id = teacher_id) then
    raise exception 'Teacher role required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(target_exam_id);
  perform 1 from public.exam_access_codes where exam_id = target_exam_id and is_active order by id for update;
  select * into target from public.exams where id = target_exam_id for update;
  if not found or target.completed_at is not null or target.status = 'archived' then
    raise exception 'Exam cannot change lifecycle state' using errcode = '22023';
  end if;
  if should_pause then
    if target.status <> 'available' then raise exception 'Exam is not available' using errcode = '22023'; end if;
    update public.exams set status = 'paused', paused_at = now(), updated_at = now()
      where id = target_exam_id returning * into target;
    insert into public.exam_activity_events(exam_id, event_type) values (target_exam_id, 'paused');
  else
    if target.status <> 'paused' or target.paused_at is null then raise exception 'Exam is not paused' using errcode = '22023'; end if;
    pause_duration := greatest(now() - target.paused_at, interval '0 seconds');
    update public.exam_access_codes
      set expires_at = expires_at + pause_duration
      where exam_id = target_exam_id and is_active and expires_at is not null;
    update public.exams set status = 'available', paused_at = null, updated_at = now()
      where id = target_exam_id returning * into target;
    insert into public.exam_activity_events(exam_id, event_type) values (target_exam_id, 'resumed');
  end if;
  return target;
end;
$$;
revoke all on function public.set_exam_paused(bigint, boolean) from public, anon;
grant execute on function public.set_exam_paused(bigint, boolean) to authenticated;

alter table public.access_code_attempts drop constraint access_code_attempts_purpose_check;
alter table public.access_code_attempts add constraint access_code_attempts_purpose_check
  check (purpose in ('teacher_login', 'exam_code', 'exam_reentry', 'exam_event', 'exam_start'));

create or replace function public.consume_access_attempt(client_hash text, attempt_purpose text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  recent_attempts integer;
  attempt_limit integer;
begin
  if client_hash is null or client_hash !~ '^[a-f0-9]{64}$'
    or attempt_purpose is null or attempt_purpose not in ('teacher_login', 'exam_code', 'exam_reentry', 'exam_event', 'exam_start') then
    return false;
  end if;
  attempt_limit := case when attempt_purpose = 'exam_code' then 60 when attempt_purpose in ('exam_event', 'exam_start') then 120 else 10 end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(attempt_purpose || ':' || client_hash, 0));
  delete from public.access_code_attempts where purpose = attempt_purpose and ip_hash = client_hash
    and attempted_at < now() - interval '15 minutes';
  select count(*)::integer into recent_attempts from public.access_code_attempts
    where purpose = attempt_purpose and ip_hash = client_hash and attempted_at >= now() - interval '15 minutes';
  if recent_attempts >= attempt_limit then return false; end if;
  insert into public.access_code_attempts(purpose, ip_hash) values (attempt_purpose, client_hash);
  return true;
end;
$$;
revoke all on function public.consume_access_attempt(text, text) from public, anon, authenticated;
grant execute on function public.consume_access_attempt(text, text) to service_role;

create or replace function public.unlock_exam_attempt(target_attempt_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  target public.exam_attempts;
  exam_state text;
  next_unlock_count integer;
begin
  select * into target from public.exam_attempts where id = target_attempt_id for update;
  if not found or target.locked_at is null or target.completed_at is not null then
    raise exception 'Attempt is not locked' using errcode = '22023';
  end if;
  select status into exam_state from public.exams where id = target.exam_id for share;
  if exam_state is distinct from 'available' then
    raise exception 'Exam is unavailable' using errcode = '22023';
  end if;
  next_unlock_count := target.unlock_count + 1;
  update public.exam_attempts set locked_at = null, unlock_count = next_unlock_count where id = target_attempt_id;
  insert into public.exam_activity_events(exam_id, attempt_id, event_type, details)
    values (target.exam_id, target_attempt_id, 'unlocked', jsonb_build_object('unlock_count', next_unlock_count));
  return target.warning_count;
end;
$$;
revoke all on function public.unlock_exam_attempt(uuid) from public, anon, authenticated;
grant execute on function public.unlock_exam_attempt(uuid) to service_role;

create or replace function public.record_exam_unlock_failure(target_attempt_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  target public.exam_attempts;
begin
  select * into target from public.exam_attempts where id = target_attempt_id;
  if found and target.locked_at is not null and target.completed_at is null then
    insert into public.exam_activity_events(exam_id, attempt_id, event_type)
      values (target.exam_id, target_attempt_id, 'unlock_denied');
  end if;
end;
$$;
revoke all on function public.record_exam_unlock_failure(uuid) from public, anon, authenticated;
grant execute on function public.record_exam_unlock_failure(uuid) to service_role;

create or replace function public.submit_exam_attempt_for_attempt(
  candidate_code text,
  student_name_input text,
  student_number_input text,
  grade_input text,
  track_input text,
  section_input text,
  answers_input jsonb,
  presented_questions_input jsonb,
  submission_time_input text,
  is_other_input boolean,
  is_auto_input boolean,
  target_attempt_id uuid
)
returns table (result_id bigint, score integer, total integer, exam_id bigint, exam_title text, questions_json jsonb)
language plpgsql security definer set search_path = ''
as $$
declare
  target public.exam_attempts;
  submitted record;
begin
  select * into target from public.exam_attempts where id = target_attempt_id for update;
  if not found or target.locked_at is not null or target.completed_at is not null then
    raise exception 'Attempt cannot be submitted' using errcode = '22023';
  end if;
  if target.student_number <> trim(student_number_input)
    or target.student_name <> trim(student_name_input)
    or target.grade <> grade_input or target.track <> track_input or target.section <> section_input
    or target.presented_questions_json <> presented_questions_input
    or not exists (select 1 from public.exam_access_codes code
      where code.id = target.access_code_id and code.code = candidate_code) then
    raise exception 'Submission does not match this attempt' using errcode = '22023';
  end if;
  select * into submitted from public.submit_exam_attempt(
    candidate_code, student_name_input, student_number_input, grade_input, track_input, section_input,
    answers_input, presented_questions_input, submission_time_input, is_other_input, is_auto_input
  );
  update public.exam_attempts set completed_at = now(), completed_result_id = submitted.result_id,
    answers_json = answers_input where id = target_attempt_id;
  insert into public.exam_activity_events(exam_id, attempt_id, event_type)
    values (target.exam_id, target_attempt_id, 'submitted');
  return query select submitted.result_id, submitted.score, submitted.total, submitted.exam_id, submitted.exam_title, submitted.questions_json;
end;
$$;
revoke all on function public.submit_exam_attempt_for_attempt(text, text, text, text, text, text, jsonb, jsonb, text, boolean, boolean, uuid) from public, anon, authenticated;
grant execute on function public.submit_exam_attempt_for_attempt(text, text, text, text, text, text, jsonb, jsonb, text, boolean, boolean, uuid) to service_role;
