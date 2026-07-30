# Personal plans phase plan

Approved 2026-07-30. Runs in two stages, straight through, ending in a local
commit that is reviewed before anything is pushed (pushing deploys the live
page). Self-contained: the executing agent needs nothing beyond this file, the
repo, and `docs/remediation-plan.md` (for shared context; its fix list is
already fully executed and pushed, do not redo it).

## Step 0: preconditions (do these first)

1. Commit the two plan files in `docs/` to `main` (message like
   `docs: add remediation and personal-plans phase plans`). Leave
   `SIMPLIFY-HANDOFF.md` untracked.
2. Prove the hardened daily check works from CI. Trigger the workflow with
   `gh workflow run refresh.yml`, wait for it to finish
   (`gh run watch` or poll `gh run list --workflow=refresh.yml`), then require:
   run green, log shows `confirmed: 16` and `unreachable: 0`, and no open
   GitHub issue titled "Source check: cells need verification".
   If CI reports unreachable pages (most likely OpenAI URLs bot-blocked from
   Azure ranges), report exactly which pages and STOP before Stage 2.
   Stage 1 research may still proceed while blocked.

## Hard constraints (inherited, plus one addition)

- No dependencies, frameworks, or build tools; `package.json` stays
  dependency-free.
- The page stays neutral: no ranking, no recommendation. This bites here: the
  original proposal framed the second table as "why the personal plans are not
  the same purchase". That argues a conclusion. Use a neutral heading (for
  example "Personal plans compared") and let the factual rows carry the
  differences.
- Do not touch `robots.txt`, the noindex meta tags, the U7 logo, the Work Sans
  font setup, or the brand colour variables in `src/styles.css`.
- LIVE-VERIFY rule from `docs/remediation-plan.md` applies to every new cell:
  fetch the cited page at execution time, copy exact wording, never publish a
  figure or claim not visible on the cited page. Currency follows the footer
  rule: Canadian dollars where the vendor shows one, otherwise as published.

## Stage 1: research only (no page, data, script, or CSS changes)

Deliverable: `docs/personal-plans-research.md`, proposing for every new cell:
`display`, `source_url`, an exact `quote` copied from the page, `note` if
needed, and whether the cell can be watched by the daily grep. A quote is only
usable if it appears in the server-rendered HTML with markup stripped; test
candidate pages the same way `scripts/refresh.mjs` does (plain Node fetch with
its User-Agent, strip tags, collapse whitespace) before proposing them.

New cells to research:

A. Personal table, 4 providers by 4 rows (16 cells):
   - Providers: ChatGPT Plus, Claude Pro, Google AI Pro, Microsoft 365
     Personal. Before naming any ChatGPT tier, check whether ChatGPT Go is
     sold in Canada; do not list a tier a Canadian buyer cannot purchase.
   - Rows: price; data used for training; works with your work email;
     admin control. (No minimum-commitment row: it is trivially "1 person,
     cancel anytime" and was deliberately dropped.)

B. Main-table admin control row, 4 cells (ChatGPT Business, Claude Team,
   Gemini for Google Workspace, Microsoft 365 Copilot Business): who owns the
   account and the work product, what an admin can see or shut off, what
   happens when an employee leaves, who enables connectors.

Known leads from the 2026-07-30 review (re-verify all of them):

- claude.com/pricing already carries Claude Pro pricing ($17/month billed
  annually, $20 monthly at review time) and a feature-table model-training row
  reading "Opt-out" for the personal tiers. Two cells nearly free.
- OpenAI consumer training controls: help.openai.com/en/articles/7730893
  (Data Controls FAQ). Server-rendered, good quote target.
- Google: consumer coverage lives in the Gemini Apps privacy documentation,
  which is a different document from workspace.google.com/security/ai-privacy
  (that one covers Workspace only and must not be cited for Google AI Pro).
  Google AI Pro cannot connect to a business Gmail mailbox; the email cell is
  expected to reflect that.
- Microsoft: no known good consumer Copilot privacy page;
  microsoft.com/en-ca/microsoft-365/copilot/copilot-for-individuals returned
  404 at review time. This is the known-hard cell; real hunting needed.
  Microsoft 365 Personal CAD pricing should be clean on microsoft.com/en-ca.
- Admin control on consumer tiers is mostly provable by absence, which cannot
  be quoted. For those cells propose note-plus-link (to the vendor's business
  feature list) and mark them unwatched rather than fabricating a quote.

End of Stage 1: the research doc is the working record and the review anchor
for what follows; commit it, then proceed directly to Stage 2. The only thing
that blocks Stage 2 is Step 0's CI check: if CI reported unreachable pages,
stop after Stage 1 and report.

## Stage 2: implementation (only after Step 0 is green)

Data model, `data/current.json`:

- Add the admin-control attribute and its 4 cells to the existing main block
  (main grid becomes 5 by 4, 20 cells).
- Add a top-level `personal` block mirroring the existing shape
  (`providers`, `attributes`, `cells`; 4 by 4, 16 cells).
- Add an optional per-cell boolean `watched` (default true when absent).
  `scripts/refresh.mjs` skips the grep for `watched: false` cells (they never
  set `needs_verify` and never count as confirmed or missing; report them as a
  separate "unwatched" count in the summary). `scripts/build.mjs` still
  requires non-empty `display`, `source_url`, `checked` for every cell;
  `quote` may be empty only when `watched` is false.

Rendering, `scripts/build.mjs` + `src/template.html` + `src/styles.css`:

- Second table below the main one, visually subordinate (smaller scale is
  fine), inside its own scrollable frame with the same accessibility
  semantics as the main table: visually-hidden caption, `role="region"` +
  `aria-label` + `tabindex="0"` on the frame, `scope` attributes, sticky
  first column, scroll hint. Neutral heading as noted above.
- Reuse existing CSS classes and patterns; no new colour variables.

Tests, `tests/build.test.mjs`: update grid-shape assertions (20 main cells,
16 personal cells, source-link count updated to the new total), add coverage
for the personal table rendering and the `watched: false` validation path
(empty quote allowed only there). Keep the retired-vocabulary and
byte-identical tests passing.

Workflow: `.github/workflows/refresh.yml` should need no structural change;
verify the issue body and counts still make sense with unwatched cells in
play.

Verification gate (same shape as the remediation plan):

1. `npm run check` passes.
2. `node scripts/refresh.mjs` reports every watched cell confirmed, none
   missing, none unreachable.
3. Visual check at a narrow viewport (both tables scroll correctly, corner
   headers pinned, hints visible) and in print preview (both tables' headers,
   footer, and source URLs legible).

Small atomic commits to `main`, staged explicitly; leave `SIMPLIFY-HANDOFF.md`
untracked. Do NOT push: pushing deploys the live page, and a reviewer checks
the committed diff first. End with a report covering the CI run result, which
cells are watched vs note-plus-link, which sources are weak, and every
judgment call made (tier availability in Canada, fallback sources, wording
choices), so the reviewer can verify them cheaply.
