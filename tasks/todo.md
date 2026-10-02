# Admin Workflows and Imports Task Checklist

Source plan: `docs/superpowers/plans/2026-10-02-admin-workflows-and-imports.md`
Source spec: `docs/superpowers/specs/2026-10-02-admin-workflows-and-imports-design.md`

## Phase 1: Domain recovery and contract foundations

- [ ] Task 1: Centralize exact-origin CORS and prove login origin behavior
- [ ] Task 2: Add database contract, RLS, teacher RPCs, and migration tests
- [ ] Task 3: Implement constrained bank parsing and sanitizer

### Checkpoint: Foundation

- [ ] Node tests, lint, typecheck, and production build pass
- [ ] Migration reviewed/applied; teacher RLS and service-only code validation verified

## Phase 2: Exam lifecycle and student execution

- [ ] Task 4: Import exam library and issue/deactivate per-exam codes
- [ ] Task 5: Deliver exam payload to students and snapshot results

### Checkpoint: Exam flow

- [ ] Imported exam code starts correct grade/track bank
- [ ] Legacy codes remain functional
- [ ] Score report uses immutable snapshot

## Phase 3: Admin navigation and pages

- [ ] Task 6: Add protected admin shell/routes and dashboard home; remove source panel
- [ ] Task 7: Move scores and certificates onto their own routes and honor snapshots

## Phase 4: Student roster management and Excel

- [ ] Task 8: Add ExcelJS roster template/parser and deterministic validation
- [ ] Task 9: Add teacher-only roster CRUD and import preview/commit UI

## Phase 5: Custom-domain login configuration and end-to-end verification

- [ ] Task 10: Set exact Supabase function origins and deploy updated functions after confirmed Exams domain is supplied
- [ ] Task 11: Whole-app regression and final commit/push

### Checkpoint: Complete

- [ ] All spec acceptance criteria verified
- [ ] Lint, typecheck, build, and browser workflows pass
- [ ] No secrets/origin credentials staged
- [ ] Changes pushed to `origin/dev`; branch synchronized and worktree clean
