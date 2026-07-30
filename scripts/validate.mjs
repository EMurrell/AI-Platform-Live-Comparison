import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(path.join(root, "data/current.json"), "utf8"));
const errors = [];
const requiredFields = ["provider", "attribute", "value", "display", "source_url", "confidence", "checked", "last_changed", "note"];
const providerIds = new Set(data.providers.map(provider => provider.id));
const attributeIds = new Set(data.attributes.map(attribute => attribute.id));
const officialDomainsByProvider = new Map(data.providers.map(provider => [provider.id, provider.official_domains]));
const seen = new Set();

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isOfficial(url, domains) {
  const host = hostname(url);
  return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}

if (data.cells.length !== data.providers.length * data.attributes.length) {
  errors.push(`Expected ${data.providers.length * data.attributes.length} cells, found ${data.cells.length}.`);
}

for (const [index, cell] of data.cells.entries()) {
  const key = `${cell.provider}:${cell.attribute}`;
  const officialDomains = officialDomainsByProvider.get(cell.provider) ?? [];
  if (seen.has(key)) errors.push(`Duplicate cell ${key}.`);
  seen.add(key);
  if (!providerIds.has(cell.provider)) errors.push(`Cell ${index} has unknown provider ${cell.provider}.`);
  if (!attributeIds.has(cell.attribute)) errors.push(`Cell ${index} has unknown attribute ${cell.attribute}.`);
  for (const field of requiredFields) {
    if (!(field in cell) || cell[field] === "" || cell[field] === null || cell[field] === undefined) {
      if (!(field === "value" && cell.value === 0)) errors.push(`${key} is missing ${field}.`);
    }
  }
  if (!["high", "medium", "low", "unverified"].includes(cell.confidence)) errors.push(`${key} has invalid confidence.`);
  if (!isOfficial(cell.source_url, officialDomains)) errors.push(`${key} uses a non-official source: ${cell.source_url}`);
  for (const source of cell.sources ?? []) {
    if (!isOfficial(source, officialDomains)) errors.push(`${key} uses a non-official supporting source: ${source}`);
  }
  if (cell.attribute === "price") {
    if (!cell.value || typeof cell.value !== "object" || Array.isArray(cell.value)) {
      errors.push(`${key} must have a structured price value.`);
    } else {
      for (const field of ["billing_currency", "annual", "monthly", "promotion", "usage", "evidence"]) {
        if (!(field in cell.value)) errors.push(`${key} price is missing ${field}.`);
      }
      if (cell.value.billing_currency !== null && typeof cell.value.billing_currency !== "string") {
        errors.push(`${key} billing_currency must be a currency code or null when the vendor does not state it.`);
      }
      for (const cadence of ["annual", "monthly"]) {
        const price = cell.value[cadence];
        if (price === null || price === undefined) continue;
        if (typeof price !== "object" || Array.isArray(price)) {
          errors.push(`${key} ${cadence} price must be an object or null.`);
          continue;
        }
        if (!Number.isFinite(price.amount)) errors.push(`${key} ${cadence} amount must be numeric.`);
        for (const field of ["unit", "commitment"]) {
          if (typeof price[field] !== "string" || !price[field]) errors.push(`${key} ${cadence} price is missing ${field}.`);
        }
      }
      if (!cell.value.annual && !cell.value.monthly && !cell.value.usage) {
        errors.push(`${key} must include annual, monthly or usage billing.`);
      }
      if (!Array.isArray(cell.value.evidence) || cell.value.evidence.length === 0) {
        errors.push(`${key} must include quoted price evidence.`);
      } else {
        for (const [evidenceIndex, evidence] of cell.value.evidence.entries()) {
          if (!evidence?.label || !evidence?.quote || !evidence?.source_url) {
            errors.push(`${key} price evidence ${evidenceIndex} is incomplete.`);
          } else if (!isOfficial(evidence.source_url, officialDomains)) {
            errors.push(`${key} price evidence ${evidenceIndex} uses a non-official source.`);
          }
        }
      }
      const promotion = cell.value.promotion;
      if (promotion !== null && promotion !== undefined) {
        if (typeof promotion !== "object" || Array.isArray(promotion)) {
          errors.push(`${key} promotion must be an object or null.`);
        } else {
          if (!promotion.description) errors.push(`${key} promotion is missing description.`);
          if (!promotion.ends || Number.isNaN(new Date(`${promotion.ends}T12:00:00Z`).getTime())) {
            errors.push(`${key} promotion must include a valid end date.`);
          }
          for (const cadence of ["annual", "monthly"]) {
            const amount = promotion[`${cadence}_amount`];
            if (amount === null || amount === undefined) continue;
            if (!Number.isFinite(amount)) errors.push(`${key} promotion ${cadence}_amount must be numeric or null.`);
            if (!Number.isFinite(promotion[`${cadence}_list_amount`])) {
              errors.push(`${key} promotion ${cadence}_list_amount must accompany the promotional amount.`);
            }
          }
        }
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

if (typeof data.seed_verified !== "boolean") {
  errors.push("seed_verified must be true or false.");
}

if (data.seed_verified) {
  if (
    !data.seed_verification
    || typeof data.seed_verification.actor !== "string"
    || !data.seed_verification.actor
    || Number.isNaN(new Date(data.seed_verification.verified_at).getTime())
  ) {
    errors.push("A verified seed must include a valid seed_verification actor and timestamp.");
  }
  if (data.cells.some(cell => cell.change_kind === "unverified_seed")) {
    errors.push("A verified seed cannot contain machine-generated unverified_seed cells.");
  }
}

if (
  data.last_successful_update !== null
  && (
    typeof data.last_successful_update !== "string"
    || Number.isNaN(new Date(data.last_successful_update).getTime())
  )
) {
  errors.push("last_successful_update must be null or a valid timestamp.");
}

if (errors.length) {
  console.error(errors.map(error => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${data.cells.length} cells, ${seen.size} unique provider-attribute pairs and official source domains.`);
