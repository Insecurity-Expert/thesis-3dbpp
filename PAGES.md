# STACKR — pages and components

What each screen of the client does and which component draws it. Every
number on screen comes from the server (an optimizer run, a study file or
saved history); nothing is typed into the components.

## Routes (`client/src/index.js`)

| route | page | notes |
|---|---|---|
| `/` | `LandingPage.jsx` | public landing page |
| `/login` | `auth/LoginPage.jsx` | email + password |
| `/register` | `auth/RegisterPage.jsx` | name, email, password, recovery question and answer |
| `/app` | `Shell.jsx` | signed-in only; anyone else is sent to `/login` |

Sign-in is a JWT in an httpOnly cookie (`server/auth.js`).

## The app shell (`Shell.jsx`)

`Shell.jsx` holds the app's state: the chosen load, the WebSocket to the
optimizer, the selected study and the run history. It also draws the sidebar
and the top bar. The top bar shows the chosen load with a dot for the
optimizer's warm-up state (`/api/ready`), the help button and the light/dark
toggle.

The sidebar groups the pages:

**Get started**

| page | component | what it shows |
|---|---|---|
| Home | `components/DashboardTab.jsx` | the "New here?" banner, three step cards, what you need, and counts of your own runs and studies |
| Start analysis | `components/LogisticsTab.jsx` | the three-step wizard (below) |
| Results | `components/ResultsPanel.jsx` (default export), `components/results/*`, `viewer/resultsMetrics.js` | **Performance Overview** of the methods on the selected load (means over its runs): tabs Overall · Packing Efficiency (SP1) · Safety & Delivery Order (SP2) · Computational Resources (SP3). Default: the two hybrids as cards; "Compare All Methods" (`?view=all`) shows all four in a table (one card per method under ~640 px). Best value per metric marked green with ✓ Highest / ✓ Lowest (ties all marked); a descriptive rank (Overall: the equal-weighted composite score; other tabs: the first metric), captioned as not a statistical test. Each method: View Arrangement (3D viewer, representative run) and Export Guide. Time and memory of a parallel study are flagged invalid and neither marked nor ranked |
| Technical Details | `components/ResultsPanel.jsx` (`TechnicalDetailsPanel`), `study/StudyDetails.jsx`, `study/StatsSections.jsx`, `study/StudyResults.jsx`, `components/ResultsTab.jsx` (single run) | the selected study's detail view. Visible by default: a header line (outcome pattern, test cases, runs, preset) and the SOP Summary: container fill (SU), rule compliance and load-bearing (C3) and stop order (C6) over all boxes, execution time and peak memory, per configuration, with "Best" / "No significant difference" marks (with ≥ 2 test cases only where stats.py's Holm-corrected test and effect-size threshold both support it), the one-sentence finding per SP and the fragility/stability note. Everything else is under **Show all numbers** (closed; nothing mounts until opened), grouped SP1 · SP2 · SP3 · Supplementary · Per load and per run, each part collapsed: summary statistics, normality, omnibus and pairwise tests with effect sizes, the SP3 charts, the composite ranking, the Greedy / Random Order baselines, extra numbers and run settings (λ), saved runs side by side, the configuration cards, every run and the trade-offs chart. A saved run opened from Run History is shown below it |
| Loading Guide | `components/GuideTab.jsx`, `components/GuideViews.jsx` | a printable loading and unloading guide built from one stored solution (the chosen configuration's representative run; all four selectable, none selected by default): summary, step order, top views per layer, the view from the rear door, and a box-details appendix |

**Advanced tools**

| page | component | what it shows |
|---|---|---|
| 3D Viewer | `components/VisualizationTab.jsx`, `BinViewer.jsx` | the packed container in three.js: colour by delivery stop or by box, filter by stop, "Highlight problems" (boxes breaking C3–C6), orientation guides, box names, the rear door and cab end marked |
| Run History | `components/RunHistoryTab.jsx`, `study/StudyList.jsx` | two tabs. **Runs**: your saved runs: method, test case, repeat code (seed), container fill, rule scores C3–C6; filter by method, relabel, replay, export as JSON, delete, Download as CSV. **Studies** (`?tab=studies`; the old `/studies` link redirects here): your studies (Open → Results, Delete with confirmation) and, collapsed under "Show precomputed studies (N)", the study files in `experiments/results/studies/` to import, newest first, one entry per study (a file computed again on the same commit with the same settings is listed once) |

**Account**

| page | component | what it shows |
|---|---|---|
| Account Settings | `components/AccountTab.jsx` | your details and sign out; actions not built yet are shown disabled |

## Start analysis: the wizard (`LogisticsTab.jsx`)

1. **Your boxes** (`components/LoadSources.jsx`), with three ways in:
   - **Upload your own dataset**: a CSV, checked by `preprocessing/custom_load.py`. Problems appear in the Invalid Dataset panel, each naming its row and column.
   - **Type in your boxes**: rows typed into a table, checked by the same converter.
   - **Try a sample**: OR-Library wtpack instances, either the ready-made samples or the thesis's standard test cases.

   A typed or uploaded load is a *custom load*. It carries the "not part of the thesis dataset" label everywhere (`components/CustomLoadBanner.jsx`).
2. **Settings**: the container (587 × 233 × 220 cm by default), the four methods and the safety rules. The penalty weights λ and the C4/C5 enforcement are fixed to `experiments/calibration.json`; they are shown but can't be edited.
3. **Review & run**: facts computed from the load, then **Run STACKR**. This launches a comparison of all four methods on the load (`POST /api/studies`). `components/ProcessingPanel.jsx` shows its real progress, and Stop ends every process of the comparison.

Under **Advanced** on Review & run:

- **Quick Test** is one method, one repeat code. It streams over the WebSocket and opens the 3D Viewer.
- **Full Comparison** (`study/StudyLauncher.jsx`) is the larger study sizes.

Precomputed study files are imported from Run History → Studies.

The locked test settings shown there are read from `experiments/study.py --print-defaults`.

## Shared pieces

| component | role |
|---|---|
| `components/ui.jsx` | pop-up (modal) and toast |
| `components/HowToModal.jsx` | the six-step "How to use STACKR" pop-up; opens by itself only on a new account's first login |
| `components/ThingsToKnow.jsx` | caveats shown in Results and Account, computed from the data held |
| `components/TradeoffsChart.jsx` | one dot per run: container fill against rule-following over all boxes |
| `study/LineChart.jsx` | small inline-SVG line chart |
| `methods.js` | the four methods' names and one-line descriptions |
| `services/api.js` | the HTTP helpers for every `/api` route |
| `viewer/*.js` | pure logic for the loading plan, guide and trade-offs, with unit tests (`*.test.js`) |
