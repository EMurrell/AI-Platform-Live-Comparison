import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { applyPriceReview } from "./data-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data/current.json");
const reviewPath = path.join(root, "data/pending-price-review.json");
const [current, review] = await Promise.all([
  readFile(dataPath, "utf8").then(JSON.parse),
  readFile(reviewPath, "utf8").then(JSON.parse)
]);

const updated = applyPriceReview(current, review);
await writeFile(dataPath, `${JSON.stringify(updated, null, 2)}\n`);
console.log(`Applied ${review.proposals.length} reviewed price change(s) from ${review.id}.`);
