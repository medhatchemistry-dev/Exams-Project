# Exams Project.

A chemistry assessment app for students and teachers. Students enter an active exam code, identify themselves from the class roster (or enter their details manually), complete a randomized quiz, and submit their results. Teachers can manage exam access, review and export results, and generate certificates.

The app uses React, Vite, and Supabase. The earlier Base44 version is preserved on the [`backup/base44-v1`](https://github.com/medhatchemistry-dev/Exams-Project/tree/backup/base44-v1) branch.

## Features

- Student quiz flow with grade, track, section, and roster selection.
- Manual student entry when a name is not listed.
- Time-limited or open-ended exam access codes managed by teachers.
- Teacher exam revisions and duration settings, plus pause, resume, archive, and restore workflows that preserve history.
- Autosaved student answers and attempt recovery on the same device, including while a teacher has paused an exam.
- Exam imports from PDFs, structured HTML, and public HTTPS websites, with images and teacher review.
- Bilingual Arabic and English answer choices, with editable translations and math typesetting for chemistry formulas.
- Question and answer shuffling, exam security prompts, and result submission.
- Exam-based grade review, student answer details, PDF reports, class grade exports, certificates, and source access.
- Bilingual student roster imports with flexible spreadsheet headers and optional server-side Jev header mapping.
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
| `/admin/settings` | Owner-only password and delegated administrator settings |
| `/register` | Public Supabase Auth registration; registration does not grant teacher access |
| `/reset-password` | Password reset flow |

The teacher dashboard is available only to authenticated users with an enabled row in `public.teacher_roles`. Exam, student, and grade permissions are checked in both the interface and database policies. The platform owner alone can open `/admin/settings`.

## Supabase setup

Database schema and row-level security policies are versioned in `supabase/migrations/`. They cover the student roster, exam results, teacher roles, exam access codes, teacher password verification, access-attempt rate limiting, and exam assignment/completion. The migration `20261002202644_exam_assignment_and_completion.sql` adds exam class targeting and the teacher-only `complete_exam` RPC used to finish an exam while preserving its results.

### Apply database migrations

Install and authenticate the [Supabase CLI](https://supabase.com/docs/guides/cli). This repository has migrations and functions under `supabase/` but does not currently include a CLI `config.toml`.

#### Supabase targets and current connection

The `dev` and `master` checkouts use separate Supabase projects:

- `dev`: `eybupykryqjgjvcbwsqi`
- `master` (isolated project): `sbgohdehpkjfsktgdzjj`

This checkout's `.env.local` and the published `https://chemistry-khalid.vercel.app` bundle currently target `master`. The Supabase CLI login used for this checkout can access `master`; it does not currently have access to the separate `dev` project. Confirm the project reference before changing a database or deploying functions.

As of 2026-10-06, the latest schema migration and six Edge Functions are deployed to `master`. The owner password and exam re-entry password are stored as separate hashes. The database has one protected owner role; delegated accounts have explicit exam, student, and grade permissions.

Supabase CLI's linked-project setting is local to the checkout; it does not follow Git branch changes. For remote commands, always pass the intended project's ref explicitly. Do not use `--linked` by itself.

Keep Git branches in separate worktrees when using local Supabase settings: ignored `.env.local` and `supabase/.temp/` files remain attached to a directory when Git switches branches. The primary checkout for this work is `master` and points to the isolated master project; use a separate `dev` worktree for the dev project.

```bash
supabase login
pwsh ./scripts/supabase-master-db-push.ps1 # dry-run against isolated master
pwsh ./scripts/supabase-master-db-push.ps1 -Apply
```

Review the pending migration list and dry-run output before applying migrations. `db push` applies the checked-in migration versions. Do not create replacement timestamps or manually edit the remote migration history. You can also apply SQL through the Supabase dashboard, but record the exact checked-in migration version through the supported migration workflow.

The master migration helper uses the explicit master ref and reads its database password from the current Windows user's DPAPI-protected local file. For any other project, supply that project's full ref explicitly; Git branch switches do not update Supabase CLI's local link.

When migrations change on GitHub `master`, `.github/workflows/deploy-master-database.yml` applies them to `exams-master` (`sbgohdehpkjfsktgdzjj`). The GitHub repository secret `SUPABASE_DB_URL` holds that project's session-pooler connection string. The workflow has a fixed master-only database URL and runs only for `master`; it cannot apply migrations to `dev`.

### Deploy Edge Functions

The app calls six functions:

- `validate-exam-code` checks that a student-provided code is active and has not expired.
- `teacher-login` verifies the teacher password, applies rate limiting, and creates the teacher Auth session.
- `manage-teacher-settings` is owner-only and manages delegated admin accounts, permissions, the owner password, and the separate student re-entry password.
- `jev-import-assist` maps unfamiliar student spreadsheet column labels. It requires a signed-in teacher and sends only header labels and unmapped field names to the server-side Jev request; roster rows never go to Jev.
- `verify-exam-reentry` checks the student re-entry password and unlocks only the specified locked attempt; it does not create an Auth session.
- `fetch-exam-source` lets signed-in teachers import bounded public HTTPS HTML and image assets for review. It validates teacher access, DNS results, and redirects, rejects private addresses, and never runs imported JavaScript.

Imported exam files use deterministic HTML/PDF parsing and teacher review. Jev's `jev-latest` API accepts bounded structured decision questions, not exam files or a reliable question-bank parser, so this workflow does not send exam content to Jev or use it to create questions, answer keys, or publication state. Roster header mapping remains the only Jev-assisted workflow.

Deploy the functions you use to the explicitly selected project:

```bash
pwsh ./scripts/supabase-master-deploy-functions.ps1
```

Keep project refs explicit for every migration and function deployment so switching Git branches cannot redirect a database change.

Set `EXPERIENTIAL_API_KEY` in the Supabase project's Edge Function secrets before using Jev header mapping. The `jev-import-assist` function reads it with `Deno.env.get` and calls `jev-latest` through the Experiential Labs `/v1/systemone` endpoint. Keep this key server-side; never add it to a `VITE_` variable, frontend code, or Git. If the key is unavailable or Jev cannot classify a header confidently, the student import retains its deterministic header mapping and review flow.

All functions use server-side Supabase secrets. Never expose a service-role/secret key, teacher password, or password hash in the frontend, repository, or Git history. The teacher password hash is stored in `public.teacher_login_passwords` and checked server-side. `teacher-login` uses `TEACHER_LOGIN_EMAIL` when configured; otherwise it uses the default email in the function source, then creates or updates the matching Auth identity after password verification.

#### Reset the teacher password

The owner password is a database value, not a Supabase project password or a website build variable. The owner can change it from **Admin → Settings**. The exam re-entry password is separate and can also be changed there. For recovery, the helper below changes only the owner password hash and requires a strong value:

```powershell
pwsh ./scripts/reset-master-teacher-password.ps1
```

To have the helper generate a strong random password instead, run `pwsh ./scripts/reset-master-teacher-password.ps1 -Generate` and save the password it prints. Never commit that value. The existing auth identity is synchronized to the new password on first login.

### Production teacher login and allowed origins

The teacher password is verified against the hash in the connected Supabase database. The login screen distinguishes a rejected password (`401`), a temporary rate limit (`429`), and a connection/service error. If a known password is rejected, use the reset helper above. If login still fails for another reason, check the Edge Function logs for a rejected `OPTIONS` preflight; a `403` means the browser origin is not allowed and the password has not been checked.

The functions allow local development and the legacy `exams-project*.vercel.app` origins. The current main production site is `https://chemistry-khalid.vercel.app`; its exact origin is configured in the Exams Supabase project. The `manage-teacher-settings` function also needs that exact configured origin. For any custom production hostname, configure the exact HTTPS origin in the Supabase Edge Function secret `APP_ALLOWED_ORIGINS` (comma-separated when multiple origins are needed):

```bash
supabase secrets set APP_ALLOWED_ORIGINS="https://chemistry-khalid.vercel.app" --project-ref sbgohdehpkjfsktgdzjj
```

Use an origin only (`https://hostname`), with no path or trailing slash. Do not use `*`, all of `vercel.app`, or a hostname belonging to another site. After a domain change, update this secret for the correct Supabase project. The same origin check is used by `teacher-login`, `validate-exam-code`, `verify-exam-reentry`, and `jev-import-assist`.

### Exam attempt security and browser limits

Teachers can preview an imported exam before publishing its access code, then pause and resume the exam with the same code. A pause blocks joins and submissions and extends a timed code by the pause duration. Existing student answers stay in the active browser session while the exam is paused or a teacher verifies a locked attempt.

For imported exam attempts, the third recorded visibility, window-blur, or fullscreen-exit warning locks the attempt without auto-submitting it. Re-entry checks the teacher password on the server, binds the unlock to that attempt, and rate-limits retries. Student activity events use server timestamps, but browser signals can be incomplete or forged and are not standalone proof of misconduct.

Before fullscreen, students must play and confirm the exam sound check. Browsers can still deny fullscreen, and students can exit it. A website cannot unmute an operating system or device, control its physical volume, or detect every browser or operating-system shortcut.

Student roster records are not readable through the anonymous Supabase API. The student picker obtains only the roster for the class assigned to its active exam code; exams without a specific class use manual student entry. Signed-in administrators need an explicit admin permission to read the roster.

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
  functions/             Exam validation, teacher login, source import, and Jev assistance
  migrations/            Database schema, policies, and security changes
scripts/
  reset-master-teacher-password.ps1  Secure teacher password reset and login check
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
