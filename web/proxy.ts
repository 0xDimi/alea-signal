import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const unauthorized = () =>
  new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Alea Screener"',
    },
  });

export const proxy = (request: NextRequest) => {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/sync") {
    return NextResponse.next();
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
