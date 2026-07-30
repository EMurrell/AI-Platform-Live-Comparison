import test from "node:test";
import assert from "node:assert/strict";
import {
  checkUrl,
  classifyStatus,
  collectSourceUrls,
  runLinkCheck,
  shouldRetry,
  summarizeResults
} from "../scripts/check-links.mjs";

function response(status, url = "https://vendor.example/final") {
  return {
    status,
    url,
    body: { cancel: async () => {} }
  };
}

test("HTTP status classes distinguish verified, restricted and broken sources", () => {
  assert.deepEqual(classifyStatus(200), {
    classification: "healthy",
    reason: "reachable"
  });
  assert.deepEqual(classifyStatus(302), {
    classification: "healthy",
    reason: "reachable"
  });
  assert.deepEqual(classifyStatus(403), {
    classification: "restricted",
    reason: "access_restricted"
  });
  assert.deepEqual(classifyStatus(429), {
    classification: "restricted",
    reason: "rate_limited"
  });
  assert.equal(classifyStatus(404).classification, "broken");
  assert.equal(classifyStatus(410).classification, "broken");
  assert.equal(classifyStatus(503).classification, "broken");
  assert.equal(classifyStatus(0).classification, "broken");
});

test("restricted sources are not counted as verified", () => {
  const summary = summarizeResults([
    { classification: "healthy" },
    { classification: "restricted" },
    { classification: "broken" }
  ]);
  assert.deepEqual(summary, {
    total: 3,
    healthy: 1,
    restricted: 1,
    broken: 1,
    verified: 1,
    fully_verified: false,
    action_required: true
  });
});

test("source collection deduplicates every supported evidence location", () => {
  const data = {
    cells: [
      {
        source_url: "https://vendor.example/a",
        sources: ["https://vendor.example/a", "https://vendor.example/b"],
        value: {
          evidence: [
            { source_url: "https://vendor.example/c" },
            { source_url: "https://vendor.example/b" }
          ]
        }
      },
      { source_url: "", value: null }
    ]
  };
  assert.deepEqual(collectSourceUrls(data), [
    "https://vendor.example/a",
    "https://vendor.example/b",
    "https://vendor.example/c"
  ]);
});

test("rate limits and transient failures retry and can recover", async () => {
  const statuses = [429, 503, 200];
  const fetchImpl = async () => response(statuses.shift());
  const result = await checkUrl("https://vendor.example/a", { fetchImpl });
  assert.equal(result.classification, "healthy");
  assert.equal(result.attempts, 3);
  assert.equal(result.status, 200);
  assert.equal(shouldRetry(429), true);
  assert.equal(shouldRetry(503), true);
});

test("access restrictions stop immediately and remain unverified", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response(403);
  };
  const result = await checkUrl("https://vendor.example/a", { fetchImpl });
  assert.equal(calls, 1);
  assert.equal(result.classification, "restricted");
  assert.equal(result.reason, "access_restricted");
  assert.equal(result.attempts, 1);
});

test("network failures retry before being classified as broken", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("synthetic timeout");
  };
  const result = await checkUrl("https://vendor.example/a", {
    fetchImpl,
    attempts: 2,
    timeoutMs: 10
  });
  assert.equal(calls, 2);
  assert.equal(result.classification, "broken");
  assert.equal(result.reason, "network_error");
  assert.equal(result.error, "synthetic timeout");
});

test("the full checker uses injected fetch and reports mixed synthetic results", async () => {
  const data = {
    cells: [
      { source_url: "https://vendor.example/healthy" },
      { source_url: "https://vendor.example/restricted" },
      { source_url: "https://vendor.example/broken" }
    ]
  };
  const fetchImpl = async (url) => {
    if (url.endsWith("/healthy")) return response(200, url);
    if (url.endsWith("/restricted")) return response(403, url);
    return response(404, url);
  };
  const report = await runLinkCheck(data, {
    fetchImpl,
    concurrency: 2
  });

  assert.equal(report.results.length, 3);
  assert.equal(report.summary.healthy, 1);
  assert.equal(report.summary.restricted, 1);
  assert.equal(report.summary.broken, 1);
  assert.equal(report.summary.verified, 1);
  assert.equal(report.summary.fully_verified, false);
  assert.equal(report.summary.action_required, true);
});
