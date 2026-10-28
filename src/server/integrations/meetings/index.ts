// Meeting provider (PRD 8.7, D-041): creates the calendar event and video link for a booking.
//   mock   (default) a local "meeting room" page, for development and tests
//   google a Google Calendar event with a Google Meet link on the platform's calendar, inviting
//          both people (service account with domain-wide delegation). Needs GOOGLE_* variables.

import { importPKCS8, SignJWT } from "jose";
import { siteConfig } from "@/config/site";
import { env } from "@/server/env";

export type MeetingInput = {
  bookingId: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  attendees: string[];
};

export type Meeting = { provider: string; meetingId: string; url: string };

export interface MeetingProvider {
  readonly name: string;
  create(input: MeetingInput): Promise<Meeting>;
  update(meetingId: string, input: MeetingInput): Promise<Meeting>;
  cancel(meetingId: string): Promise<void>;
}

export function createMockMeetings(): MeetingProvider {
  const meeting = (input: MeetingInput): Meeting => ({
    provider: "mock",
    meetingId: `mock-${input.bookingId}`,
    url: `${siteConfig.url}/meet/${input.bookingId}`,
  });
  return {
    name: "mock",
    create: async (input) => meeting(input),
    update: async (_id, input) => meeting(input),
    cancel: async () => {},
  };
}

const CALENDAR = "https://www.googleapis.com/calendar/v3";

export function createGoogleMeetings(): MeetingProvider {
  const config = env();
  let token: { value: string; expires: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    const key = await importPKCS8(config.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n"), "RS256");
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/calendar.events",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(config.GOOGLE_SERVICE_ACCOUNT_EMAIL!)
      .setSubject(config.GOOGLE_CALENDAR_OWNER!)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`Google token request failed: ${response.status} ${await response.text()}`);
    const json = (await response.json()) as { access_token: string; expires_in: number };
    token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
    return token.value;
  }

  async function call(method: string, path: string, body?: unknown) {
    const response = await fetch(
      `${CALENDAR}/calendars/${encodeURIComponent(config.GOOGLE_CALENDAR_ID)}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok && !(method === "DELETE" && response.status === 410)) {
      throw new Error(
        `Google Calendar ${method} failed: ${response.status} ${await response.text()}`,
      );
    }
    return method === "DELETE"
      ? null
      : ((await response.json()) as { id: string; hangoutLink?: string });
  }

  const eventBody = (input: MeetingInput) => ({
    summary: input.title,
    description: input.description,
    start: { dateTime: input.startsAt.toISOString() },
    end: { dateTime: input.endsAt.toISOString() },
    attendees: input.attendees.map((email) => ({ email })),
    guestsCanSeeOtherGuests: true,
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
  });

  return {
    name: "google",
    async create(input) {
      const event = await call("POST", "/events?conferenceDataVersion=1&sendUpdates=all", {
        ...eventBody(input),
        conferenceData: {
          createRequest: {
            requestId: input.bookingId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      });
      return { provider: "google", meetingId: event!.id, url: event!.hangoutLink ?? "" };
    },
    async update(meetingId, input) {
      const event = await call(
        "PATCH",
        `/events/${encodeURIComponent(meetingId)}?sendUpdates=all`,
        eventBody(input),
      );
      return { provider: "google", meetingId: event!.id, url: event!.hangoutLink ?? "" };
    },
    async cancel(meetingId) {
      await call("DELETE", `/events/${encodeURIComponent(meetingId)}?sendUpdates=all`);
    },
  };
}

let provider: MeetingProvider | null = null;

export function getMeetingProvider(): MeetingProvider {
  provider ??= env().MEETING_DRIVER === "google" ? createGoogleMeetings() : createMockMeetings();
  return provider;
}
