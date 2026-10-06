# Diagnostic — convergence, diversity and repair at the Thesis preset

Diagnostic only: no optimizer, decoder, repair or evaluator code was changed, and Study A, Study B and `tools/determinism_reference.json` are untouched. Produced by `experiments/diagnostic_convergence.py`; per-run data in `experiments/results/diagnostics/convergence_thesis/` (`runs/*.json`, `summary.json`).

**Setup.** Pop 30 × 300 iterations (Thesis preset), seeds 1–5, λ = 0.20 (all four), C4/C5 enforced at decode (`experiments/calibration.json`), stop seed 42, 3 stops. Instances: BR1 = 413 (105 boxes), BR4 = 185 (119 boxes), BR7 = 174 (130 boxes) — the first instance of each class in `experiments/sample30_seed42.json` (185 and 174 are also Study B instances). Serial, one fresh process per run, numba warmed untimed. 60 runs; independent validator disagreements: 0. The instrumented classes reproduce all 8 reference hashes (`--check`), so the runs are the unmodified methods. Environment: Linux-6.18.44-fc-v70-x86_64-with-glibc2.39, 4 vCPU, Python 3.13.16, numba 0.68.0, NumPy 2.5.3 (Studies A and B used Python 3.11.15; the hashes match on both). Run times are instrumented and serial on this container, for relative comparison only.

**Definitions.** *Best-so-far SU* = running maximum, per seed, of the SU of the solution the configuration would return if stopped at that iteration (DGWO: α by scalar fitness; MOGWO, SEQ, REP: highest-SU archive member), then averaged over the 5 seeds. *Stops improving* = last iteration at which that mean curve rises. *Diversity* = mean over the 435 wolf pairs of the normalised Kendall tau distance between loading orders (stable argsort of the n sequence keys, as the decoder builds it): 0 = identical orders, ≈ 0.5 = unrelated orders.

## 1. Best-so-far SU and where it stops improving

| class | config | SU @1 | @10 | @25 | @50 | @100 | @150 | @200 | @300 | stops improving (mean curve) | per seed | 95 % / 99 % of gain by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BR1 | DGWO | 52.88 | 60.47 | 63.05 | 63.80 | 65.76 | 66.78 | 67.22 | 68.31 | 257 | 222, 182, 238, 113, 257 | 224 / 257 |
| BR1 | MOGWO | 53.82 | 57.60 | 59.20 | 60.68 | 62.41 | 63.66 | 64.37 | 64.92 | 293 | 119, 172, 293, 216, 220 | 172 / 293 |
| BR1 | SEQ | 52.88 | 60.47 | 63.05 | 63.80 | 65.76 | 66.78 | 67.22 | 67.42 | 241 | 131, 156, 241, 113, 200 | 131 / 205 |
| BR1 | REP | 21.21 | 26.48 | 27.36 | 28.92 | 30.42 | 31.45 | 32.59 | 34.86 | 290 | 290, 266, 290, 278, 256 | 279 / 290 |
| BR4 | DGWO | 60.14 | 65.36 | 68.61 | 70.59 | 72.13 | 73.47 | 75.27 | 75.92 | 238 | 100, 238, 223, 180, 211 | 196 / 228 |
| BR4 | MOGWO | 58.78 | 62.04 | 63.88 | 65.32 | 67.06 | 67.89 | 68.16 | 68.64 | 265 | 265, 72, 173, 180, 157 | 180 / 265 |
| BR4 | SEQ | 60.14 | 65.36 | 68.61 | 70.59 | 72.13 | 73.47 | 74.06 | 74.32 | 239 | 100, 132, 157, 239, 216 | 157 / 216 |
| BR4 | REP | 20.45 | 24.66 | 26.16 | 26.67 | 29.68 | 30.37 | 31.70 | 34.86 | 293 | 284, 278, 287, 293, 259 | 269 / 287 |
| BR7 | DGWO | 50.33 | 57.76 | 59.28 | 60.94 | 62.71 | 63.69 | 64.57 | 66.71 | 258 | 225, 211, 244, 258, 253 | 223 / 253 |
| BR7 | MOGWO | 50.82 | 54.64 | 56.17 | 57.18 | 58.41 | 59.07 | 59.34 | 59.89 | 248 | 237, 125, 209, 248, 164 | 209 / 248 |
| BR7 | SEQ | 50.33 | 57.76 | 59.28 | 60.94 | 62.71 | 63.69 | 63.77 | 63.98 | 253 | 140, 150, 51, 253, 125 | 140 / 253 |
| BR7 | REP | 18.07 | 22.32 | 24.13 | 24.56 | 25.16 | 25.33 | 25.75 | 29.45 | 294 | 289, 284, 294, 292, 290 | 289 / 293 |

The incumbent itself is not monotone: average number of iterations per run in which the returned-criterion SU fell (DGWO's α is re-chosen from the moved population; archive pruning can drop the top-SU member):

| class | DGWO | MOGWO | SEQ | REP |
|---|---|---|---|---|
| BR1 | 105.8 | 0.0 | 69.4 | 0.0 |
| BR4 | 109.4 | 0.0 | 72.8 | 0.0 |
| BR7 | 116.4 | 0.0 | 74.0 | 0.0 |

Highest SU of *any* wolf evaluated so far (ignores the return criterion; REP: after repair), mean of 5 seeds, at 300 and its last rise:

| class | DGWO | MOGWO | SEQ | REP |
|---|---|---|---|---|
| BR1 | 68.33 (it 257) | 64.92 (it 293) | 67.42 (it 241) | 34.86 (it 290) |
| BR4 | 75.92 (it 238) | 68.64 (it 265) | 74.32 (it 239) | 34.86 (it 293) |
| BR7 | 66.74 (it 258) | 59.89 (it 248) | 63.98 (it 253) | 29.45 (it 294) |

## 2. Population diversity (mean pairwise Kendall tau distance of loading orders)

| class | config | init | @1 | @5 | @10 | @25 | @50 | @100 | @150 | @200 | @300 | first iter < 0.05 | keys on ±5 bound @300 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BR1 | DGWO | 0.499 | 0.407 | 0.268 | 0.233 | 0.194 | 0.134 | 0.051 | 0.020 | 0.011 | 0.000 | 101 | 0.0 % |
| BR1 | MOGWO | 0.499 | 0.414 | 0.299 | 0.284 | 0.228 | 0.201 | 0.124 | 0.072 | 0.042 | 0.000 | 187 | 0.0 % |
| BR1 | SEQ | 0.499 | 0.407 | 0.268 | 0.233 | 0.194 | 0.134 | 0.051 | 0.020 | 0.012 | 0.000 | 101 | 0.0 % |
| BR1 | REP | 0.499 | 0.415 | 0.256 | 0.221 | 0.158 | 0.120 | 0.070 | 0.045 | 0.028 | 0.000 | 135 | 0.0 % |
| BR4 | DGWO | 0.501 | 0.418 | 0.271 | 0.237 | 0.184 | 0.134 | 0.048 | 0.018 | 0.011 | 0.000 | 96 | 0.0 % |
| BR4 | MOGWO | 0.501 | 0.412 | 0.305 | 0.279 | 0.235 | 0.202 | 0.127 | 0.072 | 0.048 | 0.000 | 189 | 0.1 % |
| BR4 | SEQ | 0.501 | 0.418 | 0.271 | 0.237 | 0.184 | 0.134 | 0.048 | 0.018 | 0.011 | 0.000 | 96 | 0.0 % |
| BR4 | REP | 0.501 | 0.414 | 0.265 | 0.212 | 0.165 | 0.117 | 0.058 | 0.034 | 0.021 | 0.000 | 113 | 0.2 % |
| BR7 | DGWO | 0.499 | 0.408 | 0.270 | 0.230 | 0.185 | 0.133 | 0.046 | 0.019 | 0.011 | 0.000 | 98 | 0.0 % |
| BR7 | MOGWO | 0.499 | 0.411 | 0.318 | 0.290 | 0.252 | 0.221 | 0.156 | 0.081 | 0.051 | 0.000 | 201 | 0.0 % |
| BR7 | SEQ | 0.499 | 0.408 | 0.270 | 0.230 | 0.185 | 0.133 | 0.046 | 0.019 | 0.012 | 0.000 | 98 | 0.0 % |
| BR7 | REP | 0.499 | 0.407 | 0.268 | 0.212 | 0.166 | 0.122 | 0.076 | 0.050 | 0.032 | 0.000 | 150 | 0.0 % |

## 3. SU minus the Weight-Sorted Greedy

Greedy = one pass of the same decoder, heaviest box first, first allowed orientation (`experiments/baselines.py`). Configuration SU = mean of the 5 seeds' returned solutions.

| class | greedy SU | DGWO SU | MOGWO SU | SEQ SU | REP SU | DGWO − greedy (pp) | MOGWO − greedy (pp) | SEQ − greedy (pp) | REP − greedy (pp) |
|---|---|---|---|---|---|---|---|---|---|
| BR1 | 23.11 | 66.96 ± 3.70 | 64.92 ± 0.92 | 67.27 ± 1.92 | 34.86 ± 2.93 | +43.85 | +41.82 | +44.16 | +11.75 |
| BR4 | 75.61 | 75.01 ± 2.94 | 68.64 ± 3.35 | 74.09 ± 1.82 | 34.86 ± 4.67 | -0.60 | -6.97 | -1.52 | -40.75 |
| BR7 | 45.87 | 65.86 ± 1.78 | 59.89 ± 3.23 | 63.63 ± 1.25 | 29.45 ± 1.97 | +19.99 | +14.02 | +17.76 | -16.42 |

Per seed (pp): BR1 DGWO [+47.9, +38.6, +42.5, +43.4, +46.9], MOGWO [+41.6, +41.7, +41.6, +40.9, +43.4], SEQ [+46.7, +41.4, +44.6, +43.5, +44.6], REP [+12.1, +14.7, +6.8, +12.7, +12.4]; BR4 DGWO [-5.1, +2.7, +0.1, +0.8, -1.5], MOGWO [-4.3, -4.6, -7.4, -12.5, -6.1], SEQ [-4.0, -2.0, -1.6, +1.1, -1.1], REP [-40.8, -46.4, -44.2, -36.6, -35.7]; BR7 DGWO [+21.4, +18.7, +17.6, +21.8, +20.4], MOGWO [+9.4, +16.1, +13.0, +17.9, +13.7], SEQ [+18.8, +15.9, +17.0, +18.5, +18.5], REP [-17.3, -19.3, -14.0, -15.7, -16.0]

For context (not asked): greedy CSR over placed / over all boxes and placed count, and the configurations' mean CSR over placed boxes:

| class | greedy CSR placed | greedy CSR all | greedy placed | DGWO CSR | MOGWO CSR | SEQ CSR | REP CSR |
|---|---|---|---|---|---|---|---|
| BR1 | 40.00 | 7.62 | 20/105 | 53.55 | 47.65 | 46.80 | 100.00 |
| BR4 | 36.49 | 22.69 | 74/119 | 49.32 | 36.87 | 40.40 | 100.00 |
| BR7 | 36.36 | 12.31 | 44/130 | 42.70 | 39.78 | 38.51 | 100.00 |

## 4. REP: what repair does per call, and what it costs

One repair call per evaluated wolf (30 + 30 × 300 = 9030 per run). *Relocated* = boxes moved to another feasible position by R1 (weight) or R2 (stop order). *Taken out* = boxes leaving the container: deferred by R1/R2 (no feasible position) plus removed by R3.

| class | placed by decoder | relocated R1 | relocated R2 | deferred R1 | deferred R2 | removed R3 | **relocated** | **taken out** | calls relocating ≥1 | calls taking out ≥1 | passes | R_MAX hit | repair share of run time | run time (s) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BR1 | 53.6 | 3.13 | 3.55 | 7.33 | 15.56 | 5.72 | **6.69** | **28.61** | 99.7 % | 100.0 % | 4.99 | 99.8 % | **79.6 %** (81.5, 79.2, 78.3, 79.7, 79.4) | 239 |
| BR4 | 77.9 | 2.55 | 4.69 | 4.96 | 30.72 | 12.62 | **7.24** | **48.30** | 99.2 % | 100.0 % | 5.00 | 100.0 % | **84.7 %** (84.6, 84.0, 84.5, 85.2, 85.2) | 470 |
| BR7 | 59.7 | 2.13 | 2.45 | 6.29 | 22.53 | 9.31 | **4.59** | **38.13** | 98.1 % | 100.0 % | 5.00 | 100.0 % | **78.6 %** (77.6, 78.4, 78.0, 79.6, 79.4) | 284 |

Run time of all four configurations (s, mean of 5 serial runs, instrumented):

| class | DGWO | MOGWO | SEQ | REP |
|---|---|---|---|---|
| BR1 | 52 | 51 | 52 | 239 |
| BR4 | 75 | 72 | 73 | 470 |
| BR7 | 69 | 66 | 67 | 284 |

## 5. MOGWO and SEQ: final archive

The reported solution is the highest-SU archive member; the highest-CSR member is the other end of the front (ties on CSR broken by SU). Means over 5 seeds; CSR over placed boxes, "CSR all" = CSR × placed / n.

| class | config | archive size (per seed) | reported: SU | CSR | CSR all | placed | best-CSR: SU | CSR | CSR all | placed |
|---|---|---|---|---|---|---|---|---|---|---|
| BR1 | MOGWO | 12.4 (18, 9, 12, 11, 12) | 64.92 | 47.65 | 33.33 | 73.4 | 53.79 | 67.53 | 37.90 | 59.0 |
| BR1 | SEQ | 30.2 (3, 15, 100, 3, 30) | 67.27 | 46.80 | 34.10 | 76.6 | 61.89 | 61.75 | 41.14 | 70.4 |
| BR1 | REP (for reference) | 100.0 (100, 100, 100, 100, 100) | 34.86 | 100.00 | 38.86 | 40.8 | 34.86 | 100.00 | 38.86 | 40.8 |
| BR4 | MOGWO | 12.0 (8, 16, 13, 12, 11) | 68.64 | 36.87 | 28.07 | 90.6 | 56.51 | 57.16 | 36.30 | 75.6 |
| BR4 | SEQ | 21.4 (14, 24, 17, 19, 33) | 74.09 | 40.40 | 32.10 | 94.6 | 68.47 | 55.08 | 39.83 | 86.2 |
| BR4 | REP (for reference) | 100.0 (100, 100, 100, 100, 100) | 34.86 | 100.00 | 40.17 | 47.8 | 34.86 | 100.00 | 40.17 | 47.8 |
| BR7 | MOGWO | 11.6 (10, 10, 18, 11, 9) | 59.89 | 39.78 | 24.62 | 80.4 | 47.81 | 64.51 | 32.00 | 64.4 |
| BR7 | SEQ | 39.4 (100, 19, 24, 22, 32) | 63.63 | 38.51 | 24.62 | 83.0 | 54.01 | 58.06 | 30.77 | 69.0 |
| BR7 | REP (for reference) | 85.6 (100, 59, 100, 100, 69) | 29.45 | 100.00 | 30.92 | 40.2 | 29.45 | 100.00 | 30.92 | 40.2 |

Per seed (SU / CSR of reported → best-CSR member):

- BR1 MOGWO: s1 (n=18) 64.7/44.6 → 58.1/73.0; s2 (n=9) 64.8/51.4 → 53.7/66.1; s3 (n=12) 64.7/54.1 → 46.2/70.8; s4 (n=11) 64.0/43.1 → 59.0/65.2; s5 (n=12) 66.5/45.2 → 52.0/62.5
- BR1 SEQ: s1 (n=3) 69.8/44.3 → 67.6/49.4; s2 (n=15) 64.5/51.4 → 55.5/73.8; s3 (n=100) 67.7/42.9 → 64.5/63.5; s4 (n=3) 66.6/53.9 → 60.9/60.9; s5 (n=30) 67.7/41.6 → 60.9/61.2
- BR4 MOGWO: s1 (n=8) 71.4/40.0 → 58.1/57.1; s2 (n=16) 71.1/34.8 → 59.6/62.3; s3 (n=13) 68.2/39.6 → 54.3/55.8; s4 (n=12) 63.1/32.2 → 51.5/53.2; s5 (n=11) 69.5/37.8 → 59.1/57.3
- BR4 SEQ: s1 (n=14) 71.6/41.8 → 66.0/58.4; s2 (n=24) 73.6/33.7 → 67.7/54.1; s3 (n=17) 74.0/44.7 → 68.2/54.5; s4 (n=19) 76.7/43.8 → 71.5/53.3; s5 (n=33) 74.5/38.1 → 69.0/54.9
- BR7 MOGWO: s1 (n=10) 55.3/39.7 → 46.3/63.6; s2 (n=10) 62.0/42.9 → 55.4/64.9; s3 (n=18) 58.8/41.6 → 43.0/63.9; s4 (n=11) 63.8/39.3 → 52.1/67.2; s5 (n=9) 59.5/35.4 → 42.3/63.0
- BR7 SEQ: s1 (n=100) 64.7/38.8 → 55.5/54.8; s2 (n=19) 61.8/35.0 → 49.7/55.6; s3 (n=24) 62.9/36.6 → 55.6/60.9; s4 (n=22) 64.4/41.7 → 53.3/65.7; s5 (n=32) 64.4/40.5 → 55.9/53.4

