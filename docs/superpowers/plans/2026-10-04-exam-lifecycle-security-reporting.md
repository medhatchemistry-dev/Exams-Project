# Exam Lifecycle, Security, and Reporting Implementation Plan

> **For agentic workers:** Execute this plan task-by-task on branch `master`. Keep each task focused, preserve unrelated changes, and use the Supabase CLI for Supabase inspection and development-project operations. Do not use `gh`.

**Goal:** Fix exam entry/grading failures and deliver teacher preview, pause/resume, password-gated attempt re-entry, and per-exam activity reporting.

**Architecture:** Retain the existing React/Supabase stack, imported exam banks, and server-side grading. Put lifecycle transitions, unlock verification, submission state, and activity writes behind teacher-authorized SQL RPCs or Supabase Edge Functions; the browser is presentation and telemetry input, never the authority. Keep deterministic exam file parsing and validation authoritative, using `jev-latest` only for bounded upload assistance followed by teacher review.

**Tech Stack:** React 18, Vite, Supabase JS, Supabase PostgreSQL migrations and Edge Functions, existing JavaScript import/execution utilities, System One / Jev API.

**Spec:** `docs/superpowers/specs/2026-10-04-exam-lifecycle-security-and-reporting-design.md`

## Global Constraints

- Work only on the new local branch `master`; do not modify or merge into `dev` or `main`.
- Use the Supabase CLI for Supabase work and do not use `gh`.
- Confirm the linked Supabase target is the intended `dev-latest` development project before any remote mutation; stop if the target is ambiguous or production.
- Do not deploy migrations/functions or change production secrets as part of this work.
- Preserve legacy access codes, score behavior, and existing historical result snapshots.
- Keep imported answer keys server-side; student payloads contain no correct-answer field.
- Never trust browser-supplied teacher status, attempt status, grade, answer key, or audit timestamp.
- Use `jev-latest` only for supported typed decisions over bounded extracted text/JSON; it cannot authoritatively create exam content, determine answer keys, or publish an exam.
- Fullscreen and audio startup are best-effort browser features. Never claim control of OS master volume or guarantee detection of all shortcuts.
- Preserve unrelated pre-existing untracked files and `tasks/todo.md`; track this work in `tasks/todo-exam-lifecycle.md`.

## Review Focus

1. A grade/track alias or assigned-class mismatch can reject a valid student at join; preserve the exact assigned-class rules and legacy selection path.
2. Shuffling can make a displayed answer index diverge from the canonical option; grade against canonical question IDs and option identity, not a stale client index.
3. A pause racing with join or submission can admit work after pause; serialize lifecycle checks and mutations in the database.
4. A re-entry request can be replayed or applied to another student; bind a short-lived authorization result to one attempt and one unlock operation.
5. Browser event telemetry can be missing or forged; label it as observed client activity, timestamp it on the server, and do not use it as sole proof of misconduct.

## File and Interface Map

- `src/lib/examExecution.js`: choose class bank and produce the displayed order; modify only if diagnosis identifies the index/selection mismatch.
- `src/lib/examImport.js`: deterministic bank parsing and answer-index validation; keep this as the authoritative validator.
- `src/pages/QuizApp.jsx`: student join, start, warning, submit, and re-entry UI state.
- `src/components/quiz/SecurityOverlay.jsx` and `ExamCodeScreen.jsx`: warning/lock states and student start guidance.
- `src/components/admin/ExamImportDialog.jsx`: import review and publish confirmation.
- `src/components/admin/ExamPreview.jsx` (new): shared student-facing question rendering for the teacher preview.
- `src/components/admin/ExamsPage.jsx` and `ExamAccessPanel.jsx`: lifecycle controls and exam-code access.
- `src/App.jsx`: teacher-only nested exam detail route.
- `src/components/admin/ExamDetailPage.jsx` (new): teacher-visible exam status, code, aggregates, scores, and activity timeline.
- `src/lib/examRepository.js` (new): teacher-authorized lifecycle, event, and detail queries through the existing Supabase client.
- `supabase/functions/validate-exam-code/index.ts`: join/check/submit state enforcement and trusted event handling where its current contract fits.
- `supabase/functions/teacher-login/index.ts` and `supabase/functions/_shared/`: reuse protected origin and server-side password verification patterns. Add `supabase/functions/verify-exam-reentry/index.ts` as the narrow, rate-limited password-check and attempt-unlock endpoint; it must not create or replace an Auth session.
- `supabase/migrations/`: create migrations using `supabase migration new <name>`; do not invent timestamps or rewrite applied migrations.
- `supabase/functions/jev-import-assist/index.ts` and `supabase/functions/_shared/jevStudentHeaders.js`: preserve the existing server-side Jev convention and add a separate upload-assistance contract only if a useful bounded decision is identified.
- `README.md`: document exam lifecycle, browser security limitations, and any required development secrets/configuration.

## Task List

### Phase 1: Reproduce and repair the reported failures

### Task 1: Fix student bank selection for answer-redacted payloads

**Files:** Inspect `src/pages/QuizApp.jsx`, `src/lib/examExecution.js`, `src/components/quiz/LoginScreen.jsx`, `supabase/functions/validate-exam-code/index.ts`, and exam-resolution SQL. Modify only files needed by the confirmed cause.

**Steps:** The Edge Function deliberately removes each question's `answer` field before returning banks to students. `selectExamBank()` currently passes that public payload through `sanitizeExamBanks()`, whose upload contract requires `answer`; question 1 consequently throws before join and is mislabeled as an unavailable class. Remove the import sanitizer from this student path. Validate only that the requested bank is a nonempty array of question records with IDs and 2–6 options, and strip any `answer` field defensively. Keep grade/track/section assignment checks intact. Manually verify a valid 12-advanced student joins without receiving answer keys, a true absent bank still reports unavailable, and an assigned-class mismatch is still rejected.

### Task 2: Verify the Grade 12 advanced answer-index join error is resolved

**Files:** Inspect the Grade 12 advanced bank in `public/question-bank.html` and its trusted SQL copy, `src/lib/examExecution.js`, student answer collection, `supabase/functions/_shared/legacyExamSubmission.js`, and the imported grading RPC migration. Modify only the failing path.

**Steps:** Confirm the exact `12-متقدم, question 1: answer index is outside the option list` exception no longer occurs during bank selection. Verify the public payload remains answer-free and the server-side legacy helper/imported grading RPC still grades by the trusted canonical option. Keep answer-range validation on the server; do not “fix” this by adding answer keys to the student response or removing server checks.

### Checkpoint: Join and grading

- [ ] Root cause for each report is documented; fixes preserve class assignment and canonical server-side grading.
- [ ] Manual reproduction of both reported cases succeeds.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run build` pass.

### Phase 2: Lifecycle and trusted attempt contracts

### Task 3: Confirm the development Supabase target and define lifecycle contracts

**Files:** No application files. Use the installed Supabase CLI and read-only SQL/schema inspection.

**Steps:** Discover supported commands with `supabase --help` and the relevant group help. Inspect local CLI version/link and linked project identity; do not print secrets. Confirm `dev-latest` is a non-production development project. Inspect current exams, access-code, result, teacher role, password verification, and migration history contracts. If the target cannot be confirmed, stop before remote writes. Record exact proposed RPC/Edge Function inputs, outputs, grants, and state transition rules in the plan checklist.

### Task 4: Add minimal lifecycle, attempt, and audit database support

**Files:** Create timestamped migration(s) using `supabase migration new`; modify the related RPC definitions only in new forward migrations.

**Steps:** Add a `draft` state for new imports and a `paused` state while preserving existing `available`/`archived` rows. Add attempt state for warning count, lock status, and the one-attempt re-entry grant. Add an append-only event table with exam/attempt references, enumerated event type, bounded metadata, and database-generated `created_at`. Enable RLS, grant teacher-only reads, and revoke direct client writes. Make each `SECURITY DEFINER` RPC explicitly verify `auth.uid()` has a `teacher_roles` row; grant execute only to the required role. Add atomic pause/resume and lock/unlock operations; check lifecycle status in both code resolution and submission. Store pause start and shift a timed code's expiry by the paused duration when resuming, retaining code ID and code text. Apply only after confirming the `dev-latest` project; inspect grants, RLS, foreign keys, migration history, and state transitions using Supabase CLI. Do not deploy to production.

### Checkpoint: Backend contract

- [ ] Only teachers can manage lifecycle and read exam analytics.
- [ ] Student join and submission reject paused exams; resume reuses the same code.
- [ ] Unlock is bound to one attempt and server-side password validation; event writes cannot be forged through direct table access.

### Phase 3: Preview and pause/resume teacher workflows

### Task 5: Add student-faithful exam preview and explicit publication

**Files:** `src/components/admin/ExamImportDialog.jsx`, create `src/components/admin/ExamPreview.jsx`, `src/components/admin/ExamsPage.jsx`, and `src/lib/examImport.js` only for a confirmed validation defect.

**Steps:** Render all selected questions and choices with the existing student typography/math/media components. Include a teacher-only answer review separate from the student presentation. Run deterministic bank validation before enabling publish; display question/bank context for failures. Add explicit publish confirmation and keep drafts out of student code resolution. Verify a valid preview matches the student layout, invalid answer indexes block publication, and answer keys do not appear in student payloads.

### Task 6: Add teacher pause/resume controls for an existing code

**Files:** `src/components/admin/ExamsPage.jsx`, `src/components/admin/ExamAccessPanel.jsx`, and `src/lib/examRepository.js`.

**Steps:** Display current exam status and provide teacher-only Pause and Resume actions with progress and actionable error states. Call the atomic lifecycle RPC; do not deactivate or regenerate the existing code. Display the same code after both transitions. Verify paused join/submit rejection and successful reopening through the same code, including preserved expiry remainder and existing score history.

### Phase 4: Browser security and password-gated re-entry

### Task 7: Start the attempt with best-effort fullscreen/audio and track supported events

**Files:** `src/pages/QuizApp.jsx`, `src/components/quiz/ExamCodeScreen.jsx`, `src/components/quiz/SecurityOverlay.jsx`, and focused shared browser helper only if more than one component needs it.

**Steps:** From the student's explicit start click, call `document.documentElement.requestFullscreen()` and resume/init the existing AudioContext. Show whether each action succeeded and provide a retry action if fullscreen/audio startup fails. Track `visibilitychange`, window `blur`, and `fullscreenchange` while an attempt is active; de-duplicate repeated notifications for one transition. Show warnings for violations one and two; on violation three, persist a lock and stop accepting answers without submitting. Clearly state that device mute and every OS/browser shortcut cannot be controlled.

### Task 8: Implement teacher-password re-entry for one locked attempt

**Files:** `src/pages/QuizApp.jsx`, create `src/components/quiz/TeacherReentryDialog.jsx`, create `supabase/functions/verify-exam-reentry/index.ts`, and use the attempt rate-limit RPC introduced in Task 4.

**Steps:** Present `TeacherReentryDialog` only after lockout. Send the password and opaque attempt ID to `verify-exam-reentry` over HTTPS. Verify the password using the existing server-side password-hash function, consume the rate-limit RPC, and call the attempt-bound unlock RPC. Return only success/failure and the unlocked attempt state; never return a password/hash or Auth session. Reject wrong passwords, replayed unlocks, other attempt IDs, and paused/archived exams. Verify the student can continue the same attempt and that answers and warning count remain intact.

### Checkpoint: Student attempt control

- [ ] The student start action handles browser fullscreen/audio rejection with clear messaging.
- [ ] Two warnings are shown; the third event locks without submitting.
- [ ] Only server-verified teacher authorization unlocks that attempt; failed attempts are rate limited and audited.
- [ ] Pause remains authoritative while an attempt is locked.

### Phase 5: Per-exam detail and upload assistance

### Task 9: Add the teacher-only exam detail page

**Files:** `src/App.jsx`, `src/components/admin/ExamDetailPage.jsx` (new), `src/lib/examRepository.js` (new if not already created), admin exam list navigation, and RLS/query migration only if earlier contract inspection requires it.

**Steps:** Add a teacher-protected `/admin/exams/:examId` route. Display exam status, the full associated code and expiry to authorized teachers, joined count, completion count, score list/summary, and chronological server-recorded attempt events. Use result snapshots for historic scores; label activity before event tracking as unavailable rather than implying no violations. Ensure the detail query cannot fetch other exam records by changing the URL and non-teacher requests are rejected.

### Task 10: Add bounded `jev-latest` upload assistance without making it authoritative

**Files:** `supabase/functions/jev-import-assist/index.ts` or a separately scoped `exam-import-assist` function, `_shared` request/response helpers, and `src/components/admin/ExamImportDialog.jsx`.

**Steps:** First verify current Experiential Labs docs, configured development endpoint, key name, response format, limits, timeout and billing behavior. If Jev can materially help a specific ambiguous extraction/classification/review decision, send only bounded extracted text/JSON from the Edge Function with `model: "jev-latest"`, validate the typed response and confidence, and show a teacher-review suggestion. Keep deterministic parser output available on timeout, error, missing secret, or low confidence. Do not upload original files or student data, generate answer keys, or publish from a Jev result. If no bounded task is justified, keep the existing spreadsheet header mapping only and document why exam uploads use deterministic parsing.

### Checkpoint: Teacher workflows

- [ ] Preview, publish, pause, resume, and detail route work for a teacher session.
- [ ] Counts distinguish joins from completed submissions; event timeline uses server timestamps.
- [ ] Jev assistance is optional, server-side, validated, and cannot change answer keys or publish state.

### Phase 6: Integration and development verification

### Task 11: Verify the complete development workflow and document operations

**Files:** `README.md` plus focused implementation files only for defects discovered during verification.

**Steps:** Exercise imported exam upload → preview → publish → student entry → question 1 answer/submit → pause during use → resume same code → warning/lock → teacher unlock → result and event report. Exercise legacy code/score flow separately. Confirm teacher-only routes/data, non-teacher denials, paused join/submit denials, stable scores after refresh, and behavior when browser audio/fullscreen is unavailable. Run `npm run lint`, `npm run typecheck`, and `npm run build`; use Supabase CLI to inspect development migration/function state and SQL contracts. Document configuration and browser limits. Do not run production deploy, alter production secrets, merge branches, push to `dev`/`main`, or use `gh`.

### Checkpoint: Ready for review

- [ ] All spec acceptance criteria are met or explicitly marked blocked by verified platform limitations.
- [ ] Existing legacy workflows remain available.
- [ ] Development project is the confirmed `dev-latest` target; production remains unchanged.
- [ ] Lint, typecheck, build, and manual user flows succeed.
- [ ] Only intended files are changed; changes remain on local branch `master`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| The selected Supabase CLI link points to production or the wrong project. | High | Verify project identity before any remote write; stop on ambiguity. |
| Existing exams/code expiry semantics conflict with pause-and-resume. | High | Inspect current RPC/schema and preserve remaining validity with atomic server-side timestamps. |
| Teacher password verification creates a teacher session or is brute-forced. | High | Use a narrow verify-and-unlock contract, attempt-bound one-use token, and rate limiting. |
| Client warning telemetry is incomplete or spoofable. | Medium | Store server receipt time, validate event kinds, and label reports as observed events. |
| Jev alias/API contract or cost changes. | Medium | Verify official current docs and dev key configuration; make failure non-blocking and keep deterministic parsing. |
| Browser blocks audio/fullscreen or student mutes OS volume. | Medium | Gate on a user gesture where supported, show accurate status, and avoid promising enforcement the platform cannot provide. |

## Execution Notes

- The plan is intentionally sequential because join/grading diagnosis informs the student contract, and the database lifecycle/attempt contracts must exist before the UI relies on them.
- Keep new migrations forward-only and generated with the installed Supabase CLI. Inspect the generated SQL and migration history before applying to the development project.
- Do not change `tasks/todo.md`; task progress for this plan belongs in `tasks/todo-exam-lifecycle.md`.
- User review is required before execution because this is the concrete plan that now translates the approved design into code and remote development-project operations.
