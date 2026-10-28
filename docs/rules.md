# Working Rules

Rules for everyone who changes this repo: the owner, team members and AI coding agents. **AI agents: read this whole file before your first change in a session.**

---

## 1. Read order at the start of every session

1. [progress.md](progress.md): current focus, known issues, recent sessions.
2. [plan.md](plan.md): the current phase and its task list.
3. This file.
4. [PRD.md](PRD.md): the section for the feature you're working on.
5. [architecture.md](architecture.md) and [decisions.md](decisions.md): before structural or dependency changes.
6. [design-system.md](design-system.md): before building any UI.
7. [data-import.md](data-import.md): before touching any import code.

## 2. Source of truth

| Question | Where the answer lives |
|---|---|
| What are we building and why? | PRD.md |
| How is it built? | architecture.md |
| Why was X chosen? | decisions.md |
| Build order and task status | plan.md |
| Current focus, session log, known issues | progress.md |
| Colours, fonts, components, UX | design-system.md |
| Import file formats | data-import.md (templates in docs/templates) |
| Database shape | `prisma/schema.prisma` |

If the docs and the code disagree, stop and flag it. Don't silently pick one.

## 3. How to work

1. **Pick the next task** from plan.md (current phase, first ⬜ task), or do what the owner asked. Stay within the current phase. Don't build later-phase features early.
2. **Keep changes small.** One feature or fix per change. Don't refactor unrelated code in the same change.
3. **Ask before you:**
   - add a new dependency or external service,
   - change the stack, folder structure or a data format,
   - change the database in a way that drops or renames data,
   - change scope, pricing logic or anything in the PRD.

   Record the outcome in decisions.md.
4. **When the work is done:**
   - run the checks (section 8),
   - update the task's status in plan.md,
   - update progress.md: current focus, a session log line, any new known issues,
   - if you made a decision, add it to decisions.md,
   - if behaviour changed from what the PRD says, update the PRD or flag it.
5. **Never claim something works unless you ran it.** If a check fails or was skipped, say so in progress.md and in your reply.

## 4. Code conventions

### General
- TypeScript in strict mode. No `any` unless commented with a reason.
- Read the docs for the **installed** versions of Next.js, Prisma and Better Auth before writing code against them. APIs change between versions; don't rely on memory.
- Match the style of surrounding code. Prefer clear names over comments; comment the *why*, not the *what*.
- Business logic goes in `src/server/services/<domain>`. Pages, server actions and route handlers stay thin.
- Third-party APIs are called only through `src/server/integrations/`.
- Server-only modules import `server-only`.
- Validate all external input with Zod schemas from `src/schemas`.
- Environment variables are read through one validated `env` module, never `process.env` scattered around. Every new variable is added to `.env.example`.
- **Product name:** never write the product name in code, UI copy, emails or metadata. Use `siteConfig` from `src/config/site.ts` (D-021). Identifiers stay generic (`siteConfig`, not `eduprepConfig`).
- **External services** (auth, payments, email, SMS, WhatsApp, meetings, judge, storage) are used only through their interface in `src/server/integrations/`, each with a dev or mock implementation (D-020). Feature code never imports a vendor SDK directly.

### Data
- **Money:** integer paise (`amountPaise`). Never floats. Format only for display.
- **Time:** store UTC (`timestamptz`), display in the user's time zone (default `Asia/Kolkata`).
- **IDs:** cuid/uuid primary keys. Content also has a unique `externalId` (D-010).
- **Schema changes:** only through Prisma migrations, with descriptive names. Never edit an applied migration.
- **Deletes:** content is archived, not hard-deleted, because attempts and results refer to it.
- **Settings over constants:** prices, free limits, commission and policy windows come from the `Setting` table, not hard-coded values.

### Next.js 16 (Cache Components)
- Reading cookies, the session (`getCurrentUser`, `requirePermission`) or the database must happen in a component inside `<Suspense>`, never at the top of a layout. Static parts of the page stay outside the boundary so they prerender.
- Don't call impure functions (`Date.now()`, `Math.random()`) while rendering; do it in a service function.
- Client components that read the URL (`usePathname`, `useSearchParams`) render inside `<Suspense>`, or dynamic routes fail to build.
- Never pass functions from a server component to a client component (e.g. a formatter); pass data or a named option.
- Long forms submit with `useFormSubmit` (src/hooks), not `<form action>`, so a validation error doesn't wipe the user's input (D-032).
- Public content reads from `"use cache"` functions with a tag; admin actions that change that content call `updateTag(tag)`.
- Middleware is `src/proxy.ts`. It only redirects signed-out visitors; it is not authorization.

### Security (non-negotiable)
- Every page, server action and route handler that touches protected data calls `requirePermission()` from `src/server/auth` (permissions are defined in `src/lib/permissions.ts`). Layout gates don't count: they don't re-run on client navigation.
- Paid content is checked against entitlements **on the server** on every request.
- Correct answers, hidden test cases and explanations of unsubmitted test questions are never sent to the browser.
- Prices come from the database, never from the client.
- Payment access is granted only by the verified Razorpay webhook.
- Webhooks verify signatures and are idempotent.
- Rate limit OTP, login, code runs/submissions and imports.
- Never commit secrets. Never log OTPs (except the local dev console), passwords, tokens or full payment details.
- Personal data (phone, email, resume) goes only to roles allowed in the PRD. Never send it to analytics.

### UI
The bar is a modern, polished product that is clearly better than existing prep sites. Follow [design-system.md](design-system.md).
- Use design tokens only: no hard-coded colours, font sizes or shadows in components. Both light and dark themes must work.
- Mobile-first: every student screen must work at 360 px width.
- Accessibility: WCAG 2.2 AA contrast, keyboard navigation, visible focus, labelled controls, never colour alone for meaning.
- Use shadcn/ui components from `src/components/ui` before writing new ones.
- Every form has labels, validation messages, and loading and error states.
- Every list has an empty state. Every async action has a loading state.
- Public pages (company, topic, pricing) are server-rendered with proper titles, descriptions and structured data.

## 5. Content rules
- Imported or AI-drafted content is always a **draft**. Only reviewers or super admins publish.
- No copying from other prep sites (D-019). Recalled questions are rewritten and labelled "memory-based".
- Every company fact has a source and the company page has a last-verified date.
- Questions must have an explanation. Coding problems must have a reference solution that passes every test.
- Test fixtures and seed data use clearly fake people and content.

## 6. Testing
- **Unit tests (Vitest)** for all pure logic: scoring, negative marking, readiness, import validation, entitlement checks, slot availability, price and coupon maths.
- **Integration tests** (`npm run test:integration`, in `tests/integration/`) for services that touch the database. They run against a separate `<db>_test` database that is emptied before each file; never point them at real data.
- **End-to-end tests (Playwright)** for core flows, at phone and desktop sizes: sign-up and onboarding, practice, take and submit a mock test, CSV import, checkout (Razorpay test mode or mocked), interview booking.
- External services (Razorpay, Judge0, Google, MSG91, Resend) are mocked in tests through the integrations layer.
- Bug fixes come with a test that would have caught the bug.

## 7. Git
- Default branch: `main`. Work on short-lived branches: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Conventional commit messages: `feat(practice): add bookmarks`, `fix(import): reject duplicate options`.
- Don't commit generated files, `.env`, uploads or local database data.
- AI agents: commit or push only when the owner asks.

## 8. Definition of done

A task is done only when **all** of these are true:

- [ ] It meets the requirement in the PRD (or the owner's request).
- [ ] `npm run check` passes (lint, type-check, unit tests, brand check).
- [ ] `npm run test:integration` passes when database code changed.
- [ ] Relevant end-to-end test added or updated, and passing.
- [ ] Works at 360 px width (student screens) and in light and dark themes.
- [ ] Uses design tokens and `siteConfig`; no hard-coded colours or product name.
- [ ] Permissions and entitlements checked on the server.
- [ ] New env variables are in `.env.example`; new decisions are in decisions.md.
- [ ] Task status updated in plan.md; progress.md updated.

## 9. Things not to do
- Don't build features from a later phase without the owner's approval.
- Don't add a dependency for something a few lines of code can do.
- Don't bypass the review workflow or publish content from code or scripts. The one exception is the dev/test fixture `npm run content:sample -- --publish`, which calls the workflow functions themselves and refuses to run in production (D-032).
- Don't disable lint rules, type checks or tests to make them pass.
- Don't run destructive database commands (reset, drop) against anything except a local database.
- Don't rewrite old entries in decisions.md. Add a superseding entry instead.
