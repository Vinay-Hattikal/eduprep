import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export type AuditEntry = {
  actorId: string | null;
  /** Verb in `entity.action` form, e.g. `setting.update`, `question.publish`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

/** Records an admin action. Pass the transaction client to keep the log in the same transaction. */
export async function recordAudit(entry: AuditEntry, client: AuditClient = db): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before,
      after: entry.after,
    },
  });
}
