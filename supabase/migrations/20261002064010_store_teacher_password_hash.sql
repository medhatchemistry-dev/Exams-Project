create table public.teacher_login_passwords (
  id integer primary key check (id = 1),
  password_hash text not null
);

alter table public.teacher_login_passwords enable row level security;
revoke all on public.teacher_login_passwords from public, anon, authenticated;
grant select on public.teacher_login_passwords to service_role;

create or replace function public.verify_teacher_password(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select candidate is not null
    and length(candidate) between 1 and 128
    and exists (
      select 1 from public.teacher_login_passwords
      where id = 1
        and password_hash = extensions.crypt(candidate, password_hash)
    );
$$;

revoke all on function public.verify_teacher_password(text) from public, anon, authenticated;
grant execute on function public.verify_teacher_password(text) to service_role;
