# Mock-defense results — instance 350

| | |
|---|---|
| **commit** | see `experiments/results/environment.txt` (results generated at `8a919aa`, on `master`, after tag `demo-final`) |
| **instance** | 350 = wtpack1 index 50, class BR1 (3 box types), 129 boxes, 33 fragile (25.6%), container 587 × 233 × 220 cm |
| **augmentation** | greedy type-level fragility (bounds [0.20, 0.30]); 3 delivery stops; `stop_seed` = run seed |
| **parameters** | λ_w = λ_f = λ_b = λ_a = 0.20; `enforce_support` = `enforce_fragility` = on; R_max = 3; placement budget 20 M |
| **slide runs** | pop 10 × max_iter 300, seeds 1–5 (mean ± sd over seeds) |
| **live demo** | pop 10 × max_iter 60, seed 42 — what the UI reproduces on stage |
| **baselines** | one decode of a fixed order through the same decoder, evaluator and flags; first allowed orientation per box; random = 30 seeded orders |
| **validator** | `tools/validate_arrangement.py` — independent of `optimizer/`, run on every arrangement below |
| **files** | `experiments/results/slide_i350_s{1..5}.json`, `quick_i350_s42.json`, `baselines_i350.json`, `summary_i350.json` |

Wall-clock is per run, optimizer only (M-3). The five slide seeds ran as six
concurrent processes on a 12-thread laptop, so those times are roughly 2× the
idle figure; the demo row ran the same way.

## Comparison table (pop 10 × 300, seeds 1–5, mean ± sd)

| row | SU % | CSR % | C3 | C4 | C5 | C6 | placed /129 | wall s | independent validator |
|---|---|---|---|---|---|---|---|---|---|
| **DGWO** | **73.61 ± 3.12** | 59.24 ± 1.95 | 89.06 ± 2.07 | 100.00 ± 0.00 | 100.00 ± 0.00 | 64.41 ± 3.63 | 93.2 ± 1.6 | 127 ± 7 | agrees, 5/5 |
| **MOGWO** | 56.84 ± 3.66 | 75.60 ± 4.41 | 94.43 ± 2.92 | 100.00 ± 0.00 | 100.00 ± 0.00 | 77.38 ± 5.10 | 69.4 ± 4.3 | 126 ± 2 | agrees, 5/5 |
| **SEQ** | 58.60 ± 2.21 | 68.34 ± 2.52 | 91.41 ± 1.58 | 99.71 ± 0.58 | 100.00 ± 0.00 | 72.82 ± 2.24 | 72.2 ± 3.1 | 70 ± 10 | agrees, 5/5 |
| **REP** | 42.97 ± 1.93 | **100.00 ± 0.00** | 100.00 | 100.00 | 100.00 | 100.00 | 53.6 ± 2.7 | 603 ± 31 | **agrees, 5/5 — the 100% holds** |
| weight-descending | 61.24 | 63.16 | 100.00 | 100.00 | 100.00 | 63.16 | 57 | 0.01* | agrees |
| volume-descending | 61.24 | 63.16 | 100.00 | 100.00 | 100.00 | 63.16 | 57 | 0.01 | agrees |
| random (30 orders) | 49.99 ± 4.56 | 45.09 ± 5.31 | 78.29 | 99.84 | 100.00 | 54.02 | 67.3 ± 5.8 | 0.02 | agrees, 30/30 |

\* the recorded 1.38 s for weight-descending is the numba cache load on the
first call in the process; the decode itself is ~10 ms, as the volume row shows.

Weight- and volume-descending are the **same sequence** on this instance:
with three box types, the heaviest type is also the largest, so both sorts
rank the types identically.

## Verdict per configuration vs weight-descending (SU 61.24 / CSR 63.16)

| configuration | SU | margin | CSR | margin | verdict |
|---|---|---|---|---|---|
| DGWO | beats | **+12.37 pp** | loses | **−3.92 pp** | more load, slightly less compliant |
| MOGWO | loses | −4.40 pp | beats | **+12.44 pp** | less load, more compliant |
| SEQ | loses | −2.64 pp | beats | +5.18 pp | less load, more compliant |
| REP | loses | **−18.27 pp** | beats | +36.84 pp | feasibility at a large cost in load |

**No configuration beats the naive weight-sorted greedy on both metrics.**
The greedy already satisfies C3/C4/C5 on every placed box; its only
violations are stop-order (C6 = 63%). DGWO buys +12 pp of utilisation by
placing 36 more boxes, and pays for it with C3 dropping to 89% and C6 to
64%. The three constraint-oriented configurations pay 3–18 pp of utilisation
for their compliance gains.

Two further honest points:

- **A single principled decode beats the search's starting point.** The best
  of DGWO's ten random initial genomes averages 55.6% SU (Part F); the
  weight-sorted decode gives 61.2%. DGWO needs on the order of 30 iterations
  before its best-so-far passes the greedy.
- **The search is not decorative either.** Over 500 iterations DGWO gains
  +21.3 pp over its initial population, SEQ +17.1, REP +11.3, MOGWO +10.9
  (`experiments/convergence/`, Part F). Roughly a quarter of the final SU is
  search; three quarters is the decoder.

## Live demo reference (pop 10 × 60, seed 42)

These are the values the UI reproduces on stage (`tools/demo_check.py`
verifies DGWO's row before the session).

| configuration | SU % | CSR % | C3 | C4 | C5 | C6 | placed | wall s |
|---|---|---|---|---|---|---|---|---|
| DGWO | 62.40 | 50.62 | 85.19 | 98.77 | 100.00 | 58.02 | 81/129 | 27 |
| MOGWO | 49.83 | 68.75 | 89.06 | 100.00 | 100.00 | 75.00 | 64/129 | 22 |
| SEQ | 49.21 | 56.45 | 91.94 | 100.00 | 100.00 | 58.06 | 62/129 | 20 |
| REP | 44.09 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 57/129 | 202 |

At 60 iterations DGWO has not yet overtaken the greedy on SU (62.4 vs 61.2 —
within noise); at 300 it has, by 12 pp. If the panel asks why the live
number is lower than the slide, that is the answer.

DGWO's C4 = 98.77% here (one box) is the known one-directional asymmetry
in decode-time fragility enforcement, documented in
`docs/DEBUGGING_LOG.md` §8 and deliberately not fixed before the defense.

## Independent validation

`tools/compare_validators.py` reran every arrangement above — 5 seeds × 4
configurations, the seed-42 quartet, and all 32 baseline orders (56 in total)
— through a checker written from the Chapter 3 definitions that imports
nothing from `optimizer/`. It agrees with `evaluate_constraints` on C3, C4,
C5, C6 and the total in all 56 cases, and finds C1, C2 and
orientation/dimension consistency satisfied in all 56. In particular,
**REP's claimed 100% compliance holds under the independent validator on
all six of its arrangements.**

## Pop-30 convergence (Part J; single seed — treat as indicative)

`max_iter = 300` was chosen from pop-10 curves. Checked at the campaign's
pop 30 (max_iter 500, instance 350, seed 1, `experiments/convergence/*_pop30_s1_i350.csv`):

| cfg | pop 10: it₉₉ / final SU | pop 30: it₉₉ / final SU | SU at it 300 (pop 30) |
|---|---|---|---|
| DGWO | 231 / 75.52 | **214 / 82.45** | 83.01 (= final) |
| SEQ | 131 / 75.26 | 137 / 78.25 | 78.25 (= final) |
| MOGWO | 3 / 54.39 | 328 / 57.99 | 55.12 |

For DGWO and SEQ the 99%-of-final iteration is unchanged by population
size, so `max_iter = 300` holds at pop 30. MOGWO's is later (328), but its SU
curve is a side effect of a CSR-first return criterion and is not the metric
that choice was made on.

**The result that matters for the panel:** at the campaign setting
(pop 30 × 500) DGWO reaches **SU 82.45%, CSR 67.00%, 100/129 placed** —
above the weight-sorted greedy on *both* metrics (+21.2 pp SU, +3.8 pp CSR).
The "no configuration beats the greedy on both" verdict above is a
pop 10 × 300 result. One seed; the five-seed campaign at pop 30 is what
would make this claim citable.
