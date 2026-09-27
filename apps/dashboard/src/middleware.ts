// Second line of defence behind Cloudflare Access.
//
// Vars are read from process.env. Under @opennextjs/cloudflare the worker copies every string var/secret from the
// Worker env into process.env before any Next code runs (populateProcessEnv in the adapter's init.js), and
// `next dev` loads .env* files into process.env. So the ACCESS_AUD / ACCESS_TEAM_DOMAIN secrets
// are visible here without getCloudflareContext().
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_HEADER, accessMode, verifyAccessJwt } from "@/lib/access";
import { projectFromPath } from "@/lib/nav";
import { PROJECT_COOKIE, PROJECT_COOKIE_MAX_AGE } from "@/lib/project-cookie";

/** Remembers the last project visited so `/` can go back to it (section 4.4). Only after the Access check passed. */
function next(req: NextRequest): NextResponse {
  const res = NextResponse.next();
  const slug = projectFromPath(req.nextUrl.pathname);
  if (slug && req.cookies.get(PROJECT_COOKIE)?.value !== slug) {
    res.cookies.set(PROJECT_COOKIE, slug, { path: "/", maxAge: PROJECT_COOKIE_MAX_AGE, sameSite: "lax" });
  }
  return res;
}

export async function middleware(req: NextRequest) {
  const mode = accessMode(
    process.env.ACCESS_AUD as string | undefined,
    process.env.ACCESS_TEAM_DOMAIN as string | undefined,
    process.env.NODE_ENV,
  );
  if (mode.kind === "skip") return next(req);
  if (mode.kind === "misconfigured") {
    return new NextResponse(
      "Cloudflare Access is not configured for this dashboard: set the ACCESS_AUD and ACCESS_TEAM_DOMAIN secrets on this Worker (pnpm bootstrap does it).",
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  const token = req.headers.get(ACCESS_HEADER);
  if (!token) {
    return new NextResponse("Forbidden: missing Cf-Access-Jwt-Assertion header. Open this dashboard through Cloudflare Access.", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  try {
    await verifyAccessJwt(token, mode.teamDomain, mode.aud);
  } catch (e) {
    return new NextResponse(`Forbidden: invalid Access token (${e instanceof Error ? e.message : "verification failed"}).`, {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return next(req);
}

export const config = {
  // Everything, including /_next assets. Access protects the whole hostname anyway.
  matcher: "/:path*",
};
