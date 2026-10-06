# STACKR — pages and components

What each screen of the client does and which component draws it. Every
number on screen comes from the server (an optimizer run, a study file or
saved history); nothing is typed into the components.

## Routes (`client/src/index.js`)

| route | page | notes |
|---|---|---|
| `/` | `LandingPage.jsx` | public landing page |
| `/login` | `auth/LoginPage.jsx` | email + password |
| `/register` | `auth/RegisterPage.jsx` | name, email, password, and "I am a…" (researcher or logistics manager) |
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
| Results | `components/ResultsPanel.jsx` (study) / `components/ResultsTab.jsx` (single run) | the two hybrids (Sequential, Repair-Based) side by side by default, and "View full comparison (4 configurations)" for all four; fixed order, no ranking; per measure "level" (gap under 2 pp / 2 boxes) or highest / lowest (`viewer/comparison.js`); "by design" labels; each card = averages over the load's runs, opening its representative run (closest to the median container fill, `experiments/representative.py`); single runs are labelled "Preview: one run, one seed"; "Things to know"; the trade-offs chart; technical numbers behind "Show all numbers" |
| Loading Guide | `components/GuideTab.jsx`, `components/GuideViews.jsx` | a printable loading and unloading guide built from one stored solution (the chosen configuration's representative run; all four selectable, none selected by default): summary, step order, top views per layer, the view from the rear door, and a box-details appendix |

**Advanced tools**

| page | component | what it shows |
|---|---|---|
| Technical details | `study/CompareTab.jsx`, `study/StudyResults.jsx`, `study/StatsTables.jsx` | a study's Chapter 3 statistics: SP1 (space utilisation), SP2 (compliance C3–C6), SP3 (time and memory, serial studies only), the composite score, and saved runs side by side. Every sentence comes from `study/verdicts.js` |
| 3D Viewer | `components/VisualizationTab.jsx`, `BinViewer.jsx` | the packed container in three.js: colour by delivery stop or by box, filter by stop, "Highlight problems" (boxes breaking C3–C6), orientation guides, box names, the rear door and cab end marked |
| Run History | `components/RunHistoryTab.jsx` | your saved runs: method, test case, repeat code (seed), container fill, rule scores C3–C6; filter by method, relabel, replay, export as JSON, delete |

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

Under **Two ways to run this** (`study/StudyLauncher.jsx`):

- **Quick Test** is one method, one repeat code. It streams over the WebSocket and opens the 3D Viewer.
- **Full Comparison** is the larger study sizes.
- **Import a precomputed study** brings in a study file from `experiments/results/studies/`.

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
