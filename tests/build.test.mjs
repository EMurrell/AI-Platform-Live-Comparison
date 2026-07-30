import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(path.join(root, "data/current.json"), "utf8"));

function build() {
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: root, stdio: "pipe" });
  return readFileSync(path.join(root, "index.html"));
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
});

test("the built page carries none of the retired vocabulary", () => {
  const html = build().toString("utf8").toLowerCase();
  for (const term of ["custom build", "baseline", "validation", "confidence", "independent comparison", "unattended", "**"]) {
    assert.ok(!html.includes(term), `page still contains "${term}"`);
  }
});

test("building twice produces byte-identical output", () => {
  assert.deepEqual(build(), build());
});
