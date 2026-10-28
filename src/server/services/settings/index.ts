import "server-only";

import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";
import {
  resolveSettingValue,
  SETTING_KEYS,
  type SettingKey,
} from "@/server/services/settings/registry";

export type SettingView = {
  key: SettingKey;
  value: number;
  updatedAt: Date | null;
  updatedBy: string | null;
};

export async function getSetting(key: SettingKey): Promise<number> {
  const row = await db.setting.findUnique({ where: { key } });
  return resolveSettingValue(key, row?.value);
}

/** All settings with their current values, in registry order. */
export async function listSettings(): Promise<SettingView[]> {
  const rows = await db.setting.findMany({
    include: { updatedBy: { select: { name: true } } },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return SETTING_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      value: resolveSettingValue(key, row?.value),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy?.name ?? null,
    };
  });
}

/** Updates a setting and records it in the audit log, in one transaction. Value must be pre-validated. */
export async function updateSetting(
  key: SettingKey,
  value: number,
  actorId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.setting.findUnique({ where: { key } });
    const before = resolveSettingValue(key, existing?.value);
    if (existing && before === value) return;

    await tx.setting.upsert({
      where: { key },
      create: { key, value, updatedById: actorId },
      update: { value, updatedById: actorId },
    });
    await recordAudit(
      {
        actorId,
        action: "setting.update",
        entityType: "setting",
        entityId: key,
        before: { value: before },
        after: { value },
      },
      tx,
    );
  });
}
