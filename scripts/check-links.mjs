import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(path.join(root, "data/current.json"), "utf8"));
const urls = [...new Set([
  ...data.cells.flatMap(cell => [
    cell.source_url,
    ...(cell.sources ?? []),
    ...(cell.value?.evidence ?? []).map(item => item.source_url)
  ])
])];

async function fetchOnce(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "U7-source-validator/1.0" }
    });
    await response.body?.cancel();
    return { url, status: response.status, finalUrl: response.url };
  } catch (error) {
    return { url, status: 0, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function check(url) {
  let result;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result = await fetchOnce(url);
    if (result.status !== 0 && result.status < 500) return result;
  }
  return result;
}

const results = [];
for (let index = 0; index < urls.length; index += 6) {
  results.push(...await Promise.all(urls.slice(index, index + 6).map(check)));
}

for (const result of results) {
  const detail = result.error ? result.error : `${result.status}${result.finalUrl !== result.url ? ` → ${result.finalUrl}` : ""}`;
  console.log(`${detail} ${result.url}`);
}

const broken = results.filter(result => result.status === 0 || result.status === 404 || result.status >= 500);
if (broken.length) {
  console.error(`${broken.length} source link(s) could not be verified.`);
  process.exit(1);
}
console.log(`Checked ${results.length} unique official source links.`);
