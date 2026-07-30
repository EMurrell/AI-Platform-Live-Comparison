import test from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_CONFIRMATION,
  verifySeed
} from "../scripts/seed-verification-rules.mjs";

const timestamp = "2026-07-30T12:00:00.000Z";
const approval = {
  actor: "verified-human",
  timestamp,
  confirmation: REQUIRED_CONFIRMATION
};

function fixture(changeKind = "source_researched") {
  return {
    seed_verified: false,
    last_successful_update: null,
    method: "Awaiting review.",
    cells: [{
      provider: "one",
      attribute: "one",
      value: { retained: true },
      change_kind: changeKind
    }],
    changelog: []
  };
}

test("explicit approval records the actor without changing cell values", () => {
  const before = fixture();
  const after = verifySeed(before, approval);
  assert.equal(after.seed_verified, true);
  assert.deepEqual(after.seed_verification, { actor: approval.actor, verified_at: timestamp });
  assert.deepEqual(after.cells.map(cell => cell.value), before.cells.map(cell => cell.value));
  assert.match(after.method, /first complete automated source refresh is still pending/i);
});

test("verification is blocked while machine-generated seed cells remain", () => {
  assert.throws(
    () => verifySeed(fixture("unverified_seed"), approval),
    /machine-generated seed cells still require source-backed research/
  );
});

test("verification requires the authenticated human confirmation phrase", () => {
  assert.throws(
    () => verifySeed(fixture(), { ...approval, confirmation: "approve it" }),
    /Confirmation must exactly match/
  );
});

test("verification cannot overwrite an existing approval record", () => {
  const alreadyVerified = {
    ...fixture(),
    seed_verified: true,
    seed_verification: { actor: "first-reviewer", verified_at: timestamp }
  };
  assert.throws(
    () => verifySeed(alreadyVerified, approval),
    /already been approved/
  );
});
