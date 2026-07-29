import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [html, data, refreshWorkflow] = await Promise.all([
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "data/current.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, ".github/workflows/refresh.yml"), "utf8")
]);

test("the built page exposes the unverified seed without an update date", () => {
  assert.equal(data.last_successful_update, null);
  assert.equal(data.seed_verified, false);
  assert.doesNotMatch(html, /Last updated on/);
  assert.match(html, /Verification status/);
  assert.match(html, /Unverified seed/);
  assert.match(html, /no successful automated refresh or human seed verification/i);
  assert.match(html, /noindex, nofollow, noarchive/);
});

test("the built page embeds its logo, styles and 45 source links", () => {
  assert.match(html, /data:image\/png;base64,/);
  assert.doesNotMatch(html, /\/\*__[A-Z_]+__\*\//);
  assert.equal((html.match(/class="source-link"/g) ?? []).length, 45);
});

test("the two important email rows have heavier visual treatment", () => {
  assert.equal((html.match(/attribute attribute--emphasis/g) ?? []).length, 2);
  assert.equal((html.match(/cell cell--emphasis/g) ?? []).length, 10);
});

test("all machine-generated seed cells render as unverified", () => {
  assert.ok(data.cells.every(cell => cell.confidence === "unverified"));
  assert.equal((html.match(/<span class="verify-flag">Unverified machine-generated seed<\/span>/g) ?? []).length, 45);
  assert.equal((html.match(/Unverified seed/g) ?? []).length, 46);
});

test("the refresh workflow commits staleness state before reporting a total outage", () => {
  assert.match(refreshWorkflow, /continue-on-error: true/);
  const commitStep = refreshWorkflow.indexOf("- name: Commit confirmed updates");
  const failureStep = refreshWorkflow.indexOf("- name: Fail a total research outage");
  assert.ok(commitStep > -1);
  assert.ok(failureStep > commitStep);
});
