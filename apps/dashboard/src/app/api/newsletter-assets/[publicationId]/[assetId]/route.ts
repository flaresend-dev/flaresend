import { mailerCall } from "@/lib/mailer";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicationId: string; assetId: string }> },
) {
  const { publicationId, assetId } = await params,
    slug = new URL(request.url).searchParams.get("project");
  if (!slug) return new Response("Project required", { status: 400 });
  const r = await mailerCall((m) =>
    m.getNewsletterAsset(slug, publicationId, assetId),
  );
  if (!r.ok) return new Response("Asset unavailable", { status: 404 });
  return new Response(Buffer.from(r.data.base64, "base64"), {
    headers: {
      "Content-Type": r.data.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
