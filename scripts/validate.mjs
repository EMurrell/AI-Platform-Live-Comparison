import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(path.join(root, "data/current.json"), "utf8"));
const errors = [];
const requiredFields = ["provider", "attribute", "value", "display", "source_url", "confidence", "checked", "last_changed", "note"];
const providerIds = new Set(data.providers.map(provider => provider.id));
const attributeIds = new Set(data.attributes.map(attribute => attribute.id));
const officialDomains = new Set(data.providers.flatMap(provider => provider.official_domains));
const seen = new Set();

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isOfficial(url) {
  const host = hostname(url);
  return [...officialDomains].some(domain => host === domain || host.endsWith(`.${domain}`));
}

if (data.cells.length !== data.providers.length * data.attributes.length) {
  errors.push(`Expected ${data.providers.length * data.attributes.length} cells, found ${data.cells.length}.`);
}

for (const [index, cell] of data.cells.entries()) {
  const key = `${cell.provider}:${cell.attribute}`;
  if (seen.has(key)) errors.push(`Duplicate cell ${key}.`);
  seen.add(key);
  if (!providerIds.has(cell.provider)) errors.push(`Cell ${index} has unknown provider ${cell.provider}.`);
  if (!attributeIds.has(cell.attribute)) errors.push(`Cell ${index} has unknown attribute ${cell.attribute}.`);
  for (const field of requiredFields) {
    if (!(field in cell) || cell[field] === "" || cell[field] === null || cell[field] === undefined) {
      if (!(field === "value" && cell.value === 0)) errors.push(`${key} is missing ${field}.`);
    }
  }
  if (!["high", "medium", "low"].includes(cell.confidence)) errors.push(`${key} has invalid confidence.`);
  if (!isOfficial(cell.source_url)) errors.push(`${key} uses a non-official source: ${cell.source_url}`);
  for (const source of cell.sources ?? []) {
    if (!isOfficial(source)) errors.push(`${key} uses a non-official supporting source: ${source}`);
  }
  if (cell.attribute === "price") {
    if (!cell.value || typeof cell.value !== "object" || Array.isArray(cell.value)) {
      errors.push(`${key} must have a structured price value.`);
    } else {
      for (const field of ["currency", "amount", "billing_period", "commitment", "monthly_amount", "promo"]) {
        if (!(field in cell.value)) errors.push(`${key} price is missing ${field}.`);
      }
    }
  }
}

for (const provider of data.providers) {
  for (const attribute of data.attributes) {
    const key = `${provider.id}:${attribute.id}`;
    if (!seen.has(key)) errors.push(`Missing cell ${key}.`);
  }
}

if (!data.last_successful_update || Number.isNaN(new Date(data.last_successful_update).getTime())) {
  errors.push("last_successful_update must be a valid timestamp.");
}

if (!data.fx?.rate || !data.fx?.date || !data.fx?.source_url) {
  errors.push("A complete Bank of Canada exchange-rate record is required.");
}

if (errors.length) {
  console.error(errors.map(error => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${data.cells.length} cells, ${seen.size} unique provider-attribute pairs and official source domains.`);
