# Exam Lifecycle, Security, and Reporting Design

## Purpose

Fix the student exam failures reported for class access and Grade 12 advanced-track answer indexes, and give teachers a safe way to preview, pause, resume, unlock, and monitor exams. This extends the existing imported-exam workflow while preserving legacy bundled-bank exams and existing score records.

## Confirmed User Requirements

- Fix the student join failure that displays `الصف غير متاح في هذا الاختبار`.
- Fix the Grade 12 advanced (`12-متقدم`) question 1 answer-index error shown while joining an exam.
- Let a teacher preview the actual student-facing exam before making it public.
- After two security warnings, lock a student out of the attempt; re-entry requires teacher admin-password verification.
- Request fullscreen and initialize/verify the exam warning sound as the student starts.
- Let a teacher pause and resume an exam using the same access code.
- Give each exam a detail page showing its code, participants, completions, scores, and recorded leave/kick/re-entry activity.
- Use `jev-latest` as appropriate for exam upload assistance.
- Work on a new local branch named `master`; do not modify `dev` or `main`.
- Use the Supabase CLI for Supabase work; do not use `gh`.

## Existing Project Context

- The project has an imported `exams` table with `available` and `archived` states, linked access codes, server-side submission grading, and immutable question snapshots on new imported-exam results.
- Student bank selection and warning behavior are in `src/pages/QuizApp.jsx` and `src/lib/examExecution.js`.
- Exam import and teacher code controls are in `src/components/admin/ExamImportDialog.jsx`, `ExamsPage.jsx`, and `ExamAccessPanel.jsx`.
- The existing warning implementation listens to visibility and window blur and auto-submits after the third event. The requested lock-and-teacher-unlock flow needs a server-verified attempt state, rather than a client-only modal.
- `jev-import-assist` currently uses `jev-latest` to map roster column headers. The project calls the Experiential Labs System One API from a Supabase Edge Function.
- `tasks/todo.md` contains unchecked work for a different admin/import project. It must remain intact; this work needs a separate task list when planning is authorized.

## Proposed Behavior

### 1. Exam join and answer-index corrections

The two reported join messages share one cause: the Edge Function correctly removes answer keys before returning student banks, but the browser then runs the teacher/import bank validator, which requires an answer index. The first `12-متقدم` question therefore throws `answer index is outside the option list`; the UI catches it and mislabels it as an unavailable class. Read and select the trusted, answer-redacted student bank without applying the import validator. Preserve the redaction and all server-side grading checks. Verify both the specific Grade 12 message and a genuine missing-bank condition remain distinguishable.

### 2. Teacher preview and publication

An imported exam remains unavailable to students until a teacher explicitly publishes it. The teacher preview renders the same question and choice layout students will see, with supported media, and lets the teacher inspect answer correctness separately. Validation errors (including an answer index outside its question's options) block publication. Student payloads never contain answer keys.

### 3. Pause and resume

An exam has explicit draft/available/paused/archived lifecycle states, or an equivalent representation that keeps legacy behavior compatible. Pause and resume are teacher-only atomic operations. A paused exam rejects new joins and submissions but retains the same linked code and attempt state. Resume restores access through that same code. If a code has an expiry, the implementation must preserve the remaining validity across the paused interval rather than letting a pause silently consume it.

### 4. Attempt security and teacher re-entry

The student explicitly starts the exam through an interaction that attempts fullscreen and resumes the Web Audio context. If either is denied or unavailable, the student sees a clear status and can retry where supported. The app monitors supported signals such as tab visibility, window focus, and fullscreen exit. Two violations show warnings; the third locks the attempt and prevents further answers/submission until teacher authorization.

Teacher authorization is checked server-side using the existing protected teacher-password verification path or a narrowly scoped equivalent. It must be rate limited and must not create a teacher login session as a side effect. A successful check records a re-entry event and unlocks only the specific exam attempt. It does not expose a teacher password/hash or trust a client-supplied `isTeacher` flag.

Browser enforcement has hard limits: a web page cannot request control of the operating system's master volume or prevent device mute. Fullscreen requires a user gesture and the user can exit it. The app can initialize/verify its own warning sound and record supported focus/fullscreen events, but cannot detect every prohibited key or guarantee an audible device. These are product limitations, not implementation bugs.

### 5. Exam detail and event history

Each exam has a teacher-only detail route showing the active/reusable code and expiry, join count, completion count, submitted scores, and event history. The event history records server-timestamped joins, submissions, detectable leave/fullscreen events, warning counts, lockouts, teacher unlocks, pauses, and resumes. Event writes are accepted through trusted server-side code; teachers can read only through teacher-authorized access. Existing result snapshots and timestamps support historical scores, but no pre-release leave/kick events can be reconstructed.

## Jev Upload Integration

Use `jev-latest` only for bounded decisions over extracted text/JSON, such as classifying ambiguous extracted content or flagging a parse for teacher review. Keep file parsing, question/choice extraction, option indexing, and validation deterministic and authoritative. Jev output must never become the answer key or publish an exam without teacher confirmation.

The hosted System One contract describes typed choices/scores/yes-no decisions, up to 32 questions and a 64 KiB request. It is not a general file parser or text-generation interface. Keep calls server-side in Supabase Edge Functions, reuse the project's secret-handling pattern, bound payload size, handle timeout/provider failure without blocking deterministic uploads, and log no credentials or unnecessary student data. Before implementation, verify the endpoint and key configured for the linked `dev-latest` Supabase project against current Experiential Labs documentation and the existing function; do not silently switch providers or domains.

## Security and Data Constraints

- Preserve the existing teacher role/RLS boundary and add least-privilege policies for any new state/event records.
- Keep answer keys server-side for imported exams and validate submissions against canonical banks and the displayed question snapshot.
- Make pause/resume, attempt unlock, and audit writes atomic or server-validated; do not treat client state as authority.
- Rate limit password verification and avoid returning password-derived details.
- Record server timestamps. Treat browser-reported event types as evidence of a client event, not as proof of user intent or a complete account of device behavior.
- Preserve legacy access codes, legacy score behavior, and historical result snapshots unless a regression requires a separately reviewed migration.

## Acceptance Criteria

1. A student assigned to a supported bank can enter; the exact previous unavailable-class failure has a regression case.
2. Grade 12 advanced question 1 can be answered, shuffled, submitted, and graded with the correct displayed option; the previous answer-index error has a regression case.
3. A teacher can preview an imported exam before publication; invalid banks cannot be published and answer keys are absent from student payloads.
4. A teacher can pause and resume an exam; the same code remains associated and usable after resumption, while joins/submissions are safely blocked during pause.
5. Two supported security violations warn; the next locks the attempt. Only a server-verified teacher password can unlock that attempt, with rate limiting and an audit entry.
6. Start flow attempts fullscreen and prepares warning audio from a user gesture, reports unsupported/denied behavior clearly, and tracks supported exit signals without claiming control of OS volume.
7. Teachers can inspect a protected exam detail page with code, counts, results, and recorded event history; non-teachers cannot read management/event data.
8. Jev failure, timeout, low confidence, and unavailable secrets fall back to deterministic parsing and manual teacher review. Jev cannot set correct answers or publish exams.
9. Existing legacy code, exams, results, and reports remain usable.
10. Supabase schema changes are versioned as migrations, verified against the linked development project with Supabase CLI, and no production deployment or `gh` operation occurs as part of development verification.

## Verification Strategy

- Add focused unit/contract tests for bank selection, option shuffling/grading, warning thresholds, attempt unlock authorization, lifecycle transitions, event validation, and Jev request/response handling.
- Run relevant existing and new Node tests, lint, typecheck, and production build.
- Use a real browser flow to verify teacher preview, student join, fullscreen/audio capability messages, warning/lock/re-entry, pause/resume, and detail-page access controls.
- Apply and inspect migrations only against a confirmed development Supabase target. Verify RLS, RPC grants, state transitions, and event visibility through Supabase CLI SQL/query tooling available in the installed version.
- Do not deploy functions or migrations to production without a separate explicit deployment request.

## Risks and Open Decisions

| Item | Risk or decision |
| --- | --- |
| Supabase target | Confirm `dev-latest` means the intended Supabase project/branch and confirm the CLI link before any remote mutation. |
| Warning policy | This design interprets “2 warnings and it kicks” as two warnings, then lockout on the third violation, consistent with the current three-strike behavior. |
| Active student attempts during pause | Proposed behavior preserves attempt state and freezes the attempt. Confirm whether pause should instead simply block all access until resume. |
| Code expiry | Proposed behavior freezes remaining validity while paused. Confirm whether teachers expect expiry to continue in wall-clock time. |
| Teacher password re-entry | Use the protected teacher password verification mechanism without creating a teacher session; confirm whether the unlock applies once per attempt or for the rest of that exam attempt. |
| Event history | Browser signals can be incomplete or spoofed. The UI must distinguish recorded events from conclusive evidence of misconduct. |
| Jev endpoint/key | Existing code uses an Experiential Labs endpoint/key convention. Verify current docs and linked development secrets before changing that integration. |
| Scope | The existing task checklist is unrelated and incomplete. A separate named plan and task checklist will be needed; do not overwrite `tasks/todo.md`. |

## Out of Scope

- Preventing OS-level mute, blocking all system/browser shortcuts, or guaranteeing fullscreen/audio enforcement across browsers.
- Automatically deriving answer keys from Jev output.
- Production schema/function deployment, production secret changes, GitHub CLI operations, or merges to `dev`/`main`.

## References

- [System One API reference](https://docs.system-one.dev/en/docs/api) — request contract, `jev-latest` alias, and typed decisions.
- [Experiential Labs integration guidance](https://platform.experientiallabs.ai/docs/coding-agents) — use the Experiential Labs endpoint and credentials for that hosted integration.
- [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen) — fullscreen requires a user activation and may be denied.
- [Web Audio API best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) — create or resume audio from a user gesture; browser policy may block unattended playback.
