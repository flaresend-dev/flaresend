// Polled by the post report while an email is scheduled or sending.
import { mailerCall } from "@/lib/mailer";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; publicationId: string; runId: string }> },
) {
  const { slug, publicationId, runId } = await params;
  const r = await mailerCall((m) => m.getNewsletterEmailRun(slug, publicationId, runId));
  if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
  return Response.json(r.data, { headers: { "cache-control": "no-store" } });
}
