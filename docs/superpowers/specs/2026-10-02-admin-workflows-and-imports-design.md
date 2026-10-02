# Admin Workflows and Import System

**Status:** Accepted
**Date:** 2026-10-02
**Target branch:** `dev`

## Capability

Teachers can manage exams and the student roster from a dedicated admin dashboard. The admin landing page becomes a navigation/dashboard surface with separate pages for Scores, Certificates, Students, and Exams. Teachers can import an exam from HTML using the repository's existing `questionBanksByGrade` data format, then issue an access code for that exam. They can download an Excel roster template, preview and validate an uploaded workbook, and add, edit, delete, or bulk-upsert roster entries. Student score reports remain tied to the exact questions and option ordering taken by each student.

## Approved product decisions

- Keep `/` as the student entry and quiz experience.
- Make `/admin` the teacher dashboard home.
- Provide admin subpages at `/admin/scores`, `/admin/certificates`, `/admin/students`, and `/admin/exams`.
- Remove the temporary **الكود المصدري** panel and its component.
- HTML exam import accepts the current structured `questionBanksByGrade` format embedded in an HTML file; arbitrary HTML layouts are not supported.
- Each access code unlocks one selected exam. Preserve the current global invariant of at most one active exam code at a time.
- A code with no linked imported exam remains a legacy code and uses the current bundled question bank.
- The Students page supports roster viewing/search, manual add/edit/delete, an Excel template, and Excel import.
- Excel import upserts by `student_number`: new IDs insert; IDs already in the database update the student fields. Duplicate student numbers within one uploaded file are an error.
- Certificate behavior remains the existing list of perfect-score results.
- New result rows store an exam reference and an immutable snapshot of questions/options. Existing rows remain readable through the bundled-bank compatibility path.
- Imported question markup may retain images whose sources are HTTPS URLs or validated embedded image data, subject to sanitization. Scripts and unsafe markup are never retained or executed.

## Actors and permissions

### Student

- Opens `/`, enters an active exam access code, chooses a roster student or enters details manually, takes the selected exam, and submits answers.
- May read the public student roster, as the current selection flow requires.
- Must not read imported exam records directly from the database or perform teacher roster operations.

### Teacher

- Signs in through the existing `teacher-login` Edge Function and must have a `teacher_roles` row.
- Uses the dashboard and the Scores, Certificates, Students, and Exams pages.
- May create/edit/delete roster entries, import roster workbooks and exams, archive exams, and issue/deactivate access codes.

## Routes and navigation

| Route | Page | Access |
| --- | --- | --- |
| `/` | Student access, registration, quiz, and result flow | Public |
| `/admin` | Teacher dashboard home and section links | Teacher |
| `/admin/scores` | Results, class filters, answer detail, exports | Teacher |
| `/admin/certificates` | Existing perfect-score certificate list | Teacher |
| `/admin/students` | Roster list, search/filter, manual CRUD, Excel workflow | Teacher |
| `/admin/exams` | Exam library, HTML import, archive/delete, code lifecycle | Teacher |

Use React Router nested admin routes so direct URLs and refresh work. Shared admin chrome includes a dashboard/home link, current section, responsive navigation, and sign-out. `/admin` contains summary counts and links; it does not embed the management forms for all sections. Unauthenticated visits to any admin route show the teacher login. An authenticated user without a teacher role sees the existing unauthorized state.

## Exam source format, parser, and lifecycle

### Accepted file format

The uploaded `.html` file contains the existing `questionBanksByGrade` JavaScript object literal inside a script block. The current shipped bank contains five banks (`10-متقدم`, `11-عام`, `11-متقدم`, `12-عام`, and `12-متقدم`) and 125 questions total. Each key is `<grade>-<track>` and must agree with `STRUCTURE` in `src/lib/academicStructure.js`.

Each bank is an array of question records:

- `id`: string; optional, with a stable import-scoped fallback when absent.
- `qAr`: non-empty string.
- `qEn`: optional string.
- `mediaHtml`: optional string.
- `options`: 2–6 entries; each has non-empty `ar` and optional `en` strings.
- `answer`: integer index inside `options`.

An exam must contain at least one valid bank. Question count is determined by the selected bank; the imported bank size is not silently forced to 25. The legacy bundled exam keeps current behavior.

### Safe parsing and HTML handling

- Never evaluate uploaded HTML or script contents.
- Extract the assigned literal and parse it with a constrained parser that accepts only object/array literals, quoted strings and escapes, static no-substitution template strings (required by the shipped bank), finite numbers, booleans, `null`, and quoted keys. Reject template interpolation, calls, identifiers as values, expressions, computed keys, functions, comments in the expression, and other executable syntax.
- Ignore the rest of the uploaded HTML; no scripts, event handlers, or document code run.
- Limit input size to 5 MiB and the decoded exam to 1,000 questions. Reject unsupported file types, oversized files, and invalid structures with clear field/bank/question context.
- Normalize data and sanitize rich strings before storage. Preserve the existing bank's required tags (spans, divs, tables, and images), text/MathJax delimiters, basic presentational classes/styles, and `alt` text. Strip scripts, event attributes, embedded documents, forms, SVG, dangerous URL schemes, and unsupported tags/attributes.
- `img[src]` permits HTTPS URLs and valid `data:image/png`, `data:image/jpeg`, `data:image/gif`, or `data:image/webp` only. Other protocols are stripped. Data image size is bounded as part of upload size validation.
- Inline styles use a narrow documented property/value allowlist; sanitization must be tested against all markup in the current bundled question bank before imported exams are enabled. CSS URL/function values and positioning that can cover or escape the quiz UI are disallowed.
- Import flow: choose HTML → enter/confirm title → parse and validate → preview the title, supported banks, counts, and errors → confirm save → display the saved exam in the library.

### Lifecycle

- Exam states are `available` and `archived`.
- Archiving prevents new access codes but retains exam data, access-code references, and score history.
- Deletion is allowed only after a confirmation warning. Result references become null while the result's title and question snapshot remain. Prefer archive for an exam that has ever been used.
- The Exams page owns both exam-library management and exam-specific access-code management.

## Access codes and student exam selection

- The teacher selects an available exam, optionally sets expiry hours, and generates an access code.
- Creating a code atomically deactivates the currently active code and creates a new code linked to the selected exam. Enforce this invariant in the database, not only the UI.
- The teacher can copy or deactivate the current code and sees the selected exam and expiry state.
- The student enters the code before choosing their roster identity. The validation function returns only a compact validated exam payload after the code check succeeds; the client cannot directly query exam rows.
- After roster selection, the frontend selects the exam bank matching the student's grade/track. If no bank exists for that combination, block the exam with a clear message rather than falling back to a different grade.
- A legacy code (`exam_id IS NULL`) returns a legacy indicator and continues to load the bundled bank.
- A code that is invalid, expired, deactivated, or whose exam is archived cannot start. Submission must continue to revalidate code status, preserving existing behavior.
- Retain the existing 45-minute timer, 25-question legacy default, and current anti-cheat alerts in the first increment; do not introduce unrelated exam timing settings.

## Custom-domain teacher-login recovery

### Evidence and root cause

The deployed `teacher-login` and `validate-exam-code` functions currently accept local development origins plus a hard-coded `exams-project*.vercel.app` hostname pattern. After the owner changed the Vercel domain, Supabase logs show repeated `OPTIONS` preflight requests but no later `POST` login requests; this is consistent with the browser blocking login before password verification. Function request logs do not retain the `Origin` header, so the exact rejected hostname is not proven from logs. The reachable hostname `hamzacross100.online` currently serves the Vercel project titled “Hamza”, not the Exams app, and must not be allowlisted for Exams without owner confirmation. Root-cause hypothesis: the actual Exams custom domain is absent from the hard-coded CORS allowlist.

### Required implementation

- Replace the hard-coded production hostname assumption with a server-side, comma-separated `APP_ALLOWED_ORIGINS` Edge Function secret containing exact serialized origins (`https://hostname`, no path or wildcard). The site owner supplies the exact Exams origins; do not use Vercel CLI/tools to discover or change domains. Parse and validate every entry at startup/request; reject invalid origin configuration and unknown browser origins.
- Share equivalent origin validation across both `teacher-login` and `validate-exam-code`. Allow the current local development origins only for HTTP localhost/127.0.0.1; allow configured production origins by exact match. Do not allow `*` or arbitrary custom domains.
- For allowed origins, include `Access-Control-Allow-Origin` with the exact request origin, `Vary: Origin`, required request headers, and the minimum methods. For disallowed origins, reject the request and do not reflect the origin.
- Apply the same allowlist check to preflight and actual `POST`; CORS is not the sole authorization check. Maintain teacher-role checks and server-side password verification unchanged.
- Update/deploy both functions together through Supabase MCP after the owner supplies the exact Exams origins, and document that adding/changing a site domain requires updating `APP_ALLOWED_ORIGINS` and redeploying the affected functions.
- Do not store the teacher password in source, environment configuration, migrations, or this document. The current password remains only as a bcrypt-compatible hash in `public.teacher_login_passwords`.

### Operational acceptance criteria

1. The confirmed Exams Vercel production origin and intended preview origins are configured as exact values in the Supabase Edge Function secret. The owner must supply or confirm these values; no domain is guessed or broadened to all of `vercel.app`.
2. An allowed custom origin receives `Access-Control-Allow-Origin` on preflight and actual responses, and teacher-login reaches password verification.
3. An unlisted origin does not receive an allow-origin header and its POST is rejected.
4. Both Edge Functions continue to accept the configured localhost origins for development.
5. Regression coverage verifies allowlisted and rejected origins for both functions, including the origin with a trailing slash/path being normalized or rejected consistently.

## Scores, snapshots, and compatibility

- Continue deterministic shuffling for the same student and exam. Include exam identity in the shuffle seed so two exams do not share ordering merely because the student number matches.
- New result rows record nullable `exam_id`, `exam_title_snapshot`, and `questions_json` containing the final shuffled questions and option order displayed for that attempt. Answer indexes therefore refer to the exact choices shown.
- Scores, answer reports, single-result exports, and bulk exports use `questions_json` when present. Historical rows without a snapshot use the existing bundled-bank reconstruction fallback.
- New score exports include the exam title where available. Existing class filters and student columns remain.
- Perfect-score certificates continue to rely on the stored score/total result, not the current question bank.

## Student roster and Excel workflow

### Roster fields

Use the existing `public.students` schema: `student_number`, `full_name`, `grade`, `track`, and `section`. Student number is the upsert key. Grade, track, and section must be a valid combination from `STRUCTURE`.

### Workbook and import flow

- Use ExcelJS in the browser to generate and read `.xlsx` files.
- Offer a template workbook with a `Students` sheet, exact headers, an example row, instructions, and a `Reference` sheet containing accepted grade/track/section values.
- Import flow: choose workbook → parse → validate all rows and within-file duplicate numbers → show row-level errors plus insert/update totals → require explicit teacher confirmation → upsert valid rows by `student_number` → report inserted/updated/rejected counts.
- Initial error policy blocks import while any invalid row remains; never silently discard invalid rows or partially write before confirmation.
- Numbers that already exist in the database are valid update targets. Duplicate student numbers inside the file are invalid because row order must not determine which student data wins.
- Use bounded request batches (100 rows or fewer) and provide progress/failure information. If a batch fails, report which batch failed and allow retry without pretending prior successful batches were rolled back.
- Manual create/edit uses the same validation. Delete requires an accessible confirmation dialog. Update UI state only after a successful database response.

## Database and access-control implications

Add a forward-only Supabase migration; do not edit migrations already applied to the hosted project.

1. Create `public.exams` with identity ID, title, source filename, JSONB banks, lifecycle status, `created_by`, `created_at`, and `updated_at`.
2. Enable RLS and allow only authenticated users with a `teacher_roles` row to read/write exam records. Anonymous users receive no direct access to this table.
3. Add nullable `exam_id` to `public.exam_access_codes`, referencing exams with `ON DELETE SET NULL` for legacy/deleted references.
4. Add nullable `exam_id`, `exam_title_snapshot`, and `questions_json` to `public.exam_results`; deletion nulls the foreign key but preserves title/questions.
5. Keep the partial unique constraint for one active exam code globally.
6. Keep public roster `SELECT` for student selection. Grant authenticated write privileges and add `INSERT`, `UPDATE`, and `DELETE` RLS policies restricted to teacher-role accounts.
7. Add a service-role-only RPC or equivalent server-side query for code validation and resolving its linked exam. The Edge Function returns the exam payload only after checking active state and expiry. Never grant anonymous direct `SELECT` on exams.
8. Review function grants, RLS, and ownership checks so browser callers cannot forge teacher writes or access inactive/archived exams through the code-validation flow.
9. Keep service-role/secret keys server-side only.

## Error, loading, and destructive-action behavior

- Each admin page has loading, retryable error, and empty states.
- HTML import identifies unsupported file, size limit, missing bank marker, malformed literal, invalid key, invalid question/answer/options, and unsafe-markup errors without echoing executable source.
- XLSX import distinguishes corrupt/unsupported workbook, missing sheet/header, invalid rows, within-file duplicates, and database-write errors.
- Code errors distinguish invalid/expired/deactivated code from a valid code with a missing/archived exam payload.
- Roster deletion and exam archive/delete require explicit confirmation. Do not optimistically report success on failed writes.
- If an exam is currently linked to the active access code, archive/delete must first deactivate that code in the same database operation or reject until the code is deactivated.

## Non-goals

- Arbitrary HTML page-layout import, browser automation, or script execution.
- A general-purpose exam authoring/editor platform.
- Automatic migration of existing bundled questions into database exam rows; bundled content remains the legacy fallback until explicitly imported.
- Changes to the teacher-password authentication design, Vercel project integration, the existing certificate visual design, or the anti-cheat policy. The only auth-adjacent code change is exact-origin CORS configuration for the two existing functions.
- New timer/duration customization beyond current behavior.

## Acceptance criteria

1. `/admin` is a teacher-only dashboard home. The four requested subpages have independent route URLs and survive direct load/refresh.
2. No source-code panel, tab, or route remains.
3. A valid HTML bank imports after preview, is stored as teacher-only data, and can be archived. Malformed, executable, oversized, or invalid banks cannot be stored.
4. Sanitization preserves current-bank formatting and HTTPS/data images while removing script/event-handler content and unsafe image sources.
5. An access code generated for an imported exam enables a student with a matching grade/track bank to take it. A missing bank blocks the start with an explicit message. A legacy unlinked code still loads the bundled bank.
6. Expired, deactivated, and archived-exam codes cannot start or submit an attempt.
7. New result reports use immutable question snapshots and stay correct after an exam is archived or changed. Historical results without snapshots still render.
8. Teachers can create, edit, and delete roster rows. Non-teacher authenticated/anonymous callers cannot write roster records through Supabase APIs.
9. Template workbook headers and reference values match the documented roster fields and academic structure.
10. Import preview identifies insert/update/error rows. In-file duplicates and any invalid row block commit; database upsert uses `student_number` and requires teacher authorization.
11. Lint, typecheck, production build, migration/RLS review, and browser checks cover the delivered flows before pushing to `dev`.
12. The custom-domain CORS recovery criteria above pass for both Edge Functions before the teacher login is considered verified on the new domain.

## Spec self-review

- **Completeness:** Covers all four routes, source-code removal, exam import and activation, Excel template/import, roster CRUD, migration/RLS, legacy results/codes, error states, and verification.
- **Consistency:** Legacy records and unlinked access codes are nullable and have explicit fallback behavior. New codes link one exam; the existing global one-active-code invariant remains explicit.
- **Safety:** Uploaded data is never executed, sanitizer behavior is bounded, exam contents are inaccessible directly to public roles, and all roster/exam writes are teacher-only.
- **Scope:** New exam editing is deliberately limited to metadata/lifecycle; exam authoring and arbitrary page parsing are non-goals.
- **Ambiguity:** Invalid spreadsheet rows block import; existing database student numbers update; duplicate numbers within the file are rejected. These rules are explicit.
- **Domain input:** The accessible Vercel account does not contain an Exams project. `hamzacross100.online` resolves to the unrelated “Hamza” project and will not be allowlisted for Exams. The exact Exams production/preview origins must be supplied or discovered from the correct Vercel project before setting the Supabase allowlist secret; the specification does not guess them.
