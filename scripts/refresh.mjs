import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data/current.json");
const original = await readFile(dataPath, "utf8");
const data = JSON.parse(original);

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());

function collapse(text) {
  return text
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .replace(/([$£€])\s+(?=\d)/g, "$1")
    .trim()
    .toLowerCase();
}

function withoutMarkup(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

async function load(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-CA,en;q=0.9"
      }
    });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    const body = await response.text();
    return { ok: true, haystacks: [collapse(body), collapse(withoutMarkup(body))] };
  } catch (error) {
    return { ok: false, reason: error.name === "AbortError" ? "timed out" : error.message };
  } finally {
    clearTimeout(timer);
  }
}

const pages = new Map();
for (const url of new Set(data.cells.map(cell => cell.source_url))) {
  pages.set(url, await load(url));
}

const summary = { confirmed: [], missing: [], unreachable: [] };
for (const cell of data.cells) {
  const label = `${cell.provider}/${cell.attribute}`;
  const page = pages.get(cell.source_url);
  if (!page.ok) {
    summary.unreachable.push(`${label} (${page.reason})`);
    continue;
  }
  const needle = collapse(cell.quote ?? "");
  if (needle !== "" && page.haystacks.some(haystack => haystack.includes(needle))) {
    cell.checked = today;
    cell.needs_verify = false;
    summary.confirmed.push(label);
  } else {
    cell.needs_verify = true;
    summary.missing.push(label);
  }
}

const stillNeedsVerify = data.cells.filter(cell => cell.needs_verify);
if (stillNeedsVerify.length === 0) {
  data.updated = today;
}

const updatedText = `${JSON.stringify(data, null, 2)}\n`;
if (updatedText !== original) await writeFile(dataPath, updatedText);

console.log(`Source check for ${today}`);
console.log(`  confirmed: ${summary.confirmed.length}`);
console.log(`  quote not found: ${summary.missing.length}`);
console.log(`  unreachable: ${summary.unreachable.length}`);
for (const label of summary.missing) console.log(`  - not found: ${label}`);
for (const label of summary.unreachable) console.log(`  - unreachable: ${label}`);
console.log(stillNeedsVerify.length === 0
  ? `Every cell confirmed or left untouched; prices-checked date set to ${today}.`
  : `${stillNeedsVerify.length} cell(s) need a look at the source; prices-checked date left at ${data.updated}.`);
