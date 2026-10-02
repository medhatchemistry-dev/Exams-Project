# Admin Workflows and Imports Implementation Plan

> **For agentic workers:** Implement task-by-task in this session, using test-driven development for pure logic and browser verification for UI. Follow the accepted spec at `docs/superpowers/specs/2026-10-02-admin-workflows-and-imports-design.md`.

**Goal:** Deliver separate teacher admin pages, secure imported exam/access-code workflows, roster CRUD and Excel import, preserve historical score reports, and repair Supabase CORS configuration for confirmed Exams origins.

**Architecture:** Keep the student app on `/` and use nested teacher-only routes under `/admin`. Store imported banks in a teacher-only Supabase `exams` table; expose an exam only after service-role validation of its access code. Preserve an immutable question/option snapshot in each new score. Use a constrained Acorn AST reader plus DOMPurify for the current HTML-bank format and ExcelJS for roster workbooks. Centralize exact-origin CORS validation in a shared Supabase function module.

**Tech Stack:** React 18, React Router 6, Vite, Supabase JS/Edge Functions, PostgreSQL migrations/RLS, Acorn, DOMPurify, ExcelJS, Node's built-in `node:test`, Playwright browser verification.

**Spec:** `docs/superpowers/specs/2026-10-02-admin-workflows-and-imports-design.md`

## Global Constraints

- Keep `/` public for students; all `/admin/*` management pages require teacher role.
- Use only `questionBanksByGrade` object-literal exam HTML; never execute uploaded scripts or expressions.
- HTML upload limit: 5 MiB; exam limit: 1,000 questions; roster workbook limit: 10 MiB and 5,000 data rows; upsert batches: no more than 100 rows.
- Roster update key is `student_number`; duplicate numbers within the same workbook and any invalid rows block commit.
- Preserve existing unlinked access codes and score rows as bundled-bank legacy records.
- New codes link one exam and the database enforces at most one active code globally.
- New result rows store `exam_id`, `exam_title_snapshot`, and the exact `questions_json` snapshot.
- Imported exam rows are never directly selectable by anonymous clients. Writes for roster/exam data require a teacher role; Edge Function service credentials remain server-side.
- CORS allowlist uses exact origins from `APP_ALLOWED_ORIGINS`; never use `*`, and do not allow the unrelated `hamzacross100.online` domain.
- The exact Exams production and intended preview origins remain an operator-provided deployment input. Do not guess them. Deploy updated functions only after the approved origins have been added as Supabase Edge Function secrets.
- Do not use Vercel tools/CLI or `gh` CLI. Use Supabase MCP for remote schema/function work and GitHub MCP for repository context; normal `git` operations are allowed.
- Preserve the current visual language, Arabic copy conventions, legacy 45-minute timer, and legacy 25-question behavior.

## Repository Map

- `src/App.jsx`: route composition and public/admin shells.
- `src/components/admin/`: existing score/certificate/code panels; remove temporary source-code panel.
- `src/pages/QuizApp.jsx`: code validation, exam selection, quiz lifecycle, score write.
- `src/lib/quizBanks.js`: legacy bank loader and deterministic shuffle.
- `src/components/quiz/ResultScreen.jsx`, `src/components/admin/ResultDetailModal.jsx`, `src/lib/excelExport.js`: historical score/report consumers.
- `supabase/migrations/`: append-only database schema/RLS/RPC changes.
- `supabase/functions/{teacher-login,validate-exam-code}/index.ts`: server login and access-code validation.
- `supabase/functions/_shared/cors.js`: shared exact-origin behavior, tested with Node.
- `tests/`: Node built-in tests for pure parsing, validation, shuffle/snapshot helpers, and CORS origins.

## Task List

### Phase 1: Domain recovery and contract foundations

#### Task 1: Centralize exact-origin CORS and prove login origin behavior

**Files:**
- Create `supabase/functions/_shared/cors.js`.
- Create `tests/cors.test.js`.
- Modify `supabase/functions/teacher-login/index.ts`.
- Modify `supabase/functions/validate-exam-code/index.ts`.

**Interface:** `isAllowedOrigin(origin, configuredOrigins)` returns a boolean; `corsHeaders(origin, allowed)` returns response CORS headers. Preserve exact matching; normalize configured values only when they are valid origins without path/query/fragment, HTTPS except HTTP localhost/127.0.0.1. Preserve the current `exams-project*.vercel.app` compatibility origins.

- [ ] Write tests for null/missing Origin, current localhost, current preview pattern, exact configured custom origin, trailing slash/path config rejection, lookalike subdomain rejection, and unrelated `hamzacross100.online` rejection.
- [ ] Run `node --test tests/cors.test.js`; confirm the newly expected cases fail before implementation.
- [ ] Implement shared helper and import it from both functions; CORS headers only echo an origin when allowed; reject disallowed POST origins.
- [ ] Re-run `node --test tests/cors.test.js`; expect every origin case to pass.
- [ ] Run `npm run lint` and `npm run typecheck`.

#### Task 2: Add database contract, RLS, teacher RPCs, and migration tests

**Files:**
- Create `supabase/migrations/20261002130000_admin_exam_and_roster_management.sql` (use next unused timestamp if this version collides).
- Create `tests/exam-schema-contract.test.js`.
- Modify `supabase/functions/validate-exam-code/index.ts` in the dependent code integration task after schema contract is set.

**Contract:** Add `public.exams`; nullable exam references/title/question snapshot columns; teacher-only RLS for roster mutations and exam management; service-only linked-code validation returning `{ valid, legacy, examId, examTitle, banks }`; authenticated teacher RPC `issue_exam_access_code(exam_id, code, expires_at)` which atomically deactivates existing active codes and inserts one linked code. Preserve existing SQL signature behavior only where compatibility needs it; new return structure is used by the Edge Function.

- [ ] Write a schema-contract test that asserts the migration introduces each required field, FK delete behavior, teacher-role policies, service-only validation, and atomic one-active-code issuance.
- [ ] Run `node --test tests/exam-schema-contract.test.js`; verify the missing migration contract fails.
- [ ] Write the forward-only migration, using `DROP FUNCTION`/recreate only where return type changes and reapplying explicit execute grants after recreation.
- [ ] Run the migration contract test and inspect SQL for idempotent policy/index names, least privileges, foreign-key behavior, and no destructive data rewrite.
- [ ] Apply the reviewed migration with Supabase MCP only after confirming existing tables and migration history. Save the matching SQL in this repository.
- [ ] Verify Supabase tables/policies and SQL RPC signatures through Supabase MCP.

#### Task 3: Implement constrained bank parsing and sanitizer

**Files:**
- Add dependencies `acorn` and `dompurify` (and keep lockfile in sync).
- Create `src/lib/examImport.js`.
- Create `tests/examImport.test.js`.
- Optionally create `src/lib/examHtmlSanitizer.js` only if needed to keep parser and rendering concerns separate.

**Interface:** `parseExamHtml(source, filename)` returns `{ banks, bankSummaries }` or throws a typed validation error with bank/question context. Parser reads the initializer of `questionBanksByGrade` using Acorn AST and an allowlisted literal interpreter; DOMPurify sanitizes HTML-bearing fields with narrowly configured tags/attributes and URI rules. Never use `eval`, `Function`, or browser script execution.

- [ ] Test accepted current-style object literals, Arabic keys, string escaping, booleans/null/numeric literal data, and multiple grade-track banks.
- [ ] Test missing assignment, malformed syntax, function/call/identifier/template/spread/computed expression rejection, invalid bank key, empty Arabic text, malformed options, out-of-range answer index, question/file limits, unsafe tags, event attributes, JavaScript URLs, allowed HTTPS images, and allowed data images.
- [ ] Run `node --test tests/examImport.test.js`; verify exploit-shaped expressions fail and valid example fixture parses.
- [ ] Implement parser/sanitizer minimally and rerun focused tests.
- [ ] Parse `public/question-bank.html` in the test and assert five banks/125 questions plus expected safe chemistry markup.
- [ ] Run lint, typecheck, and build.

### Checkpoint: Foundation

- [ ] Tasks 1–3 are committed as working increments.
- [ ] Node tests, lint, typecheck, and production build pass.
- [ ] Remote migration is applied and policies verified; no uploaded HTML is executed.

### Phase 2: Exam lifecycle and student execution

#### Task 4: Import exam library and issue/deactivate per-exam codes

**Files:**
- Create `src/components/admin/ExamsPage.jsx`.
- Create `src/components/admin/ExamImportDialog.jsx`.
- Create or update `src/components/admin/ExamAccessPanel.jsx`.
- Create `src/lib/examRepository.js` if separating database operations improves testability.
- Test new repository helpers with Node tests where pure; verify Supabase operations in browser/manual checks.

- [ ] Write/extend pure tests for code payload normalization, available/archived filtering, expiry normalization, and deterministic error mapping before implementing the UI.
- [ ] Render exam list with title, source filename, bank/question counts, state, and empty/loading/error states.
- [ ] Add import dialog with `.html` file type/size checks, title, parser preview/errors, and explicit save confirmation.
- [ ] Save banks only using teacher-authenticated Supabase calls protected by RLS.
- [ ] Add exam selection, optional expiry, atomic code issuance RPC, copy, deactivate, and current-code exam title in Exams page.
- [ ] Confirm archiving/deleting an exam with the active linked code either deactivates code atomically or is rejected with actionable guidance.
- [ ] Verify upload rejects malformed/untrusted files and a teacher can import, archive, issue/copy/deactivate a code using a real Supabase session.

#### Task 5: Deliver exam payload to students and snapshot results

**Files:**
- Modify `supabase/functions/validate-exam-code/index.ts`.
- Modify `src/pages/QuizApp.jsx`.
- Modify `src/lib/quizBanks.js` or create `src/lib/examExecution.js` for pure bank selection/shuffle/snapshot helpers.
- Modify `src/components/quiz/ResultScreen.jsx` only for exam title display when needed.
- Create `tests/examExecution.test.js`.

**Interface:** `selectExamBank(validation, grade, track, legacyBanks)` yields an explicit bank or a typed no-bank error; `buildExam(banks, grade, track, studentNumber, options)` supports optional exam ID seed and preserves legacy default; result input includes nullable `exam_id`, `exam_title_snapshot`, and exact final `questions_json`.

- [ ] Write tests for legacy payload selection, imported matching bank selection, missing-bank rejection, exam-ID-dependent deterministic shuffle, option order snapshot stability, and legacy no-exam snapshot fallback.
- [ ] Run `node --test tests/examExecution.test.js`; confirm desired imported-exam selection/snapshot tests fail before implementation.
- [ ] Update the Edge Function to use the service-only validation RPC and return only `{valid, legacy, examId, examTitle, banks}` for a valid code; return no bank payload for invalid, expired, inactive, or archived exams.
- [ ] Load bundled banks only for legacy codes. For linked codes, use returned sanitized/stored banks and block missing grade/track instead of falling back to another grade.
- [ ] Revalidate current code/exam on interval and before result persistence.
- [ ] Store the immutable final questions/options snapshot and exam metadata with new score rows.
- [ ] Rerun focused tests, lint, typecheck, and build; verify invalid/expired/deactivated state prevents start and submit.

### Checkpoint: Exam flow

- [ ] Teacher imports an exam, issues its code, and sees its active state.
- [ ] Student with matching grade/track takes imported bank; no-match path is blocked with clear copy.
- [ ] Legacy unlinked code still uses bundle.
- [ ] Stored score snapshot reports same questions/options after exam archive or content change.

### Phase 3: Admin navigation and pages

#### Task 6: Add protected admin shell/routes and dashboard home; remove source panel

**Files:**
- Modify `src/App.jsx`.
- Create `src/components/admin/AdminLayout.jsx`.
- Create `src/components/admin/AdminHome.jsx`.
- Modify/remove `src/components/admin/AdminDashboard.jsx` and `SourceCodePanel.jsx` as appropriate.
- Create `src/components/admin/AdminNavigation.jsx` if it keeps the shell focused.

- [ ] Write route-level verification cases/checklist for guest redirect/login, authenticated non-teacher denial, teacher access, unknown admin subpath, and direct refresh of each subpage.
- [ ] Add nested React Router routes for `/admin` and each requested child route; apply same auth/role gate at the parent.
- [ ] Build responsive shell with dashboard link, page-aware nav, mobile menu, and logout.
- [ ] Make `/admin` dashboard home with links and available summary counts; no management form appears there.
- [ ] Remove the source-code menu and component reference; delete component if no importers remain.
- [ ] Run lint/typecheck/build and manually open all routes in browser at desktop and mobile widths.

#### Task 7: Move scores and certificates onto their own routes and honor snapshots

**Files:**
- Create `src/components/admin/ScoresPage.jsx` or route wrapper.
- Modify `src/components/admin/ResultsPanel.jsx`.
- Modify `src/components/admin/ResultDetailModal.jsx`.
- Modify `src/components/admin/CertificatesPanel.jsx`.
- Modify `src/lib/excelExport.js`.

- [ ] Write pure export/report selection tests: use stored `questions_json` if present, legacy reconstruction otherwise, include exam title for imported results.
- [ ] Run focused tests and confirm snapshot path initially fails.
- [ ] Render scores and certificates only at their own routes; retain current filters, answer report, perfect-score rules, PDF and CSV/Excel-labelled exports.
- [ ] Update bulk and single-result exports/report to use question snapshots while retaining legacy fallback.
- [ ] Verify historical record and new imported record display/export correctly; run lint/typecheck/build.

### Phase 4: Student roster management and Excel

#### Task 8: Add ExcelJS roster template/parser and deterministic validation

**Files:**
- Add `exceljs` dependency and update package lock.
- Create `src/lib/studentWorkbook.js`.
- Create `tests/studentWorkbook.test.js`.

**Interface:** `createStudentTemplate()` returns an ExcelJS workbook; `parseStudentWorkbook(arrayBuffer)` returns `{validRows, invalidRows, duplicateNumbers}`; `validateStudentRows(rows)` normalizes supported scalar cell types and validates academic combinations. Columns are exactly `student_number`, `full_name`, `grade`, `track`, `section`.

- [ ] Test template sheet/headers/example/reference values and returned workbook buffer.
- [ ] Test valid rows, blank rows ignored, Excel numeric student IDs normalized without scientific notation where feasible, missing headers, invalid grade-track-section, duplicate workbook number, invalid name/number, size/row limits, corrupted input rejection.
- [ ] Run focused `node --test tests/studentWorkbook.test.js` and observe expected initial failures.
- [ ] Implement ExcelJS workbook generation and parser/validator; never upload or execute workbook macros.
- [ ] Run focused tests and lint/typecheck/build.

#### Task 9: Add teacher-only roster CRUD and import preview/commit UI

**Files:**
- Create `src/components/admin/StudentsPage.jsx`.
- Create `src/components/admin/StudentImportDialog.jsx`.
- Create `src/components/admin/StudentEditorDialog.jsx`.
- Create `src/lib/studentRepository.js`.
- Use existing UI `AlertDialog` primitives for delete confirmation.

- [ ] Implement paginated/searchable roster list and class filters; handle loading/error/empty states.
- [ ] Implement manual add/edit with same `validateStudentRows` rules.
- [ ] Implement template download, `.xlsx` upload preview, row-level errors and insert/update counts.
- [ ] Block commit when any invalid/duplicate-in-file row exists; on teacher confirmation upsert valid rows by `student_number` in batches no larger than 100.
- [ ] On partial batch failure, show last confirmed batch and provide safe retry; never claim all-or-nothing rollback.
- [ ] Implement delete with accessible confirmation and update list only after successful Supabase response.
- [ ] Verify unauthorized roles receive database policy errors and no write occurs; teacher CRUD and import work using browser session.
- [ ] Run lint/typecheck/build and focused workbook tests.

### Phase 5: Custom-domain login configuration and end-to-end verification

#### Task 10: Set exact Supabase function origins and deploy updated functions

**Files:**
- No committed secret/origin value; configure `APP_ALLOWED_ORIGINS` only in Supabase Edge Function secrets for the Exams project.
- Deploy `teacher-login` and `validate-exam-code` through Supabase MCP.

- [ ] Obtain/confirm the exact Exams production and preview origins from the user or a verified GitHub project configuration/artifact. Do not use `hamzacross100.online`; it currently serves a different Vercel “Hamza” project.
- [ ] Set `APP_ALLOWED_ORIGINS` to the comma-separated exact origins in Supabase secrets. Preserve localhost via code-local development handling; do not include schemes other than HTTPS except local HTTP.
- [ ] Deploy both functions with identical shared-origin behavior and the new exam-validation contract.
- [ ] Verify an exact approved Origin receives the correct `Access-Control-Allow-Origin` on OPTIONS and POST; verify an unrelated Origin is denied; never transmit the teacher password in test logs or tool output.
- [ ] Browser-test actual login from the confirmed hostname, not just preflight.

#### Task 11: Whole-app regression and final commit/push

**Files:** No new production files expected except fixes discovered by verification.

- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` after all code changes.
- [ ] Browser verify `/`, `/admin`, all four admin pages, import preview and confirm, code lifecycle, student workbook download/preview/upsert, and score snapshot/report.
- [ ] Review the full diff; ensure secrets, actual domain secret values, and `.env.local` are not staged.
- [ ] Commit focused changes with project-local Git author `medhatchemistry-dev` and push to `origin/dev` using Git only; no `gh` CLI, no Vercel tools/CLI.
- [ ] Verify pushed SHA via `git ls-remote origin dev` and GitHub MCP; verify clean worktree.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| No exact Exams domain visible from the Vercel scope | Cannot configure production CORS or prove login on the custom host | Keep domain an explicit deployment prerequisite; never guess or allow broad wildcard origins. Continue app work independent of this step. |
| Uploaded HTML contains JavaScript rather than JSON | Executing it would be an XSS/code-execution vulnerability; regex extraction can corrupt content | Parse with Acorn and a literal-only AST interpreter; reject all executable syntax; test against shipped bank. |
| Imported HTML contains rich markup/images | Sanitizing too aggressively loses diagrams; allowing arbitrary markup permits XSS | Use allowlisted DOMPurify config, exact URI policy, inspect all current bank tags, browser-test sanitization. |
| Exam content changes after students have taken it | Historical answer reports become inaccurate | Store the final question/option-order snapshot with each new result. |
| Multi-batch roster upload partly succeeds | Teacher may incorrectly assume rollback or all-or-nothing behavior | Explicit progress/results, batch <=100, upsert key stable, report failed batch, design retries as idempotent by student number. |
| Existing remote function deployment differs from tracked function files | Source deploy may alter live behavior | Compare deployed function source with repository source first; deploy both functions together, then verify Supabase logs and origins. |
| Existing lockfile is out of sync | `npm ci` fails | Add approved dependencies then reconcile `package-lock.json` with `npm install --package-lock-only`; no package manifest edits beyond required deps/scripts. |

## Execution Notes

- Implement natively in the current `dev` checkout, as directed by the user.
- Use Supabase MCP for schema inspection/migration, function reads/deploys, logs, and advisors; use GitHub MCP for repository/commit coordination. Do not use Vercel MCP/tools or `gh` CLI.
- The design spec is accepted. This plan carries its approved product decisions; any discovered conflict must be resolved against the spec and recorded before deviating.
- The owner explicitly asked to finish the complete website change and commit/push it to `dev`; no additional pause between tasks is expected except for the exact domain input before external CORS-secret/deploy configuration.
