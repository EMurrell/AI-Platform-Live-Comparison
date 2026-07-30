# U7 AI platform comparison

A single page that answers the practical questions people ask before picking an AI
assistant: what it costs, what you have to commit to, whether it works with your
email, whether your data trains the model, and who controls the account. Every
answer links to the vendor's own page and shows the date it was last confirmed.
The page reports; it does not rank or recommend.

The point is to save the reader from opening four vendor pricing pages that keep
changing, and to make each claim checkable at its source.

## What is on the page

Two tables:

- **Business plans**: ChatGPT Business, Claude Team, Gemini for Google Workspace,
  Microsoft 365 Copilot Business, across price, minimum commitment, works with
  your email, data used for training, and admin control.
- **Personal plans**: ChatGPT Plus, Claude Pro, Google AI Pro, Microsoft 365
  Personal, across price, data used for training, works with your work email,
  and admin control.

Prices appear exactly as each vendor publishes them, in Canadian dollars where the
vendor shows a Canadian price. No currency conversion is applied.

## How it is built

- `data/current.json` is the only source of truth. Each cell holds the sentence to
  display, the `source_url` it came from, a short `quote` from that page, the date
  it was `checked`, an optional note, and a `needs_verify` flag.
- `scripts/build.mjs` combines the data with `src/template.html` and
  `src/styles.css` to produce `index.html`, one self-contained file with the styles
  and logos inlined. The build validates the data first and fails on a missing
  cell, a duplicate, an empty field, or a watched cell with no quote.
- `tests/build.test.mjs` covers the build output.
- Node 22 or newer. No dependencies.

## Run locally

```bash
npm run check
```

That builds the page and runs the tests. Then serve the folder, for example with
`python3 -m http.server 8000`, and open `http://localhost:8000`.

## Keeping it current

A scheduled GitHub Actions workflow re-checks every source page each morning. For
each watched cell it loads `source_url` and looks for that cell's `quote`:

- **Found**: the `checked` date moves to today.
- **Not found**: the displayed value stays put and the cell is flagged
  `needs_verify`, which puts a "Verify at source" chip on the page and lists the
  cell in a single GitHub issue. The issue closes itself once every cell matches
  again.
- **Page unreachable**: the cell is left completely alone and noted in the same
  issue.

Two details make that work across different kinds of vendor pages. A price drawn
by script after the page loads is rendered in a headless browser first, then
matched the same way as any other page. A page that shows a different price by
region records more than one acceptable quote, and any one of them counts as a
match. A few cells state an absence rather than a fact on a page, so they carry no
quote to look for and are marked unwatched by design.

A displayed value never changes on its own. Changing one means a person reads the
vendor's page and edits `data/current.json` by hand.

## Deploying

A push to `main` builds, tests, and publishes `index.html` and `robots.txt` to
GitHub Pages. The page is marked `noindex` on purpose: it is shared by link, not
through search.
