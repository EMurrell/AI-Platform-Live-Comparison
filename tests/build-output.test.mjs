import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [html, data, refreshWorkflow, productionHealthWorkflow, sourceHealthWorkflow] = await Promise.all([
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "data/current.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, ".github/workflows/refresh.yml"), "utf8"),
  readFile(path.join(root, ".github/workflows/production-health.yml"), "utf8"),
  readFile(path.join(root, ".github/workflows/source-health.yml"), "utf8")
]);

const EMPHASISED_ATTRIBUTES = ["mailbox_actions", "unattended"];
const occurrences = (pattern) => (html.match(pattern) ?? []).length;
const cellsWithConfidence = (level) => data.cells.filter(cell => cell.confidence === level).length;
const unverifiedSeedCells = data.cells.filter(cell => cell.change_kind === "unverified_seed");
const awaitingApprovalCells = data.cells.filter(
  cell => data.seed_verified === false && cell.change_kind === "source_researched"
);
const researchedUnverifiedCells = data.cells.filter(
  cell => cell.confidence === "unverified" && cell.change_kind !== "unverified_seed"
);

test("the built page only exposes a last-updated date after approval and a successful refresh", () => {
  const canShowDate = data.seed_verified && data.last_successful_update !== null;
  assert.equal(/Last updated on/.test(html), canShowDate);
  if (!data.seed_verified) {
    assert.match(html, /Verification status/);
    assert.match(html, /awaiting baseline approval/i);
  } else if (!data.last_successful_update) {
    assert.match(html, /Refresh status/);
    assert.match(html, /automated source refresh is still pending/i);
  }
  assert.match(html, /noindex, nofollow, noarchive/);
});

test("the built page embeds its logo and styles and sources every cell", () => {
  assert.match(html, /data:image\/png;base64,/);
  assert.doesNotMatch(html, /\/\*__[A-Z_]+__\*\//);
  assert.equal(occurrences(/class="source-link"/g), data.cells.length);
});

test("the built page retains its automated accessibility guardrails", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /<a class="skip-link" href="#comparison">/);
  assert.match(html, /id="comparison"/);
  assert.match(html, /<caption class="visually-hidden">/);
  assert.match(html, /scope="col"/);
  assert.match(html, /scope="row"/);
  assert.match(html, /scope="colgroup"/);
  assert.match(html, /role="region" aria-label="AI platform comparison table" tabindex="0"/);
  assert.doesNotMatch(html, /<img(?![^>]*\balt="[^"]+")[^>]*>/);
  assert.match(html, /outline: 3px solid var\(--focus\)/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the two important email rows have heavier visual treatment", () => {
  const emphasised = data.attributes.filter(attribute => EMPHASISED_ATTRIBUTES.includes(attribute.id));
  assert.equal(emphasised.length, EMPHASISED_ATTRIBUTES.length, "both emphasised attributes must still exist");
  assert.equal(occurrences(/attribute attribute--emphasis/g), emphasised.length);
  assert.equal(occurrences(/cell cell--emphasis/g), emphasised.length * data.providers.length);
});

test("verified and unverified cells are rendered distinctly", () => {
  const unverified = cellsWithConfidence("unverified");
  const verified = data.cells.length - unverified;
  assert.ok(unverified > 0, "the fixture should still contain unverified cells");
  assert.ok(verified > 0, "the fixture should contain verified cells once verification has begun");
  assert.ok(researchedUnverifiedCells.length > 0, "researched vendor ambiguities should remain explicit");

  assert.equal(
    occurrences(/<span class="verify-flag">Unverified machine-generated seed<\/span>/g),
    unverifiedSeedCells.length
  );
  assert.equal(
    occurrences(/<span class="verify-flag">Vendor wording is unverified<\/span>/g),
    researchedUnverifiedCells.filter(cell => !awaitingApprovalCells.includes(cell)).length
  );
  assert.equal(
    occurrences(/<span class="verify-flag">Source-backed; awaiting baseline approval<\/span>/g),
    awaitingApprovalCells.length
  );
  assert.equal(occurrences(/<span class="confidence">Unverified seed<\/span>/g), unverifiedSeedCells.length);
  assert.equal(
    occurrences(/<span class="confidence">Unverified<\/span>/g),
    researchedUnverifiedCells.filter(cell => !awaitingApprovalCells.includes(cell)).length
  );
  assert.equal(occurrences(/<span class="confidence">Awaiting approval<\/span>/g), awaitingApprovalCells.length);
  for (const level of ["high", "medium"]) {
    assert.equal(
      occurrences(new RegExp(`<span class="confidence">${level} confidence</span>`, "g")),
      data.cells.filter(cell => cell.confidence === level && !awaitingApprovalCells.includes(cell)).length
    );
  }
});

test("price rows preserve vendor currencies and expose exact quoted evidence", () => {
  const priceCells = data.cells.filter(cell => cell.attribute === "price");
  const evidenceCount = priceCells.reduce((sum, cell) => sum + cell.value.evidence.length, 0);
  assert.equal("fx" in data, false);
  assert.ok(priceCells.every(cell => "billing_currency" in cell.value));
  assert.ok(priceCells.every(cell => Array.isArray(cell.value.evidence) && cell.value.evidence.length > 0));
  assert.equal(occurrences(/class="evidence-link"/g), evidenceCount);
  assert.doesNotMatch(html, /Bank of Canada|indicative CAD|Exchange rate used/i);
  assert.match(html, /no currency conversion is applied/i);
});

test("the table shape on the page matches the data file", () => {
  assert.equal(data.cells.length, data.providers.length * data.attributes.length);
  const pairs = new Set(data.cells.map(cell => `${cell.provider}:${cell.attribute}`));
  assert.equal(pairs.size, data.cells.length);
});

test("the refresh workflow commits staleness state before reporting a total outage", () => {
  assert.match(refreshWorkflow, /continue-on-error: true/);
  const commitStep = refreshWorkflow.indexOf("- name: Commit confirmed updates");
  const failureStep = refreshWorkflow.indexOf("- name: Fail a total research outage");
  assert.ok(commitStep > -1);
  assert.ok(failureStep > commitStep);
});

test("production monitors avoid false incidents for expected vendor blocks and superseded deploys", () => {
  assert.match(productionHealthWorkflow, /failure\|timed_out\|action_required\|startup_failure\|stale/);
  assert.doesNotMatch(productionHealthWorkflow, /DEPLOYMENT_CONCLUSION.*!=.*success/);
  assert.match(sourceHealthWorkflow, /No broken source links remain; vendor-restricted pages continue/);
  assert.doesNotMatch(sourceHealthWorkflow, /Every source returned a verifiable response/);
});
