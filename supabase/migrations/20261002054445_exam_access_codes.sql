create table public.exam_access_codes (
  id bigint generated always as identity primary key,
  code text not null unique,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index exam_access_codes_one_active_idx
  on public.exam_access_codes (is_active)
  where is_active;

alter table public.exam_access_codes enable row level security;

grant select, insert, update, delete on public.exam_access_codes to authenticated;
grant usage, select on sequence public.exam_access_codes_id_seq to authenticated;

create policy "Teachers can read exam access codes"
  on public.exam_access_codes for select to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1 from public.teacher_roles
      where teacher_roles.user_id = (select auth.uid())
    )
  );

create policy "Teachers can manage exam access codes"
  on public.exam_access_codes for all to authenticated
  using (
    exists (
      select 1 from public.teacher_roles
      where teacher_roles.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.teacher_roles
      where teacher_roles.user_id = (select auth.uid())
    )
);

create or replace function public.validate_exam_access_code(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select candidate is not null
    and length(candidate) between 1 and 64
    and exists (
      select 1 from public.exam_access_codes
      where code = candidate
        and is_active
        and (expires_at is null or expires_at > now())
    );
$$;

revoke all on function public.validate_exam_access_code(text) from public;
grant execute on function public.validate_exam_access_code(text) to anon, authenticated;
