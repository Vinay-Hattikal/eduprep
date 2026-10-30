import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/env";

function createClient() {
  const { DATABASE_URL, DATABASE_POOL_SIZE } = env();
  const adapter = new PrismaPg({ connectionString: DATABASE_URL, max: DATABASE_POOL_SIZE });
  // Under load every connection can be busy; a transaction waits for one rather than failing
  // after Prisma's 2 s default (load test, D-065). Calls set longer timeouts where they need them.
  return new PrismaClient({ adapter, transactionOptions: { maxWait: 15_000 } });
}

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
