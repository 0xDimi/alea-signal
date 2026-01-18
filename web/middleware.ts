import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const unauthorized = () =>
  new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Alea Screener"',
    },
  });

export const middleware = (request: NextRequest) => {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/api/sync") {
    const token = process.env.SYNC_TOKEN;
    const queryToken = searchParams.get("token");
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : null;
    const isVercelCron =
      process.env.VERCEL === "1" && request.headers.get("x-vercel-cron") === "1";

    if (token && (bearerToken === token || queryToken === token)) {
      return NextResponse.next();
    }
    if (!token && isVercelCron) {
      return NextResponse.next();
    }
  }

  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) {
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return unauthorized();
  }

  const decoded = atob(auth.replace("Basic ", ""));
  const [providedUser, providedPass] = decoded.split(":");

  if (providedUser !== user || providedPass !== pass) {
    return unauthorized();
  }

  return NextResponse.next();
};

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
