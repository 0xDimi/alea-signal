import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

const pool =
  globalForPrisma.__pgPool__ ??
  new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.__prisma__ ?? new PrismaClient({ log: ["error"], adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma__ = prisma;
  globalForPrisma.__pgPool__ = pool;
}
