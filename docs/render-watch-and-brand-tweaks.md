# Render-watch for the Google AI Pro price, hero cleanup, white footer logo

Approved 2026-07-30. Self-contained; read docs/remediation-plan.md and
docs/personal-plans-phase.md for background only (both are fully executed,
do not redo them).

## Constraint changes, authorized by the owner

- The footer logo changes to a white SVG. This overrides the earlier "do not
  touch the U7 logo" rule for the FOOTER instance only. The masthead logo
  (the existing PNG) stays exactly as it is.
- The hero loses its decorative shapes. Everything else about the hero
  (copy, layout, the linear gradient, colours) stays.
- All other standing constraints hold: dependency-free package.json, neutral
  page, no changes to robots.txt, noindex tags, Work Sans, or the brand
  colour variables in src/styles.css.

## Precondition

`assets/u7-logo-white.svg` must exist and contain an `<svg` element. The
owner places it there by hand. If it is missing or empty, stop and report;
do not substitute anything.

## Part 1: render-watch (headless Chrome) for script-rendered prices

Problem: the `google-ai-pro/price` cell (data/current.json, personal block)
is `watched: false` because one.google.com renders prices with JavaScript;
the plain fetch in scripts/refresh.mjs downloads HTML containing no price.
GitHub's Ubuntu runners ship Google Chrome preinstalled, so the page can be
rendered without adding any npm dependency.

Geo caveat that shapes the design: the rendered page shows CAD ($26.99
CAD/mo today) from a Canadian IP and the US price from GitHub's US runners.
No single quote string can match in both places, so a render-watched cell
needs a list of acceptable quotes where any match counts.

### Schema (data/current.json)

- New optional per-cell boolean `render`. When true, refresh loads the page
  through headless Chrome instead of plain fetch.
- `quote` may now be either a string (unchanged behaviour) or an array of
  strings; the cell is confirmed if ANY entry matches. Watched cells must
  have a non-empty quote string or a non-empty array of non-empty strings.

### scripts/refresh.mjs

- Chrome discovery, in order: `CHROME_BIN` env var, `google-chrome`,
  `google-chrome-stable`, `chromium-browser`, `chromium`, and the macOS path
  `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Use
  node:child_process execFile; no dependencies.
- Render command shape:
  `<chrome> --headless=new --disable-gpu --no-sandbox --virtual-time-budget=10000 --dump-dom <url>`
  with a 45s timeout. The dumped DOM goes through the exact same
  collapse(withoutMarkup(...)) pipeline as fetched HTML.
- If no Chrome is found or the render fails or times out, count the cell as
  unreachable with a clear reason (for example "chrome not available",
  "render failed"). That keeps the fail-loud contract: `updated` does not
  advance and the CI issue lists the cell. Do not silently skip.
- Plain-fetch cells are untouched; only `render: true` cells go through
  Chrome. Cache renders per URL like fetches are cached.

### scripts/build.mjs and tests

- Validation: accept string-or-array quotes as above; `render`, like
  `watched`, must be boolean when present. tests/build.test.mjs gets cases
  for: watched cell with an array quote is valid; watched cell with an empty
  array or an array of blanks is refused; the existing string behaviour is
  unchanged.

### Data change for google-ai-pro/price

- Remove `watched: false`; add `render: true`.
- Set `quote` to an array with two entries: the CAD price string as the
  rendered Canadian page shows it (verify locally by actually running the
  Chrome render and grepping its output; expected to contain
  "$26.99 CAD/mo") and the US price string as GitHub's runner sees it. You
  cannot see the US rendering from a Canadian machine: put in your best
  guess, then push and dispatch the workflow (see verification), and if CI
  reports the cell not found, read the run log, correct the US entry to what
  the rendered page actually shows, and re-run until green. Add a temporary
  log line or use the summary output if needed, but remove any temporary
  debugging before the final commit.
- Rewrite the cell note honestly, roughly: the page renders prices by
  region, so the daily check renders it with a browser and watches the price
  shown for the checker's region (the US price from GitHub); the CAD figure
  shown here was last read by a person on 30 July 2026. Keep the existing
  sentence about the cheaper Google AI Plus plan.
- The display (CAD $26.99/month) does not change unless the live Canadian
  page disagrees at execution time (LIVE-VERIFY rule from
  docs/remediation-plan.md applies).
- After this change the unwatched count drops from 5 to 4 (the four admin
  cells remain unwatched by design; do not touch them).

### Workflow

.github/workflows/refresh.yml should need no changes (Chrome is
preinstalled on ubuntu-latest). Verify rather than assume; if a flag or
path differs on the runner, fix it in refresh.mjs's discovery list, not
with a new install step.

## Part 2: remove the hero's decorative shapes

In src/styles.css:

- `.hero` background (around line 108): the background stack is a
  radial-gradient (the translucent yellow circle) layered over a
  linear-gradient. Delete the radial-gradient layer; keep the
  linear-gradient exactly as written.
- Delete the `.hero::after` rule (the large border ring, around line 118)
  and any other reference to `.hero::after` or hero decoration in media
  queries.
- If removing the shapes leaves `position: relative; overflow: hidden` (and
  `.hero__grid`'s `z-index: 1`) with no remaining purpose, remove those
  leftovers too; if anything else still relies on them, leave them.
- No other hero changes.

## Part 3: white SVG logo in the footer

- Add a build placeholder (for example `/*__LOGO_WHITE__*/`) that
  scripts/build.mjs fills with a data URI of assets/u7-logo-white.svg
  (`data:image/svg+xml;base64,...`). The existing PNG placeholder and the
  masthead are untouched.
- src/template.html footer: the footer `<img>` uses the new placeholder and
  keeps `alt=""`.
- src/styles.css `.footer__logo` (around line 383): remove the white
  `background` and the `padding` (the white box exists only because the old
  logo needed light backing). Keep it a block at width 250px, adjusting only
  if the new logo's proportions clearly need it.
- Print: the print block turns the footer white, which would make a white
  logo invisible. Add `.footer__logo { display: none; }` inside
  `@media print`. The logo is decorative (alt="") so hiding it in print
  loses nothing.
- tests/build.test.mjs: the retired-vocabulary test strips PNG data URIs
  before checking; extend the strip pattern to also cover
  `data:image/svg+xml;base64,...` so base64 noise cannot trip a term match.

## Verification gate, then push

1. `npm run check` passes.
2. `node scripts/refresh.mjs` locally: confirmed 32, quote not found 0,
   unreachable 0, unwatched 4 (requires Chrome on this machine; it is
   installed).
3. Visual: hero shows the plain gradient with no circle or ring at desktop
   and narrow widths; footer shows the white logo directly on the purple
   with no white box; print preview shows a legible footer with no
   invisible logo.
4. Commit in small atomic commits to main, staged explicitly, then push.
   Dispatch the workflow (`gh workflow run refresh.yml`), watch it, and
   require: green, confirmed 32, unreachable 0, no verification issue open.
   Iterate on the US quote entry if needed (see Part 1) until CI is green.
5. Confirm the Pages deploy succeeded and the live page reflects the hero
   and footer changes.

Leave SIMPLIFY-HANDOFF.md untracked. End with a report: the final US quote
string CI matched, any Chrome flags that needed adjusting, and
before/after confirmation of the visual changes.
