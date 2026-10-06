import { handle } from "@/server/http";
import { getRuleSet } from "@/services/rulesService";

export const GET = handle(async () => getRuleSet());
