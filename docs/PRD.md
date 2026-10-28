# PRD — EduPrep: Company-wise Placement Preparation Platform

Version 1.1 · 2026-10-19 · Owner: Vinay · Status: Draft

"EduPrep" is a working name; it comes from one config file so it can be changed easily (D-021). Build order and task status: [plan.md](plan.md). Decisions that change this document: [decisions.md](decisions.md).

---

## 1. Overview

EduPrep helps candidates get ready for a specific company's hiring process. It answers one question: **"I have a drive or interview at company X on date Y — get me ready."**

It combines:

1. **Company hub**: verified hiring patterns, rounds, syllabus, eligibility and recent questions for each company.
2. **Practice**: topic-wise and company-wise MCQs (aptitude, reasoning, verbal, CS fundamentals).
3. **Coding platform**: an in-browser editor with a real judge, company-tagged problems and online-assessment (OA) simulations.
4. **Mock tests**: timed tests that copy the real exam interface of each company's assessment platform.
5. **Paid mock interviews**: 1:1 Google Meet interviews with vetted interviewers, with a structured scorecard afterwards.

All content (MCQs, coding problems, company data, tests) is created and uploaded by admins through the admin panel. Nobody edits code or the database to change content.

## 2. Problem

| Who | Pain today |
|---|---|
| Freshers (BE/BTech) | Free sites have old, repeated questions and outdated "company patterns" with no date or source. Practice tests look nothing like the real exam screen. Good guidance is expensive (₹50k+ courses). |
| Experienced candidates | Prep material targets freshers. There is little structured help for switching from service to product companies, system design, or role-specific interviews. Quality mock interviews are scattered and inconsistent. |
| Both | Nobody combines company-specific practice, a realistic exam simulation and a human mock interview in one place. |

## 3. Target users

### 3.1 Primary
- **Freshers:** final- and pre-final-year BE/BTech students (later MCA/BCA/MTech), mainly from tier-2 and tier-3 colleges. They target mass recruiters (TCS, Infosys, Wipro, Accenture, Cognizant, Capgemini, HCLTech, Tech Mahindra, LTIMindtree, IBM, Deloitte…) and mid-tier product companies.
- **Experienced candidates:** 1–8 years of experience, switching jobs, often from service to product companies. Target roles: SDE / SDE-2, backend (Java, Node, Python), frontend, data engineer, QA automation, DevOps.

### 3.2 Secondary
- **Interviewers:** working engineers and HR professionals who run paid mock interviews and earn a share.
- **Admins:** the founder at first. One admin role does everything (D-056); separate admin roles can come back if a team joins.
- **Colleges (later):** placement officers (TPOs) who want batch readiness reports.

### 3.3 Personas
- **Priya, 21, BTech CSE, tier-3 college:** has a TCS NQT drive in 4 weeks. Wants the exact pattern, realistic practice and a score she can trust. Mostly uses her phone. Will pay ₹200–500 if she clearly sees value.
- **Rahul, 26, 3 years at a service company:** wants a product company. Needs DSA practice, system design and real mock interviews. Will pay ₹1,000–3,000 per interview if the interviewer is credible.

## 4. Goals and non-goals

### 4.1 Goals
1. A new user reaches a useful first activity (company page → practice or mock test) within 5 minutes of signing up.
2. Company information is visibly fresh and sourced: every company page shows a "last verified" date and sources.
3. Mock tests feel like the real exam: same sections, timers, navigation rules.
4. Mock interviews give a structured, actionable scorecard every time.
5. One person can run all content and operations from the admin panel.
6. Revenue from both students (packs, Pro) and interviews (credits).

### 4.2 Non-goals (for now)
- Native mobile apps. The website must work very well on phones; an app comes later.
- Live classes or video courses.
- A recruiter or hiring portal.
- User-facing AI features before launch (see 8.12).

## 5. Success metrics (first 6 months after launch)

| Metric | Target |
|---|---|
| Sign-up → first practice or test | ≥ 60% |
| Users active again within 7 days | ≥ 30% |
| Free → paid conversion (any purchase) | 2–4% |
| Mock interview: average rating | ≥ 4.3 / 5 |
| Mock interview: no-show rate (interviewer side) | < 3% |
| Wrong-answer reports per 1,000 attempts | < 2 |
| Company pages verified in the last 6 months | 100% of "full" companies |

## 6. Positioning

| Competitor type | Examples | Our edge |
|---|---|---|
| Aptitude sites | IndiaBix, PrepInsta | Dated and sourced company patterns, recency tags, real exam interface |
| Coding sites | LeetCode, GFG, HackerRank | Service-company OA simulation, company-wise tracks, linked to interviews |
| Courses | Scaler, NxtWave, Coding Ninjas | Pay per need (company pack, interview credit), not a ₹50k course |
| Mock interview platforms | Preplaced, Topmate, interviewing.io | Company-specific interviewers, a standard scorecard, linked to the candidate's prep data |

## 7. Roles and permissions

| Role | Can do |
|---|---|
| Guest | View public company pages, sample questions, pricing |
| Student / Candidate (Free) | Limited practice, limited coding, 1 mock test per company, drive alerts |
| Student / Candidate (Paid) | Unlocked according to purchases (pack, Pro, interview credits) |
| Interviewer | Manage availability, see upcoming interviews and candidate summary, submit scorecards, see earnings |
| Admin | Everything in the admin panel: content, publishing, companies, imports, interviews, users, payments, settings and admin access (D-056) |

There is one admin role and no review step: an admin writes or imports content and publishes it. The last admin can't be removed. Every admin action is written to the audit log.

## 8. Features

Each heading shows the build phase from [plan.md](plan.md). "After launch" means not scheduled yet.

### 8.1 Accounts and onboarding — Phase 3 (onboarding), Phase 6 (real sign-in)
- Sign up or log in with Google, or phone number plus OTP. Email is optional. (Until Phase 6, a dev login is used; see D-020.)
- Choose a profile type: **Fresher** or **Experienced**.
- Fresher fields: name, college, degree, branch, graduation year, CGPA band, backlogs (yes/no).
- Experienced fields: current role, years of experience, current company (optional), primary tech stack, target roles.
- Goals: up to 3 target companies, and optionally a drive or interview date for each.
- Preferred coding language.
- After onboarding: dashboard with target companies, readiness and a suggested first action.

### 8.2 Company hub — Phase 3 (admin side in Phase 2)
Public, SEO-friendly page per company:
- Overview, roles hired for (fresher and experienced), salary/CTC ranges.
- **Hiring process:** rounds in order, with duration, sections, number of questions, negative marking and the assessment platform (e.g. TCS iON, HackerRank, AMCAT, Mettl).
- **Syllabus** per round, linked to topics in the practice section.
- **Eligibility:** CGPA, backlogs, branches, graduation years, gap rules.
- **Recent questions:** company-tagged MCQs and coding problems with "asked in" year and month (memory-based, from user reports).
- **Interview experiences:** see 8.9.
- **Sources and a "last verified" date** on every page. Pages show a warning to admins when not verified in 6 months.
- Buttons: "Practice for this company", "Take a mock test", "Book a mock interview".
- Company levels:
  - **Full:** verified pattern, full mock test, company-tagged questions.
  - **Standard:** reported pattern, labelled with its source and date.
  - **Generic track:** "Service company track" or "Product company track" for companies not yet added.
- Users can request a company. The most-requested companies are added next.

### 8.3 MCQ practice — Phase 3
- Browse by **subject → topic → subtopic** (e.g. Quant → Percentages → Successive change), or by **company**.
- Question types: single correct, multiple correct, numeric answer. Questions can share a passage (reading comprehension, data interpretation).
- After answering: correct/incorrect, the correct answer, explanation, time taken versus expected time.
- Filters: difficulty, company, "asked recently", not attempted, incorrect.
- **Bookmarks** and a **mistakes list** for retrying wrong answers.
- **Report an error** button on every question.
- Free limit: a set number of questions per day, configurable in admin settings.

### 8.4 Mock tests and exam simulator — Phase 4
- **Topic tests** (10–20 minutes) and **full company mocks**.
- **Exam simulator:** a mock follows the real platform's rules where known: section order, section-wise timers, locked sections, whether you can go back, negative marking, question palette, mark for review.
- Test definitions (blueprints) set the number of questions per topic and difficulty mix. Each sitting is drawn from the live question bank, so each attempt is different but equivalent.
- Answers save to the server continuously. A refresh or network drop does not lose progress. Auto-submit when time ends.
- Basic integrity signals: full-screen mode, tab-switch count (shown in the result, not used to block anyone).
- **Result page:** score, section scores, accuracy, time per question, percentile among other takers, every answer with its explanation, weak topics.
- "Practice weak topics" creates a practice set from the weak topics.
- Weekly free **all-India mock** with a leaderboard (after launch).

### 8.5 Coding platform — Phase 4
- Problem list filtered by topic, difficulty, company, and solved/unsolved.
- Monaco editor. Languages: C, C++, Java, Python, JavaScript.
- **Run** against sample tests or custom input. **Submit** against hidden tests.
- Verdicts: Accepted, Wrong Answer, Time Limit Exceeded, Memory Limit Exceeded, Runtime Error, Compilation Error.
- Hints unlocked one at a time, then the editorial with solutions.
- Submission history per problem.
- **OA simulator:** company-style coding rounds with a timer and multiple problems (e.g. "TCS NQT advanced coding", "Accenture coding round"). Partial scoring by test cases passed where the real exam does that.
- Coding questions can also appear inside mock tests.

### 8.6 Analytics and readiness — Phase 3 (basic), Phase 4 (full)
- **Readiness score per target company:** weighted mastery of the topics in that company's syllabus plus recent mock scores. Example: "You're 62% ready for Accenture. Work on: Time & Work, Pointers, Blood Relations."
- Topic mastery, accuracy and speed trends, test history, practice streak.
- Shareable readiness card (after launch).

### 8.7 Mock interviews — Phase 5
**Interview types** (placeholder launch prices from D-026, editable in admin):

| Type | For | Launch price (₹) |
|---|---|---|
| HR / behavioural | Freshers and experienced | 399 |
| Technical: fresher | Freshers | 699 |
| Company-specific | Both | 999 |
| SDE / DSA: experienced | Experienced | 1,799 |
| System design | Experienced | 2,499 |

**Candidate flow:**
1. Choose an interview type and optionally a target company.
2. Browse interviewers (company, role, years of experience, rating, languages, price) and pick a free slot.
3. Pay with Razorpay, or use a credit.
4. The system creates a Google Calendar event with a Google Meet link and invites both people.
5. Reminders by email and WhatsApp 24 hours and 1 hour before.
6. After the interview, the interviewer submits a **scorecard** within 24 hours.
7. The candidate sees the scorecard on their dashboard and rates the interviewer.

**Scorecard:** a fixed rubric per interview type. Example for technical: problem solving, coding, CS fundamentals, communication, each scored 1–5 with comments. Also strengths, areas to improve, recommended topics (linked to practice), and an overall "hire / borderline / not yet".

**Interviewer side:**
- Apply with LinkedIn, current company, experience and interview types. An admin approves.
- Set weekly availability and blocked dates. Slots are shown in the candidate's time zone (IST by default).
- Dashboard with upcoming interviews, candidate summary (profile, target company, resume if shared), scorecards due, earnings.
- Payouts through Razorpay Route after the scorecard is submitted (ledger in Phase 5, real transfers in Phase 6). Interviewer share is 70% at launch, configurable.

**Policies (configurable):**
- Candidates can reschedule free up to 12 hours before. Later cancellations are not refunded.
- Interviewer no-show: full refund or a free rebooking, plus a penalty for the interviewer.
- Candidate no-show: no refund.
- Recording only with both parties' consent (after launch).

**Quality control:** ratings below a threshold put an interviewer under review. Ops can spot-check scorecards.

### 8.8 Experienced-candidate track — Phase 5
- Role tracks (Backend Java, Frontend, Data Engineer, QA Automation, DevOps, SDE-2), each with topics, MCQs, coding problems and interview types.
- System design and low-level design question bank (problem, approach outline, key trade-offs).
- "Service to product switch" roadmap.
- Interview experiences filtered by years of experience and role.

### 8.9 Interview experiences — Phase 5
- Users submit experiences: company, role, fresher or experienced, year, rounds, questions asked, result, tips.
- Admins approve, edit or reject them before they are published.
- Shown on company pages. Can be filtered by role, years of experience and year.
- Contributors earn points or credits.

### 8.10 Drive alerts — After launch
- Admins publish drives (company, role, eligibility, last date, apply link).
- Users get alerts by WhatsApp, Telegram or email **only when they match the eligibility** (branch, graduation year, CGPA).
- Drive calendar page.

### 8.11 Engagement — Phase 3 (streak, question of the day); the rest after launch
- Daily streak and question of the day.
- Weekly free all-India mock with ranks.
- College leaderboard and campus ambassador referral codes.
- Free peer mock interviews (candidate to candidate).
- Points for reporting errors and submitting experiences, redeemable for discounts.

### 8.12 AI features — After launch
- **Resume vs job description match:** upload a resume and a JD, get missing skills, an ATS-style score and suggestions.
- **AI mock interview:** low-price voice or text interview as an entry product before a human mock.
- **AI explanation help:** follow-up questions on a question's explanation.
- AI is also used inside the admin panel to draft content. AI-drafted content always goes through human review.

### 8.13 Payments and plans — Phase 5 (mock provider), Phase 6 (Razorpay)

| Product | Contains | Launch price (₹), D-026 |
|---|---|---|
| Free | All company pages, 25 MCQs a day, 20 coding problems, 1 mock test per company | 0 |
| Company pack | All mocks, questions and OA simulations for one company, 6 months | 199 |
| Pro | Everything except human interviews | 299 a month, or 1,499 for 6 months |
| Interview credit | One mock interview of a chosen type; bundles of 3 (10% off) and 5 (15% off) | See 8.7 |

- Razorpay checkout (UPI, cards, net banking). Access is granted only after the server verifies the Razorpay webhook.
- GST invoices.
- Coupon codes and referral discounts.
- Account page: purchases, expiry dates, invoices, refund requests.
- All prices and free limits are set in admin settings, not in code.

### 8.14 Notifications — Phase 5 (dev transports), Phase 6 (production email and WhatsApp)
- Transactional: welcome, OTP, payment receipt, booking confirmed or changed, reminders, scorecard ready.
- Engagement (after launch): weekly progress, inactivity nudges, drive alerts.
- Users can manage marketing preferences. Transactional messages are always sent.

## 9. Admin panel

### 9.1 Dashboard — Phase 2
Queues with counts: drafts to review, error reports, failed imports, interviewer applications, overdue scorecards, refund requests.

### 9.2 Taxonomy — Phase 2
Manage subjects → topics → subtopics, companies, tags and roles. Every question, problem and test links to this taxonomy.

### 9.3 Content import — Phase 2 (taxonomy, MCQs, companies), Phase 4 (coding)
See [data-import.md](data-import.md) for the exact formats.
- One standard CSV per subject for MCQs (ZIP when images are included).
- Separate CSVs for taxonomy, passages, coding problems (problems, test cases, solutions; ZIP for large tests) and companies (profile, rounds, sections, sources).
- `company-question-map.csv` links any question or problem to any number of companies, so content is reused, not duplicated.
- Every import goes through: parse → validate → **preview with per-row errors** → import valid rows as **drafts** → download failed rows.
- Uploading the same items again with the same `external_id` **updates** them instead of creating duplicates.
- Near-duplicate detection against the existing bank.
- Import history: who imported what, when, row counts, and the original file. A whole batch can be rolled back if it is still in draft.

### 9.4 Content editor and review — Phase 2
- A form editor for single MCQs and coding problems, with Markdown and LaTeX preview.
- Status flow: **Draft → Published → Archived** (D-056). Editors have "Save as draft" and "Save and publish"; imports can publish what they bring in. Publishing runs the automatic checks; coding problems publish only after the judge check passes.
- Automatic checks before publishing: answer key valid, options not duplicated, explanation present, topic set. For coding problems, the reference solution must pass every test case.
- Version history for every item.

### 9.5 Companies — Phase 2
Structured form for each company page (section 8.2), with sources, last-verified date, SEO title and description, preview and publish.

**Company workspace (D-057):** each company's admin page has tabs, so one admin can build a company's content by hand without CSV files:
- **Profile:** the company form.
- **Hiring process:** add, edit, reorder and delete rounds and their test sections (questions, minutes, negative marking, going back, topics).
- **Sources:** add and remove links.
- **MCQ questions and Coding:** "Add question" or "Add coding problem" opens the editor with the company already tagged. "Then add another" keeps the subject, topic, difficulty and companies and suggests the next ID. Existing items can be searched and linked, or unlinked.
- **Mock tests:** "Draft mock from the pattern".

The question and coding editors have an "Asked at" list (companies and optional months), and a "+ New topic" button for a missing topic.

### 9.6 Test blueprints — Phase 4
Define tests: sections, timer per section, topic and difficulty mix, negative marking, navigation rules, the platform interface to copy, and which company the test belongs to.

### 9.7 Users and payments — Phase 5
Search users, view profile, purchases and progress. Grant or extend access manually, issue refunds, manage coupons.

### 9.8 Interview operations — Phase 5
Approve and suspend interviewers, set interview types and prices, view all bookings, handle disputes and no-shows, run payouts.

### 9.9 Moderation — Phase 3
Error reports (fix, reject or archive the question, with a reply to the reporter). Interview experiences (approve, edit, reject).

### 9.10 Content analytics — Phase 4
Per question: attempts, accuracy, average time, how often each option is chosen. Auto-flag suspicious questions (e.g. strong users mostly answer it wrong, or most users pick the same wrong option).

### 9.11 Settings and audit log — Phase 1
Roles, prices, free limits, commission rates, policies. The audit log records who did what, and when.

## 10. Content strategy (launch targets)

All subjects in the launch taxonomy go live at launch (D-024): Quantitative Aptitude, Logical Reasoning, Verbal Ability, Data Interpretation, Operating Systems, DBMS, Computer Networks, OOPs, DSA, Programming Languages, and Pseudocode.

| Content | Target at public launch |
|---|---|
| Subjects | All 11 launch subjects, every topic with questions |
| Companies at "full" level | 15–20 mass recruiters |
| MCQs (published, reviewed) | 5,000+ (at least 30 per topic) |
| Coding problems | 150+ (easy and medium focus, company-tagged) |
| Company mock tests | 1–3 per full company |
| Interviewers approved | 10–20, vetted personally |

Rules: no copying from competitor sites. Recalled company questions are labelled "memory-based" and rewritten in our own words.

## 11. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Pages load in < 2.5 s on a mid-range phone over 4G. Judge verdict in < 10 s for 95% of submissions. |
| Mobile | Every student screen works at 360 px width. The coding editor is usable on tablets and laptops; on phones, problems can be read and simple code run. |
| Reliability | A test in progress survives a refresh or network loss (answers saved at least every 10 s and on every change). |
| Scale target | 10,000 concurrent test-takers during peak season without slowdown (phase 4 target). |
| Security | Paid access checked on the server on every request. Code runs only in the isolated judge. Rate limiting on OTP, login, submissions. OWASP top 10 covered. |
| Privacy | Phone, email and resumes visible only to the user, admins, and (resume only, if shared) their booked interviewer. Compliant with India's DPDP Act: consent, deletion on request. |
| Backups | Daily database backups kept for 30 days, and a tested restore. |
| SEO | Server-rendered company and topic pages, sitemap, structured data, clean URLs. |
| Accessibility | Keyboard navigable, sufficient contrast, labelled form fields. |

## 12. Phases

The platform is built in six phases. Real sign-in, payments, production messaging and hosting are integrated last (D-020). Full task lists and status: [plan.md](plan.md).

| Phase | Focus |
|---|---|
| 1 | Foundation and design system: scaffold, tooling, design tokens, layouts, roles, dev login |
| 2 | Content engine: CSV import for all content types, question bank, review workflow, company editor |
| 3 | Student learning: onboarding, company pages, practice, mastery, readiness, dashboard |
| 4 | Mock tests and coding: exam simulator, results, Judge0, coding workspace, OA simulator |
| 5 | Mock interviews, experienced track, commerce with a mock payment provider, notifications |
| 6 | Production integrations (auth, OTP, Razorpay, email/WhatsApp, Meet), hosting, hardening, beta, launch |

Placement season runs July–December. Aim to launch before the season starts.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Wrong answer keys damage trust | Review workflow, report-error button, auto-flagging from analytics |
| Outdated company patterns | Last-verified dates, user reports after exams, 6-month re-verification warning |
| Copyright claims | Original content only. Recalled questions are rewritten and labelled. |
| Interviewer no-shows and poor quality | Personal vetting at first, ratings, penalties, refunds |
| Seasonal revenue | Experienced track and interviews sell all year |
| Judge abuse or overload | Isolated server, resource limits, rate limits, queue |
| Founder bandwidth | Bulk import, admin automation, strict phase scope |

## 14. Open questions

- [ ] Final product name and domain (working name EduPrep; renaming is a config change, D-021)
- [ ] Hosting choice (Phase 6, D-022)
- [ ] Final prices (placeholders in D-026)
- [ ] Which companies reach "full" level first
- [ ] Hindi or regional language explanations: when?
- [ ] Beta colleges and beta interviewers for Phase 6
