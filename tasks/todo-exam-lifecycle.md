# Exam Lifecycle, Security, and Reporting Task Checklist

Plan: `docs/superpowers/plans/2026-10-04-exam-lifecycle-security-reporting.md`
Spec: `docs/superpowers/specs/2026-10-04-exam-lifecycle-security-and-reporting-design.md`
Branch: `master`

## Phase 1: Reported exam failures

- [x] Task 1: Fix student bank selection for answer-redacted payloads (root cause: teacher import validator was applied to the student response)
- [x] Task 2: Confirm Grade 12 advanced question 1 no longer fails bank selection; preserve answer-key redaction and server grading

### Checkpoint: Join and grading

- [x] Root cause of both reported messages is confirmed: student bank selection rejected answer-redacted payloads.
- [x] Class assignment and server-side answer validation remain enforced.
- [x] Lint, typecheck, and production build pass.

## Phase 2: Supabase lifecycle and attempt contracts

- [x] Task 3: Confirmed the “Exams Website” organization and isolated `master` in project `sbgohdehpkjfsktgdzjj`; the existing `eybupykryqjgjvcbwsqi` project is the user-confirmed dev target. Inspected remote schema and RPC contracts.
- [x] Task 4: Applied all migrations, including the lifecycle migration, to isolated `master`; verified attempt/event tables have RLS and authenticated teacher-read policies, and lifecycle RPCs exist as `SECURITY DEFINER`. Behavioral denial checks still need seeded records.

### Checkpoint: Backend contract

- [ ] Paused exams reject join/submit, resume keeps the same code, and only teachers can manage lifecycle/report data.
- [ ] Unlock is server-verified, attempt-bound, rate-limited, and event-audited.

## Phase 3: Preview and lifecycle controls

- [ ] Task 5: Student-faithful preview, separate answer review, explicit publish, and deterministic publish validation are implemented; teacher browser flow remains unverified.
- [ ] Task 6: Teacher pause/resume controls and RPC are implemented; verify same-code behavior and expiry against the development database.

## Phase 4: Attempt warnings and re-entry

- [ ] Task 7: Imported attempt start requests fullscreen/audio, reports capability, de-duplicates and records supported events; verify in a real browser.
- [ ] Task 8: Imported attempts lock on the third recorded warning without submission; server-side password verification, IP rate limiting, failure audit, and attempt-bound unlock are implemented; verify against the development database.

### Checkpoint: Student attempt control

- [ ] No auto-submit on lock; attempt answers survive authorized re-entry.
- [ ] Browser limitations are reported accurately.

## Phase 5: Exam detail and Jev upload assistance

- [ ] Task 9: Teacher-only detail route, code/results/attempt aggregates, and server-timestamped observed-event timeline are implemented; verify non-teacher denial and live data on development.
- [x] Task 10: Reviewed the official typed-decision contract and existing Jev header mapping. No bounded exam-upload decision would improve deterministic parsing or validation, so exam content remains local and teacher-reviewed; rationale is documented in README.

### Checkpoint: Teacher workflows

- [ ] Preview/publish/pause/resume/detail all work for authorized teachers.
- [ ] Jev failure cannot block deterministic upload review or publish an exam.

## Phase 6: Integration review

- [x] Task 11: README now documents explicit Supabase project refs and branch/database isolation. Lint, typecheck, build, and all 70 Node tests pass; remote migrations and function deployments are verified. Manual teacher/student browser workflows still need test credentials and records in isolated `master`.

### Checkpoint: Ready for review

- [x] Spec acceptance criteria are satisfied or a verified limitation is documented; manual teacher/student acceptance is recorded as pending test credentials and seeded data.
- [x] New lifecycle work is isolated in the separate `exams-master` project. `master` and `dev` now have separate worktrees and `.env.local` targets. The lifecycle migration was also applied to the user-confirmed dev project by an interrupted linked push; no functions or data were changed there afterward.
- [ ] Lint, typecheck, build, manual workflows, and access-control checks pass.
