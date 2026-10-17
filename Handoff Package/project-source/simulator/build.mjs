// Builds ONE self-contained HTML file (engine, PDF reader, Excel/PDF exporters, fonts, default templates, sample CAD)
// that runs the real calculation engine in a browser with no server:  npm run simulator:build  →  dist-simulator/simulator.html
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist-simulator");
fs.mkdirSync(out, { recursive: true });
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

run("npx", ["tsx", "simulator/make-data.ts", path.join(out, "data.json")]);
run("npx", ["esbuild", "simulator/entry.ts", "--bundle", "--format=iife", "--platform=browser", "--minify", "--alias:@=./src", "--define:process.env.NODE_ENV=\"production\"", "--define:import.meta.url=\"https://localhost/\"", `--outfile=${path.join(out, "engine.js")}`, "--log-level=warning"]);

const b64 = (f) => fs.readFileSync(path.join(root, "assets/fonts", f)).toString("base64");
const safe = (s) => s.replace(/<\/(script)/gi, "<\\/$1");
let page = fs.readFileSync(path.join(root, "simulator/page.html"), "utf8");
page = page
  .replace("/*FONTS*/null", () => JSON.stringify({ r: b64("DejaVuSans.ttf"), b: b64("DejaVuSans-Bold.ttf") }))
  .replace("/*ENGINE*/", () => safe(fs.readFileSync(path.join(out, "engine.js"), "utf8")))
  .replace("/*DATA*/null", () => safe(fs.readFileSync(path.join(out, "data.json"), "utf8")));
fs.writeFileSync(path.join(out, "simulator.html"), page);
console.log(`dist-simulator/simulator.html  ${(page.length / 1e6).toFixed(1)} MB`);
