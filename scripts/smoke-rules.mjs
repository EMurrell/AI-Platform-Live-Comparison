export function pageErrors(html, data) {
  const errors = [];
  if (typeof html !== "string" || html.length === 0) {
    return ["The deployed page returned an empty response."];
  }

  if (!/<title>AI tools for managing work email \| U7 Solutions<\/title>/i.test(html)) {
    errors.push("The expected U7 page title is missing.");
  }
  if (!/id="comparison"/i.test(html)) {
    errors.push("The comparison table is missing.");
  }
  if (/\/\*__[A-Z_]+__\*\//.test(html)) {
    errors.push("The deployed page still contains an unreplaced build token.");
  }

  const sourceLinks = (html.match(/class="source-link"/g) ?? []).length;
  if (sourceLinks !== data.cells.length) {
    errors.push(`Expected ${data.cells.length} cell source links, found ${sourceLinks}.`);
  }

  for (const provider of data.providers) {
    if (!html.includes(provider.name)) {
      errors.push(`The provider heading for ${provider.name} is missing.`);
    }
  }

  const hasVerifiedDate = data.seed_verified === true && data.last_successful_update !== null;
  if (hasVerifiedDate && !html.includes("Last updated on")) {
    errors.push("The verified page is missing its last-updated label.");
  }
  if (!hasVerifiedDate && html.includes("Last updated on")) {
    errors.push("The page claims a last-updated date without a verified successful refresh.");
  }

  return errors;
}
