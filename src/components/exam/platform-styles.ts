// How the exam screen looks, per test platform (PRD 4.6). Students practise on a layout like the
// one they'll meet in the real test: where the palette sits, what the buttons say, the header.
// Only layout and wording change; no third-party branding is copied.

import type { PlatformStyle } from "@/generated/prisma/enums";

export type ExamStyle = {
  /** Header bar classes. */
  header: string;
  /** Question palette beside the question (desktop). */
  palette: "left" | "right";
  /** Section switcher as tabs above the question. */
  sectionTabs: boolean;
  labels: {
    next: string;
    previous: string;
    markNext: string;
    clear: string;
    submit: string;
    endSection: string;
  };
};

export const EXAM_STYLES: Record<PlatformStyle, ExamStyle> = {
  GENERIC: {
    header: "border-b bg-card text-foreground",
    palette: "right",
    sectionTabs: true,
    labels: {
      next: "Save and next",
      previous: "Previous",
      markNext: "Mark for review",
      clear: "Clear",
      submit: "Submit test",
      endSection: "Finish section",
    },
  },
  TCS_ION: {
    header: "bg-primary text-primary-foreground",
    palette: "right",
    sectionTabs: true,
    labels: {
      next: "Save & Next",
      previous: "Back",
      markNext: "Mark for Review & Next",
      clear: "Clear Response",
      submit: "Submit",
      endSection: "Submit Section",
    },
  },
  AMCAT: {
    header: "border-b bg-secondary text-secondary-foreground",
    palette: "right",
    sectionTabs: false,
    labels: {
      next: "Next",
      previous: "Previous",
      markNext: "Mark & Next",
      clear: "Clear",
      submit: "Finish Test",
      endSection: "Finish Module",
    },
  },
  HACKERRANK: {
    header: "border-b bg-card text-foreground",
    palette: "left",
    sectionTabs: true,
    labels: {
      next: "Next",
      previous: "Previous",
      markNext: "Flag & Next",
      clear: "Clear",
      submit: "Submit test",
      endSection: "Next section",
    },
  },
};
