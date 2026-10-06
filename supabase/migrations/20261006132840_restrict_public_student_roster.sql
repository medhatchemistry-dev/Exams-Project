-- Student records contain names and student numbers; anonymous clients must not be able to enumerate them.
revoke select on table public.students from anon;
grant select on table public.students to authenticated;

drop policy if exists "Anyone can read the student roster" on public.students;
create policy "Scoped administrators can read the student roster"
  on public.students for select to authenticated
  using (
    (select public.has_teacher_permission('manage_students'))
    or (select public.has_teacher_permission('manage_exams'))
    or (select public.has_teacher_permission('view_grades'))
  );
