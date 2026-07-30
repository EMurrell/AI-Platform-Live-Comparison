import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [dataText, template, styles, logo] = await Promise.all([
  readFile(path.join(root, "data/current.json"), "utf8"),
  readFile(path.join(root, "src/template.html"), "utf8"),
  readFile(path.join(root, "src/styles.css"), "utf8"),
  readFile(path.join(root, "assets/u7-logo.png"))
]);

const data = JSON.parse(dataText);
const cells = new Map(data.cells.map(cell => [`${cell.provider}:${cell.attribute}`, cell]));
const updated = data.last_successful_update ? new Date(data.last_successful_update) : null;
const hasSuccessfulUpdate = updated !== null && Number.isFinite(updated.getTime());
const seedApproved = data.seed_verified === true;
const hasVerifiedUpdate = hasSuccessfulUpdate && seedApproved;
const now = new Date();
const ageDays = hasSuccessfulUpdate
  ? Math.max(0, Math.floor((now - updated) / 86_400_000))
  : null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value, includeTime = false) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00-04:00` : value);
  const day = new Intl.DateTimeFormat("en-CA", { day: "numeric", timeZone: "America/Toronto" }).format(date);
  const month = new Intl.DateTimeFormat("en-CA", { month: "long", timeZone: "America/Toronto" }).format(date);
  const year = new Intl.DateTimeFormat("en-CA", { year: "numeric", timeZone: "America/Toronto" }).format(date);
  if (!includeTime) return `${day} ${month} ${year}`;
  const time = new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
    timeZoneName: "short"
  }).format(date);
  return `${day} ${month} ${year} at ${time}`;
}

function priceEvidence(cell) {
  const evidence = cell.value?.evidence;
  if (!Array.isArray(evidence) || evidence.length === 0) return "";
  const items = evidence.map(item => `<li>
    <strong>${escapeHtml(item.label)}</strong>
    <q>${escapeHtml(item.quote)}</q>
    <a class="evidence-link" href="${escapeHtml(item.source_url)}" rel="noopener noreferrer">Source</a>
  </li>`).join("");
  return `<details class="price-evidence">
    <summary>Exact vendor wording</summary>
    <ul>${items}</ul>
  </details>`;
}

function isRecentChange(cell) {
  if (cell.change_kind === "baseline") return false;
  const changed = new Date(`${cell.last_changed}T12:00:00-04:00`);
  return Number.isFinite(changed.getTime()) && now - changed <= 14 * 86_400_000;
}

function renderCell(cell, attribute) {
  const classes = ["cell"];
  const isUnverifiedSeed = cell.change_kind === "unverified_seed";
  const isAwaitingApproval = !seedApproved && cell.change_kind === "source_researched";
  const isUnverified = cell.confidence === "unverified";
  const needsVerification = isUnverifiedSeed
    || isAwaitingApproval
    || isUnverified
    || cell.confidence === "low"
    || cell.status === "unconfirmed_today";
  if (attribute.emphasis) classes.push("cell--emphasis");
  if (isRecentChange(cell)) classes.push("cell--changed");
  if (needsVerification) classes.push("cell--verify");

  const flags = [
    cell.pending_review ? `<span class="review-flag">Price change under review</span>` : "",
    needsVerification
      ? `<span class="verify-flag">${
          isUnverifiedSeed
            ? "Unverified machine-generated seed"
            : isAwaitingApproval
              ? "Source-backed; awaiting baseline approval"
              : isUnverified
                ? "Vendor wording is unverified"
                : "Verify before relying on this"
        }</span>`
      : ""
  ].join("");
  const confidenceLabel = isUnverifiedSeed
    ? "Unverified seed"
    : isAwaitingApproval
      ? "Awaiting approval"
    : isUnverified
      ? "Unverified"
      : `${escapeHtml(cell.confidence)} confidence`;

  return `<td class="${classes.join(" ")}">${flags}
    <p class="cell__answer">${escapeHtml(cell.display)}</p>
    ${attribute.id === "price" ? priceEvidence(cell) : ""}
    <p class="cell__note">${escapeHtml(cell.note)}</p>
    <div class="cell__meta">
      <a class="source-link" href="${escapeHtml(cell.source_url)}" rel="noopener noreferrer">Source</a>
      <span class="confidence">${confidenceLabel}</span>
    </div>
  </td>`;
}

const providerHeaders = data.providers
  .map((provider, index) => `<th scope="col"><span class="provider-index">0${index + 1}</span>${escapeHtml(provider.name)}</th>`)
  .join("\n");

let previousGroup = "";
const tableRows = data.attributes.map(attribute => {
  const group = attribute.group !== previousGroup
    ? `<tr class="group-row"><th colspan="${data.providers.length + 1}" scope="colgroup">${escapeHtml(attribute.group)}</th></tr>`
    : "";
  previousGroup = attribute.group;
  const attributeClass = attribute.emphasis ? "attribute attribute--emphasis" : "attribute";
  const row = `<tr>
    <th scope="row" class="${attributeClass}">
      <span class="attribute__label">${escapeHtml(attribute.label)}</span>
      <span class="attribute__description">${escapeHtml(attribute.description)}</span>
    </th>
    ${data.providers.map(provider => renderCell(cells.get(`${provider.id}:${attribute.id}`), attribute)).join("\n")}
  </tr>`;
  return group + row;
}).join("\n");

const hasMachineSeed = data.cells.some(cell => cell.change_kind === "unverified_seed");
const staleAlert = !seedApproved
  ? `<aside class="stale-alert" role="status"><strong>This comparison is awaiting baseline approval.</strong>${
      hasMachineSeed
        ? "Machine-generated seed claims still require source-backed research and human review."
        : hasSuccessfulUpdate
          ? "The source-backed baseline and an automated refresh are complete, but the one-time human approval is still outstanding."
          : "Source-backed research is complete. One-time human approval and the first complete automated refresh are still outstanding."
    }</aside>`
  : !hasSuccessfulUpdate
    ? `<aside class="stale-alert" role="status"><strong>The baseline is approved.</strong>The first complete automated source refresh is still pending, so no last-updated date is shown.</aside>`
  : ageDays > 7
    ? `<aside class="stale-alert" role="status"><strong>This comparison may be out of date.</strong>The last complete pull was ${ageDays} days ago. Source links remain available for direct verification.</aside>`
    : "";

const changelog = data.changelog
  .map(item => `<li><time class="changelog__date" datetime="${escapeHtml(item.date)}">${escapeHtml(formatDate(item.date))}</time><span class="changelog__summary">${escapeHtml(item.summary)}</span></li>`)
  .join("\n");

const logoData = `data:image/png;base64,${logo.toString("base64")}`;
const replacements = {
  "/*__STYLES__*/": styles,
  "/*__LOGO__*/": logoData,
  "/*__UPDATED_LABEL__*/": hasVerifiedUpdate ? "Last updated on" : seedApproved ? "Refresh status" : "Verification status",
  "/*__UPDATED_DATE__*/": hasVerifiedUpdate ? formatDate(data.last_successful_update) : seedApproved ? "Baseline approved" : hasMachineSeed ? "Unverified seed" : "Baseline review pending",
  "/*__UPDATED_LONG__*/": hasVerifiedUpdate ? formatDate(data.last_successful_update, true) : seedApproved ? "Baseline approved; no complete automated refresh yet" : "No verified publication date",
  "/*__FRESHNESS__*/": hasVerifiedUpdate
    ? ageDays === 0
      ? "Complete source check passed today"
      : `${ageDays} day${ageDays === 1 ? "" : "s"} since the last complete check`
    : hasSuccessfulUpdate
      ? "Automated refresh complete; human verification still required"
      : seedApproved
        ? "Human baseline approval complete; automated refresh pending"
        : hasMachineSeed
          ? "No successful automated refresh or human seed verification"
          : "Source research complete; approval and automated refresh pending",
  "/*__STALE_ALERT__*/": staleAlert,
  "/*__PROVIDER_HEADERS__*/": providerHeaders,
  "/*__TABLE_ROWS__*/": tableRows,
  "/*__CELL_COUNT__*/": String(data.cells.length),
  "/*__CHANGELOG__*/": changelog,
  "/*__METHOD__*/": escapeHtml(data.method)
};

let html = template;
for (const [needle, replacement] of Object.entries(replacements)) {
  html = html.replaceAll(needle, replacement);
}

await writeFile(path.join(root, "index.html"), html);
console.log(`Built index.html with ${data.cells.length} sourced answers.`);
