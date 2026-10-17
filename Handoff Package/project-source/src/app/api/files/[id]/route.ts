import { handle, HttpError } from "@/server/http";
import { fileRepository } from "@/server/repositories/files";
import { fileStore } from "@/server/fileStore";

export const GET = handle<{ id: string }>(async (_req, { params }) => {
  const f = await fileRepository.byId(params.id);
  if (!f) throw new HttpError(404, "File not found");
  const bytes = await fileStore().get(f.storagePath);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": f.mimeType,
      "content-disposition": `inline; filename="${f.originalName.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "cache-control": "private, max-age=3600, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});
