# Guided UI — Part 0 read-only report

Nothing was changed to produce this. Sources: `client/src/**`, `design/Updated_Prototype.html`,
`experiments/stats.py`, `experiments/study.py`, `preprocessing/custom_load.py`,
`optimizer/arrangement_view.py`, `optimizer/main_optimizer.py`, `tools/validate_arrangement.py`,
`server/studies.js`, `docs/DEMO.md`, and the two stored studies.

**Missing input:** `design/STACKR-Prototype-Instructions.pdf` is not in the repo or anywhere on disk.
Only the prototype HTML is present, and it's already committed on master. Until the PDF arrives, the
"(a) instructions ask for it" column below relies on the prompt's own summary of the PDF.

---

## (a) Current tabs, sections and controls

Legend: **MAIN** = main path · **ADV** = move to Advanced / Technical details · **REMOVE**.
The target column uses the screen mapping (Home / Dataset = Wizard 1 / Configuration = Wizard 2+3 /
Processing / Results / Guide).

### Shell (sidebar, top bar)
| Item | Mark | Ends up |
|---|---|---|
| Sidebar: Home, Start analysis, Results, Loading guide | MAIN | Sidebar top, in flow order |
| Sidebar: Compare | ADV | Removed from the sidebar. Opens from Results → Technical details (SP1–SP3), one click away. A "Technical details" sidebar entry sits lower, as the prototype's "Advanced tools" group |
| Sidebar: 3D viewer | ADV | Lower sidebar group ("Advanced tools", as in the prototype). Main path reaches it through the View Arrangement button on each solution card |
| Sidebar: Run history | MAIN (lower) | Lower sidebar group |
| Sidebar: Account | MAIN (lower) | Lower group + the avatar menu |
| Collapse button | MAIN | Kept ("Hide menu" in the prototype) |
| Top bar: crumb, page title, load chip, theme toggle, avatar menu | MAIN | Kept. The prototype also adds a **How to use** button (added) |
| Top bar: "Running · Ns" chip | MAIN | Kept while a run is live |
| Error banner | MAIN | Kept |

### Home (`DashboardTab.jsx`)
| Item | Mark | Ends up |
|---|---|---|
| Hero text + "Start analysis →" | MAIN | Home hero, text rewritten per Part A |
| Saved-runs/studies count line | MAIN | Kept under the hero |
| Three step cards | MAIN | Prototype's "Three easy steps", rewritten |
| "The container" card, "The rules checked" card | MAIN | Become the prototype's "What you'll need" block (plain words), with C3–C6 wording from Part C |
| "The four methods" card | MAIN | Kept, with nicknames |
| — (missing) "New here?" banner + How-to-use pop-up | MAIN | Added (prototype) |

### Start analysis (`LogisticsTab.jsx`, `LoadSources.jsx`, `StudyLauncher.jsx`)
| Item | Mark | Ends up |
|---|---|---|
| Source tiles: Standard test case / Ready-made sample / Type them in / Import a CSV | MAIN | Wizard 1, three choices: **Upload your own dataset** (CSV), **Type in your boxes**, **Try a sample** (Ready-made samples + Standard test cases, "from the OR-Library benchmark") |
| Standard-test-case select + class/boxes/fragile line | MAIN | Wizard 1 → Try a sample |
| Ready-made sample cards (+ "why not the largest" note) | MAIN | Wizard 1 → Try a sample |
| Typed-row table, + Add a row, running totals, 500-box note | MAIN | Wizard 1 → Type in your boxes |
| "Also mark the weakest share as fragile" | ADV | Wizard 1, collapsed "Advanced" under the custom sources |
| Check this load / Check this file | MAIN | Wizard 1. The result sets the valid summary and enables [Next] |
| CSV: choose / remove file, simple.csv & advanced.csv templates | MAIN (simple) / ADV (advanced template) | Wizard 1 → Upload |
| Converter error list | MAIN | Invalid Dataset panel (Part B) |
| Custom-load summary card | MAIN | Wizard 1 valid summary (boxes, stops, fragile) + Step 3 review cards |
| Container L×W×H inputs | MAIN | Wizard 2 |
| Max weight (optional) | MAIN | Wizard 2 ("Truck weight limit", "checked after the run, not used for packing") |
| Configuration picker (DGWO/MOGWO/SEQ/REP) | ADV | Wizard 3 → Advanced → Quick Test (one method). Wizard 2 shows the four method cards as information only |
| Run preset (Quick demo / Standard / Full) + timing notes | ADV | Wizard 3 → Advanced → Quick Test |
| Wolf pack size, Max iterations | ADV | Wizard 3 → Advanced → Quick Test |
| Enforce C5 / Enforce C4 switches | **REMOVE** (Part C asks for it) | Gone. Runs always use the optimizer defaults. History keeps its "custom rules" badge |
| Penalty λ | ADV | Wizard 3 → Advanced → Quick Test |
| Seed | ADV | Wizard 2 → Advanced ("repeat code") |
| Test settings 🔒 panel | ADV | Wizard 2 → Advanced (read-only; the prototype shows it inline) |
| "Two ways to run this" + Full Comparison size cards | MAIN (demo) / ADV (Standard, Multi) | **Run STACKR** = demo size. Larger sizes go in Wizard 3 → Advanced |
| "use the test case selected above" checkbox | removed as a control | The wizard always runs the chosen load, so the checkbox is no longer needed. The size default (instance 350) still applies only on the Advanced sizes |
| Your studies table (open / delete / refresh) | ADV | Results → Technical details → "Studies" (also reachable from History) |
| Import a precomputed study | ADV | Results → Technical details → "Studies" |
| Bottom bar: boxes ready, source, strategy, optimizer-ready pill | MAIN | Prototype wizard nav bar (Back / Next / Run). The ready pill moves beside Run |
| Quick Test button / Running… / ■ Stop | ADV (Quick Test) / MAIN (Stop) | Quick Test is in Advanced. Stop goes on the Processing screen |

### Results (`Shell` results header, `ResultsTab.jsx`, `StudyResults.jsx`)
| Item | Mark | Ends up |
|---|---|---|
| Quick Test / Full Comparison toggle | ADV | Results shows the latest Run STACKR study. Quick Test results appear in Technical details → "Quick Test result" |
| Study select dropdown | ADV | Technical details → Studies |
| Things to know button + card | MAIN | Kept as the prototype's button + **pop-up**, using the shared `ThingsToKnow` component |
| Study progress (`StudyProgress`) | MAIN | Processing screen (Part D) |
| Outcome banner (`Banner`, study-level composite) | ADV | Technical details (outcome badge). Its place is taken by "Recommended for this load" (per-load composite, Part E) |
| Provenance strip | ADV | Technical details |
| Score table (composite components) | ADV | Technical details |
| Compliance table (SP2 descriptives + omnibus) | ADV | Technical details |
| Performance table (SP1 descriptives) | ADV / MAIN (derived) | Technical details. Its per-method values feed the four solution cards |
| SP3 text | ADV | Technical details |
| Extra technical numbers | ADV | Technical details ("Show all numbers") |
| "Open Compare →" | ADV | Technical details → SP1–SP3 (Compare, moved) |
| Quick Test: replay banner, custom-load banner | MAIN | Kept wherever a saved run is shown |
| Quick Test: M-1..M-4 chips, parameters echo, per-constraint bars, metrics summary, axis utilisation | ADV | Technical details → Quick Test result |
| Quick Test: Convergence curve card (`ConvergenceChart`) | **REMOVE** | Gone. Convergence data is still saved |
| Quick Test: Export CSV / Export report | ADV | Technical details → Quick Test result |
| "Optimality gap", "Good"/"Optimal"/"Moderate" badges | ADV (truth issues) | In Technical details only if computed. The "Good" badge is unconditional today and `gap_pct` defaults to 0, so both need fixing (b) |

### Compare (`CompareTab.jsx`)
| Item | Mark | Ends up |
|---|---|---|
| Sub-tabs Container full (SP1) / Safety rules (SP2) / Time & memory (SP3) / Overall | ADV | Results → Technical details → SP1–SP3 statistics (component moved as-is; no stats or verdict changes) |
| Saved runs side by side | ADV | Technical details → Saved runs side by side |
| Study select | ADV | Technical details |

### 3D viewer (`VisualizationTab.jsx`, `BinViewer.jsx`)
| Item | Mark | Ends up |
|---|---|---|
| Viewer canvas, legend, box details, Problems card (highlight, per-rule filter, not-loaded list) | MAIN | "View Arrangement" from a solution card, on the method's representative run, with highlighting on |
| Which run: This run / A study run picker | ADV | 3D viewer page → Advanced |
| Angle buttons, colour mode, show/hide type filters, stop filter, box names, orientation guides | ADV | 3D viewer → collapsed "Advanced controls" (angle + colour-by stay visible, as in the prototype) |
| Save picture, reset view (in BinViewer) | MAIN | Kept (prototype has both) |
| LiveProgress with "Live convergence" sparkline | **REMOVE** (sparkline) / MAIN (progress) | The sparkline is gone. Progress moves to the Processing screen |

### Loading guide (`GuideTab.jsx`)
| Item | Mark | Ends up |
|---|---|---|
| Run picker ("The run on screen" / saved runs) | MAIN (method selector) / ADV (saved runs) | Prototype method selector (4 methods, representative runs). "Any saved run" goes in Advanced |
| Print this plan | MAIN | Kept → "Export Guide" (print view + CSV) |
| Page 1 loading-order table, support check note, not-loaded callout | MAIN | Page 1, extended per Part F |
| Page 2 side view | MAIN | Page 2: top view per layer + rear-door view |
| Page 3 summary | MAIN | Page 3, extended per Part F |

### Run history (`RunHistoryTab.jsx`)
Search, import, CSV export, per-row Load / label / Export / Delete, status badges, "custom rules" badge,
"Old manual entry" badge — all **MAIN (lower sidebar)**, unchanged. Study runs will also be listed there
(the failed-run row for Part D).

### Account (`AccountTab.jsx`)
Details, action rows (Password / Download are disabled with a note; Sign out works; Delete is disabled),
Things to know — **MAIN (lower)**, unchanged except that Things to know becomes the shared pop-up trigger.

### Dead / off-flow code
* `client/src/App.js` is not imported anywhere (`index.js` routes `/app` to `Shell`). It has its own
  `ConvergenceChart`, "Weight Compliance" chips and the legacy BR live runner. **REMOVE** (dead code;
  acceptance 7 and 9 would otherwise match it).
* `LandingPage.jsx` (`/` route, not in the mapping) advertises "Convergence Analytics" → **REMOVE** that
  feature card's text (convergence removal "everywhere").

---

## (b) Prototype vs current app, region by region

| Screen | Region | Status | Notes |
|---|---|---|---|
| **Home** | Sidebar with "Get started" / "Advanced tools" / "Account" groups | DIFFERS | App has one flat "Workflow" group |
| | Top bar "How to use" button | MISSING | |
| | "New here?" help banner + "Show me how" | MISSING | |
| | Hero ("Fit more into every container" + Start Analysis) | DIFFERS | App hero exists, different wording. Prototype text is untrue ("tightest way", "winner") |
| | "Three easy steps" cards | MATCHES (layout) / DIFFERS (text) | Prototype step 2 "pack fast … always safe" and step 3 "see your winner" are untrue |
| | "What you'll need before you start" (1-2-3) | MISSING | App has container/rules cards instead. Prototype text says "40-foot truck" (untrue) |
| | How-to-use pop-up (six steps) | MISSING | Prototype has no "don't show again" or auto-open; both are asked for in Part A |
| **Dataset (Wizard 1)** | Wizard step indicator 1-2-3 | MISSING | App is one long page |
| | "Three ways to add your boxes" source tabs | DIFFERS | App has four tiles (Standard / Sample / Typed / CSV); prototype has three (Type / Sample / Standard test case), with Import as a button inside "Type" |
| | Type-in table + "+ Add a box" + "Import a file" | MATCHES (roughly) | Prototype columns say Width/Depth/Height; app uses Length/Width/Height (the converter's schema, so the app stays) |
| | Invalid-dataset panel ("This file can't be used", Remove this file / Cancel) | DIFFERS | App shows a red error list. The panel is missing |
| | Ready-made sample picker (Small/Medium/Large/Very large) + preview table | DIFFERS | App shows sample cards with real counts; the prototype's counts (47/129/286/512) and rows are invented |
| | Standard test cases BR1–BR7 select + stats/table | DIFFERS | App has a select + one-line stats; the prototype's box counts per BR are invented |
| | "Handle with care" cutoff text | DIFFERS | App has the weakest-share option |
| | Format explanation / worked example | MISSING | Part B adds it |
| **Configuration (Wizard 2)** | Container size card (W/D/H/Max weight) | DIFFERS | App: L×W×H + optional max weight, inside Logistics. Prototype says "40-foot truck" and swaps the axes (587 × 220 × 233) |
| | Test settings 🔒 panel | DIFFERS | App has one with real values; prototype values are invented (30 runs, 250/250…) |
| | Four method cards | DIFFERS | Prototype has pick-one radio cards with result-promising names (Quick/Safe/Balanced/Strict Pack, "recommended"). App has an inline tab picker |
| | Repeat code | MATCHES (field) | App: "Seed" |
| | Safety-rule locked toggles (4) + rotation toggle | MISSING | App has C4/C5 enforcement switches instead. Prototype's first rule is "Stay under the weight limit" (untrue: C3 is load-bearing) |
| **Configuration (Wizard 3)** | "Quick check before you pack" review cards (Container / Your boxes / Method & rules / Test runs / Repeat code) | MISSING | |
| | "Two ways to run this" + Quick Test / Full Comparison run buttons in the nav bar | DIFFERS | App has a Full Comparison card grid + a bottom Quick Test bar |
| | Nav bar Back / Next / Run | MISSING | |
| **Processing** | Title, run label, sub-label, progress bar, status text, spinner | MISSING as a screen | App: `StudyProgress` inside Results (real progress, per-method bars); Quick Test uses `LiveProgress` in the 3D viewer |
| | Stop button | DIFFERS | App: Stop only for Quick Test (bottom bar). Studies have no stop endpoint today (see note under g) |
| **Results** | Winner card (🏆 big name, score, 3 figures, sentence) | DIFFERS | App's `Banner` is study-level (Friedman-gated) and says "not significant" for single loads. The prototype's figures are invented |
| | Things to know button → pop-up | DIFFERS | App: toggles an inline card |
| | Overall-score breakdown / tables | DIFFERS | App has real tables (ScoreTable etc.) inline. The prototype's numbers are invented |
| | Four-method side-by-side table with "See guide →" | DIFFERS | App's PerformanceTable has no per-method actions |
| | "Show extra technical numbers" toggle | MATCHES | App: ExtraNumbers Show/Hide |
| | Trade-offs (Pareto) pop-up | MISSING | Prototype uses `paretoPoints` / `mulberry32` (invented) |
| | "How each method improves over time" pop-up | MISSING in app → stays missing (removed by the instructions) | |
| **Guide** | Intro text + Print this plan | MATCHES | |
| | Method selector (4 methods with fill %) | DIFFERS | App has a run picker |
| | "This is the winner's plan" banner | DIFFERS → removed (Part F) | |
| | Page 1 table (Stop, Load order, Box, Size, Weight, Max load, Careful?, Where to put it, Unload) | DIFFERS | App: Step, Box, Stop, Position, Orientation, Fragile, Rests on. The prototype's "Unload: Last/2nd/First" and "no more than 1 layer" are invented |
| | Page 2 side view | MATCHES (roughly) | App draws a real side view from positions |
| | Page 3 quick summary (pass/fail list) | DIFFERS | App: 4 real figures + per-rule counts. The prototype's "Weight limit: within limit · always" is untrue |
| | "Show extra details (optional)" | MISSING | |
| **Toasts** | Toast host | MISSING | App has no toast component |

---

## (c) Chapter 3 composite in `experiments/stats.py`

`composite_scores(rows, configs, instances, csr_key="CSR_all_boxes")`, lines 465–484:

```
CS(c, p) = 0.25·SU~ + 0.25·CSR~ + 0.25·(1 − CC~) + 0.25·(1 − Rob~)
~   = min-max across the four configurations within instance p (a tie → 0.5 for all)
SU  = mean space utilisation (%) over that instance's runs
CSR = mean CSR over ALL boxes (PRIMARY_COMPLIANCE = "all_boxes": csr_pct × placed / n_items)
CC  = (z_ET + z_PM) / 2   — z-scores across the four configs of mean exec time (ms) and mean peak memory (MB)
Rob = sample sd (ddof=1) of SU across that instance's runs (seeds); 0 when there is 1 run
```

* **Four criteria, equal weights 0.25:** space utilisation, constraint satisfaction (all boxes),
  computational cost (time + memory), robustness.
* **Robustness is a Chapter 3 criterion.** It's defined as the sd of SU across seeds on the same
  instance, and lower is better. The recommendation must therefore include it (Part E says not to add it
  only if it were missing, and it isn't missing). With the demo size (5 seeds) it's computable. With 1 run
  it would be 0 for every method, so it wouldn't affect the ranking.
* **Single-instance call without Friedman: yes.** `composite_scores(rows, configs, [inst])` only builds the
  per-instance matrix. The Friedman step lives in `composite()` / `analyse()`. `analyse()` refuses the
  composite when `n_inst < 2` or when timing isn't serial, but those gates are outside
  `composite_scores`. Rows come from `derive_rows(study["runs"])`.
  - For a custom load, `instance_id` is `None`. `group_values(..., instance_id=None)` then means "no
    filter", which is correct for a one-load study. The call is `composite_scores(rows, configs, [None])`.
* **Cost on parallel runs:** CC uses ET (wall-clock) and PM. For the parallel demo, Part E replaces ET with
  process CPU time (see f). PM is each run's own fresh worker process's peak RSS (psutil). It's recorded in
  both modes, but the docstring warns it's "only meaningful when one run owns the process". In parallel
  mode each run still gets its own process (`ProcessPoolExecutor`, `max_tasks_per_child`), so I'd keep PM
  and state this in Technical details.

---

## (d) What `custom_load.py` accepts

Header matching (`normalize_header`): text in `(...)` is dropped, the rest is lower-cased, non-alphanumerics
become `_`, then it's looked up in `_ALIASES`. **Today any unknown header is an error** ("Unknown column
"X"."). Part B changes this to "ignored with a note". A duplicate canonical column is an error.

| Column (template title) | Aliases today | Required | Type / rule |
|---|---|---|---|
| Box name | `box_name`, `name`, `box` | no | free text |
| Stop | `stop`, `delivery_stop` | no | whole number 1–`STOP_COUNT` (**3**, read from `pipeline.load_augmented_instance`'s default). **Either every row has one or none does.** A mix is an error naming the blank rows. If none, stops are assigned once with `assign_stops(num_stops=3, seed=STOP_SEED)` (balanced ±10 pp) and stored; this needs ≥ 3 boxes |
| Length (cm) | `length`, `l` | **yes** | number > 0 |
| Width (cm) | `width`, `w` | **yes** | number > 0 |
| Height (cm) | `height`, `h` | **yes** | number > 0 (kept vertical) |
| Weight (kg) | `weight`, `mass` | **yes** | number > 0 |
| Max load on top (kg) | `max_load_on_top`, `max_load` | **yes** in simple mode | number > 0. It's the kg the box's **top face** may carry: `lbs = max_load / (length × width)` kg/cm² |
| Qty | `qty`, `quantity` | **yes** | whole number > 0. Expands into that many boxes |
| Handle with care | `handle_with_care`, `fragile` | no | yes/y/true/1/x or no/n/false/0/blank; anything else is an error |
| *Advanced:* Type ID, L/W/H flag, LBS L/W/H | `type_id`/`type`, `l_flag`…, `lbs_l`… | all six strength columns or none | flags 0/1 (not all 0); LBS > 0. Replaces Max load on top; boxes may turn as the flags allow |

Other rules:
* Blank cells in required columns are errors ("Row n (line m of the file), Col: blank.").
* Non-numbers are errors.
* A box that fits the container in no allowed orientation is an error. Simple-mode boxes are **upright
  only** (orientations 1, 2).
* Total boxes after Qty must be **≤ 500** (`MAX_BOXES`).
* Container L/W/H must be > 0. Max weight must be blank or > 0.
* The fragile-share target must be in (0, 1).
* An empty file is an error. A load with no rows is an error.
* Errors are returned as `{row, column, message, line?}`.
* Template (`template simple`): header row + "Carton A,1,60,40,50,20,120,4,no" and
  "Glassware,2,40,30,30,8,24,2,yes".

Part B alias additions will go in `_ALIASES`: "Stop Number" → `stop_number`, "Stop Sequence" →
`stop_sequence`, "Delivery Sequence" → `delivery_sequence`. The existing normalisation already makes them
case-insensitive. The stop-above-3 message changes to "STACKR supports up to 3 delivery stops."

---

## (e) What a finished run stores per box

Two stores: live runs (`main_optimizer.py` → `result`, saved in history) and study runs (the study file
row: `placements` + `orientations` + metrics; the viewer payload is rebuilt by
`arrangement_view.py --study`, which re-verifies SU/CSR). Both go through
`arrangement_view.annotate`, so they carry the same per-box fields.

| Field the guide needs | Stored? | Where / how |
|---|---|---|
| Position x, y (from door), z; placed dims | **stored** | `items[].x/y/z/dx/dy/dz` (render axes; `viewer/boxInfo.physics()` maps back). Study file: `placements[i] = [x,y,z,dx,dy,dz]` |
| Orientation | **stored** | `items[].orientation` (code 1–6) / study `orientations` → `orientationText()` |
| Weight, stop, fragile, ID | **stored** | `items[].mass/stop/fragile/id` |
| Support contacts (which boxes it rests on) | **computable** | Not stored as a list. Computed from positions with the same test as the validator's C5: tops coplanar with the base (|Δz| < 1e-5) and footprint overlap > 0. `loadingPlan.supportersOf` does this, but with overlap > 1e-6 rather than the validator's > 0. I'll align it to the validator's rule and test it against the validator on instance 350 |
| C3 load above vs capacity | **stored** | `items[].load_above_kg`, `items[].max_load_kg` → "over by N kg" = difference |
| C5 support % | **stored** | `items[].support_ratio` (null on the floor) |
| C6 blocking pairs | **stored** | `items[].c6_blocked_by` = IDs of later-stop boxes above it or between it and the door (the validator's `doorward_blockers` + later-stop `above`) |
| Per-rule counts | **stored** | `problem_view.violating{C3..C6}`, `compliant_placed`, `n_items`, `n_placed` |
| Unloaded boxes | **stored (partly)** | `problem_view.unplaced[] = {item_idx, id, stop, fragile, mass}`. **Size is not stored.** It can be computed by loading the instance (pipeline / stored custom load) by `item_idx`. I'll add this in a new helper outside `optimizer/` |
| Weight-limit check | **stored** (custom loads) | `custom_load.{packed_mass_kg, max_weight_kg}` |
| Runs saved before the problem view | not stored | The guide says so, as it does now |

---

## (f) CPU time

**Not recorded anywhere.** Study rows have `exec_time_ms` from `time.perf_counter()` (wall-clock) around
`opt.run()` (`experiments/study.py:180-182`). Live runs have `runtime_s` / `M3_execution_time_ms`, also
`perf_counter` (in `optimizer/main_optimizer.py`, which is off-limits).

**Where to add it without touching optimizer logic:** `experiments/study.py`'s worker, which isn't on the
do-not-touch list.
* Take `time.process_time()` before and after `opt.run()`, next to the existing `perf_counter` pair.
* Write `cpu_time_ms` into the run row (additive).
* Record `timing_method` accordingly.

`stats.py` ignores unknown keys, so stored Study A/B files and the stats are unaffected. Only numba-JIT
single-threaded code runs inside `opt.run()`, so process CPU time is that run's own CPU cost. Live Quick
Test runs won't get it (that would need `main_optimizer.py`), and Quick Test has no recommendation, so
nothing needs it.

---

## (g) Demo Full Comparison

`server/studies.js` `SIZES.demo`:
* instance **350** (BR1, **129 boxes**, 26% fragile), preset **quick** (pop 10 × 60 iterations)
* seeds **1–5** (`STACKR_DEMO_SEEDS`, default 5) × 4 methods = **20 runs**
* mode **parallel**, **6 workers**
* measured **~150 s wall** on the demo laptop (i5-1235U, 12 threads). Alternatives: 6 seeds / 8 workers =
  176 s, 10 seeds / 10 workers = 277 s. Concurrent REP runs slow each other ~3×.
* Serial Quick per run: DGWO/MOGWO/SEQ ~4 s, REP ~30 s (+ ~3 s process start).

For a custom load, the demo size runs the same preset/seeds/mode on the stored load instead of instance 350.
There is no stop endpoint for a study today (the job is detached). `DELETE /api/studies/:id` kills the pid
but also deletes the row. Part D's Stop needs a small additive `POST /api/studies/:id/stop` in
`server/studies.js` that kills the process tree (the pool's worker children too) and keeps the row as
`stopped`, so it can be saved to History as a failed/stopped run.

---

## Environment notes
* `numpy`/`scipy` aren't installed and `client/node_modules` is absent. I'll install from
  `requirements.txt` / `package-lock.json` before running any test or taking screenshots.
* `client/src/App.js` is dead code (see (a)).
