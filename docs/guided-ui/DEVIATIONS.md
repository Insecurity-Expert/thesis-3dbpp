# Guided UI — differences from the prototype

Base design: `design/Updated_Prototype.html`. Changes asked for: `design/STACKR-Prototype-Instructions.pdf`
plus the guided-UI prompt. Every visible difference between a prototype screen and the app is listed
here with its reason:

* **(a)** the instructions (PDF or prompt) ask for it
* **(b)** a truth-rule fix: the prototype's number, text or control isn't true of STACKR
* **(c)** technical content moved into a collapsed section

Side-by-side screenshots (prototype left, app right, light and dark) are in `screenshots/`.

Status: **Parts A–C** (Home, How to use, Dataset, Configuration). Processing, Results and Guide come in Parts D–F.

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
| "Don't show this again when I log in" tickbox | — | Added; stored on the account (`users.howto_hidden`) | (a) |
| Opens automatically | — | Once after each login unless ticked; also from the top bar and the Home banner | (a) |
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
