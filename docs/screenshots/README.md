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

| `inputs_*` | Prompt 3, custom loads (scratch database). `src_sample`: ready-made OR-Library samples with computed box counts, the 200-box-cap labels and why the 476-box instance is not offered. `src_typed_checked`: a typed 36-box load after the server check (stops assigned once, seed 42). `src_csv_errors`: row/column errors from the server. `quick_*`, `launcher_custom`, `study_*`: the same load through Quick Test and a Demo Full Comparison, labelled "Custom load — not part of the thesis dataset" on every tab. |

| `sop_<before\|after>_*` | SOP Summary change (2026-10-06, Playwright Chromium, 1440 px). `before`: master's Results and Technical details (now Studies) pages. `after`: Results opening on the SOP Summary for Study A (one test case, descriptive marks) and Study B (8 test cases, stats.py verdicts), the new Technical Details tab, and the Studies page with its summary; light and dark. |

| `fold_<before\|after>_*` | Fold Studies into Run History, trim the numbers, one Quick Test card (2026-10-07, Playwright Chromium, 1360 px; scratch database with Study A and Study B imported, two Demo studies on instance 350 and one Quick Test; full-page shots cut at 3200 px). `before`: master's Run History, Studies page, Technical Details for Study B and the Quick Test card. `after`: Run History → Runs and → Studies (precomputed list closed and open, light and dark), Technical Details for Study B (light, dark, and with every "Show all numbers" part open) and for the Demo study, the Quick Test card (light, dark) and the Results page one Quick Test click produced (hybrids, then Compare All Methods). `fold_after_mobile_390`: Run History → Studies and Technical Details at 390 px. |
