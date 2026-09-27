// Cloudflare Access JWT check used by src/middleware.ts (second line of defence behind the Access application).
// Subpath imports keep the JWE/deflate code (CompressionStream) out of the middleware bundle.
import { createRemoteJWKSet } from "jose/jwks/remote";
import { jwtVerify } from "jose/jwt/verify";
import type { JWTPayload } from "jose";

export const ACCESS_HEADER = "cf-access-jwt-assertion";

export type AccessMode =
  | { kind: "verify"; aud: string; teamDomain: string }
  | { kind: "skip" } // local dev with Access not configured
  | { kind: "misconfigured" }; // production with Access not configured

/** Decides what the middleware does from the vars. Pure; unit tested. */
export function accessMode(aud: string | undefined, teamDomain: string | undefined, nodeEnv: string | undefined): AccessMode {
  const a = (aud ?? "").trim();
  const t = normalizeTeamDomain(teamDomain ?? "");
  if (a && t) return { kind: "verify", aud: a, teamDomain: t };
  return nodeEnv === "development" ? { kind: "skip" } : { kind: "misconfigured" };
}

/** Accepts "team.cloudflareaccess.com", "https://team.cloudflareaccess.com/" etc. */
export function normalizeTeamDomain(v: string): string {
  return v.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

// One JWKS per team domain per isolate; jose caches keys and refetches on unknown `kid`.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<JWTPayload> {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, jwks);
  }
  const { payload } = await jwtVerify(token, jwks, { issuer: `https://${teamDomain}`, audience: aud });
  return payload;
}
