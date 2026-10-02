create or replace function public.prevent_archiving_exam_with_active_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' and exists (
    select 1 from public.exam_access_codes
    where exam_id = old.id
      and is_active
      and (expires_at is null or expires_at > now())
  ) then
    raise exception 'Deactivate the active exam access code before archiving this exam' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_archiving_exam_with_active_code() from public, anon, authenticated;
create trigger exams_prevent_active_code_archive
before update of status on public.exams
for each row execute function public.prevent_archiving_exam_with_active_code();

create or replace function public.prevent_deleting_exam_with_active_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.exam_access_codes
    where exam_id = old.id and is_active
      and (expires_at is null or expires_at > now())
  ) then
    raise exception 'Deactivate the active exam access code before deleting this exam' using errcode = '23514';
  end if;
  return old;
end;
$$;

revoke all on function public.prevent_deleting_exam_with_active_code() from public, anon, authenticated;
create trigger exams_prevent_active_code_delete
before delete on public.exams
for each row execute function public.prevent_deleting_exam_with_active_code();
