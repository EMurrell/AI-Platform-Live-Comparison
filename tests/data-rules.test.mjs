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

function successfulResults(data = baseline) {
  return data.providers.map(provider => ({
    provider: provider.id,
    ok: true,
    cells: data.cells
      .filter(cell => cell.provider === provider.id)
      .map(({ attribute, value, display, source_url, sources, confidence, note }) => ({
        attribute,
        value,
        display,
        source_url,
        ...(sources ? { sources } : {}),
        confidence,
        note
      }))
  }));
}

test("a complete no-change pull advances only the successful-update timestamp", () => {
  const merged = mergeResearch(baseline, successfulResults(), goodFx, timestamp);
  assert.equal(merged.complete, true);
  assert.equal(merged.data.last_successful_update, timestamp);
  assert.equal(merged.pending, null);
  assert.equal(merged.data.cells.length, 45);
  assert.ok(merged.data.cells.every(cell => cell.checked === "2026-07-30"));
  assert.ok(merged.data.cells.every((cell, index) => cell.last_changed === baseline.cells[index].last_changed));
});

test("a provider failure retains values and does not advance the timestamp", () => {
  const results = successfulResults();
  results[1] = { provider: "claude-team", ok: false, error: "Simulated timeout" };
  const merged = mergeResearch(baseline, results, goodFx, timestamp);
  assert.equal(merged.complete, false);
  assert.equal(merged.data.last_successful_update, baseline.last_successful_update);
  const before = baseline.cells.find(cell => cell.provider === "claude-team" && cell.attribute === "mailbox_actions");
  const after = merged.data.cells.find(cell => cell.provider === "claude-team" && cell.attribute === "mailbox_actions");
  assert.deepEqual(after.value, before.value);
  assert.equal(after.status, "unconfirmed_today");
  assert.equal(after.failed_checks, 1);
});

test("a low-confidence result cannot overwrite a confirmed value", () => {
  const results = successfulResults();
  const result = results.find(item => item.provider === "gemini-workspace");
  const cell = result.cells.find(item => item.attribute === "unattended");
  cell.value = "no";
  cell.display = "No";
  cell.confidence = "low";
  const merged = mergeResearch(baseline, results, goodFx, timestamp);
  const before = baseline.cells.find(item => item.provider === "gemini-workspace" && item.attribute === "unattended");
  const after = merged.data.cells.find(item => item.provider === "gemini-workspace" && item.attribute === "unattended");
  assert.equal(merged.complete, false);
  assert.deepEqual(after.value, before.value);
  assert.equal(after.status, "unconfirmed_today");
  const unaffected = merged.data.cells.find(item => item.provider === "gemini-workspace" && item.attribute === "training");
  assert.equal(unaffected.status, undefined);
  assert.equal(merged.data.last_successful_update, baseline.last_successful_update);
});

test("a price change is held while the pull timestamp advances", () => {
  const results = successfulResults();
  const result = results.find(item => item.provider === "chatgpt-business");
  const proposed = result.cells.find(item => item.attribute === "price");
  proposed.value = { ...proposed.value, amount: 22 };
  proposed.display = "$22 USD/user/month annually; $25 monthly";
  const merged = mergeResearch(baseline, results, goodFx, timestamp);
  const live = merged.data.cells.find(item => item.provider === "chatgpt-business" && item.attribute === "price");
  assert.equal(merged.complete, true);
  assert.equal(merged.data.last_successful_update, timestamp);
  assert.equal(live.value.amount, 20);
  assert.equal(live.pending_review.proposed_display, proposed.display);
  assert.equal(merged.pending.proposals.length, 1);

  const approved = applyPriceReview(merged.data, merged.pending);
  const updated = approved.cells.find(item => item.provider === "chatgpt-business" && item.attribute === "price");
  assert.equal(updated.value.amount, 22);
  assert.equal(updated.pending_review, undefined);
  assert.equal(updated.last_changed, "2026-07-30");
});

test("an exchange-rate failure makes the pull atomic", () => {
  const merged = mergeResearch(baseline, successfulResults(), { ok: false, error: "Simulated FX failure" }, timestamp);
  assert.equal(merged.complete, false);
  assert.equal(merged.data.last_successful_update, baseline.last_successful_update);
  assert.equal(merged.data.fx.rate, baseline.fx.rate);
});
