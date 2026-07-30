import { readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mergeResearch } from "./data-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultsPath = process.argv[2];

if (!resultsPath) {
  console.error("Usage: node scripts/import-research.mjs <provider-results.json>");
  process.exit(2);
}

const dataPath = path.join(root, "data/current.json");
const pendingPath = path.join(root, "data/pending-price-review.json");
const [current, imported] = await Promise.all([
  readFile(dataPath, "utf8").then(JSON.parse),
  readFile(path.resolve(resultsPath), "utf8").then(JSON.parse)
]);
const providerResults = Array.isArray(imported) ? imported : imported.provider_results;

if (!Array.isArray(providerResults)) {
  console.error("The imported file must be an array or contain a provider_results array.");
  process.exit(2);
}

const timestamp = new Date().toISOString();
const merged = mergeResearch(current, providerResults, timestamp);
await writeFile(dataPath, `${JSON.stringify(merged.data, null, 2)}\n`);

if (merged.pending) {
  await writeFile(pendingPath, `${JSON.stringify(merged.pending, null, 2)}\n`);
  console.log(`${merged.pending.proposals.length} price change(s) held for review as ${merged.pending.id}.`);
} else {
  await unlink(pendingPath).catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
}

console.log(JSON.stringify({
  complete: merged.complete,
  total_failure: merged.totalFailure,
  accepted_cells: merged.acceptedCells,
  total_cells: current.cells.length,
  errors: merged.errors,
  pending_price_review: merged.pending?.id ?? null
}, null, 2));

if (merged.complete) {
  console.log("Complete direct-source pull passed. Last successful update advanced.");
} else {
  console.warn(`::warning::Partial direct-source pull: ${merged.acceptedCells} of ${current.cells.length} cells passed. Successful cells and staleness state were retained without advancing the successful-update timestamp.`);
  if (merged.totalFailure) process.exitCode = 1;
}
