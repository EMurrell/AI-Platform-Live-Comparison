import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.resolve(root, process.argv[2] ?? "data/current.json");
const outputPath = path.resolve(root, process.argv[3] ?? "index.html");
const [dataText, template, styles, logo] = await Promise.all([
  readFile(dataPath, "utf8"),
  readFile(path.join(root, "src/template.html"), "utf8"),
  readFile(path.join(root, "src/styles.css"), "utf8"),
  readFile(path.join(root, "assets/u7-logo.png"))
]);

const data = JSON.parse(dataText);
const problems = [];

// An unwatched cell is one scripts/refresh.mjs never greps, so it is the only
// kind allowed to carry an empty quote.
function isWatched(cell) {
  return cell.watched !== false;
}

// A watched cell's quote is either one non-empty string or a non-empty list of
// them; scripts/refresh.mjs counts a list as matched when any entry matches.
function quoteProblem(quote) {
  if (Array.isArray(quote)) {
    if (quote.length === 0) return "has an empty quote list";
    if (quote.some(entry => typeof entry !== "string" || entry.trim() === "")) {
      return "has a blank entry in its quote list";
    }
    return null;
  }
  return typeof quote === "string" && quote.trim() !== "" ? null : "has an empty quote";
}

function indexBlock(block, name) {
  const cells = new Map(block.cells.map(cell => [`${cell.provider}:${cell.attribute}`, cell]));
  const expected = block.providers.length * block.attributes.length;
  if (block.cells.length !== expected) {
    problems.push(`${name}: expected ${expected} cells for the ${block.providers.length}x${block.attributes.length} grid, found ${block.cells.length}`);
  }
  if (cells.size !== block.cells.length) {
    problems.push(`${name}: duplicate provider/attribute pairs`);
  }
  for (const provider of block.providers) {
    for (const attribute of block.attributes) {
      const key = `${name} ${provider.id}:${attribute.id}`;
      const cell = cells.get(`${provider.id}:${attribute.id}`);
      if (!cell) {
        problems.push(`missing cell ${key}`);
        continue;
      }
      for (const field of ["display", "source_url", "checked"]) {
        if (typeof cell[field] !== "string" || cell[field].trim() === "") {
          problems.push(`${key} has an empty ${field}`);
        }
      }
      if (isWatched(cell)) {
        const issue = quoteProblem(cell.quote);
        if (issue) problems.push(`${key} ${issue}`);
      }
      for (const flag of ["watched", "render"]) {
        if (flag in cell && typeof cell[flag] !== "boolean") {
          problems.push(`${key} ${flag} must be true or false`);
        }
      }
      if (typeof cell.source_url === "string" && !cell.source_url.startsWith("https://")) {
        problems.push(`${key} source_url is not https`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cell.checked ?? "")) {
        problems.push(`${key} checked is not an ISO date`);
      }
    }
  }
  return cells;
}

for (const [name, block] of [["main", data], ["personal", data.personal]]) {
  for (const key of ["providers", "attributes", "cells"]) {
    if (!Array.isArray(block?.[key])) problems.push(`${name}: ${key} is missing`);
  }
}
if (problems.length > 0) {
  console.error(`Cannot build ${path.relative(root, dataPath)}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

const cells = indexBlock(data, "main");
const personalCells = indexBlock(data.personal, "personal");
if (!/^\d{4}-\d{2}-\d{2}$/.test(data.updated ?? "")) {
  problems.push("top-level updated is not an ISO date");
}
if (problems.length > 0) {
  console.error(`Cannot build ${path.relative(root, dataPath)}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00-04:00`);
  const parts = { day: "numeric", month: "long", year: "numeric", timeZone: "America/Toronto" };
  const format = key => new Intl.DateTimeFormat("en-CA", { [key]: parts[key], timeZone: parts.timeZone }).format(date);
  return `${format("day")} ${format("month")} ${format("year")}`;
}

function indent(lines, spaces) {
  return lines.map(line => `${" ".repeat(spaces)}${line}`).join("\n");
}

function renderCell(cell) {
  const body = [
    `  <p class="cell__answer">${escapeHtml(cell.display)}</p>`,
    `  <a class="source-link" href="${escapeHtml(cell.source_url)}" target="_blank" rel="noopener noreferrer">Source</a>`,
    cell.note ? `  <p class="cell__note">${escapeHtml(cell.note)}</p>` : null,
    cell.needs_verify ? `  <p class="cell__chip">Verify at source</p>` : null
  ].filter(Boolean);
  return [`<td class="cell">`, ...body, `</td>`];
}

function renderProviderHeaders(block) {
  return indent(
    block.providers.map(provider =>
      `<th scope="col"><span class="provider-vendor">${escapeHtml(provider.vendor)}</span>${escapeHtml(provider.name)}</th>`),
    14
  ).trimStart();
}

function renderTableRows(block, lookup) {
  return indent(
    block.attributes.flatMap(attribute => [
      "<tr>",
      `  <th scope="row" class="attribute">${escapeHtml(attribute.label)}</th>`,
      ...block.providers.flatMap(provider => indent(renderCell(lookup.get(`${provider.id}:${attribute.id}`)), 2).split("\n")),
      "</tr>"
    ]),
    12
  ).trimStart();
}

const replacements = {
  "/*__STYLES__*/": styles,
  "/*__LOGO__*/": `data:image/png;base64,${logo.toString("base64")}`,
  "/*__UPDATED_DATE__*/": formatDate(data.updated),
  "/*__PROVIDER_HEADERS__*/": renderProviderHeaders(data),
  "/*__TABLE_ROWS__*/": renderTableRows(data, cells),
  "/*__PERSONAL_PROVIDER_HEADERS__*/": renderProviderHeaders(data.personal),
  "/*__PERSONAL_TABLE_ROWS__*/": renderTableRows(data.personal, personalCells)
};

let html = template;
for (const [needle, replacement] of Object.entries(replacements)) {
  html = html.replaceAll(needle, () => replacement);
}

await writeFile(outputPath, html);
console.log(`Built ${path.relative(root, outputPath)} with ${data.cells.length + data.personal.cells.length} cells.`);
