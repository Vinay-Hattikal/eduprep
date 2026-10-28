# EduPrep

Company-wise placement preparation for BE/BTech freshers and experienced candidates: MCQ practice, coding platform, exam-style mock tests and paid 1:1 mock interviews on Google Meet. "EduPrep" is a working name.

## Status

Phases 1–5 and 7 are built. Phase 6 integrations (accounts, payments, messages, Meet, Docker, Redis) are built behind switches and wait for real keys and hosting, which come last. The admin panel can now create and edit everything that used to come only from imports (D-055). See [docs/progress.md](docs/progress.md).

## Documentation

| File | What it is |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Product requirements: what we're building and why |
| [docs/plan.md](docs/plan.md) | 6-phase implementation plan with task status |
| [docs/progress.md](docs/progress.md) | Current focus, known issues, session log |
| [docs/architecture.md](docs/architecture.md) | Stack, structure, data model, key flows |
| [docs/design-system.md](docs/design-system.md) | Colours, typography, components, UX principles |
| [docs/decisions.md](docs/decisions.md) | Decision log (why each choice was made) |
| [docs/rules.md](docs/rules.md) | How to work in this repo (humans and AI agents) |
| [docs/data-import.md](docs/data-import.md) | CSV standard for all content |
| [docs/templates/](docs/templates/) | Ready-to-fill CSV templates: taxonomy, 11 subjects, coding, companies |

## Stack

Next.js + TypeScript, Tailwind + shadcn/ui, PostgreSQL + Prisma, a PostgreSQL job queue, Judge0, Cloudflare R2, Razorpay, Google Calendar API (Meet), Resend, PostHog, Sentry. Better Auth, Docker and Redis + BullMQ arrive in Phase 6. Details in [docs/architecture.md](docs/architecture.md).

## Running locally

You need **Node 22**. No Docker and no database install: the npm scripts start a local PostgreSQL by themselves (embedded-postgres, data in `.data/postgres`, port 5444).

The coding platform judges code with your machine's compilers during development (D-033). Install **gcc/g++** (MinGW-w64 on Windows), a **JDK 17+** and **Python 3**; languages you don't have installed return a judge error.

```bash
cp .env.example .env     # then set AUTH_SECRET (command below)
npm install              # also generates the Prisma client
npm run db:deploy        # create the tables
npm run db:seed          # fictional test accounts for every role + default settings
npm run content:sample -- --publish   # optional: sample taxonomy, questions and company, published
npm run dev              # http://localhost:3000 (web server + background worker)
```

Generate `AUTH_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

Sign in at `/dev-login` by picking a seeded account (student, interviewer or any admin role). Real sign-in comes in Phase 6.

| Command | What it does |
|---|---|
| `npm run dev` | Starts PostgreSQL, the dev server and the background worker; stops them on Ctrl+C |
| `npm run db:start` / `db:stop` | Start PostgreSQL on its own / stop one left running |
| `npm run db:migrate` | Create a migration after changing `prisma/schema.prisma` |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run check` | Lint, type-check, unit tests, brand check |
| `npm run test:e2e` | Builds the app and runs browser tests on desktop and a 360 px phone |
| `npm run format` | Format with Prettier (also runs on commit) |
| `npm run worker` | Background worker on its own (`npm run dev` already starts it) |
| `npm run content:sample` | Loads every template in `docs/templates` through the real import pipeline |
| `npm run test:integration` | Tests against a real `eduprep_test` database (queue, imports, review workflow) |

## Going live

Every external service (payments, email, SMS, WhatsApp, Meet, Redis, Judge0) runs on a development stand-in until its keys are set. Step-by-step switch-over and hosting: [docs/deployment.md](docs/deployment.md).
