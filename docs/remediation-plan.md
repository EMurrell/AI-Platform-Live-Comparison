# Remediation plan: pricing and quick-compare page

Approved 2026-07-30. Self-contained: the executing agent needs nothing beyond this
file and the repo.

## Context

Repo root: `/Users/ericmurrell/Projects/AI platforms comparison table` (branch
`main`). A single static page compares four business AI assistants on price,
minimum commitment, email support, and data used for training. All content lives
in `data/current.json` (16 cells, each with `display`, `source_url`, `quote`,
`checked`, `note`, `needs_verify`). `scripts/build.mjs` renders `index.html` from
`src/template.html` + `src/styles.css`. `scripts/refresh.mjs` re-fetches each
`source_url` daily via `.github/workflows/refresh.yml` and greps the page for
`quote`. `npm run check` builds and runs `tests/build.test.mjs`.

## Hard constraints

- No dependencies, frameworks, or build tools; `package.json` stays dependency-free.
- The page stays neutral: no ranking, no recommendation.
- Do not touch `robots.txt`, the noindex meta tags, the U7 logo, the Work Sans
  font setup, or the brand colour variables in `src/styles.css`. Adding
  print-only overrides that reference existing variables is fine.
- Leave `SIMPLIFY-HANDOFF.md` untracked. Where this plan contradicts it (notably
  its rule that the `updated` date advances on fetch failure, and its Claude
  pricing figures), this plan wins.

## Rules for factual items

Every item tagged LIVE-VERIFY changes displayed factual content. Before editing,
fetch the cited vendor page and copy exact wording; never publish a figure or
claim not visible on the page the cell cites. Quotes must be copied
character-for-character from the page source (watch for curly apostrophes,
U+2019). `scripts/refresh.mjs` lowercases, collapses whitespace, and removes the
space between a currency symbol and a digit before matching, so quotes survive
case and spacing differences but nothing else.

## Workstream A: data/current.json corrections (parallel-safe, all LIVE-VERIFY)

### A1. Claude Team price (cell `claude-team` / `price`, ~line 84)

Current display "$28/seat/month billed annually, $35 billed monthly" is wrong;
those are USD figures multiplied by 1.40. claude.com/pricing shows $20 per
seat/month billed annually, $25 billed monthly (confirmed 2026-07-30). End
state: display `$20/seat/month billed annually, $25 billed monthly`, quote
`$20 per seat / month if billed annually` (verify exact on-page text), keep the
existing currency note.

### A2. ChatGPT Business price (cell `chatgpt-business` / `price`, ~line 44)

Current quote `chatgpt.team.yearly.2026` is an invisible CMS key on a page with
no server-rendered price; it can never detect a change. Delete it. End state:

- `source_url`: `https://help.openai.com/en/articles/8792828-what-is-chatgpt-business`
  (verify the final slug resolves; the article was renamed from "What is
  ChatGPT Team")
- `quote`: `$20 per user per month if billed annually` (LIVE-VERIFY exact wording)
- `display`: `US$20/user/month billed annually, $25 billed monthly`
  (LIVE-VERIFY the monthly figure appears on the article; if not, omit it)
- `note`: approximately "OpenAI shows a region-specific price in Canadian
  dollars at purchase."

### A3. Microsoft 365 Copilot commitment (cell `m365-copilot` / `commitment`, ~line 174)

Current source is a frozen Partner Center monthly archive
(`learn.microsoft.com/en-us/partner-center/announcements/2026-july`) whose quote
"No license minimum" is promo-scoped and contradicts the display's prerequisite
claim. End state: `source_url` points at a buyer-facing microsoft.com/en-ca page
that states the Microsoft 365 Business prerequisite (the Copilot pricing page
already cited by the price cell likely carries "A Microsoft 365 Business plan is
required to purchase Microsoft 365 Copilot Business"; verify). Quote = that
prerequisite sentence. Verify the 300-seat cap is stated on a buyer-facing page;
keep "1 user minimum" only if a cited page states it, otherwise reword the
display to only what the source supports (e.g. "Up to 300 users. Requires a
qualifying Microsoft 365 Business plan.").

### A4. Polarity in the two training quotes

- Cell `gemini-workspace` / `training` (~line 159): change quote to
  `is not reviewed by humans or used for generative AI model training outside your domain without permission`.
- Cell `m365-copilot` / `training` (~line 199): change quote to
  `isn't used to train foundation models`, copying the apostrophe character
  exactly as the page renders it.

Both extended quotes were confirmed present on the cited pages on 2026-07-30;
re-verify. Do B5 (entity normalization) in the same change set so a curly
apostrophe cannot break matching.

### A5. Gemini training display (cell `gemini-workspace` / `training`, ~line 157)

Current "No, unless you give permission." drops the vendor's scope; the source
sentence covers training "outside your domain". End state display: `Not used to
train models outside your organization, unless you allow it.` (or closely
equivalent wording that keeps the outside-your-organization scope).

### A6. Claude Team email cell (cell `claude-team` / `email`, ~line 105)

Two defects: the Outlook half of the display is unsupported (the cited
support.claude.com article covers Google Workspace only), and the display
implies admin enablement is Outlook-specific when the article says Team plan
connectors require an org-level admin enable for Google too. End state: search
support.claude.com for a Microsoft 365/Outlook connector article. If found,
display becomes approximately `Connects to Gmail and Outlook, both enabled by an
admin on Team plans. Drafts and organizes; cannot send from Gmail.` with the
Google article remaining `source_url` (quote `cannot send emails on your behalf`
still valid) and the Outlook article's URL named in the note. If no such article
exists, drop the Outlook sending claim from the display and mention Outlook
connectivity only in the note, or not at all if unsupported.

### A7. Gemini price (cell `gemini-workspace` / `price`, ~line 124)

"$22 billed monthly" appears nowhere on the cited page; it is derived from a
"Save 16% with 1 year commitment" label, and the page says annual-commitment
plans are also billed monthly. End state: display only the verifiable figure,
e.g. `CAD $18.40/user/month on a one-year commitment, billed monthly`, and note
that a flexible month-to-month plan costs more (about 16%, per the page's own
label; do not state $22). Keep quote `$18.40`. Also extend this cell's note:
this price is the Google Workspace Business Standard subscription itself, a full
office suite with Gemini included, not a Gemini add-on. Keep the equivalent
sentence on the commitment cell or trim it there to avoid duplication.

### A8. Microsoft price cell note (cell `m365-copilot` / `price`, ~line 164)

Add to the note: Copilot Business is an add-on requiring a Microsoft 365
Business plan underneath, so the total cost is higher than this line; Microsoft
also sells a "Microsoft 365 Business Standard with Copilot" bundle on the same
cited page. Include the bundle's CAD price only if it is visible on the cited
page at execution time (it was approximately CAD $31.90 on 2026-07-30).

### A9. ChatGPT email cell (cell `chatgpt-business` / `email`, ~line 65)

The source is the full unanchored ChatGPT release-notes changelog (623KB); the
quote sits in a June 2026 entry that will roll off, and the shared-mailbox claim
comes from a different, uncited April 2026 entry. End state: find a stable
help.openai.com article covering the Gmail/Outlook connectors (search the help
centre for "connectors"); repoint `source_url` and requote from it. Keep the
shared-mailbox sentence only if the new source supports it, otherwise demote it
to the note with its own caveat or drop it. Add the "available on the web"
limitation to the note if the source states it. While editing ChatGPT cells,
update the commitment cell's URL slug (~line 58) from
`8792828-what-is-chatgpt-team` to the article's current slug (cosmetic; the ID
resolves either way).

## Workstream B: scripts

B3, B4, B5, B7 are parallel-safe now; B1 is sequenced after Workstream A.

### B1. refresh.mjs: stop matching inside markup (line 53). Only after every Workstream A quote is final.

Change `haystacks: [collapse(body), collapse(withoutMarkup(body))]` to search
only the stripped text: `haystacks: [collapse(withoutMarkup(body))]`. Then run
`node scripts/refresh.mjs` and require the summary to report confirmed: 16,
missing: 0 before committing; if any quote fails, fix that quote, not the
haystack.

### B2. refresh.mjs: unreachable pages must not look like success (lines 66-101)

Two changes. First, do not advance the site-wide date when anything was
unreachable: the condition at lines 85-88 becomes advance `data.updated` only
when `stillNeedsVerify.length === 0 && summary.unreachable.length === 0`.
Second, expose the summary to the workflow: after computing it, write
`{ confirmed, missing, unreachable }` (arrays of labels) as JSON to
`refresh-summary.json` at the repo root, and add that filename to `.gitignore`
(create the entry if absent). Keep exit code 0; the workflow does the reporting
(E1).

### B3. build.mjs: neutralize replacement-pattern substitution (lines 104-107)

`html.replaceAll(needle, replacement)` interprets `$&`, dollar-backtick, `$'`,
`$$` in the replacement string. Change to
`html = html.replaceAll(needle, () => replacement)`. Verified failure mode: a
display containing `$&` would silently re-insert the placeholder.

### B4. build.mjs: validate `quote` and `checked` (line 32)

Add `quote` to the required non-empty string fields, and validate each cell's
`checked` against the same `^\d{4}-\d{2}-\d{2}$` pattern already used for the
top-level `updated` (line 42).

### B5. refresh.mjs: entity and typography normalization (`collapse`, lines 19-29)

Extend to normalize: `&#8217;`, `&rsquo;`, and the literal character U+2019 to
`'`; `&#8216;` / `&lsquo;` to `'`; `&mdash;` / `&#8212;` and `&ndash;` /
`&#8211;` to `-` (and the literal characters); `&hellip;` / `&#8230;` to `...`.
This protects the A4 apostrophe quote.

### B6 (optional). One retry with a short delay in `load()` on failure before reporting unreachable. Skip if it complicates the function.

### B7. build.mjs: source links (line 73)

`rel="noopener noreferrer"` is inert without `target`. Add `target="_blank"`.

## Workstream C: template and CSS (parallel-safe)

### C1. src/styles.css line 244

`.attribute-head` (the sticky table corner) has no horizontal anchor, so it
scrolls away while the label column below stays pinned. Add `left: 0;` to the
`.attribute-head` rule.

### C2. Scroll hint

The table (`min-width: 900px`, line 205) overflows below roughly a 948px
viewport, but `.scroll-hint` (`display: none`, line 188) only becomes visible
inside the 640px media query (line 408). Move the `display: block` so the hint
shows whenever overflow can occur: add a `@media (max-width: 960px)` rule
showing it (or show by default and hide above 960px). Remove the now-redundant
rule from the 640px block.

### C3. Print (`@media print`, lines 437-461)

Three additions inside the existing block:

1. Give `thead th` and `.attribute-head` a white background and dark text
   (`color: var(--purple-dark)` or black, plus a bottom border) so column
   headers survive printing without backgrounds.
2. Same treatment for `footer` and its text so the disclaimer prints.
3. Print the source URLs:
   `.source-link::after { content: " (" attr(href) ")"; }` with a small font
   size and `word-break: break-all`.

Do not modify the brand colour variables themselves.

### C4. src/template.html line 2

`lang="en"` becomes `lang="en-CA"`.

### C5. src/template.html line 59

The footer logo repeats the masthead's `alt="U7 Solutions"`; it is decorative
there, so change to `alt=""`.

### C6. Footer sentence (src/template.html line 62)

Reword "Prices are what each vendor shows a Canadian customer; no currency
conversion is applied." to "Prices are as each vendor publishes them, in
Canadian dollars where the vendor shows one; no currency conversion is
applied." Leave the rest of the footer paragraph unchanged. (Required by A2's
switch to a USD-listed source.)

## Workstream D: tests (after B3/B4; D2 needs D1's build.mjs change)

### D1. Make scripts/build.mjs path-parameterized

Accept optional `process.argv[2]` (data file path) and `process.argv[3]` (output
path), defaulting to the current `data/current.json` and `index.html`. npm
scripts and workflows stay unchanged.

### D2. Test the needs_verify chip

New test: copy the real data, set `needs_verify: true` on one cell, write it to
a temp dir, build with the path arguments to a temp output, assert the output
contains `Verify at source` exactly once, and that the normal build contains it
zero times. This is the page's only safety mechanism and is currently untested.

### D3. Strengthen assertions in tests/build.test.mjs

Add: every cell has a non-empty `quote`; the built page contains the formatted
`updated` date; the page contains exactly 16 `class="source-link"` anchors.
Extend the retired-vocabulary list (line 65) with `seed`, `pipeline`,
`approval`, and run the vocabulary check against the HTML with the base64 logo
data URIs stripped out first, so terms are checked against real text, not blob
bytes.

## Workstream E: workflow (after B2)

### E1. .github/workflows/refresh.yml

The issue currently opens only on `needs_verify` (line 67), so a run where every
page is unreachable stays silent. Change the "Collect cells" step to also read
`refresh-summary.json` (written by B2) and emit an `unreachable` list and count.
Open or update the issue when needs_verify count + unreachable count > 0, with
the body listing the two groups under separate headings ("Quote not found on the
page" / "Page unreachable from CI"). Close the issue only when both are zero.
Keep the single-issue open/close pattern and the SHA-pinned actions exactly as
they are.

## Sequencing and verification

Parallel now: A1 through A9, B3, B4, B5, B7, C1 through C6, D1 through D3. Then
B1 (requires all A quotes final), then B2, then E1. Do not start against a dirty
tree.

Final gate before push:

1. `npm run check` passes.
2. `node scripts/refresh.mjs` reports confirmed: 16, quote not found: 0,
   unreachable: 0 (restore `data/current.json` afterwards if the run touched
   dates you don't want committed).
3. Open `index.html` and confirm at a narrow viewport that the corner header
   stays pinned and the scroll hint is visible, and in print preview that
   column headers, footer text, and source URLs all appear.

Commit in small atomic commits to `main`, staging files explicitly; leave
`SIMPLIFY-HANDOFF.md` untracked.

## Follow-up phase: personal plans (approved, do NOT execute in this round)

A second, deliberately smaller table below the main one covering ChatGPT Plus,
Claude Pro, Google AI Pro, and Microsoft 365 Personal, with four rows: price,
data used for training, works with your work email, and admin control. An
admin-control-and-offboarding row for the main table is considered in the same
phase. Preconditions before starting: this plan's fix list merged, one observed
daily workflow run with confirmed: 16 / unreachable: 0, and acceptance that some
consumer-tier cells will be note-plus-link rather than quote-watched. Check
whether ChatGPT Go is sold in Canada before naming it. Decided against for now:
a fifth "what else you have to buy" row (handled via price-cell notes in A7/A8),
renaming the email row to cover files, and a data residency row.
