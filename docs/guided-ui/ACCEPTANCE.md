# Guided UI — acceptance checklist

| # | Check | Result | Evidence |
|---|---|---|---|
| 0 | Side-by-side screenshots, light and dark, every mapped screen + How to use + Invalid Dataset | Done | `screenshots/*-light.png`, `*-dark.png` (Home, How to use, Dataset step 1, Invalid Dataset, Dataset ready, Settings, Review & run, Processing, Results, Things to know, Guide); every difference in `DEVIATIONS.md` |
| 1 | Beginner walkthrough, fresh account, template-based CSV → Run STACKR → recommendation + four cards → arrangement → export guide, without opening Technical details | Pass (light and dark) | `screenshots/walkthrough/1-home … 9-guide-print` (`-light` / `-dark`); the script checks Technical details stayed closed and that the print view opened |
| 2 | Malformed CSV → Invalid Dataset panel with the required text and specific errors; Discard → upload screen, file cleared; Cancel → the three choices; no reload | Pass | `screenshots/invalid-dataset-*.png`; browser script output "after discard: choose button 1, upload tab active 1", "after cancel: pick-one hint 1" |
| 3 | "Delivery Sequence" → stop; "Destination" ignored with the note; stop 4 rejected with the 3-stop message | Pass | `tools/test_custom_load_aliases.py` |
| 4 | Recommendation composite = stats.py's per-instance composite, computed independently; tie wording when the top method changes with a repeat code left out | Pass | `tools/test_recommend.py`: Study B's 8 loads equal the composite stored by stats.py; every load equals an independent re-implementation (CPU or wall cost); tie flags equal an independent leave-one-out check |
| 5 | Guide on instance 350, recommended run: "on top of" = real contacts; loading order passes the support-order test; unloading lists exactly the validator's C6 blockers (per box in the appendix, once per stop on Page 1); rehandling count = the validator's C6-blocked boxes; not-loaded = unplaced; page 3 counts = validator | Pass | `client/src/viewer/guidePlan.test.js` against `tools/guide_reference.py` (validator only) |
| 6 | Trade-offs on Study A, MOGWO: dots = stored runs; circled = an independent non-dominated set | Pass | `client/src/viewer/tradeoffs.test.js` (3 of 30 runs best-of-both: seeds 19, 20, 24) |
| 7 | No convergence feature in client/src; none after a Quick Test | Pass | grep below; `ConvergenceChart.jsx` deleted, Results card and the live sparkline removed; convergence data still saved with each run |
| 8 | Nothing lost: every MOVE TO ADVANCED item reachable; SP1–SP3 open from Technical details | Pass | list below |
| 9 | No made-up data or untrue text | Pass | grep below |
| 10 | Toasts only after success; pop-ups close with button, Esc and outside click | Pass | toasts raised after the action resolved (stop, discard, cancel, export, CSV); browser script: How to use and Things to know close by Esc, outside click and button |
| 11 | Empty database on every screen; custom-load label everywhere it applies | Pass | fresh `STACKR_DB_FILE`, all eight screens visited, no page errors; label on the wizard, review, Results, 3D viewer, each guide page, History |
| 12 | Test suite, unchanged values, `STACKR_DB_FILE`, real `db_mock.json` untouched | Pass | see the final test run in the commit log / report |

## 7 and 9 — greps of client/src (count of matches)

```
0  VP_BOXES          0  paretoPoints      0  mulberry32       0  5.2%
0  99.4              0  96.8              0  Quick Pack       0  Safe Pack
0  Balanced Pack     0  Strict Pack       0  40-foot          0  Weight Limit
0  cloud machine     0  Destination       0  improves over time
0  Show how it improves                   0  ConvergenceChart 0  Sparkline
```
("Destination ignored — STACKR uses stop numbers." is produced by the converter on the server, not in client/src.)

## 8 — nothing lost: where every item marked MOVE TO ADVANCED went

| Item | New location |
|---|---|
| Compare: SP1 container fill, SP2 safety rules, SP3 time & memory, Overall | Results → Show all numbers → "Are the differences real? (SP1–SP3)"; also the sidebar's Technical details page |
| Saved runs side by side | Same Compare component (its last sub-tab) |
| Full numbers: provenance, score table, compliance table, performance, extra numbers, outcome banner | Results → Show all numbers → "The thesis statistics for this comparison" |
| Your studies (open / delete / refresh), Import a precomputed study | Sidebar → Technical details |
| Study select | Results header (comparison picker) |
| Quick Test (method, preset, pack size, iterations) and its Run / Stop | Start analysis → Step 3 → Advanced → Quick Test |
| Quick Test result (M-1..M-4, parameters, per-rule bars, metrics summary, axis use, CSV / report export) | Results → Show all numbers → "Quick Test result" |
| Larger comparison sizes (Standard / Study A, Multi / Study B) | Start analysis → Step 3 → Advanced → Larger comparisons |
| Seed (repeat code) | Start analysis → Step 2 → Advanced |
| Test settings 🔒 (incl. λ, read-only) | Start analysis → Step 2 → Advanced; λ and enforcement also in Results → How it was decided |
| Weakest-share fragility option, advanced CSV template | Start analysis → Step 1 → Upload / Type in → Advanced |
| 3D viewer: which-run / study-run picker, show/hide filters, stop filter, box names, orientation guides | 3D Viewer → Advanced |
| Guide from a single saved run / the Quick Test | Loading Guide → Advanced: a single saved run instead |
| Removed (as asked): convergence chart and live sparkline; the C4/C5 enforcement switches (History keeps "custom rules" for older runs) | — |

## Other checks run for this work

* `tools/test_run_settings.py` — every Quick Test and comparison run uses Study A/B's λ and enforcement (sent explicitly by the server); see `RUN_SETTINGS.md`.
* `tools/check_cpu_timing.py` — numba is compiled in the worker initializer: first timed run within 1 ± 0.15 of later runs.
* Stop: no study or worker process remains after `POST /api/studies/:id/stop`; the stopped comparison is not saved.
