import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Briefcase,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Code2,
  GraduationCap,
  History,
  MonitorCheck,
  Target,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { siteConfig } from "@/config/site";

const features = [
  {
    icon: BadgeCheck,
    title: "Verified company patterns",
    description:
      "Rounds, sections, timers and eligibility for each company, with sources and a last-verified date on every page.",
  },
  {
    icon: MonitorCheck,
    title: "The real exam interface",
    description:
      "Mock tests copy the platform you'll actually sit: section locks, per-section timers and no-going-back rules.",
  },
  {
    icon: Target,
    title: "Readiness score per company",
    description:
      "See exactly how ready you are for each target company, and which topics to fix first.",
  },
  {
    icon: History,
    title: "Recently asked questions",
    description:
      "Questions tagged with when candidates reported them, so you practise what's being asked now.",
  },
  {
    icon: Code2,
    title: "Coding with a real judge",
    description:
      "Company-tagged problems in C, C++, Java, Python and JavaScript, plus timed online-assessment mode.",
  },
  {
    icon: Video,
    title: "1:1 mock interviews",
    description:
      "Google Meet interviews with engineers who know your target company, and a detailed scorecard after.",
  },
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

const readinessTopics = [
  { topic: "Time and Work", value: 82 },
  { topic: "Blood Relations", value: 64 },
  { topic: "Pointers in C", value: 41 },
];

export default function LandingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--secondary),transparent_60%)]"
        />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="space-y-6">
            <Badge variant="secondary" className="h-6 px-3">
              For BE/BTech freshers and experienced engineers
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Prepare for the company you want, not just any test
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">
              {siteConfig.name} gives you each company&apos;s real hiring pattern, practice for
              every subject, mock tests that look like the actual exam, and 1:1 mock interviews.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 px-5 text-base">
                <Link href="/sign-up">
                  Start preparing <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5 text-base">
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {["11 subjects", "130+ topics", "Real exam interfaces", "No ads"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Product preview */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <Card className="shadow-xl shadow-primary/5">
              <CardContent className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Readiness for your target company
                    </p>
                    <p className="tabular text-4xl font-semibold tracking-tight">62%</p>
                  </div>
                  <Badge className="bg-highlight text-highlight-foreground">Drive in 18 days</Badge>
                </div>
                <div className="space-y-3">
                  {readinessTopics.map((item) => (
                    <div key={item.topic} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span>{item.topic}</span>
                        <span className="tabular text-muted-foreground">{item.value}%</span>
                      </div>
                      <Progress value={item.value} aria-label={`${item.topic} mastery`} />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 border-t pt-4 text-xs">
                  <Badge variant="outline">
                    <Clock /> Section 2 · 18:42 left
                  </Badge>
                  <Badge variant="outline">
                    <History /> Asked in Aug 2026
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card className="absolute -right-4 -bottom-10 hidden w-56 py-3 shadow-lg sm:block">
              <CardContent className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-success/15 text-success">
                  <CalendarCheck className="size-5" aria-hidden="true" />
                </div>
                <div className="text-sm">
                  <p className="font-medium">Mock interview</p>
                  <p className="text-muted-foreground">Tomorrow, 7:00 PM</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t bg-surface">
        <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-16 sm:px-6 lg:py-20">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Built around how companies actually hire
            </h2>
            <p className="text-muted-foreground">
              Generic question banks don&apos;t tell you what your company tests, in what format, or
              how ready you are. We do.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title}>
                <CardContent className="space-y-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <feature.icon className="size-5" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20">
        <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="space-y-3">
                <span className="tabular flex size-9 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Audience */}
      <section id="who-its-for" className="scroll-mt-20 border-t bg-surface">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-16 sm:px-6 md:grid-cols-2 lg:py-20">
          <Card>
            <CardContent className="space-y-4">
              <GraduationCap className="size-8 text-primary" aria-hidden="true" />
              <h2 className="text-2xl font-semibold tracking-tight">Freshers</h2>
              <p className="text-muted-foreground">
                Final- and pre-final-year BE/BTech students preparing for campus and off-campus
                drives.
              </p>
              <ul className="space-y-2 text-sm">
                {[
                  "Aptitude, reasoning, verbal and CS fundamentals",
                  "Company mocks in the real exam format",
                  "Eligibility checks for every company",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4">
              <Briefcase className="size-8 text-primary" aria-hidden="true" />
              <h2 className="text-2xl font-semibold tracking-tight">Experienced engineers</h2>
              <p className="text-muted-foreground">
                1–8 years in, switching roles or moving from service to product companies.
              </p>
              <ul className="space-y-2 text-sm">
                {[
                  "DSA and system design for SDE interviews",
                  "Role tracks: backend, frontend, data, QA, DevOps",
                  "Mock interviews with engineers from your target company",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Subjects */}
      <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">
          Every subject placement tests cover
        </h2>
        <ul className="flex flex-wrap gap-2">
          {subjects.map((subject) => (
            <li key={subject}>
              <Badge variant="outline" className="h-8 px-3 text-sm">
                {subject}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      {/* CTA */}
      <section className="px-4 pb-16 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 rounded-2xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              Your next drive is closer than you think
            </h2>
            <p className="opacity-90">
              Start with your target company and see where you stand today.
            </p>
          </div>
          <Button asChild size="lg" variant="secondary" className="h-11 px-5 text-base">
            <Link href="/sign-up">
              Get started free <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
