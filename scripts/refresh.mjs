import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data/current.json");
const original = await readFile(dataPath, "utf8");
const data = JSON.parse(original);

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 2_000;
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
    .replace(/&#8217;|&#x2019;|&rsquo;|’/gi, "'")
    .replace(/&#8216;|&#x2018;|&lsquo;|‘/gi, "'")
    .replace(/&mdash;|&#8212;|—|&ndash;|&#8211;|–/gi, "-")
    .replace(/&hellip;|&#8230;|…/gi, "...")
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
    return { ok: true, haystacks: [collapse(withoutMarkup(body))] };
  } catch (error) {
    return { ok: false, reason: error.name === "AbortError" ? "timed out" : error.message };
  } finally {
    clearTimeout(timer);
  }
}

// Some vendor pages are slow enough to straddle the timeout, so give each one a second chance.
async function loadWithRetry(url) {
  const first = await load(url);
  if (first.ok) return first;
  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
  return load(url);
}

// Both tables are checked the same way. A cell with `watched: false` carries no
// quote a grep could confirm (an absence, or a figure the page renders with
// scripts), so it is counted separately and never flagged for verification.
const allCells = [...data.cells, ...data.personal.cells];
const watched = allCells.filter(cell => cell.watched !== false);

const pages = new Map();
for (const url of new Set(watched.map(cell => cell.source_url))) {
  pages.set(url, await loadWithRetry(url));
}

const summary = { confirmed: [], missing: [], unreachable: [], unwatched: [] };
for (const cell of allCells) {
  const label = `${cell.provider}/${cell.attribute}`;
  if (cell.watched === false) {
    summary.unwatched.push(label);
    continue;
  }
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

const stillNeedsVerify = allCells.filter(cell => cell.needs_verify);
const everythingReachable = summary.unreachable.length === 0;
if (stillNeedsVerify.length === 0 && everythingReachable) {
  data.updated = today;
}

const updatedText = `${JSON.stringify(data, null, 2)}\n`;
if (updatedText !== original) await writeFile(dataPath, updatedText);

await writeFile(path.join(root, "refresh-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

console.log(`Source check for ${today}`);
console.log(`  confirmed: ${summary.confirmed.length}`);
console.log(`  quote not found: ${summary.missing.length}`);
console.log(`  unreachable: ${summary.unreachable.length}`);
console.log(`  unwatched: ${summary.unwatched.length}`);
for (const label of summary.missing) console.log(`  - not found: ${label}`);
for (const label of summary.unreachable) console.log(`  - unreachable: ${label}`);
console.log(stillNeedsVerify.length === 0 && everythingReachable
  ? `Every cell confirmed; prices-checked date set to ${today}.`
  : `Prices-checked date left at ${data.updated}: ${stillNeedsVerify.length} cell(s) need a look at the source, ${summary.unreachable.length} page(s) unreachable.`);
