# Mock-defense results — instance 350

**All numbers on this page were generated after the C4 decode-time fix
(commit `42b1fe8`, branch `bugfix`, tag `tier2-done`). Everything produced
before it is superseded and kept only in the last section.**

| | |
|---|---|
| **commit** | see `experiments/results/environment.txt` |
| **instance** | 350 = wtpack1 index 50, class BR1 (3 box types), 129 boxes, 33 fragile (25.6%), container 587 × 233 × 220 cm |
| **augmentation** | greedy type-level fragility (bounds [0.20, 0.30]); 3 delivery stops; `stop_seed` = run seed |
| **parameters** | λ_w = λ_f = λ_b = λ_a = 0.20; `enforce_support` = `enforce_fragility` = on; R_max = 3; placement budget 20 M |
| **slide runs** | pop 10 × max_iter 300, seeds 1–5 (mean ± sd over seeds; sd = population sd) |
| **live demo** | pop 10 × max_iter 60, seed 42 — what the UI reproduces on stage; `tools/demo_check.py` reference |
| **campaign scale** | DGWO, pop 30 × max_iter 300, seeds 1–5 |
| **baselines** | one decode of a fixed order through the same decoder, evaluator and flags; first allowed orientation per box; random = 30 seeded orders |
| **validator** | `tools/validate_arrangement.py` — independent of `optimizer/`, run on every arrangement below (`experiments/results/validator_report.txt`) |
| **files** | `experiments/results/slide_i350_s{1..5}.json`, `quick_i350_s42.json`, `campaign_dgwo_i350_s{1..5}.json`, `baselines_i350.json`, `summary_i350.json` (rebuilt by `experiments/summarize_results.py`) |

Wall-clock is per run, optimizer only (M-3), **serial on an idle machine** —
these figures are reportable. (The superseded tables ran six processes at
once and were 2–6× slower.)

## Comparison table (pop 10 × 300, seeds 1–5, mean ± sd)

| row | SU % | CSR % (placed) | compliance, all boxes | C3 | C4 | C5 | C6 | placed /129 | wall s |
|---|---|---|---|---|---|---|---|---|---|
| **DGWO** | 73.44 ± 2.76 | 59.51 ± 7.53 | 42.33 ± 4.64 | 87.93 ± 2.50 | 100.00 ± 0.00 | 100.00 ± 0.00 | 67.03 ± 7.75 | 92.0 ± 4.5 | 21 ± 3 |
| **MOGWO** | 55.19 ± 2.14 | 74.33 ± 5.17 | 38.91 ± 2.70 | 94.11 ± 1.19 | 100.00 ± 0.00 | 100.00 ± 0.00 | 77.26 ± 6.44 | 67.6 ± 3.0 | 20 ± 1 |
| **SEQ** | 57.06 ± 3.27 | 68.91 ± 3.96 | 37.67 ± 2.62 | 93.62 ± 3.67 | 100.00 ± 0.00 | 100.00 ± 0.00 | 70.85 ± 3.24 | 70.6 ± 4.5 | 21 ± 1 |
| **REP** | 43.88 ± 1.79 | 100.00 ± 0.00 | 43.72 ± 2.38 | 100.00 ± 0.00 | 100.00 ± 0.00 | 100.00 ± 0.00 | 100.00 ± 0.00 | 56.4 ± 3.1 | 165 ± 17 |
| weight-descending | 61.24 | 63.16 | 27.91 | 100.00 | 100.00 | 100.00 | 63.16 | 57 | 0.22 |
| volume-descending | 61.24 | 63.16 | 27.91 | 100.00 | 100.00 | 100.00 | 63.16 | 57 | 0.00 |
| random (30 orders) | 49.95 ± 4.59 | 45.19 ± 5.29 | 23.44 ± 2.53 | 78.43 | 100.00 | 100.00 | 54.08 | 67.2 ± 5.9 | 0.00 |

*Compliance, all boxes* = CSR × placed / n_items per run, then averaged: the
denominator is all 129 boxes and an unplaced box counts as non-compliant
(Chapter 3 definition); CSR's denominator is the placed boxes only.

Independent validator: agrees with `evaluate_constraints` on C3–C6 and the
total for all 61 arrangements (20 slide + 4 quick + 5 campaign + 32
baselines); C1, C2 and orientation consistency hold in all 61; **C4 = 100.00
on every arrangement** — the decode-time fragility check is now
bidirectional, so nothing rests on a fragile box and no fragile box is
placed under an overhang.

Weight- and volume-descending are the **same sequence** on this instance:
with three box types, the heaviest type is also the largest.

### Compliance two ways

CSR (M-2) is computed over **placed** boxes. Chapter 3 defines compliance
over **all n boxes**, unplaced counting as non-compliant; that figure is
exactly CSR × placed / n (per run, then averaged over seeds) and is shown
beside CSR in the UI.

| cfg | CSR (placed) | placed | compliance over all 129 |
|---|---|---|---|
| DGWO | 59.51 | 92.0 | **42.33** |
| MOGWO | 74.33 | 67.6 | **38.91** |
| SEQ | 68.91 | 70.6 | **37.67** |
| REP | 100.00 | 56.4 | **43.72** |
| weight-descending | 63.16 | 57 | **27.91** |

Under the all-box definition REP's 100 % becomes 43.7 % — still the
highest, but only 1.4 pp ahead of DGWO (42.3 %), which reaches it by placing
36 more boxes at 59.5 % CSR. The greedy drops to 27.9 %.

## Verdict per configuration vs weight-descending (SU 61.24 / CSR 63.16)

| configuration | SU | margin | CSR | margin |
|---|---|---|---|---|
| DGWO | beats | +12.20 pp | loses | -3.64 pp |
| MOGWO | loses | -6.04 pp | beats | +11.18 pp |
| SEQ | loses | -4.17 pp | beats | +5.75 pp |
| REP | loses | -17.35 pp | beats | +36.84 pp |

**No configuration beats the naive weight-sorted greedy on both metrics at
pop 10 × 300.** The greedy satisfies C3/C4/C5 on every placed box; its only
violations are stop order. DGWO buys +12 pp of utilisation by placing
35 more boxes and pays with C3 at 88 %. The three constraint-oriented
configurations pay 4–17 pp of utilisation for their compliance gains.

## Live demo reference (pop 10 × 60, seed 42)

These are the values the UI reproduces on stage; `tools/demo_check.py`
verifies DGWO's row against `quick_i350_s42.json` before the session.

| configuration | SU % | CSR % | C3 | C4 | C5 | C6 | placed | wall s |
|---|---|---|---|---|---|---|---|---|
| DGWO | 64.32 | 43.82 | 84.27 | 100.00 | 100.00 | 50.56 | 89/129 | 5 |
| MOGWO | 50.84 | 59.09 | 90.91 | 100.00 | 100.00 | 62.12 | 66/129 | 4 |
| SEQ | 56.83 | 58.11 | 93.24 | 100.00 | 100.00 | 60.81 | 74/129 | 4 |
| REP | 44.29 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 55/129 | 33 |

At 60 iterations DGWO is +3.1 pp above the greedy on SU. C4 is 100 %
on every row (it was 98.77 % for DGWO before the fix).

## Campaign-scale DGWO (pop 30 × 300, seeds 1–5)

| seed | SU % | CSR % | C3 | C4 | C5 | C6 | placed | wall s |
|---|---|---|---|---|---|---|---|---|
| 1 | 79.27 | 60.00 | 89.47 | 100.00 | 100.00 | 65.26 | 95 | 69 |
| 2 | 79.87 | 47.06 | 86.27 | 100.00 | 100.00 | 54.90 | 102 | 64 |
| 3 | 77.81 | 60.00 | 88.42 | 100.00 | 100.00 | 65.26 | 95 | 65 |
| 4 | 74.73 | 66.67 | 88.89 | 100.00 | 100.00 | 77.78 | 99 | 72 |
| 5 | 77.54 | 54.55 | 89.90 | 100.00 | 100.00 | 62.63 | 99 | 67 |
| **mean ± sd** | **77.84 ± 1.79** | **57.65 ± 6.54** | 88.59 ± 1.26 | 100.00 ± 0.00 | 100.00 ± 0.00 | 65.17 ± 7.36 | 98.0 ± 2.7 | 67 ± 3 |

| metric | mean − sd | greedy | clears? | seeds above greedy |
|---|---|---|---|---|
| SU | 76.06 | 61.24 | **yes** (+14.82 pp) | 5/5 |
| CSR | 51.11 | 63.16 | **no** (-12.05 pp) | 1/5 |

Tripling the population adds +4.4 pp SU over the pop-10 row and clears the
greedy on utilisation on every seed; on compliance it is -5.5 pp against
the greedy with a spread larger than the margin — the defensible statement
remains "beats the greedy decisively on utilisation, matches it on
compliance".

## Per-seed slide rows

### DGWO
| seed | SU % | CSR % | C3 | C4 | C5 | C6 | placed | wall s |
|---|---|---|---|---|---|---|---|---|
| 1 | 72.93 | 61.05 | 87.37 | 100.00 | 100.00 | 71.58 | 95 | 18 |
| 2 | 74.01 | 48.35 | 90.11 | 100.00 | 100.00 | 54.95 | 91 | 21 |
| 3 | 73.08 | 55.91 | 88.17 | 100.00 | 100.00 | 61.29 | 93 | 26 |
| 4 | 77.91 | 60.82 | 83.51 | 100.00 | 100.00 | 71.13 | 97 | 22 |
| 5 | 69.27 | 71.43 | 90.48 | 100.00 | 100.00 | 76.19 | 84 | 20 |

### MOGWO
| seed | SU % | CSR % | C3 | C4 | C5 | C6 | placed | wall s |
|---|---|---|---|---|---|---|---|---|
| 1 | 58.83 | 67.12 | 93.15 | 100.00 | 100.00 | 69.86 | 73 | 22 |
| 2 | 55.01 | 80.88 | 95.59 | 100.00 | 100.00 | 85.29 | 68 | 19 |
| 3 | 54.28 | 79.10 | 92.54 | 100.00 | 100.00 | 83.58 | 67 | 20 |
| 4 | 55.59 | 74.24 | 93.94 | 100.00 | 100.00 | 77.27 | 66 | 19 |
| 5 | 52.25 | 70.31 | 95.31 | 100.00 | 100.00 | 70.31 | 64 | 21 |

### SEQ
| seed | SU % | CSR % | C3 | C4 | C5 | C6 | placed | wall s |
|---|---|---|---|---|---|---|---|---|
| 1 | 52.90 | 65.62 | 93.75 | 100.00 | 100.00 | 67.19 | 64 | 21 |
| 2 | 53.86 | 71.43 | 92.86 | 100.00 | 100.00 | 74.29 | 70 | 20 |
| 3 | 59.17 | 72.86 | 97.14 | 100.00 | 100.00 | 72.86 | 70 | 22 |
| 4 | 57.73 | 71.83 | 97.18 | 100.00 | 100.00 | 73.24 | 71 | 20 |
| 5 | 61.66 | 62.82 | 87.18 | 100.00 | 100.00 | 66.67 | 78 | 21 |

### REP
| seed | SU % | CSR % | C3 | C4 | C5 | C6 | placed | wall s |
|---|---|---|---|---|---|---|---|---|
| 1 | 40.77 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 53 | 172 |
| 2 | 42.97 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 57 | 170 |
| 3 | 45.14 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 53 | 140 |
| 4 | 45.38 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 61 | 190 |
| 5 | 45.16 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 58 | 153 |

## What the C4 fix changed

Means that moved by more than 1 pp against the superseded tables (full list
from `experiments/summarize_results.py --old`):

- Slide (pop 10 × 300): DGWO C3 −1.1, C6 +2.6, placed −1.2; MOGWO SU −1.7,
  CSR −1.3, placed −1.8; SEQ SU −1.5, C3 +2.2, C6 −2.0, placed −1.6; REP
  placed +2.8. SU and CSR means for DGWO and REP moved < 1 pp; every C4 is 100.
- Live demo (seed 42): every row is a different search trajectory now.
  DGWO SU 62.40 → 64.32, CSR 50.62 → 43.82, placed 81 → 89, C4 98.77 → 100;
  SEQ SU 49.21 → 56.83, placed 62 → 74; MOGWO CSR 68.75 → 59.09, C6 75.0 → 62.1.
- Campaign (pop 30 × 300): DGWO SU 81.60 → 77.84, CSR 62.74 → 57.65,
  placed 100.4 → 98.0.
- Baselines: weight/volume-descending unchanged; random C4 99.84 → 100.00.
- Wall-clock: serial idle runs are 2–6× faster than the concurrent figures.

The convergence CSVs in `experiments/convergence/` (Part F search share,
Part J pop-30 it₉₉) were **not** regenerated; treat them as pre-fix
indicative curves only.

---

# Superseded (pre-C4-fix) — do not cite

Generated at `8a919aa`/`e2f2725` with the one-directional decode-time
fragility check (C4 could fall below 100 % with enforcement on). Kept for
traceability only; every heading below is demoted one level.


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

### Comparison table (pop 10 × 300, seeds 1–5, mean ± sd)

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

### Verdict per configuration vs weight-descending (SU 61.24 / CSR 63.16)

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

### Live demo reference (pop 10 × 60, seed 42)

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

### Independent validation

`tools/compare_validators.py` reran every arrangement above — 5 seeds × 4
configurations, the seed-42 quartet, and all 32 baseline orders (56 in total)
— through a checker written from the Chapter 3 definitions that imports
nothing from `optimizer/`. It agrees with `evaluate_constraints` on C3, C4,
C5, C6 and the total in all 56 cases, and finds C1, C2 and
orientation/dimension consistency satisfied in all 56. In particular,
**REP's claimed 100% compliance holds under the independent validator on
all six of its arrangements.**

### Pop-30 convergence (Part J; single seed — treat as indicative)

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

### Campaign-scale DGWO (pop 30 × 300, seeds 1–5)

The five-seed check the pop-30 section above asked for. Same instance,
λ = 0.20, both enforce flags on; `experiments/results/campaign_dgwo_i350_s{1..5}.json`.
The five seeds ran as five concurrent processes, so wall-clock is again ≈ 2× idle.

| seed | SU % | CSR % | C3 | C4 | C5 | C6 | placed /129 | wall s |
|---|---|---|---|---|---|---|---|---|
| 1 | 82.16 | 64.71 | 92.16 | 100.00 | 100.00 | 71.57 | 102 | 266 |
| 2 | 79.23 | 54.08 | 89.80 | 100.00 | 100.00 | 60.20 | 98 | 265 |
| 3 | 80.47 | 68.69 | 90.91 | 100.00 | 100.00 | 73.74 | 99 | 268 |
| 4 | 81.77 | 65.66 | 90.91 | 100.00 | 100.00 | 68.69 | 99 | 261 |
| 5 | 84.38 | 60.58 | 90.38 | 100.00 | 100.00 | 65.38 | 104 | 261 |
| **mean ± sd** | **81.60 ± 1.93** | **62.74 ± 5.64** | 90.83 ± 0.87 | 100.00 ± 0.00 | 100.00 ± 0.00 | 67.92 ± 5.33 | 100.40 ± 2.51 | 264 ± 3 |

`tools/compare_validators.py`: independent validator agrees with
`evaluate_constraints` on C3–C6 and the total for all 5 arrangements; C1, C2
and orientation consistency hold in all 5.

#### Against the weight-descending greedy (SU 61.24 / CSR 63.16)

| metric | mean − sd | greedy | clears? | seeds above greedy |
|---|---|---|---|---|
| SU | 79.67 | 61.24 | **yes** (+18.43 pp) | 5/5 |
| CSR | 57.10 | 63.16 | **no** (-6.06 pp) | 3/5 |

At the campaign setting DGWO clears the greedy on SU by a wide margin —
every seed, and the lower end of the band by ~18 pp. On CSR it does
**not**: the mean sits 0.42 pp below the greedy, the spread
(sd 5.64) is larger than the margin, 3/5 seeds are above and
mean − sd falls 6.06 pp below. The single-seed "beats the greedy on
both" observation in the pop-30 section (seed 1, 500 iterations, CSR 67.0) was
one seed landing on the high side of the CSR band. The defensible statement is: **at pop 30 × 300, DGWO beats
the greedy decisively on utilisation and matches it on compliance (no
significant difference across five seeds).** The pop-10 verdict
"no configuration beats the greedy on both" is superseded for DGWO only in
the sense that the CSR loss disappears; it is not converted into a win.

Compared with the pop-10 × 300 row (73.61 ± 3.12 / 59.24 ± 1.95), tripling
the population adds +7.99 pp SU and +3.50 pp CSR at ≈ 2× the
wall-clock per iteration.
