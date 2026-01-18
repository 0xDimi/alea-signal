import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis;
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
}

const pool =
  globalForPrisma.__pgPool__ ?? new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.__prisma__ ?? new PrismaClient({ log: ["error"], adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma__ = prisma;
  globalForPrisma.__pgPool__ = pool;
}
