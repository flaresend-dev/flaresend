// Polled by the Logs page every 10 s. Behind the same Access middleware as every page.
import { NextResponse, type NextRequest } from "next/server";
import { mailerCall } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const project = sp.get("project") || undefined;
  const type = sp.get("type") || undefined;
  const emailId = sp.get("emailId") || undefined;
  const cursor = sp.get("cursor") || undefined;
  const r = await mailerCall((m) =>
    m.listEvents({ limit: 100, ...(project ? { project } : {}), ...(type ? { type } : {}), ...(emailId ? { emailId } : {}), ...(cursor ? { cursor } : {}) }),
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502, headers: { "cache-control": "no-store" } });
  return NextResponse.json(r.data, { headers: { "cache-control": "no-store" } });
}
