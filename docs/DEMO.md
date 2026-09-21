# GRAVITAS — live demo runbook

Three-day-out checklist for demonstrating the four thesis configurations
(DGWO, MOGWO, Sequential hybrid, Repair-based hybrid) on a real OR-Library
wtpack instance with the 3D viewer.

## 0. One-time setup

```bash
pip install -r requirements.txt          # numba >= 0.62 is required (JIT for the optimizer)
cd server && npm install && cd ..
cd client && npm install && cd ..
python -m preprocessing.sampling --n 30 --out experiments/samples/sample30_seed42.json   # already committed
```

The BR JSON dataset (`data/CLP-Datasets-Main/BR`) is **not** in the repo any
more. The legacy BR / HD-GWO path is still wired but has no data; the demo runs
on wtpack via `--dataset wtpack`.

## 1. Start

Two terminals:

```bash
cd server && node index.js        # HTTP :3001, WebSocket :3002
cd client && npm start            # http://localhost:3000
```

On start the server spawns a throwaway REP run (pop 3 × 1 iter) to JIT-compile
numba. Wait for this line in the server terminal:

```
🔥  Optimizer warm (numba compiled) in ~5 s
```

`GET http://localhost:3001/api/ready` returns `{"state":"warm","warm":true}`.
The compiled kernels are cached on disk (`optimizer/__pycache__/*.nbi/.nbc`),
so after the first ever start this is fast. **Do not delete `__pycache__`
before the demo** — the first run would then pay ~5 s of compilation.

## 2. Log in and reach the app

Open http://localhost:3000, register any account (cookie auth, local SQLite),
land on `/app`. The footer badge must read **● Optimizer ready** (green).
If it says *Warming up…* wait; if *Server offline*, the API is not on :3001.

## 3. Select the instance and preset

Logistics tab → **Option B** is preselected → dataset toggle **OR-Library
wtpack (thesis)** is preselected → the dropdown is populated from
`experiments/samples/sample30_seed42.json` and defaults to

> BR1 — instance 350 — 129 boxes — 26% fragile

Below it: class, container 587 × 233 × 220 cm, 129 boxes, 33 fragile (26%).

Algorithm settings: pick the **Configuration** (DGWO / MOGWO / Sequential /
Repair-based) and the **Run preset**. *Quick demo* is preselected.

## 4. Run

**Run optimizer** → the app switches to the Visualization tab. The thesis
strategies stream best-so-far SU/CSR per iteration; the packed container
appears in the 3D viewer when the run completes. Results tab shows the
metrics; Run history keeps every run.

Fragile boxes are drawn with an **amber edge outline** on top of their normal
colour. The *Filter by type → Fragile* toggle isolates them. Hovering a box
shows its stop and fragility.

## 5. Measured durations (instance 350, i5-1235U laptop, 12 threads)

Optimizer runtime (M-3, reported in the Results tab). Add roughly 10–20 s on
top for streaming and rendering in the browser.

| preset | pop × iter | DGWO | MOGWO | Sequential | Repair-based |
|---|---|---|---|---|---|
| **Quick demo** | 10 × 60 | 24 s | 26 s | 24 s | **146 s (2.5 min)** |
| Standard | 10 × 300 | 149 s | 160 s | 138 s | est. ~27 min |
| Full | 30 × 500 | est. ~12 min | est. ~13 min | est. ~11 min | **est. ~2.5 h — do not run live** |
| *custom, for a live REP* | 5 × 15 | — | — | — | **29 s** (SU 32.8%, CSR 100%) |
| *custom* | 5 × 30 | — | — | — | 66 s (SU 32.9%, CSR 100%) |

Quick and Standard rows are measured (`runtime_s`, seed 1). Full rows are
extrapolated from per-iteration cost × 3 for pop 30; nobody has run them.

Timings vary ±2× on this laptop with thermal/power state; Quick-demo DGWO
measured 19.8 s and 29.9 s on consecutive runs.

### Repair-based is the slow one

Repair (R1–R5) runs on every candidate every iteration and is ~10× the cost
of the other three per iteration. **At the Quick preset it takes ~2.5 min**,
which is too long to stand in front of. Options for the live session:

1. Run it *first*, before the audience arrives, and show its Results / Run
   history entry (the run persists).
2. Use a custom setting: type **5** in Wolf pack size and **15** in Max
   iterations (the preset flips to *Custom*). See the small-REP row below for
   the measured time. It still reaches CSR = 100% by construction; SU is lower.
3. Skip it live and speak to the "100% by construction" panel.


## 6. Smoke test — each configuration once at Quick demo, seed 42

Verified 2026-09-21 by driving the real UI in headless Chrome after the
client → server → optimizer contract was repaired (commits 6e98526..01192c4).
Every parameter the UI sends is echoed back by the optimizer in `params`
and shown in the Results tab ("Parameters used — as reported by the
optimizer"), so the audience can see the settings that ran.

| configuration | wall to canvas | M-3 (optimizer) | streams | canvas 587×233×220 | fragile marker | SU | CSR | placed | C3 / C4 / C5 / C6 |
|---|---|---|---|---|---|---|---|---|---|
| DGWO | 30.4 s | 23.6 s | 60 updates | ✓ | ✓ 16 | 62.4% | 50.6% | 81/129 | 85.2 / 98.8 / 100 / 58.0 |
| MOGWO | 33.4 s | 26.0 s | 60 | ✓ | ✓ 15 | 49.8% | 68.8% | 64/129 | 89.1 / 100 / 100 / 75.0 |
| Sequential | 31.9 s | 24.2 s | 60 | ✓ | ✓ 12 | 49.2% | 56.5% | 62/129 | 91.9 / 100 / 100 / 58.1 |
| Repair-based | 153.0 s | 145.9 s | 60 | ✓ | ✓ 12 | 44.1% | **100% (by construction)** | 57/129 | 100 / 100 / 100 / 100 |

The DGWO row equals the CLI run with `--seed 42` exactly (SU 62.4%, 81
placed), which is the end-to-end proof that the UI's seed reached the
optimizer. The first `iteration_update` arrives ~5 s after Run is pressed
(numba cache load + initial population); that is normal.

Parameters on the Logistics tab that reach the optimizer verbatim: Wolf pack
size, Max iterations, Penalty λ (tied across C3–C6), Seed (blank = random),
and the two decode-time toggles Enforce stability (C5) / Enforce fragility
(C4). The old Fragility / rotation / LIFO toggles were decorative and were
removed.

## 7. If something goes wrong

| symptom | cause | fix |
|---|---|---|
| badge stuck on *Warming up…* | warm-up Python run failed | server terminal shows the last stderr lines; usually a missing `numba` |
| dropdown says *No sampled instances* | sample JSON missing | `python -m preprocessing.sampling --n 30 --out experiments/samples/sample30_seed42.json` |
| run ends, viewer says *No Active Run Data* | `instance_complete` line was not valid JSON | `main_optimizer.py` now sanitises NaN/Infinity; if it recurs, run the same CLI command by hand and check the last stdout line |
| `Optimizer process exited with code 1` | Python traceback | it is printed in the server terminal |
| everything is slow | laptop on battery / thermal throttling | plug in; the JIT is cached so speed is CPU-bound only |

## 8. Known gaps (deliberately not fixed for the demo)

- The header still reads **STACKR**. Renaming was out of scope for this branch.
- The BR JSON / HD-GWO legacy path has no data in the repo; the UI toggle
  is present but the list is empty.
- `/api/instance-details` (per-item preview) is BR-only; the wtpack path shows
  provenance (class, container, box count, fragile share) instead of a table.
