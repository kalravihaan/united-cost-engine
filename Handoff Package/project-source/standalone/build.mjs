// Builds ONE self-contained HTML file with the whole Cost Engine (UI + API handlers + services + in-browser database):
//   npm run standalone:build   →   dist-standalone/cost-engine.html
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = path.resolve(import.meta.dirname, "..");
const here = (...p) => path.join(root, "standalone", ...p);
process.chdir(root);
fs.mkdirSync(here("gen"), { recursive: true });
fs.mkdirSync(path.join(root, "dist-standalone"), { recursive: true });
const run = (f) => execFileSync("node", [here(f)], { stdio: "inherit" });

/** Swap the server-only modules (PostgreSQL, disk, Next) for their in-browser versions. */
const swapper = (browser) => ({
  name: "standalone-swap",
  setup(b) {
    const swaps = {
      [path.join(root, "src/server/db.ts")]: here("shims/db.ts"),
      [path.join(root, "src/server/fileStore.ts")]: here("shims/fileStore.ts"),
      ...(browser
        ? {
            [path.join(root, "src/services/exportService.ts")]: here("shims/exportService.ts"),
            [path.join(root, "src/lib/cad/preview.ts")]: here("shims/preview.ts"),
          }
        : {}),
    };
    b.onResolve({ filter: /.*/ }, async (args) => {
      if (args.pluginData?.swap) return undefined;
      if (browser && args.path === "next/link") return { path: here("shims/next-link.tsx") };
      if (browser && args.path === "next/navigation") return { path: here("shims/next-navigation.ts") };
      if (browser && args.path === "next/server") return { path: here("shims/next-server.ts") };
      if (!/server\/|services\/exportService|cad\/preview|^\.\.?\/(db|fileStore)$/.test(args.path)) return undefined;
      const r = await b.resolve(args.path, { kind: args.kind, resolveDir: args.resolveDir, importer: args.importer, pluginData: { swap: true } });
      return swaps[r.path] ? { path: swaps[r.path] } : undefined;
    });
  },
});

// 1) schema metadata, API route table
run("gen-meta.mjs");
run("gen-routes.mjs");

// 2) first-run data (templates + rules), produced by the real services on the in-memory store
await build({
  entryPoints: [here("make-seed.ts")],
  outfile: here("gen/make-seed.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  alias: { "@": path.join(root, "src") },
  plugins: [swapper(false)],
  logLevel: "warning",
});
execFileSync("node", [here("gen/make-seed.mjs")], { stdio: "inherit" });

// 3) styles: the app's Tailwind CSS with the Inter font files inlined
const cssFrom = path.join(root, "src/app/globals.css");
let css = (await postcss([tailwind({ optimize: { minify: true } })]).process(fs.readFileSync(cssFrom, "utf8"), { from: cssFrom, to: path.join(root, "dist-standalone/x.css") })).css;
const fontDir = path.join(root, "node_modules/@fontsource/inter/files");
css = css.replace(/src:url\(([^)]*?\/)?(inter-latin-\d+-normal)\.woff2\)\s*format\("woff2"\)\s*,\s*url\([^)]*\)\s*format\("woff"\)/g, (_m, _d, name) => `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(fontDir, name + ".woff2")).toString("base64")}) format("woff2")`);
const leftover = [...css.matchAll(/url\((?!data:)([^)]+)\)/g)].map((m) => m[1]);
if (leftover.length) console.warn("CSS still references files:", leftover.slice(0, 5));

// 4) the app
const out = await build({
  entryPoints: [here("entry.tsx")],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  minify: true,
  target: "es2022",
  alias: {
    "@": path.join(root, "src"),
    "pdfjs-dist/legacy/build/pdf.mjs": path.join(root, "node_modules/pdfjs-dist/build/pdf.min.mjs"),
  },
  inject: [here("shims/buffer-global.ts")],
  loader: { ".ttf": "base64" },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.DEFAULT_USER": '"Costing Desk"',
    "process.env.STORAGE_DIR": "undefined",
    "import.meta.url": '"https://localhost/"',
    global: "globalThis",
  },
  plugins: [swapper(true)],
  logLevel: "warning",
});
const safe = (s) => s.replace(/<\/(script|style)/gi, "<\\/$1");
const js = out.outputFiles[0].text;
const page = fs.readFileSync(here("page.html"), "utf8").replace("/*CSS*/", () => safe(css)).replace("/*JS*/", () => safe(js));
const target = path.join(root, "dist-standalone/cost-engine.html");
fs.writeFileSync(target, page);
console.log(`dist-standalone/cost-engine.html  ${(page.length / 1e6).toFixed(1)} MB`);
