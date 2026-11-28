# Cycle tracker screens (approved design specs)

Exact specs for layout, copy, colours and interactions — not production code.
The app name is **Grit Girl** (ignore any "Sweat & Co." in the source bundle). All data is sample data.

- `CycProfile.dc.html` — Profile → Cycle desk (log period days, switches)
- `CycProgress.dc.html` — per-exercise progress chart with circled period days
- `CycWeek.dc.html` / `CycMonth.dc.html` — Week / Month ledgers with period days (replace the current Week/Month look for period rows/cells)

Markup lives inside `<x-dc>`; `{{holes}}` come from `renderVals()`; `<sc-for>` = loop, `<sc-if>` = conditional.
Shared pieces already built: `components/cycle/marks.tsx`, `lib/cycle/repo.ts`, `lib/domain/period-marks.ts`, colour tokens `blood` / `blood-tint` / `blood-ink` in `app/globals.css`.
