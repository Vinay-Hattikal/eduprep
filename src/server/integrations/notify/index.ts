// Message transports (PRD 8.14, D-041, D-045), one per channel:
//   email     outbox (HTML files in .data/mail) | resend
//   sms       outbox | msg91 (DLT-registered OTP template)
//   whatsapp  outbox | cloud (Meta WhatsApp Cloud API, approved template)
// Every message is also stored in the notifications table (admin › Notifications).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { emailHtml } from "@/lib/notifications/templates";
import { siteConfig } from "@/config/site";
import { env } from "@/server/env";

export type Channel = "EMAIL" | "WHATSAPP" | "SMS";

export type OutgoingMessage = {
  id: string;
  channel: Channel;
  to: string;
  subject: string;
  body: string;
  /** Template variables for providers that need them (MSG91: { otp }). */
  variables?: Record<string, string>;
};

export interface NotifyTransport {
  readonly name: string;
  /** True when messages only land in the outbox (development). */
  readonly local: boolean;
  send(message: OutgoingMessage): Promise<void>;
}

const MAIL_DIR = process.env.MAIL_DIR
  ? path.resolve(/*turbopackIgnore: true*/ process.env.MAIL_DIR)
  : path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "mail");

function outbox(): NotifyTransport {
  return {
    name: "outbox",
    local: true,
    async send(message) {
      if (message.channel !== "EMAIL") return; // SMS / WhatsApp: the table row is the record
      await mkdir(MAIL_DIR, { recursive: true });
      const file = `${new Date().toISOString().replace(/[:.]/g, "-")}-${message.id}.html`;
      await writeFile(
        path.join(/*turbopackIgnore: true*/ MAIL_DIR, file),
        emailHtml(message.subject, message.body),
        "utf8",
      );
    },
  };
}

async function postJson(url: string, body: unknown, headers: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(
      `${new URL(url).host} responded ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  return response;
}

export function createResendTransport(apiKey: string, from: string): NotifyTransport {
  return {
    name: "resend",
    local: false,
    async send(message) {
      await postJson(
        "https://api.resend.com/emails",
        {
          from,
          to: [message.to],
          subject: message.subject,
          text: message.body,
          html: emailHtml(message.subject, message.body),
        },
        { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": message.id },
      );
    },
  };
}

/** MSG91 sends only DLT-approved templates; OTPs use one template with an `otp` variable. */
export function createMsg91Transport(authKey: string, templateId: string): NotifyTransport {
  return {
    name: "msg91",
    local: false,
    async send(message) {
      if (!message.variables?.otp)
        throw new Error("MSG91 SMS needs an otp variable (only OTP SMS are sent).");
      await postJson(
        "https://control.msg91.com/api/v5/flow",
        {
          template_id: templateId,
          short_url: "0",
          recipients: [{ mobiles: message.to.replace(/^\+/, ""), otp: message.variables.otp }],
        },
        { authkey: authKey },
      );
    },
  };
}

/**
 * WhatsApp business-initiated messages must use an approved template. We use one general
 * template with two variables: the subject and the message (D-045).
 */
export function createWhatsAppTransport(
  token: string,
  phoneNumberId: string,
  template: string,
): NotifyTransport {
  return {
    name: "whatsapp-cloud",
    local: false,
    async send(message) {
      await postJson(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          to: message.to.replace(/^\+/, ""),
          type: "template",
          template: {
            name: template,
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: message.subject.slice(0, 200) },
                  { type: "text", text: message.body.replace(/\s+/g, " ").slice(0, 900) },
                ],
              },
            ],
          },
        },
        { Authorization: `Bearer ${token}` },
      );
    },
  };
}

const transports = new Map<Channel, NotifyTransport>();

export function getNotifyTransport(channel: Channel = "EMAIL"): NotifyTransport {
  const cached = transports.get(channel);
  if (cached) return cached;
  const config = env();
  let transport: NotifyTransport = outbox();
  if (channel === "EMAIL" && config.EMAIL_DRIVER === "resend") {
    transport = createResendTransport(
      config.RESEND_API_KEY!,
      config.EMAIL_FROM ?? `${siteConfig.name} <no-reply@${new URL(siteConfig.url).hostname}>`,
    );
  } else if (channel === "SMS" && config.SMS_DRIVER === "msg91") {
    transport = createMsg91Transport(config.MSG91_AUTH_KEY!, config.MSG91_OTP_TEMPLATE_ID!);
  } else if (channel === "WHATSAPP" && config.WHATSAPP_DRIVER === "cloud") {
    transport = createWhatsAppTransport(
      config.WHATSAPP_TOKEN!,
      config.WHATSAPP_PHONE_NUMBER_ID!,
      config.WHATSAPP_TEMPLATE,
    );
  }
  transports.set(channel, transport);
  return transport;
}
