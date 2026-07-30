# Give the render path the same second chance as the fetch path

Approved 2026-07-30. One small fix from the review of
docs/render-watch-and-brand-tweaks.md; that spec is otherwise fully
executed and verified. Do not redo any of it.

## The gap

In scripts/refresh.mjs, a plain-fetch cell gets two attempts
(`loadWithRetry` retries once after a 2s pause), but a `render: true`
cell calls `render()` exactly once. A transient Chrome hiccup on the CI
runner (slow page, one-off crash) would mark the cell unreachable and
open a verification issue for what a single retry would have absorbed.
Failure still fails loud today, so this is resilience, not a bug.

## The fix

- Add a retry wrapper for `render()` mirroring `loadWithRetry`: if the
  first render fails for any reason EXCEPT "chrome not available", wait
  `RETRY_DELAY_MS` and render once more. A missing browser is permanent
  for the run; retrying it wastes 10s per cell for nothing.
- Reuse the existing `RETRY_DELAY_MS` constant. No new constants, flags,
  env vars, or dependencies.
- The page-loading loop calls the wrapper instead of `render()` directly.
  Nothing else in refresh.mjs changes; build.mjs, data, styles, template,
  and the workflow are untouched.

## Constraints (unchanged from the standing set)

- Dependency-free package.json.
- No changes to robots.txt, noindex, Work Sans, brand colour variables,
  the masthead logo, or data/current.json.
- Leave SIMPLIFY-HANDOFF.md untracked.

## Verification gate, then push

1. `npm run check` passes.
2. `node scripts/refresh.mjs` locally: confirmed 32, quote not found 0,
   unreachable 0, unwatched 4.
3. Commit atomically to main, staged explicitly (the refresh.mjs change
   and this doc), push, dispatch `gh workflow run refresh.yml`, watch it,
   and require green with confirmed 32 and no verification issue.

End with a report: the diff summary and the local + CI refresh counts.
