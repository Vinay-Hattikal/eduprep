# Implementation Plan: 6 Phases

The build order for EduPrep. This file holds the **task list and status**. [progress.md](progress.md) holds the current focus, session log and known issues.

Status key: ⬜ not started · 🟡 in progress · ✅ done · ⛔ blocked

---

## Strategy

1. **Build the full product first, plug in external services last.** Real sign-in (Google, phone OTP), Razorpay, production email/WhatsApp and hosting come in Phase 6 (D-020, D-022). Until then:
   - **Auth:** a dev login lets you pick a seeded user (student, interviewer, each admin role). All code goes through one `auth` module (`getSession`, `requireRole`), so Phase 6 swaps the internals only.
   - **Payments:** products, orders, coupons and entitlements are real from Phase 5, behind a `PaymentProvider` interface. A mock provider simulates success or failure.
   - **Email/WhatsApp:** a `notifications` service with a dev transport (console or a local mail catcher, decided in Phase 5).
   - **Hosting:** everything runs locally. No Docker or Redis until Phase 6 (D-027, D-029): PostgreSQL comes from the `embedded-postgres` npm package, background jobs use a PostgreSQL-backed queue, and Judge0 gets a plan when Phase 4 starts.
2. **Content engine before student screens.** Admins can import all subjects from CSV before the student side exists, so real content drives the UI from Phase 3.
3. **Production quality from day one:** strict TypeScript, tests, design system, accessibility, server-side permission checks. "Later" never comes for quality.
4. **Every phase ends with a demo** that you can run locally and check against the exit criteria.

Rough timeline with one developer plus AI agents: about 20–24 weeks in total. Each phase lists an estimate.

---

## Phase 1: Foundation and design system (≈ 2 weeks)

**Goal:** a production-grade skeleton: the app runs, looks like the final product, has roles, and every later feature has a clear place to go.

| # | Task | Status |
|---|---|---|
| 1.1 | Scaffold Next.js (App Router) + TypeScript (strict) + Tailwind + shadcn/ui; folder structure per architecture.md | ✅ |
| 1.2 | Tooling: ESLint, Prettier, Vitest, Playwright, Husky + lint-staged, GitHub Actions CI (lint, type-check, test, build) | ✅ |
| 1.3 | Local database without Docker (D-027): embedded PostgreSQL via `scripts/with-db.mjs`, `db:*` npm scripts. Redis/Mailpit deferred to the phases that need them | ✅ |
| 1.4 | Validated `env` module (Zod) + `.env.example` | ✅ |
| 1.5 | Brand config `src/config/site.ts`; no product name hard-coded anywhere else (D-021); `scripts/check-brand.mjs` enforces it | ✅ |
| 1.6 | Design tokens in `globals.css` (light/dark, status, product tokens), fonts, theme toggle (design-system.md) | ✅ |
| 1.7 | App shells: public layout (header, footer), student layout (sidebar/bottom nav), admin layout, interviewer layout; responsive at 360 px | ✅ |
| 1.8 | Prisma setup + base schema: users, roles, profiles, settings, audit log | ✅ |
| 1.9 | Dev auth: seeded users, dev login page, signed session cookie; `getCurrentUser` / `requirePermission`; refuses to run in production (D-020) | ✅ |
| 1.10 | `permissions.ts`: role checks, route guards for admin and interviewer areas | ✅ |
| 1.11 | Audit log helper used by all admin actions; audit log viewer | ✅ |
| 1.12 | Settings table + seed with launch prices and free limits (D-026); admin settings page | ✅ |
| 1.13 | Shared UI kit: page header, data table, empty/error/loading states, form fields, Markdown + KaTeX + code renderer | ✅ |
| 1.14 | Landing page v1 (hero, features, CTA) using the design system | ✅ |

**Status: done (2026-10-19).** **Exit criteria:** `npm run dev` starts everything. Dev login works for every role and each lands in the right area. CI is green. Pages pass a 360 px check and a dark mode check.

---

## Phase 2: Content engine (≈ 3–4 weeks)

**Goal:** admins can load the entire launch content library (all subjects, companies, mappings) from CSV and manage it through review.

| # | Task | Status |
|---|---|---|
| 2.1 | Schema: taxonomy, questions, passages, companies, rounds, sections, sources, company-item map, import batches, content versions | ✅ |
| 2.2 | Object storage abstraction (local folder in dev, R2 later) for uploads and images | ✅ |
| 2.3 | Import framework: upload → parse (CSV/XLSX/ZIP) → Zod validate → resolve refs → preview → confirm → batch report → failed-rows CSV (data-import.md) | ✅ |
| 2.4 | Background worker: PostgreSQL job queue (SKIP LOCKED, retries with backoff, crash recovery), `npm run worker` (D-029) | ✅ |
| 2.5 | Importers: taxonomy, passages | ✅ |
| 2.6 | Importer: MCQs (standard format, all subject files, images via ZIP) with upsert by `external_id` and duplicate warnings | ✅ |
| 2.7 | Importers: companies, rounds, sections, sources, company-question map | ✅ |
| 2.8 | Import history page + rollback of draft batches | ✅ |
| 2.9 | Admin: taxonomy manager (tree view, reorder, rename) | ✅ |
| 2.10 | Admin: question bank (search, filters, bulk actions), MCQ form editor with live preview, version history | ✅ |
| 2.11 | Review workflow: Draft → In review → Published → Archived; automatic checks; reviewer queue | ✅ |
| 2.12 | Admin: company editor (profile, rounds, sections, sources, mapped questions, last verified) | ✅ |
| 2.13 | Admin dashboard: queues and counts | ✅ |
| 2.14 | Sample content loaded from `docs/templates` for development (`npm run content:sample`) | ✅ |

**Status: done (2026-10-19).** **Exit criteria:** every template file imports cleanly. A broken file shows clear per-row errors. Re-upload updates without duplicates. A question goes from draft to published through review. Unit tests cover every validator.

---

## Phase 3: Student learning experience (≈ 3–4 weeks)

**Goal:** a student can explore companies, practise any subject and see their progress. This is the core daily-use product.

| # | Task | Status |
|---|---|---|
| 3.1 | Onboarding: fresher / experienced profile, target companies with dates, preferred language | ✅ |
| 3.2 | Public company pages (SSR, SEO metadata, structured data, sitemap): overview, rounds, sections, eligibility, recent questions, sources, last verified | ✅ |
| 3.3 | Companies directory with search and filters (category, hiring for, level); "request a company" | ✅ |
| 3.4 | Eligibility check on company pages using the student's profile | ✅ |
| 3.5 | Practice: browse subject → topic → subtopic, or by company; filters (difficulty, recent, unattempted, wrong) | ✅ |
| 3.6 | Practice player: all question types, code snippets, passages, timer, instant feedback, explanation, keyboard shortcuts | ✅ |
| 3.7 | Bookmarks, mistakes list (retry mode), report an error | ✅ |
| 3.8 | Admin: error report moderation with reply to the student | ✅ |
| 3.9 | Mastery per topic (updated from attempts) | ✅ |
| 3.10 | Readiness score per target company (weighted by company sections) | ✅ |
| 3.11 | Student dashboard: readiness rings, suggested next actions, streak, recent activity | ✅ |
| 3.12 | Progress page: topic mastery, accuracy and speed trends | ✅ |
| 3.13 | Free-tier daily limits enforced on the server (from settings) | ✅ |
| 3.14 | Question of the day + daily streak | ✅ |

**Status: done (2026-10-19).** **Exit criteria:** a new student onboards, opens a company page, practises 20 questions across subjects, and sees mastery and readiness update. Lighthouse mobile performance ≥ 90 on company pages. E2E tests cover onboarding and practice.

---

## Phase 4: Mock tests and coding platform (≈ 5–6 weeks)

**Goal:** realistic company mock tests and a full coding platform with a judge. This is the main differentiator.

**4A: Mock tests and exam simulator**

| # | Task | Status |
|---|---|---|
| 4.1 | Schema + admin: test blueprints (sections, timers, topic/difficulty mix, negative marking, navigation rules, platform style); "generate from company sections" | ✅ |
| 4.2 | Blueprint publish check: enough published questions per section | ✅ |
| 4.3 | Test engine: frozen question draw, server timer, autosave, resume after refresh, auto-submit job | ✅ |
| 4.4 | Exam-simulator UI: palette with states, mark for review, section locking, no-going-back rules, full-screen, tab-switch count | ✅ |
| 4.5 | Platform styles: TCS iON-like, HackerRank-like, AMCAT-like, generic | ✅ |
| 4.6 | Server-side scoring with negative marking | ✅ |
| 4.7 | Result page: score, sections, time per question, solutions, weak topics, percentile, "practise weak topics" | ✅ |
| 4.8 | Topic tests (short) and full company mocks; test history | ✅ |

**4B: Coding platform**

| # | Task | Status |
|---|---|---|
| 4.9 | Judge integration: local judge for dev/tests with real toolchains, Judge0 driver for production (D-033). Hosting Judge0 is task 6.15 | ✅ |
| 4.10 | Schema: problems, test cases, solutions, submissions | ✅ |
| 4.11 | Importers: coding problems, test cases, solutions (CSV) + ZIP package; reference/brute validation in the judge | ✅ |
| 4.12 | Admin: problem editor, test case manager, "validate in judge" button | ✅ |
| 4.13 | Problem list with filters (topic, difficulty, company, status) | ✅ |
| 4.14 | Coding workspace: CodeMirror 6 (D-035), language switch, starter code, run with custom input, submit, verdicts, per-test results for samples | ✅ |
| 4.15 | Hints, editorial unlock, submission history | ✅ |
| 4.16 | OA simulator: timed multi-problem rounds, partial scoring; coding sections inside company mocks | ✅ |
| 4.17 | Rate limits on run/submit; judge queue monitoring in admin | ✅ |
| 4.18 | Content analytics: per-question accuracy, time, option distribution, auto-flags | ✅ |
| 4.19 | Charts decision recorded (D-038: hand-built SVG); analytics visuals | ✅ |

**Exit criteria:** a student takes a full company mock with sections, timers and negative marking, survives a refresh, and gets a full result. A student solves a coding problem in each language and gets correct verdicts. Hidden tests and answers never reach the browser (verified by a test).

---

## Phase 5: Mock interviews, experienced track and monetization (≈ 4–5 weeks)

**Goal:** the revenue features work end to end with mock payment and notification providers.

| # | Task | Status |
|---|---|---|
| 5.1 | Schema: interviewers, interview types, availability, bookings, scorecards, ratings, payouts | ✅ |
| 5.2 | Interviewer application and admin approval | ✅ |
| 5.3 | Interviewer portal: weekly availability, blocked dates, upcoming interviews, candidate summary, earnings | ✅ |
| 5.4 | Slot engine (time zones, buffers, holds to prevent double booking) | ✅ |
| 5.5 | Booking flow: type → interviewer → slot → pay or use credit → confirmation | ✅ |
| 5.6 | Meeting provider interface: Google Calendar + Meet (real, if credentials are set) or mock link; reschedule and cancel | ✅ |
| 5.7 | Scorecards with rubric per type; candidate report view; candidate rates interviewer | ✅ |
| 5.8 | Policies: reschedule window, no-shows, refunds into credits; overdue scorecard reminders | ✅ |
| 5.9 | Payout ledger (amounts owed per interviewer; real transfers in Phase 6) | ✅ |
| 5.10 | Admin: interview operations (bookings, disputes, interviewer quality) | ✅ |
| 5.11 | Commerce: products, prices, orders, coupons, referral codes, entitlements (company pack, Pro, interview credits) | ✅ |
| 5.12 | `PaymentProvider` interface + mock provider (simulate success/failure/refund) | ✅ |
| 5.13 | Pricing page, checkout UI, account page (purchases, expiry, invoices) | ✅ |
| 5.14 | Paywall checks on the server across practice, tests, coding, interviews | ✅ |
| 5.15 | Notifications service: templates for welcome, booking, reminders, scorecard, purchase; dev transports | ✅ |
| 5.16 | Experienced track: role tracks, system design / LLD question bank (CSV format added to data-import.md) | ✅ |
| 5.17 | Interview experiences: submit, moderate, show on company pages with filters | ✅ |
| 5.18 | Admin: users (search, profile, purchases, grant access, refunds) | ✅ |

**Exit criteria:** with the mock provider, a candidate buys a credit, books an interviewer, both see the booking with a meeting link, the interviewer submits a scorecard, and the candidate sees it. Packs and Pro unlock exactly the right content. Notification emails appear in the dev mail transport.

---

## Phase 6: Production integrations, hardening and launch (≈ 3–4 weeks)

**Goal:** swap mocks for real services, harden, deploy and launch.

| # | Task | Status |
|---|---|---|
| 6.1 | Real accounts: email + password with verified email, phone OTP (MSG91 driver), password reset, revocable sessions, rate limits (D-043). Google sign-in later | ✅ |
| 6.2 | Razorpay provider: orders, checkout, verified webhooks, refunds, GST invoices | 🟡 |
| 6.3 | Razorpay Route payouts for interviewers | ⬜ |
| 6.4 | Production email (Resend) and WhatsApp (Cloud API / BSP) with approved templates | 🟡 |
| 6.5 | Google Workspace setup for Meet links in production | 🟡 |
| 6.6 | Hosting decision (D-022) and setup: app, database, Redis, Judge0 VM, worker, R2, domains, SSL | 🟡 |
| 6.7 | Staging environment + deployment pipeline from CI | ⬜ |
| 6.8 | Sentry, PostHog (events and funnels), uptime monitoring, backups with a tested restore | ⬜ |
| 6.9 | Security review: OWASP checklist, rate limits, webhook verification, access audit, dependency scan | 🟡 |
| 6.10 | Load test: concurrent test-takers and judge throughput (D-065; re-run on production hardware before launch) | ✅ |
| 6.11 | SEO: sitemap, robots, structured data (D-058), Open Graph images and performance budget (D-062) | ✅ |
| 6.12 | Legal pages: terms, privacy (DPDP), refund policy, interviewer agreement | 🟡 |
| 6.13 | Production content load and final review of all live content | ⬜ |
| 6.14 | Closed beta with students and interviewers; fix list | ⬜ |
| 6.15 | Docker: images for app, worker and Judge0; docker-compose for local development and production (owner: Docker at the end) | 🟡 |
| 6.16 | Redis + BullMQ deliver jobs; the PostgreSQL table stays the record (D-046) | 🟡 |
| 6.17 | Public launch | ⬜ |

Legend: ✅ done · 🟡 built and tested with development drivers, waiting for real keys or a hosting choice (docs/deployment.md) · ⬜ not started.

**Exit criteria:** real users sign in with email or phone OTP, pay with Razorpay (test mode, then live), book a real Meet interview, and receive emails and WhatsApp messages. Monitoring and backups are in place. The beta fix list is closed.

---

## Phase 7: Engagement and growth

**Goal:** reasons to come back every day and every week, and free sharing. Built before launch at the owner's request.

| # | Task | Status |
|---|---|---|
| 7.1 | Jobs board: admin postings, public list and detail pages with filters, save, apply on the employer's site (counted), eligibility, Google for Jobs data (D-050) | ✅ |
| 7.2 | Weekly All-India mock tests: frozen question set, one attempt, live leaderboard and percentile, answers hidden until final, results job with notifications (D-049) | ✅ |
| 7.3 | "Asked today" drive reports with moderation, shown on company pages (D-051) | ✅ |
| 7.4 | Moderated question discussions: replies, upvotes, flags, auto-hide, moderation queue, posting blocks (D-048) | ✅ |
| 7.5 | Share cards for results, ranks and badges with generated images, WhatsApp and LinkedIn (D-053) | ✅ |
| 7.6 | Badges and streak freezes, achievements page (D-052) | ✅ |
| 7.7 | Job alerts by eligibility (daily digest); contest reminders (D-059) | ✅ |

**Exit criteria:** met for 7.1–7.6: a student can find and apply to a job, take a weekly test and see their rank, report a drive, discuss a question, earn badges and freezes, and share them.

---

## Admin panel completion

**Goal:** everything that could only be imported can also be created and edited in the admin panel (D-055).

| # | Task | Status |
|---|---|---|
| A.1 | Coding problems: "New problem" form; edit topics, languages and source; add, replace and delete reference, brute and starter code | ✅ |
| A.2 | Design questions: create and edit; publish, unpublish, archive, restore | ✅ |
| A.3 | Role tracks: admin list, create, edit, hide and show | ✅ |
| A.4 | Interview types: create and edit, including the scorecard rubric; old scorecards keep their scores | ✅ |
| A.5 | Admin roles: super admins give and remove admin roles; the last super admin is protected | ✅ |
| A.6 | Passages: list, create, edit with preview, see linked questions, delete unused | ✅ |
| A.7 | ZIP "content pack" upload in admin (all files, imported in order, D-061) | ✅ |

**Exit criteria:** met for A.1–A.6: an admin can write a coding problem with its tests and code, pass the judge check and publish it without a CSV, and can create or edit design questions, role tracks, interview types and passages, and admin roles.

---

## Company-wise content entry (owner's plan, 2026-10-28)

**Goal:** one admin builds each company's content by hand from the company's page: profile, hiring process, MCQs, coding problems with tests and solutions, mocks (D-056, D-057).

| # | Task | Status |
|---|---|---|
| B.1 | One admin role; no review step; Save and publish in editors; Drafts page; Publish after import (D-056) | ✅ |
| B.2 | Hiring process (rounds, sections) and sources editors on the company page | ✅ |
| B.3 | Company tabs; MCQ tab with Add question (company pre-tagged), Save and add another, link existing, unlink; "Asked at" field in the question editor | ✅ |
| B.4 | Coding tab: add problem pre-tagged, link and unlink; "Asked at" in the problem editor; problem checklist | ✅ |
| B.5 | "+ New topic" from the question and problem editors | ✅ |

**Exit criteria:** met. An admin creates a company, adds its rounds, sections and sources, writes questions one after another from the company page (already tagged, next ID suggested), adds coding problems with tests and solutions, and publishes, all without a CSV (e2e `company-workspace`).

---

## Company workspace, part 2 (owner's plan, 2026-10-30, proposed D-067)

**Goal:** an admin picks or creates a company and fills in everything for it from one place: profile, hiring process, MCQs, coding problems with tests and solutions, interview questions and mocks. The admin can see at a glance what's missing and publish it all when ready. Builds on the company workspace (D-057). No new roles, no review step (D-056).

**Status:** approved 2026-10-30. Steps 1 and 2 are built (D-067); Step 3 is next.

### Step 1: see what's missing, finish coding problems in place, publish everything

| # | Task | Status |
|---|---|---|
| D.1 | Company checklist and progress panel | ✅ |
| D.2 | Question coverage per test section | ✅ |
| D.3 | Guided coding flow inside the workspace | ✅ |
| D.4 | "Publish everything" for a company | ✅ |
| D.5 | Next-step prompts after each save | ✅ |

**D.1 Checklist and progress panel.** A new first tab, **Overview**, and a progress bar ("6 of 9 done") under the company name on every tab.
- Checklist items, each with a ✓/✗, a short reason and a "Fix" link to the right tab:
  - Profile: overview written, level and category set, eligibility filled (or marked "none published").
  - Hiring process: at least one round; every test round has sections; every section has topics.
  - Sources: at least one source; last verified within `STALE_AFTER_MONTHS`.
  - MCQ questions: number linked, and how many are published / draft / failing the automatic checks.
  - Coding: number linked, and how many are published / waiting for the judge check / failing it.
  - Coverage: every section can be drawn (D.2).
  - Mock test: at least one company mock, and whether it's published.
  - Company itself published.
- One service, `companyReadiness(companyId)` in `src/server/services/company-readiness.ts`, runs grouped counts (about 6 queries, no per-item loops). It returns the items, so the panel, the companies list and the tests share it.
- The admin companies list's "Progress" column and "Not ready" filter moved to D.12, which needs the counts for many companies in one query.
- Tests: unit tests for the pure rules that turn counts into checklist items; an integration test for `companyReadiness` on a half-built company; e2e that a new company shows the checklist and that items turn ✓ as content is added.

**D.2 Question coverage per section.** On the Hiring process tab, each section shows "Percentages: 6 published / 7 needed" in red when short.
- "Needed" is worked out the same way "Create mock" splits the section's questions across its topics (`draftFromCompany`), so the warning matches what the mock test will need. The split is moved to a shared pure function so both use the same numbers.
- Counts published questions in each topic (all questions in the topic, which is what a mock draws from), and separately how many of those are tagged with this company.
- Each short topic links to "Add question" with the company, subject and topic already filled in.
- Coding sections count published problems in their topics the same way.
- Tests: unit tests for the split; integration test for the counts; the e2e from D.1 checks the red badge and the link.

**D.3 Guided coding flow.** Today "Add problem" from the Coding tab ends on the general problem page. It will instead show a step bar while the problem is opened from a company (`?company=<slug>`, kept on every link and redirect):
1. Problem (statement, formats, limits, topics; already tagged with the company)
2. Test cases (at least 1 sample and 5 hidden, the judge check's rule; counter shows progress)
3. Reference solution (and optional starter code)
4. Judge check (runs automatically after 2 and 3; the step shows running / passed / failed with the reason)
5. Publish (enabled once the check passes; "Publish when the check passes" is offered while it's running, which already exists as `publishBy`)
- After publishing: "Back to <company>" and "Add another problem for <company>" (opens a blank problem tagged with the company, like "Then add another" for MCQs).
- Test cases: a "Paste several" box (input and output blocks separated by a line with `---`) next to the single-test form, so 10 tests don't take 10 saves.
- No new tables; the existing problem page and forms get the step bar and the company context.
- Tests: e2e: from the Coding tab, create a problem, paste tests, add a reference solution, wait for the judge check, publish, land back on the company with the problem listed as published.

**D.4 Publish everything.** A button on the Overview tab: "Publish <company> and its content".
- First a confirmation listing what will happen: N draft questions, M problems with passed judge checks, the company mock, the company itself. It also lists what will stay draft and why (fails the automatic checks, no judge pass, no source).
- Uses the existing rules only: `publishQuestions` (D-064) for questions, `transitionProblem` for problems that passed the check, `transitionBlueprint` for the mock, `setCompanyStatus` for the company. Nothing gets published that the single buttons would refuse.
- Refreshes the public pages once at the end (`refreshPublicPages()`), audited as `company.publish_all` with the counts.
- Only content tagged with this company; questions shared with other companies are published too (publishing is global), which the confirmation says.
- Tests: integration test with a mix of ready and broken items (only the ready ones go live, the result lists the rest); e2e for the button.

**D.5 Next-step prompts.** After creating a company: "Next: add its rounds" (link to Hiring process). After the first round: "Next: add sources". After the hiring process is complete: "Next: add questions for <first short topic>". These are driven by the D.1 checklist (the first unfinished item), so they need no extra rules.

**Exit criteria (Step 1):** an admin creates a company, follows the prompts and the checklist to a fully ✓ company without leaving the workspace (including a coding problem with tests, solution and a passed judge check), and publishes it all with one button. e2e `company-workspace` covers it on desktop and at 360 px.

### Step 2: interview questions, import and copy for a company

| # | Task | Status |
|---|---|---|
| D.6 | Interview questions tab (design, technical and HR questions per round) | ✅ |
| D.7 | Import for this company | ✅ |
| D.8 | Copy the hiring pattern from another company | ✅ |
| D.9 | Passages from the workspace | ✅ |

**D.6 Interview questions tab.** Today system-design questions store their companies as a list of slugs (`design_questions.companies`), and interview rounds have no questions.
- **Data change:** `company_items` gets a third optional link, `design_question_id`, with the same "exactly one of" rule and a unique (company, design question). A migration copies every slug in `design_questions.companies` into `company_items` and then drops the column, so there's one way to say "this company asks it". The design-question import keeps its `companies` column and writes links instead.
- `company_items.round_order` (exists, unused in the editors) is shown and editable for every link, so a question can say "asked in round 3, Technical interview".
- New tab **Interview questions**, grouped by interview round (Technical, HR, Managerial, Group discussion), with "Add question" (opens the design-question editor tagged with the company and round), "Link existing" and "Unlink", like the MCQ and Coding tabs.
- HR and managerial questions: the design-question editor already has kinds; add an **HR** kind (prompt, what a good answer covers, follow-ups) if the existing kinds don't fit. To confirm with the owner before building.
- The public company page and the student design bank read the new links. The checklist (D.1) gets "Interview rounds have questions" for companies with interview rounds.
- Tests: migration test (slugs become links, nothing lost); integration for link/unlink and the public page; e2e for the tab.

**D.7 Import for this company.** An "Import" button on the MCQ, Coding and Interview tabs and on Overview.
- Opens the normal import page with the company preset: rows with an empty `companies` column are tagged with this company, and rows naming other companies keep them. Accepts single CSV/XLSX files and the content-pack ZIP (D-061).
- "Publish after import" is offered as today. After the import, the batch page links back to the company.
- Implemented as an import option (`defaultCompany`) passed through `createImportBatch` to the MCQ, coding and design definitions; validation still checks every row as now.
- Tests: integration (blank rows get the company, explicit ones are kept); e2e upload from the company page.

**D.8 Copy the hiring pattern.** On the Hiring process tab of a company with no rounds: "Copy from another company" with a company picker.
- Copies rounds, sections, section topics, eligibility and pay (each one optional by checkbox). Never copies sources (facts must be checked per company, D-019) or questions (they can be linked instead).
- The new rounds are ordinary drafts; the company stays draft.
- Tests: integration (deep copy, source not copied); e2e copy then edit one section.

**D.9 Passages from the workspace.** Reading-comprehension questions need a passage first. In the question editor opened from a company, "+ New passage" opens a small form (title, body) in place and fills the passage ID, like "+ New topic" (B.5). The MCQ tab groups questions that share a passage.
- Tests: e2e: create a passage and two questions on it from the company page.

**Exit criteria (Step 2):** a company's interview rounds have their questions in the workspace, a CSV for one company imports without typing the company on every row, a sister company starts from a copied pattern, and RC passages are added without leaving the company.

### Step 3: community content in context and previews

| # | Task | Status |
|---|---|---|
| D.10 | Community tab: experiences, drive reports, jobs for this company | ⬜ |
| D.11 | Preview links and "view as student" | ⬜ |
| D.12 | Companies list: sort and filter by progress, last verified, content counts | ⬜ |

**D.10 Community tab.** Read and moderate what students and employers add about this company without going to three admin pages:
- Interview experiences (pending / approved / rejected, approve or reject in place, same actions as admin › Experiences).
- "Asked in recent drives" reports (same actions as admin › Drive reports), with "Turn into a question" that opens the question editor prefilled with the report's text, tagged with the company and the drive month.
- Job postings for this company (open / closed, link to edit, "Post a job" prefilled).
- Counts on the tab label ("Community · 3 pending").
- Reuses the existing services and actions; only the lists are new.
- Tests: e2e approve a report from the tab and see it on the public company page.

**D.11 Preview links.** In the header: "View public page" (opens `/companies/<slug>`, or a draft preview for admins), "View as student" (the signed-in company page with readiness and eligibility, for the admin's own test profile), and "View mock" for the company mock.
- Draft preview: the public company page renders for admins when the company is a draft, with a "Draft: only admins see this" banner, and stays `noindex`.
- Tests: e2e: a draft company's page 404s for visitors and shows the banner for the admin.

**D.12 Companies list.** Sort by progress, last verified or name; filter Not ready / Stale / Draft / Published; columns for MCQs, coding, mocks and pending community items. Uses `companyReadiness` (D.1) in one grouped query for the page.

**Exit criteria (Step 3):** the companies list shows which companies need work and why; everything students send about a company is handled from its workspace; an admin can check a company exactly as a visitor or student will see it before publishing.

### Order and size

Step 1 first (D.1 → D.2 → D.3 → D.4 → D.5): it's what makes daily content entry faster. Step 2 needs one migration (D.6) and an owner decision on HR questions. Step 3 is independent and can come later. Each task ships on its own branch with tests and a decision note, as before.

---

## Public pages for search and preview (D-058)

**Goal:** search engines index the question bank and visitors can try the platform before signing up, without giving the whole bank away.

| # | Task | Status |
|---|---|---|
| C.1 | Sitemap: pricing, legal, become-interviewer, experience pages; company "last modified" follows its content | ✅ |
| C.2 | "Public sample" flag per question (editor, bulk), automatic first N per topic (setting) | ✅ |
| C.3 | Public topic pages and question pages (samples show answers; others ask to sign up), structured data, split sitemaps | ✅ |
| C.4 | Public coding problem statements and mock test landing pages | ✅ |
| C.5 | Company pages: sample questions and links to their topics; rate limits against scraping | ✅ |

**Exit criteria:** met. A visitor without an account can browse subjects, topics, questions (sample answers), coding problem statements, mock-test formats and company pages that link them together. Everything is in the sitemaps, answers to non-samples and hidden tests never reach the page, and bulk loading is slowed (e2e `public-questions`, `public-catalog`, `company-seo`).

---

## After launch (not scheduled)

College leaderboards and ambassadors, AI resume–JD match, AI mock interviews, college (TPO) dashboards, Hindi explanations, mobile app.
