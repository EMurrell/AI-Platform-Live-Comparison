# U7 AI platform comparison

A single page comparing four business AI assistants on price, minimum commitment,
email support and data training. Every answer links to the vendor's official page.
It does not rank or recommend.

## What is here

- `data/current.json` holds all 16 answers: one `display` sentence per cell, its
  `source_url`, a short `quote` from that page, the date it was `checked`, an
  optional `note`, and a `needs_verify` flag.
- `scripts/build.mjs` turns the data and `src/template.html` into `index.html`.
- `scripts/refresh.mjs` re-checks every source page.
- `index.html` is the deployable, self-contained page and is committed.

## Run locally

Node 22 or newer. There are no dependencies.

```sh
npm run check
python3 -m http.server 8000
```

`npm run check` builds the page and runs the tests. Then open `http://localhost:8000`.

## How the daily check works

`.github/workflows/refresh.yml` runs `npm run refresh` every morning. For each cell it
fetches `source_url` and looks for `quote`:

- Found: the `checked` date moves to today.
- Not found: the cell keeps its value and is flagged `needs_verify`, which shows a
  "Verify at source" chip on the page and lists the cell in one GitHub issue. The issue
  closes itself once every cell matches again.
- Page unreachable: the cell is left completely alone.

A displayed price never changes on its own. Changing one means editing
`data/current.json` by hand after a person has read the vendor's page.
