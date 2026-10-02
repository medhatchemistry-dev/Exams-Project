create or replace function public.verify_teacher_password(candidate text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select candidate is not null
    and length(candidate) between 1 and 128
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'teacher_login_password_hash'
        and decrypted_secret = extensions.crypt(candidate, decrypted_secret)
    );
$$;

revoke all on function public.verify_teacher_password(text) from public, anon, authenticated;
grant execute on function public.verify_teacher_password(text) to service_role;
