import { createHash } from "node:crypto";

export const PRICE_ATTRIBUTE = "price";

export function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sameValue(left, right) {
  return stableValue(left) === stableValue(right);
}

export function officialSource(url, domains) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return domains.some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function cellErrors(cell, provider, attribute) {
  const errors = [];
  for (const field of ["attribute", "value", "display", "source_url", "confidence", "note"]) {
    if (!(field in cell) || cell[field] === "" || cell[field] === null || cell[field] === undefined) {
      if (!(field === "value" && cell.value === 0)) errors.push(`${attribute.id} is missing ${field}.`);
    }
  }
  if (!["high", "medium", "low"].includes(cell.confidence)) errors.push(`${attribute.id} has invalid confidence.`);
  if (!officialSource(cell.source_url, provider.official_domains)) errors.push(`${attribute.id} has a non-official source.`);
  for (const source of cell.sources ?? []) {
    if (!officialSource(source, provider.official_domains)) errors.push(`${attribute.id} has a non-official supporting source.`);
  }
  if (attribute.id === PRICE_ATTRIBUTE) {
    if (!cell.value || typeof cell.value !== "object" || Array.isArray(cell.value)) {
      errors.push("price must have a structured value.");
    } else {
      for (const field of ["currency", "amount", "billing_period", "commitment", "monthly_amount", "promo"]) {
        if (!(field in cell.value)) errors.push(`price is missing ${field}.`);
      }
    }
  }
  return errors;
}

export function resultErrors(result, provider, attributes) {
  if (!result?.ok) return [result?.error || "Research job did not complete."];
  if (!Array.isArray(result.cells)) return ["Research result has no cells array."];
  const errors = [];
  const expected = new Set(attributes.map(attribute => attribute.id));
  const byAttribute = new Map();
  for (const cell of result.cells) {
    if (!expected.has(cell.attribute)) {
      errors.push(`Unexpected ${cell.attribute || "unnamed"} cell.`);
      continue;
    }
    const matches = byAttribute.get(cell.attribute) ?? [];
    matches.push(cell);
    byAttribute.set(cell.attribute, matches);
  }
  for (const attribute of attributes) {
    const matches = byAttribute.get(attribute.id) ?? [];
    if (matches.length === 0) {
      errors.push(`Missing ${attribute.id}.`);
      continue;
    }
    if (matches.length > 1) {
      errors.push(`Duplicate ${attribute.id}.`);
      continue;
    }
    errors.push(...cellErrors(matches[0], provider, attribute));
  }
  return errors;
}

function dateOnly(timestamp) {
  return timestamp.slice(0, 10);
}

function clone(value) {
  return structuredClone(value);
}

function pendingId(proposals) {
  return createHash("sha256").update(stableValue(proposals.map(item => ({
    provider: item.provider,
    value: item.proposed.value
  })))).digest("hex").slice(0, 10);
}

export function mergeResearch(current, providerResults, fxResult, timestamp) {
  const next = clone(current);
  const resultByProvider = new Map(providerResults.map(result => [result.provider, result]));
  const today = dateOnly(timestamp);
  const oldCells = new Map(current.cells.map(cell => [`${cell.provider}:${cell.attribute}`, cell]));
  const errorsByProvider = new Map();
  const pending = [];
  const mergedCells = [];
  let acceptedCells = 0;

  function addError(provider, error) {
    const errors = errorsByProvider.get(provider) ?? [];
    errors.push(error);
    errorsByProvider.set(provider, errors);
  }

  function retainUnconfirmed(oldCell) {
    return {
      ...oldCell,
      status: "unconfirmed_today",
      failed_checks: (oldCell.failed_checks ?? 0) + 1
    };
  }

  for (const provider of current.providers) {
    const result = resultByProvider.get(provider.id);
    if (!result?.ok || !Array.isArray(result.cells)) {
      addError(provider.id, result?.error || "Research job did not return a cells array.");
      for (const attribute of current.attributes) {
        mergedCells.push(retainUnconfirmed(oldCells.get(`${provider.id}:${attribute.id}`)));
      }
      continue;
    }

    const expectedAttributes = new Set(current.attributes.map(attribute => attribute.id));
    const freshCells = new Map();
    for (const cell of result.cells) {
      if (!expectedAttributes.has(cell.attribute)) {
        addError(provider.id, `Unexpected ${cell.attribute || "unnamed"} cell.`);
        continue;
      }
      const matches = freshCells.get(cell.attribute) ?? [];
      matches.push(cell);
      freshCells.set(cell.attribute, matches);
    }

    for (const attribute of current.attributes) {
      const oldCell = oldCells.get(`${provider.id}:${attribute.id}`);
      const matches = freshCells.get(attribute.id) ?? [];
      if (matches.length !== 1) {
        addError(provider.id, matches.length === 0 ? `Missing ${attribute.id}.` : `Duplicate ${attribute.id}.`);
        mergedCells.push(retainUnconfirmed(oldCell));
        continue;
      }

      const fresh = matches[0];
      const structuralErrors = cellErrors(fresh, provider, attribute);
      if (structuralErrors.length || fresh.confidence === "low") {
        for (const error of structuralErrors) addError(provider.id, error);
        if (fresh.confidence === "low") addError(provider.id, `${attribute.id} has low confidence.`);
        mergedCells.push(retainUnconfirmed(oldCell));
        continue;
      }

      acceptedCells += 1;
      const changed = !sameValue(oldCell.value, fresh.value);
      const common = {
        provider: provider.id,
        attribute: attribute.id,
        value: fresh.value,
        display: fresh.display,
        source_url: fresh.source_url,
        ...(fresh.sources?.length ? { sources: fresh.sources } : {}),
        confidence: fresh.confidence,
        checked: today,
        last_changed: changed ? today : oldCell.last_changed,
        note: fresh.note,
        change_kind: changed ? "verified_change" : oldCell.change_kind
      };

      if (attribute.id === PRICE_ATTRIBUTE && changed) {
        const proposed = common;
        const retained = {
          ...oldCell,
          checked: today,
          status: "price_under_review",
          pending_review: {
            proposed_display: fresh.display,
            proposed_source_url: fresh.source_url,
            detected: today
          }
        };
        mergedCells.push(retained);
        pending.push({ provider: provider.id, attribute: attribute.id, previous: oldCell, proposed });
      } else {
        mergedCells.push(common);
      }
    }
  }

  next.cells = mergedCells;
  if (fxResult?.ok && Number.isFinite(fxResult.rate) && fxResult.date && fxResult.source_url) {
    next.fx = {
      pair: "USD/CAD",
      rate: fxResult.rate,
      date: fxResult.date,
      source_url: fxResult.source_url
    };
  } else {
    addError("bank-of-canada", fxResult?.error || "Exchange-rate check failed.");
    next.fx = {
      ...current.fx,
      status: "unconfirmed_today",
      failed_checks: (current.fx.failed_checks ?? 0) + 1
    };
  }

  const errors = [...errorsByProvider].map(([provider, providerErrors]) => ({
    provider,
    errors: providerErrors
  }));
  const complete = errors.length === 0;
  if (complete) {
    next.last_successful_update = timestamp;
    next.method = next.seed_verified
      ? "Official vendor sources checked by the automated research workflow. USD converted with the Bank of Canada daily exchange rate."
      : "Automated research completed against official vendor sources. Human verification of the original seed is still outstanding.";
  }

  const pendingFile = pending.length
    ? { id: pendingId(pending), detected: today, proposals: pending }
    : null;
  return {
    data: next,
    complete,
    totalFailure: acceptedCells === 0,
    acceptedCells,
    errors,
    pending: pendingFile
  };
}

export function applyPriceReview(current, review) {
  const next = clone(current);
  const cells = new Map(next.cells.map(cell => [`${cell.provider}:${cell.attribute}`, cell]));
  const applied = [];
  for (const item of review.proposals) {
    const key = `${item.provider}:${item.attribute}`;
    const live = cells.get(key);
    if (!live) throw new Error(`Cannot apply missing price cell ${key}.`);
    if (!sameValue(live.value, item.previous.value)) {
      throw new Error(`The confirmed price for ${item.provider} changed after this review was created.`);
    }
    cells.set(key, { ...item.proposed, last_changed: review.detected, change_kind: "verified_change" });
    applied.push(item.provider);
  }
  next.cells = next.cells.map(cell => cells.get(`${cell.provider}:${cell.attribute}`));
  next.changelog = [
    {
      date: review.detected,
      summary: `Reviewed and confirmed pricing change${applied.length === 1 ? "" : "s"} for ${applied.join(", ")}.`
    },
    ...next.changelog
  ].slice(0, 20);
  return next;
}
