# U7 AI platform comparison

A source-backed, neutral comparison of business AI tools for managing work email.

## What is here

- `index.html` is the deployable, self-contained page.
- `data/current.json` is the only live data store. Its table shape is derived from the configured providers and attributes.
- `src/` contains the HTML template and U7 styling.
- `scripts/research.mjs` checks the five approaches in parallel, using official domains only.
- `.github/workflows/refresh.yml` runs the daily refresh and protects pricing changes.
- `.github/workflows/source-health.yml` checks every official source daily and maintains one incident issue for broken links.
- `.github/workflows/production-health.yml` smoke-tests the deployed site after releases and every six hours.
- `.github/workflows/verify-baseline.yml` records the one-time authenticated baseline approval without inventing an update date.

## Run locally

Node 22 or newer is recommended. There are no package dependencies.

```sh
npm run check
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Refresh rules

The original machine-generated seed has been replaced with source-backed research. The baseline remains explicitly unapproved until an authenticated repository owner runs “Approve source-backed baseline.” The public page does not show a “Last updated on” date until `seed_verified` is true and a complete pull has set `last_successful_update`.

- A complete pull requires every configured provider-attribute cell.
- A low-confidence or invalid cell keeps its previous value, preserves its previous `checked` date and increments `failed_checks`; valid sibling cells still update.
- An unverified result may publish a defensible value with its ambiguity preserved in the note and confidence label.
- A provider failure affects only that provider's cells.
- Partial pulls commit successful cells and staleness state without advancing `last_successful_update`.
- A total provider failure persists staleness state and then fails the workflow.
- A successful no-change pull advances the timestamp.
- A detected price change advances the successful-pull timestamp but leaves the last confirmed price live with an “under review” marker.
- The review branch applies the proposed price. Merging its pull request publishes the confirmed change.
- `last_changed` advances only when the underlying value changes.

Pricing records preserve the billing currency stated by each vendor for a Canadian customer. Annual and monthly amounts are stored separately, promotions retain their list price and end date, and every figure includes exact quoted vendor text with its official URL. No exchange-rate conversion is performed.

## GitHub setup

When the repository is connected:

1. Add `OPENAI_API_KEY` as a repository Actions secret.
2. Enable GitHub Pages with “GitHub Actions” as the source.
3. Confirm that Actions have permission to create pull requests.
4. Run “Refresh comparison” manually once.

The research model defaults to `gpt-5.6-sol` and can be changed with `OPENAI_MODEL`.

## Automated production controls

- Every push and pull request runs data validation, a deterministic build and the full offline test suite.
- A successful Pages deployment is immediately smoke-tested against the public URL.
- The production page is checked every six hours. Deployment or smoke-test failures open or update one GitHub issue and close it automatically after recovery.
- All official source URLs are checked daily. Vendor bot blocks are reported as restricted warnings rather than verified links; actually broken links open or update one GitHub issue.
- Refresh failures open or update one GitHub issue and close it automatically after recovery.
- The one-time baseline approval is deliberately human-authenticated. It changes only verification metadata and the changelog; it cannot change cell values or fabricate a successful-refresh timestamp.
- Price changes continue to require a human-reviewed pull request. This is the only recurring editorial approval by design.

## Editorial approach

All displayed claims link to official vendor sources. The page uses Canadian spelling, sentence case, Work Sans and the March 2026 U7 brand colours. It does not recommend or rank providers.
