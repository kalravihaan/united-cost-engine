import { handle } from "@/server/http";
import { listTemplates } from "@/services/costingService";

export const GET = handle(async (req) => listTemplates(new URL(req.url).searchParams.get("type") === "CLIENT" ? "CLIENT" : "ACTUAL"));
