// Problem form values, kept outside the client form so server pages can use the defaults.

import { CODING_LANGUAGE_IDS } from "@/lib/coding/languages";

export type ProblemFormValues = {
  id?: string;
  externalId: string;
  slug: string;
  title: string;
  difficulty: string;
  topicIds: string[];
  languages: string[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  scoring: string;
  checker: string;
  source: string;
  hints: string[];
  editorial: string | null;
};

export const EMPTY_PROBLEM: ProblemFormValues = {
  externalId: "",
  slug: "",
  title: "",
  difficulty: "EASY",
  topicIds: [],
  languages: [...CODING_LANGUAGE_IDS],
  statement: "",
  inputFormat: "",
  outputFormat: "",
  constraints: "",
  timeLimitMs: 1000,
  memoryLimitMb: 256,
  scoring: "ALL_OR_NOTHING",
  checker: "exact",
  source: "ORIGINAL",
  hints: [],
  editorial: null,
};
