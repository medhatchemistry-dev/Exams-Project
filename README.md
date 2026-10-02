# Exams Project

Chemistry assessment app built with React, Vite, and Supabase. The original Base44 version is preserved on branch `backup/base44-v1`.

## Local setup

1. Install Node.js 20.19+ and run `npm install`.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Start the frontend with `npm run dev`.

The quiz and registration are public. Students can choose themselves from `students` or use the manual “Other” form. Student quiz results are written to Supabase. The `/admin` dashboard requires a Supabase Auth user granted the teacher role in `public.teacher_roles`.

## Supabase

The schema and RLS policies are in `supabase/migrations/`. Apply migrations with the Supabase CLI (`supabase db push`) or the Supabase dashboard. Roster rows are stored in `public.students`; only teachers should be granted database write access to this table.

The student entry screen checks codes through the `validate-exam-code` Edge Function; the password-only teacher login uses `teacher-login`. Deploy both functions and apply the matching database migrations before enabling the exam. Store the teacher password as a bcrypt hash in the single allowed row of `public.teacher_login_passwords`; never put the password or its hash in the browser bundle or Git. The function requires a configured teacher Auth identity to create a session.

To grant an existing Auth user teacher access, look up their user UUID in Supabase Authentication and run:

```sql
insert into public.teacher_roles (user_id)
values ('<auth-user-uuid>');
```

Public signup does not grant a role. Never put a service-role key in frontend environment variables.

## Checks and deployment

```bash
npm run lint
npm run typecheck
npm run build
```

The Vercel project should be linked to the private GitHub repository. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for production, preview, and development before deploying. Pushes to `main` then trigger production deployments.
