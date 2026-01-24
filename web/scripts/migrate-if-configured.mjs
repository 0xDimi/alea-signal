import { execSync } from "node:child_process";

const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  console.log("Skipping Prisma migrate: no database URL configured.");
  process.exit(0);
}

execSync("npx prisma migrate deploy", { stdio: "inherit" });
