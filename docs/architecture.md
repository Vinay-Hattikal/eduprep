# Architecture

The technical design of EduPrep. The reasons behind each choice are in [decisions.md](decisions.md). If the code and this file disagree, fix one of them in the same change.

---

## 1. Stack

| Layer | Choice | Decision |
|---|---|---|
| App (UI + API) | Next.js (App Router) + TypeScript, one app | D-001 |
| UI | Tailwind CSS + shadcn/ui, mobile-first | D-002 |
| Database | PostgreSQL | D-003 |
| ORM | Prisma | D-003 |
| Validation | Zod at every boundary (forms, API, imports, env) | D-004 |
| Auth | Dev login until Phase 6, then Better Auth: Google + phone OTP (MSG91) | D-005, D-020 |
| Code judge | Judge0, self-hosted on a separate server | D-006 |
| Editor | Monaco | D-006 |
| Jobs / queue | Redis + BullMQ, separate worker process | D-007 |
| File storage | Cloudflare R2 (S3-compatible API) | D-008 |
| Payments | `PaymentProvider` interface: mock provider until Phase 6, then Razorpay (+ Route for payouts) | D-011, D-020 |
| Interviews | Google Calendar API (events with Meet links) | D-012 |
| Email | Resend | D-013 |
| WhatsApp (Phase 6; dev console until then) | Meta WhatsApp Cloud API or a BSP (Interakt/Gupshup) | D-013 |
| Analytics / errors | PostHog / Sentry | D-015 |
| Tests | Vitest (unit/integration), Playwright (end-to-end) | D-016 |
| CI | GitHub Actions | D-016 |
| Hosting | Local only until Phase 6 (embedded PostgreSQL, no Docker), then decided | D-022, D-027 |
| Brand | Product name and links from `src/config/site.ts` | D-021 |
| Design | Tokens, themes, components per [design-system.md](design-system.md) | D-023 |

Before writing framework code, read the docs for the **installed** versions of Next.js, Prisma and Better Auth (in `node_modules` or the official docs for that version). APIs change between major versions.

## 2. System diagram

```
        Students · Interviewers · Admins (browser, mobile-first)
                              │
                   ┌──────────▼──────────┐
                   │   Next.js app       │  pages (SSR for SEO), server actions,
                   │   (web + API)       │  route handlers, webhooks
                   └──┬───────┬───────┬──┘
                      │       │       │
             PostgreSQL     Redis   Cloudflare R2
                      │       │       (images, test files, uploads, resumes)
                      │  ┌────▼─────────────┐
                      │  │ Worker (BullMQ)  │  imports, judge callbacks, reminders,
                      │  │                  │  auto-submit, emails, payouts
                      │  └────┬─────────────┘
                      │       │
     ┌────────────────┼───────┼──────────────────────┐
     │ Judge0 server (separate VM, runs untrusted code)│
     └─────────────────────────────────────────────────┘
     External: Razorpay · Google Calendar API · MSG91 · Resend · WhatsApp · PostHog · Sentry
```

## 3. Folder structure

Paths marked *(later)* don't exist yet.

```
eduprep/
├── AGENTS.md / CLAUDE.md     entry point for AI agents
├── README.md                 how to run
├── docs/                     product and engineering docs (this folder)
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts               fictional user per role + default settings
├── prisma.config.ts          Prisma 7 config (schema, migrations, seed, datasource URL)
├── scripts/
│   ├── with-db.mjs           runs a command with local embedded PostgreSQL (D-027)
│   ├── db-stop.mjs           stops a local PostgreSQL left running
│   └── check-brand.mjs       fails if the product name is hard-coded (D-021)
├── src/
│   ├── proxy.ts              optimistic sign-in redirect for protected areas (not authorization)
│   ├── app/
│   │   ├── (public)/         landing; later company pages, pricing (SSR, SEO)
│   │   ├── (auth)/           dev login + auth server actions; onboarding (later)
│   │   ├── (student)/        dashboard, practice, tests, coding, interviews, progress
│   │   ├── interviewer/      interviewer portal
│   │   ├── admin/            admin panel (overview, settings, users, audit log, content…)
│   │   ├── access-denied/    where permission failures redirect
│   │   └── api/              webhooks (razorpay, judge0), route handlers (later)
│   ├── config/
│   │   ├── site.ts           product name, tagline, URLs (the ONLY place the name appears)
│   │   └── navigation.ts     nav items per area, with the permission each needs
│   ├── components/
│   │   ├── ui/               shadcn components (owned by us)
│   │   ├── layout/           app shell, sidebar/drawer/bottom nav, user menu, access gate
│   │   ├── shared/           page header, empty/error/loading states, data table, form field, markdown
│   │   └── brand/            logo
│   ├── generated/prisma/     generated Prisma client (git-ignored; `npm install` regenerates it)
│   ├── server/               server-only code
│   │   ├── env.ts            validated environment (Zod)
│   │   ├── db.ts             Prisma client
│   │   ├── auth/             getCurrentUser / requirePermission / sessions; Better Auth in Phase 6
│   │   ├── services/         business logic by domain (questions, companies, taxonomy, settings, audit…)
│   │   ├── imports/          CSV/XLSX/ZIP import pipeline; one importer per file type in definitions/
│   │   ├── jobs/             PostgreSQL job queue (enqueue, claim with SKIP LOCKED, retry) and runner
│   │   └── integrations/     one folder per provider behind an interface: storage (local disk now);
│   │                         later payments, judge, meetings, email, sms, each with a mock/dev
│   │                         mock/dev implementation: payments, judge, meetings, email, sms, storage
│   ├── lib/                  pure helpers usable on client and server (permissions, format, utils)
│   │   ├── content/          question rules, workflow, assets, company helpers
│   │   └── learning/         grading, mastery, readiness, eligibility, streaks, IST days
│   ├── hooks/                client hooks (useFormSubmit)
│   ├── schemas/              Zod schemas for admin forms (question, company)
│   └── worker/               background worker process (`npm run worker`)
├── tests/unit/               Vitest unit tests (no database)
├── tests/integration/        Vitest against a real *_test database (`npm run test:integration`)
└── e2e/                      Playwright tests (desktop + 360 px phone)
```

Rules for this structure:
- Business logic lives in `src/server/services/`. Pages, server actions and route handlers stay thin and call services.
- Third-party APIs are called only from `src/server/integrations/`, so they can be mocked in tests.
- `src/server/**` must never be imported by client components (use the `server-only` package). `env.ts` and `auth/session-token.ts` skip `server-only` only because `proxy.ts` imports them.
- **Cache Components (Next 16):** anything that reads cookies, the session or the database renders inside `<Suspense>`. Layout-level access gates are for UX; every page and action that touches protected data calls `requirePermission()` itself.

## 4. Data model (main tables)

Names are indicative; `prisma/schema.prisma` is the source of truth once it exists.

### Users and access
| Table | Purpose / key fields |
|---|---|
| `User` | name, phone, email, role(s), profileType (FRESHER / EXPERIENCED), onboardedAt |
| `FresherProfile` | college, degree, branch, gradYear, cgpaBand, hasBacklogs |
| `ExperiencedProfile` | currentRole, yearsExp, currentCompany, techStack[], targetRoles[] |
| `Goal` | userId, companyId, targetDate |
| `Entitlement` | userId, product (PRO / COMPANY_PACK / …), companyId?, startsAt, endsAt, sourcePaymentId |
| `InterviewCredit` | userId, interviewTypeId, status (AVAILABLE / USED / REFUNDED) |

### Taxonomy and companies
| Table | Purpose |
|---|---|
| `Subject`, `Topic`, `Subtopic` | Concept tree with permanent slugs (topic slugs unique across subjects). Everything links here. |
| `Company` | slug, name, level (FULL / STANDARD / GENERIC), overview, ctc, eligibility (JSON), seo, lastVerifiedAt, status |
| `CompanyRound` | companyId, order, name, type, platform, durationMin, isElimination |
| `CompanySection` | roundId, order, name, type (MCQ / CODING), questionCount, minutes, negativeMarks, canGoBack, topicIds[] |
| `CompanySource` | companyId, label, url, checkedOn |
| `CompanyTopicWeight` | companyId, topicId, weight (derived from sections; used for readiness) |
| `CompanyRequest` | userId, companyName |

### Content
| Table | Purpose |
|---|---|
| `Question` | externalId (unique), type, text, options (JSON), correct, tolerance, explanation, topic refs, difficulty, expectedTimeSec, source, status, version, passageId |
| `CompanyItem` | companyId, itemType (MCQ / CODING), questionId or problemId, roundOrder, askedIn[], reportCount. Lets one item be reused by many companies. |
| `Passage` | externalId, title, body |
| `Problem` | externalId, slug, title, statement, editorial, hints[], limits, scoring, checker, status, version |
| `ProblemTestCase` | problemId, order, isSample, inputKey, outputKey (R2 keys) |
| `ProblemTopic`, `ProblemSolution` | topic links; reference / brute / starter code per language |
| `ContentVersion` | snapshots of edits for history |
| `ImportBatch` | type, fileKey, uploadedBy, status, counts, errorReportKey |

### Practice, tests and coding
| Table | Purpose |
|---|---|
| `Attempt` | userId, questionId, sittingId?, answer, isCorrect, timeSec |
| `Bookmark` | userId, questionId |
| `Mastery` | userId, topicId, score 0–100 |
| `TestBlueprint` | name, companyId?, kind (TOPIC / COMPANY_MOCK / OA / WEEKLY), platformStyle, sections (JSON), rules |
| `TestSitting` | userId, blueprintId, questionIds (frozen draw), startedAt, endsAt, submittedAt, answers (JSON), score, sectionScores, tabSwitches |
| `Submission` | userId, problemId, sittingId?, language, code, verdict, testsPassed, runtimeMs, memoryKb |

### Interviews
| Table | Purpose |
|---|---|
| `Interviewer` | userId, status (APPLIED / APPROVED / SUSPENDED), company, yearsExp, bio, linkedin, types[], rating, payoutAccountId |
| `InterviewType` | name, audience, durationMin, price, rubric (JSON) |
| `AvailabilityRule` / `AvailabilityException` | weekly slots and blocked dates |
| `Booking` | candidateId, interviewerId, typeId, companyId?, startsAt, endsAt, status, calendarEventId, meetUrl, paymentId/creditId |
| `Scorecard` | bookingId, scores (JSON), strengths, improvements, recommendation, submittedAt |
| `InterviewerRating` | bookingId, stars, comment |
| `Payout` | interviewerId, bookingIds[], amountPaise, status, razorpayTransferId |

### Commerce, community and ops
| Table | Purpose |
|---|---|
| `Product` / `Price` | sellable items. Prices in paise. |
| `Order` / `Payment` | razorpayOrderId, razorpayPaymentId, amountPaise, status, invoiceNo |
| `Coupon`, `Referral` | discounts |
| `Experience` | interview experiences with moderation status |
| `Drive` | company, role, eligibility, lastDate, link, status |
| `ErrorReport` | questionId/problemId, userId, message, status, reply |
| `Notification` | userId, channel, template, status |
| `Setting` | key/value config (prices, limits, commission) |
| `AuditLog` | actorId, action, entity, entityId, before/after, at |

## 5. Key flows

### 5.1 Mock test sitting (Phase 4, D-036)
1. Start (`startSitting`): the server draws items per blueprint rule into `SittingItem` rows, snapshots the section settings in `TestSitting.sections`, sets `endsAt` (latest possible end) and queues `test.autosubmit` for then.
2. The exam screen (`/exam/[id]`, no app navigation) saves every change at once (`saveItem`), plus time per question. The server checks the section is open (`sittingClock` + 15 s grace) and rejects anything else. Sequential sections advance on the timer or when the student finishes one early.
3. The server clock is the truth; the browser shows it corrected for skew and reloads its state when a section ends.
4. Submit, auto-submit, or opening an expired sitting, calls `finishSitting`: scored once on the server; answered MCQs are recorded as `TEST` attempts (mastery, mistakes, streak). Correct answers reach the browser only on the result page.

### 5.2 Code submission (Phase 4, D-033)
1. `createSubmission` checks access, language, size, the free limit and rate limits, stores a PENDING `Submission` and queues `code.judge`.
2. The worker compiles once and runs the tests through the `Judge` interface (local toolchains in development, Judge0 in production). Run = samples or custom input; Submit = every test, stopping at the first failure for all-or-nothing problems.
3. The browser polls `getSubmission` until there is a verdict. Results for hidden tests carry only the verdict and time, never input or output.
4. A practice Submit updates `ProblemProgress`; the first accepted one also raises DSA topic mastery and counts for the streak. Inside a test, the best submission's score gives the item's marks.
5. `problem.validate` runs every reference and brute solution against every test after imports and edits (D-034).

### 5.3 Payment (Phase 5 mock provider, D-040)
1. The pricing page links to `/checkout?kind=…&ref=…`; the server quotes the price (settings, bundle, coupon or referral). Nothing from the client is trusted.
2. `createOrder` stores the `Order` (CREATED) and registers it with the `PaymentProvider`; the buyer goes to the provider's checkout (Phase 5: the test payment page).
3. **Only the verified webhook** (`/api/payments/webhook/[provider]`, or the mock bank calling the same handler) marks the order PAID, takes the next invoice number and creates the `Entitlement` or `InterviewCredit`s, in one transaction.
4. Webhook handling is idempotent: every event is stored once (`PaymentEvent`), the amount must match, and the order is claimed with a conditional update. Refunds revoke what the order granted.

### 5.4 Interview booking (Phase 5, D-039, D-041)
1. The candidate picks a type, an interviewer and a slot computed by the slot engine (IST). `holdSlot` locks the interviewer row, re-checks the slot and creates a HELD booking for 10 minutes; the `bookings_no_overlap` constraint backs this up.
2. The candidate uses a credit (`confirmWithCredit`) or pays for one (`payForBooking`: an order linked to the booking; the payment webhook applies the new credit). The booking becomes CONFIRMED.
3. The worker (`booking.meeting`) creates the meeting (Google Calendar + Meet, or the mock room), stores `meetingId` and `meetUrl`, emails both people and schedules reminders (24 h, 1 h) and the overdue-scorecard check.
4. After the start, the interviewer submits the scorecard (rubric per type): the booking becomes COMPLETED, the earning goes to the ledger and the candidate is told. The candidate rates the interviewer.
5. Changes: candidates move or cancel inside the free window; ops cancel with a refund to credit or record an interviewer no-show (credit back, penalty). Ops record payouts against the ledger.

### 5.5 Content import (Phase 2)
1. An admin uploads a file; the server action stores it (`Storage`), creates an `ImportBatch` and enqueues `import.validate`.
2. The worker parses and validates every row, stores per-row results in `ImportRow`, and sets the batch to `PREVIEW_READY`. The page refreshes itself while this runs.
3. The admin confirms; `import.commit` re-validates and writes rows in transactions of 500, recording `ContentVersion` snapshots and the previous state for rollback.
4. Details and rules: [data-import.md](data-import.md) section 6.

### 5.6 Background jobs
- `enqueueJob(type, payload)` inserts into `jobs`. The worker loop claims one due job at a time with `FOR UPDATE SKIP LOCKED`, runs its handler, and marks it done, or schedules a retry with exponential backoff, or fails it after `maxAttempts`.
- Jobs left RUNNING for 15 minutes (crashed worker) are requeued.
- Handlers must be idempotent: a job may run more than once.
- Job types: `import.validate`, `import.commit`, `code.judge`, `problem.validate`, `test.autosubmit`. Admins see queues, judge verdicts and failed jobs (with retry) on `/admin/jobs`.
- Phase 6 replaces the table with BullMQ + Redis behind the same `enqueueJob()` (D-029).

### 5.7 Practice (Phase 3)
1. The session page picks the first question on the server (`nextQuestion`): unattempted first, easy to hard, filtered by subject, topic, company, mistakes, bookmarks or recently asked. The student version of a question never includes the answer or explanation.
2. The player submits with `submitAnswerAction`. The server grades it, enforces the free daily limit, and in one transaction writes the `Attempt`, updates `Mastery`, opens or resolves the `Mistake`, and updates `UserStats` (streak and totals).
3. The response carries the correct answer, the explanation and the mastery change; the next question comes from `nextQuestionAction`, excluding those already shown in this session.
4. Dashboard and progress read from `UserStats`, `Mastery` and day-grouped attempts. Readiness weights mastery by the target company's test sections.

## 6. Security checklist
- Session plus role check in every server action and route handler, through helpers in `permissions.ts`.
- Entitlement check on the server for every paid resource.
- Rate limits (Redis) on OTP send/verify, login, code run/submit, imports.
- Razorpay and Judge0 webhook signatures and secrets verified.
- Judge0 reachable only from the app and worker (firewall, auth token).
- Secrets only in environment variables, validated at startup with Zod.
- File uploads: type and size checked, stored in R2 with private access, served by signed URLs.
- Personal data access recorded in the audit log for support and admin roles.

## 7. Environments
| Env | Purpose |
|---|---|
| local | Embedded PostgreSQL started by `scripts/with-db.mjs` on port 5444 (no Docker, D-027). Redis and Judge0 planned per phase. Dev login, mock payment and meeting providers. |
| staging | Same as production with test keys (Razorpay test mode). |
| production | Live keys, backups, monitoring. |
