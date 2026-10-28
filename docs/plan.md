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
| 6.10 | Load test: concurrent test-takers and judge throughput | ⬜ |
| 6.11 | SEO: sitemap, robots, structured data, Open Graph images, performance budget | ⬜ |
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
| 7.7 | Job alerts by eligibility; contest reminders | ⬜ |

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
| A.7 | ZIP "content pack" upload in admin (all files, imported in order) | ⬜ |

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

## After launch (not scheduled)

College leaderboards and ambassadors, AI resume–JD match, AI mock interviews, college (TPO) dashboards, Hindi explanations, mobile app.
