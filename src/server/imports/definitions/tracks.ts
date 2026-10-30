// Experienced-track imports (data-import.md 4.7, 4.8): role tracks, and system design /
// low-level design questions.

import type { Difficulty, DesignKind, InterviewAudience } from "@/generated/prisma/enums";
import { CellReader } from "@/server/imports/cells";
import {
  COMPANY_LINK_COLUMNS,
  hasCompanyColumn,
  linksChanged,
  loadCompanySlugs,
  readCompanyLinks,
  warnUnlinked,
  writeCompanyLinks,
  type CompanyLinks,
  type ExistingLink,
} from "@/server/imports/company-links";
import { todayUtc } from "@/server/imports/definitions/companies";
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

export type DesignContent = {
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
  tracks: string[];
};

export type DesignValue = DesignContent & {
  /** The companies column, like question and coding files (D-054, D-067). */
  links?: CompanyLinks;
  /** False when only the company links changed: the question itself isn't touched. */
  contentChanged?: boolean;
};

export type DesignContext = {
  companies: Map<string, { id: string }>;
  companyColumn: boolean;
  today: Date;
  tracks: Set<string>;
  existing: Map<string, DesignContent & { id: string; links: ExistingLink[] }>;
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
    const links = readCompanyLinks(r, ctx.companyColumn, ctx.companies, ctx.today);
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
    const content: DesignContent = {
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
      tracks,
    };
    const existing = ctx.existing.get(externalId);
    const contentSame =
      !!existing && sameValues({ ...existing, id: undefined, links: undefined }, content);
    const linksDiffer = linksChanged(links, existing?.links ?? []);
    warnUnlinked(r, links, existing?.links ?? [], ctx.companies);
    const action = !existing ? "CREATE" : contentSame && !linksDiffer ? "UNCHANGED" : "UPDATE";
    return finishRow(
      row,
      r.messages,
      { ...content, links, contentChanged: !contentSame },
      action,
      existing?.id,
    );
  });
}

async function designContext(
  db: DbReader,
  rows: ParsedRow[],
  headers: readonly string[],
): Promise<DesignContext> {
  const ids = rows.map((r) => r.cells.external_id?.trim() ?? "");
  const [companies, tracks, existing, slugs] = await Promise.all([
    loadCompanySlugs(db),
    db.roleTrack.findMany({ select: { slug: true } }),
    db.designQuestion.findMany({
      where: { externalId: { in: ids } },
      include: { companies: { select: { companyId: true, askedIn: true } } },
    }),
    db.designQuestion.findMany({ select: { slug: true, externalId: true } }),
  ]);
  return {
    companies,
    companyColumn: hasCompanyColumn(headers),
    today: todayUtc(),
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
          tracks: q.tracks,
          links: q.companies,
        },
      ]),
    ),
    slugs: new Map(slugs.map((s) => [s.slug, s.externalId])),
  };
}

export const designQuestionImport: ImportDefinition<DesignValue> = {
  type: "DESIGN_QUESTIONS",
  label: "Design questions",
  description:
    "System design, low-level design, technical and HR interview questions. Imported as drafts.",
  permission: "content.edit",
  template: "design/design-questions.csv",
  allowZip: false,
  columns: [
    ...[
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
      "tracks",
    ].map((name) => ({ name, required: !["follow_ups", "tracks"].includes(name) })),
    ...COMPANY_LINK_COLUMNS,
  ],
  async validate(rows, file, db) {
    return validateDesignRows(rows, await designContext(db, rows, file.headers));
  },
  async commit(rows, { tx, batchId }) {
    const outcomes: CommitOutcome[] = [];
    for (const row of rows) {
      const { links = null, contentChanged = true, ...value } = row.value!;
      // Imports never publish (D-010): changed questions go back to draft. A row that only
      // changes companies leaves the question as it is.
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
      await writeCompanyLinks(tx, { designQuestionId: question.id }, links);
      outcomes.push({ rowNumber: row.rowNumber, entityId: question.id, action: row.action! });
    }
    return outcomes;
  },
};
