import type { PrismaClient } from "@prisma/client";
import type { Pool } from "pg";

declare global {
  var __prisma__: PrismaClient | undefined;
  var __pgPool__: Pool | undefined;
}

export {};
