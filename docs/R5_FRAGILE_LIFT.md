# R5 fragile lift (REP only)

Code: `optimizer/fragile_lift.py`. Switch: `RepairBasedHybrid(fragile_lift=True)`,
`--fragile-lift / --no-fragile-lift` on `main_optimizer.py` and `study.py` (default on;
part of the study settings, the resume spec and the chunk-merge check). Test:
`tools/test_fragile_lift.py`. Pilot: `tools/pilot_r5.py`.

## Method

R5 runs once, on the arrangement REP returns after the search, and before R4 (edge
filling). It is never run per wolf, uses no random numbers and orders everything by
total sort keys, so the search, the archive and the leaders are the same with R5 on or
off and the same input gives the same output. DGWO, MOGWO, SEQ and the per-wolf repair
(R1–R3 plus re-insertion) are unchanged.

Nothing may rest on a fragile box (C4), so the column above it is dead space. The
dead volume of a placed fragile box is `top_area × (H − top_z)`, and the
arrangement's dead volume is the sum over its placed fragile boxes. Flat on the floor,
a 114 × 77 × 42 cm box locks 1.56 m³.

For up to 3 passes (stopping after a pass that accepts nothing) R5 visits the placed
fragile boxes, largest dead volume first (ties by index). For each box *f* it saves the
state, removes *f*, and then (1) tries the unpacked non-fragile boxes, heaviest first
(ties: larger volume, then index), at the extreme points plus the corners of the space
*f* freed, keeping the feasible position with the lowest z, then the most side contact,
then DBLF order; (2) re-places *f*, and then any unpacked fragile boxes, at the feasible
position over all of its allowed orientations with the smallest dead volume (highest top,
smallest top face: typically on a stack, standing on end where allowed), then the most
side contact, then DBLF order. Feasibility is the R2 kernel: C1–C6 in both directions, so
a moved or added box can neither break a rule nor create a violation for a box already
placed. Only `allowed_orientations` are used.

The move is **kept only if** every box placed before is still placed (no cargo is
dropped to make room), `evaluate_constraints` is still 100 %, and `(SU, −dead volume)`
is strictly better (higher SU, or equal SU and lower dead volume), and two guards hold:
the left–right mass imbalance (M-7) and the number of isolated boxes are **no higher than
they were when R5 started**. The guards compare with the start-of-R5 values, not with the
previous move, so a series of accepted moves cannot drift. A move that would otherwise be
kept but fails a guard is counted in `refused_balance` and/or `refused_isolated` (a move
failing both counts in both) and recorded as one `balance` or `isolated` refusal in
`move_rejections`. Otherwise the saved state is restored. The run ends with the same `CSR == 100` assertion as R4. R4 then runs
on the result as before.

## Pilot (quick preset: population 10, 60 iterations; R4 on in both rows)

Stops seed 42, three stops; REP seed as listed; instance 454 is the 168-box instance of
`experiments/sample30_seed42.json`. "Fragile moves" counts accepted moves that changed the
position or orientation of a fragile box (the same box can move in two passes). M-7 and
isolated boxes are measured on the final arrangement, after R4.

| instance | seed | R5 | placed | SU % | CSR % | fragile on floor | dead above fragile % | boxes added | fragile moves | isolated | one-side | M-7 % | R5 time |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 581 | 3 | off | 34 | 47.25 | 100 | 7/10 | 31.4 | — | — | 5 | 18 | 4.2 | — |
| 581 | 3 | on | 34 | 47.25 | 100 | 7/10 | 20.7 | 0 | 4 | 5 | 18 | 4.2 | 1.1 s |
| 581 | 42 | off | 36 | 51.73 | 100 | 9/11 | 33.9 | — | — | 4 | 19 | 9.2 | — |
| 581 | 42 | on | 36 | 51.73 | 100 | 9/11 | 33.9 | 0 | 0 | 4 | 19 | 9.2 | 0.6 s |
| 413 | 42 | off | 56 | 49.78 | 100 | 10/14 | 22.2 | — | — | 2 | 34 | 4.9 | — |
| 413 | 42 | on | 58 | 51.50 | 100 | 10/15 | 20.9 | 2 | 2 | 2 | 35 | 1.4 | 5.1 s |
| 147 | 42 | off | 53 | 44.96 | 100 | 8/12 | 24.1 | — | — | 1 | 30 | 1.0 | — |
| 147 | 42 | on | 53 | 44.96 | 100 | 8/12 | 23.5 | 0 | 1 | 1 | 30 | 1.0 | 2.9 s |
| 392 | 42 | off | 57 | 46.13 | 100 | 6/12 | 24.6 | — | — | 3 | 31 | 27.0 | — |
| 392 | 42 | on | 58 | 46.94 | 100 | 6/12 | 23.0 | 1 | 2 | 2 | 31 | 24.8 | 4.7 s |
| 454 | 42 | off | 86 | 41.90 | 100 | 7/15 | 21.2 | — | — | 21 | 46 | 0.2 | — |
| 454 | 42 | on | 86 | 41.90 | 100 | 7/15 | 20.1 | 0 | 2 | 21 | 46 | 0.2 | 6.2 s |

With the guards R5 never lowered placed or SU, never raised dead volume, never raised
M-7 or the isolated-box count above the R5-off row, and kept CSR at 100. It added boxes in
two cases (413: +2, 392: +1) and cut dead volume by 0.6–10.7 percentage points of the truck
in five. M-7 now falls or stays equal in every case (before the guards it rose in four).

Moves refused, quick preset (guards count moves that were otherwise improvements):

| case | accepted / tried | refused_balance | refused_isolated | not better | dropped cargo | C2 | C5 | C4 | C3 | C6 |
|---|---|---|---|---|---|---|---|---|---|---|
| 581 s3 | 4 / 20 | 3 | 0 | 11 | 2 | 65 468 | 16 144 | 5 683 | 52 | 2 090 |
| 581 s42 | 0 / 11 | 0 | 0 | 6 | 5 | 33 279 | 7 902 | 6 221 | 4 | 120 |
| 413 s42 | 2 / 44 | 3 | 9 | 27 | 6 | 345 134 | 89 320 | 62 984 | 3 344 | 6 413 |
| 147 s42 | 1 / 24 | 0 | 0 | 9 | 14 | 276 610 | 53 106 | 29 728 | 5 288 | 1 324 |
| 392 s42 | 2 / 36 | 2 | 2 | 5 | 25 | 423 863 | 134 015 | 40 039 | 2 190 | 6 674 |
| 454 s42 | 2 / 30 | 5 | 4 | 4 | 18 | 872 968 | 173 677 | 51 900 | 13 797 | 16 959 |

(The last five columns are rejected candidate positions summed over all moves, first
failing check in the order C1, C2, C5, C4, C3, C6; C1 is always 0.)

**Effect of the guards.** Without them R5 added boxes in four of six cases (+2, +2, +1,
+2) and cut dead volume by up to 9.3 points. The guards removed the +2 on 581 seed 3 (three
moves refused for balance; dead volume still fell, 31.4 → 20.7 %, by repositioning alone)
and the +2 on 454 (five refused for balance, four for isolated boxes). On 413 they trimmed
the gain (dead volume 22.2 → 20.9 % instead of 15.2 %) but kept the +2 boxes. That is the
price of not unbalancing the load: the moves that were best for fill and dead space
were often the ones that put heavy boxes on one side or left a box touching nothing sideways.

**Cost at the thesis preset (population 30, 300 iterations, seed 42).** Instance 581:
search 175 s, R5 0.34 s (0.2 %). Instance 454: search 1037 s, R5 3.0 s (0.3 %). R5
scales with the number of fragile and left-out boxes, not with the search length.

**At the thesis preset R5 now accepts nothing on these two instances.** 581: 0 of 9 moves
(5 dropped cargo, 4 not better), dead volume 25.1 % before and after. 454: 0 of 14 moves
(7 dropped cargo, 5 refused by the isolated-box guard, 2 not better); before the guards
it accepted 3 lifts there (dead volume 14.7 → 13.1 %). `refused_balance` was 0 on both. The
longer search already leaves fewer fragile boxes lying flat on the floor, so there is less
to lift, and the quick-preset table above is an upper bound on R5's effect, not a forecast
for the thesis study.

## Why moves are refused

Geometry dominates the rejected candidate positions: most corners are simply occupied
(C2), then positions without 80 % base support (C5), then positions beside or above a
fragile box (C4). C3 and C6 matter little in the tally, but they decide which stack can
carry a fragile box (it cannot bear it, or the stop order would block it). At move
level there are four outcomes: *dropped cargo* (the heavy box took the freed floor and
*f* then had no feasible position, so keeping the move would swap one box for another),
*not better* (*f* went back or moved without changing SU or dead volume), and the two
guards above, *balance* and *isolated*.

## Checks

`tools/test_fragile_lift.py` (hand-built lift, refused C3 and C6 moves with controls,
a move that raises SU but is refused by the balance guard, no cargo dropped, orientation
restriction, determinism, instance 581 seeds 3 and 42 including the guard values).
`tools/determinism_reference.json` was regenerated for REP only (seed 1 changed when the
guards were added; seed 42 did not); the DGWO, MOGWO and SEQ hashes are unchanged. The
study must be re-run once R5 is merged, because REP's results change.
