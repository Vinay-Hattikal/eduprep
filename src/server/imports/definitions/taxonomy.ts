// Taxonomy import: subjects -> topics -> subtopics (data-import.md 4.1).
// Slugs are permanent; names and order can change. Topic slugs are unique across subjects.

import { CellReader } from "@/server/imports/cells";
import type { ParsedRow } from "@/server/imports/parse";
import {
  finishRow,
  type DbReader,
  type ImportDefinition,
  type ValidatedRow,
} from "@/server/imports/types";

export type TaxonomyValue = {
  subject: { slug: string; name: string };
  topic: { slug: string; name: string; order: number | null };
  subtopic: { slug: string; name: string } | null;
};

export type TaxonomyContext = {
  subjects: Map<string, { name: string }>;
  topics: Map<string, { name: string; order: number; subjectSlug: string }>;
  /** Key: `${topicSlug}/${subtopicSlug}` */
  subtopics: Map<string, { name: string }>;
};

export function validateTaxonomyRows(
  rows: ParsedRow[],
  ctx: TaxonomyContext,
): ValidatedRow<TaxonomyValue>[] {
  const fileSubjects = new Map<string, { name: string; row: number }>();
  const fileTopics = new Map<string, { subjectSlug: string; name: string; row: number }>();
  const fileSubtopics = new Map<string, { name: string; row: number }>();

  return rows.map((row) => {
    const r = new CellReader(row.cells);
    const subjectSlug = r.slug("subject_slug");
    const subjectName = r.required("subject_name");
    const topicSlug = r.slug("topic_slug");
    const topicName = r.required("topic_name");
    const subtopicSlug = r.slug("subtopic_slug", { required: false });
    const subtopicName = r.optional("subtopic_name");
    const order = r.int("order", { required: false, min: 0, max: 10_000 });

    if (subtopicSlug && !subtopicName)
      r.error("subtopic_name", "Required when subtopic_slug is set.");
    if (!subtopicSlug && subtopicName)
      r.error("subtopic_slug", "Required when subtopic_name is set.");

    if (subjectSlug && subjectName) {
      const seen = fileSubjects.get(subjectSlug);
      if (seen && seen.name !== subjectName)
        r.error("subject_name", `Row ${seen.row} names this subject "${seen.name}".`);
      else if (!seen) fileSubjects.set(subjectSlug, { name: subjectName, row: row.rowNumber });
    }

    if (topicSlug && subjectSlug && topicName) {
      const seen = fileTopics.get(topicSlug);
      if (seen && seen.subjectSlug !== subjectSlug)
        r.error(
          "topic_slug",
          `Row ${seen.row} puts "${topicSlug}" under "${seen.subjectSlug}". Topic slugs are unique across subjects.`,
        );
      else if (seen && seen.name !== topicName)
        r.error("topic_name", `Row ${seen.row} names this topic "${seen.name}".`);
      else if (!seen)
        fileTopics.set(topicSlug, { subjectSlug, name: topicName, row: row.rowNumber });

      const existing = ctx.topics.get(topicSlug);
      if (existing && existing.subjectSlug !== subjectSlug)
        r.error(
          "topic_slug",
          `"${topicSlug}" already belongs to "${existing.subjectSlug}". Slugs can't move between subjects.`,
        );
    }

    if (topicSlug && subtopicSlug && subtopicName) {
      const key = `${topicSlug}/${subtopicSlug}`;
      const seen = fileSubtopics.get(key);
      if (seen) r.error("subtopic_slug", `Same subtopic as row ${seen.row}.`);
      else fileSubtopics.set(key, { name: subtopicName, row: row.rowNumber });
    }

    if (r.hasErrors || !subjectSlug || !subjectName || !topicSlug || !topicName) {
      return finishRow<TaxonomyValue>(row, r.messages, undefined, null);
    }

    const value: TaxonomyValue = {
      subject: { slug: subjectSlug, name: subjectName },
      topic: { slug: topicSlug, name: topicName, order: order ?? null },
      subtopic: subtopicSlug && subtopicName ? { slug: subtopicSlug, name: subtopicName } : null,
    };

    const subject = ctx.subjects.get(subjectSlug);
    const topic = ctx.topics.get(topicSlug);
    const subtopic = value.subtopic
      ? ctx.subtopics.get(`${topicSlug}/${value.subtopic.slug}`)
      : undefined;
    const isNew = !subject || !topic || (value.subtopic !== null && !subtopic);
    const changed =
      subject?.name !== subjectName ||
      topic?.name !== topicName ||
      (order !== undefined && topic?.order !== order) ||
      (value.subtopic !== null && subtopic?.name !== value.subtopic.name);

    return finishRow(row, r.messages, value, isNew ? "CREATE" : changed ? "UPDATE" : "UNCHANGED");
  });
}

async function loadTaxonomyContext(db: DbReader): Promise<TaxonomyContext> {
  const [subjects, topics, subtopics] = await Promise.all([
    db.subject.findMany(),
    db.topic.findMany({ include: { subject: { select: { slug: true } } } }),
    db.subtopic.findMany({ include: { topic: { select: { slug: true } } } }),
  ]);
  return {
    subjects: new Map(subjects.map((s) => [s.slug, { name: s.name }])),
    topics: new Map(
      topics.map((t) => [t.slug, { name: t.name, order: t.order, subjectSlug: t.subject.slug }]),
    ),
    subtopics: new Map(subtopics.map((s) => [`${s.topic.slug}/${s.slug}`, { name: s.name }])),
  };
}

export const taxonomyImport: ImportDefinition<TaxonomyValue> = {
  type: "TAXONOMY",
  label: "Taxonomy",
  description: "Subjects, topics and subtopics. Import this before questions.",
  permission: "taxonomy.manage",
  template: "taxonomy.csv",
  allowZip: false,
  columns: [
    { name: "subject_slug", required: true },
    { name: "subject_name", required: true },
    { name: "topic_slug", required: true },
    { name: "topic_name", required: true },
    { name: "subtopic_slug", required: false },
    { name: "subtopic_name", required: false },
    { name: "order", required: false },
  ],

  async validate(rows, _file, db) {
    return validateTaxonomyRows(rows, await loadTaxonomyContext(db));
  },

  async commit(rows, { tx }) {
    const outcomes = [];
    for (const row of rows) {
      const { subject, topic, subtopic } = row.value!;

      const existingSubject = await tx.subject.findUnique({ where: { slug: subject.slug } });
      const subjectRecord = existingSubject
        ? await tx.subject.update({
            where: { id: existingSubject.id },
            data: { name: subject.name },
          })
        : await tx.subject.create({
            data: { slug: subject.slug, name: subject.name, order: await tx.subject.count() },
          });

      const existingTopic = await tx.topic.findUnique({ where: { slug: topic.slug } });
      const topicOrder =
        topic.order ??
        existingTopic?.order ??
        (await tx.topic.count({ where: { subjectId: subjectRecord.id } }));
      const topicRecord = existingTopic
        ? await tx.topic.update({
            where: { id: existingTopic.id },
            data: { name: topic.name, order: topicOrder },
          })
        : await tx.topic.create({
            data: {
              slug: topic.slug,
              name: topic.name,
              order: topicOrder,
              subjectId: subjectRecord.id,
            },
          });

      let entityId = topicRecord.id;
      if (subtopic) {
        const existing = await tx.subtopic.findUnique({
          where: { topicId_slug: { topicId: topicRecord.id, slug: subtopic.slug } },
        });
        const record = existing
          ? await tx.subtopic.update({ where: { id: existing.id }, data: { name: subtopic.name } })
          : await tx.subtopic.create({
              data: {
                slug: subtopic.slug,
                name: subtopic.name,
                topicId: topicRecord.id,
                order: await tx.subtopic.count({ where: { topicId: topicRecord.id } }),
              },
            });
        entityId = record.id;
      }
      outcomes.push({ rowNumber: row.rowNumber, entityId, action: row.action! });
    }
    return outcomes;
  },
};
