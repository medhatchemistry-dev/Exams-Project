# Exam Usability and Teacher Workflows Implementation Plan

> Editable execution plan. The implementation is on `dev-2` (starting at commit `2b34b90`). This task was kept to Git/GitHub, Supabase, and Vercel CLIs as requested; browser-based visual checks remain open.

## Current status

- Code checks passed: `npm run lint`, `npm run typecheck`, and `npm run build`.
- The Node test suite passed all 70 tests, including exam lifecycle, import sanitization, answer-key protection, and security contracts.
- The linked `exams-master` project has the admin permissions migration applied and all six Edge Functions deployed.
- CLI checks confirm the exam revision/attempt tables and owner/re-entry password records exist. The owner password was changed and live login verified.
- A read-only live attempt-state request using a synthetic attempt ID returned the expected `found: false` response.
- A read-only check of an existing active exam code returned `valid: true`; no student attempt or result was created.
- The latest `dev-2` GitHub check reported Vercel success. Browser end-to-end flows remain unverified because this run was restricted to CLI access.
- Supabase business data was reset: exams, codes, attempts, grades, students, event history, legacy question-bank data, and rate-limit counters were removed. The single owner Auth account and separate owner/re-entry password records were preserved.

## Goal

Improve exam editing, student recovery, question presentation, imports, result exports, and teacher exam management while preserving submitted grades and the existing React/Vite/Supabase architecture.

## Current project facts

- The active application is React 18 + Vite + Supabase. Use the Supabase client, migrations, and Edge Functions already in the repository.
- Exam duration is optional and configurable per revision. Access-code expiry remains a separate setting.
- Exams have available, paused, and archived states; the teacher list separates running, saved, and archived exams.
- Attempts store answer drafts on the server and use a device credential for same-device recovery. Local per-attempt drafts cover unsynced answers.
- HTML and PDF imports go through teacher review. Hosted URL import falls back to a bounded server fetch when a website blocks browser CORS.
- Question math supports inline and block display formulas. Result PDFs are composed by report section and question boundaries.
- The replacement artwork at `C:\Users\Tech Planet\Downloads\icon.jpeg` was converted into site PNG, PWA, Apple touch, and ICO assets while preserving its proportions.

## Product and data rules

1. Editing a launched exam creates a new published revision. New students receive that revision; an active attempt stays pinned to the revision it began with; submitted results retain their original question snapshot and score.
2. Exam duration is optional and independent from access-code expiry. No configured duration means no countdown. If configured, the timer resumes from trusted attempt timestamps and pauses while the teacher has paused the exam.
3. Answers autosave to a server-side draft associated with the exam revision, student, and recoverable attempt/device credential. Pause, lock, refresh, or temporary disconnection preserves the draft. Explicit permanent closure removes unsubmitted draft answers; submitted results and grades remain historical records.
4. Archiving is reversible and non-destructive. It makes the exam unavailable while archived and does not delete exams, attempts, answers, or grades.
5. Imported files and remote pages are untrusted input. Sanitize markup, never execute imported page JavaScript, validate answer keys deterministically, and require teacher review before publication.
6. Arabic remains the source text. Show Arabic on the right and English on the left. English translations must be editable and teacher-reviewable; do not silently publish uncertain chemistry translations.
7. A browser cannot override the operating-system mute switch, device volume, or browser autoplay policy. The app can test/request audio after a student gesture, show status, and ask the student to enable sound; it cannot guarantee sound against device/browser settings.

## Implementation sequence

### Phase 1 — Lock down lifecycle, revision, timer, and recovery contracts

- [x] Inspect current `exams`, `exam_attempts`, `exam_results`, access-code RPCs, RLS policies, and result snapshots before changing schema.
- [x] Define forward-only schema changes for exam revisions, nullable `duration_minutes`, attempt revision/start/pause state, and durable answer drafts. Existing attempts retain the legacy no-timer behavior.
- [x] Define the terminal actions precisely: pause/resume preserves drafts; finish/close rejects new joins and clears unfinished drafts; submitted result rows and snapshots remain available; archive is non-destructive.
- [x] Add teacher-authorized, server-validated operations for publishing an edit, autosaving a draft answer, resuming the same attempt, pausing/resuming an exam, and permanently closing an exam. Client-provided score, answer key, revision, and completion state are not trusted.
- [x] Recover missing device tokens only after teacher authentication and student/attempt verification. Device credentials are not treated as secure identity.

**Acceptance:** Existing exams and submitted grades remain readable. New attempts bind to one published revision. A refresh, temporary disconnect, security lock, or teacher pause does not reset saved answers. A permanent close discards only unsubmitted drafts and blocks further joins/submissions.

### Phase 2 — Teacher editing, configurable duration, archive separation, and grades export

- [x] Add a teacher edit flow for published exams: edit title, duration, questions, options, translations, formulas, and media; validate and preview before publishing a new revision.
- [x] Show edit actions for available, paused, and completed exams. Archived exams must be restored before editing.
- [x] Keep active students on their starting revision. New attempts receive the current revision, and historical results keep their submitted revision snapshot.
- [x] Use the configured duration, or “no time limit,” independently from access-code expiry.
- [x] Separate running, saved/paused/completed, and archived exams; preserve records and provide archive restore.
- [x] Add a grades download with the full targeted roster, Arabic and English student names, ESE number, class, mark, and a clear non-submit status.

**Acceptance:** A teacher can edit and republish a launched exam without changing an in-progress attempt or an existing grade. Students see the new revision on their next attempt. Timer and login copy match the actual setting. Archived exams appear only in the archive view and can be restored without data loss. The grade export includes the whole assigned class and marks absent submissions unambiguously.

### Phase 3 — Bilingual answers, block formulas, and reliable media rendering

- [x] Extend shared question/option rendering across student exams, teacher preview, result details, and PDF output.
- [x] Render Arabic on the right and English on the left, with editable teacher-reviewed translations and missing-translation flags.
- [x] Render inline and display math; display equations use a block-level `div` and chemical equations keep left-to-right direction.
- [x] Resolve relative images against hosted pages, embed supported remote assets, retain supported data images within size limits, and sanitize markup.
- [x] Preserve PDF page images for scanned/image PDFs and provide editable teacher correction of question text, options, and key. Missing answer keys are never inferred.
- [x] Embed supported imported remote images so students and reports do not depend on third-party hotlinks.

**Acceptance:** Arabic and English are readable in their intended columns on mobile and desktop. Inline math stays inline, display formulas occupy a proper block, and equations are not reversed by RTL. Supported images from HTML and PDFs remain visible in preview, student view, and result reports; unsupported content is reported rather than silently dropped.

### Phase 4 — Hosted website import, including Netlify-hosted exams

- [x] Add bounded server-side fetching for public HTTPS exam pages when browser CORS blocks access.
- [x] Support static pages such as `*.netlify.app`, custom domains, and relative assets; explain when content is not static HTML.
- [x] Require a signed-in teacher, reject local/private addresses and unsafe redirects, and enforce time, size, and content-type limits for HTML and image assets.
- [x] Parse and sanitize returned HTML without executing source scripts; show extracted questions and answer-key validation before publication.
- [x] Keep direct browser fetching as the fast path, then fall back to the server fetch.

**Acceptance:** A supported public Netlify-hosted static exam can be loaded even when its host does not grant browser CORS. Redirects, oversized pages, non-HTML content, private hosts, authentication walls, and script-only pages fail with a clear message and cannot access internal services.

### Phase 5 — Reliable result PDFs and exam result presentation

- [x] Replace one tall screenshot with section-by-section A4 PDF composition and question-boundary pagination.
- [x] Wait for fonts and supported images, and show a useful export error if media cannot load.
- [x] Keep report header, identity, marks, formulas, bilingual text, and questions together when possible; split oversized question blocks cleanly.
- [x] Use white backgrounds and page margins, and retain the certificate's existing single-page export path.

**Acceptance:** Exported student reports have no unexplained white gaps, missing formula glyphs, clipped choices, or unloaded images; long reports paginate at question boundaries and retain the score and student information on the first page.

### Phase 6 — Audio policy, branding, and end-to-end verification

- [x] Remove claims that sound can override device/browser mute. Test/request audio after a student gesture and show the result with retry guidance.
- [x] Use the supplied icon art for favicon, PWA, Apple touch, and in-app references while containing the unchanged silhouette.
- [ ] Verify the complete teacher flow: import HTML/PDF/hosted page → review/edit/translate → publish → edit/re-publish → archive/restore → export class grades.
- [ ] Verify the student flow: configured/no timer → answer autosave → refresh/device return → pause/resume → lock/re-entry → submit → report PDF → permanent close clears only unfinished drafts.
- [x] Run `npm run lint`, `npm run typecheck`, `npm run build`, `node --test tests/*.test.js`, and the Supabase CLI migration dry-run.
- [x] Confirm the latest migration, core tables, and RPC grants/definitions on the linked `exams-master` project. Live checks confirmed a grades-only administrator cannot read exam keys or issue exam codes.

**Acceptance:** Audio capability is represented accurately and never promises to defeat mute. All site and PWA icon references use the supplied artwork without changing its silhouette. Existing legacy exam and result paths continue working.

### Phase 7 — Owner settings, delegated admins, and clean Supabase data

- [x] Add owner-only `/admin/settings` controls for the owner password and separate exam re-entry password.
- [x] Add administrator accounts with per-feature scopes for exam management, student management, and grade viewing; allow the owner to update scopes or remove delegated accounts.
- [x] Enforce scopes in admin navigation, page routes, Supabase row policies, privileged SQL RPCs, hosted exam import, and student recovery.
- [x] Set the owner password to the requested value, including its final space, and verify a fresh live login.
- [x] Verify a temporary grades-only account can sign in but cannot query exam answer keys or issue exam access codes; remove it after the check.
- [x] Clear exam, code, student, attempt, grade, revision, activity, legacy question-bank, and rate-limit data while retaining the owner and both password hashes.
- [x] Remove anonymous direct access to student names/numbers; the student picker now receives only the class assigned to a currently active exam code, and unassigned/legacy exams use manual entry.
- [ ] Complete visual, browser-based admin-to-student end-to-end checks.

## Likely files and systems

- Teacher exam workflows: `src/components/admin/ExamsPage.jsx`, `ExamImportDialog.jsx`, `ExamPreview.jsx`, `ExamDetailPage.jsx`, `src/lib/examRepository.js`.
- Student flow and rendering: `src/pages/QuizApp.jsx`, `src/components/quiz/ExamCodeScreen.jsx`, `QuizScreen.jsx`, `QuestionCard.jsx`, `MathText.jsx`, `AnswerReport.jsx`.
- Parsing and export: `src/lib/examImport.js`, `src/lib/examImportPdf.js`, `src/lib/pdfReport.js`, `src/lib/excelExport.js` or a focused exam-grade exporter.
- Branding: `index.html`, `public/manifest.json`, generated icon assets in `public/`, and shared logo components.
- Trusted persistence: new forward-only SQL migrations and, if needed, a focused Supabase Edge Function. Preserve existing RLS and teacher authorization patterns.

## Open inputs and risks

- **Icon artwork:** resolved from the user-supplied `C:\Users\Tech Planet\Downloads\icon.jpeg`; generated icon files preserve its proportions.
- **Sound:** no website can override the student's device mute or OS volume. Meeting a literal “play even when muted” requirement needs a non-browser process (for example, a proctor checking the device) and cannot be implemented by frontend code.
- **Translation quality:** chemistry translations can change scientific meaning. Use teacher-reviewed English text and keep the original Arabic; any automatic suggestions must remain unpublished until approved.
- **Hosted imports:** only static HTML and supported image assets are parsed. Pages whose questions only appear after arbitrary JavaScript runs still need a static export or an explicit data source.
- **Data retention:** permanently closing an exam deletes unfinished answer drafts only. Submitted answers/grades are retained for historical reporting; deletion of submitted records would require a separate retention policy.

## CLI security review

- The Supabase security advisor reports six `SECURITY DEFINER` RPCs executable by `authenticated`. The reviewed functions grant no access to `anon`/`PUBLIC`, pin an empty `search_path`, and check the caller against `auth.uid()` and `teacher_roles`; these warnings need role-level integration tests, but do not indicate an anonymous teacher-control path.
- Supabase Auth's leaked-password protection is disabled. Enabling it requires an Auth security configuration change; it was not changed in this CLI-only pass.
- `npm audit --omit=dev --audit-level=high` reports nine dependency advisories (five high, four moderate), including `braces` via Tailwind CSS, React Router, and `uuid` via ExcelJS. The suggested `--force` remediation makes major-version changes, so no automatic dependency upgrade was applied.
- Hosted website import checks DNS answers, redirects, schemes, file types, and response-size limits. DNS is checked before `fetch`; because the outbound fetch does not pin the validated IP, DNS rebinding remains a residual SSRF hardening concern for a later network-level fix.
