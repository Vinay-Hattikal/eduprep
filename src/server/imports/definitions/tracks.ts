// Experienced-track imports (data-import.md 4.7, 4.8): role tracks, and system design /
// low-level design questions.

import type { Difficulty, DesignKind, InterviewAudience } from "@/generated/prisma/enums";
import { CellReader } from "@/server/imports/cells";
import type { ParsedRow } from "@/server/imports/parse";
import {
  finishRow,
  sameValues,
  type CommitOutcome,
  type DbReader,
  type ImportDefinition,
  type ValidatedRow,
} from "@/server/imports/types";

const AUDIENCES: Record<string, InterviewAudience> = {
  fresher: "FRESHER",
  experienced: "EXPERIENCED",
  both: "BOTH",
};
const DIFFICULTIES: Record<string, Difficulty> = { easy: "EASY", medium: "MEDIUM", hard: "HARD" };
const KINDS: Record<string, DesignKind> = {
  system_design: "SYSTEM_DESIGN",
  low_level_design: "LOW_LEVEL_DESIGN",
  technical: "TECHNICAL",
  hr: "HR",
};

function duplicate(
  seen: Map<string, number>,
  key: string,
  r: CellReader,
  column: string,
  rowNumber: number,
) {
  const first = seen.get(key);
  if (first) r.error(column, `Same as row ${first}.`);
  else seen.set(key, rowNumber);
}

// ---------- role tracks ----------

export type TrackValue = {
  slug: string;
  name: string;
  description: string;
  roadmap: string;
  audience: InterviewAudience;
  order: number;
  topicIds: string[];
  interviewTypes: string[];
};

export type TrackContext = {
  topics: Map<string, string>; // slug → id
  interviewTypes: Set<string>;
  existing: Map<string, TrackValue & { id: string }>;
};

export function validateTrackRows(
  rows: ParsedRow[],
  ctx: TrackContext,
): ValidatedRow<TrackValue>[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const r = new CellReader(row.cells);
    const slug = r.slug("slug");
    if (slug) duplicate(seen, slug, r, "slug", row.rowNumber);
    const name = r.required("name");
    const description = r.required("description");
    const roadmap = r.markdown("roadmap");
    const audience = r.choice("audience", AUDIENCES);
    const order = r.int("order", { required: false, min: 0, max: 1000 }) ?? 0;
    const topicIds: string[] = [];
    for (const topic of r.list("topics")) {
      const id = ctx.topics.get(topic);
      if (!id) r.error("topics", `"${topic}" isn't a topic. Check taxonomy.csv.`);
      else if (!topicIds.includes(id)) topicIds.push(id);
    }
    if (!r.list("topics").length) r.error("topics", "List at least one topic slug.");
    const interviewTypes = r.list("interview_types");
    for (const type of interviewTypes) {
      if (!ctx.interviewTypes.has(type))
        r.warn("interview_types", `"${type}" isn't an interview type; it won't show.`);
    }
    if (r.hasErrors || !slug || !name || !description || !roadmap || !audience)
      return finishRow<TrackValue>(row, r.messages, undefined, null);
    const value: TrackValue = {
      slug,
      name,
      description,
      roadmap,
      audience,
      order,
      topicIds: topicIds.sort(),
      interviewTypes,
    };
    const existing = ctx.existing.get(slug);
    const action = !existing
      ? "CREATE"
      : sameValues({ ...existing, id: undefined }, value)
        ? "UNCHANGED"
        : "UPDATE";
    return finishRow(row, r.messages, value, action, existing?.id);
  });
}

export const roleTrackImport: ImportDefinition<TrackValue> = {
  type: "ROLE_TRACKS",
  label: "Role tracks",
  description:
    "Experienced-candidate tracks: topics, interview types and a roadmap. Live on import.",
  permission: "taxonomy.manage",
  template: "tracks/role-tracks.csv",
  allowZip: false,
  columns: [
    "slug",
    "name",
    "description",
    "audience",
    "topics",
    "interview_types",
    "order",
    "roadmap",
  ].map((name) => ({
    name,
    required: !["interview_types", "order"].includes(name),
  })),
  async validate(rows, _file, db) {
    const [topics, types, existing] = await Promise.all([
      db.topic.findMany({ select: { id: true, slug: true } }),
      db.interviewType.findMany({ select: { slug: true } }),
      db.roleTrack.findMany({ include: { topics: { select: { id: true } } } }),
    ]);
    return validateTrackRows(rows, {
      topics: new Map(topics.map((t) => [t.slug, t.id])),
      interviewTypes: new Set(types.map((t) => t.slug)),
      existing: new Map(
        existing.map((t) => [
          t.slug,
          {
            id: t.id,
            slug: t.slug,
            name: t.name,
            description: t.description,
            roadmap: t.roadmap,
            audience: t.audience,
            order: t.order,
            topicIds: t.topics.map((x) => x.id).sort(),
            interviewTypes: t.interviewTypes,
          },
        ]),
      ),
    });
  },
  async commit(rows, { tx }) {
    const outcomes: CommitOutcome[] = [];
    for (const row of rows) {
      const { topicIds, ...data } = row.value!;
      const topics = topicIds.map((id) => ({ id }));
      const track = await tx.roleTrack.upsert({
        where: { slug: data.slug },
        create: { ...data, status: "PUBLISHED", topics: { connect: topics } },
        update: { ...data, topics: { set: topics } },
      });
      outcomes.push({ rowNumber: row.rowNumber, entityId: track.id, action: row.action! });
    }
    return outcomes;
  },
};

// ---------- design questions ----------

export type DesignValue = {
  externalId: string;
  slug: string;
  kind: DesignKind;
  title: string;
  difficulty: Difficulty;
  prompt: string;
  requirements: string;
  approach: string;
  tradeoffs: string;
  followUps: string | null;
  companies: string[];
  tracks: string[];
  /** False when only new company links come in: the question itself isn't touched (D-054). */
  contentChanged?: boolean;
};

export type DesignContext = {
  companies: Set<string>;
  tracks: Set<string>;
  existing: Map<string, DesignValue & { id: string }>;
  slugs: Map<string, string>; // slug → externalId
};

export function validateDesignRows(
  rows: ParsedRow[],
  ctx: DesignContext,
): ValidatedRow<DesignValue>[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const r = new CellReader(row.cells);
    const externalId = r.externalId("external_id");
    if (externalId) duplicate(seen, externalId, r, "external_id", row.rowNumber);
    const slug = r.slug("slug");
    if (slug && externalId && ctx.slugs.has(slug) && ctx.slugs.get(slug) !== externalId) {
      r.error("slug", `"${slug}" is already used by ${ctx.slugs.get(slug)}.`);
    }
    const kind = r.choice("kind", KINDS);
    const title = r.required("title");
    const difficulty = r.choice("difficulty", DIFFICULTIES);
    const prompt = r.markdown("prompt");
    const requirements = r.markdown("requirements");
    const approach = r.markdown("approach");
    const tradeoffs = r.markdown("tradeoffs");
    const followUps = r.markdown("follow_ups", { required: false }) ?? null;
    const companies = r.list("companies");
    for (const c of companies)
      if (!ctx.companies.has(c)) r.warn("companies", `"${c}" isn't a company yet; it won't link.`);
    const tracks = r.list("tracks");
    for (const t of tracks)
      if (!ctx.tracks.has(t)) r.warn("tracks", `"${t}" isn't a role track yet.`);
    if (
      r.hasErrors ||
      !externalId ||
      !slug ||
      !kind ||
      !title ||
      !difficulty ||
      !prompt ||
      !requirements ||
      !approach ||
      !tradeoffs
    ) {
      return finishRow<DesignValue>(row, r.messages, undefined, null);
    }
    const value: DesignValue = {
      externalId,
      slug,
      kind,
      title,
      difficulty,
      prompt,
      requirements,
      approach,
      tradeoffs,
      followUps,
      companies,
      tracks,
    };
    const existing = ctx.existing.get(externalId);
    // Links are added, never removed, by an import, and links made in the admin panel stay, so
    // the row changes something only if its content differs or it names a new company.
    const contentChanged =
      !existing ||
      !sameValues({ ...existing, id: undefined, companies: [] }, { ...value, companies: [] });
    const newLinks = companies.filter(
      (c) => ctx.companies.has(c) && !existing?.companies.includes(c),
    );
    const action = !existing
      ? "CREATE"
      : contentChanged || newLinks.length
        ? "UPDATE"
        : "UNCHANGED";
    return finishRow(row, r.messages, { ...value, contentChanged }, action, existing?.id);
  });
}

async function designContext(db: DbReader, rows: ParsedRow[]): Promise<DesignContext> {
  const ids = rows.map((r) => r.cells.external_id?.trim() ?? "");
  const [companies, tracks, existing, slugs] = await Promise.all([
    db.company.findMany({ select: { slug: true } }),
    db.roleTrack.findMany({ select: { slug: true } }),
    db.designQuestion.findMany({
      where: { externalId: { in: ids } },
      include: { companies: { select: { company: { select: { slug: true } } } } },
    }),
    db.designQuestion.findMany({ select: { slug: true, externalId: true } }),
  ]);
  return {
    companies: new Set(companies.map((c) => c.slug)),
    tracks: new Set(tracks.map((t) => t.slug)),
    existing: new Map(
      existing.map((q) => [
        q.externalId,
        {
          id: q.id,
          externalId: q.externalId,
          slug: q.slug,
          kind: q.kind,
          title: q.title,
          difficulty: q.difficulty,
          prompt: q.prompt,
          requirements: q.requirements,
          approach: q.approach,
          tradeoffs: q.tradeoffs,
          followUps: q.followUps,
          companies: q.companies.map((c) => c.company.slug),
          tracks: q.tracks,
        },
      ]),
    ),
    slugs: new Map(slugs.map((s) => [s.slug, s.externalId])),
  };
}

export const designQuestionImport: ImportDefinition<DesignValue> = {
  type: "DESIGN_QUESTIONS",
  label: "Design questions",
  description: "System design and low-level design questions. Imported as drafts.",
  permission: "content.edit",
  template: "design/design-questions.csv",
  allowZip: false,
  columns: [
    "external_id",
    "slug",
    "kind",
    "title",
    "difficulty",
    "prompt",
    "requirements",
    "approach",
    "tradeoffs",
    "follow_ups",
    "companies",
    "tracks",
  ].map((name) => ({ name, required: !["follow_ups", "companies", "tracks"].includes(name) })),
  async validate(rows, _file, db) {
    return validateDesignRows(rows, await designContext(db, rows));
  },
  async commit(rows, { tx, batchId }) {
    const outcomes: CommitOutcome[] = [];
    const slugs = [...new Set(rows.flatMap((row) => row.value!.companies))];
    const companyIds = new Map(
      (
        await tx.company.findMany({
          where: { slug: { in: slugs } },
          select: { id: true, slug: true },
        })
      ).map((c) => [c.slug, c.id]),
    );
    const links: { companyId: string; designQuestionId: string }[] = [];
    for (const row of rows) {
      const { companies, contentChanged = true, ...value } = row.value!;
      // Imports never publish (D-010): changed questions go back to draft. A row that only adds
      // companies leaves the question as it is.
      const question = contentChanged
        ? await tx.designQuestion.upsert({
            where: { externalId: value.externalId },
            create: { ...value, status: "DRAFT", importBatchId: batchId },
            update: { ...value, status: "DRAFT", importBatchId: batchId },
            select: { id: true },
          })
        : await tx.designQuestion.findUniqueOrThrow({
            where: { externalId: value.externalId },
            select: { id: true },
          });
      // Named companies get a link; links added in the admin panel are kept (D-054, D-067).
      for (const slug of companies) {
        const companyId = companyIds.get(slug);
        if (companyId) links.push({ companyId, designQuestionId: question.id });
      }
      outcomes.push({ rowNumber: row.rowNumber, entityId: question.id, action: row.action! });
    }
    if (links.length) await tx.companyItem.createMany({ data: links, skipDuplicates: true });
    return outcomes;
  },
};
