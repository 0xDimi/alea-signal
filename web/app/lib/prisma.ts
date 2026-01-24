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

const pool = databaseUrl
  ? globalForPrisma.__pgPool__ ?? new Pool({ connectionString: databaseUrl })
  : null;
const adapter = pool ? new PrismaPg(pool) : null;
const prismaInstance =
  databaseUrl && adapter
    ? globalForPrisma.__prisma__ ?? new PrismaClient({ log: ["error"], adapter })
    : null;

export const prisma = prismaInstance;

export const getPrisma = () => {
  if (!prismaInstance) {
    throw new Error("DATABASE_URL or POSTGRES_URL is not set.");
  }
  return prismaInstance;
};

if (process.env.NODE_ENV !== "production" && prismaInstance && pool) {
  globalForPrisma.__prisma__ = prismaInstance;
  globalForPrisma.__pgPool__ = pool;
}
