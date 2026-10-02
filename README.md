# Exams Project

A chemistry assessment app for students and teachers. Students enter an active exam code, identify themselves from the class roster (or enter their details manually), complete a randomized quiz, and submit their results. Teachers can manage exam access, review and export results, and generate certificates.

The app uses React, Vite, and Supabase. The earlier Base44 version is preserved on the [`backup/base44-v1`](https://github.com/medhatchemistry-dev/Exams-Project/tree/backup/base44-v1) branch.

## Features

- Student quiz flow with grade, track, section, and roster selection.
- Manual student entry when a name is not listed.
- Time-limited or open-ended exam access codes managed by teachers.
- Question and answer shuffling, exam security prompts, and result submission.
- Teacher dashboard for results, CSV export, certificates, and source access.
- Supabase Auth, role-protected teacher features, database row-level security, and Edge Functions.

## Local development

### Requirements

- Node.js 20.19 or newer.
- npm.
- A Supabase project with the database migrations and Edge Functions configured (see [Supabase setup](#supabase-setup)).

### Run the app

1. Clone the repository and switch to the development branch:

   ```bash
   git clone --branch dev https://github.com/medhatchemistry-dev/Exams-Project.git
   cd Exams-Project
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create `.env.local` in the repository root with your Supabase project URL and **publishable** key:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
   ```

   Get these values from your Supabase project's API settings. Do not put a service-role or secret key in a `VITE_` variable; Vite embeds client variables in the browser bundle.

4. Start the development server:

   ```bash
   npm run dev
   ```

Vite prints the local URL (normally `http://localhost:5173`). The frontend requires both Supabase variables at startup.

## Application routes

| Path | Purpose |
| --- | --- |
| `/` | Student exam access, registration, quiz, and result flow |
| `/admin` | Teacher login and administration dashboard |
| `/register` | Public Supabase Auth registration; registration does not grant teacher access |
| `/reset-password` | Password reset flow |

The teacher dashboard is available only to authenticated users with a row in `public.teacher_roles`. Teacher sign-in is handled by the `teacher-login` Edge Function.

## Supabase setup

Database schema and row-level security policies are versioned in `supabase/migrations/`. They cover the student roster, exam results, teacher roles, exam access codes, teacher password verification, and access-attempt rate limiting.

### Apply database migrations

Install and authenticate the [Supabase CLI](https://supabase.com/docs/guides/cli). This repository has migrations and functions under `supabase/` but does not currently include a CLI `config.toml`, so initialize the local Supabase project configuration first:

```bash
supabase login
supabase init
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Review the migrations before applying them to a project with existing data. You can also apply the SQL migrations through the Supabase dashboard.

### Deploy Edge Functions

The app calls two functions:

- `validate-exam-code` checks that a student-provided code is active and has not expired.
- `teacher-login` verifies the teacher password, applies rate limiting, and creates the teacher Auth session.

Deploy both functions to the linked project:

```bash
supabase functions deploy validate-exam-code
supabase functions deploy teacher-login
```

Both functions use server-side Supabase secrets. Never expose a service-role/secret key, teacher password, or password hash in the frontend, repository, or Git history. The teacher password hash is stored in the single allowed row of `public.teacher_login_passwords` and checked server-side. `teacher-login` uses `TEACHER_LOGIN_EMAIL` when configured; otherwise it uses the default email in the function source, then creates or updates the matching Auth identity after password verification.

The Edge Functions currently allow local development origins (`localhost` and `127.0.0.1`) and HTTPS hosts matching `exams-project` Vercel deployment domains. Update their origin allowlist if the app is served from a different custom domain.

## Project structure

```text
src/
  pages/                 Student quiz, teacher dashboard, and auth routes
  components/            Quiz and teacher-dashboard UI
  api/supabaseClient.js  Supabase browser client
  lib/                   Auth, question-bank, export, and app utilities
public/
  question-bank.html     Bundled chemistry question bank
supabase/
  functions/             Exam-code validation and teacher-login functions
  migrations/            Database schema, policies, and security changes
```

## Quality checks

Run the checks defined in `package.json` before submitting changes:

```bash
npm run lint
npm run typecheck
npm run build
```

## Deployment.

The app is a static Vite site built with `npm run build` (output directory: `dist/`). Configure the hosting project with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for each environment, and deploy Supabase migrations and Edge Functions separately. Git pushes are handled by the hosting project's existing Git integration; confirm the configured deployment branch in its project settings.
