alter table public.teacher_roles
  add column if not exists display_name text not null default '';

update public.teacher_roles
set display_name = case when is_owner then 'مالك المنصة' else 'مدير ' || right(user_id::text, 4) end
where display_name = '';

create table public.teacher_delegate_passwords (
  user_id uuid primary key references public.teacher_roles(user_id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.teacher_delegate_passwords enable row level security;
revoke all on public.teacher_delegate_passwords from public, anon, authenticated;
grant select, insert, update, delete on public.teacher_delegate_passwords to service_role;

create or replace function public.set_teacher_login_password(candidate text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if candidate is null or length(candidate) not between 8 and 128 then
    raise exception 'Password must contain between 8 and 128 characters' using errcode = '22023';
  end if;
  if exists (select 1 from public.teacher_delegate_passwords
    where password_hash = extensions.crypt(candidate, password_hash)) then
    raise exception 'Owner password must be unique' using errcode = '23505';
  end if;
  insert into public.teacher_login_passwords (id, password_hash)
  values (1, extensions.crypt(candidate, extensions.gen_salt('bf')))
  on conflict (id) do update set password_hash = excluded.password_hash;
end;
$$;
revoke all on function public.set_teacher_login_password(text) from public, anon, authenticated;
grant execute on function public.set_teacher_login_password(text) to service_role;

create or replace function public.set_teacher_delegate_password(target_user_id uuid, candidate text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if candidate is null or length(candidate) not between 12 and 128 then
    raise exception 'Administrator password must contain between 12 and 128 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.teacher_roles where user_id = target_user_id and not is_owner) then
    raise exception 'Delegated administrator was not found' using errcode = '22023';
  end if;
  if exists (select 1 from public.teacher_login_passwords
    where id = 1 and password_hash = extensions.crypt(candidate, password_hash))
    or exists (select 1 from public.teacher_delegate_passwords
      where user_id <> target_user_id and password_hash = extensions.crypt(candidate, password_hash)) then
    raise exception 'Each administrator password must be unique' using errcode = '23505';
  end if;
  insert into public.teacher_delegate_passwords (user_id, password_hash, updated_at)
  values (target_user_id, extensions.crypt(candidate, extensions.gen_salt('bf')), now())
  on conflict (user_id) do update set password_hash = excluded.password_hash, updated_at = now();
end;
$$;
revoke all on function public.set_teacher_delegate_password(uuid, text) from public, anon, authenticated;
grant execute on function public.set_teacher_delegate_password(uuid, text) to service_role;

create or replace function public.find_teacher_delegate_by_password(candidate text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select password_record.user_id
  from public.teacher_delegate_passwords as password_record
  join public.teacher_roles as role on role.user_id = password_record.user_id and not role.is_owner
  where candidate is not null and length(candidate) between 12 and 128
    and password_record.password_hash = extensions.crypt(candidate, password_record.password_hash)
  limit 1;
$$;
revoke all on function public.find_teacher_delegate_by_password(text) from public, anon, authenticated;
grant execute on function public.find_teacher_delegate_by_password(text) to service_role;
