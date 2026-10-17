/** Acting user. No authentication yet: the UI sends an `x-user` header; falls back to DEFAULT_USER. */
export function actingUser(req?: Request): string {
  const h = req?.headers.get("x-user")?.trim();
  return h && h.length <= 80 ? h : process.env.DEFAULT_USER || "Costing Desk";
}
