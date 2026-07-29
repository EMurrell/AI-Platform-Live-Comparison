import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [html, data] = await Promise.all([
  readFile(path.join(root, "index.html"), "utf8"),
  readFile(path.join(root, "data/current.json"), "utf8").then(JSON.parse)
]);

function formatDate(value) {
  const date = new Date(value);
  const options = { timeZone: "America/Toronto" };
  const day = new Intl.DateTimeFormat("en-CA", { day: "numeric", ...options }).format(date);
  const month = new Intl.DateTimeFormat("en-CA", { month: "long", ...options }).format(date);
  const year = new Intl.DateTimeFormat("en-CA", { year: "numeric", ...options }).format(date);
  return `${day} ${month} ${year}`;
}

test("the built page includes the protected update stamp and privacy directives", () => {
  assert.match(html, /Last updated on/);
  assert.ok(html.includes(formatDate(data.last_successful_update)));
  assert.match(html, /noindex, nofollow, noarchive/);
});

test("the built page embeds its logo, styles and 45 source links", () => {
  assert.match(html, /data:image\/png;base64,/);
  assert.doesNotMatch(html, /\/\*__[A-Z_]+__\*\//);
  assert.equal((html.match(/class="source-link"/g) ?? []).length, 45);
});

test("the two important email rows have heavier visual treatment", () => {
  assert.equal((html.match(/attribute attribute--emphasis/g) ?? []).length, 2);
  assert.equal((html.match(/cell cell--emphasis/g) ?? []).length, 10);
});
