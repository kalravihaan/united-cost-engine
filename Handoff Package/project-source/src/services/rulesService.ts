import { DEFAULT_RULES } from "@/data/defaultRules";
import type { CadMappingRule, GroupRule, RuleSet } from "@/types/rules";
import { prisma } from "@/server/db";

/** Rule set = DB rows (editable in Masters → Costing Rules); defaults are used only while the DB has none. */
export async function getRuleSet(): Promise<RuleSet> {
  const rows = await prisma.costingRule.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (rows.length === 0) return DEFAULT_RULES;
  const groupRules = rows.filter((r) => r.kind === "GROUP").map((r) => r.payload as unknown as GroupRule);
  const cadMappingRules = rows.filter((r) => r.kind === "CAD_MAPPING").map((r) => r.payload as unknown as CadMappingRule);
  return {
    groupOrder: DEFAULT_RULES.groupOrder,
    groupRules: groupRules.length ? groupRules : DEFAULT_RULES.groupRules,
    cadMappingRules: cadMappingRules.length ? cadMappingRules : DEFAULT_RULES.cadMappingRules,
  };
}

export async function seedDefaultRules(): Promise<number> {
  let n = 0;
  for (const [i, r] of DEFAULT_RULES.groupRules.entries()) {
    await prisma.costingRule.upsert({ where: { kind_ruleKey: { kind: "GROUP", ruleKey: r.id } }, create: { kind: "GROUP", ruleKey: r.id, payload: r as never, sortOrder: i }, update: {} });
    n++;
  }
  for (const [i, r] of DEFAULT_RULES.cadMappingRules.entries()) {
    await prisma.costingRule.upsert({ where: { kind_ruleKey: { kind: "CAD_MAPPING", ruleKey: r.id } }, create: { kind: "CAD_MAPPING", ruleKey: r.id, payload: r as never, sortOrder: i }, update: {} });
    n++;
  }
  return n;
}
