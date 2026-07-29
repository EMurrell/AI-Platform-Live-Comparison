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
const updated = new Date(data.last_successful_update);
const now = new Date();
const ageDays = Math.max(0, Math.floor((now - updated) / 86_400_000));

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

function cad(value) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value * data.fx.rate);
}

function priceExtras(cell) {
  const value = cell.value;
  if (!value || typeof value !== "object" || value.currency !== "USD") return "";
  let output = "";
  if (typeof value.amount === "number") {
    output += `<span class="cell__cad">About ${cad(value.amount)} CAD/user/month annually`;
    if (typeof value.monthly_amount === "number") output += `; ${cad(value.monthly_amount)} monthly`;
    output += `</span>`;
  } else if (typeof value.input_per_million === "number") {
    output += `<span class="cell__cad">About ${cad(value.input_per_million)} input and ${cad(value.output_per_million)} output per 1M tokens</span>`;
  }
  if (value.promo) {
    output += `<span class="cell__promo">Promotion: ${escapeHtml(value.promo.description)} at $${escapeHtml(value.promo.amount)} USD`;
    if (value.promo.ends) output += `, ending ${escapeHtml(formatDate(value.promo.ends))}`;
    output += `</span>`;
  }
  return output;
}

function isRecentChange(cell) {
  if (cell.change_kind === "baseline") return false;
  const changed = new Date(`${cell.last_changed}T12:00:00-04:00`);
  return Number.isFinite(changed.getTime()) && now - changed <= 14 * 86_400_000;
}

function renderCell(cell, attribute) {
  const classes = ["cell"];
  if (attribute.emphasis) classes.push("cell--emphasis");
  if (isRecentChange(cell)) classes.push("cell--changed");
  if (cell.confidence === "low" || cell.status === "unconfirmed_today") classes.push("cell--verify");

  const flags = [
    cell.pending_review ? `<span class="review-flag">Price change under review</span>` : "",
    cell.confidence === "low" || cell.status === "unconfirmed_today"
      ? `<span class="verify-flag">Verify before relying on this</span>`
      : ""
  ].join("");

  return `<td class="${classes.join(" ")}">
    ${flags}
    <p class="cell__answer">${escapeHtml(cell.display)}</p>
    ${attribute.id === "price" ? priceExtras(cell) : ""}
    <p class="cell__note">${escapeHtml(cell.note)}</p>
    <div class="cell__meta">
      <a class="source-link" href="${escapeHtml(cell.source_url)}" rel="noopener noreferrer">Source</a>
      <span class="confidence">${escapeHtml(cell.confidence)} confidence</span>
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

const staleAlert = ageDays > 7
  ? `<aside class="stale-alert" role="status"><strong>This comparison may be out of date.</strong>The last complete pull was ${ageDays} days ago. Source links remain available for direct verification.</aside>`
  : "";

const changelog = data.changelog
  .map(item => `<li><time class="changelog__date" datetime="${escapeHtml(item.date)}">${escapeHtml(formatDate(item.date))}</time><span class="changelog__summary">${escapeHtml(item.summary)}</span></li>`)
  .join("\n");

const logoData = `data:image/png;base64,${logo.toString("base64")}`;
const replacements = {
  "/*__STYLES__*/": styles,
  "/*__LOGO__*/": logoData,
  "/*__UPDATED_DATE__*/": formatDate(data.last_successful_update),
  "/*__UPDATED_LONG__*/": formatDate(data.last_successful_update, true),
  "/*__FRESHNESS__*/": ageDays === 0 ? "Complete source check passed today" : `${ageDays} day${ageDays === 1 ? "" : "s"} since the last complete check`,
  "/*__STALE_ALERT__*/": staleAlert,
  "/*__PROVIDER_HEADERS__*/": providerHeaders,
  "/*__TABLE_ROWS__*/": tableRows,
  "/*__FX_RATE__*/": escapeHtml(data.fx.rate),
  "/*__FX_DATE__*/": escapeHtml(formatDate(data.fx.date)),
  "/*__FX_URL__*/": escapeHtml(data.fx.source_url),
  "/*__CHANGELOG__*/": changelog,
  "/*__METHOD__*/": escapeHtml(data.method)
};

let html = template;
for (const [needle, replacement] of Object.entries(replacements)) {
  html = html.replaceAll(needle, replacement);
}

await writeFile(path.join(root, "index.html"), html);
console.log(`Built index.html with ${data.cells.length} sourced answers.`);
