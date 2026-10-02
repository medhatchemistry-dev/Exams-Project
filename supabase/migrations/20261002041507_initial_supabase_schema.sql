create table public.teacher_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.students (
  id bigint generated always as identity primary key,
  full_name text not null,
  student_number text not null unique,
  grade text not null check (grade in ('10', '11', '12')),
  track text not null check (track in ('متقدم', 'عام')),
  section text not null check (section in ('1', '2')),
  created_at timestamptz not null default now()
);

create index students_class_name_idx
  on public.students (grade, track, section, full_name);

create table public.exam_results (
  id bigint generated always as identity primary key,
  student_name text not null,
  student_number text,
  grade text not null check (grade in ('10', '11', '12')),
  track text not null check (track in ('متقدم', 'عام')),
  section text not null check (section in ('1', '2')),
  score integer not null check (score >= 0),
  total integer not null check (total >= 0 and score <= total),
  percentage numeric(5, 2) generated always as (
    case when total > 0 then round((score::numeric / total) * 100, 2) else 0 end
  ) stored,
  answers_json jsonb not null default '{}'::jsonb,
  submission_time text not null,
  is_other boolean not null default false,
  is_perfect boolean generated always as (total > 0 and score = total) stored,
  created_at timestamptz not null default now()
);

create index exam_results_created_at_idx on public.exam_results (created_at desc);
create index exam_results_perfect_created_at_idx
  on public.exam_results (created_at desc) where is_perfect;
create index exam_results_class_created_at_idx
  on public.exam_results (grade, track, section, created_at desc);

alter table public.teacher_roles enable row level security;
alter table public.students enable row level security;
alter table public.exam_results enable row level security;

grant select on public.teacher_roles to authenticated;
grant select on public.students to anon, authenticated;
grant insert on public.exam_results to anon, authenticated;
grant select on public.exam_results to authenticated;
grant usage, select on sequence public.exam_results_id_seq to anon, authenticated;

create policy "Users can read their own teacher role"
  on public.teacher_roles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Anyone can read the student roster"
  on public.students for select to anon, authenticated
  using (true);

create policy "Anyone can submit an exam result"
  on public.exam_results for insert to anon, authenticated
  with check (
    length(trim(student_name)) between 1 and 160
    and (student_number is null or length(trim(student_number)) between 1 and 80)
    and jsonb_typeof(answers_json) = 'object'
    and jsonb_object_length(answers_json) <= 100
  );

create policy "Teachers can read exam results"
  on public.exam_results for select to authenticated
  using (
    exists (
      select 1 from public.teacher_roles
      where teacher_roles.user_id = (select auth.uid())
    )
  );
