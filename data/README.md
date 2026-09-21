# Data provenance

## `raw/wtpack1.txt` … `wtpack7.txt` — OR-Library container loading instances

Seven files of 100 instances each (700 total), the "wtpack" set of the
OR-Library. Each instance gives one container (L W H, cm), a number of box
types, and per type: dimensions with per-axis rotation flags, quantity, mass,
and three load-bearing-strength values (one per dimension, a pressure in
kg/cm²). `wtpackK` corresponds to Bischoff–Ratcliff class BRK with 3, 5, 8,
10, 12, 15 and 20 box types respectively.

These files are committed (~544 KB) because the thesis results depend on
them exactly; nothing in them is modified. The mass and LBS values are used
as given — no physics is synthesised anywhere in this repository (see
`optimizer/thesis_metrics.validate_items`).

### Citation

Bischoff, E. E., & Ratcliff, M. S. W. (1995). Issues in the development of
approaches to container loading. *Omega*, 23(4), 377–390.

Ratcliff, M. S. W., & Bischoff, E. E. (1998). Allowing for weight
considerations in container loading. *OR Spektrum*, 20(1), 65–71.

Bischoff, E. E. (2006). Three-dimensional packing of items with limited load
bearing strength. *European Journal of Operational Research*, 168(3), 952–966.

Beasley, J. E. (1990). OR-Library: distributing test problems by electronic
mail. *Journal of the Operational Research Society*, 41(11), 1069–1072.

Source URL: `TODO: source URL` (the OR-Library "wtpack" page; fill in the
exact address from which these files were downloaded).

## Augmentation applied at load time (not stored)

`preprocessing/pipeline.load_augmented_instance` adds two fields per box,
deterministically, when an instance is loaded:

- `fragile` (0/1): greedy type-level selection — types ranked by
  `min(lbs_l, lbs_w, lbs_h)` ascending, cut at the type boundary closest to
  25% of boxes; bounds [0.20, 0.30], instances outside are rejected
  (`preprocessing/fragility.py`).
- `stop` (1..3): balanced delivery-stop assignment with a seed
  (`preprocessing/stop_assignment.py`).

The instances used for experiments are listed with full provenance in
`experiments/samples/sample30_seed42.json` (`preprocessing/sampling.py`).
Instance ids are 0..699, round-robin over the files:
`file = (id % 7) + 1`, `index = id // 7`.

## Removed

`CLP-Datasets-main/` (the Bischoff–Ratcliff BR0–BR18 JSON conversions) was
deleted from the repository; it carried no mass or load-bearing data and is
not used by the thesis pipeline. The legacy HD-GWO code path that read it is
retained but has no data.
