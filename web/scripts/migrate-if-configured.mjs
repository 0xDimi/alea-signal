import { execSync } from "node:child_process";

const runMigrations = ["1", "true", "yes"].includes(
  String(process.env.RUN_MIGRATIONS ?? "").toLowerCase()
);
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.NEON_DATABASE_URL;

if (!runMigrations) {
  console.log("Skipping Prisma migrate: RUN_MIGRATIONS not set.");
  process.exit(0);
}

if (!databaseUrl) {
  console.log("Skipping Prisma migrate: no database URL configured.");
  process.exit(0);
}

try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} catch (error) {
  console.warn("Skipping Prisma migrate: database unavailable.");
  process.exit(0);
}
