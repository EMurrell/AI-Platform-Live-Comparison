import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data/current.json");
const original = await readFile(dataPath, "utf8");
const data = JSON.parse(original);

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 2_000;
const RENDER_TIMEOUT_MS = 45_000;
// A dumped DOM runs to a few hundred KB, well past execFile's 1 MB default.
const RENDER_MAX_BUFFER = 64 * 1024 * 1024;
// Chrome is only needed for pages that print their prices with scripts. GitHub's
// Ubuntu runners ship Google Chrome, so watching one costs no new dependency.
const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "google-chrome",
  "google-chrome-stable",
  "chromium-browser",
  "chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
].filter(Boolean);
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

// Resolved once: the first name on the list that answers --version wins.
let chromeLookup;
function findChrome() {
  chromeLookup ??= (async () => {
    for (const candidate of CHROME_CANDIDATES) {
      try {
        await execFileAsync(candidate, ["--version"], { timeout: 10_000 });
        return candidate;
      } catch {
        // Not this one; try the next name on the list.
      }
    }
    return null;
  })();
  return chromeLookup;
}

// Renders the page in headless Chrome and puts the dumped DOM through the very
// same pipeline as a fetched body, so a rendered quote is matched exactly like a
// fetched one. A missing browser or a failed render is reported, never skipped.
async function render(url) {
  const chrome = await findChrome();
  if (!chrome) return { ok: false, reason: "chrome not available" };
  try {
    const { stdout } = await execFileAsync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--virtual-time-budget=10000",
        "--dump-dom",
        url
      ],
      { timeout: RENDER_TIMEOUT_MS, maxBuffer: RENDER_MAX_BUFFER }
    );
    if (stdout.trim() === "") return { ok: false, reason: "render returned an empty page" };
    return { ok: true, haystacks: [collapse(withoutMarkup(stdout))] };
  } catch (error) {
    return { ok: false, reason: error.killed ? "render timed out" : "render failed" };
  }
}

// The render path earns the same second chance as the fetch path: a slow page or
// a one-off Chrome crash should not cost a cell. A missing browser is the one
// exception, since it stays missing for the whole run.
async function renderWithRetry(url) {
  const first = await render(url);
  if (first.ok || first.reason === "chrome not available") return first;
  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
  return render(url);
}

// A quote is either one string or a list of them, and a list is satisfied by any
// entry. That is how a page priced by region is watched from more than one place:
// no single string can match both the Canadian and the US rendering.
function needlesFor(cell) {
  const quotes = Array.isArray(cell.quote) ? cell.quote : [cell.quote ?? ""];
  return quotes.map(quote => collapse(quote ?? "")).filter(quote => quote !== "");
}

// Both tables are checked the same way. A cell with `watched: false` carries no
// quote a grep could confirm (it states an absence), so it is counted separately
// and never flagged for verification.
const allCells = [...data.cells, ...data.personal.cells];
const watched = allCells.filter(cell => cell.watched !== false);

// A rendered read and a fetched read of one URL are different pages, so they are
// cached apart; within a mode each URL is still loaded only once.
function pageKey(cell) {
  return `${cell.render === true ? "render" : "fetch"} ${cell.source_url}`;
}

const pages = new Map();
for (const cell of watched) {
  const key = pageKey(cell);
  if (pages.has(key)) continue;
  pages.set(key, cell.render === true
    ? await renderWithRetry(cell.source_url)
    : await loadWithRetry(cell.source_url));
}

const summary = { confirmed: [], missing: [], unreachable: [], unwatched: [] };
for (const cell of allCells) {
  const label = `${cell.provider}/${cell.attribute}`;
  if (cell.watched === false) {
    summary.unwatched.push(label);
    continue;
  }
  const page = pages.get(pageKey(cell));
  if (!page.ok) {
    summary.unreachable.push(`${label} (${page.reason})`);
    continue;
  }
  const needles = needlesFor(cell);
  if (needles.length > 0 && needles.some(needle => page.haystacks.some(haystack => haystack.includes(needle)))) {
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
