# STACKR — constrained 3D single-container loading for multi-stop delivery

STACKR (Structural Three-dimensional Adaptive Constraint-aware pacKing,
Route-aware) is the software artefact of an undergraduate thesis comparing
four Grey Wolf Optimizer configurations on the constrained single-container
loading problem. Given one container and a set of boxes with mass,
load-bearing strength, allowed orientations, a fragile flag and a delivery
stop, it searches for an arrangement that maximises space utilisation while
respecting:

| | constraint |
|---|---|
| C1 | boxes lie inside the container |
| C2 | boxes do not overlap |
| C3 | load-bearing: mass borne by a box ≤ its vertical LBS × contact area |
| C4 | fragility: nothing rests on a fragile box |
| C5 | stability: floor contact or ≥ 80 % coplanar base support |
| C6 | stop order: no later-stop box above or doorward of an earlier-stop box |

The delivery order is an input; STACKR respects it, it does not plan routes.

Coordinate convention: **x = across the truck, y = from the rear door
(y = 0) toward the cab, z = height.** The container is a rear-door truck
body — 587 × 233 × 220 cm (length × width × height) — so depth runs along
the 587 cm length; the loader keeps the file's dimensions and
`preprocessing/pipeline.container_from_file_dims` is the one place that
maps them to physics extents.

Reported metrics: **M-1** space utilisation (SU), **M-2** constraint
satisfaction over placed boxes (CSR) plus the Chapter-3 figure over all
boxes (CSR × placed / n), per-constraint compliance C3–C6, **M-3** wall-clock,
**M-4** peak memory.

## Dataset

OR-Library **wtpack** container-loading instances (`data/raw/wtpack1.txt` …
`wtpack7.txt`, 100 instances each). The seven files are the Bischoff–Ratcliff
heterogeneity classes **BR1–BR7** (3, 5, 8, 10, 12, 15 and 20 box types).
They carry real mass and load-bearing values; nothing is synthesised. Two
fields are added deterministically at load time — a fragile flag (greedy
type-level selection, 20–30 % of boxes) and a delivery stop (balanced,
seeded). Provenance, citations and the augmentation rules are in
[data/README.md](data/README.md).

## The four configurations

| code | UI label | what it does |
|---|---|---|
| **DGWO** | DGWO | single-objective GWO on a scalar fitness `−SU + Σ λ·V` (penalised constraint violation rates) |
| **MOGWO** | MOGWO | multi-objective GWO with a Pareto archive over (SU, CSR); returns the most compliant archive member |
| **SEQ** | Sequential | GWO search, then one repair pass (R1–R5) on the final arrangement |
| **REP** | Repair-based | repair inside the loop — every evaluated wolf is repaired first, so CSR = 100 % by construction |

All four share the same decoder (deepest-bottom-left-fill over extreme
points with a 2n random-key genome: n sequence keys + n orientation keys),
the same evaluator and the same decode-time enforcement flags
(`enforce_support` for C5, `enforce_fragility` for C4).

## Running it

Requirements: Python 3.12 with `pip install -r requirements.txt` (numpy,
scipy, numba), Node 22.

**Terminal A — server** (HTTP API on `:3001`, WebSocket on `:3002`; warms the
numba cache on start and reports readiness at `/api/ready`):

```powershell
cd server
npm install
node index.js
```

**Terminal B — client** (opens http://localhost:3000; register an account,
then `/app`):

```powershell
cd client
npm install
npm start
```

In the app: pick a wtpack instance, a configuration and a preset
(Quick = pop 10 × 60 iterations, Standard = 10 × 300, Full = 30 × 500), set
the seed, and run. The Results tab shows the metrics, the parameters the
optimizer actually ran with, and the per-constraint bars; the 3D viewer
draws the packing (fragile boxes have an amber edge); Run History saves the
complete result page and can replay it, labelled as a saved run.

**Headless**, for experiments:

```bash
python experiments/runner.py --instance 350 --all --seed 1 --pop-size 10 --max-iter 300 --out out.json
python experiments/baselines.py --instance 350 --out baselines.json
python experiments/summarize_results.py          # tables from experiments/results/
```

The demo runbook is [docs/DEMO.md](docs/DEMO.md).

## Verifying

```bash
python tools/demo_check.py          # DGWO Quick seed 42 on instance 350 reproduces the stored reference exactly
python tools/test_geometry.py       # 75 geometry / constraint / decoder / repair checks, compiled == reference
python tools/test_determinism.py    # same seed -> same hash, different seed -> different hash
python -m pytest preprocessing/test_pipeline.py -q   # loader, fragility and stop augmentation (28 tests)
python tools/compare_validators.py experiments/results/slide_i350_s1.json   # independent validator vs the optimizer's evaluator
```

`tools/validate_arrangement.py` is a checker written from the Chapter 3
definitions that imports nothing from `optimizer/`; every published
arrangement has been passed through it.

## Repository layout

```
optimizer/          the thesis optimizer
  geometry_3d.py      DBLF decoder, extreme points, decode-time C4/C5 checks (numba)
  thesis_algorithms.py DGWO / MOGWO / SequentialHybrid / RepairBasedHybrid
  thesis_metrics.py   SU, CSR and per-constraint evaluation (compiled + reference)
  repair.py           relocate-then-defer repair operators R1-R5
  main_optimizer.py   CLI / streaming entry point used by the server
preprocessing/      wtpack loader, fragility and stop augmentation, sampling, tests
experiments/        runner, baselines, convergence scripts, results/ and samples/
tools/              demo_check, geometry and determinism tests, independent validator
server/             Express + ws bridge; spawns main_optimizer.py, stores run history in server/data/
client/             React 19 + Three.js UI (STACKR design system)
data/               raw wtpack files and their provenance
docs/               DEMO.md, MOCK_DEFENSE_RESULTS.md, DEBUGGING_LOG.md
design/             the static STACKR mockup the UI was restyled from
archive/            retired scripts and notes
```

## Documents

- [docs/MOCK_DEFENSE_RESULTS.md](docs/MOCK_DEFENSE_RESULTS.md) — every number on the slides, with the run files and validator report behind it
- [docs/DEMO.md](docs/DEMO.md) — live-demo runbook and morning-of checks
- [docs/DEBUGGING_LOG.md](docs/DEBUGGING_LOG.md) — what went wrong along the way and what changed as a result
- [data/README.md](data/README.md) — dataset provenance and augmentation
- [PAGES.md](PAGES.md) — the client's pages and components
