import { NextResponse } from "next/server";

import { runSync } from "@/app/lib/sync-core.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const isAuthorized = (request: Request) => {
  const token = process.env.SYNC_TOKEN;
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.replace("Bearer ", "")
    : null;

  if (token && (queryToken === token || bearerToken === token)) {
    return true;
  }

  const isVercelCron =
    process.env.VERCEL === "1" && request.headers.get("x-vercel-cron") === "1";

  return Boolean(isVercelCron);
};

export const GET = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
};
