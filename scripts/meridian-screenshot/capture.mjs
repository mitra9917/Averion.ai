import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(rootDir, "../../apps/web/package.json"));
const { chromium } = require("playwright");

import { installRoutes } from "./fixtures.mjs";

const root = rootDir;
const outDir = process.env.MERIDIAN_SCREENSHOT_DIR ?? "/opt/cursor/artifacts/meridian-screenshots";
const baseUrl = process.env.MERIDIAN_SCREENSHOT_BASE ?? "http://127.0.0.1:3000";
const apiOrigin =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

const shots = [
  { name: "meridian-login.png", path: "/login", seeded: false, wait: "networkidle" },
  {
    name: "meridian-overview.png",
    path: "/",
    seeded: true,
    wait: "networkidle",
    ready: "[aria-label='Chunks indexed over the selected range, stacked by file type'], .display"
  },
  {
    name: "meridian-ask.png",
    path: "/chat?conversation=conv_vendor",
    seeded: true,
    wait: "networkidle",
    ready: "text=60 days"
  },
  {
    name: "meridian-insights.png",
    path: "/insights",
    seeded: true,
    wait: "networkidle",
    ready: "text=Corpus insights"
  },
  {
    name: "meridian-documents.png",
    path: "/documents",
    seeded: true,
    wait: "networkidle",
    ready: "text=Vendor Agreement"
  },
  {
    name: "meridian-account.png",
    path: "/account",
    seeded: true,
    wait: "networkidle",
    ready: "text=Account & workspace"
  }
];

async function capture(page, spec) {
  await page.goto(`${baseUrl}${spec.path}`, { waitUntil: spec.wait });
  if (spec.ready) {
    await page.waitForSelector(spec.ready, { timeout: 30_000 });
  }
  await page.waitForTimeout(600);
  const target = path.join(outDir, spec.name);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  await installRoutes(page);

  const paths = [];
  const seeded = [];

  for (const spec of shots) {
    try {
      const saved = await capture(page, spec);
      paths.push(saved);
      if (spec.seeded) seeded.push(saved);
    } catch (error) {
      const fallback = path.join(outDir, spec.name);
      await page.screenshot({ path: fallback, fullPage: true });
      paths.push(fallback);
      console.error(`Warning: ${spec.name} used fallback capture:`, error.message);
    }
  }

  await browser.close();

  const manifest = {
    capturedAt: new Date().toISOString(),
    viewport: "1440x900",
    deviceScaleFactor: 2,
    baseUrl,
    apiOrigin,
    note: "Signed-in screens used Playwright API fixtures and a temporary AuthGate passthrough; not shipped in the branch.",
    paths,
    seededPaths: seeded
  };

  const manifestPath = path.join(outDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
