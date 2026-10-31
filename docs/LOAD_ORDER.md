# Loading-sequence rule (REP only)

Code: `apply_load_order` in `optimizer/thesis_algorithms.py`. Switch: `RepairBasedHybrid(load_order=True)`,
`--load-order / --no-load-order` on `main_optimizer.py` and `study.py` (default on; part of the study
settings, the resume spec and the chunk-merge check, like `edge_fill` and `fragile_lift`). Tests:
`tools/test_load_order.py`. Pilot: `tools/pilot_load_order.py`.

## Rule

After `decode_position(X, items, container)` returns the sequence, REP reorders it with a stable sort by
`(-items[i]['stop'], items[i]['fragile'])`: the last stop is loaded first and, inside each stop, fragile boxes
come last. The wolf's order inside each (stop, fragile) group and all orientations are kept. It acts on every
wolf evaluated during the search (not only on the returned arrangement), so REP's search changes with it.
DGWO, MOGWO and SEQ never reorder; their reference hashes in `tools/determinism_reference.json` are
unchanged. Only the two REP hashes were regenerated; REP with `load_order=False` reproduces the old REP
hashes exactly. R1–R3, R4 and R5 are unchanged and still run: C1–C6 are checked and enforced exactly as before.

## Methodology

Loading the last-delivered stop first is standard practice in vehicle loading: what is delivered first must be
reachable, so it goes in last and on top, and cargo for later stops goes in first and underneath. Loading the last stop first means a
box of a later stop is never placed after, and so never lands on top of, a box of an earlier stop. This makes C6
(stop order) violations rare, not impossible: an earlier-stop box that is loaded later can still fill a hole deeper
in the truck and be blocked from the door by boxes already placed. R2 (relocate or defer) and R3 (remove) therefore
stay in place and still do that work; CSR is 100 in every run below because of them, not because of the order alone.
Within a stop, putting fragile boxes
last means they are placed after the boxes that could carry them, near the top of their stop's stacks. Nothing
may rest on a fragile box (C4), so a fragile box on the floor or low in a stack leaves a column of dead space above
it; loaded last, fragile boxes tend to end on top and the column above them is short. The price is that a
fragile box is only placed if space is left when its turn comes.

## Pilot

Instances 581, 413, 147, 392, 454 (stop seed 42, three stops), REP seeds 3 and 42, lambda 0.20, C4/C5 enforced,
R4 and R5 on in both rows. Each row is a separate full run (the rule changes the search). "Fill" is SU of the
returned arrangement. "Fragile placed" is out of all fragile boxes in the instance. "Dead above fragile" is the
share of the container volume above placed fragile boxes. M-7 is the left–right mass imbalance. R5 acc/tried is
accepted / tried moves; R5 +boxes, boxes R5 added; R5 dead before→after is the dead share at R5's start and end.
R4 isolated is the isolated-box count at R4's start and end. Time is the wall time of `run()` with four runs
sharing a 4-core machine, so it is indicative only (the rule on and off were run under the same load).

### Quick preset (population 10, 60 iterations)

| inst | seed | rule | placed | fill % | CSR % | fragile placed | fragile on floor | dead above fragile % | M-7 % | isolated | R5 acc/tried | R5 +boxes | R5 dead before→after % | R4 +boxes | R4 isolated before→after | time s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 581 | 3 | off | 34 | 47.25 | 100 | 10/31 | 7 | 20.7 | 4.2 | 5 | 4/20 | 0 | 31.4→20.7 | 0 | 6→5 | 10 |
| 581 | 3 | on | 39 | 60.56 | 100 | 4/31 | 2 | 6.3 | 3.6 | 3 | 0/4 | 0 | 6.3→6.3 | 0 | 3→3 | 8 |
| 581 | 42 | off | 36 | 51.73 | 100 | 11/31 | 9 | 33.9 | 9.2 | 4 | 0/11 | 0 | 33.9→33.9 | 0 | 6→4 | 9 |
| 581 | 42 | on | 40 | 63.52 | 100 | 3/31 | 1 | 6.5 | 10.0 | 4 | 0/3 | 0 | 6.5→6.5 | 0 | 4→4 | 8 |
| 413 | 3 | off | 54 | 44.89 | 100 | 12/37 | 9 | 25.1 | 15.1 | 3 | 0/12 | 0 | 25.1→25.1 | 0 | 17→3 | 21 |
| 413 | 3 | on | 67 | 56.31 | 100 | 4/37 | 1 | 6.4 | 17.2 | 7 | 1/8 | 0 | 8.1→6.4 | 0 | 7→7 | 22 |
| 413 | 42 | off | 58 | 51.50 | 100 | 15/37 | 10 | 20.9 | 1.4 | 2 | 2/44 | 2 | 22.2→20.9 | 0 | 7→2 | 24 |
| 413 | 42 | on | 67 | 58.15 | 100 | 8/37 | 1 | 4.1 | 3.2 | 5 | 0/8 | 0 | 4.1→4.1 | 1 | 22→5 | 20 |
| 147 | 3 | off | 54 | 46.81 | 100 | 10/36 | 5 | 18.9 | 1.6 | 7 | 1/20 | 0 | 20.8→18.9 | 0 | 9→7 | 22 |
| 147 | 3 | on | 64 | 53.24 | 100 | 5/36 | 2 | 10.9 | 17.3 | 13 | 0/5 | 0 | 10.9→10.9 | 1 | 18→13 | 19 |
| 147 | 42 | off | 53 | 44.96 | 100 | 12/36 | 8 | 23.5 | 1.0 | 1 | 1/24 | 0 | 24.1→23.5 | 0 | 11→1 | 21 |
| 147 | 42 | on | 65 | 55.68 | 100 | 5/36 | 3 | 10.9 | 12.7 | 6 | 0/5 | 0 | 10.9→10.9 | 0 | 9→6 | 16 |
| 392 | 3 | off | 62 | 50.20 | 100 | 14/43 | 10 | 24.6 | 6.5 | 0 | 4/37 | 2 | 27.2→23.2 | 1 | 0→0 | 24 |
| 392 | 3 | on | 72 | 58.84 | 100 | 2/43 | 0 | 0.7 | 5.7 | 6 | 0/2 | 0 | 0.7→0.7 | 0 | 11→6 | 19 |
| 392 | 42 | off | 58 | 46.94 | 100 | 12/43 | 6 | 23.0 | 24.8 | 2 | 2/36 | 1 | 24.6→23.0 | 0 | 11→2 | 25 |
| 392 | 42 | on | 75 | 61.18 | 100 | 4/43 | 2 | 6.7 | 4.0 | 3 | 0/4 | 0 | 6.7→6.7 | 0 | 8→3 | 18 |
| 454 | 3 | off | 86 | 42.39 | 100 | 13/41 | 3 | 11.4 | 12.4 | 20 | 5/26 | 1 | 15.8→11.4 | 0 | 27→20 | 57 |
| 454 | 3 | on | 116 | 52.89 | 100 | 13/41 | 1 | 7.5 | 16.0 | 46 | 3/26 | 1 | 8.2→7.5 | 1 | 64→46 | 61 |
| 454 | 42 | off | 86 | 41.90 | 100 | 15/41 | 7 | 20.1 | 0.2 | 21 | 2/30 | 0 | 21.2→20.1 | 0 | 25→21 | 60 |
| 454 | 42 | on | 115 | 49.39 | 100 | 11/41 | 0 | 7.5 | 4.7 | 34 | 1/22 | 0 | 7.7→7.5 | 3 | 45→34 | 62 |

### Thesis preset (population 30, 300 iterations)

| inst | seed | rule | placed | fill % | CSR % | fragile placed | fragile on floor | dead above fragile % | M-7 % | isolated | R5 acc/tried | R5 +boxes | R5 dead before→after % | R4 +boxes | R4 isolated before→after | time s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 581 | 3 | off | 36 | 54.03 | 100 | 7/31 | 5 | 19.3 | 7.4 | 5 | 0/7 | 0 | 19.3→19.3 | 0 | 5→5 | 98 |
| 581 | 3 | on | 42 | 65.97 | 100 | 5/31 | 3 | 8.2 | 5.7 | 4 | 0/5 | 0 | 8.2→8.2 | 0 | 9→4 | 91 |
| 581 | 42 | off | 36 | 53.47 | 100 | 9/31 | 6 | 25.1 | 3.7 | 3 | 0/9 | 0 | 25.1→25.1 | 0 | 3→3 | 104 |
| 581 | 42 | on | 39 | 61.47 | 100 | 7/31 | 3 | 10.3 | 4.0 | 4 | 0/7 | 0 | 10.3→10.3 | 0 | 4→4 | 101 |
| 413 | 3 | off | 62 | 53.25 | 100 | 15/37 | 6 | 15.7 | 11.7 | 8 | 3/41 | 1 | 19.5→14.5 | 1 | 16→8 | 258 |
| 413 | 3 | on | 69 | 59.14 | 100 | 6/37 | 3 | 8.9 | 19.4 | 2 | 0/6 | 0 | 8.9→8.9 | 0 | 2→2 | 251 |
| 413 | 42 | off | 53 | 49.25 | 100 | 16/37 | 8 | 27.4 | 2.6 | 5 | 0/16 | 0 | 27.4→27.4 | 0 | 9→5 | 264 |
| 413 | 42 | on | 72 | 61.94 | 100 | 7/37 | 2 | 5.2 | 0.0 | 9 | 0/7 | 0 | 5.2→5.2 | 0 | 12→9 | 258 |
| 147 | 3 | off | 58 | 48.43 | 100 | 10/36 | 8 | 24.4 | 3.3 | 1 | 1/20 | 0 | 25.9→24.4 | 0 | 5→1 | 239 |
| 147 | 3 | on | 74 | 63.34 | 100 | 3/36 | 0 | 2.6 | 13.1 | 4 | 0/3 | 0 | 2.6→2.6 | 0 | 11→4 | 216 |
| 147 | 42 | off | 63 | 53.69 | 100 | 9/36 | 3 | 14.4 | 0.3 | 4 | 1/18 | 0 | 16.3→14.4 | 0 | 6→4 | 259 |
| 147 | 42 | on | 73 | 61.40 | 100 | 4/36 | 1 | 5.8 | 2.2 | 1 | 1/6 | 0 | 6.0→4.5 | 2 | 9→1 | 223 |
| 392 | 3 | off | 58 | 46.99 | 100 | 10/43 | 7 | 18.7 | 7.0 | 1 | 3/20 | 0 | 22.6→18.7 | 0 | 5→1 | 256 |
| 392 | 3 | on | 81 | 66.18 | 100 | 2/43 | 2 | 5.3 | 6.3 | 5 | 0/2 | 0 | 5.3→5.3 | 1 | 5→5 | 233 |
| 392 | 42 | off | 59 | 47.65 | 100 | 14/43 | 7 | 29.5 | 8.7 | 4 | 0/14 | 0 | 29.5→29.5 | 0 | 11→4 | 265 |
| 392 | 42 | on | 81 | 66.09 | 100 | 4/43 | 1 | 6.1 | 6.0 | 10 | 1/7 | 1 | 6.0→6.1 | 0 | 15→10 | 236 |
| 454 | 3 | off | 82 | 43.54 | 100 | 17/41 | 6 | 25.6 | 31.5 | 20 | 3/34 | 0 | 26.9→25.6 | 1 | 25→20 | 685 |
| 454 | 3 | on | 113 | 52.22 | 100 | 13/41 | 2 | 8.5 | 18.9 | 27 | 2/26 | 0 | 9.0→8.5 | 0 | 31→27 | 772 |
| 454 | 42 | off | 100 | 46.92 | 100 | 14/41 | 6 | 14.7 | 13.5 | 26 | 0/14 | 0 | 14.7→14.7 | 0 | 31→26 | 683 |
| 454 | 42 | on | 107 | 52.54 | 100 | 13/41 | 0 | 7.1 | 8.9 | 24 | 3/39 | 0 | 7.6→7.1 | 0 | 30→24 | 775 |


### Summary (means over the 10 runs per row)

| preset | rule | placed | fill % | fragile placed | fragile on floor | dead above fragile % | M-7 % | isolated |
|---|---|---|---|---|---|---|---|---|
| quick | off | 58.1 | 46.9 | 12.4 | 7.4 | 22.2 | 7.6 | 6.5 |
| quick | on | 72.0 | 57.0 | 5.9 | 1.3 | 6.8 | 9.4 | 12.7 |
| thesis | off | 60.7 | 49.7 | 12.1 | 6.2 | 21.5 | 9.0 | 7.7 |
| thesis | on | 75.1 | 61.0 | 6.4 | 1.7 | 6.8 | 8.5 | 9.0 |

What the table shows:

* Fill rises in all 20 pairs (+6.4 to +14.2 points at the quick preset, +5.6 to +19.2 at the thesis preset) and
  placed rises in all 20. CSR is 100 in all 40 runs.
* Fewer fragile boxes are loaded: fewer in 19 of 20 pairs, equal in one (454 seed 3, quick). On average about half as
  many fragile boxes are placed. This is a real cost for a study that cares about carrying fragile cargo: part of the
  fill gain comes from leaving fragile boxes behind.
* Fragile boxes on the floor and dead space above fragile boxes drop sharply (dead space about 22 % → 7 % of the truck).
* M-7 is mixed: lower on average at the thesis preset, higher at the quick preset, and clearly worse in individual
  runs (e.g. 147 seed 3: 1.6 → 17.3 % quick, 3.3 → 13.1 % thesis; 413 seed 3 thesis 11.7 → 19.4 %). The rule does
  nothing about left–right balance.
* Isolated boxes increase on average (more boxes placed) and are higher with the rule on in 14 of 20 pairs, lower
  in 5, equal in 1; the extreme is 454 seed 3 at the quick preset, 20 → 46. R4 still reduces the count in most runs.
* Time: search time is about the same (thesis mean 311 s off, 316 s on).

## Does R5 still do anything with the rule on?

Little. R5 lifts fragile boxes off the floor onto stacks and uses the freed floor for left-out boxes. With the
rule, fragile boxes are loaded last and already end on top, so there is almost nothing to lift:

* Fragile boxes on the floor fall from 7.4 to 1.3 (quick) and 6.2 to 1.7 (thesis) per run, and the dead share above
  fragile boxes at R5's start is already about 7 %.
* Moves accepted / tried, summed over the 10 runs: quick 21/260 off, 5/87 on; thesis 11/193 off, 7/108 on. R5 accepted at
  least one move in 8 of 10 runs off and in 3 of 10 on at the quick preset (5 of 10 off, 4 of 10 on at the thesis preset).
* Dead volume R5 removes (mean percentage points of the truck): quick 2.55 off, 0.26 on; thesis 1.36 off, 0.25 on.
* Boxes added by R5: quick 6 off, 1 on; thesis 1 off, 1 on.

So R5 is still correct and still runs, but with the rule on it is close to inert; it only catches the occasional
fragile box left low. Its guards (M-7, isolated boxes) also still refuse some moves. Whether to keep R5 in the REP
pipeline is a decision for the study design: it costs 0.1–5 s per run and rarely changes the result. R4 is not made
redundant: it still places boxes in a few runs and repairs isolated boxes in most.

## Reproduce

```bash
python tools/test_load_order.py
python tools/pilot_load_order.py --preset quick  --seeds 3,42 --workers 4 --json quick.json
python tools/pilot_load_order.py --preset thesis --seeds 3,42 --workers 4 --json thesis.json
```
