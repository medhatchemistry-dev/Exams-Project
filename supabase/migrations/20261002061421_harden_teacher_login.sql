-- Remove anonymous table access, consolidate the teacher policies, and add
-- the foreign-key index used when managing codes.
revoke all on public.exam_access_codes from anon;
grant select, insert, update, delete on public.exam_access_codes to authenticated;
grant usage, select on sequence public.exam_access_codes_id_seq to authenticated;

drop policy if exists "Teachers can read exam access codes" on public.exam_access_codes;
drop policy if exists "Teachers can manage exam access codes" on public.exam_access_codes;

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

create index if not exists exam_access_codes_created_by_idx
  on public.exam_access_codes (created_by);
