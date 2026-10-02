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

create table public.access_code_attempts (
  id bigint generated always as identity primary key,
  purpose text not null check (purpose in ('teacher_login', 'exam_code')),
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

create index access_code_attempts_ip_time_idx
  on public.access_code_attempts (purpose, ip_hash, attempted_at desc);

alter table public.access_code_attempts enable row level security;
revoke all on public.access_code_attempts from public, anon, authenticated;
grant select, insert, delete on public.access_code_attempts to service_role;
grant usage, select on sequence public.access_code_attempts_id_seq to service_role;

create or replace function public.consume_access_attempt(client_hash text, attempt_purpose text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_attempts integer;
  attempt_limit integer;
begin
  if client_hash is null
    or client_hash !~ '^[a-f0-9]{64}$'
    or attempt_purpose is null
    or attempt_purpose not in ('teacher_login', 'exam_code') then
    return false;
  end if;

  attempt_limit := case attempt_purpose when 'teacher_login' then 10 else 60 end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(attempt_purpose || ':' || client_hash, 0));
  delete from public.access_code_attempts
  where purpose = attempt_purpose
    and ip_hash = client_hash
    and attempted_at < now() - interval '15 minutes';

  select count(*)::integer into recent_attempts
  from public.access_code_attempts
  where purpose = attempt_purpose
    and ip_hash = client_hash
    and attempted_at >= now() - interval '15 minutes';

  if recent_attempts >= attempt_limit then
    return false;
  end if;

  insert into public.access_code_attempts (purpose, ip_hash)
  values (attempt_purpose, client_hash);
  return true;
end;
$$;

revoke all on function public.validate_exam_access_code(text) from public;
grant execute on function public.validate_exam_access_code(text) to anon, authenticated, service_role;
revoke all on function public.consume_access_attempt(text, text) from public;
grant execute on function public.consume_access_attempt(text, text) to service_role;
