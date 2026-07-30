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

test("the data file describes a complete four-by-four grid", () => {
  const providers = new Set(data.providers.map(provider => provider.id));
  const attributes = new Set(data.attributes.map(attribute => attribute.id));
  assert.equal(providers.size, 4);
  assert.equal(attributes.size, 4);
  assert.equal(data.cells.length, 16);

  const seen = new Set();
  for (const cell of data.cells) {
    const key = `${cell.provider}:${cell.attribute}`;
    assert.ok(providers.has(cell.provider), `unknown provider ${cell.provider}`);
    assert.ok(attributes.has(cell.attribute), `unknown attribute ${cell.attribute}`);
    assert.ok(!seen.has(key), `duplicate cell ${key}`);
    seen.add(key);
    assert.ok(cell.display?.trim(), `${key} has no display`);
    assert.ok(cell.quote?.trim(), `${key} has no quote`);
    assert.ok(cell.checked?.trim(), `${key} has no checked date`);
    assert.ok(cell.source_url?.startsWith("https://"), `${key} source_url is not https`);
  }
  assert.equal(seen.size, 16);
});

test("the built page shows every cell and provider", () => {
  const html = build().toString("utf8");
  for (const cell of data.cells) {
    assert.ok(
      html.includes(escapeHtml(cell.display)),
      `missing display for ${cell.provider}/${cell.attribute}`
    );
    assert.ok(
      html.includes(`href="${escapeHtml(cell.source_url)}"`),
      `missing source link for ${cell.provider}/${cell.attribute}`
    );
  }
  for (const provider of data.providers) {
    assert.ok(html.includes(escapeHtml(provider.name)), `missing provider ${provider.name}`);
  }
  assert.ok(html.includes(formatDate(data.updated)), "missing the formatted prices-checked date");
  assert.equal(countOccurrences(html, 'class="source-link"'), 16);
});

test("the built page carries none of the retired vocabulary", () => {
  // The inlined logo is a base64 blob; strip it so terms are checked against real text.
  const html = build()
    .toString("utf8")
    .replaceAll(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, "")
    .toLowerCase();
  for (const term of ["custom build", "baseline", "validation", "confidence", "independent comparison", "unattended", "seed", "pipeline", "approval", "**"]) {
    assert.ok(!html.includes(term), `page still contains "${term}"`);
  }
});

test("a cell marked needs_verify shows the verify chip", () => {
  assert.equal(countOccurrences(build().toString("utf8"), "Verify at source"), 0);

  const dir = mkdtempSync(path.join(tmpdir(), "u7-verify-chip-"));
  try {
    const dataFile = path.join(dir, "current.json");
    const outputFile = path.join(dir, "index.html");
    const copy = JSON.parse(JSON.stringify(data));
    copy.cells[0].needs_verify = true;
    writeFileSync(dataFile, JSON.stringify(copy, null, 2));

    execFileSync(process.execPath, ["scripts/build.mjs", dataFile, outputFile], { cwd: root, stdio: "pipe" });
    assert.equal(countOccurrences(readFileSync(outputFile, "utf8"), "Verify at source"), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("building twice produces byte-identical output", () => {
  assert.deepEqual(build(), build());
});
