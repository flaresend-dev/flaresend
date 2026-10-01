import type { ProjectRow } from "../../db/projects";
import { ApiError } from "../../http/errors";
import { newId, nowIso } from "../ids";
import { active, requirePublication, one } from "./shared";

export function imageDimensions(
  bytes: Uint8Array,
  mime: string,
): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    mime === "image/png" &&
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n) &&
    String.fromCharCode(...bytes.slice(12, 16)) === "IHDR"
  )
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i++] !== 255) break;
      const marker = bytes[i++]!;
      if (marker === 217 || marker === 218) break;
      if (marker === 0 || marker === 255) continue;
      const size = view.getUint16(i);
      if (size < 2 || i + size > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      )
        return { width: view.getUint16(i + 5), height: view.getUint16(i + 3) };
      i += size;
    }
  }
  if (
    mime === "image/webp" &&
    bytes.length >= 30 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    const kind = String.fromCharCode(...bytes.slice(12, 16));
    if (kind === "VP8X")
      return {
        width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
        height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16),
      };
    if (
      kind === "VP8 " &&
      bytes[23] === 157 &&
      bytes[24] === 1 &&
      bytes[25] === 42
    )
      return {
        width: view.getUint16(26, true) & 16383,
        height: view.getUint16(28, true) & 16383,
      };
    if (kind === "VP8L" && bytes[20] === 47)
      return {
        width: 1 + ((bytes[21]! | (bytes[22]! << 8)) & 16383),
        height:
          1 +
          (((bytes[22]! >> 6) | (bytes[23]! << 2) | (bytes[24]! << 10)) &
            16383),
      };
  }
  throw ApiError.validation(
    "invalid_asset",
    "Upload a valid PNG, JPEG, or WebP image.",
  );
}
export async function uploadAsset(
  env: Env,
  project: ProjectRow,
  id: string,
  input: { base64: string; mimeType: string },
) {
  active(project, await requirePublication(env, project.id, id));
  if (typeof input.base64 !== "string" || input.base64.length > 7_000_000)
    throw ApiError.validation(
      "invalid_asset",
      "An image must not exceed 5 MiB.",
    );
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(input.base64), (c) => c.charCodeAt(0));
  } catch {
    throw ApiError.validation(
      "invalid_asset",
      "The image encoding is not valid.",
    );
  }
  if (!bytes.length || bytes.length > 5 * 1024 * 1024)
    throw ApiError.validation(
      "invalid_asset",
      "An image must not exceed 5 MiB.",
    );
  const { width, height } = imageDimensions(bytes, input.mimeType);
  if (!width || !height || width > 4096 || height > 4096)
    throw ApiError.validation(
      "invalid_asset",
      "Use an image no larger than 4096 pixels on each axis.",
    );
  const assetId = newId("asset"),
    key = `newsletters/${project.id}/${id}/assets/${assetId}`;
  await env.PAYLOADS.put(key, bytes, {
    httpMetadata: { contentType: input.mimeType },
  });
  await env.DB.prepare(
    "INSERT INTO newsletter_assets(id,project_id,publication_id,r2_key,mime_type,size_bytes,width,height,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      assetId,
      project.id,
      id,
      key,
      input.mimeType,
      bytes.length,
      width,
      height,
      nowIso(),
    )
    .run();
  return {
    id: assetId,
    mimeType: input.mimeType,
    sizeBytes: bytes.length,
    width,
    height,
    previewUrl: `newsletter-asset:${assetId}`,
  };
}
export async function getAsset(
  env: Env,
  project: ProjectRow,
  id: string,
  assetId: string,
) {
  await requirePublication(env, project.id, id);
  const row = await one<{ r2_key: string; mime_type: string }>(
    env.DB.prepare(
      "SELECT * FROM newsletter_assets WHERE id=? AND project_id=? AND publication_id=? AND status!='deleted'",
    ).bind(assetId, project.id, id),
  );
  if (!row)
    throw ApiError.notFound("asset_not_found", "The image was not found.");
  const obj = await env.PAYLOADS.get(row.r2_key);
  if (!obj) throw ApiError.notFound("asset_not_found", "The image expired.");
  const bytes = new Uint8Array(await obj.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { base64: btoa(binary), mimeType: row.mime_type };
}
