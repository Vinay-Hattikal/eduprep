# Progress

Where the project stands right now. **Update at the end of every work session.**

- Task list and status for every phase: [plan.md](plan.md)
- This file: current focus, known issues, session log

Last updated: 2026-10-29 (public pages complete, D-058)

---

## Current focus

- **Phases 1–5 are done; Phase 6 integrations are built.** Real accounts work; Razorpay, Resend, MSG91, WhatsApp, Google Meet, Redis/BullMQ and Docker are built behind switches and tested with development drivers and faked provider responses.
- **Phase 7 (engagement) is built:** jobs board, weekly All-India mocks, "asked today" drive reports, question discussions, badges and streak freezes, share cards.
- **One admin role, no review step (D-056):** a single Admin role does everything. Content is Draft → Published → Archived. Editors have "Save and publish", imports have "Publish after import", and admin › Drafts lists everything not yet live. 
- **Company workspace (D-057):** each company's admin page has tabs: Profile, Hiring process, Sources, MCQ questions, Coding and Mock tests. Questions and coding problems are added from there already tagged with the company. "Then add another" keeps the setup and suggests the next ID. "Asked at" and "+ New topic" are in the editors. Next: the owner enters content; the remaining Phase 6 work waits for keys and hosting.
- **Admin panel completion (D-055):** coding problems, design questions, role tracks, interview types, passages and admin roles can now be created and edited in the admin panel, not only imported.
- **Owner's order (2026-10-28):** finish building and testing the application first. API keys, payments, domain and hosting are undecided and come last.
- **Later, after the build:** the owner gets the accounts and keys; then each service gets one real test on staging, following [deployment.md](deployment.md). Remaining Phase 6 work: hosting choice and staging, monitoring and backups, Razorpay Route payouts, CSP, load test, legal review, content load, beta.

## What exists

### Admin panel completion (D-055)
- **Coding problems:** "New problem" (`/admin/problems/new`). The edit form also covers topics, languages and source. Reference, brute and starter code can be added, replaced and deleted on the problem page. Judge-relevant code re-runs the judge check.
- **Design questions:** `/admin/design/new` and `/admin/design/[id]`: create, edit, publish, unpublish, archive and restore.
- **Role tracks:** `/admin/tracks`: list, create, edit, hide and show. The slug is fixed after creation.
- **Interview types:** `/admin/interview-types`: create and edit, including the rubric. The price comes from an interview price setting. Old scorecards keep their scores.
- **Passages:** `/admin/passages`: search, create, edit with a live preview, see linked questions, delete unused ones.
- **Admin roles:** an "Admin roles" card on the user page, for super admins only. The last super admin is protected.

### Phase 7: engagement and growth
- **Jobs** (D-050): public `/jobs` (search, location, type, work mode, freshers/experienced, saved jobs) and `/jobs/[slug]` (eligibility check, apply on the employer's site, Google for Jobs data); admin › Job postings with apply-click counts. Company pages list their open jobs.
- **All-India mocks** (D-049): `/contests` and `/contests/[slug]` (countdown, one attempt, live leaderboard and rank, final rank and percentile, share); answers stay hidden until results are final; admin › All-India mocks (create from a blueprint, publish, copy to next week). Banners on the dashboard and Mock tests page.
- **Drive reports** (D-051): `/asked/new`; admin › Drive reports; "Asked in recent drives" on company pages; dashboard prompt.
- **Discussions** (D-048): under each practice question after answering; admin › Discussions (flagged, newest, hidden; keep, hide, block posting).
- **Badges and freezes** (D-052): `/achievements` (streak, freezes, buy a freeze with points, 16 badges, shared links); new-badge alert and freezes on the dashboard.
- **Share cards** (D-053): `/s/[id]` with a generated image; share from results, contest ranks and badges.
- Fixed while here: scheduled interview reminders failed when their booking had been deleted; public pages now show "Dashboard" to signed-in visitors.

### Phase 6 (so far): accounts and production integrations
- **Accounts** (D-043): `/sign-up` (name, email, password; emailed 6-digit code on `/verify-email`), `/sign-in` (email + password, or phone OTP that also creates accounts), `/forgot-password` and `/reset-password`, account page security card (change or set password, signed-in devices, sign out of other devices). Sessions are database rows, revoked on sign-out and password reset. Rate limits on codes, guesses and sign-ups. `/dev-login` remains only with `AUTH_MODE=dev`. Onboarding shows the account menu.
- **Razorpay** (D-044): orders, in-page checkout, verified callback and webhook, refunds; the test payment page remains for `PAYMENT_DRIVER=mock`.
- **Messages** (D-045): Resend email, MSG91 OTP SMS, WhatsApp Cloud API; outbox by default.
- **Queue** (D-046): `QUEUE_DRIVER=bullmq` delivers jobs through Redis with the table as the record.
- **Hosting** (D-047): Dockerfile, docker-compose (PostgreSQL, Redis, migrations, web, worker), `/api/health`, security headers, draft `/terms`, `/privacy`, `/refund-policy`, and [deployment.md](deployment.md) with every go-live step.

### Phase 5: mock interviews, experienced track and monetization
- **Mock interviews:** five interview types with rubrics (prices in settings). Candidates choose an interviewer (rating, company, experience, languages, next free slot), pick a slot (IST, 14 days, minimum notice), hold it, then use a credit or pay; meeting link, emails and reminders follow. Booking page: join, move or cancel inside the free window, scorecard (rubric scores, strengths, what to work on, recommended topics linked to practice), rating. A test "meeting room" stands in for Google Meet in development; the real Google Calendar + Meet driver is ready (D-041).
- **Interviewers:** public application page; ops approve, reject, suspend, reinstate and clear quality flags. Portal: dashboard (upcoming, scorecards due, earnings, rating), weekly hours per day in their own time zone with buffer and days off, interviews list, candidate summary (profile, targets, weakest topics, notes), scorecard form, candidate no-show, cancellation 24 h ahead, earnings ledger.
- **Commerce:** pricing page (Free, Pro monthly / 6 months, company packs, interview credits with bundles), checkout with coupon or referral code, test payment page (success or failure) through signed webhooks, account page (plan, packs, credits, purchases, invoices, referral code, points, message preference), printable GST invoices. Pro and packs unlock practice, coding and mocks on the server (D-040).
- **Admin:** interview bookings (cancel with refund, interviewer no-show), interviewers, payouts (balances, record transfers), users (search; user page with access, credits, orders, refunds, grants and revokes), coupons, notifications outbox, interview experiences moderation, design questions.
- **Experienced track:** role tracks (incl. "Service to product switch") with roadmap, topic mastery, coding problems, design questions and interview types; system design / low-level design bank with approach and trade-offs (D-042).
- **Community:** students share interview experiences; moderators edit and publish them on company pages with filters; contributors earn points.
- **Notifications:** welcome, receipts, booking messages, reminders, scorecard ready and overdue, decisions; stored and sent by the worker to the dev outbox.

### Phase 4: mock tests and coding platform
- **Judge** (D-033): one `Judge` interface. The local driver compiles and runs C, C++, Java, Python and JavaScript with the machine's toolchains (development and tests). The Judge0 driver is for production. Judging runs in the worker (`code.judge`).
- **Coding imports:** problems, test cases and solutions CSVs, or a ZIP package per problem. Each changed problem is checked in the judge afterwards (`problem.validate`, D-034). Problems can only be published after every reference and brute solution passes every test. The company question map now links coding problems too.
- **Coding for students** (`/coding`, `/coding/[slug]`): list with search, difficulty, topic and status filters, solved/attempted counts and the free limit. Workspace with the statement, CodeMirror editor (D-035), language switch with per-language time limits, starter code, drafts kept in the browser, Run (samples or custom input), Submit, per-test results (hidden tests show only pass/fail), hints one at a time, then the editorial, and submission history. Rate limits: one pending run, 20 per 5 minutes.
- **Mock tests** (`/tests`, `/tests/[slug]`, `/exam/[id]`, `/tests/results/[id]`): catalogue grouped by kind with best scores, resume and the free mock limit. Instructions page. Full-screen exam screen with server-timed sections (free or sequential), palette with five states and a legend, mark for review, clear, no going back where a section forbids it, autosave with offline retry, tab-switch counting, full screen, platform-style layouts (standard, TCS iON-like, AMCAT-like, HackerRank-like), coding questions inside tests, and auto-submit when time ends. Result page with score, accuracy, percentile, section bars with time used, weak topics linked to practice, and a filterable solutions review. Test answers count for mastery, mistakes and streaks (D-036).
- **Admin:** coding problems (list with judge-check status, detail with the judge report, "Check in judge", review workflow, settings editor, add or delete tests, solutions). Mock tests (blueprint editor with sections and topic rules, "Draft mock" from a company's test pattern, publish check). Content analytics (accuracy, median time, option shares, automatic flags such as a likely wrong answer key). Jobs and judge monitor with retry for failed jobs (`jobs.view`, ops admins).
- **Sample content:** `content:sample -- --publish` now also imports and publishes the sample coding problem and three sample tests (aptitude quick test, coding round practice, Acme mock).

### Phase 3: student learning
- **Onboarding** (`/onboarding`): 3 steps (fresher or experienced profile, up to 3 target companies with dates, coding language). New students go there straight after sign-in. Doubles as "Edit goals".
- **Public company pages** (`/companies`, `/companies/[slug]`): directory with search and filters; company page with rounds, section tables, topics linked to practice, eligibility, pay, recently asked questions, sources, last verified. JSON-LD, canonical URLs, `sitemap.xml`, `robots.txt`. Cached and tagged; admin actions refresh them. Signed-in freshers get a personal eligibility check and "Prepare for this company". Guests can see everything.
- **Request a company:** students suggest missing companies; admins see the most-requested list on `/admin/companies`.
- **Practice:** hub (subjects with mastery, question of the day, mistakes, bookmarks, recently asked, target companies), subject pages (topics with mastery bars and subtopics), sessions by subject, topic, subtopic, company or source.
- **Practice player:** single, multiple and numeric questions, passages, code, timer, instant grading with explanation, mastery change, "asked in" badges, bookmarks, report a problem, keyboard shortcuts, free-limit handling.
- **Learning model:** IST days, mastery (difficulty- and recency-weighted), mistakes (open until answered correctly), streaks, readiness per target company, free limit of 25 questions a day (setting) enforced on the server, question of the day (doesn't count toward the limit).
- **Dashboard:** streak, totals, accuracy, today's usage, readiness rings per target company with days to go, "Do next", "Work on", recent answers, replies to reports.
- **Progress:** stats, questions per day (30 days) and weekly accuracy (8 weeks) charts with tooltips and table views, topic mastery by subject.
- **Admin error reports** (`/admin/reports`): open, fixed and no-change lists; close with a reply the student sees on their dashboard.

### Phases 1–2
Foundation (Next.js 16, embedded PostgreSQL, dev login, roles, layouts, themes, settings, audit log) and the content engine (CSV/XLSX/ZIP imports with preview and undo, PostgreSQL job queue and worker, question bank and editor, review workflow, taxonomy, companies).

### Quality
- 246 unit tests, 86 integration tests, 74 end-to-end tests on desktop and a 360 px phone (Phase 7 adds: streak freezes, badge thresholds, contest phases, ranking and percentiles, job rules and form, comment rules, share links; integration: frozen contest question sets, one attempt, live and final ranks, hidden answers, finalize idempotence, freezes and points, discussions with flags and moderation, drive reports, jobs and apply clicks, share cards; e2e: jobs board and admin posting, All-India mock, discussions, drive report through moderation to the company page, achievements and a public share link). Phase 6 had 227 unit, 68 integration, 62 e2e (Phase 6 adds: password hashing and codes, Indian phone numbers, Razorpay signatures, webhook mapping, checkout verification and API calls, Resend/MSG91/WhatsApp request formats, driver configuration checks; sign-up, verification, password and phone sign-in, code burning, rate limits, password reset and change; e2e sign-up with the emailed code, phone OTP, password reset, server-side sign-out). Phase 5 had 211 unit, 61 integration ( payments with forged and duplicate webhooks, amount checks, refunds, grants, paywall, referral race; interviewer approval, slots, two candidates racing for one slot, paying for a held slot, meetings and messages, reschedule and cancel windows, scorecards, earnings, ratings, no-shows, payouts). Earlier: 193 unit, 46 integration (real `eduprep_test` database and the real local judge: coding imports and ZIP packages, judge validation, submissions, hidden-test privacy, rate limits, sittings, sequential sections, scoring, auto-submit, free limits, analytics; plus Phases 2–3), 53 end-to-end tests on desktop and a 360 px phone (adds: failed then successful payment with invoice, the full interview loop from buying a credit to rating the interviewer, experiences moderation, tracks and design bank, phone layouts). Lint, Prettier, types, brand check, clean production build.

## Deferred by decision

Phase 6, mocked or replaced until then (D-020, D-022, D-029):
- Sign-in / sign-up (Google, phone OTP)
- Razorpay payments and payouts (the free limit applies to everyone until Pro exists, Phase 5)
- Production email, SMS, WhatsApp
- Hosting and deployment
- Docker (app, worker, Judge0) and Redis + BullMQ (plan tasks 6.15, 6.16)

## Known issues

- **Real providers are untested with real keys** (Razorpay, Resend, MSG91, WhatsApp, Google Meet, Redis). Their request formats and signatures are unit-tested against the providers' documented behaviour; each needs one staging run (deployment.md).
- **Docker isn't installed on this machine,** so the Dockerfile and compose file haven't been built here. CI or the hosting machine will be the first build.
- **No Content-Security-Policy yet** (D-047); other security headers are on.
- **CI has not run yet.** No GitHub remote and nothing committed. Every step passes locally.
- **`npm audit`: 9 high (braces, GHSA-vfj7-8cjw-p6xm).** No patched version; build tooling only. KaTeX fixed with an override.
- **Re-running `npm run db:seed` resets the names, descriptions and order of the five seeded interview types** (the seed updates them). Rubrics, length, price and on/off edits are kept.
- **E2E tests share the local dev database.** They reset the seeded students and publish the sample content at start (`content:sample -- --publish --reset-students`), and leave a few `QA-E2E-…` and `e2e-…` items behind. Integration tests use their own `eduprep_test` database.
- **Contest answers count for mastery and the daily streak** like any test. Results emails go to every participant at once through the queue; fine for thousands, revisit for very large contests.
- **Job apply clicks from signed-out visitors count every click** (no way to tell repeat visitors apart). Signed-in students count once.
- **The local judge is not a sandbox** (D-033). Fine for development and CI; production must use Judge0 on its own server (task 6.15). Its timings on Windows are noisier than on Linux.
- **Local database rebuilt as UTF-8** (D-037). The previous one is kept as `eduprep_win1252_backup` in the local cluster; drop it when you no longer need it.
- **The Google Calendar + Meet driver hasn't run against Google yet** (no credentials here). It's written to the Calendar API and switched on with `MEETING_DRIVER=google`; test it with a Workspace service account before launch.
- **Invoices lack the GSTIN and registered address** until the company is registered (Phase 6).
- **Interviewer earnings use the type's list price**, even when the candidate paid with a bundle or coupon discount. Revisit if discounts grow.
- **Support admins can't open a customer's invoice page** (it's in the student area); super admins can. Add an admin invoice view if support needs it.
- **Mastery constants** (decay 0.9, prior 2, difficulty weights) are reasonable defaults; tune them with real student data.
- Ports in use on this machine: 5432 and 5433 belong to other Postgres instances, so eduprep uses 5444. Dev 3000, e2e 3200. `npm run db:stop` stops a Postgres left running.

## Open questions for the owner

See PRD section 14.

## Session log

Newest first. One line per session: date, who, what changed, what's next.

- 2026-10-29 · Claude · **Cleanup and review fixes:** `/simplify` (shared helpers, one public-cache refresh, cheaper queries, one ordering helper) and `/code-review` fixes. A question made private stays private when republished; bulk sample changes refresh public pages; the rate limit reads the address from our proxies' side (`TRUSTED_PROXY_HOPS`) and counts link preloads separately; publish-after-import skips unchanged rows and can't leave a batch stuck; Save and publish queues one judge check. Verified: `npm run check` (299 unit), 131/131 integration, full e2e 96 passed, 0 failed.

- 2026-10-29 · Claude · **C.5 (D-058), public pages complete:** company pages show sample questions with answers and their mock tests, and link topics, questions and problems to the public pages. Public question, problem and mock pages are rate-limited per visitor (60 a minute, 300 for crawlers; 429 with Retry-After; in memory, skipped without a forwarded address). Long link lists don't preload. `deployment.md` §10 has the search-engine launch steps. Fixed while here: e2e tests left QA-PCT-0001's public-sample flag flipped; the test now puts it back. Verified: `npm run check` (296 unit), 128/128 integration, full e2e 96 passed, 0 failed. Next: the owner adds content; remaining Phase 6 work waits for keys and hosting.

- 2026-10-29 · Claude · **C.4 (D-058):** public `/problems` and `/problems/[slug]` (statement and sample tests only; hidden tests never queried) and `/mock-tests` and `/mock-tests/[slug]` (format only), in the sitemap, with the header showing content pages. Verified: `npm run check` (291 unit), 128/128 integration, full e2e 93 passed, 0 failed (new `public-catalog` spec checks that hidden test data isn't in the page). Next: C.5 company pages and scraping limits.

- 2026-10-29 · Claude · **C.3 public question pages (D-058):** `/questions`, `/questions/[subject]`, `/questions/[subject]/[topic]` and `/question/[id]` without sign-in. Samples show answers, the rest show a sign-up prompt, and answers are never sent for non-samples (unit-tested). Breadcrumb and Quiz structured data, `noindex` for thin topics, split question sitemaps listed in robots.txt, and "Questions" in the site menu. Fixed while here: the password-reset e2e test typed before the page was ready (the known flake); it now waits. Verified: `npm run check` (289 unit), integration 128 (one judge compile timeout under load, passed on re-run), full e2e 86 passed (the reset test, fixed and re-run). Next: C.4 coding problems and mock tests in public.

- 2026-10-29 · Claude · **C.1–C.2 (D-058):** "Public sample" flag on questions (editor box, bulk actions, "Public sample" badge, automatic first N per topic with the `seo.publicSamplesPerTopic` setting). The sitemap adds pricing, legal, become-interviewer and experience pages. A company's last-modified date follows its rounds, sources, links and linked-question publishing. Verified: `npm run check`, 128/128 integration (new `public-samples`), full e2e 82 passed (new `seo` spec fixed and re-run; the known-flaky phone password reset passed on re-run). Next: C.3 public topic and question pages.

- 2026-10-28 · Claude · **B.2–B.5 Company workspace (D-057):** company page tabs; rounds, sections and sources editors (reorder, renumber, last-source guard); "Asked at" companies and months in the question and problem editors (links never unpublish); add from a company (pre-tagged) with "Then add another" and next-ID suggestion; link and unlink existing items; Mock tests tab; "+ New topic" in the editors; coding problem checklist. Fixed while here: the long "back" link on new-question and new-problem pages scrolled phones sideways. Verified: `npm run check` (285 unit), 124/124 integration (new `company-hiring`, `company-content`), full e2e 82 passed (36 skipped by design; the known-flaky phone password-reset test failed once and passed on re-run). Next: owner adds content.

- 2026-10-28 · Claude · **B.1 One admin role (D-056):** migration folds the five admin roles into `ADMIN`, and in-review content becomes drafts. Publish, unpublish, archive and restore replace submit, approve and reject. "Save and publish" in the question, problem, design and company editors. "Check and publish" for coding problems (publishes when the judge check passes). Drafts page replaces the review queue. "Publish after import" (new `import_batches` columns). The admin access button replaces role checkboxes. Seed creates one admin. Verified: `npm run check` (281 unit), 117/117 integration (new `publishing` file), full e2e 80 passed (34 skipped by design; one locator fixed and its file re-run). Next: B.2 hiring process and sources editors.

- 2026-10-28 · Claude · **Admin editors (A.1–A.6, D-055):** everything that was import-only can now be created and edited in the admin panel: coding problems and their code, design questions, role tracks, interview types with rubrics, passages, and admin roles. No schema change. Scorecards now show scores for rubric items that were later removed. Fixed while here: `commerce` and `practice` integration tests imported questions before companies and broke on the company-tagged sample question (D-054 order). Verified: `npm run check` (284 unit), 111/111 integration (new `admin-editors`: a problem built in the panel passes the real judge and publishes), e2e `admin-editors` (desktop and 360 px phone), `admin` and `content` specs. The full e2e suite wasn't re-run. Next: A.7 ZIP content pack, or more admin polish.

- 2026-10-23 · Claude · **Simpler content imports (D-054):** coding problems in one file (statement, solution, starter code, samples, hidden tests, companies per row); companies in two files (`companies.csv` with sources, `company-process.csv` with rounds and sections); `companies`/`asked_in` columns on question and coding files; exact duplicates refused; optional IDs; "Download current data" exports in the upload format; super-admin "Replace all" (archives what the file leaves out, after a backup). Older multi-file formats still import. `mock-data/` converted (43 → 30 files). Also: `TEST_MODE` switch for local testing (no sign-in codes, no payments), forced off in integration and e2e tests. Verified: 271 unit, import integration tests (27/27; full suite 100/101, the ZIP-package judge test timed out under load and passed alone), clean build. Next: ZIP "content pack" upload in admin.
- 2026-10-20 · Claude · **Phase 7 engagement built** (7.1–7.6): jobs board, weekly All-India mocks, drive reports, discussions, badges and streak freezes, share cards. Decisions D-048 to D-053. Found and fixed: `/jobs` read the date during prerendering; a long company name in a company-page button made phones scroll sideways; interview reminder jobs failed for deleted bookings; e2e runs left job postings behind. Verified: 246 unit, 86/86 integration, clean build, 74 e2e on desktop and phone (28 skipped by design; the phone password-reset test timed out once under load and passed on re-run), visual review. Next: Phase 6 keys and staging; 7.7 alerts.
- 2026-10-20 · Claude · **Content at scale:** `mock-data/` (an importable example of every content file, laid out per subject topic and per company), `npm run content:import -- <folder>` (whole-folder import in dependency order, checks files sit in the right subject/company folder), [content-workflow.md](content-workflow.md) (150+ companies: topic-owned questions, company tiers, IDs, review flow). Verified: 230 unit, 69/69 integration (mock-data imports cleanly and re-imports unchanged). Next: a ZIP "content pack" upload in admin using the same ordering.
- 2026-10-20 · Claude · **Phase 6 integrations built** (6.1 done; 6.2, 6.4, 6.5, 6.6, 6.9, 6.12, 6.15, 6.16 built, waiting for keys, Redis or hosting). Decisions D-043 (own accounts), D-044 (Razorpay), D-045 (message providers), D-046 (Redis delivers, Postgres keeps), D-047 (deployment). Found and fixed: the proxy didn't protect `/exam`, `/account`, `/checkout`, `/tracks`, `/design`, `/experiences`, `/meet`; onboarding had no way to sign out. Verified: 227 unit, 68/68 integration, clean build, 62/62 e2e. Next: real keys and a staging run per service.
- 2026-10-20 · Claude · **Phase 5 implemented** (tasks 5.1–5.18). Decisions D-039 (slots, holds, double-booking protection, interview policies), D-040 (commerce, mock payments, paywall, invoices), D-041 (notifications and meeting providers), D-042 (tracks, design bank, experiences). Bugs found and fixed during testing: a referral code created during render raced and broke the account page; a fieldset's default min-width stretched the slot picker sideways; the pricing badge was clipped; a long company-pack button overflowed phones. Verified: 211 unit, 61/61 integration, clean build, 53/53 e2e, visual review on desktop and a 360 px phone. Next: Phase 6.
- 2026-10-19 · Claude · **Phase 4 implemented** (tasks 4.1–4.19). Decisions D-033 (local judge + Judge0), D-034 (judge check after import, required to publish), D-035 (CodeMirror), D-036 (test engine rules), D-037 (UTF-8 databases), D-038 (no chart library). Bugs found and fixed during testing: the local database was WIN1252 and couldn't store "✓" or "₹"; Windows antivirus delays counted as run time; C/C++ output had Windows line endings; Turbopack tried to bundle the JDK folder; the ZIP importer didn't check problem.csv columns; a section finished early stayed open; the palette legend counted every section. Verified: 193 unit, 46/46 integration, clean build, 46/46 e2e, visual review on desktop and a 360 px phone. Next: Phase 5.
- 2026-10-19 · Claude · **Phase 3 implemented** (tasks 3.1–3.14). Decisions D-031 (edited published questions leave practice until re-approved) and D-032 (learning rules, caching, forms, fixtures). Bugs found and fixed during testing: URL-reading navs outside Suspense broke dynamic-route builds; a step button reused as the submit button submitted onboarding early, and React 19's form reset then wiped the answers (new `useFormSubmit`); sign-in briefly showed the dashboard before redirecting new students; a formatter function passed to a client chart; phone overflow on the practice hub and long badges; single line breaks in content collapsed (`remark-breaks`). Verified: `npm run check` (lint, types, 160 unit tests, brand), 24/24 integration, `next build` clean, 39/39 e2e, visual review in light/dark and on a 360 px phone. Next: Phase 4.
- 2026-10-19 · Claude · **Phase 2 implemented** (2.1–2.14). PostgreSQL job queue (D-029), import engine, question bank, review workflow, taxonomy, companies. Verified: 136 unit, 15 integration, 25 e2e.
- 2026-10-19 · Claude · **Phase 1 implemented** (1.1–1.14). Embedded PostgreSQL, no Docker (D-027, D-028). Verified: 46 unit, 18 e2e.
- 2026-10-19 · Claude · Plan, design system, CSV standard and templates, decisions D-020 to D-026.
- 2026-10-19 · Claude · Initial docs: PRD, rules, decisions, architecture, data import spec, AGENTS.md, CLAUDE.md, README.
