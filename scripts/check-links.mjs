import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESTRICTED_STATUSES = new Set([401, 403, 405, 406, 407, 418, 423, 429, 451]);
const RETRYABLE_STATUSES = new Set([0, 408, 425, 429]);

export function collectSourceUrls(data) {
  return [...new Set(
    data.cells
      .flatMap(cell => [
        cell.source_url,
        ...(cell.sources ?? []),
        ...(cell.value?.evidence ?? []).map(item => item.source_url)
      ])
      .filter(url => typeof url === "string" && url.trim() !== "")
  )];
}

export function classifyStatus(status) {
  if (status >= 200 && status < 400) {
    return { classification: "healthy", reason: "reachable" };
  }
  if (RESTRICTED_STATUSES.has(status)) {
    return {
      classification: "restricted",
      reason: status === 429 ? "rate_limited" : "access_restricted"
    };
  }
  return {
    classification: "broken",
    reason: status === 0 ? "network_error" : "http_error"
  };
}

export function shouldRetry(status) {
  return RETRYABLE_STATUSES.has(status) || status >= 500;
}

export async function fetchOnce(
  url,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 20_000
  } = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "U7-source-validator/2.0" }
    });
    await response.body?.cancel?.();
    return {
      url,
      status: response.status,
      finalUrl: response.url || url
    };
  } catch (error) {
    return {
      url,
      status: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkUrl(
  url,
  {
    fetchImpl = globalThis.fetch,
    attempts = 3,
    timeoutMs = 20_000
  } = {}
) {
  let result;
  const allowedAttempts = Math.max(1, attempts);
  for (let attempt = 1; attempt <= allowedAttempts; attempt += 1) {
    result = await fetchOnce(url, { fetchImpl, timeoutMs });
    if (!shouldRetry(result.status) || attempt === allowedAttempts) {
      const classification = classifyStatus(result.status);
      return { ...result, ...classification, attempts: attempt };
    }
  }
  throw new Error("Link check did not produce a result.");
}

export function summarizeResults(results) {
  const summary = {
    total: results.length,
    healthy: 0,
    restricted: 0,
    broken: 0,
    verified: 0,
    fully_verified: true,
    action_required: false
  };

  for (const result of results) {
    summary[result.classification] += 1;
  }
  summary.verified = summary.healthy;
  summary.fully_verified = summary.restricted === 0 && summary.broken === 0;
  summary.action_required = summary.broken > 0;
  return summary;
}

export async function runLinkCheck(
  data,
  {
    fetchImpl = globalThis.fetch,
    attempts = 3,
    timeoutMs = 20_000,
    concurrency = 6
  } = {}
) {
  const urls = collectSourceUrls(data);
  const results = [];
  const batchSize = Math.max(1, concurrency);

  for (let index = 0; index < urls.length; index += batchSize) {
    results.push(...await Promise.all(
      urls
        .slice(index, index + batchSize)
        .map(url => checkUrl(url, { fetchImpl, attempts, timeoutMs }))
    ));
  }

  return {
    checked_at: new Date().toISOString(),
    summary: summarizeResults(results),
    results
  };
}

function formatResult(result) {
  const detail = result.error
    ? result.error
    : `${result.status}${result.finalUrl !== result.url ? ` → ${result.finalUrl}` : ""}`;
  return `${result.classification.toUpperCase()} ${detail} ${result.url}`;
}

async function main() {
  const data = JSON.parse(await readFile(path.join(root, "data/current.json"), "utf8"));
  const report = await runLinkCheck(data);
  const jsonOutput = process.argv.includes("--json");

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const result of report.results) {
      console.log(formatResult(result));
    }
    const { healthy, restricted, broken, total } = report.summary;
    console.log(
      `Checked ${total} unique official source links: ` +
      `${healthy} healthy, ${restricted} restricted, ${broken} broken.`
    );
  }

  if (report.summary.restricted > 0 && !jsonOutput) {
    console.warn(
      "Some sources block automated requests. They are reported as restricted and are not counted as verified."
    );
  }
  if (report.summary.action_required) {
    if (!jsonOutput) console.error("One or more source links are broken.");
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
