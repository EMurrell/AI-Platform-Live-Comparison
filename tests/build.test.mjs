import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(path.join(root, "data/current.json"), "utf8"));

function build() {
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: root, stdio: "pipe" });
  return readFileSync(path.join(root, "index.html"));
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// Mirrors the formatter in scripts/build.mjs.
function formatDate(value) {
  const date = new Date(`${value}T12:00:00-04:00`);
  const parts = { day: "numeric", month: "long", year: "numeric", timeZone: "America/Toronto" };
  const format = key => new Intl.DateTimeFormat("en-CA", { [key]: parts[key], timeZone: parts.timeZone }).format(date);
  return `${format("day")} ${format("month")} ${format("year")}`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function assertCompleteGrid(block, name, expectedCells) {
  const providers = new Set(block.providers.map(provider => provider.id));
  const attributes = new Set(block.attributes.map(attribute => attribute.id));
  assert.equal(providers.size, 4, `${name}: provider count`);
  assert.equal(block.cells.length, expectedCells, `${name}: cell count`);
  assert.equal(providers.size * attributes.size, expectedCells, `${name}: grid does not match cell count`);

  const seen = new Set();
  for (const cell of block.cells) {
    const key = `${name} ${cell.provider}:${cell.attribute}`;
    assert.ok(providers.has(cell.provider), `unknown provider ${cell.provider}`);
    assert.ok(attributes.has(cell.attribute), `unknown attribute ${cell.attribute}`);
    assert.ok(!seen.has(key), `duplicate cell ${key}`);
    seen.add(key);
    assert.ok(cell.display?.trim(), `${key} has no display`);
    assert.ok(cell.checked?.trim(), `${key} has no checked date`);
    assert.ok(cell.source_url?.startsWith("https://"), `${key} source_url is not https`);
    // Only an unwatched cell may omit the quote; every watched cell is grepped daily.
    if (cell.watched === false) continue;
    // A quote is one string or a list of them, and a list matches when any entry does.
    const quotes = Array.isArray(cell.quote) ? cell.quote : [cell.quote];
    assert.ok(
      quotes.length > 0 && quotes.every(quote => quote?.trim()),
      `${key} is watched but has no quote`
    );
  }
  assert.equal(seen.size, expectedCells);
}

test("the data file describes a complete main grid and personal grid", () => {
  assertCompleteGrid(data, "main", 20);
  assertCompleteGrid(data.personal, "personal", 16);
  assert.equal(data.attributes.length, 5);
  assert.equal(data.personal.attributes.length, 4);
});

test("the built page shows every cell and provider from both tables", () => {
  const html = build().toString("utf8");
  for (const cell of [...data.cells, ...data.personal.cells]) {
    assert.ok(
      html.includes(escapeHtml(cell.display)),
      `missing display for ${cell.provider}/${cell.attribute}`
    );
    assert.ok(
      html.includes(`href="${escapeHtml(cell.source_url)}"`),
      `missing source link for ${cell.provider}/${cell.attribute}`
    );
  }
  for (const provider of [...data.providers, ...data.personal.providers]) {
    assert.ok(html.includes(escapeHtml(provider.name)), `missing provider ${provider.name}`);
  }
  assert.ok(html.includes(formatDate(data.updated)), "missing the formatted prices-checked date");
  assert.equal(countOccurrences(html, 'class="source-link"'), 36);
});

test("the personal table renders as its own accessible region", () => {
  const html = build().toString("utf8");
  assert.ok(html.includes("Personal plans compared"), "missing the personal table heading");
  assert.ok(
    html.includes('role="region" aria-label="Personal AI subscription comparison" tabindex="0"'),
    "personal table frame is missing its region semantics"
  );
  assert.equal(countOccurrences(html, 'class="table-frame"'), 2);
  assert.equal(countOccurrences(html, 'class="visually-hidden"'), 2, "each table needs a caption");
  assert.equal(countOccurrences(html, 'class="scroll-hint"'), 2);
  assert.equal(countOccurrences(html, 'class="attribute-head"'), 2);
  // Two tables, each with a corner header plus four provider headers.
  assert.equal(countOccurrences(html, 'scope="col"'), 10);
  assert.equal(countOccurrences(html, 'scope="row"'), 9);
  // The page compares; it does not rank or recommend.
  assert.ok(!/\bbest\b|\brecommend/i.test(html.replaceAll(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, "")));
});

test("the built page carries none of the retired vocabulary", () => {
  // The inlined logos are base64 blobs; strip them so terms are checked against real text.
  const html = build()
    .toString("utf8")
    .replaceAll(/data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+/g, "")
    .toLowerCase();
  for (const term of ["custom build", "baseline", "validation", "confidence", "independent comparison", "unattended", "seed", "pipeline", "approval", "**"]) {
    assert.ok(!html.includes(term), `page still contains "${term}"`);
  }
});

// Builds a mutated copy of the real data in a temp dir. Returns the built HTML,
// or null if the build refused the data.
function buildVariant(name, mutate) {
  const dir = mkdtempSync(path.join(tmpdir(), `u7-${name}-`));
  try {
    const dataFile = path.join(dir, "current.json");
    const outputFile = path.join(dir, "index.html");
    const copy = JSON.parse(JSON.stringify(data));
    mutate(copy);
    writeFileSync(dataFile, JSON.stringify(copy, null, 2));
    try {
      execFileSync(process.execPath, ["scripts/build.mjs", dataFile, outputFile], { cwd: root, stdio: "pipe" });
    } catch {
      return null;
    }
    return readFileSync(outputFile, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a cell marked needs_verify shows the verify chip", () => {
  // Asserted against controlled copies, not the live data: the daily check may
  // legitimately leave a cell flagged, and that must not fail the build.
  const clean = buildVariant("chip-clean", copy => {
    for (const cell of [...copy.cells, ...copy.personal.cells]) cell.needs_verify = false;
  });
  assert.equal(countOccurrences(clean, "Verify at source"), 0);

  const flagged = buildVariant("chip-main", copy => {
    for (const cell of [...copy.cells, ...copy.personal.cells]) cell.needs_verify = false;
    copy.cells[0].needs_verify = true;
  });
  assert.equal(countOccurrences(flagged, "Verify at source"), 1);

  const flaggedPersonal = buildVariant("chip-personal", copy => {
    for (const cell of [...copy.cells, ...copy.personal.cells]) cell.needs_verify = false;
    copy.personal.cells[0].needs_verify = true;
  });
  assert.equal(countOccurrences(flaggedPersonal, "Verify at source"), 1);
});

test("an empty quote is allowed only on an unwatched cell", () => {
  const watchedCell = data.personal.cells.findIndex(cell => cell.watched !== false);
  const unwatchedCell = data.personal.cells.findIndex(cell => cell.watched === false);
  assert.ok(watchedCell >= 0 && unwatchedCell >= 0, "fixture needs one watched and one unwatched cell");

  assert.equal(
    buildVariant("quote-watched", copy => { copy.personal.cells[watchedCell].quote = ""; }),
    null,
    "build should refuse a watched cell with an empty quote"
  );
  assert.ok(
    buildVariant("quote-unwatched", copy => { copy.personal.cells[unwatchedCell].quote = ""; }),
    "build should accept an unwatched cell with an empty quote"
  );
  assert.equal(
    buildVariant("quote-newly-watched", copy => { delete copy.personal.cells[unwatchedCell].watched; }),
    null,
    "a cell defaults to watched, so removing the flag must require a quote"
  );
  // display, source_url and checked stay mandatory even when unwatched.
  for (const field of ["display", "source_url", "checked"]) {
    assert.equal(
      buildVariant(`unwatched-${field}`, copy => { copy.personal.cells[unwatchedCell][field] = ""; }),
      null,
      `build should refuse an unwatched cell with an empty ${field}`
    );
  }
});

test("a watched quote may be a list, but not an empty or blank one", () => {
  const watchedCell = data.personal.cells.findIndex(cell => cell.watched !== false);
  assert.ok(watchedCell >= 0, "fixture needs a watched cell");

  // A page that prices by region needs one acceptable quote per region.
  assert.ok(
    buildVariant("quote-list", copy => {
      copy.personal.cells[watchedCell].quote = ["first wording", "second wording"];
    }),
    "build should accept a watched cell with a list of quotes"
  );
  assert.equal(
    buildVariant("quote-list-empty", copy => { copy.personal.cells[watchedCell].quote = []; }),
    null,
    "build should refuse a watched cell with an empty quote list"
  );
  assert.equal(
    buildVariant("quote-list-blank", copy => { copy.personal.cells[watchedCell].quote = ["   ", ""]; }),
    null,
    "build should refuse a quote list made of blanks"
  );
  // The single-string form is unchanged.
  assert.ok(
    buildVariant("quote-string", copy => { copy.personal.cells[watchedCell].quote = "one wording"; }),
    "build should still accept a watched cell with a single quote string"
  );
});

test("watched and render must be booleans when present", () => {
  const cell = data.personal.cells.findIndex(entry => entry.watched !== false);
  for (const flag of ["watched", "render"]) {
    assert.equal(
      buildVariant(`flag-${flag}`, copy => { copy.personal.cells[cell][flag] = "true"; }),
      null,
      `build should refuse a non-boolean ${flag}`
    );
  }
});

test("building twice produces byte-identical output", () => {
  assert.deepEqual(build(), build());
});
