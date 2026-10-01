// Streams AI writing help (draft, continue, rewrite) from the mailer to the editor as plain UTF-8 text.
import { decodeRpcError, ERROR_STATUS } from "@flaresend/types";
import { getMailer } from "@/lib/mailer";
import { toUiError } from "@/lib/errors";

export async function POST(request: Request) {
  // Same-origin only: the editor is the only caller.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host)
    return Response.json({ error: { code: "invalid_origin", message: "Cross-site request refused." } }, { status: 403 });
  let body: { slug?: unknown; publicationId?: unknown; input?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "invalid_body", message: "Send JSON." } }, { status: 400 });
  }
  if (typeof body.slug !== "string" || typeof body.publicationId !== "string")
    return Response.json({ error: { code: "invalid_body", message: "slug and publicationId are required." } }, { status: 400 });
  try {
    const mailer = await getMailer();
    const stream = await mailer.newsletterAiStream(body.slug, body.publicationId, body.input as never);
    return new Response(stream, {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (err) {
    const e = toUiError(err);
    const status = decodeRpcError(err) ? ERROR_STATUS[decodeRpcError(err)!.type] : 500;
    return Response.json({ error: e }, { status });
  }
}
