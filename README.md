# U7 AI platform comparison

A source-backed, neutral comparison of business AI tools for managing work email.

## What is here

- `index.html` is the deployable, self-contained page.
- `data/current.json` is the only live data store. It contains 45 required cells.
- `src/` contains the HTML template and U7 styling.
- `scripts/research.mjs` checks the five approaches in parallel, using official domains only.
- `.github/workflows/refresh.yml` runs the daily refresh and protects pricing changes.

## Run locally

Node 22 or newer is recommended. There are no package dependencies.

```sh
npm run check
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Refresh rules

The machine-generated seed is explicitly unverified. The public page does not show a “Last updated on” date until `seed_verified` is true and a complete pull has set `last_successful_update`.

- A complete pull requires all 45 cells plus a Bank of Canada exchange rate.
- A low-confidence or invalid cell keeps its previous value, preserves its previous `checked` date and increments `failed_checks`; valid sibling cells still update.
- A provider failure affects only that provider's nine cells.
- An exchange-rate failure retains the previous CAD rate but does not block cell updates.
- Partial pulls commit successful cells and staleness state without advancing `last_successful_update`.
- A total provider failure persists staleness state and then fails the workflow.
- A successful no-change pull advances the timestamp.
- A detected price change advances the successful-pull timestamp but leaves the last confirmed price live with an “under review” marker.
- The review branch applies the proposed price. Merging its pull request publishes the confirmed change.
- `last_changed` advances only when the underlying value changes.

## GitHub setup

When the repository is connected:

1. Add `OPENAI_API_KEY` as a repository Actions secret.
2. Enable GitHub Pages with “GitHub Actions” as the source.
3. Confirm that Actions have permission to create pull requests.
4. Run “Refresh comparison” manually once.

The research model defaults to `gpt-5.6-sol` and can be changed with `OPENAI_MODEL`.

## Editorial approach

All displayed claims link to official vendor sources. The page uses Canadian spelling, sentence case, Work Sans and the March 2026 U7 brand colours. It does not recommend or rank providers.
