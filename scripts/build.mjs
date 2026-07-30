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
const problems = [];

const expected = data.providers.length * data.attributes.length;
if (data.cells.length !== expected) {
  problems.push(`expected ${expected} cells for the ${data.providers.length}x${data.attributes.length} grid, found ${data.cells.length}`);
}
if (cells.size !== data.cells.length) {
  problems.push("duplicate provider/attribute pairs");
}
for (const provider of data.providers) {
  for (const attribute of data.attributes) {
    const key = `${provider.id}:${attribute.id}`;
    const cell = cells.get(key);
    if (!cell) {
      problems.push(`missing cell ${key}`);
      continue;
    }
    for (const field of ["display", "source_url", "checked"]) {
      if (typeof cell[field] !== "string" || cell[field].trim() === "") {
        problems.push(`${key} has an empty ${field}`);
      }
    }
    if (typeof cell.source_url === "string" && !cell.source_url.startsWith("https://")) {
      problems.push(`${key} source_url is not https`);
    }
  }
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(data.updated ?? "")) {
  problems.push("top-level updated is not an ISO date");
}
if (problems.length > 0) {
  console.error(`Cannot build data/current.json:\n- ${problems.join("\n- ")}`);
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
    `  <a class="source-link" href="${escapeHtml(cell.source_url)}" rel="noopener noreferrer">Source</a>`,
    cell.note ? `  <p class="cell__note">${escapeHtml(cell.note)}</p>` : null,
    cell.needs_verify ? `  <p class="cell__chip">Verify at source</p>` : null
  ].filter(Boolean);
  return [`<td class="cell">`, ...body, `</td>`];
}

const providerHeaders = indent(
  data.providers.map(provider =>
    `<th scope="col"><span class="provider-vendor">${escapeHtml(provider.vendor)}</span>${escapeHtml(provider.name)}</th>`),
  14
).trimStart();

const tableRows = indent(
  data.attributes.flatMap(attribute => [
    "<tr>",
    `  <th scope="row" class="attribute">${escapeHtml(attribute.label)}</th>`,
    ...data.providers.flatMap(provider => indent(renderCell(cells.get(`${provider.id}:${attribute.id}`)), 2).split("\n")),
    "</tr>"
  ]),
  12
).trimStart();

const replacements = {
  "/*__STYLES__*/": styles,
  "/*__LOGO__*/": `data:image/png;base64,${logo.toString("base64")}`,
  "/*__UPDATED_DATE__*/": formatDate(data.updated),
  "/*__PROVIDER_HEADERS__*/": providerHeaders,
  "/*__TABLE_ROWS__*/": tableRows
};

let html = template;
for (const [needle, replacement] of Object.entries(replacements)) {
  html = html.replaceAll(needle, replacement);
}

await writeFile(path.join(root, "index.html"), html);
console.log(`Built index.html with ${data.cells.length} cells.`);
