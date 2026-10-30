// How complete a company's content is (D-067): the checklist on its admin Overview tab, the
// question coverage of its test sections, and the next step to suggest. Pure, so the rules are
// unit-tested; src/server/services/company-readiness.ts gathers the counts.

import type { ContentStatus, RoundType, SectionType } from "@/generated/prisma/enums";

/** Rounds whose sections are tests a mock can copy (the rest are interviews and discussions). */
export const TEST_ROUND_TYPES: readonly RoundType[] = ["ONLINE_TEST", "CODING_TEST"];

/**
 * A section's items shared across its topics: as even as possible, the first topics taking the
 * remainder. "Create mock" (draftFromCompany) and the coverage check both use this split.
 */
export function splitAcrossTopics<T extends { id: string }>(
  count: number,
  topics: readonly T[],
): { topic: T; count: number }[] {
  if (!topics.length) return [];
  const per = Math.floor(count / topics.length);
  const extra = count % topics.length;
  return topics
    .map((topic, i) => ({ topic, count: per + (i < extra ? 1 : 0) }))
    .filter((t) => t.count > 0);
}

type SectionShape = {
  type: SectionType;
  questionCount: number;
  topics: readonly { id: string; name: string }[];
};
type RoundShape = { type: RoundType; sections: readonly SectionShape[] };

export const coverageKey = (type: SectionType, topicId: string) => `${type}:${topicId}`;

/**
 * How many published items each topic needs for the company mock, summed over sections (a topic
 * in two sections needs both shares, as when a mock is published).
 */
export function coverageNeeds(rounds: readonly RoundShape[]) {
  const needs = new Map<
    string,
    { type: SectionType; topicId: string; name: string; need: number }
  >();
  for (const round of rounds) {
    if (!TEST_ROUND_TYPES.includes(round.type)) continue;
    for (const section of round.sections)
      for (const { topic, count } of splitAcrossTopics(section.questionCount, section.topics)) {
        const key = coverageKey(section.type, topic.id);
        const entry = needs.get(key) ?? {
          type: section.type,
          topicId: topic.id,
          name: topic.name,
          need: 0,
        };
        entry.need += count;
        needs.set(key, entry);
      }
  }
  return needs;
}

export type Coverage = {
  type: SectionType;
  topicId: string;
  name: string;
  need: number;
  /** Published (and, for coding, judge-checked) items in the topic: what a mock draws from. */
  available: number;
  /** Of those, how many are tagged with this company. */
  tagged: number;
};

export type ReadinessInput = {
  status: ContentStatus;
  overview: string;
  hiringFor: readonly string[];
  stale: boolean;
  sources: number;
  rounds: readonly RoundShape[];
  questions: { published: number; draft: number };
  problems: { published: number; draft: number; checked: number };
  mocks: { published: number; draft: number };
  coverage: readonly Coverage[];
};

export type ChecklistTab =
  "profile" | "process" | "sources" | "questions" | "coding" | "mocks" | "overview";

export type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  /** What's there, or what's missing. */
  detail: string;
  tab: ChecklistTab;
  /** The next step, phrased as an instruction, when not done. */
  next: string;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Overview should say a few sentences about the company; the form only requires some text. */
export const MIN_OVERVIEW_CHARS = 80;

export function readinessChecklist(input: ReadinessInput): ChecklistItem[] {
  const testRounds = input.rounds.filter((r) => TEST_ROUND_TYPES.includes(r.type));
  const sections = testRounds.flatMap((r) => r.sections);
  const emptyRounds = testRounds.filter((r) => !r.sections.length).length;
  const noTopics = sections.filter((s) => !s.topics.length).length;
  const needsCoding =
    input.rounds.some((r) => r.type === "CODING_TEST") || sections.some((s) => s.type === "CODING");
  const short = input.coverage.filter((c) => c.available < c.need);

  const items: ChecklistItem[] = [
    {
      key: "profile",
      label: "Profile",
      done: input.overview.trim().length >= MIN_OVERVIEW_CHARS && input.hiringFor.length > 0,
      detail:
        input.overview.trim().length >= MIN_OVERVIEW_CHARS
          ? "Overview and who they hire"
          : `Overview is under ${MIN_OVERVIEW_CHARS} characters`,
      tab: "profile",
      next: "Write a few sentences about the company in its profile",
    },
    {
      key: "process",
      label: "Hiring process",
      done: input.rounds.length > 0 && emptyRounds === 0 && noTopics === 0,
      detail: !input.rounds.length
        ? "No rounds yet"
        : emptyRounds
          ? `${plural(emptyRounds, "test round")} without sections`
          : noTopics
            ? `${plural(noTopics, "section")} without topics`
            : `${plural(input.rounds.length, "round")}, ${plural(sections.length, "test section")}`,
      tab: "process",
      next: !input.rounds.length
        ? "Add the hiring rounds"
        : emptyRounds
          ? "Add the test sections to every test round"
          : "Pick the topics each section covers",
    },
    {
      key: "sources",
      label: "Sources",
      done: input.sources > 0,
      detail: input.sources ? plural(input.sources, "source") : "Needed before publishing",
      tab: "sources",
      next: "Add where the hiring facts come from",
    },
    {
      key: "verified",
      label: "Recently verified",
      done: !input.stale,
      detail: input.stale ? "Not checked for a while" : "Checked recently",
      tab: "overview",
      next: "Check the pattern against the sources and mark it verified",
    },
    {
      key: "questions",
      label: "MCQ questions",
      done: input.questions.published > 0,
      detail: `${input.questions.published} published, ${input.questions.draft} draft`,
      tab: "questions",
      next: "Add the questions this company asks",
    },
    {
      key: "coding",
      label: "Coding problems",
      done: !needsCoding || input.problems.published > 0,
      detail: needsCoding
        ? `${input.problems.published} published, ${input.problems.draft} draft (${input.problems.checked} passed the judge check)`
        : "No coding round",
      tab: "coding",
      next: "Add a coding problem with its tests and solution",
    },
    {
      key: "coverage",
      label: "Enough questions for a mock",
      done: sections.length > 0 && short.length === 0,
      detail: !sections.length
        ? "Add test sections first"
        : short.length
          ? `Short: ${short
              .slice(0, 3)
              .map((c) => `${c.name} ${c.available}/${c.need}`)
              .join(", ")}${short.length > 3 ? ` and ${short.length - 3} more` : ""}`
          : "Every section topic has enough published items",
      tab: "process",
      next: short.length
        ? `Add ${short[0]!.type === "CODING" ? "problems" : "questions"} in ${short[0]!.name} (${short[0]!.available} of ${short[0]!.need})`
        : "Add test sections first",
    },
    {
      key: "mock",
      label: "Company mock test",
      done: input.mocks.published > 0,
      detail: input.mocks.published
        ? plural(input.mocks.published, "published mock")
        : input.mocks.draft
          ? "Drafted, not published"
          : "None yet",
      tab: "mocks",
      next: input.mocks.draft ? "Publish the company mock" : "Create the company mock",
    },
    {
      key: "published",
      label: "Company published",
      done: input.status === "PUBLISHED",
      detail: input.status === "PUBLISHED" ? "Live for students" : "Draft: students can't see it",
      tab: "overview",
      next: "Publish the company and its content",
    },
  ];
  return items;
}

/** The first unfinished step, for the "Next:" prompt. */
export function nextStep(items: readonly ChecklistItem[]): ChecklistItem | null {
  return items.find((i) => !i.done) ?? null;
}
