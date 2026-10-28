import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  MARKETING_TEMPLATES,
  renderTemplate,
  type TemplateData,
  type TemplateName,
} from "@/lib/notifications/templates";
import { db } from "@/server/db";
import { getNotifyTransport } from "@/server/integrations/notify";
import { enqueueJob } from "@/server/jobs/queue";

/**
 * Sends a message to a user by email (always, if they have an address) and WhatsApp (if they
 * have a phone number). Messages are stored, then sent by the worker (`notification.send`).
 */
export async function notify<K extends TemplateName>(
  userId: string,
  template: K,
  data: TemplateData[K],
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, phoneNumber: true, marketingOptIn: true },
  });
  if (!user) return;
  if (MARKETING_TEMPLATES.includes(template) && !user.marketingOptIn) return;
  const { subject, body } = renderTemplate(template, data);
  const rows: Prisma.NotificationCreateManyInput[] = [];
  if (user.email) rows.push({ userId, channel: "EMAIL", template, to: user.email, subject, body });
  if (user.phoneNumber)
    rows.push({ userId, channel: "WHATSAPP", template, to: user.phoneNumber, subject, body });
  for (const row of rows) {
    const created = await db.notification.create({ data: row, select: { id: true } });
    await enqueueJob("notification.send", { notificationId: created.id }, { maxAttempts: 5 });
  }
}

/** Job "notification.send". */
export async function sendNotification(notificationId: string): Promise<void> {
  const message = await db.notification.findUnique({ where: { id: notificationId } });
  if (!message || message.status !== "QUEUED") return;
  const transport = getNotifyTransport(message.channel);
  try {
    await transport.send(message);
    await db.notification.update({
      where: { id: message.id },
      data: { status: "SENT", sentAt: new Date(), transport: transport.name, error: null },
    });
  } catch (error) {
    await db.notification.update({
      where: { id: message.id },
      data: {
        error: error instanceof Error ? error.message : String(error),
        transport: transport.name,
      },
    });
    throw error; // retried by the queue
  }
}

export async function listNotifications(filter: { q?: string; template?: string }, take = 100) {
  return db.notification.findMany({
    where: {
      ...(filter.q && {
        OR: [
          { to: { contains: filter.q, mode: "insensitive" } },
          { subject: { contains: filter.q, mode: "insensitive" } },
        ],
      }),
      ...(filter.template && { template: filter.template }),
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/**
 * Sends a one-time code right away (no queue: the person is waiting). With real transports the
 * stored copy has the code masked, so codes never sit in the database in plain text.
 */
export async function sendCodeNow(input: {
  userId: string | null;
  channel: "EMAIL" | "SMS";
  to: string;
  code: string;
  purpose: "verify" | "reset" | "login";
  minutes: number;
}): Promise<void> {
  const transport = getNotifyTransport(input.channel);
  const rendered = renderTemplate("auth.code", {
    code: input.code,
    purpose: input.purpose,
    minutes: input.minutes,
  });
  const stored = transport.local
    ? rendered
    : renderTemplate("auth.code", {
        code: "••••••",
        purpose: input.purpose,
        minutes: input.minutes,
      });
  const row = await db.notification.create({
    data: {
      userId: input.userId,
      channel: input.channel,
      template: "auth.code",
      to: input.to,
      ...stored,
    },
    select: { id: true },
  });
  try {
    await transport.send({
      id: row.id,
      channel: input.channel,
      to: input.to,
      ...rendered,
      variables: { otp: input.code },
    });
    await db.notification.update({
      where: { id: row.id },
      data: { status: "SENT", sentAt: new Date(), transport: transport.name },
    });
  } catch (error) {
    await db.notification.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        transport: transport.name,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
