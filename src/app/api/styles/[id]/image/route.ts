import { handle, HttpError, readFile, sniffImage } from "@/server/http";
import { fileStore } from "@/server/fileStore";
import { fileRepository } from "@/server/repositories/files";
import { styleRepository } from "@/server/repositories/styles";
import { auditRepository } from "@/server/repositories/audit";

export const POST = handle<{ id: string }>(async (req, { params }, user) => {
  const style = await styleRepository.byId(params.id);
  if (!style) throw new HttpError(404, "Style not found");
  const { bytes, name } = await readFile(req, 12_000_000);
  const kind = sniffImage(bytes);
  if (!kind) throw new HttpError(400, "Unsupported image (use PNG, JPEG or WebP)");
  const put = await fileStore().put(bytes, { folder: "style-images", name: `${style.number}-${name}` });
  const f = await fileRepository.create({ kind: "STYLE_IMAGE", originalName: name, mimeType: kind.mime, size: put.size, sha256: put.sha256, storagePath: put.storagePath, styleId: style.id, uploadedBy: user });
  await styleRepository.update(style.id, { imageFileId: f.id });
  await auditRepository.log({ userName: user, action: "STYLE_IMAGE_UPLOAD", entityType: "StoredFile", entityId: f.id, styleId: style.id, details: { name } });
  return { fileId: f.id, url: `/api/files/${f.id}` };
});
