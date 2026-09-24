# sop-ui screenshots

Taken 2026-09-24 from the running app (client dev server + API server on a
scratch database via `STACKR_DB_FILE`), Edge headless via Playwright, 1440 px wide.

| Prefix | What it shows |
|---|---|
| `tab_<tab>_<light\|dark>` | Every tab with the saved run "acc-DGWO" (wtpack #350, seed 42, Quick preset) loaded and Study A / Study B imported. `tab_results_*` has "Things to know" open; `tab_results-study_*` is the Full Comparison view; `tab_history-status_*` is the history table scrolled to the Status column; `tab_guide_print` is the loading guide rendered with print styles. |
| `empty_<tab>_<light\|dark>` | Every tab for a new user on an empty database (no runs, no studies). |
| `viewer_<DGWO\|MOGWO\|REP>_*` | 3D viewer with "Highlight boxes with problems" on. Per-rule counts equal tools/validate_arrangement.py: DGWO 7/0/0/42, MOGWO 12/0/0/27, REP 0/0/0/0 with 86 of 129 not loaded. |
| `viewer_legacy_*` | A run saved without per-box checks: banner, no flags. |
| `viewer_click_*` | Box details pinned by a click. |
| `viewer_study_*` | Study A, MOGWO seed 7, rebuilt from the stored arrangement; SU/CSR match the study. |

The `rd_*` files are older (rear-door orientation guides, Prompt 0) and are not part of this set.
