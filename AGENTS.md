# AGENTS.md

Instructions for AI coding agents working in this repo.

EduPrep is a company-wise placement preparation platform for BE/BTech freshers and experienced candidates: MCQ practice, a coding judge, exam-style mock tests and paid Google Meet mock interviews. Admins upload all content.

## Before you change anything

1. Read [docs/progress.md](docs/progress.md): current focus, known issues.
2. Read [docs/plan.md](docs/plan.md): current phase and its tasks.
3. Read [docs/rules.md](docs/rules.md): how to work here, conventions, definition of done.
4. Read the relevant section of [docs/PRD.md](docs/PRD.md).
5. For structural, dependency or data-format changes, read [docs/architecture.md](docs/architecture.md) and [docs/decisions.md](docs/decisions.md) first.
6. For any UI, follow [docs/design-system.md](docs/design-system.md).
7. For import code, follow [docs/data-import.md](docs/data-import.md) exactly; templates are in [docs/templates/](docs/templates/).

## Must follow

- Stay inside the current phase. Ask before adding dependencies or changing the stack, schema shape, data formats or scope.
- Read the docs for the installed versions of Next.js, Prisma and Better Auth before using their APIs.
- Check permissions and entitlements on the server. Never send answers or hidden tests to the browser.
- Money is stored as integer paise; times as UTC.
- Never hard-code the product name (use `siteConfig`), colours or prices (use settings).
- Real auth, payments, messaging and hosting come in Phase 6. Until then, use the dev/mock providers behind their interfaces.
- Next.js 16 with Cache Components: anything reading cookies, the session or the database renders inside `<Suspense>`; pages and actions call `requirePermission()` themselves.
- No Docker for now (D-027). The local database is started by `scripts/with-db.mjs`.
- Run `npm run check` before saying a task is done; also `npm run test:integration` for database code and `npm run test:e2e` for UI changes.
- Long-running work goes through the job queue (`enqueueJob()`), not request handlers. No Redis until Phase 6 (D-029).
- At the end of a session, update the task status in docs/plan.md and docs/progress.md (and decisions.md if you decided something).
- Don't claim something works unless you ran it.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
