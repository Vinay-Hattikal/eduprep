# Decision Log

Every significant product or technical decision is recorded here, so humans and AI agents know **what** was decided and **why**, and don't re-argue settled questions.

## How to use this file

- **Before** adding a dependency, changing the stack, changing a data format, or changing scope: check whether a decision already covers it.
- To change a decision: add a **new** entry that supersedes the old one, and mark the old one `Superseded by D-0xx`. Never delete or rewrite old entries.
- AI agents may **propose** decisions (status `Proposed`). Only the owner (Vinay) sets `Accepted`.
- Keep entries short.

### Template

```
## D-0xx: Title
- Date: YYYY-MM-DD
- Status: Proposed | Accepted | Superseded by D-0yy | Rejected
- Context: why a decision was needed
- Decision: what we chose
- Alternatives: what we considered and why not
- Consequences: what this means for the code, cost or team
```

---

## D-001: One Next.js app for UI and API
- Date: 2026-10-19
- Status: Accepted
- Context: Small team (solo founder at first). Company pages need SEO. Student app, admin panel and API share most logic.
- Decision: A single Next.js (App Router) + TypeScript app holds public pages, the student app, the interviewer portal, the admin panel and the API (server actions and route handlers). Background work runs in a separate worker process from the same repo.
- Alternatives: Separate React SPA plus Express/NestJS API (two deployables, weaker SEO). Microservices (far too much operational work for the team size).
- Consequences: One repo and one deploy. Business logic is kept in `src/server/services` so it can be split out later if needed.

## D-002: Tailwind CSS + shadcn/ui, mobile-first
- Date: 2026-10-19
- Status: Accepted
- Context: Most users are students on phones. We need speed of building and a professional look.
- Decision: Tailwind CSS with shadcn/ui components. Design for 360 px width first.
- Alternatives: MUI or Chakra (heavier, harder to customise), plain CSS (slower).
- Consequences: Components are copied into `src/components/ui` and owned by us.

## D-003: PostgreSQL with Prisma
- Date: 2026-10-19
- Status: Accepted
- Context: The data is strongly relational (users → attempts → questions → topics → companies; bookings → payments → payouts) and needs reporting queries.
- Decision: PostgreSQL as the only database. Prisma as the ORM and for migrations.
- Alternatives: MongoDB (poor fit for relations and analytics). Drizzle (lighter and closer to SQL; Prisma chosen for easier migrations and wider familiarity — can revisit).
- Consequences: All schema changes go through Prisma migrations. Use Postgres full-text search before adding a search engine.

## D-004: Zod at every boundary
- Date: 2026-10-19
- Status: Accepted
- Context: Data enters through forms, APIs, webhooks, CSV/ZIP imports and environment variables.
- Decision: Validate all external input with Zod schemas kept in `src/schemas`, shared by client forms and server code.
- Consequences: One source of truth for validation rules. Import errors per row come straight from Zod messages.

## D-005: Better Auth with Google and phone OTP (MSG91)
- Date: 2026-10-19
- Status: Accepted
- Context: Indian students expect phone OTP login. Many also use Google. Email is less reliable for this audience.
- Decision: Better Auth for sessions and providers. Google OAuth plus phone OTP. SMS sent through MSG91 (DLT-registered template). In local development, OTP is printed to the console.
- Alternatives: Auth.js (phone OTP needs more custom work). Clerk or Firebase Auth (cost per user, data outside our database). Twilio (expensive for India).
- Consequences: Users, sessions and accounts are stored in our Postgres. DLT registration for SMS templates is required before launch.

## D-006: Self-hosted Judge0 on a separate server; Monaco editor
- Date: 2026-10-19
- Status: Accepted
- Context: The coding platform must run untrusted code safely in several languages.
- Decision: Self-host Judge0 (open source) on its own VM, reachable only from the app and worker. Use the Monaco editor in the browser.
- Alternatives: Building our own sandbox (security risk). Paid judge APIs (per-submission cost grows with usage). Running Judge0 on the app server (a compromise or overload would take down the app).
- Consequences: One extra server (~4 vCPU / 8 GB to start). Judge0 needs Docker with privileged containers, so it cannot run on serverless hosting.

## D-007: Redis + BullMQ for background jobs
- Date: 2026-10-19
- Status: Accepted
- Context: Imports, test auto-submit, judge results, reminders, emails and payouts must run outside the request cycle.
- Decision: Redis with BullMQ. A separate worker process (`src/worker`) runs the jobs.
- Alternatives: Cron-only (no retries or delays). Hosted queues (another vendor). Database-backed queues (possible, but BullMQ gives delays and retries for free).
- Consequences: Redis is required in every environment. Jobs must be idempotent and safe to retry.

## D-008: Cloudflare R2 for file storage
- Date: 2026-10-19
- Status: Accepted
- Context: We store question images, coding test files, import uploads and resumes.
- Decision: Cloudflare R2 through the S3-compatible API. Private buckets; files are served through signed URLs or a public CDN path for question images only.
- Alternatives: AWS S3 (download fees), storing files in the database (bloat).
- Consequences: The code uses the S3 SDK, so switching to S3 later is a config change.

## D-009: Content import formats per content type
- Date: 2026-10-19
- Status: Superseded by D-025
- Context: Admins upload MCQs, coding problems and company data in bulk. Plain CSV cannot carry images or test-case files.
- Decision: MCQs as CSV/XLSX (ZIP when images or passages are included). Coding problems as a ZIP package with `problem.yaml`, statement, tests and a reference solution. Companies through the admin form or JSON. Full specification in [data-import.md](data-import.md).
- Alternatives: CSV for everything (cannot hold test files or images). JSON for everything (hard for non-technical authors).
- Consequences: Import code needs parsers for CSV (Papa Parse), XLSX (SheetJS) and ZIP. Templates are kept in `docs/templates`.

## D-010: Imports are idempotent and create drafts only
- Date: 2026-10-19
- Status: Accepted
- Context: Bulk uploads will contain mistakes and will be re-uploaded after fixes. A wrong answer key going live damages trust.
- Decision: Every item has an author-chosen `external_id`. Re-uploading updates instead of duplicating. Imported items are always drafts and must be reviewed before publishing. Coding packages are rejected if the reference solution fails any test.
- Consequences: The `external_id` column is unique per content type. Each import is recorded in `ImportBatch` and can be rolled back while still in draft.

## D-011: Razorpay for payments and interviewer payouts
- Date: 2026-10-19
- Status: Accepted
- Context: Indian users pay with UPI, cards and net banking. Interviewers need payouts.
- Decision: Razorpay Checkout for payments. Access is granted only after the verified webhook arrives. Razorpay Route for interviewer payouts.
- Alternatives: Stripe (limited for Indian domestic payments), Cashfree or PhonePe PG (possible fallback).
- Consequences: Money is stored as integer **paise**. Webhook handling must be idempotent. GST invoicing is needed.

## D-012: Google Calendar API to create Meet links for interviews
- Date: 2026-10-19
- Status: Accepted
- Context: Paid mock interviews happen on Google Meet.
- Decision: The platform's Google Workspace account creates a Calendar event with `conferenceData` for each booking. This generates the Meet link and sends invites to the candidate and interviewer.
- Alternatives: Interviewers paste their own links (unreliable, no control). Zoom (users prefer Meet; extra cost). Building in-app video (later, if ever).
- Consequences: Needs a Google Workspace account and OAuth or service-account setup. Event IDs are stored to support rescheduling and cancellation.

## D-013: Resend for email; WhatsApp from P3
- Date: 2026-10-19
- Status: Accepted
- Context: Transactional email is needed from P1. WhatsApp has much higher open rates in India but needs template approval.
- Decision: Resend for email. WhatsApp through the Meta Cloud API or a BSP (Interakt/Gupshup) starting in P3 for interview reminders, then drive alerts in P4.
- Consequences: All notifications go through one `notifications` service, so channels can be added without touching callers.

## D-014: Hosting
- Date: 2026-10-19
- Status: Superseded by D-022
- Context: Need low cost and low operations work, with servers in or near India.
- Decision (proposed): Start with Vercel (Next.js app), Neon or Supabase (managed Postgres), Upstash (Redis), and one VM in Mumbai/Bangalore (AWS Lightsail/EC2 or DigitalOcean) for Judge0 and the BullMQ worker. Revisit moving to a VPS with Docker when traffic or cost grows.
- Alternatives: Everything on one VPS (cheaper, more operations work). Full AWS (more setup).
- Consequences: Estimated ₹3–6k/month at the start. Owner to confirm.

## D-015: PostHog for product analytics, Sentry for errors
- Date: 2026-10-19
- Status: Accepted
- Decision: PostHog for events, funnels and feature flags. Sentry for frontend and backend errors.
- Consequences: Do not send phone numbers or emails to analytics. Use user IDs only.

## D-016: Vitest, Playwright, GitHub Actions
- Date: 2026-10-19
- Status: Accepted
- Decision: Vitest for unit and integration tests, Playwright for end-to-end flows on phone and desktop sizes, GitHub Actions running lint, type-check and tests on every push.
- Consequences: See "Definition of done" in [rules.md](rules.md).

## D-017: Product scope and monetization model
- Date: 2026-10-19
- Status: Accepted
- Context: Freshers have little money and placements are seasonal. Experienced candidates pay more and prepare all year.
- Decision: Serve both freshers and experienced candidates. Freemium with company packs, a Pro plan, and paid mock interview credits. All prices and free limits are admin settings, not code.
- Consequences: Profile type (fresher/experienced) is a core field. Entitlements support per-company packs.

## D-018: No AI for end users before P4; AI drafts always reviewed
- Date: 2026-10-19
- Status: Accepted
- Context: Accuracy is the main trust factor, and the core product must work first.
- Decision: User-facing AI (resume match, AI mock interview, explanation help) waits until P4. AI-drafted content in the admin panel is marked as such and always goes through human review.
- Consequences: The data model has an `aiDrafted` flag on content.

## D-019: Original content only
- Date: 2026-10-19
- Status: Accepted
- Context: Copying from competitor sites creates legal and trust risk.
- Decision: No scraping or copying from other prep sites. Questions recalled from real exams are rewritten in our own words and labelled "memory-based" with their reported month.
- Consequences: The `source` field is recorded for every question.

## D-020: Build the product first; real auth, payments and messaging in Phase 6
- Date: 2026-10-19
- Status: Accepted
- Context: The owner wants to finish building the application before integrating sign-in, sign-up, OTP, Razorpay and hosting.
- Decision: These integrations happen in Phase 6. Until then:
  - **Auth:** a dev login (pick a seeded user per role) with a signed session cookie. All code uses one `auth` module (`getSession`, `requireRole`); Phase 6 replaces its internals with Better Auth (D-005). Dev login is disabled when `NODE_ENV=production`, and the app refuses to start if it is enabled there.
  - **Payments:** commerce (products, orders, coupons, entitlements) is built for real in Phase 5 behind a `PaymentProvider` interface, with a mock provider. Razorpay (D-011) is added in Phase 6.
  - **Messaging:** a `notifications` service with dev transports (Mailpit for email, console for WhatsApp/SMS).
- Alternatives: Integrate auth and payments early (more setup work up front; blocks building on external accounts and approvals such as DLT and Razorpay KYC).
- Consequences: Interfaces must be designed so that swapping providers touches only `src/server/integrations` and the `auth` module. The user schema must stay compatible with Better Auth's tables.

## D-021: Product name comes from one config file
- Date: 2026-10-19
- Status: Accepted
- Context: The final product name is not decided. "EduPrep" is a working name and must be easy to change.
- Decision: The name, tagline, URLs, support email and social links live in `src/config/site.ts`, fed by `NEXT_PUBLIC_APP_NAME` and `NEXT_PUBLIC_APP_URL`. Components, emails, metadata and invoices read from there. Logos live in `public/brand/`. Code identifiers do not include the product name (e.g. `siteConfig`, not `eduprepConfig`).
- Consequences: Renaming means editing the config, env and logo files, plus the docs. A CI check (`grep` for the name outside allowed files) can enforce this.

## D-022: Hosting decided in Phase 6; local Docker Compose until then
- Date: 2026-10-19
- Status: Accepted
- Supersedes: D-014
- Decision: All development runs locally with Docker Compose (Postgres, Redis, Mailpit, Judge0). The hosting choice is made in Phase 6. The D-014 proposal (Vercel + managed Postgres + Upstash + one Mumbai/Bangalore VM for Judge0 and workers) remains the default candidate.
- Consequences: Avoid vendor-specific APIs (e.g. Vercel-only features) unless a decision approves them.

## D-023: Design system
- Date: 2026-10-19
- Status: Accepted
- Context: The product must look clearly more modern and trustworthy than IndiaBix and PrepInsta.
- Decision: Follow [design-system.md](design-system.md): semantic CSS-variable tokens (indigo primary, amber accent), light and dark themes, Geist Sans/Mono, shadcn/ui + lucide icons, WCAG 2.2 AA, mobile-first, no ads.
- Consequences: No hard-coded colours or fonts in components. New UI patterns are added to the design system doc.

## D-024: Six-phase plan; all subjects at launch
- Date: 2026-10-19
- Status: Accepted
- Context: The owner wants to launch with all subjects and all question types, and to integrate external services last.
- Decision: Build in the six phases in [plan.md](plan.md), replacing the four phases originally in the PRD. All subjects in `taxonomy.csv`, all MCQ types and coding problems are in scope for launch.
- Consequences: plan.md is the source of truth for build order and task status. PRD phase tags refer to plan.md phases.

## D-025: Standard CSV format, one MCQ file per subject, separate company mapping
- Date: 2026-10-19
- Status: Accepted
- Supersedes: D-009
- Context: The owner wants separate CSVs per subject, a standard structure, and the ability to reuse questions for several companies.
- Decision:
  - One MCQ CSV per subject, all with identical columns (single, multiple, numeric types; optional code snippet and passage).
  - Questions don't name companies. `company-question-map.csv` links any MCQ or coding problem to any number of companies, with "asked in" months.
  - Taxonomy, passages, coding problems (problems, test cases, solutions) and companies (profile, rounds, sections, sources) each have their own CSV. Coding problems with large tests can use a ZIP package.
  - References use slugs and `external_id`s, never database IDs. Topic slugs are unique across all subjects.
  - Full spec in [data-import.md](data-import.md); templates in [templates/](templates/).
- Consequences: One MCQ importer serves every subject. A new subject needs only taxonomy rows and a new file.

## D-026: Placeholder launch prices
- Date: 2026-10-19
- Status: Accepted (placeholder; prices will change)
- Decision: Seed these values into the `Setting`/`Price` tables. They are editable in admin settings without code changes.

| Item | Price |
|---|---|
| Free | ₹0: 25 MCQs a day, 20 coding problems, 1 mock test per company, all company pages |
| Company pack | ₹199 for 6 months |
| Pro | ₹299 a month, or ₹1,499 for 6 months |
| Interview: HR / behavioural | ₹399 |
| Interview: technical (fresher) | ₹699 |
| Interview: company-specific | ₹999 |
| Interview: SDE / DSA (experienced) | ₹1,799 |
| Interview: system design | ₹2,499 |
| Interview bundles | 3 for 10% off, 5 for 15% off |
| Interviewer share | 70% of the interview price (platform keeps 30%) |

- Consequences: Never hard-code these numbers. Read them from settings.

## D-027: No Docker for now; local PostgreSQL through embedded-postgres
- Date: 2026-10-19
- Status: Accepted
- Context: The owner doesn't want Docker used for now. Development still needs a real PostgreSQL.
- Decision: `scripts/with-db.mjs` starts a real PostgreSQL 17 from the `embedded-postgres` npm package (data in `.data/postgres`, port 5444), runs the given command, and stops it afterwards. If something already listens on the port (another terminal, or a CI service container), it uses that instead. `npm run db:stop` stops a Postgres left running. Redis, Mailpit and Judge0 are not set up in Phase 1; each gets a non-Docker plan (or a Docker decision) when its phase starts. CI uses a GitHub Actions Postgres service container, which runs on GitHub, not locally.
- Alternatives: Docker Compose (owner's choice: not now). Installing PostgreSQL natively (manual setup on every machine). PGlite (not real Postgres; extension and driver gaps).
- Consequences: `npm run dev` needs no setup beyond `npm install`. Port 5444 avoids clashing with other local Postgres instances on 5432/5433. Supersedes the Docker Compose parts of D-022 and architecture.md section 7.

## D-028: Phase 1 implementation choices
- Date: 2026-10-19
- Status: Accepted
- Decision:
  - **Next.js 16.4** with `cacheComponents` and `partialPrefetching` on (the create-next-app defaults). Anything that reads cookies or the database renders inside `<Suspense>`; middleware is `src/proxy.ts`.
  - **Prisma 7.10** (stable; `latest` on npm was an 8.0 release candidate) with the `prisma-client` generator (output `src/generated/prisma`, git-ignored) and the `@prisma/adapter-pg` driver adapter. Config in `prisma.config.ts`.
  - **Dev sessions:** HS256 JWT in an httpOnly cookie, signed with `jose`, behind `src/server/auth` (D-020). `proxy.ts` does an optimistic redirect only; pages and actions call `requirePermission()`.
  - **Permissions:** a role→permission map in `src/lib/permissions.ts`; users can hold several roles (`roles Role[]`).
  - **UI:** shadcn/ui "radix-nova" preset (uses the `cn` package for class merging), lucide-react, sonner toasts, next-themes.
  - **Content rendering:** react-markdown + remark-gfm + remark-math + rehype-katex + rehype-highlight. Raw HTML is not rendered.
  - **Zod 4** for env and input validation; **Vitest 5** for unit tests; **Playwright** on desktop and a 360 px phone; Prettier with the Tailwind plugin; Husky + lint-staged; GitHub Actions CI.
  - `forbidden()` is experimental in Next 16, so access failures redirect to `/access-denied`.
- Consequences: Light-theme success/warning/info colours were darkened for WCAG AA text contrast (design-system.md updated).

## D-029: Background jobs in a PostgreSQL queue until Phase 6; Docker and Redis at the end
- Date: 2026-10-19
- Status: Accepted
- Supersedes: the "Redis + BullMQ from Phase 2" timing in D-007
- Context: The owner wants Docker and Redis added at the end, with alternatives until then that are just as reliable. Imports need background processing that survives restarts and never runs a job twice.
- Decision: A `jobs` table in PostgreSQL is the queue. Workers claim jobs with `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)`, so two workers can never take the same job. Failed jobs retry with exponential backoff (2 s, 4 s, 8 s… capped at 5 minutes) up to `maxAttempts`. Jobs locked for more than 15 minutes by a crashed worker are requeued. A separate worker process (`npm run worker`, started by `npm run dev`) runs them. Callers only use `enqueueJob()`, so Phase 6 can swap in BullMQ + Redis (and Docker) without changing them.
- Alternatives: In-memory or `after()`-based processing (loses work on restart). Native Redis on Windows (no official build). Hosted Redis now (an external service before Phase 6).
- Consequences: Covered by integration tests (no double claims, retry and backoff, crash recovery). Timestamps in raw SQL come from the application clock, because Prisma stores UTC in columns without a time zone. Phase 6 adds tasks for Docker and the Redis/BullMQ swap.

## D-030: Phase 2 implementation choices
- Date: 2026-10-19
- Status: Accepted
- Decision:
  - **Parsing:** Papa Parse for CSV (delimiter fixed to `,`, because auto-detection mistook `A|C` pipes for the delimiter), read-excel-file for XLSX (the npm `xlsx` package is outdated), fflate for ZIP. Files must be UTF-8.
  - **Strict columns:** missing required columns *or* unknown columns fail the whole file, so typos like `qestion` are caught instead of silently ignored.
  - **Validate twice:** rows are validated for the preview and again at commit time against the current database. Rows that became invalid in between are marked failed, not written. Rows that had errors at preview are skipped and reported, not counted as failures.
  - **Storage:** a `Storage` interface with a local-disk driver (`.data/storage`); R2 replaces it in Phase 6. Import images are stored by SHA-256 (`assets/<hash>.<ext>`) and served from `/api/assets/<file>` with immutable caching and a sandboxing CSP for SVGs.
  - **Duplicates:** the `pg_trgm` extension with a GIN index on question text; similarity ≥ 80% gives a warning, never an error.
  - **Versions:** every content change writes a `ContentVersion` snapshot. Editing or re-importing a published or in-review question puts it back to draft (it leaves the student-facing pool until approved again). Revisit in Phase 3 if a "live copy while editing" model is needed.
  - **Rollback:** available for MCQ and passage imports while every affected question is still the draft that import created (same batch, same version). Other import types are fixed by importing again.
  - **Review:** reviewers can't approve their own questions; super admins can (solo founder mode, PRD 5.3). Sending back requires a note.
  - **Company question map:** coding rows map coding problems (since Phase 4).
  - **Permissions added:** `taxonomy.manage`, `companies.publish`, `imports.view`.

## D-031: Editing a published question takes it out of practice until re-approved
- Date: 2026-10-19
- Status: Accepted (revisit if review turnaround gets slow)
- Context: D-030 left open whether a published question should stay live while an edit is reviewed.
- Decision: Keep it simple: an edited or re-imported published question goes back to draft and leaves practice until approved again. Past attempts, mastery and mistakes keep pointing at it, so no student history is lost. Most edits fix errors, and hiding a wrong question until it's checked is the safer default.
- Alternatives: A "live copy plus pending revision" model. Better for heavy editing, but it doubles the content model's complexity. Reconsider when there are several reviewers and frequent edits.

## D-032: Phase 3 learning rules
- Date: 2026-10-19
- Status: Accepted
- Decision:
  - **Days are IST days.** Free limits, streaks and the question of the day reset at midnight India time (`src/lib/learning/dates.ts`), whatever the server's time zone. Attempts store their IST `activityDate`.
  - **Mastery** (`src/lib/learning/mastery.ts`): difficulty-weighted (easy 1, medium 1.5, hard 2), older answers fade by 0.9 per new answer, and a prior of 2 stops "2 right = 100%". Score = correct weight ÷ (total weight + 2). Explainable to students; tune constants with real data.
  - **Readiness** (`src/lib/learning/readiness.ts`): weighted average of topic mastery, where each company test section's question count is shared across its topics. "Work on" lists the topics with the biggest possible gain.
  - **Grading:** multiple-answer questions need the exact set (no partial credit); numeric answers use the tolerance plus a tiny epsilon.
  - **Free limit:** 25 MCQs a day (setting), counted on the server for practice and mistake retries. The question of the day is free. Admins previewing the student app aren't limited. Pro (Phase 5) lifts the limit.
  - **Question of the day:** one published question per IST day for everyone, picked deterministically on first request and stored.
  - **Public company pages** read from `"use cache"` functions tagged `companies` (refresh hourly). Admin actions call `updateTag("companies")` so publishes show immediately. Personal parts (eligibility, "prepare for this company") stream in separately. The sitemap waits for a request (`connection()`), so builds never need a database.
  - **Content Markdown** keeps single line breaks (`remark-breaks`), because authors write line breaks in CSV cells.
  - **Long forms** (onboarding, question editor, company profile) submit through `useFormSubmit`, which avoids React 19's automatic form reset. Otherwise a server-side validation error would wipe what the user typed.
  - **Sign-in** sends students who haven't onboarded straight to `/onboarding`. A layout gate also redirects them if they reach a student page.
  - **Dev fixtures:** `npm run content:sample -- --publish --reset-students` publishes the sample content through the normal workflow functions (submit, then approve as the seeded super admin, with the audit trail) and resets the seeded students. It refuses to run in production. The e2e server uses it so every run starts the same way.

## D-033: A local judge for development and tests; Judge0 in production
- Date: 2026-10-19
- Status: Accepted
- Context: Judging code needs real compilers. Judge0 normally runs in Docker, which we skip until Phase 6 (D-027).
- Decision: One `Judge` interface (`src/server/integrations/judge/`): compile once, then run each test. Two drivers, picked by `JUDGE_DRIVER`:
  - **`local`** (default): the machine's real toolchains (gcc/g++ `-O2`, javac/java, python, node) in a temp folder, with time limits, an output cap and a Java heap limit. Verdicts match an online judge, so tests are accurate. It is **not a sandbox** and refuses to start when `APP_ENV=production`. The timer starts once the process has spawned (on Windows, antivirus scans of a fresh binary otherwise caused false time-limit verdicts). Windows `\r\n` output is normalised to `\n`.
  - **`judge0`**: a Judge0 server (`JUDGE0_URL`, `JUDGE0_TOKEN`) for production, isolated from the app (hosting: Phase 6).
- Time limits are written for C/C++; other languages get the usual allowance: Java ×2 + 1.2 s, Python ×3 + 0.4 s, JavaScript ×2 + 0.4 s, C/C++ + 0.15 s (`effectiveTimeLimit`). Students see the limit for the language they pick.
- Judging runs in the worker (`code.judge` job), so the web server never runs student code. One pending submission per student, 20 runs per 5 minutes.

## D-034: Problems are checked in the judge after import, and must pass before publishing
- Date: 2026-10-19
- Status: Accepted
- Context: data-import.md said a failing reference solution "rejects the problem" at import. Compiling and running every solution inside an import preview would make previews slow and tie imports to the judge.
- Decision: Imports save problems, tests and solutions as drafts, then queue a `problem.validate` job per changed problem. Every reference and brute-force solution runs against every test; the result (one line per solution, with the slowest time and a warning above half the time limit) is stored on the problem. Changing tests, solutions, limits or the checker clears the result and checks again. **A problem can only be submitted for review or published after it passes.** Mock tests only draw validated, published problems.
- Importers describe follow-up jobs (`followUpJobs`) instead of queuing them, so they stay free of side effects and easy to unit-test.

## D-035: CodeMirror 6 for the code editor
- Date: 2026-10-19
- Status: Accepted
- Decision: `@uiw/react-codemirror` with the C/C++, Java, Python and JavaScript language packs, loaded in the browser after the page.
- Why not Monaco: Monaco is several MB, slow to start on low-end phones and awkward on touch screens and narrow layouts. CodeMirror 6 is small, accessible (labelled for screen readers), works on mobile and follows our themes. Unsaved code is kept per problem and language in `localStorage` (a convenience; submissions are the record).

## D-036: Mock test engine rules
- Date: 2026-10-19
- Status: Accepted
- Decision:
  - **Blueprints** hold sections (type, minutes, marks, negative marks, "can go back") and topic rules ("draw N items from this topic, optionally by difficulty"). "Draft mock" copies a company's online-test sections. Publishing checks every rule can be drawn (rules on one topic share its pool); coding rules need validated problems.
  - **Sittings** freeze the draw at start (unseen items first, then random, shuffled within a section) and snapshot the section settings, so editing a blueprint never changes a running or past test.
  - **Clock** (`src/lib/tests/clock.ts`, pure): free navigation has one timer; sequential navigation runs sections back to back, each with its own timer, and finishing a section early starts the next one at once. The server clock is the truth; the browser corrects for skew. Saves are accepted up to 15 s after a section closes (slow networks).
  - **Auto-submit:** a `test.autosubmit` job runs at the latest possible end; opening an expired sitting also finishes it. Finishing is idempotent (claimed with a conditional update).
  - **Scoring** (`src/lib/tests/scoring.ts`, pure): +marks right, minus the negative marks wrong, 0 skipped; coding items give marks × the best submission's score (partial for per-test problems). Answered MCQs are recorded as `TEST` attempts: they update mastery, mistakes and the streak, but never use the free daily limit.
  - **Results:** sections, accuracy, time used, per-question review with explanations, weak topics (under 60% with at least 2 items) linked to practice, and a percentile once 5 other sittings exist.
  - **Free plan:** one full company mock per company (setting `limits.freeMocksPerCompany`); topic tests and coding assessments are unlimited. Coding: free users can start 20 problems (setting); problems already started stay open.
  - **Exam screens** copy the layout and wording of common test platforms (palette side, section tabs, button labels), never their branding.
  - **Light proctoring:** tab switches are counted and shown in the result; full screen is offered; leaving the page asks for confirmation. Nothing is enforced automatically.

## D-037: Databases are created as UTF-8
- Date: 2026-10-19
- Status: Accepted
- Context: On Windows the embedded PostgreSQL cluster defaulted to WIN1252, which can't store characters like ₹, →, ✓ or Hindi text. Found when a judge report containing "✓" failed to save.
- Decision: New clusters start with `--encoding=UTF8 --locale=C`; databases are always created with `ENCODING 'UTF8' ... TEMPLATE template0`. `with-db.mjs` warns about an existing non-UTF-8 database; the test database is recreated automatically. The old local dev database was kept as `eduprep_win1252_backup` and the dev database rebuilt (migrations, seed, sample content). Production PostgreSQL must be UTF-8 (the default on managed hosts).

## D-038: Charts stay hand-built SVG
- Date: 2026-10-19
- Status: Accepted
- Decision: No chart library. The few visuals (daily and weekly charts, section score bars, option-share bars in content analytics) are small SVG/CSS components following the dataviz rules: one hue per meaning, text in text colours, a table or text equivalent. Revisit if interactive multi-series analytics are needed.

## D-039: Interview slots and double-booking protection
- Date: 2026-10-20
- Status: Accepted
- Decision:
  - **Slots are computed, not stored** (`src/lib/interviews/slots.ts`, pure): weekly hours in the interviewer's own time zone, minus days off and active bookings (with the interviewer's buffer on both sides), on a 30-minute grid, from now + minimum notice (setting, 6 h) for 14 days. Time-zone maths uses the platform's Intl data (`src/lib/time/zones.ts`); candidates see IST.
  - **Hold, then confirm:** picking a slot creates a HELD booking for a few minutes (setting, 10 min). Using a credit or paying confirms it. A confirmation after the hold ran out still succeeds if nobody took the slot; otherwise the credit stays on the account.
  - **No double booking, twice over:** the booking service locks the interviewer row (`SELECT … FOR UPDATE`), expires stale holds and re-checks the slot inside the transaction; and a PostgreSQL exclusion constraint (`bookings_no_overlap`, btree_gist) makes overlapping active bookings for one interviewer impossible. An integration test races two candidates for one slot.
  - **Policies (settings):** free reschedule or cancel (credit returned) up to 12 h before; later candidate cancellations keep the credit used; interviewer and admin cancellations always return it; interviewers can cancel themselves only 24 h ahead. Interviewer no-show: credit back to the candidate, a penalty of 50% of the usual earning, and a review flag. Candidate no-show (marked by the interviewer after 10 minutes): no refund, interviewer paid.
  - **Earnings:** the interviewer's share (setting, 70%) of the type's current list price is added to their ledger when the scorecard is submitted. The balance is the sum of the ledger (earnings, penalties, payouts). Ops records bank transfers in Phase 5; Razorpay Route automates them in Phase 6.
  - **Quality:** interviewers are flagged for review below 70% (3.5 stars) after 5 ratings, or after 2 no-shows. Ratings go to the team, not to the interviewer.

## D-040: Commerce with a mock payment provider
- Date: 2026-10-20
- Status: Accepted
- Decision:
  - **Catalogue in code, prices in settings:** Pro (30 or 182 days), company pack (182 days, one company), interview credits (per type, bundles of 1/3/5 with setting-driven discounts). No product tables: prices change in admin › Settings; durations are part of the product definition.
  - **The server prices everything** (`quoteOrder`): bundle discount first, then one code: a coupon (percent or amount, per product kind, expiry, max uses) or another user's referral code (setting, 10%), whichever is bigger. Never below ₹1.
  - **Only a verified webhook grants access.** `PaymentProvider` (`src/server/integrations/payments/`) has a mock driver for development and tests: orders get provider ids, and the test checkout page sends HMAC-signed events through exactly the handler a real Razorpay webhook will use (`/api/payments/webhook/[provider]`). Events are recorded once (`PaymentEvent`), amounts are checked, and the order is claimed with a conditional update, so retries and duplicates are harmless. `PAYMENT_DRIVER=mock` is refused in production.
  - **Fulfilment:** Pro and packs are `Entitlement` rows; buying again extends from the current end date instead of overlapping. Credits are `InterviewCredit` rows. Referral owners get points.
  - **Paywall** (`src/lib/commerce/access.ts`, `src/server/services/access.ts`): Pro lifts every free limit; a company pack lifts the daily limit for that company's questions, opens its coding problems and its full mocks. Admins previewing the student app are unlimited.
  - **Invoices:** prices include GST (setting, 18%); invoices show the CGST/SGST split and use a gap-free number per Indian financial year from a PostgreSQL sequence (`INV/2026-27/000001`). GSTIN and address are added with company registration (Phase 6).
  - **Refunds:** support refunds paid orders whose credits are unused; the refund revokes what the order granted. Manual grants (Pro days, packs, credits) are audited.

## D-041: Notifications and meetings behind providers
- Date: 2026-10-20
- Status: Accepted
- Decision:
  - **Notifications:** pure templates (`src/lib/notifications/templates.ts`) for welcome, purchase receipt, booking confirmed/moved/cancelled, reminders (24 h and 1 h), scorecard ready, scorecard overdue, interviewer decision, experience decision. Each message is stored (`Notification`) and sent by the worker (`notification.send`) through a transport. Phase 5's "outbox" transport writes emails as HTML files to `.data/mail`; everything is visible in admin › Notifications. Email goes to every user with an address; WhatsApp rows are created for users with a phone number (sent for real in Phase 6). Transactional messages ignore the marketing opt-out (account page).
  - **Meetings:** `MeetingProvider` with a mock driver (a local "meeting room" page) and a Google driver (service account with domain-wide delegation creates a Calendar event with a Meet link, invites both people, and moves or cancels it). `MEETING_DRIVER=google` needs the `GOOGLE_*` variables. Meetings are created by the worker (`booking.meeting`), never in a web request; confirmation messages go out once the link exists.
  - **Reminders and overdue scorecards** are delayed jobs that check the booking still has the same time and status before sending.

## D-042: Experienced track and interview experiences
- Date: 2026-10-20
- Status: Accepted
- Decision:
  - **Role tracks** (`tracks/role-tracks.csv`) are structure like the taxonomy: live on import. Each lists topics (any subject), interview types and a Markdown roadmap; the track page shows the student's mastery per topic, coding problems, design questions and interview types.
  - **Design questions** (`design/design-questions.csv`): prompt and requirements first, approach and trade-offs behind "show". Imported as drafts; a reviewer publishes them.
  - **Interview experiences:** any student can submit (5 a day); every one is moderated (approve with edits, or reject with a note). Approved ones appear on `/companies/[slug]/experiences` with role, fresher/experienced and year filters, anonymous by default. The contributor earns points once (setting).

## D-043: Our own accounts module instead of Better Auth
- Date: 2026-10-20
- Status: Accepted
- Supersedes: the Better Auth plan in D-005 and D-020
- Context: The owner asked for normal email sign-up and sign-in plus OTP. The app already had one auth module (`src/server/auth`), signed session cookies and provider interfaces for email and SMS.
- Decision: Build accounts in-house, small and explicit:
  - **Email + password:** sign-up sends a 6-digit code; the address must be confirmed before password sign-in (signing in unconfirmed sends a new code). Passwords are hashed with Node's scrypt (N=16384, r=8, p=1, 16-byte salt), checked against a short list of common passwords, and failed sign-ins take the same time whether or not the account exists. Sign-up does say when an email already has an account (better for students; rate-limited per IP).
  - **Phone OTP:** a 6-digit code by SMS to an Indian mobile (+91, normalised); a new number creates an account and onboarding asks for the name. Email is optional, as in the PRD.
  - **Password reset:** by emailed code; never reveals whether an address has an account; signs out every session.
  - **Codes:** random, 10-minute expiry, only an HMAC is stored, a newer code replaces older ones, 5 wrong tries burn a code. With real transports the stored copy of the message has the code masked.
  - **Rate limits** (PostgreSQL fixed windows, shared by all servers): 3 codes per address per 10 minutes and 10 a day, 20 per IP per hour; 10 password tries per account and 50 per IP per 15 minutes; 10 sign-ups per IP per hour.
  - **Sessions:** a `sessions` row per device; the cookie is a signed token naming it. Every request checks the row (revoked or expired means signed out), so sign-out, password reset and "sign out of other devices" take effect at once. proxy.ts only checks the signature (fast redirect for signed-out visitors).
  - `AUTH_MODE=dev` keeps the `/dev-login` test-account picker for development and tests; `live` (required in production) removes it.
- Why not Better Auth: everything it would add here (adapters, schema generation, a plugin per method) is more code to keep compatible with Next 16 and Prisma 7 than the few hundred lines we own, and our flows (DLT SMS via MSG91, outbox in development, Postgres rate limits) are custom anyway.
- Later: Google sign-in (PRD 8.1) as one more method on the same sessions.

## D-044: Razorpay
- Date: 2026-10-20
- Status: Accepted (needs a test-mode run with real keys)
- Decision: `PaymentProvider` gains a Razorpay driver: Orders API (amount in paise, receipt, our order id in notes), Standard Checkout in the browser, and two confirmations through one idempotent handler: the checkout callback (signature `HMAC(order_id|payment_id, key secret)`, then the payment is fetched and must be captured for the order) and the webhook (`X-Razorpay-Signature` over the raw body with the webhook secret, unique `X-Razorpay-Event-Id`). Refunds use the Payments refund API. Auto-capture must be on. Interviewer payouts stay manual until Route (plan 6.3).

## D-045: Message providers
- Date: 2026-10-20
- Status: Accepted (needs real-key tests)
- Decision: one transport per channel, each `outbox` by default: email via **Resend** (idempotency key = notification id), SMS via **MSG91** Flow API with a DLT-registered OTP template (SMS is used only for codes), WhatsApp via the **Cloud API** with one approved utility template (`{{1}}: {{2}}`). Sign-in codes are sent immediately (no queue); everything else goes through the worker.

## D-046: Redis delivers jobs, PostgreSQL keeps them
- Date: 2026-10-20
- Status: Accepted
- Supersedes: the "BullMQ replaces the table" plan in D-029
- Decision: With `QUEUE_DRIVER=bullmq`, `enqueueJob()` still writes the `jobs` row and also pushes the job id to Redis (BullMQ) with its delay; workers take ids from Redis and claim the row (`UPDATE … WHERE status = QUEUED AND run_at <= now`), so a job never runs twice. A slower table sweep (every 15 s) runs anything Redis missed. Retries, errors and the admin monitor are unchanged. Without Redis (`postgres`), workers poll every second as before.

## D-047: Deployment shape
- Date: 2026-10-20
- Status: Accepted (hosting provider still to choose; see docs/deployment.md)
- Decision: one Docker image runs the web app, the worker and migrations; `docker-compose.yml` runs PostgreSQL (UTF-8), Redis, migrations, web and worker on one machine; Judge0 on its own VM. `GET /api/health` checks the database (and Redis). Security headers on every response (nosniff, referrer policy, frame denial, permissions policy, HSTS on staging and production). A Content-Security-Policy follows after a report-only trial (Razorpay Checkout, KaTeX and the theme script need a tuned policy). Legal pages ship as drafts for legal review.

## D-048: Question discussions are moderated after posting
- Date: 2026-10-20
- Status: Accepted
- Context: The owner asked for moderated discussion under each question (IndiaBix-style). Checking every comment before it shows would make discussion feel dead; showing everything invites spam.
- Decision:
  - Only students who have **answered** the question (in practice or a test) can read or post, so the thread never spoils the answer. Admins can always read.
  - Comments go live at once. Automatic checks refuse links (`http…`, `www.`), phone numbers, email addresses and repeated-character spam; 10 comments per student per hour.
  - Replies are one level deep. Upvotes ("helpful") sort the thread; students can't upvote themselves.
  - Students flag with a reason. At `discussion.autoHideFlags` flags (setting, default 3) the comment is hidden until a moderator keeps or hides it. Moderators (reviewer, support admin) can also stop a user posting (`users.comments_blocked_at`). Every decision is audited.
  - Authors can delete their own comments (hidden, kept for moderation context).
- Later: replies notifications, comment search, a reputation score.

## D-049: All-India mock tests (contests)
- Date: 2026-10-20
- Status: Accepted
- Decision:
  - A **contest** uses an existing mock test blueprint as its format (draft blueprints work, so the format can stay out of the normal test list). Publishing freezes the section settings and draws **one question set** for everyone; each student gets those questions in their own order.
  - Students can start between `starts_at` and `ends_at`; each gets the full test length, so results are final at `ends_at + length + 5 min`. One sitting per student per contest (unique key). Contest sittings never count toward, or resume, normal tests and are free for everyone.
  - **Ranking:** higher score, then less time taken (whole seconds), equal score and time share a rank. **Percentile** is the share of candidates who scored the same or lower (as national exams report it), two decimals.
  - **Live ranks** come from a SQL window query on every page view (auto-refreshing every 30 s while live). Answers, explanations and weak topics stay **on the server** until results are final, so nothing can leak while others are still taking it.
  - Job `contest.finalize` (queued at publish for the results time) submits stragglers, freezes rank and percentile on each sitting in one transaction with the badges, then emails/WhatsApps every participant.
  - Weekly routine for admins: "Copy to next week" (a draft one week later), check, publish.
- Later: college and state leaderboards, a prize contest, reminders before a contest opens (needs a fan-out job).

## D-050: Jobs board
- Date: 2026-10-20
- Status: Accepted
- Decision:
  - Admins (ops, content authors) post jobs: title, employer (optionally linked to a company page), locations, work mode, type, audience, experience range, pay text, skills, Markdown description, eligibility (branches, batches, CGPA, backlogs, same rules as company pages), application link and an optional last day to apply. Draft → published → closed; jobs close themselves after the last day.
  - Jobs are **public** (`/jobs`, `/jobs/[slug]`) for search engines, with schema.org `JobPosting` data for Google for Jobs, and appear in the sitemap. Signed-in students also get save, "applied" marks and their eligibility.
  - "Apply" is a plain link to `/jobs/[slug]/apply`, which counts the click (once per signed-in student) and redirects (303) to the employer. Only http(s) links are accepted. We never take applications or money.
- Later: job alerts by eligibility (WhatsApp/email), employer self-service.

## D-051: "Asked today" drive reports
- Date: 2026-10-20
- Status: Accepted
- Decision: A short form (company, when: today to a week ago, round, difficulty, what was asked, optional topics, platform, city) separate from the longer interview experience. Moderated like experiences (same moderators), approval awards points (`points.driveReportApproved`) and the contributor badge. Approved reports from the last 60 days show on the company page, read per request so they appear as soon as they're approved. The admin overview counts pending reports so they're checked within hours. Reporter names are never shown.

## D-052: Badges and streak freezes
- Date: 2026-10-20
- Status: Accepted
- Decision:
  - Badges are defined in code (`src/lib/engagement/badges.ts`: streaks, answers, tests, All-India mocks, coding, community) and stored by id when earned. They're awarded in the same transaction as the event that earns them, only when a threshold is crossed (no extra queries on ordinary answers).
  - **Streak freezes:** a freeze covers one missed day automatically. Students earn one every `streak.freezeEveryDays` streak days (default 7), hold at most `streak.maxFreezes` (2), and can buy one for `streak.freezePointsCost` points (50). Frozen days don't add to the streak. All streak updates (practice, tests, coding submissions) go through one helper.

## D-053: Share cards
- Date: 2026-10-20
- Status: Accepted
- Decision: Sharing is opt-in. "Share" freezes a card (first name and last initial, the title, the result, the date) under a random 12-character id at `/s/[id]`, with a generated 1200×630 image (`/s/[id]/image`, also the download) used as the Open Graph image for WhatsApp and LinkedIn previews. Test scores, final All-India ranks and badges can be shared; contest ranks only once final. Students can turn any link off. Share pages aren't indexed.

## D-054: Fewer import files, duplicates refused, export and "Replace all"
- Date: 2026-10-23
- Status: Accepted
- Context: admins had to keep three files per coding set (problems, tests, solutions) and four or five per company (profile, rounds, sections, sources, question map), upload them in order, and keep their own copies. Mistakes were easy and the files drifted from what was live.
- Decision:
  - **Coding problems in one file** (`CODING_BUNDLE`): one row per problem with the statement, reference solution, optional brute and starter code, up to 3 samples and 20 hidden tests, and `companies`. The row is the full truth for its problem (its tests and code are replaced). Large or many tests keep the ZIP package; the export leaves those problems out so editing it can't cut tests.
  - **Companies in two files:** `companies.csv` gains `source_1..3` columns, and `company-process.csv` (`COMPANY_PROCESS`) holds rounds and sections, one row per section. For each company in it, the process file is complete (missing rounds and sections are removed) and a company's rows are imported together.
  - **Company tags live with the content:** MCQ and coding files have optional `companies` and `asked_in` columns. When the column is present it is the full list for the item (the preview names what it unlinks). `company-question-map.csv` remains for per-company months, rounds and report counts.
  - **Duplicates and IDs:** the same question (normalized text, options, code, passage) or coding statement under another ID is an error, in the file or against the bank. IDs are optional: an MCQ without one is matched to the same saved question, or gets `<subject>-<content hash>`; a coding problem without one keeps the ID of its slug's problem, or uses the slug.
  - **Only changes are written:** unchanged rows were already skipped; now a change to company tags alone doesn't send the item back to review.
  - **Download current data:** exports in the upload format, with IDs, so admins edit and re-upload instead of keeping copies. Re-importing an export changes nothing (tested).
  - **Replace all** (super admin only, typed `REPLACE`): the file becomes the full set for its scope (a subject's MCQs, all coding problems, all companies). Missing items are **archived, never deleted**, so student attempts and history stay. A backup export is stored first and linked on the import page; a replace can't be undone with Undo (import the backup instead). Importing an archived item brings it back as a draft.
  - Import order is now taxonomy, passages, companies, company process, MCQs, coding. The older multi-file formats still import, listed separately.
- Not done: wiping content. Deleting questions would delete or orphan student attempts, test results and submissions, so the closest thing is Replace all (archive).

## D-055: Admin editors for content that came only from imports
- Date: 2026-10-28
- Status: Accepted
- Context: coding problems couldn't be created in the admin panel, and their topics, languages and code couldn't be changed there. Design questions could only be published or unpublished. Role tracks, interview types and passages had no editor, and admin roles couldn't be given or removed in the app. Every fix meant editing a CSV.
- Decision (no schema change):
  - **Coding problems:** "New problem" form (draft, author set). The edit form adds topics (DSA subject only, as in imports), languages and source. Reference, brute-force and starter code can be added, replaced and deleted. Reference and brute changes clear the judge check and re-run it (D-034). Starter code only sends the problem back to draft, because the judge doesn't use it. A language can't be dropped while it has starter code.
  - **Design questions:** create and edit. New questions are drafts. An edit sends a published question back to draft (D-010, D-031). Company slugs must exist. Reviewers publish, unpublish, archive and restore.
  - **Role tracks:** create, edit, hide and show (admin › Role tracks, `taxonomy.manage`). Edits go live, like the track import. The slug is fixed after creation, because design questions link to tracks by slug.
  - **Interview types:** create and edit (`interviews.manage`): name, description, audience, length, order, on/off and the scorecard rubric. Prices still live in settings. A type picks one of the interview price settings, so new prices still need a settings entry. The slug is fixed, because tracks and booking links use it. Rubric items keep their key when renamed. A submitted scorecard shows the items it scored: items added later are skipped, and removed items still show with a label from their key.
  - **Passages:** list, create and edit with a live preview. Edits reach every question using the passage straight away, as a passage re-import already does. The form warns how many published questions that affects. The ID is fixed. Only passages no question uses can be deleted.
  - **Admin roles:** super admins only (`users.roles`), on the user page. Only admin roles change: student and interviewer roles stay, and interviewers are still approved on the Interviewers page. You can't remove your own super admin role or the last super admin. Anyone left with no role keeps a student account. Changes are audited and apply on the next request, because roles are read from the database each time.
- Alternatives: putting passage edits through review, by sending linked published questions back to draft. That's safer for wrong passages, but one typo fix would pull many questions out of practice. Revisit if passage mistakes show up.

## D-056: One admin role, no review step
- Date: 2026-10-28
- Status: Accepted (supersedes the role split in PRD 7 and the review flow of D-010/D-031 for publishing)
- Context: the owner adds all content alone. Five admin roles and a Draft → In review → Published flow meant approving their own work through extra screens.
- Decision:
  - **Roles:** `Role` is now `STUDENT`, `INTERVIEWER`, `ADMIN`. A migration turned every super admin, content author, reviewer, ops admin and support admin into `ADMIN`. Every admin permission maps to `ADMIN`. The permission names stay in code, so splitting roles again later means editing one table.
  - **Admin access:** a "Make admin / Remove admin access" button on the user page. You can't remove your own access, and the last admin can't be removed. Changes are audited.
  - **Publishing:** content is Draft → Published → Archived. `IN_REVIEW` stays in the database enum, because removing it would rebuild every content table, but nothing sets it and old rows became drafts. Question, coding problem, design and company editors have "Save as draft" and "Save and publish". A plain save of a published item unpublishes it (D-031 still holds for that). Publishing runs the automatic question checks. Coding problems still need the judge check (D-034): "Check and publish" runs it and publishes when it passes (`problem.validate` with `publishBy`). Companies still need a source.
  - **Drafts page** (`/admin/drafts`, was the review queue): draft questions with bulk publish, draft coding problems with their judge state, and draft design questions.
  - **Publish after import:** a tick box on the import preview (MCQ, companies, design questions, coding). Items go through the same publish rules; ones that fail stay drafts. The batch records `publishAfterImport` and `publishedCount`. Coding problems publish from their judge-check job.
- Consequences: the old seeded accounts (author, reviewer, ops, support) are admins in existing local databases; the seed now creates one admin. Blind review is gone; mistakes are caught by the automatic checks, the judge, student error reports and content analytics.

## D-057: Company workspace for adding content by hand
- Date: 2026-10-28
- Status: Accepted
- Context: preparing CSV datasets is slow. The owner wants to build each company's content one item at a time, starting from the company.
- Decision:
  - Questions and coding problems stay in one shared bank, organised by subject and topic. A company **links** to them (`company_items`, with optional months). Nothing is copied per company. Working "from a company" means the editors open with that company already linked.
  - **Company admin page tabs:** Profile, Hiring process, Sources, MCQ questions, Coding, Mock tests.
  - **Hiring process and sources** are edited in place and go live straight away, like the process import: they describe the company, they aren't graded content. Round and section orders stay 1, 2, 3… (swap to move, renumber after delete). A published company can't lose its last source.
  - **"Asked at"** in the question and problem editors is the item's full company list. Changing it doesn't unpublish the item (same as D-054 for imports). Months are `YYYY-MM`, not in the future.
  - **"Then add another"** (new questions): after saving, a fresh form keeps the subject, topic, subtopic, type, difficulty, time, source, tags and companies, and suggests the next unused ID (QA-PCT-0042 → QA-PCT-0043). It's ticked by default when the editor was opened from a company.
  - **Link existing / unlink** on the company tabs. Unlinking never deletes the item.
  - **"+ New topic"** creates a topic from its name inside the editors. The slug comes from the name; a slug taken by another subject gets the subject slug in front.
  - **Coding problem checklist:** samples, hidden tests, reference solution, judge check, published.

## D-058: Public content for search and preview
- Date: 2026-10-28
- Status: Accepted (C.1–C.5 built)
- Context: search engines only see the home, company and job pages. The question bank, the main source of search traffic ("TCS NQT percentage questions"), is behind sign-in, so Google never sees it. The owner wants pages to rank and visitors to preview the platform without signing in.
- Decision (owner chose "samples only"):
  - **Every published question's text and options can be public.** The answer and explanation are public only for **public samples**. The rest say "Sign up free to see the answer", and visitors and search engines see the same page (no cloaking).
  - **Public samples:** a `public_sample` flag per question. Admins switch it on the question page or in bulk. When a question is published, it becomes a sample automatically while its topic has fewer than `seo.publicSamplesPerTopic` (setting, default 10; 0 turns this off). Republishing a draft can mark it again if the topic has room.
  - **Stays private:** questions inside mock tests and All-India contests, hidden tests, editorials and model answers beyond the samples, user data, and paid company packs.
  - **Sitemap:** adds pricing, become-interviewer, the legal pages, and the interview-experience pages of companies that have approved ones. A company's "last modified" moves when its rounds, sections, sources, linked questions, or the publishing of a linked question change.
  - **Planned public pages (C.3–C.5):** one address per question (shared by every company that asks it), topic pages with samples first, coding problem statements with samples, mock test landing pages, more on company pages, structured data, split sitemaps, rate limits against scraping, and keeping topics with very few questions out of the index.

### D-058 addendum: public question pages (C.3), 2026-10-29
- URLs: `/questions` (subjects and topics), `/questions/[subject]`, `/questions/[subject]/[topic]` (20 per page, samples first), `/question/[id]` (lower-case ID, one address per question however many companies ask it).
- Page data goes through `toPublicQuestion`, which drops answer fields unless the question is a public sample. Samples show "Show answer and explanation" in a collapsed section. The rest show "Sign up free to see the answer" to everyone.
- Structured data: BreadcrumbList everywhere, and Quiz with Question and acceptedAnswer for samples only.
- Topics with fewer than 5 published questions are `noindex, follow` and left out of the sitemap.
- Sitemaps: `/sitemaps/questions` (index) and `/sitemaps/questions/[n]` (40,000 URLs each), built with route handlers so builds never need the database, and listed in robots.txt.
- Caching: `"use cache"` with the `public-questions` tag. Admin question, taxonomy and company-link actions refresh it. Changes made by imports in the worker show within an hour.

### D-058 addendum: public coding problems and mock tests (C.4), 2026-10-29
- `/problems` (list with topic filter; filtered and later pages are `noindex, follow`) and `/problems/[slug]`: statement, formats, constraints, limits, languages, sample tests and "asked at". Hidden tests, solutions, hints and editorials are never read for these pages (only `isSample` tests are queried, and `toPublicProblem` keeps samples only). "Solve this problem" links to the signed-in workspace `/coding/[slug]`.
- `/mock-tests` and `/mock-tests/[slug]`: a published test's format (sections, question counts, minutes, marks, negative marking, going back, topics, platform style, instructions). Never its questions. "Take this mock test" links to `/tests/[slug]`.
- Both are in the main sitemap, cached with the `public-catalog` tag (refreshed by the problem, test and company-link admin actions).
- The public header now shows content pages only (Companies, Questions, Coding, Mock tests, Jobs, Pricing) from the large breakpoint up; the landing-page section links stay in the footer.

### D-058 addendum: company pages and scraping limits (C.5), 2026-10-29
- Public company pages show up to 5 public sample questions with answers, the company's mock tests, and link "recently asked" questions to `/question/[id]`, section topics to the public topic pages, and coding problems to `/problems/[slug]`. Signed-in practice links remain where they were.
- **Rate limit:** the proxy counts page loads of `/question*`, `/questions*`, `/problems*` and `/mock-tests*` per visitor address: 60 per minute, or 300 for user agents that say they're search crawlers. Over the limit, the visitor gets a 429 with `Retry-After`. It's in memory per server process (no database call per page view), and requests without a forwarded address, or from this machine, aren't limited. Long link lists on public pages don't preload, so a reader uses about one request per page. Phase 6: the host must set `X-Forwarded-For` (deployment.md §10), and with several servers, move the limit to Redis or the CDN.

### D-058 addendum: review fixes, 2026-10-29
- **Public samples:** the automatic choice applies only to a question's first publish, and never after an admin set the box by hand, so a question made private stays private when republished. Bulk "Make public sample / Hide answer" refreshes the public pages straight away.
- **Rate limit:** the visitor's address is read from the right end of `X-Forwarded-For` (our proxies' side), skipping our own network's addresses and `TRUSTED_PROXY_HOPS - 1` more public proxies, instead of the left end, which the sender controls. Link preloads (`Next-Router-Prefetch` / `Sec-Purpose: prefetch`) count against their own allowance of 300 a minute, so the per-link `prefetch={false}` workaround was removed. The local-address exemption applies outside production only.
- **Publish after import** publishes only rows the import created or changed (an unchanged row no longer republishes a draft), and a failure while publishing is recorded on the batch instead of leaving it stuck.
- **Check and publish** reuses `transitionProblem`, and a save that already queues a judge check carries the publish request (no second check).
- **Cache refresh:** every admin action calls one `refreshPublicPages()` (all public tags), which also fixes problem publishes not refreshing company pages. Question sitemaps are cached like the other public reads.

## D-059: Job alerts and All-India mock reminders
- Date: 2026-10-29
- Status: Accepted
- Decision:
  - **Job alerts are a daily digest**, not a message per job: at 18:00 IST, each student gets one message listing up to 10 jobs published since the previous digest that match them. Freshers match when the audience fits and nothing in their profile fails the eligibility rules (missing details don't exclude anyone). Experienced candidates match on audience and years of experience. Closed jobs and jobs past their apply-by date are left out.
  - The digest is a `jobs.digest` job that queues the next one when it finishes, covering the time since its own run, so nothing is missed or sent twice. The worker starts the chain at startup when none is queued.
  - **Contest reminders:** publishing an All-India mock queues `contest.reminder` 24 h before the start (right away if that's past; none if it starts within the hour). It's skipped if the contest is unpublished or moved.
  - **Opt-out:** `users.alerts_opt_in` (default on), toggled on the account page. `notify()` skips alert templates for students who turned them off. Messages go to the outbox until real email and WhatsApp are connected.

## D-060: Readiness counts coding, weighted by test time
- Date: 2026-10-29
- Status: Accepted (supersedes D-032's MCQ-only readiness)
- Context: readiness used MCQ sections only, weighted by question count, so coding practice never moved it although coding submissions already build DSA topic mastery.
- Decision: every test section counts, MCQ and coding. Each section's **minutes** are shared by its topics (not its question count), so a 40-minute coding section with 2 problems weighs as much as a 40-minute aptitude section with 30 questions. MCQ-only companies keep nearly the same scores, because their sections' time is usually proportional to their questions.

## D-061: Content packs (ZIP of a content folder)
- Date: 2026-10-29
- Status: Accepted
- Decision: admin › Imports takes a ZIP of a whole content folder (the layout in `folder.ts`, max 25 MB, 500 files). A `content_packs` row records it, and a `pack.import` job imports the files one by one in dependency order through the normal pipeline. Each file is an ordinary import batch (`import_batches.pack_id`), so previews, failed rows and undo work as usual. The job runs each file's validate, confirm and commit steps itself instead of queueing them, so the next file sees the previous one committed and no other worker runs the same step. A single top-level folder in the ZIP is ignored, as is Mac metadata. Files outside the layout are listed, not imported. "Publish after import" applies to every file. `npm run content:import` uses the same per-file function.
