# Guided UI — differences from the prototype

Base design: `design/Updated_Prototype.html`. Changes asked for: `design/STACKR-Prototype-Instructions.pdf`
plus the guided-UI prompt. Every visible difference between a prototype screen and the app is listed
here with its reason:

* **(a)** the instructions (PDF or prompt) ask for it
* **(b)** a truth-rule fix: the prototype's number, text or control isn't true of STACKR
* **(c)** technical content moved into a collapsed section

Side-by-side screenshots (prototype left, app right, light and dark) are in `screenshots/`.

Status: **Parts A–F** (every screen in the mapping). The beginner walkthrough, light and dark, is in `screenshots/walkthrough/`; a sample exported guide is `sample-loading-guide-instance350.pdf`.

## Everywhere (sidebar and top bar)

| Element | Prototype | App | Reason |
|---|---|---|---|
| Brand mark | Letter "S" tile | STACKR logo image | (a) keep the STACKR branding |
| Sidebar "Advanced tools" | Compare Runs, 3D Viewer, Run History | **Technical details**, 3D Viewer, Run History | (c) Compare (SP1–SP3) becomes Technical details, together with the study list and study import |
| Top-bar load chip | "Sample: BR2 — 40 boxes" (fixed text) | The load actually chosen (e.g. "sample — BR4, instance 647", "Custom load"), hidden when none | (b) |
| Top-bar "Download this app" icon | Active button | Same icon, **disabled**, tooltip "not available in this version" | (b) a control that can't work is disabled with a note |
| Avatar | Opens Account | Opens the existing account menu (name, role, Account, Log out) | (a) "Account … behind the account menu" |
| Toasts | Many, some fire on fake actions | Only those whose action exists, raised after it succeeded: "Cancelled.", "File removed. You can pick another.", "Finish the earlier steps first.", "… is always on — it can't be turned off." | (b) |

## Home

| Element | Prototype | App | Reason |
|---|---|---|---|
| Hero title | "Fit more into every container" | "Plan how your boxes go into one truck" | (b) STACKR doesn't promise more than another tool; it plans one container |
| Hero text | "works out the tightest way to arrange everything" | What STACKR does: arranges with four methods; shows positions, boxes not loaded, rule results; prints a plan | (a) + (b) "tightest" is not guaranteed |
| Step cards | "Pick a packing method … pack fast … always safe", "See your winner" | "Add your boxes", "Check and run" (all four methods run), "See the results" (recommended solution and why, loading guide) | (a) one line per step; (b) no method picking, no promised winner |
| "What you'll need" | Width/depth/height; "a standard 40-foot truck size filled in" | Length/width/height (cm), weight (kg), max load on top (kg), qty; optional stop 1–3 and handle-with-care; container L × W × H, with 587 × 233 × 220 cm filled in | (a) + (b) "40-foot" isn't the container; the converter's schema is L/W/H |
| Saved-runs line | — | "You have N saved runs …" (only when there are any) | kept from the current app (real counts) |

## How to use pop-up

| Element | Prototype | App | Reason |
|---|---|---|---|
| Six steps' text | 40-foot truck; Quick/Safe/Balanced/Strict Pack; "gives you a winner"; "big winner banner" | Add your boxes · Check the settings · Meet the four methods (mechanism nicknames) · "Run STACKR runs all four methods" · Look at the results (a recommendation with a reason; may say two did about equally well) · "Loading Guide gives you a plan you can print" | (a) |
| "Don't show this again" tickbox | — | Added; stored on the account (`users.howto_hidden`) | (a) |
| Opens automatically | — | Only on a new account's first login (stored as `users.howto_auto_shown`), unless ticked; otherwise from the top-bar help button and the Home banner | (a) |
| Closes with | ✕ / button / Esc / outside click | Same | — |

## Dataset — wizard Step 1 "Your boxes"

| Element | Prototype | App | Reason |
|---|---|---|---|
| Source tabs | Type them in myself / Use a ready-made sample / Use a standard test case | **Upload your own dataset / Type in your boxes / Try a sample** | (a) |
| Starting state | "Type them in" preselected | No choice selected ("Pick one of the three ways above"); Cancel returns here | (a) Cancel returns to the three choices |
| Upload format explanation | — | Required/optional columns, units, types, stop rule, "Max load on top", Handle with care, 500-box limit, kept upright, other columns ignored. Generated from the converter via `preprocessing/load_info.py` | (a) |
| Template and worked example | — | "Download the template" + the template's two rows shown as a table | (a) |
| Format help after a file is chosen | — | Folded into "File format and template" so the result stays in view | (a) the result must be visible without restarting |
| Invalid-dataset panel | "This file can't be used", invented reasons, Remove this file / Cancel | **"Invalid Dataset"**, "The uploaded dataset does not meet the required format or contains invalid data.", the server's own row/column errors, ignored-column notes, **Discard Dataset / Cancel** | (a) + (b) errors are real |
| Type-in table columns | Width / Depth / Height | Length / Width / Height (cm) | (b) the converter's columns |
| Type-in "Import a file" button | Opens a file | "Upload a file instead" switches to the Upload tab | (a) upload is its own choice |
| "Check these boxes" button (typed) | — | Added | (b) typed rows are validated by the converter before Next |
| Ready-made samples | Dropdown Small/Medium/Large/Very large with invented counts and preview rows | Real OR-Library instances picked by computed box count, with fragile counts | (b) |
| Standard test cases | BR1–BR7 dropdown with invented box counts, "Handle with care cutoff" field | The thesis's sampled instances (real labels), under Try a sample | (a) grouping; (b) counts |
| "from the OR-Library benchmark" label | — | On Try a sample | (a) |
| Valid summary | Badges "129 boxes loaded / kg / category" | "✓ Ready — N boxes · S stops · F fragile", plus notes (e.g. "Destination ignored — STACKR uses stop numbers.") and the custom-load label | (a) |
| Weakest-share fragility option, advanced template | — | In a collapsed "Advanced" | (c) |
| Custom-load label | — | "Custom load — not part of the thesis dataset" on Upload and Type in | (a) the label shows wherever it applies |

## Configuration — wizard Step 2 "Settings"

| Element | Prototype | App | Reason |
|---|---|---|---|
| Container fields | Width 587 / Depth 220 / Height 233 / Max weight 28,000 | **Length, door to cab / Width / Height**, 587 × 233 × 220 cm; line "587 × 233 × 220 cm (length door-to-cab × width × height)"; fixed (disabled, with a note) for benchmark loads | (a) + (b) |
| Weight limit | "Max weight 28,000", described as a packing rule | "Truck weight limit (kg) — optional", blank; "checked after the run, not used for packing"; disabled for benchmark loads with a note | (a) + (b) |
| Test settings 🔒 | Inline, invented values (30 runs, 500 attempts, 250/250 …) | Real values read from the optimizer, inside Step 2 → Advanced; λ shown read-only there | (c) + (b) |
| Method cards | Radio picker; Quick/Safe/Balanced/Strict Pack; "recommended" | Four cards, all ticked, nothing to pick; mechanism nicknames (single-goal packer, two-goal balancer, two-stage, fixes every placement (may load fewer boxes)) | (a) + (b) |
| Safety-rule rows | "Stay under the weight limit", "Protect fragile items", "Keep the load steady", "Unload in the right order" | "Load on top: a box never carries more than its strength allows" (C3), "Fragile boxes: nothing heavy rests on them" (C4), "Stable stacking: each box sits on enough support" (C5), "Unload order: earlier stops sit nearer the door" (C6) | (a) + (b) C3 is load-bearing, not a weight limit |
| Helper text under the rules | — | "Every run checks all four rules. Fragile boxes and stable stacking are enforced while boxes are placed; load on top and unload order are scored, so a result can still break them." | (a) |
| Rotation toggle | On and changeable | Same position, **disabled/off**: "Coming in a later version. Benchmark boxes turn only as their published data allows; typed and imported boxes stay upright." | (a) + (b) |
| C4/C5 enforcement switches (old app) | — | Removed; History keeps "custom rules" for older runs | (a) |
| Repeat code | Inline | Step 2 → Advanced; says Run STACKR always uses repeat codes 1–5 | (a) |

## Configuration — wizard Step 3 "Review & run"

| Element | Prototype | App | Reason |
|---|---|---|---|
| Review cards | Container / Your boxes / Method & rules / Test runs / Steadiness / Repeat code (invented values) | Your boxes (count, source) · Total volume and mass · Load volume as % of the container (warns above 90%) · Stops and fragile boxes · Truck weight limit · Time estimate (measured on this machine, or "no estimate yet") | (a) + (b) |
| Custom-load label | — | Badge on the review card when it applies | (a) |
| "Two ways to run this" callout | Quick Test "about a minute" / Full Comparison "shows you the winner" | "What Run STACKR does": all four methods × 5 repeat codes = 20 runs, up to 6 at a time; then the four solutions and the recommendation | (a) + (b) |
| Run buttons | Quick Test (1 run) + Full Comparison (30 runs × 4) in the nav bar | **Run STACKR** (primary) in the nav bar. Quick Test (one method, one run, no recommendation) and the larger comparison sizes are in a collapsed Advanced | (a) |
| Quick Test settings | Method radio in Step 2 | Advanced: method, preset, pack size (3–60), iterations (1–2000); a run with non-preset settings is labelled "custom settings" in History; λ not editable | (a) + (c) |
| Optimizer-ready indicator | — | "Optimizer ready / Warming up…" beside Run STACKR | (b) real readiness, so the first run doesn't look like a hang |
| Nav-bar hint | "The four safety rules are always on. Only rotation can be changed." | "All four safety rules are checked in every run." | (b) rotation can't be changed |

## Processing (the prototype's processing screen)

| Element | Prototype | App | Reason |
|---|---|---|---|
| Title, spinner | "Packing your boxes…", spinner | Same; "Packing did not finish" / "Packing stopped" after a failure or Stop | (a) |
| Run label | "Run 1 of 30 — DGWO (Quick Pack)" | "Run N of 20 finished — last: MOGWO, repeat code 3", from the progress file | (b) runs happen several at once, so "the" current run doesn't exist; the label says what finished |
| Status text | "Working out where each box should go." | "k of 4 methods finished — packing…" (methods run in parallel, so it counts finished methods); then "All runs finished — checking and scoring the results…" | (a) plain language from the real progress |
| Progress bar | Timer-driven | Finished runs ÷ total runs, from the progress file | (a) + (b) |
| Sub-label | "Method 1 of 4" | "T s so far" | (b) |
| Per-method progress | — | In a collapsed "Progress per method" | (a) |
| Stop button | — | "■ Stop" in the prototype's button style. It ends the whole comparison (parent and every worker) and shows the "Cancelled." toast; nothing is saved | (a) |
| Failure | — | Stays on the screen with the error and "← Back to review"; saved to Run History as a failed run | (a) |

## Results (the prototype's Results panel)

| Element | Prototype | App | Reason |
|---|---|---|---|
| Comparison picker | — | A select above the card (which saved comparison, and which load when a comparison has several) | (b) Results must say which runs it shows |
| Winner card | "🏆 Winner — best method for your load", invented score, "Rules followed 0.994", "Time taken 96.8s", invented advice | **"Recommended for this load"**: the top method of Chapter 3's composite on this load's runs (stats.py), its nickname, Overall score /5, container full, rules followed (all boxes), CPU time — averages over the load's runs; 2–3 sentences generated from the criteria | (a) + (b) |
| Tie wording | — | "Two methods did about equally well" ("Several…" when more than one other method comes out on top) when leaving one repeat code out changes the top method | (a) + (b) |
| Not-the-thesis line | — | "This compares the four methods on this load; it is not the thesis's statistical conclusion." + link to Technical details | (a) |
| No recommendation | — | A parallel comparison without CPU time (e.g. Study A) says why it can't name one; the four cards still show | (b) |
| Things to know | Button + pop-up with "shared cloud machine", "Only 2–3 delivery stops" | Same button and pop-up, using the shared `ThingsToKnow` component: stop count from the data, the recorded machine and mode, CPU-time note | (b) |
| Overall-score breakdown card, safety-rules table, "How each method performed" | On the main page, invented numbers | Under "Show all numbers" (how it was decided, the Chapter 3 tables) | (c) |
| Four methods side by side | Table rows with "See guide →" | **Four solution cards** in the prototype's card style: container fill, rule-following (all boxes) and rule score (loaded boxes) with tooltips, boxes not loaded, time; View Solution → View Arrangement → Export Guide | (a) |
| Card values | Averages | The method's representative run (highest all-box rule-following, then fill, then lowest repeat code), labelled "Its best run (repeat code N) of 5" | (a) the arrangement and guide come from that run |
| "Show extra technical numbers" toggle | Reference numbers | "Show all numbers": how it was decided (formula, per-method criteria, CPU-time note, tie check, representative-run rule, λ and enforcement read-only), every run (with the worker's untimed warm-up CPU), the Trade-offs chart, the thesis statistics with the outcome badge ("needs ≥ 2 test cases" for one load), SP1–SP3 (Compare, moved), the Quick Test result | (c) |
| Trade-offs chart | Pop-up from invented `paretoPoints` | In Technical details: one dot per real run (x = fill, y = all-box rule-following), best-of-both runs circled, "Best-of-both runs: N out of M", hover tooltip, table view | (a) + (b) + (c) |
| "How each method improves over time" | Pop-up with chart | Removed, everywhere (Results, 3D viewer's live view, Quick Test); convergence data is still saved | (a) |

## 3D Viewer (reached by View Arrangement)

| Element | Prototype | App | Reason |
|---|---|---|---|
| What it shows on arrival | A sample | The chosen method's representative run, rebuilt and re-verified by the server, "Highlight boxes with problems" on | (a) |
| Which-run picker, show/hide filters, stop filter, box names, orientation guides | Visible | In a collapsed "Advanced" | (c) |
| "Play loading" | ▶ Play | Kept (existing BinViewer) | — |

## Loading & Unloading Guide (the prototype's Loading Guide panel)

| Element | Prototype | App | Reason |
|---|---|---|---|
| Help banner + Print button | "This is your packing plan…", "Print this plan" | Same banner; "Export Guide (print / PDF)" (the "Save as PDF" toast, then the print view) and "Download page 1 (CSV)" | (a) |
| Method selector | Four entries with invented fill %, "★ Winner" | The four methods with their representative run's real fill, "· recommended" on the recommended one | (a) + (b) |
| "This is the winner's plan" banner | Invented praise | Removed. Page 1 names the recommended solution with its method and repeat code; if another method is chosen it says so | (a) |
| Single saved run | — | Collapsed "Advanced: a single saved run instead" | (c) |
| Page 1 table | 6 example rows; Size W×D×H; "Where to put it" invented ("rear left corner", "no more than 1 layer"); Unload Last/2nd/First | Every box, in the support-checked loading order, in two side-by-side columns, with only: step, box ID, stop, placement from real support contacts ("Place on the floor" / "Place on top of Box 017 and Box 022", plus "Keep reachable — unloaded at stop 1"), fragile yes/no | (a) + (b) |
| Unloading order | — | Grouped by stop, stop 1 first: "Before unloading stop 1, first move: Box 031, 044, 052 (stop 2); … (stop 3)." — the C6 blockers listed once per stop — then the stop's boxes in unloading order (nearest the door and topmost first). Boxes not loaded follow as one short paragraph (ID, size, weight, stop, "arrange separate transport") | (a) |
| Boxes not loaded | — | ID, size, weight, stop, "These did not fit — arrange separate transport." | (a) |
| Page 2 | One side view | Top view per height layer (or 4 height bands when there are many heights) and the view from the rear door, coloured by stop with a legend, door and cab marked, step numbers with a key table | (a) |
| Page 3 | "Weight limit: within limit · always", "Load steadiness passed · 0.988" (invented) | The rehandling count first ("19 boxes need other boxes moved before they can be unloaded", from the C6 blockers), then space utilization, rule-following (all boxes) and loaded-box rule score, per-rule counts and status (C3–C6), the truck-weight check only when a limit was entered, boxes not loaded, and "Balance / weight distribution across the truck is not checked by STACKR." | (a) + (b) |
| "Show extra details (optional)" | Invented values | "Technical details (optional)": method, repeat code, preset, CPU and wall-clock time, overall scores for the load | (a) + (c) |
| Appendix "Box details (for checking)" | — | After Page 3: every box's size as placed, orientation, weight, position (x, y from door, z), and load on top (OK / over by N kg), base support (support % · OK / below 80%), unload order (OK / blocked by …) | (a) keeps Page 1 short |
| Custom-load label | — | On every page and the appendix (screen and print) | (a) |
