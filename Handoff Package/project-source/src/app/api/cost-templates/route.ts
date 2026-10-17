import { handle } from "@/server/http";
import { listClientFormats } from "@/services/templateService";

/** Client layouts that have a default template. */
export const GET = handle(async () => listClientFormats());
