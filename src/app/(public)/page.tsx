import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, ArrowUpRight, BadgeCheck, CheckCircle2, Clock, Flag } from "lucide-react";
import { STATE_STYLES, type PaletteState } from "@/components/exam/palette-styles";
import { MasteryBar } from "@/components/learning/mastery-bar";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";
import { getPublishedCompanies } from "@/server/services/public-companies";

// The landing page (D-068, "Ink & Saffron"): show the product, not icon cards. The hero is a
// recreation of the exam window students sit; each feature tile shows a piece of the product.

const subjects = [
  "Quantitative Aptitude",
  "Logical Reasoning",
  "Verbal Ability",
  "Data Interpretation",
  "Operating Systems",
  "DBMS",
  "Computer Networks",
  "OOPs",
  "Data Structures & Algorithms",
  "Programming Languages",
  "Pseudocode",
];

/** Sample topics for the readiness preview (attempts > 0 so the level shows). */
const READINESS_PREVIEW = [
  { label: "Time and Work", score: 82, attempts: 20 },
  { label: "Blood Relations", score: 64, attempts: 20 },
  { label: "Pointers in C", score: 41, attempts: 20 },
];

const steps = [
  {
    title: "Pick your target companies",
    description:
      "Tell us where you're applying and when. We map each company's syllabus to your plan.",
  },
  {
    title: "Practise what matters",
    description:
      "Topic practice, company mocks and coding rounds, focused on your weakest areas first.",
  },
  {
    title: "Rehearse the real thing",
    description: "Take exam-style mocks, then book a mock interview to walk in confident.",
  },
];

export default function LandingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/70">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 ruled [mask-image:linear-gradient(to_bottom,black,transparent_85%)] [--rule:color-mix(in_oklab,var(--border)_60%,transparent)]"
        />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-12 lg:pt-20 lg:pb-28">
          <div className="space-y-7 lg:col-span-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-highlight" aria-hidden="true" />
              For BE/BTech freshers and experienced engineers
            </p>
            <h1 className="text-[2.4rem] leading-[1.05] font-extrabold tracking-[-0.035em] text-balance sm:text-[3.4rem] xl:text-[3.75rem]">
              Prepare for{" "}
              <span className="bg-linear-to-b from-highlight/40 to-highlight/40 [box-decoration-break:clone] bg-[length:100%_0.32em] bg-bottom bg-no-repeat">
                the company you want
              </span>
              , not just any test
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">
              {siteConfig.name} gives you each company&apos;s real hiring pattern, practice for
              every subject, mock tests that look like the actual exam, and 1:1 mock interviews.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/sign-up">
                  Start preparing <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>
            <dl className="grid max-w-md grid-cols-3 gap-4 border-t border-border pt-6">
              {[
                [String(subjects.length), "subjects"],
                ["130+", "topics"],
                ["0", "ads"],
              ].map(([value, label]) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="numeral text-3xl font-bold">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative lg:col-span-6">
            <ExamWindow />
            <div className="absolute -bottom-8 -left-4 hidden w-60 rounded-xl border border-border bg-card p-4 shadow-lift sm:block lg:-left-10">
              <p className="text-xs font-medium text-muted-foreground">
                Readiness for your target company
              </p>
              <div className="mt-1 flex items-end gap-2">
                <span className="numeral text-4xl font-bold">62%</span>
                <span className="mb-1 rounded bg-highlight/15 px-1.5 py-0.5 text-xs font-semibold text-highlight-foreground dark:text-highlight">
                  Drive in 18 days
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[62%] rounded-full bg-primary" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Companies */}
      <Suspense fallback={<div className="h-40" />}>
        <CompanyStrip />
      </Suspense>

      {/* Features */}
      <section id="features" className="scroll-mt-20 bg-surface">
        <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <h2 className="text-4xl leading-tight font-bold text-balance lg:col-span-7">
              Built around how companies actually hire
            </h2>
            <p className="self-end text-lg text-muted-foreground lg:col-span-5">
              Generic question banks don&apos;t tell you what your company tests, in what format, or
              how ready you are. We do.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Tile className="lg:col-span-7" title="The real exam interface">
              Mock tests copy the platform you&apos;ll actually sit: section locks, per-section
              timers and no-going-back rules.
              <QuestionPalette className="mt-6" />
            </Tile>
            <Tile className="lg:col-span-5" title="Readiness score per company">
              See exactly how ready you are for each target company, and which topics to fix first.
              <div className="mt-6 space-y-3">
                {READINESS_PREVIEW.map((topic) => (
                  <MasteryBar key={topic.label} {...topic} />
                ))}
              </div>
            </Tile>
            <Tile className="lg:col-span-4" title="Verified company patterns">
              Rounds, sections, timers and eligibility for each company, with sources and a
              last-verified date on every page.
              <p className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-success">
                <BadgeCheck className="size-4" aria-hidden="true" /> Verified this month · 2 sources
              </p>
            </Tile>
            <Tile className="lg:col-span-4" title="Recently asked questions">
              Questions tagged with when candidates reported them, so you practise what&apos;s being
              asked now.
              <div className="mt-5 flex flex-wrap gap-2">
                {["Asked this month", "Asked last month"].map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium"
                  >
                    <Clock className="size-3" aria-hidden="true" /> {label}
                  </span>
                ))}
              </div>
            </Tile>
            <Tile className="lg:col-span-4" title="Coding with a real judge">
              Company-tagged problems in C, C++, Java, Python and JavaScript, plus timed
              online-assessment mode.
              <div className="mt-5 flex items-center justify-between rounded-lg bg-inverse px-3 py-2 font-mono text-xs text-inverse-foreground">
                <span>6/6 tests · 41 ms</span>

                <span className="font-semibold text-success-on-inverse">Accepted</span>
              </div>
            </Tile>
            <Tile className="lg:col-span-12" title="1:1 mock interviews" horizontal>
              Google Meet interviews with engineers who know your target company, and a detailed
              scorecard after.
            </Tile>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-20 sm:px-6 lg:py-24">
          <h2 className="text-4xl font-bold">How it works</h2>
          <ol className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((step, index) => (
              <li key={step.title} className="space-y-3 border-t-2 border-foreground pt-5">
                <span className="numeral block text-5xl font-bold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Audience */}
      <section id="who-its-for" className="scroll-mt-20 border-y border-border/70">
        <div className="mx-auto grid w-full max-w-6xl md:grid-cols-2">
          <Audience
            title="Freshers"
            lead="Final- and pre-final-year BE/BTech students preparing for campus and off-campus drives."
            points={[
              "Aptitude, reasoning, verbal and CS fundamentals",
              "Company mocks in the real exam format",
              "Eligibility checks for every company",
            ]}
          />
          <Audience
            inverse
            title="Experienced engineers"
            lead="1–8 years in, switching roles or moving from service to product companies."
            points={[
              "DSA and system design for SDE interviews",
              "Role tracks: backend, frontend, data, QA, DevOps",
              "Mock interviews with engineers from your target company",
            ]}
          />
        </div>
      </section>

      {/* Subjects */}
      <section className="mx-auto w-full max-w-6xl space-y-8 px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-bold">Every subject placement tests cover</h2>
        <ul className="flex flex-wrap gap-x-3 gap-y-3 font-heading text-xl font-semibold tracking-tight text-foreground/85 sm:text-2xl">
          {subjects.map((subject, index) => (
            <li key={subject} className="flex items-center gap-3">
              {subject}
              {index < subjects.length - 1 ? (
                <span className="size-1.5 rounded-full bg-highlight" aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* CTA */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-6 overflow-hidden rounded-2xl bg-primary px-6 py-12 text-primary-foreground sm:px-12 md:flex-row md:items-center md:justify-between">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 ruled opacity-15"
          />
          <div className="relative space-y-2">
            <h2 className="text-3xl font-bold">Your next drive is closer than you think</h2>
            <p className="text-lg opacity-90">
              Start with your target company and see where you stand today.
            </p>
          </div>
          <Button asChild size="lg" variant="secondary" className="relative">
            <Link href="/sign-up">
              Get started free <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

/** A feature tile: a title, a line of copy, and a small piece of the product under it. */
function Tile({
  title,
  children,
  className,
  horizontal,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  horizontal?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-6 sm:p-7",
        horizontal && "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <h3 className="font-heading text-xl font-semibold tracking-tight">{title}</h3>
      <div className={cn("text-muted-foreground", horizontal ? "max-w-xl" : "mt-2")}>
        {children}
      </div>
    </div>
  );
}

function Audience({
  title,
  lead,
  points,
  inverse,
}: {
  title: string;
  lead: string;
  points: string[];
  inverse?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-5 px-4 py-16 sm:px-10 lg:py-20",
        inverse ? "bg-inverse text-inverse-foreground" : "bg-surface",
      )}
    >
      <h2 className="text-3xl font-bold">{title}</h2>
      <p
        className={cn(
          "max-w-md text-lg",
          inverse ? "text-inverse-foreground/75" : "text-muted-foreground",
        )}
      >
        {lead}
      </p>
      <ul className="space-y-3">
        {points.map((point) => (
          <li key={point} className="flex gap-3">
            <CheckCircle2
              className={cn("mt-0.5 size-5 shrink-0", inverse ? "text-highlight" : "text-primary")}
              aria-hidden="true"
            />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Published companies to start from (cached with the companies list). */
async function CompanyStrip() {
  const companies = (await getPublishedCompanies()).slice(0, 8);
  if (!companies.length) return null;
  return (
    <section className="border-b border-border/70">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 lg:flex-row lg:items-center">
        <p className="shrink-0 text-sm font-semibold tracking-[0.08em] text-muted-foreground uppercase lg:w-48">
          Start with a company
        </p>
        <ul className="flex flex-1 flex-wrap gap-2">
          {companies.map((company) => (
            <li key={company.id}>
              <Link
                href={`/companies/${company.slug}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 font-heading text-base font-semibold tracking-tight transition-colors hover:border-primary hover:text-primary"
              >
                {company.name}
                <ArrowUpRight className="size-4 opacity-60" aria-hidden="true" />
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/companies"
              className="inline-flex items-center gap-1 px-3 py-2 text-sm font-semibold text-primary hover:underline"
            >
              All companies <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}

// ---------- the exam window (illustration, not interactive) ----------

/** The preview's chips: real palette states, plus the question on screen. */
const PREVIEW: (PaletteState | "current")[] = [
  "answered",
  "answered",
  "review",
  "answered",
  "not-answered",
  "answered",
  "current",
  ...Array<PaletteState>(8).fill("not-visited"),
];

function QuestionPalette({ className }: { className?: string }) {
  return (
    <div className={cn("grid max-w-xs grid-cols-5 gap-1.5", className)} aria-hidden="true">
      {PREVIEW.map((state, i) => (
        <span
          key={i}
          className={cn(
            "tabular flex aspect-square items-center justify-center rounded-md border text-xs font-semibold",
            state === "current"
              ? "border-primary bg-card text-foreground ring-2 ring-primary/30"
              : STATE_STYLES[state],
          )}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}

function ExamWindow() {
  return (
    <figure
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-float"
      aria-label="A mock test in the exam interface"
    >
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5 text-xs">
        <div className="flex gap-1">
          {["Quant", "Reasoning", "Verbal"].map((section, i) => (
            <span
              key={section}
              className={cn(
                "rounded-md px-2.5 py-1 font-semibold",
                i === 0 ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {section}
            </span>
          ))}
        </div>
        <span className="tabular inline-flex items-center gap-1.5 rounded-md bg-inverse px-2 py-1 font-mono font-semibold text-inverse-foreground">
          <Clock className="size-3" aria-hidden="true" /> 18:42
        </span>
      </div>
      <div className="grid gap-6 p-5 sm:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Question 7 of 20 · Percentages
          </p>
          <p className="font-medium text-foreground">
            A price rises by 20% and then falls by 20%. What is the net change?
          </p>
          <ul className="space-y-2 text-sm">
            {["No change", "4% decrease", "4% increase", "2% decrease"].map((option, i) => (
              <li
                key={option}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2",
                  i === 1
                    ? "border-primary bg-secondary text-secondary-foreground"
                    : "border-border",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full border text-[0.65rem] font-bold",
                    i === 1 ? "border-primary bg-primary text-primary-foreground" : "border-border",
                  )}
                >
                  {"ABCD"[i]}
                </span>
                {option}
              </li>
            ))}
          </ul>
          <div className="flex gap-2 pt-1 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium">
              <Flag className="size-3" aria-hidden="true" /> Mark for review
            </span>
            <span className="rounded-md bg-primary px-2.5 py-1 font-semibold text-primary-foreground">
              Save &amp; next
            </span>
          </div>
        </div>
        <div className="hidden border-l border-border pl-5 sm:block">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Questions</p>
          <QuestionPalette />
        </div>
      </div>
    </figure>
  );
}
