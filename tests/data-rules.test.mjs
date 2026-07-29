import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { applyPriceReview, mergeResearch } from "../scripts/data-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(await readFile(path.join(root, "data/current.json"), "utf8"));
const timestamp = "2026-07-30T15:00:00.000Z";
const goodFx = {
  ok: true,
  rate: 1.41,
  date: "2026-07-30",
  source_url: "https://www.bankofcanada.ca/rates/exchange/daily-exchange-rates/"
};

// Shape is derived from the data file so adding or removing a row or a provider
// does not break the suite.
const TOTAL_CELLS = baseline.cells.length;
const ATTRIBUTE_COUNT = baseline.attributes.length;
const cellsFor = (providerId) => baseline.cells.filter(cell => cell.provider === providerId).length;

// A successful pull returns high confidence for every cell. Confidence fidelity is
// not what these tests are about; merge mechanics are.
function successfulResults(data = baseline) {
  return data.providers.map(provider => ({
    provider: provider.id,
    ok: true,
    cells: data.cells
      .filter(cell => cell.provider === provider.id)
      .map(({ attribute, value, display, source_url, sources, note }) => ({
        attribute,
        value,
        display,
        source_url,
        ...(sources ? { sources } : {}),
        confidence: "high",
        note
      }))
  }));
}

test("a complete no-change pull advances only the successful-update timestamp", () => {
  const merged = mergeResearch(baseline, successfulResults(), goodFx, timestamp);
  assert.equal(merged.complete, true);
  assert.equal(merged.data.last_successful_update, timestamp);
  assert.equal(merged.pending, null);
  assert.equal(merged.totalFailure, false);
  assert.equal(merged.acceptedCells, TOTAL_CELLS);
  assert.equal(merged.data.cells.length, TOTAL_CELLS);
  assert.ok(merged.data.cells.every(cell => cell.checked === "2026-07-30"));
  assert.ok(merged.data.cells.every(cell => cell.confidence === "high"));
  assert.ok(merged.data.cells.every((cell, index) => cell.last_changed === baseline.cells[index].last_changed));
});

test("one provider failure retains only that provider while the others update", () => {
  const failedProvider = "claude-team";
  const failedCount = cellsFor(failedProvider);
  const results = successfulResults();
  const index = results.findIndex(item => item.provider === failedProvider);
  results[index] = { provider: failedProvider, ok: false, error: "Simulated timeout" };

  const merged = mergeResearch(baseline, results, goodFx, timestamp);
  assert.equal(merged.complete, false);
  assert.equal(merged.totalFailure, false);
  assert.equal(merged.acceptedCells, TOTAL_CELLS - failedCount);
  assert.equal(merged.data.last_successful_update, baseline.last_successful_update);

  const failedBefore = baseline.cells.filter(cell => cell.provider === failedProvider);
  const failedAfter = merged.data.cells.filter(cell => cell.provider === failedProvider);
  assert.equal(failedAfter.length, failedCount);
  assert.ok(failedAfter.every((cell, i) => cell.checked === failedBefore[i].checked));
  assert.ok(failedAfter.every((cell, i) => sameJson(cell.value, failedBefore[i].value)));
  assert.ok(failedAfter.every(cell => cell.status === "unconfirmed_today"));
  assert.ok(failedAfter.every((cell, i) => cell.failed_checks === (failedBefore[i].failed_checks ?? 0) + 1));

  const successful = merged.data.cells.filter(cell => cell.provider !== failedProvider);
  assert.equal(successful.length, TOTAL_CELLS - failedCount);
  assert.ok(successful.every(cell => cell.checked === "2026-07-30"));
  assert.ok(successful.every(cell => cell.confidence === "high"));
});

test("one low-confidence cell is retained while its provider siblings update", () => {
  const providerId = "gemini-workspace";
  const attributeId = "unattended";
  const results = successfulResults();
  const result = results.find(item => item.provider === providerId);
  const cell = result.cells.find(item => item.attribute === attributeId);
  cell.value = "no";
  cell.display = "No";
  cell.confidence = "low";

  const merged = mergeResearch(baseline, results, goodFx, timestamp);
  const before = baseline.cells.find(item => item.provider === providerId && item.attribute === attributeId);
  const after = merged.data.cells.find(item => item.provider === providerId && item.attribute === attributeId);
  assert.equal(merged.complete, false);
  assert.equal(merged.totalFailure, false);
  assert.equal(merged.acceptedCells, TOTAL_CELLS - 1);
  assert.deepEqual(after.value, before.value);
  assert.equal(after.checked, before.checked);
  assert.equal(after.status, "unconfirmed_today");

  const siblings = merged.data.cells.filter(item => item.provider === providerId && item.attribute !== attributeId);
  assert.equal(siblings.length, ATTRIBUTE_COUNT - 1);
  assert.ok(siblings.every(item => item.checked === "2026-07-30"));
  assert.ok(siblings.every(item => item.confidence === "high"));
  assert.equal(merged.data.last_successful_update, baseline.last_successful_update);
});

test("a price change is held while the pull timestamp advances", () => {
  const results = successfulResults();
  const result = results.find(item => item.provider === "chatgpt-business");
  const proposed = result.cells.find(item => item.attribute === "price");
  const confirmedAmount = proposed.value.amount;
  const proposedAmount = confirmedAmount + 3;
  proposed.value = { ...proposed.value, amount: proposedAmount };
  proposed.display = `$${proposedAmount} USD/user/month billed annually; $25 monthly`;

  const merged = mergeResearch(baseline, results, goodFx, timestamp);
  const live = merged.data.cells.find(item => item.provider === "chatgpt-business" && item.attribute === "price");
  assert.equal(merged.complete, true);
  assert.equal(merged.data.last_successful_update, timestamp);
  assert.equal(live.value.amount, confirmedAmount);
  assert.equal(live.pending_review.proposed_display, proposed.display);
  assert.equal(merged.pending.proposals.length, 1);

  const approved = applyPriceReview(merged.data, merged.pending);
  const updated = approved.cells.find(item => item.provider === "chatgpt-business" && item.attribute === "price");
  assert.equal(updated.value.amount, proposedAmount);
  assert.equal(updated.pending_review, undefined);
  assert.equal(updated.last_changed, "2026-07-30");
});

test("an exchange-rate failure retains CAD state while every cell still updates", () => {
  const merged = mergeResearch(baseline, successfulResults(), { ok: false, error: "Simulated FX failure" }, timestamp);
  assert.equal(merged.complete, false);
  assert.equal(merged.totalFailure, false);
  assert.equal(merged.acceptedCells, TOTAL_CELLS);
  assert.equal(merged.data.last_successful_update, baseline.last_successful_update);
  assert.equal(merged.data.fx.rate, baseline.fx.rate);
  assert.equal(merged.data.fx.status, "unconfirmed_today");
  assert.equal(merged.data.fx.failed_checks, (baseline.fx.failed_checks ?? 0) + 1);
  assert.ok(merged.data.cells.every(cell => cell.checked === "2026-07-30"));
  assert.ok(merged.data.cells.every(cell => cell.confidence === "high"));
});

test("a total provider outage retains all values and marks every cell stale", () => {
  const failures = baseline.providers.map(provider => ({
    provider: provider.id,
    ok: false,
    error: "Simulated total outage"
  }));
  const merged = mergeResearch(baseline, failures, goodFx, timestamp);
  assert.equal(merged.complete, false);
  assert.equal(merged.totalFailure, true);
  assert.equal(merged.acceptedCells, 0);
  assert.equal(merged.data.last_successful_update, baseline.last_successful_update);
  assert.ok(merged.data.cells.every((cell, index) => sameJson(cell.value, baseline.cells[index].value)));
  assert.ok(merged.data.cells.every(cell => cell.status === "unconfirmed_today"));
  assert.ok(merged.data.cells.every((cell, index) => cell.failed_checks === (baseline.cells[index].failed_checks ?? 0) + 1));
});

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
