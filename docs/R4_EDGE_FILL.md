# R4 edge filling (REP) — pilot results

Panel feedback: some boxes in REP's arrangements stand alone or touch a wall on
one side only, and could slide or tip in a hard turn or brake. R4
(`optimizer/edge_fill.py`) tightens the arrangement REP returns. It is part of
REP only; SEQ is a baseline and DGWO, MOGWO and SEQ are unchanged.

Pilot: REP, seed 42, quick preset (pop 10 × 60), C4/C5 enforced, stop seed 42,
3 stops. "Before" is the arrangement REP returns without R4 (the search is
identical with R4 on or off; R4 runs after it). Reproduce with
`python tools/test_edge_fill.py` (instance 581) or `--no-edge-fill` on the CLI.

| inst | boxes | placed (before → after) | SU % | CSR % | isolated | one-side | fillable gaps ≥ τ | dunnage gaps < τ | side contact | R4 time |
|---|---|---|---|---|---|---|---|---|---|---|
| 581 | 69 | 36 → 36 | 51.73 → 51.73 | 100 → 100 | 6 → 4 | 18 → 19 | 7 → 7 | 23 → 20 | 51.7 → 54.2 % | 0.6 s |
| 413 | 105 | 56 → 56 | 49.78 → 49.78 | 100 → 100 | 7 → 2 | 26 → 34 | 11 → 11 | 29 → 27 | 46.4 → 49.4 % | 1.8 s |
| 147 | 116 | 53 → 53 | 44.96 → 44.96 | 100 → 100 | 11 → 1 | 26 → 30 | 7 → 6 | 41 → 26 | 43.2 → 47.2 % | 1.9 s |
| 392 | 124 | 57 → 57 | 46.13 → 46.13 | 100 → 100 | 11 → 3 | 25 → 31 | 12 → 14 | 35 → 23 | 49.7 → 53.6 % | 2.4 s |

Isolated = gap on both x faces; one-side = touching on exactly one x face;
gaps are counted per x face. R4 time is part of M-3. Thesis preset (pop 30 ×
300), instance 581: the run takes about 125 s and R4 adds 0.6 s.

## What the pilot shows

* **Compaction (Step B) does the work.** Isolated boxes fall from 6–11 to 1–4
  per arrangement; boxes move into contact with a wall or a neighbouring stack.
  Some islands become one-side boxes (they now touch a wall), so the one-side
  count can rise. Moves that would break C6 are undone (2 of 4 on 581).
* **Step A (re-insertion) placed no box on any of the four instances.** This is
  not a weakness of the candidate set. On 581 every unpacked box was tried at
  every position on the lattice of all box-face planes (any position flush
  against anything), in every orientation: 49,348 positions are free of overlap,
  1,955 of those have C5 support, 29 pass C4 and none passes C3. The boxes the
  search left out are heavy (about 629 kg) and the boxes below the large
  sideways gaps cannot bear them (load-bearing, C3) or are fragile (C4); the
  gaps themselves are mostly pockets above the floor with nothing under them.
  So the panel's "too little cargo across the width" is real, but on these
  instances the missing cargo cannot be added without breaking C3–C5. SU does
  not change.
* **Dunnage.** Gaps under τ (20–27 per arrangement after R4) are reported, not
  filled.

## Methodology paragraph

Repair step R4 (edge filling) is applied once, to the arrangement the
Repair-Based hybrid returns, after the search has finished; it does not enter
the per-wolf repair, the archive or the leader selection, and it uses no random
numbers. It has two parts. First, each box the search left out, largest volume
first, is tried at the extreme points, at points flush against both sides of
every sideways gap of at least τ (the smallest box dimension in the instance),
and at those points slid in x until flush against the nearest wall or box. Every
position that satisfies C1–C6 in both directions is scored by side-contact area,
the area of the box's lateral faces (across the width and along the length) that
touches a wall or another box with no gap. A position is accepted only if the box
touches on at least two of its four lateral sides, at least one of them across
the width, so R4 cannot create a new isolated box; ties go to the side that lowers
the left–right mass imbalance (M-7), then to deepest-bottom-left order. Second,
rigid vertical stacks are moved across the width into contact with the nearer
wall or stack when that raises total side contact and C1–C6 still hold at 100 %;
a move that breaks a constraint, in practice C6, is undone. Re-insertion then
runs once more, because compaction can open new gaps. Sideways gaps below τ cannot
hold a box and are reported as dunnage. The result is checked to have CSR = 100 %,
and isolated boxes, one-side boxes, fillable and dunnage gaps and the side-contact
ratio are reported as descriptive indicators outside the hypothesis family.

## Notes

* Acceptance also requires contact across the width (not only "two sides" of x−,
  x+, y−, y+): a box wedged between the rear door and a neighbour along the length
  but free to slide sideways would still be an island. Set
  `edge_fill.REQUIRE_X_CONTACT = False` for the plain two-side rule.
* Lateral centering is not run after R4. The Center Load toggle still works, and
  the Gaps panel now shows the gaps of the layout in view (it used to show the
  uncentered ones whatever the toggle said).
* `tools/determinism_reference.json` was regenerated for REP only; the DGWO,
  MOGWO and SEQ hashes are unchanged.
