import test from "node:test";
import assert from "node:assert/strict";
import { pageErrors } from "../scripts/smoke-rules.mjs";

const data = {
  seed_verified: false,
  last_successful_update: null,
  providers: [{ name: "Provider one" }, { name: "Provider two" }],
  cells: [{}, {}]
};

const validHtml = `<!doctype html>
<title>AI tools for managing work email | U7 Solutions</title>
<main id="comparison">
  <h2>Provider one</h2><h2>Provider two</h2>
  <a class="source-link">Source</a><a class="source-link">Source</a>
</main>`;

test("a complete deployed page passes smoke validation", () => {
  assert.deepEqual(pageErrors(validHtml, data), []);
});

test("an unverified page cannot claim a last-updated date", () => {
  const errors = pageErrors(`${validHtml}<p>Last updated on</p>`, data);
  assert.ok(errors.some(error => error.includes("without a verified successful refresh")));
});

test("smoke validation catches missing cells and build tokens", () => {
  const broken = validHtml
    .replace('<a class="source-link">Source</a>', "")
    .replace("</main>", "/*__BROKEN__*/</main>");
  const errors = pageErrors(broken, data);
  assert.ok(errors.some(error => error.includes("source links")));
  assert.ok(errors.some(error => error.includes("build token")));
});
