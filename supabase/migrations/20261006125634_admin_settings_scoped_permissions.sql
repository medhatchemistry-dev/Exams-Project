-- Keep one owner account while making every delegated administrator explicitly scoped.
alter table public.teacher_roles
  add column if not exists is_owner boolean not null default false,
  add column if not exists permissions text[] not null default '{}';

alter table public.teacher_roles
  add constraint teacher_roles_permissions_check
  check (permissions <@ array['manage_exams', 'manage_students', 'view_grades']::text[]);

with selected_owner as (
  select user_id from public.teacher_roles order by created_at, user_id limit 1
)
update public.teacher_roles
set is_owner = (user_id = (select user_id from selected_owner)),
    permissions = case when user_id = (select user_id from selected_owner)
      then array['manage_exams', 'manage_students', 'view_grades']::text[] else permissions end;

create or replace function public.has_teacher_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select role.is_owner or required_permission = any(role.permissions)
    from public.teacher_roles as role
    where role.user_id = (select auth.uid())
  ), false);
$$;
revoke all on function public.has_teacher_permission(text) from public, anon;
grant execute on function public.has_teacher_permission(text) to authenticated;

-- Safe summary view lets grade-only users filter exams without reading answer keys.
create or replace view public.teacher_exam_summaries
with (security_barrier = true)
as
select id, title, status, created_at, updated_at, target_grade, target_track,
  target_section, completed_at, certificate_template_id
from public.exams
where public.has_teacher_permission('view_grades');
revoke all on public.teacher_exam_summaries from public, anon;
grant select on public.teacher_exam_summaries to authenticated;

-- Existing classroom/table access remains public for student registration and exam joins.
drop policy if exists "Teachers can read exam results" on public.exam_results;
create policy "Teachers with grade access can read exam results"
  on public.exam_results for select to authenticated
  using ((select public.has_teacher_permission('view_grades')));

drop policy if exists "Teachers can read exam attempts" on public.exam_attempts;
create policy "Teachers with grade access can read exam attempts"
  on public.exam_attempts for select to authenticated
  using ((select public.has_teacher_permission('view_grades')));

drop policy if exists "Teachers can read exam activity" on public.exam_activity_events;
create policy "Teachers with grade access can read exam activity"
  on public.exam_activity_events for select to authenticated
  using ((select public.has_teacher_permission('view_grades')));

drop policy if exists "Teachers can read exam revisions" on public.exam_revisions;
create policy "Exam managers can read exam revisions"
  on public.exam_revisions for select to authenticated
  using ((select public.has_teacher_permission('manage_exams')));

drop policy if exists "Teachers can read exams" on public.exams;
drop policy if exists "Teachers can create exams" on public.exams;
drop policy if exists "Teachers can update exams" on public.exams;
drop policy if exists "Teachers can delete exams" on public.exams;
create policy "Exam managers can read exams"
  on public.exams for select to authenticated
  using ((select public.has_teacher_permission('manage_exams')));
create policy "Exam managers can create exams"
  on public.exams for insert to authenticated
  with check ((select public.has_teacher_permission('manage_exams')));
create policy "Exam managers can update exams"
  on public.exams for update to authenticated
  using ((select public.has_teacher_permission('manage_exams')))
  with check ((select public.has_teacher_permission('manage_exams')));
create policy "Exam managers can delete exams"
  on public.exams for delete to authenticated
  using ((select public.has_teacher_permission('manage_exams')));

drop policy if exists "Teachers can manage exam access codes" on public.exam_access_codes;
create policy "Exam managers can manage exam access codes"
  on public.exam_access_codes for all to authenticated
  using ((select public.has_teacher_permission('manage_exams')))
  with check ((select public.has_teacher_permission('manage_exams')));

drop policy if exists "Teachers can insert students" on public.students;
drop policy if exists "Teachers can update students" on public.students;
drop policy if exists "Teachers can delete students" on public.students;
create policy "Student managers can insert students"
  on public.students for insert to authenticated
  with check ((select public.has_teacher_permission('manage_students')));
create policy "Student managers can update students"
  on public.students for update to authenticated
  using ((select public.has_teacher_permission('manage_students')))
  with check ((select public.has_teacher_permission('manage_students')));
create policy "Student managers can delete students"
  on public.students for delete to authenticated
  using ((select public.has_teacher_permission('manage_students')));

-- The owner-only settings service calls these RPCs with the Supabase service key.
create or replace function public.set_teacher_login_password(candidate text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if candidate is null or length(candidate) not between 8 and 128 then
    raise exception 'Password must contain between 8 and 128 characters' using errcode = '22023';
  end if;
  insert into public.teacher_login_passwords (id, password_hash)
  values (1, extensions.crypt(candidate, extensions.gen_salt('bf')))
  on conflict (id) do update set password_hash = excluded.password_hash;
end;
$$;
revoke all on function public.set_teacher_login_password(text) from public, anon, authenticated;
grant execute on function public.set_teacher_login_password(text) to service_role;

-- Preserve the currently working recovery credential, then separate it from admin login.
create table public.exam_reentry_passwords (
  id integer primary key check (id = 1),
  password_hash text not null
);
alter table public.exam_reentry_passwords enable row level security;
revoke all on public.exam_reentry_passwords from public, anon, authenticated;
grant select on public.exam_reentry_passwords to service_role;
insert into public.exam_reentry_passwords (id, password_hash)
select 1, password_hash from public.teacher_login_passwords where id = 1
on conflict (id) do nothing;

create or replace function public.verify_exam_reentry_password(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select candidate is not null and length(candidate) between 1 and 128
    and exists (select 1 from public.exam_reentry_passwords
      where id = 1 and password_hash = extensions.crypt(candidate, password_hash));
$$;
revoke all on function public.verify_exam_reentry_password(text) from public, anon, authenticated;
grant execute on function public.verify_exam_reentry_password(text) to service_role;

create or replace function public.set_exam_reentry_password(candidate text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if candidate is null or length(candidate) not between 8 and 128 then
    raise exception 'Password must contain between 8 and 128 characters' using errcode = '22023';
  end if;
  insert into public.exam_reentry_passwords (id, password_hash)
  values (1, extensions.crypt(candidate, extensions.gen_salt('bf')))
  on conflict (id) do update set password_hash = excluded.password_hash;
end;
$$;
revoke all on function public.set_exam_reentry_password(text) from public, anon, authenticated;
grant execute on function public.set_exam_reentry_password(text) to service_role;

-- Restrict privileged SQL paths as well as table policies.
create or replace function public.issue_exam_access_code(
  target_exam_id bigint,
  new_code text,
  new_expires_at timestamptz default null
)
returns public.exam_access_codes
language plpgsql security definer set search_path = ''
as $$
declare
  teacher_id uuid := auth.uid();
  created_code public.exam_access_codes;
begin
  if teacher_id is null or not public.has_teacher_permission('manage_exams') then
    raise exception 'Exam management permission required' using errcode = '42501';
  end if;
  if new_code is null or new_code !~ '^[0-9]{5,10}$' then
    raise exception 'Access code must contain 5 to 10 digits' using errcode = '22023';
  end if;
  if not exists (select 1 from public.exams where id = target_exam_id and status = 'available') then
    raise exception 'Exam is unavailable' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(73410291);
  update public.exam_access_codes set is_active = false where is_active;
  insert into public.exam_access_codes (code, expires_at, created_by, exam_id)
  values (new_code, new_expires_at, teacher_id, target_exam_id) returning * into created_code;
  return created_code;
end;
$$;
revoke all on function public.issue_exam_access_code(bigint, text, timestamptz) from public, anon;
grant execute on function public.issue_exam_access_code(bigint, text, timestamptz) to authenticated;

create or replace function public.publish_exam_revision(
  target_exam_id bigint, next_title text, next_source_filename text, next_banks jsonb,
  next_target_grade text, next_target_track text, next_target_section text, next_duration_minutes integer
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  teacher_id uuid := auth.uid();
  target public.exams;
  next_revision integer;
begin
  if teacher_id is null or not public.has_teacher_permission('manage_exams') then
    raise exception 'Exam management permission required' using errcode = '42501';
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
    current_revision = next_revision, updated_at = now() where id = target_exam_id;
  return next_revision;
end;
$$;
revoke all on function public.publish_exam_revision(bigint, text, text, jsonb, text, text, text, integer) from public, anon;
grant execute on function public.publish_exam_revision(bigint, text, text, jsonb, text, text, text, integer) to authenticated;

create or replace function public.set_exam_paused(target_exam_id bigint, should_pause boolean)
returns public.exams
language plpgsql security definer set search_path = ''
as $$
declare
  teacher_id uuid := auth.uid();
  target public.exams;
  pause_duration interval;
begin
  if teacher_id is null or not public.has_teacher_permission('manage_exams') then
    raise exception 'Exam management permission required' using errcode = '42501'; end if;
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
  if teacher_id is null or not public.has_teacher_permission('manage_exams') then
    raise exception 'Exam management permission required' using errcode = '42501'; end if;
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
  if teacher_id is null or not public.has_teacher_permission('manage_exams') then
    raise exception 'Exam management permission required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(73410291);
  perform 1 from public.exam_access_codes where exam_id = target_exam_id and is_active order by id for update;
  select * into target from public.exams where id = target_exam_id for update;
  if not found then raise exception 'Exam is unavailable' using errcode = '22023'; end if;
  if should_archive then
    if target.status = 'archived' then return target; end if;
    select coalesce(array_agg(id), '{}'::bigint[]) into active_code_ids from public.exam_access_codes
      where exam_id = target_exam_id and is_active
        and (target.status = 'paused' or expires_at is null or expires_at > now());
    update public.exams set archived_from_status = status, archived_at = now(),
      archived_active_code_ids = active_code_ids,
      paused_at = case when status = 'available' and completed_at is null then now() else paused_at end,
      updated_at = now() where id = target_exam_id returning * into target;
    if target.archived_from_status = 'available' and target.completed_at is null then
      update public.exam_attempts set paused_at = coalesce(paused_at, now())
        where exam_id = target_exam_id and completed_at is null and closed_at is null;
    end if;
    update public.exam_access_codes set is_active = false where exam_id = target_exam_id and is_active;
    update public.exams set status = 'archived', updated_at = now() where id = target_exam_id returning * into target;
  else
    if target.status <> 'archived' then return target; end if;
    restore_status := coalesce(target.archived_from_status, 'paused');
    active_code_ids := target.archived_active_code_ids;
    archive_duration := case when target.archived_at is null then interval '0 seconds'
      else greatest(now() - target.archived_at, interval '0 seconds') end;
    update public.exams set status = restore_status, archived_from_status = null, archived_at = null,
      archived_active_code_ids = '{}'::bigint[],
      paused_at = case when restore_status = 'available' and completed_at is null then null
        when restore_status = 'paused' then coalesce(paused_at, now()) else paused_at end,
      updated_at = now() where id = target_exam_id returning * into target;
    if restore_status = 'available' and target.completed_at is null then
      update public.exam_access_codes set expires_at = expires_at + archive_duration
        where id = any(active_code_ids) and expires_at is not null;
      update public.exam_attempts set paused_duration_seconds = paused_duration_seconds
          + greatest(0, floor(extract(epoch from now() - paused_at))::integer), paused_at = null
        where exam_id = target_exam_id and completed_at is null and closed_at is null and paused_at is not null;
    elsif restore_status = 'paused' and target.archived_at is null then
      update public.exam_attempts set paused_at = coalesce(paused_at, now())
        where exam_id = target_exam_id and completed_at is null and closed_at is null;
    end if;
    if target.completed_at is null and not exists (
      select 1 from public.exam_access_codes where is_active and exam_id is distinct from target_exam_id
    ) then
      update public.exam_access_codes set is_active = true where id = any(active_code_ids);
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
  if teacher_id is null or not public.has_teacher_permission('manage_exams') then
    raise exception 'Exam management permission required' using errcode = '42501'; end if;
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
