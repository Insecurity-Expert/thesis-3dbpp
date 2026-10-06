# STACKR — live demo runbook

Three-day-out checklist for demonstrating the four thesis configurations
(DGWO, MOGWO, Sequential hybrid, Repair-based hybrid) on a real OR-Library
wtpack instance with the 3D viewer.

## 0. One-time setup

```bash
pip install -r requirements.txt          # numba 0.68.0 is pinned (JIT for the optimizer)
cd server && npm install && cd ..
cd client && npm install && cd ..
python -m preprocessing.sampling --n 30 --out experiments/sample30_seed42.json   # already committed (the thesis sample)
```

The demo runs on the OR-Library wtpack data (`data/raw/`). The older BR JSON
dataset and the HD-GWO code that read it have been removed.

**Server secrets (set before starting the server on the demo machine).**

| Variable | What it does | If not set |
|---|---|---|
| `JWT_SECRET` | signs sign-in sessions; use any long random string | a built-in development secret is used and the server prints a warning: anyone with the code could forge a session. Acceptable only on a closed demo laptop |
| `STACKR_DEMO_PASSWORD` | password of the demo account (created at start if missing) | `stackr-demo` |
| `STACKR_DEMO_EMAIL` | email of the demo account | `admin@gmail.com` |

The demo account is created once; changing `STACKR_DEMO_PASSWORD` later does
not change an existing account's password (use
`node server/reset-password.js admin@gmail.com --password <new>`).

## 1. Start

Two terminals:

```powershell
# Windows PowerShell (this terminal only)
$env:JWT_SECRET = "<a long random string>"
$env:STACKR_DEMO_PASSWORD = "<the demo password>"
cd server; node index.js          # HTTP :3001, WebSocket :3002
```

```bash
# macOS / Linux
JWT_SECRET='<a long random string>' STACKR_DEMO_PASSWORD='<the demo password>' node server/index.js
```

```bash
cd client && npm start            # http://localhost:3000
```

A random secret, e.g.: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

On start the server spawns a throwaway REP run (pop 3 × 1 iter) to JIT-compile
numba. Wait for this line in the server terminal:

```
🔥  Optimizer warm (numba compiled) in ~5 s
```

`GET http://localhost:3001/api/ready` returns `{"state":"warm","warm":true}`.
The compiled kernels are cached on disk (`optimizer/__pycache__/*.nbi/.nbc`),
so after the first ever start this is fast. **Do not delete `__pycache__`
before the demo** — the first run would then pay ~5 s of compilation.

## 1b. Morning-of check (30 s)

```bash
python tools/demo_check.py
```

Reruns DGWO at the Quick preset, seed 42, and compares SU / CSR / placed
exactly against the recorded slide reference (`experiments/results/quick_i350_s42.json`).
`PASS` means the machine reproduces the numbers on the slides. `FAIL` means
code, data or the numba cache changed — do not demo until it passes.

## 2. Log in and reach the app

Open http://localhost:3000, register any account (cookie auth, local SQLite),
land on `/app`. The footer badge must read **● Optimizer ready** (green).
If it says *Warming up…* wait; if *Server offline*, the API is not on :3001.

## 3. Select the instance and preset

Logistics tab → **Option B** is preselected → dataset toggle **OR-Library
wtpack (thesis)** is preselected → the dropdown lists the demo instance 350
(`experiments/samples/demo_instance_350.json`, labelled "Demo instance (not in the
30-instance study sample)") followed by `experiments/sample30_seed42.json`, and defaults to

> BR1 — instance 350 — 129 boxes — 26% fragile

Below it: class, container 587 × 233 × 220 cm (length × width × height), rear door, 129 boxes, 33 fragile (26%).

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

## 5. Measured durations (instance 350)

Optimizer runtime (M-3), measured 2026-10-03 on a 4-vCPU cloud container,
one process at a time (`experiments/results/environment.txt`). Quick row from
`experiments/results/quick_i350_s42.json` (seed 42); Standard row from
`slide_i350_s{1..5}.json` (mean ± sd over seeds 1–5). The earlier laptop
measurements ran several processes at once and were 2–9× slower; time your
own machine before the session. Add ~10 s in the browser for streaming and
rendering.

| preset | pop × iter | DGWO | MOGWO | Sequential | Repair-based |
|---|---|---|---|---|---|
| **Quick demo** (seed 42) | 10 × 60 | 4.2 s | 4.3 s | 4.0 s | **21.6 s** |
| Standard (slide runs) | 10 × 300 | 21 ± 1 s | 21 ± 1 s | 21 ± 1 s | **115 ± 5 s** |
| Full | 30 × 500 | est. ~2 min | est. ~2 min | est. ~2 min | **est. ~10 min — do not run live** |
| *custom, for a faster live REP* | 5 × 15 | — | — | — | est. ~3 s |

Full-preset rows are estimated as 5× Standard (3× the population, 5/3 the
iterations); they were not measured.

The values the audience will see at the Quick preset, seed 42, are in
`docs/MOCK_DEFENSE_RESULTS.md` ("Live demo reference"); `tools/demo_check.py`
confirms DGWO's row before the session.

### Repair-based is the slow one

Repair (R1–R3) runs on every candidate every iteration, so REP takes about
5× as long as the others (**~22 s at the Quick preset** on the measurement
machine; several minutes on a slower or busy laptop). Options for the live
session if it is slow on yours:

1. Run it *first*, before the audience arrives, and show its Results / Run
   history entry (the run persists).
2. Use a custom setting: type **5** in Wolf pack size and **15** in Max
   iterations (the preset flips to *Custom*). It still reaches
   CSR = 100% by construction; SU is lower.
3. Skip it live and speak to the "100% by construction" panel.

## 6. Smoke test — each configuration once at Quick demo, seed 42

Expected values (the CLI reference, `experiments/results/quick_i350_s42.json`,
regenerated 2026-10-03 under PR #3's behaviour). A UI run with the same
settings must show the same SU, CSR and placed count, because the server
passes every setting to the optimizer and the optimizer is deterministic.
Every parameter the UI sends is echoed back in `params` and shown on Results
("Parameters used — as reported by the optimizer").

| configuration | SU | CSR (placed) | placed | C3 / C4 / C5 / C6 |
|---|---|---|---|---|
| DGWO | 63.21% | 43.59% | 78/129 | 91.0 / 100 / 100 / 46.2 |
| MOGWO | 65.57% | 36.05% | 86/129 | 86.0 / 100 / 100 / 43.0 |
| Sequential | 66.38% | 39.08% | 87/129 | 88.5 / 100 / 100 / 41.4 |
| Repair-based | 29.31% | **100% (by construction)** | 38/129 | 100 / 100 / 100 / 100 |

`tools/demo_check.py` checks the DGWO row; a UI run that matches it is the
end-to-end proof that the UI's seed reached the optimizer. The first `iteration_update` arrives ~5 s after Run is pressed
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
| dropdown says *No sampled instances* | sample JSON missing | `python -m preprocessing.sampling --n 30 --out experiments/sample30_seed42.json` |
| run ends, viewer says *No Active Run Data* | `instance_complete` line was not valid JSON | `main_optimizer.py` now sanitises NaN/Infinity; if it recurs, run the same CLI command by hand and check the last stdout line |
| `Optimizer process exited with code 1` | Python traceback | it is printed in the server terminal |
| everything is slow | laptop on battery / thermal throttling | plug in; the JIT is cached so speed is CPU-bound only |

## 8. Known gaps (deliberately not fixed for the demo)

- The header still reads **STACKR**. Renaming was out of scope for this branch.
- The wtpack path shows provenance (class, container, box count, fragile
  share) rather than a per-box table before the run.

## 9. Full Comparison (SOP studies)

Logistics → **Two ways to run this** → *Full Comparison*. Three sizes, all
genuinely run by `experiments/study.py` as a detached job (it survives a
page reload or a dropped socket; progress is polled from
`<study>.json.progress.json`):

| size | what | measured |
|---|---|---|
| Demo | instance 350, Quick, seeds 1–5 × 4 configurations, 6 parallel workers | **150 s wall** on the earlier laptop (not re-measured) |
| Standard (Study A) | instance 350, Standard (10 × 300), seeds 1–30, 3 parallel workers | **1 925 s wall** on the 4-vCPU cloud container (2026-10-03) |
| Multi-instance (Study B) | `sample8_seed42.json` (BR1–BR7), Quick, seeds 1–10, **serial** | **3 475 s wall** on the same container, nothing else running |

Studies A and B are precomputed in `experiments/results/studies/` and appear
under *Import a precomputed study*. A fresh database shows no studies and
every Results / Compare screen shows an empty state.

For the live session: run the **Demo** study (shows live progress per
configuration; one test case, so its results are descriptive); open the
imported **Study B** for the statistical tests (SP1, SP2) and the
supplementary composite ranking. SP3 needs at least two test cases per
heterogeneity class, which `sample8` has only for BR4. Timing in a parallel
study is flagged *concurrent — not valid for SP3* and is not tested.
