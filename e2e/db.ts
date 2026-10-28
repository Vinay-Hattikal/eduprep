// Direct database access for end-to-end fixtures that the UI can't create, such as moving a
// booking's start time into the past ("time travel") so a scorecard can be written.

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

export async function sql<T = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, values)).rows as T[];
  } finally {
    await client.end();
  }
}

/** Starts the booking 30 minutes ago (keeps its length), as if the interview were under way. */
export async function startBookingNow(bookingId: string) {
  await sql(
    `UPDATE bookings SET starts_at = (now() AT TIME ZONE 'UTC') - interval '30 minutes',
       ends_at = (now() AT TIME ZONE 'UTC') - interval '30 minutes' + (ends_at - starts_at)
     WHERE id = $1`,
    [bookingId],
  );
}
