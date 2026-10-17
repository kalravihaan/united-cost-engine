#!/usr/bin/env node
/**
 * End-to-end smoke test of the single-file build in a real browser (Playwright, Chromium).
 *
 *   node scripts/smoke-standalone.mjs [path/to/cost-engine.html] [path/to/chromium]
 *
 * Defaults: dist-standalone/cost-engine.html and the Chromium that Playwright finds
 * (set PLAYWRIGHT_CHROMIUM_EXECUTABLE or pass the second argument to use a specific binary).
 * Walks the main flow: create a Live Smart brand + style, enter an Actual costing, Benchmarks, Standard rates,
 * save a version, export Excel, leave-guard, delete the style. Exits non-zero if any step fails or the page logs an error.
 */
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const html = path.resolve(process.argv[2] ?? "dist-standalone/cost-engine.html");
const exe = process.argv[3] ?? process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? undefined;
if (!fs.existsSync(html)) {
  console.error("HTML not found:", html);
  process.exit(2);
}
const FILE = pathToFileURL(html).href;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
const dialogs = [];
page.on("dialog", async (d) => {
  dialogs.push(d.message());
  await d.accept();
});

const api = (p, method = "GET", body) =>
  page.evaluate(
    async ([p, method, body]) => {
      const r = await fetch(p, { method, headers: { "content-type": "application/json", "x-user": "smoke" }, body: body ? JSON.stringify(body) : undefined });
      return r.json();
    },
    [p, method, body ?? null],
  );
const fill = async (label, value) => {
  await page.fill(`input[aria-label="${label}"]`, String(value));
  await page.keyboard.press("Tab");
};
const open = async (hash) => {
  await page.goto(FILE + "#/styles"); // hash-only navigation does not remount the page: go via another route first
  await page.goto(FILE + hash);
};

try {
  await page.goto(FILE);
  await page.waitForSelector('input[aria-label="Style number"]', { timeout: 30000 });
  check("page loads", true);

  const seeded = await api("/api/masters/rates");
  check("standard rates are seeded in the Rate masters", Array.isArray(seeded) && seeded.length >= 40, `${seeded.length} rows`);

  const customer = await api("/api/masters/customers", "POST", { name: "Smoke Retail" });
  const brand = await api("/api/masters/brands", "POST", { name: "Live Smart", customerId: customer.id });
  const style = await api("/api/styles", "POST", { number: "4113", customerId: customer.id, brandId: brand.id });
  check("customer, brand and style created through the API", !!style.id);

  await open(`#/?style=${style.id}&mode=ACTUAL`);
  await page.waitForSelector('input[aria-label="Consumption"]');
  for (const [l, v] of [["orderPcs qty", 5873], ["orderPcs rate", 320], ["dispatchPcs qty", 5668], ["dispatchPcs rate", 320], ["Consumption", 1.6], ["Fabric 1 quantity", 9500], ["Fabric 1 rate", 68], ["CMT quantity", 5668]]) await fill(l, v);
  const summary = await page.locator("text=/Total cost/").first().innerText();
  check("Actual costing computes a total as values are typed", /₹[1-9]/.test(summary), summary.replace(/\s+/g, " ").slice(0, 60));

  await page.click('button[role="tab"]:has-text("Benchmarks")');
  await page.waitForSelector("text=Compared with");
  const benchRows = await page.locator("tbody tr").count();
  check("Benchmarks tab compares the costing with the standards", benchRows >= 6, `${benchRows} measures`);
  await page.click('button[role="tab"]:text-is("Costing")');

  await page.click('button:has-text("Standard rates")');
  await page.waitForSelector("text=Apply standard rates");
  await page.waitForTimeout(700);
  const proposals = await page.locator('[role="dialog"] tbody tr').count();
  check("Standard rates dialog lists proposals", proposals > 5, `${proposals} rows`);
  await page.click('[role="dialog"] button:has-text("Apply")');
  await page.waitForTimeout(400);
  const cmt = await page.inputValue('input[aria-label="CMT rate"]');
  check("applying standard rates fills the CMT rate (Live Smart FUT kurta median 67.25)", cmt === "67.25", `CMT rate = ${cmt}`);

  await page.click('button:has-text("Save as v1")');
  await page.click('[role="dialog"] button:has-text("Save version")');
  await page.waitForSelector("text=/Saved Actual costing v1/", { timeout: 10000 });
  check("Save as v1 creates a version", true);

  const download = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
  await page.getByRole("button", { name: /Export/ }).click();
  await page.getByRole("menuitem", { name: /Excel/ }).click();
  const dl = await download;
  let size = 0;
  if (dl) size = fs.statSync(await dl.path()).size;
  check("Excel export downloads a file", size > 5000, `${size} bytes`);

  // leave guard: type something new, then leave through the navigation
  await fill("Fabric 1 rate", 70);
  dialogs.length = 0;
  await page.click('a:has-text("Styles")');
  await page.waitForTimeout(400);
  check("leaving with unsaved edits asks for confirmation", dialogs.some((d) => /unsaved/i.test(d)), dialogs[0] ?? "no dialog");

  await page.goto(FILE + "#/styles");
  await page.waitForSelector("text=4113");
  await page.click('button[aria-label="Delete style 4113"]');
  await page.waitForSelector("text=This will permanently remove");
  const del = page.locator('[role="dialog"] button:has-text("Delete style")');
  check("delete needs the style number typed", await del.isDisabled());
  await page.fill('input[aria-label="Confirm style number"]', "4113");
  await del.click();
  await page.waitForTimeout(700);
  const left = await api("/api/styles?q=4113");
  check("style is deleted", Array.isArray(left) && left.length === 0);
} catch (e) {
  check("script ran to the end", false, e.message.split("\n")[0]);
}

check("no console or page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
