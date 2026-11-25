# free-exercise-db (vendored)

- Upstream: https://github.com/yuhonas/free-exercise-db
- Pinned commit: `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5` (2026-09-27)
- File: `dist/exercises.json` → `exercises.json` (876 exercises)
- License: The Unlicense (public domain) — see `LICENSE.md`, copied verbatim
  from the same commit.

Imported by `pnpm seed:exercises` (`scripts/seed-exercises.ts`). Images are
referenced by relative path (`<id>/0.jpg`) and will be served from our own
storage, never hot-linked from GitHub.

To update: download both files from a newer commit, update the SHA above, and
re-run the seed (it is idempotent).
