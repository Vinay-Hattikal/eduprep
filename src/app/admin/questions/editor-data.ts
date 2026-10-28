import "server-only";

import type { EditorValues, TaxonomyOption } from "@/app/admin/questions/question-editor";
import { OPTION_LETTERS } from "@/lib/content/question-rules";
import { getTaxonomyTree, type getQuestion } from "@/server/services/questions";

export async function taxonomyOptions(): Promise<TaxonomyOption[]> {
  const tree = await getTaxonomyTree();
  return tree.map((s) => ({
    id: s.id,
    name: s.name,
    topics: s.topics.map((t) => ({ id: t.id, name: t.name, subtopics: t.subtopics })),
  }));
}

export const EMPTY_QUESTION: EditorValues = {
  externalId: "",
  subjectId: "",
  topicId: "",
  subtopicId: "",
  type: "SINGLE",
  text: "",
  code: "",
  codeLanguage: "",
  options: OPTION_LETTERS.map(() => ""),
  correctOptions: [],
  numericAnswer: "",
  tolerance: "",
  explanation: "",
  difficulty: "MEDIUM",
  expectedTimeSec: "60",
  passageExternalId: "",
  tags: "",
  source: "ORIGINAL",
};

type LoadedQuestion = NonNullable<Awaited<ReturnType<typeof getQuestion>>>;

export function toEditorValues(q: LoadedQuestion): EditorValues {
  return {
    id: q.id,
    externalId: q.externalId,
    subjectId: q.subjectId,
    topicId: q.topicId,
    subtopicId: q.subtopicId ?? "",
    type: q.type,
    text: q.text,
    code: q.code ?? "",
    codeLanguage: q.codeLanguage ?? "",
    options: OPTION_LETTERS.map((_, i) => q.options[i] ?? ""),
    correctOptions: q.correctOptions,
    numericAnswer: q.numericAnswer?.toString() ?? "",
    tolerance: q.tolerance?.toString() ?? "",
    explanation: q.explanation,
    difficulty: q.difficulty,
    expectedTimeSec: String(q.expectedTimeSec),
    passageExternalId: q.passage?.externalId ?? "",
    tags: q.tags.join(", "),
    source: q.source,
  };
}
