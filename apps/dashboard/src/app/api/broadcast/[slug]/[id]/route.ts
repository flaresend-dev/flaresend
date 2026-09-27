// Polled every 5 s by a broadcast's detail page while it is sending. Just proxies getBroadcast.
// Behind the same Access middleware as every page.
import { NextResponse, type NextRequest } from "next/server";
import { mailerCall } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await mailerCall((m) => m.getBroadcast(slug, id));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502, headers: { "cache-control": "no-store" } });
  return NextResponse.json(r.data, { headers: { "cache-control": "no-store" } });
}
