create table public.exams (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) between 1 and 160),
  source_filename text not null check (length(trim(source_filename)) between 1 and 255),
  banks jsonb not null check (jsonb_typeof(banks) = 'object'),
  status text not null default 'available' check (status in ('available', 'archived')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.exams enable row level security;
revoke all on public.exams from public, anon;
grant select, insert, update, delete on public.exams to authenticated;
grant usage, select on sequence public.exams_id_seq to authenticated;

create policy "Teachers can read exams"
  on public.exams for select to authenticated
  using (exists (
    select 1 from public.teacher_roles
    where teacher_roles.user_id = (select auth.uid())
  ));

create policy "Teachers can create exams"
  on public.exams for insert to authenticated
  with check (
    (created_by is null or created_by = (select auth.uid()))
    and exists (
      select 1 from public.teacher_roles
      where teacher_roles.user_id = (select auth.uid())
    )
  );

create policy "Teachers can update exams"
  on public.exams for update to authenticated
  using (exists (
    select 1 from public.teacher_roles
    where teacher_roles.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.teacher_roles
    where teacher_roles.user_id = (select auth.uid())
  ));

create policy "Teachers can delete exams"
  on public.exams for delete to authenticated
  using (exists (
    select 1 from public.teacher_roles
    where teacher_roles.user_id = (select auth.uid())
  ));

create index exams_status_created_at_idx on public.exams (status, created_at desc);

alter table public.exam_access_codes
  add column exam_id bigint references public.exams (id) on delete set null;
create index exam_access_codes_exam_id_idx on public.exam_access_codes (exam_id);

alter table public.exam_results
  add column exam_id bigint references public.exams (id) on delete set null,
  add column exam_title_snapshot text,
  add column questions_json jsonb;

grant insert, update, delete on public.students to authenticated;

create policy "Teachers can insert students"
  on public.students for insert to authenticated
  with check (exists (
    select 1 from public.teacher_roles
    where teacher_roles.user_id = (select auth.uid())
  ));

create policy "Teachers can update students"
  on public.students for update to authenticated
  using (exists (
    select 1 from public.teacher_roles
    where teacher_roles.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.teacher_roles
    where teacher_roles.user_id = (select auth.uid())
  ));

create policy "Teachers can delete students"
  on public.students for delete to authenticated
  using (exists (
    select 1 from public.teacher_roles
    where teacher_roles.user_id = (select auth.uid())
  ));

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

  if new_code is null or length(new_code) not between 8 and 64 then
    raise exception 'Invalid access code' using errcode = '22023';
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
  where id = matched_code.exam_id and status = 'available';

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  return jsonb_build_object(
    'valid', true,
    'legacy', false,
    'examId', matched_exam.id,
    'examTitle', matched_exam.title,
    'banks', matched_exam.banks
  );
end;
$$;

revoke all on function public.resolve_exam_access_code(text) from public, anon, authenticated;
grant execute on function public.resolve_exam_access_code(text) to service_role;

create or replace function public.validate_exam_access_code(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce((public.resolve_exam_access_code(candidate)->>'valid')::boolean, false);
$$;

revoke all on function public.validate_exam_access_code(text) from public, anon, authenticated;
grant execute on function public.validate_exam_access_code(text) to service_role;
