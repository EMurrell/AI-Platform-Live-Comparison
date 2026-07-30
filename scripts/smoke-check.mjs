import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pageErrors } from "./smoke-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteUrl = process.argv[2] || process.env.SITE_URL;

if (!siteUrl) {
  console.error("Usage: node scripts/smoke-test.mjs <https://deployed-site.example/>");
  process.exit(2);
}

const parsedUrl = new URL(siteUrl);
if (parsedUrl.protocol !== "https:") {
  console.error(`Production smoke tests require HTTPS, received ${parsedUrl.protocol}`);
  process.exit(2);
}

const data = JSON.parse(await readFile(path.join(root, "data/current.json"), "utf8"));
let lastError;

for (let attempt = 1; attempt <= 6; attempt += 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(parsedUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "U7-production-smoke-test/1.0" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const errors = pageErrors(await response.text(), data);
    if (errors.length) throw new Error(errors.join(" "));
    console.log(`Production smoke test passed: ${response.url}`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 6) {
      await new Promise(resolve => setTimeout(resolve, attempt * 2_000));
    }
  } finally {
    clearTimeout(timeout);
  }
}

console.error(`Production smoke test failed after 6 attempts: ${lastError?.message || "unknown error"}`);
process.exit(1);
