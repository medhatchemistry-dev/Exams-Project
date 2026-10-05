alter table public.exams
  add column duration_minutes integer check (duration_minutes between 1 and 480),
  add column current_revision integer not null default 1,
  add column archived_from_status text,
  add column archived_at timestamptz,
  add column archived_active_code_ids bigint[] not null default '{}'::bigint[];

create or replace function public.guard_exam_revision_and_lifecycle_fields()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and (
    new.title is distinct from old.title
    or new.source_filename is distinct from old.source_filename
    or new.banks is distinct from old.banks
    or new.target_grade is distinct from old.target_grade
    or new.target_track is distinct from old.target_track
    or new.target_section is distinct from old.target_section
    or new.duration_minutes is distinct from old.duration_minutes
    or new.current_revision is distinct from old.current_revision
    or new.status is distinct from old.status
    or new.paused_at is distinct from old.paused_at
    or new.completed_at is distinct from old.completed_at
    or new.archived_from_status is distinct from old.archived_from_status
    or new.archived_at is distinct from old.archived_at
    or new.archived_active_code_ids is distinct from old.archived_active_code_ids
  ) then
    raise exception 'Use the exam revision and lifecycle operations to change these fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_exam_revision_and_lifecycle_fields() from public, anon, authenticated;
create trigger exams_guard_revision_and_lifecycle_fields
  before update of title, source_filename, banks, target_grade, target_track, target_section,
    duration_minutes, current_revision, status, paused_at, completed_at, archived_from_status,
    archived_at, archived_active_code_ids
  on public.exams for each row execute function public.guard_exam_revision_and_lifecycle_fields();

create table public.exam_revisions (
  exam_id bigint not null references public.exams(id) on delete cascade,
  revision integer not null check (revision > 0),
  title text not null,
  source_filename text not null,
  banks jsonb not null check (jsonb_typeof(banks) = 'object'),
  target_grade text,
  target_track text,
  target_section text,
  duration_minutes integer check (duration_minutes between 1 and 480),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  primary key (exam_id, revision)
);

insert into public.exam_revisions (
  exam_id, revision, title, source_filename, banks, target_grade, target_track, target_section,
  published_by, published_at
)
select id, 1, title, source_filename, banks, target_grade, target_track, target_section, created_by, created_at
from public.exams;

alter table public.exam_revisions enable row level security;
revoke all on public.exam_revisions from public, anon, authenticated, service_role;
grant select on public.exam_revisions to authenticated, service_role;
create policy "Teachers can read exam revisions"
  on public.exam_revisions for select to authenticated
  using (exists (select 1 from public.teacher_roles where user_id = (select auth.uid())));

create or replace function public.create_initial_exam_revision()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.exam_revisions (
    exam_id, revision, title, source_filename, banks, target_grade, target_track, target_section,
    duration_minutes, published_by, published_at
  ) values (
    new.id, new.current_revision, new.title, new.source_filename, new.banks, new.target_grade,
    new.target_track, new.target_section, new.duration_minutes, new.created_by, new.created_at
  );
  return new;
end;
$$;
revoke all on function public.create_initial_exam_revision() from public, anon, authenticated;

create trigger exams_create_initial_revision
  after insert on public.exams
  for each row execute function public.create_initial_exam_revision();

alter table public.exam_attempts
  add column exam_revision integer not null default 1,
  add column canonical_questions_json jsonb,
  add column device_token_hash text,
  add column duration_minutes integer check (duration_minutes between 1 and 480),
  add column closed_at timestamptz,
  add column paused_at timestamptz,
  add column paused_duration_seconds integer not null default 0 check (paused_duration_seconds >= 0);

update public.exam_attempts attempt
set canonical_questions_json = (
  select coalesce(jsonb_agg(bank.question order by presented.position), '[]'::jsonb)
  from jsonb_array_elements(attempt.presented_questions_json) with ordinality as presented(value, position)
  join public.exam_revisions revision on revision.exam_id = attempt.exam_id and revision.revision = attempt.exam_revision
  join lateral jsonb_array_elements(revision.banks->(attempt.grade || '-' || attempt.track)) as bank(question)
    on bank.question->>'id' = presented.value->>'id'
);

create index exam_revisions_latest_idx on public.exam_revisions(exam_id, revision desc);
create index exam_attempts_student_active_idx on public.exam_attempts(exam_id, student_number) where completed_at is null;

alter table public.exam_activity_events drop constraint exam_activity_events_event_type_check;
alter table public.exam_activity_events add constraint exam_activity_events_event_type_check
  check (event_type in ('joined', 'warning', 'locked', 'unlocked', 'unlock_denied', 'submitted', 'paused', 'resumed', 'completed', 'fullscreen_exit', 'tab_hidden', 'window_blur', 'audio_unavailable'));

alter table public.exam_results add column exam_revision integer;
update public.exam_results result
set exam_revision = coalesce((select exam.current_revision from public.exams exam where exam.id = result.exam_id), 1);

create or replace function public.valid_exam_revision_banks(candidate jsonb)
returns boolean
language plpgsql immutable set search_path = ''
as $$
declare
  bank record;
  question jsonb;
  option_count integer;
  answer_text text;
begin
  if jsonb_typeof(candidate) is distinct from 'object' or jsonb_object_length(candidate) < 1 then return false; end if;
  for bank in select key, value from jsonb_each(candidate) loop
    if bank.key !~ '^(10|11|12)-(متقدم|عام)$' or jsonb_typeof(bank.value) is distinct from 'array'
      or jsonb_array_length(bank.value) < 1 or jsonb_array_length(bank.value) > 100 then return false; end if;
    for question in select value from jsonb_array_elements(bank.value) loop
      if jsonb_typeof(question) is distinct from 'object'
        or jsonb_typeof(question->'options') is distinct from 'array'
        or jsonb_array_length(question->'options') not between 2 and 6 then return false; end if;
      answer_text := question->>'answer';
      if answer_text is null or answer_text !~ '^(0|[1-9][0-9]*)$' then return false; end if;
      option_count := jsonb_array_length(question->'options');
      if answer_text::integer >= option_count then return false; end if;
    end loop;
    if (select count(distinct item->>'id') from jsonb_array_elements(bank.value) item) <> jsonb_array_length(bank.value)
      then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.publish_exam_revision(
  target_exam_id bigint,
  next_title text,
  next_source_filename text,
  next_banks jsonb,
  next_target_grade text,
  next_target_track text,
  next_target_section text,
  next_duration_minutes integer
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  teacher_id uuid := auth.uid();
  target public.exams;
  next_revision integer;
begin
  if teacher_id is null or not exists (select 1 from public.teacher_roles where user_id = teacher_id) then
    raise exception 'Teacher role required' using errcode = '42501';
  end if;
  if length(trim(coalesce(next_title, ''))) not between 1 and 160
    or length(trim(coalesce(next_source_filename, ''))) not between 1 and 255
    or (next_duration_minutes is not null and next_duration_minutes not between 1 and 480)
    or not public.valid_exam_revision_banks(next_banks) then
    raise exception 'Exam revision is invalid' using errcode = '22023';
  end if;
  if (next_target_grade is null) <> (next_target_track is null)
    or (next_target_grade is null) <> (next_target_section is null) then
    raise exception 'Target class is incomplete' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(target_exam_id);
  select * into target from public.exams where id = target_exam_id for update;
  if not found or target.status = 'archived' then raise exception 'Exam cannot be edited' using errcode = '22023'; end if;
  next_revision := target.current_revision + 1;
  insert into public.exam_revisions (
    exam_id, revision, title, source_filename, banks, target_grade, target_track, target_section,
    duration_minutes, published_by
  ) values (
    target_exam_id, next_revision, trim(next_title), trim(next_source_filename), next_banks,
    next_target_grade, next_target_track, next_target_section, next_duration_minutes, teacher_id
  );
  update public.exams set title = trim(next_title), source_filename = trim(next_source_filename),
    banks = next_banks, target_grade = next_target_grade, target_track = next_target_track,
    target_section = next_target_section, duration_minutes = next_duration_minutes,
    current_revision = next_revision, updated_at = now()
    where id = target_exam_id;
  return next_revision;
end;
$$;
revoke all on function public.publish_exam_revision(bigint, text, text, jsonb, text, text, text, integer) from public, anon;
grant execute on function public.publish_exam_revision(bigint, text, text, jsonb, text, text, text, integer) to authenticated;

create or replace function public.resolve_exam_access_code(candidate text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  matched_code public.exam_access_codes;
  matched_exam public.exams;
  matched_revision public.exam_revisions;
begin
  if candidate is null or length(candidate) not between 1 and 64 then return jsonb_build_object('valid', false); end if;
  select * into matched_code from public.exam_access_codes
    where code = candidate and is_active and (expires_at is null or expires_at > now())
    order by created_at desc limit 1;
  if not found then return jsonb_build_object('valid', false); end if;
  if matched_code.exam_id is null then return jsonb_build_object('valid', true, 'legacy', true); end if;
  select * into matched_exam from public.exams where id = matched_code.exam_id
    and status = 'available' and completed_at is null;
  if not found then return jsonb_build_object('valid', false); end if;
  select * into matched_revision from public.exam_revisions
    where exam_id = matched_exam.id and revision = matched_exam.current_revision;
  if not found then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object(
    'valid', true, 'legacy', false, 'examId', matched_exam.id,
    'examTitle', matched_revision.title, 'certificateTemplateId', matched_exam.certificate_template_id,
    'targetGrade', matched_revision.target_grade, 'targetTrack', matched_revision.target_track,
    'targetSection', matched_revision.target_section, 'durationMinutes', matched_revision.duration_minutes,
    'revision', matched_revision.revision, 'banks', matched_revision.banks
  );
end;
$$;
revoke all on function public.resolve_exam_access_code(text) from public, anon, authenticated;
grant execute on function public.resolve_exam_access_code(text) to service_role;

create or replace function public.start_exam_attempt_v2(
  candidate_code text,
  student_name_input text,
  student_number_input text,
  grade_input text,
  track_input text,
  section_input text,
  presented_questions_input jsonb,
  device_token_hash_input text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  active_code public.exam_access_codes;
  target_exam public.exams;
  target_revision public.exam_revisions;
  presented jsonb;
  canonical jsonb;
  canonical_list jsonb := '[]'::jsonb;
  attempt_id uuid;
  prior_attempt public.exam_attempts;
begin
  select * into active_code from public.exam_access_codes where code = candidate_code and is_active
    and (expires_at is null or expires_at > now()) order by created_at desc limit 1 for update;
  if not found or active_code.exam_id is null then raise exception 'Exam unavailable' using errcode = '22023'; end if;
  select * into target_exam from public.exams where id = active_code.exam_id for update;
  if not found or target_exam.status <> 'available' or target_exam.completed_at is not null then
    raise exception 'Exam unavailable' using errcode = '22023'; end if;
  select * into target_revision from public.exam_revisions where exam_id = target_exam.id and revision = target_exam.current_revision;
  if not found then raise exception 'Exam revision unavailable' using errcode = '22023'; end if;
  select * into prior_attempt from public.exam_attempts where exam_id = target_exam.id
    and student_number = trim(student_number_input) and completed_at is null and closed_at is null order by started_at desc limit 1 for update;
  if found then
    if prior_attempt.student_name is distinct from trim(student_name_input)
      or prior_attempt.grade is distinct from grade_input or prior_attempt.track is distinct from track_input
      or prior_attempt.section is distinct from section_input then
      raise exception 'An active attempt already exists for this student' using errcode = '22023';
    end if;
    if prior_attempt.device_token_hash is not null and prior_attempt.device_token_hash is distinct from device_token_hash_input then
      raise exception 'An active attempt already exists on another device' using errcode = '22023';
    end if;
    update public.exam_attempts set device_token_hash = device_token_hash_input, access_code_id = active_code.id
      where id = prior_attempt.id;
    insert into public.exam_activity_events(exam_id, attempt_id, event_type)
      values (target_exam.id, prior_attempt.id, 'resumed');
    return prior_attempt.id;
  end if;
  if student_name_input is null or length(trim(student_name_input)) not between 1 and 160
    or student_number_input is null or length(trim(student_number_input)) not between 1 and 80
    or grade_input not in ('10','11','12') or track_input not in ('متقدم','عام') or section_input not in ('1','2')
    or device_token_hash_input is null or device_token_hash_input !~ '^[a-f0-9]{64}$' or jsonb_typeof(presented_questions_input) is distinct from 'array'
    or jsonb_array_length(presented_questions_input) not between 1 and 100 then
    raise exception 'Invalid attempt details' using errcode = '22023'; end if;
  if target_revision.target_grade is not null and (grade_input is distinct from target_revision.target_grade
    or track_input is distinct from target_revision.target_track or section_input is distinct from target_revision.target_section) then
    raise exception 'Student class does not match this exam' using errcode = '22023'; end if;
  for presented in select value from jsonb_array_elements(presented_questions_input) loop
    select question into canonical from jsonb_array_elements(target_revision.banks->(grade_input || '-' || track_input)) bank(question)
      where bank.question->>'id' = presented->>'id' limit 1;
    if canonical is null or presented ? 'answer' or jsonb_typeof(presented->'options') is distinct from 'array'
      or jsonb_array_length(presented->'options') <> jsonb_array_length(canonical->'options')
      or canonical - 'answer' - 'options' <> presented - 'options' - 'index' then
      raise exception 'Question content does not match this exam revision' using errcode = '22023'; end if;
    if (select array_agg(value::text order by value::text) from jsonb_array_elements(canonical->'options') as x(value))
      is distinct from (select array_agg(value::text order by value::text) from jsonb_array_elements(presented->'options') as x(value)) then
      raise exception 'Question options do not match this exam revision' using errcode = '22023'; end if;
    canonical_list := canonical_list || jsonb_build_array(canonical);
  end loop;
  insert into public.exam_attempts (
    exam_id, access_code_id, student_name, student_number, grade, track, section,
    presented_questions_json, canonical_questions_json, device_token_hash, exam_revision, duration_minutes
  ) values (
    target_exam.id, active_code.id, trim(student_name_input), trim(student_number_input), grade_input, track_input, section_input,
    presented_questions_input, canonical_list, device_token_hash_input, target_revision.revision, target_revision.duration_minutes
  ) returning id into attempt_id;
  insert into public.exam_activity_events(exam_id, attempt_id, event_type) values (target_exam.id, attempt_id, 'joined');
  return attempt_id;
end;
$$;
revoke all on function public.start_exam_attempt_v2(text, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.start_exam_attempt_v2(text, text, text, text, text, text, jsonb, text) to service_role;

create or replace function public.save_exam_attempt_answer(
  target_attempt_id uuid,
  candidate_code text,
  target_device_token_hash text,
  question_index integer,
  option_index integer
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  target public.exam_attempts;
  exam_state text;
  active_code public.exam_access_codes;
  next_answers jsonb;
begin
  select * into target from public.exam_attempts where id = target_attempt_id for update;
  if not found or target.device_token_hash is distinct from target_device_token_hash or target.completed_at is not null or target.closed_at is not null
    or target.locked_at is not null then raise exception 'Attempt unavailable' using errcode = '22023'; end if;
  select * into active_code from public.exam_access_codes where id = target.access_code_id and code = candidate_code;
  if not found then raise exception 'Attempt unavailable' using errcode = '22023'; end if;
  select status into exam_state from public.exams where id = target.exam_id;
  if exam_state is distinct from 'available' or not active_code.is_active
    or (active_code.expires_at is not null and active_code.expires_at <= now()) then
    raise exception 'Exam is paused or closed' using errcode = '22023'; end if;
  if question_index < 0 or question_index >= jsonb_array_length(target.presented_questions_json)
    or option_index < 0 or option_index >= jsonb_array_length(target.presented_questions_json->question_index->'options') then
    raise exception 'Answer index is invalid' using errcode = '22023'; end if;
  if target.duration_minutes is not null and now() > target.started_at
    + make_interval(secs => target.paused_duration_seconds)
    + make_interval(mins => target.duration_minutes) then
    raise exception 'Exam time has ended' using errcode = '22023'; end if;
  next_answers := jsonb_set(target.answers_json, array[question_index::text], to_jsonb(option_index), true);
  update public.exam_attempts set answers_json = next_answers where id = target_attempt_id;
  return jsonb_build_object('saved', true, 'answers', next_answers);
end;
$$;
revoke all on function public.save_exam_attempt_answer(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.save_exam_attempt_answer(uuid, text, text, integer, integer) to service_role;

create or replace function public.save_exam_attempt_answers(
  target_attempt_id uuid,
  candidate_code text,
  target_device_token_hash text,
  answers_input jsonb
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  target public.exam_attempts;
  active_code public.exam_access_codes;
  exam_state text;
  answer record;
  question_index integer;
  option_index integer;
begin
  select * into target from public.exam_attempts where id = target_attempt_id for update;
  if not found or target.device_token_hash is distinct from target_device_token_hash
    or target.completed_at is not null or target.closed_at is not null or target.locked_at is not null then
    raise exception 'Attempt unavailable' using errcode = '22023';
  end if;
  select * into active_code from public.exam_access_codes where id = target.access_code_id and code = candidate_code;
  if not found then raise exception 'Attempt unavailable' using errcode = '22023'; end if;
  select status into exam_state from public.exams where id = target.exam_id;
  if exam_state is distinct from 'available' or not active_code.is_active
    or (active_code.expires_at is not null and active_code.expires_at <= now()) then
    raise exception 'Exam is paused or closed' using errcode = '22023';
  end if;
  if target.duration_minutes is not null and now() > target.started_at
    + make_interval(secs => target.paused_duration_seconds)
    + make_interval(mins => target.duration_minutes) then
    raise exception 'Exam time has ended' using errcode = '22023';
  end if;
  if jsonb_typeof(answers_input) is distinct from 'object'
    or jsonb_object_length(answers_input) > jsonb_array_length(target.presented_questions_json) then
    raise exception 'Answer draft is invalid' using errcode = '22023';
  end if;
  for answer in select key, value from jsonb_each(answers_input) loop
    if answer.key !~ '^(0|[1-9][0-9]*)$' or jsonb_typeof(answer.value) is distinct from 'number'
      or answer.value::text !~ '^(0|[1-9][0-9]*)$' then
      raise exception 'Answer draft is invalid' using errcode = '22023';
    end if;
    question_index := answer.key::integer;
    option_index := (answer.value::text)::integer;
    if question_index < 0 or question_index >= jsonb_array_length(target.presented_questions_json)
      or option_index < 0 or option_index >= jsonb_array_length(target.presented_questions_json->question_index->'options') then
      raise exception 'Answer index is invalid' using errcode = '22023';
    end if;
  end loop;
  update public.exam_attempts set answers_json = answers_input where id = target_attempt_id;
  return true;
end;
$$;
revoke all on function public.save_exam_attempt_answers(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_exam_attempt_answers(uuid, text, text, jsonb) to service_role;

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
    raise exception 'Teacher role required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(73410291);
  perform 1 from public.exam_access_codes where exam_id = target_exam_id and is_active order by id for update;
  select * into target from public.exams where id = target_exam_id for update;
  if not found or target.completed_at is not null or target.status = 'archived' then raise exception 'Exam cannot change lifecycle state' using errcode = '22023'; end if;
  if should_pause then
    if target.status <> 'available' then raise exception 'Exam is not available' using errcode = '22023'; end if;
    update public.exams set status = 'paused', paused_at = now(), updated_at = now() where id = target_exam_id returning * into target;
    update public.exam_attempts set paused_at = now() where exam_id = target_exam_id and completed_at is null and paused_at is null;
    insert into public.exam_activity_events(exam_id, event_type) values (target_exam_id, 'paused');
  else
    if target.status <> 'paused' or target.paused_at is null then raise exception 'Exam is not paused' using errcode = '22023'; end if;
    pause_duration := greatest(now() - target.paused_at, interval '0 seconds');
    update public.exam_access_codes set expires_at = expires_at + pause_duration where exam_id = target_exam_id and is_active and expires_at is not null;
    update public.exam_attempts set paused_duration_seconds = paused_duration_seconds
      + greatest(0, floor(extract(epoch from now() - paused_at))::integer), paused_at = null
      where exam_id = target_exam_id and completed_at is null and paused_at is not null;
    update public.exams set status = 'available', paused_at = null, updated_at = now() where id = target_exam_id returning * into target;
    insert into public.exam_activity_events(exam_id, event_type) values (target_exam_id, 'resumed');
  end if;
  return target;
end;
$$;
revoke all on function public.set_exam_paused(bigint, boolean) from public, anon;
grant execute on function public.set_exam_paused(bigint, boolean) to authenticated;

create or replace function public.complete_exam(target_exam_id bigint)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  teacher_id uuid := auth.uid();
  completed_time timestamptz;
begin
  if teacher_id is null or not exists (select 1 from public.teacher_roles where user_id = teacher_id) then
    raise exception 'Teacher role required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(73410291);
  perform 1 from public.exam_access_codes where exam_id = target_exam_id and is_active order by id for update;
  perform 1 from public.exams where id = target_exam_id and status in ('available', 'paused') for update;
  if not found then raise exception 'Exam is unavailable' using errcode = '22023'; end if;
  update public.exam_access_codes set is_active = false where exam_id = target_exam_id and is_active;
  update public.exam_attempts set answers_json = '{}'::jsonb, locked_at = null, closed_at = now()
    where exam_id = target_exam_id and completed_at is null;
  update public.exams set completed_at = coalesce(completed_at, now()), paused_at = null, updated_at = now()
    where id = target_exam_id and status in ('available', 'paused') returning completed_at into completed_time;
  insert into public.exam_activity_events(exam_id, event_type) values (target_exam_id, 'completed');
  return completed_time;
end;
$$;
revoke all on function public.complete_exam(bigint) from public, anon;
grant execute on function public.complete_exam(bigint) to authenticated;

create or replace function public.set_exam_archived(target_exam_id bigint, should_archive boolean)
returns public.exams
language plpgsql security definer set search_path = ''
as $$
declare
  teacher_id uuid := auth.uid();
  target public.exams;
  active_code_ids bigint[];
  archive_duration interval;
  restore_status text;
begin
  if teacher_id is null or not exists (select 1 from public.teacher_roles where user_id = teacher_id) then
    raise exception 'Teacher role required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(73410291);
  perform 1 from public.exam_access_codes where exam_id = target_exam_id and is_active order by id for update;
  select * into target from public.exams where id = target_exam_id for update;
  if not found then raise exception 'Exam is unavailable' using errcode = '22023'; end if;
  if should_archive then
    if target.status = 'archived' then return target; end if;
    select coalesce(array_agg(id), '{}'::bigint[]) into active_code_ids
      from public.exam_access_codes
      where exam_id = target_exam_id and is_active
        and (target.status = 'paused' or expires_at is null or expires_at > now());
    update public.exams set archived_from_status = status, archived_at = now(),
      archived_active_code_ids = active_code_ids,
      paused_at = case when status = 'available' and completed_at is null then now() else paused_at end,
      updated_at = now()
      where id = target_exam_id returning * into target;
    if target.archived_from_status = 'available' and target.completed_at is null then
      update public.exam_attempts set paused_at = coalesce(paused_at, now())
        where exam_id = target_exam_id and completed_at is null and closed_at is null;
    end if;
    update public.exam_access_codes set is_active = false where exam_id = target_exam_id and is_active;
    update public.exams set status = 'archived', updated_at = now()
      where id = target_exam_id returning * into target;
  else
    if target.status <> 'archived' then return target; end if;
    restore_status := coalesce(target.archived_from_status, 'paused');
    active_code_ids := target.archived_active_code_ids;
    archive_duration := case when target.archived_at is null then interval '0 seconds'
      else greatest(now() - target.archived_at, interval '0 seconds') end;
    update public.exams set status = restore_status, archived_from_status = null, archived_at = null,
      archived_active_code_ids = '{}'::bigint[],
      paused_at = case
        when restore_status = 'available' and completed_at is null then null
        when restore_status = 'paused' then coalesce(paused_at, now())
        else paused_at
      end,
      updated_at = now()
      where id = target_exam_id returning * into target;
    if restore_status = 'available' and target.completed_at is null then
      update public.exam_access_codes set expires_at = expires_at + archive_duration
        where id = any(active_code_ids) and expires_at is not null;
      update public.exam_attempts set
        paused_duration_seconds = paused_duration_seconds
          + greatest(0, floor(extract(epoch from now() - paused_at))::integer),
        paused_at = null
        where exam_id = target_exam_id and completed_at is null and closed_at is null and paused_at is not null;
    elsif restore_status = 'paused' and target.archived_at is null then
      update public.exam_attempts set paused_at = coalesce(paused_at, now())
        where exam_id = target_exam_id and completed_at is null and closed_at is null;
    end if;
    if target.completed_at is null and not exists (
      select 1 from public.exam_access_codes where is_active and exam_id is distinct from target_exam_id
    ) then
      update public.exam_access_codes set is_active = true
        where id = any(active_code_ids);
    end if;
  end if;
  return target;
end;
$$;
revoke all on function public.set_exam_archived(bigint, boolean) from public, anon;
grant execute on function public.set_exam_archived(bigint, boolean) to authenticated;

create or replace function public.rebind_exam_attempt_device_for_student(
  target_exam_id bigint,
  candidate_code text,
  student_name_input text,
  student_number_input text,
  grade_input text,
  track_input text,
  section_input text,
  device_token_hash_input text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  teacher_id uuid := auth.uid();
  active_code public.exam_access_codes;
  target public.exam_attempts;
begin
  if teacher_id is null or not exists (select 1 from public.teacher_roles where user_id = teacher_id) then
    raise exception 'Teacher role required' using errcode = '42501'; end if;
  if device_token_hash_input is null or device_token_hash_input !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid device credential' using errcode = '22023'; end if;
  select * into active_code from public.exam_access_codes where exam_id = target_exam_id and code = candidate_code
    and is_active and (expires_at is null or expires_at > now()) order by created_at desc limit 1;
  if not found then raise exception 'Exam code is unavailable' using errcode = '22023'; end if;
  select * into target from public.exam_attempts where exam_id = target_exam_id
    and student_number = trim(student_number_input) and completed_at is null and closed_at is null
    order by started_at desc limit 1 for update;
  if not found or target.student_name is distinct from trim(student_name_input)
    or target.grade is distinct from grade_input or target.track is distinct from track_input
    or target.section is distinct from section_input then
    raise exception 'Active attempt could not be verified' using errcode = '22023'; end if;
  update public.exam_attempts set device_token_hash = device_token_hash_input, access_code_id = active_code.id
    where id = target.id;
  insert into public.exam_activity_events(exam_id, attempt_id, event_type, details)
    values (target_exam_id, target.id, 'resumed', jsonb_build_object('teacher_recovery', true));
  return target.id;
end;
$$;
revoke all on function public.rebind_exam_attempt_device_for_student(bigint, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.rebind_exam_attempt_device_for_student(bigint, text, text, text, text, text, text, text) to authenticated;

create or replace function public.enforce_exam_result_target_class()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  target public.exams;
  target_revision public.exam_revisions;
begin
  if new.exam_id is null then return new; end if;
  select * into target from public.exams where id = new.exam_id for update;
  if not found then raise exception 'Exam is unavailable' using errcode = '22023'; end if;
  if target.completed_at is not null then raise exception 'Exam has been marked complete' using errcode = '22023'; end if;
  new.exam_revision := coalesce(new.exam_revision, target.current_revision);
  select * into target_revision from public.exam_revisions
    where exam_id = new.exam_id and revision = new.exam_revision;
  if not found then raise exception 'Exam revision is unavailable' using errcode = '22023'; end if;
  if target_revision.target_grade is not null and (
    new.grade is distinct from target_revision.target_grade
    or new.track is distinct from target_revision.target_track
    or new.section is distinct from target_revision.target_section
  ) then raise exception 'Student class does not match this exam revision' using errcode = '22023'; end if;
  return new;
end;
$$;

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
  target_exam public.exams;
  target_revision public.exam_revisions;
  active_code public.exam_access_codes;
  pair record;
  canonical_question jsonb;
  presented_question jsonb;
  correct_option jsonb;
  checked_questions jsonb := '[]'::jsonb;
  computed_score integer := 0;
  question_index integer := 0;
  correct_index integer;
  submitted_answer integer;
  inserted_id bigint;
begin
  select * into target from public.exam_attempts where id = target_attempt_id for update;
  if not found or target.locked_at is not null or target.completed_at is not null or target.closed_at is not null then
    raise exception 'Attempt cannot be submitted' using errcode = '22023'; end if;
  if target.student_number <> trim(student_number_input) or target.student_name <> trim(student_name_input)
    or target.grade <> grade_input or target.track <> track_input or target.section <> section_input
    or target.presented_questions_json <> presented_questions_input
    or jsonb_typeof(answers_input) is distinct from 'object'
    or jsonb_object_length(answers_input) > jsonb_array_length(target.presented_questions_json) then
    raise exception 'Submission does not match this attempt' using errcode = '22023'; end if;
  if submission_time_input is null or length(submission_time_input) > 100 then
    raise exception 'Invalid submission time' using errcode = '22023'; end if;
  select * into active_code from public.exam_access_codes where id = target.access_code_id and code = candidate_code
    and is_active and (expires_at is null or expires_at > now()) for update;
  if not found then raise exception 'Exam access code is inactive or expired' using errcode = '22023'; end if;
  select * into target_exam from public.exams where id = target.exam_id and status = 'available' and completed_at is null for share;
  if not found then raise exception 'Exam is unavailable' using errcode = '22023'; end if;
  select * into target_revision from public.exam_revisions where exam_id = target.exam_id and revision = target.exam_revision;
  if not found then raise exception 'Exam revision is unavailable' using errcode = '22023'; end if;
  if target.duration_minutes is not null and now() > target.started_at
    + make_interval(secs => target.paused_duration_seconds)
    + make_interval(mins => target.duration_minutes) and not is_auto_input then
    raise exception 'Exam time has ended' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_object_keys(answers_input) answer(key)
    where answer.key !~ '^(0|[1-9][0-9]*)$'
      or (answers_input->>answer.key) !~ '^(0|[1-9][0-9]*)$'
  ) then raise exception 'Invalid answers payload' using errcode = '22023'; end if;
  for pair in
    select shown.value as presented, original.value as canonical
    from jsonb_array_elements(target.presented_questions_json) with ordinality as shown(value, position)
    join jsonb_array_elements(target.canonical_questions_json) with ordinality as original(value, position)
      on original.position = shown.position
    order by shown.position
  loop
    presented_question := pair.presented;
    canonical_question := pair.canonical;
    question_index := question_index + 1;
    if presented_question ? 'answer' or presented_question->>'id' is distinct from canonical_question->>'id'
      or jsonb_typeof(presented_question->'options') is distinct from 'array'
      or jsonb_typeof(canonical_question->'options') is distinct from 'array'
      or (select array_agg(value::text order by value::text) from jsonb_array_elements(presented_question->'options') as x(value))
        is distinct from (select array_agg(value::text order by value::text) from jsonb_array_elements(canonical_question->'options') as x(value)) then
      raise exception 'Question snapshot does not match this attempt revision' using errcode = '22023'; end if;
    correct_option := canonical_question->'options'->(canonical_question->>'answer')::integer;
    select option.position - 1 into correct_index
      from jsonb_array_elements(presented_question->'options') with ordinality as option(value, position)
      where option.value = correct_option order by option.position limit 1;
    submitted_answer := null;
    if answers_input ? (question_index - 1)::text then
      submitted_answer := (answers_input->>(question_index - 1)::text)::integer;
      if submitted_answer < 0 or submitted_answer >= jsonb_array_length(presented_question->'options') then
        raise exception 'Answer option index is invalid' using errcode = '22023'; end if;
      if presented_question->'options'->submitted_answer = correct_option then computed_score := computed_score + 1; end if;
    end if;
    checked_questions := checked_questions || jsonb_build_array(
      presented_question || jsonb_build_object('answer', correct_index, 'index', question_index)
    );
  end loop;
  if is_auto_input and (target.duration_minutes is null or now() <= target.started_at
    + make_interval(secs => target.paused_duration_seconds)
    + make_interval(mins => target.duration_minutes)) then
    computed_score := 0;
  end if;
  insert into public.exam_results (
    student_name, student_number, grade, track, section, score, total, answers_json,
    submission_time, is_other, exam_id, exam_title_snapshot, questions_json, exam_revision
  ) values (
    trim(student_name_input), trim(student_number_input), grade_input, track_input, section_input,
    computed_score, question_index, answers_input, submission_time_input, coalesce(is_other_input, false),
    target.exam_id, target_revision.title, checked_questions, target.exam_revision
  ) returning id into inserted_id;
  update public.exam_attempts set completed_at = now(), completed_result_id = inserted_id, answers_json = answers_input
    where id = target_attempt_id;
  insert into public.exam_activity_events(exam_id, attempt_id, event_type)
    values (target.exam_id, target_attempt_id, 'submitted');
  return query select inserted_id, computed_score, question_index, target.exam_id, target_revision.title, checked_questions;
end;
$$;
revoke all on function public.submit_exam_attempt_for_attempt(text, text, text, text, text, text, jsonb, jsonb, text, boolean, boolean, uuid) from public, anon, authenticated;
grant execute on function public.submit_exam_attempt_for_attempt(text, text, text, text, text, text, jsonb, jsonb, text, boolean, boolean, uuid) to service_role;
