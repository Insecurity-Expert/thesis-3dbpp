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
is strictly better (higher SU, or equal SU and lower dead volume). Otherwise the saved
state is restored. The run ends with the same `CSR == 100` assertion as R4. R4 then runs
on the result as before.

## Pilot (quick preset: population 10, 60 iterations; R4 on in both rows)

Stops seed 42, three stops; REP seed as listed; instance 454 is the 168-box instance of
`experiments/sample30_seed42.json`. "Fragile moves" counts accepted moves that changed the
position or orientation of a fragile box (the same box can move in two passes).

| instance | seed | R5 | placed | SU % | CSR % | fragile on floor | dead above fragile % | boxes added | fragile moves | isolated | one-side | M-7 % | R5 time |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 581 | 3 | off | 34 | 47.25 | 100 | 7/10 | 31.4 | — | — | 5 | 18 | 4.2 | — |
| 581 | 3 | on | 36 | 49.70 | 100 | 8/12 | 22.1 | 2 | 6 | 5 | 20 | 9.0 | 1.8 s |
| 581 | 42 | off | 36 | 51.73 | 100 | 9/11 | 33.9 | — | — | 4 | 19 | 9.2 | — |
| 581 | 42 | on | 36 | 51.73 | 100 | 9/11 | 33.9 | 0 | 0 | 4 | 19 | 9.2 | 0.7 s |
| 413 | 42 | off | 56 | 49.78 | 100 | 10/14 | 22.2 | — | — | 2 | 34 | 4.9 | — |
| 413 | 42 | on | 58 | 51.50 | 100 | 10/15 | 15.2 | 2 | 5 | 4 | 30 | 10.3 | 5.3 s |
| 147 | 42 | off | 53 | 44.96 | 100 | 8/12 | 24.1 | — | — | 1 | 30 | 1.0 | — |
| 147 | 42 | on | 53 | 44.96 | 100 | 8/12 | 23.5 | 0 | 1 | 1 | 30 | 1.0 | 3.3 s |
| 392 | 42 | off | 57 | 46.13 | 100 | 6/12 | 24.6 | — | — | 3 | 31 | 27.0 | — |
| 392 | 42 | on | 58 | 46.94 | 100 | 6/12 | 20.4 | 1 | 4 | 2 | 31 | 28.1 | 4.7 s |
| 454 | 42 | off | 86 | 41.90 | 100 | 7/15 | 21.2 | — | — | 21 | 46 | 0.2 | — |
| 454 | 42 | on | 88 | 43.67 | 100 | 6/15 | 15.8 | 2 | 9 | 21 | 46 | 14.8 | 9.3 s |

Across the six cases R5 never lowered placed or SU, never raised the dead volume and
kept CSR at 100. It added boxes in four, and cut the dead volume by 0.6–9.3 percentage
points of the truck in five.

**Cost at the thesis preset (population 30, 300 iterations, seed 42).** Instance 581:
search 177.6 s, R5 0.56 s (0.3 %). Instance 454: search 1029 s, R5 5.1 s (0.5 %). R5
scales with the number of fragile and left-out boxes, not with the search length.

**At the thesis preset R5 finds much less.** On 581 (seed 42) it accepted 0 of 9 moves:
the arrangement had 25.1 % dead volume above fragile boxes before and after. On 454 it
accepted 3 of 28 moves (dead volume 14.7 % → 13.1 %, one fewer fragile box on the floor)
and added no boxes. The longer search already leaves fewer fragile boxes lying flat on
the floor, so there is less to lift. The pilot table above is therefore an upper bound
on R5's effect, not a forecast for the thesis study.

## Why moves are refused

Rejected candidate positions by constraint, summed over all moves (first failing check
in the order C1, C2, C5, C4, C3, C6; the same tally as R2's):

| case | accepted / tried | C1 | C2 overlap | C5 support | C4 fragile | C3 weight | C6 stop order | kept out by |
|---|---|---|---|---|---|---|---|---|
| 581 s3 | 6 / 33 | 0 | 105 430 | 22 496 | 12 294 | 84 | 2 020 | not better 24, dropped cargo 3 |
| 581 s42 | 0 / 11 | 0 | 33 279 | 7 902 | 6 221 | 4 | 120 | dropped cargo 5, not better 6 |
| 413 s42 | 5 / 44 | 0 | 365 485 | 76 291 | 52 570 | 3 332 | 8 857 | not better 33, dropped cargo 6 |
| 147 s42 | 1 / 24 | 0 | 276 610 | 53 106 | 29 728 | 5 288 | 1 324 | dropped cargo 14, not better 9 |
| 392 s42 | 4 / 36 | 0 | 428 983 | 136 250 | 37 804 | 2 190 | 6 129 | dropped cargo 25, not better 7 |
| 454 s42 | 9 / 45 | 0 | 1 321 411 | 242 505 | 70 250 | 19 936 | 33 544 | dropped cargo 17, not better 19 |

Geometry dominates: most candidate corners are simply occupied (C2), then positions
without 80 % base support (C5), then positions beside or above a fragile box (C4). C3
and C6 matter little in the tally, but they are what stops a fragile box from going on
top of a particular stack (the stack cannot bear it, or the stop order would block it).
Two move-level outcomes dominate the refusals. *Dropped cargo*: the heavy box took the
freed floor and *f* then had no feasible higher position, so keeping the move would have
swapped one box for another; the rule forbids it. *Not better*: *f* went back where it
was or moved without changing SU or the dead volume.

## Side effect to know about

R5 does not look at left–right balance. M-7 rose in the pilot (e.g. 581 seed 3: 4.2 →
9.0 %, 454: 0.2 → 14.8 %) because R5 moves mass without scoring it; R4 afterwards breaks
ties on M-7 but does not undo it. M-7 is descriptive and outside the hypothesis family.

## Checks

`tools/test_fragile_lift.py` (hand-built lift, refused C3 and C6 moves with controls,
no cargo dropped, orientation restriction, determinism, instance 581 seeds 3 and 42).
`tools/determinism_reference.json` was regenerated for REP only; the DGWO, MOGWO and SEQ
hashes are unchanged. The study must be re-run once R5 is merged, because REP's results
change.
