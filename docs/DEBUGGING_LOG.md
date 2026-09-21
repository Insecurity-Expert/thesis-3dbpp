# Debugging log

Chronological record of the defects that shaped the pipeline, what was
measured, and what was decided. Newest at the bottom.

> **Every result produced before tag `demo-final` is superseded.** Earlier
> numbers were measured on code that lacked one or more of: the single-container
> formulation, the 2n genome, relocate-then-defer repair, constraint-aware
> placement, the four PEN-1 weights, greedy type-level fragility, or the numba
> build. Slide numbers come only from `experiments/results/` at or after
> `demo-final`.

---

## 1. Reproducibility (Step 2)

**Symptom.** Same seed, different results.

**Causes found.** (a) `WolfContinuous` drew its initial position from the global
`np.random` instead of the seeded generator; (b) `assign_thesis_attributes`
consumed a different number of random draws on its second call (keys already
present), so its stop shuffle landed on a different generator state; (c) an
8-second wall-clock cutoff inside `place_bin_dblf` made results depend on
machine load; (d) leaders were updated in place mid-sweep (aliases into `pop`),
a deviation from Mirjalili et al. (2014).

**Fix.** Seeded generators throughout, a deterministic placement-attempt budget
instead of the wall clock, leaders snapshotted per sweep. `tools/test_determinism.py`
asserts same-seed identity and different-seed divergence; it is run three times
consecutively and once under a 2x-oversubscribed CPU before every report.

## 2. Axis convention and fabricated physics (Step 3)

`preprocessing/` was z-up with the door at `y = 0`; `optimizer/` was y-up. C5's
floor test was therefore checking the door face. `assign_thesis_attributes` was
also inventing `weight` and `LBS` at random, contradicting the manuscript's
claim that LBS is sourced from the OR-Library wtpack data. Both removed;
`validate_items` now raises on any missing physics key, and the optimizer
consumes the pipeline's boxes with no adapter. The render flip (physics z-up
to Three.js y-up) happens once, at serialisation.

## 3. The primary metric was a constant (Step 4)

wtpack instances are built so the boxes fill ~99% of one container. The
multi-bin solver always opened exactly two bins, so
SU = total volume / (2 x container) = 49.41% for every configuration and every
seed (sd = 0.00). Reformulated as single-container loading; unplaced boxes
simply do not count. Separately, 3n of the 4n genome dimensions were never
read (the decoded x/y/z were discarded and DBLF re-sorted by volume);
replaced with an n-key random-key permutation plus n orientation genes.

## 4. Penalty scaling (Step 5)

Violations were expressed in percentage points (sum up to 400) while U(X) is
in [0, 1]; with any grid lambda the penalty outweighed utilisation 19-90x and the
search ignored SU. Normalised to rates over placed boxes. The separate
"unplaced volume" term was removed as algebraically redundant with U(X).

## 5. R4 could not converge (Step 5.5)

Chapter 3 checks R4 destinations against C1-C5. A relocated blocker then
routinely blocked a *different* earlier-stop box, so R_MAX fired on 796/800
candidates and R5 removed 11 boxes per candidate. Adding C6 to R4's check
(both directions of the blocking relation) cut R_MAX hits to 40.9% and R5
removals to 0.7 per candidate. R_max = 3 is still a truncation on this data
(61.6% at the final setting; 82.5% on instance 350); the sweep in the Step 6
report recommends 5. **Deferred**: the value is a manuscript parameter.

## 6. What actually blocks relocation (Step 5.5, B2)

The Step 5 report claimed "C3 caps stacks at ~1 box". Measured across 11.1M
rejected candidate positions in R1: C1 57%, C2 34%, C5 6%, C4 2.6%, **C3 0.3%**.
Relocation fails for want of *space*, not physics. Conditional on a
geometric fit, C5 is the main physics rejection.

## 7. Loss of Steps 5.5 and 6, and their reconstruction

**What happened.** The Step 5.5 and Step 6 work (constraint-aware placement,
four penalty weights, R4 C6 fix, `id`/`type_id`, greedy fragility, R_max
calibration, the numba speedups) lived only in the working tree. A branch
checkout followed by a `wip` commit on `master` carried the client/server/docs
changes but not `optimizer/` or `preprocessing/`; those reverted to the Step 5
commit `87962dd`. No copy existed on any branch, stash, reflog entry, VS Code
local history, or elsewhere on disk.

**Reconstruction.** Step 6 was replayed from the seven patch scripts that had
been saved to the session scratchpad; Step 5.5 was re-applied from the session
record. Each phase was gated against reference JSONs that had survived:

| phase | gate | result |
|---|---|---|
| Step 5.5 | DGWO + REP, instance 0, seeds 1-5 (`abl_11`, `fin_REP`) | 10/10 bit-identical |
| Step 6 speedups | same | identical; 64/64 geometry checks |
| Step 6 fragility | REP, instance 350, seeds 1-5 (`rmax_3`) | identical |
| end to end | `tools/test_determinism.py` | hash **`afe1554817f5d94e`**, exactly the value recorded at the end of Step 6 |

Commits `66f2fba`, `c57010c`, `a301070`. The lesson is the standing rule:
**commit after every working change; uncommitted work is not work.**

## 8. C4 one-directional asymmetry (known, deferred)

Decode-time fragility enforcement rejects a candidate that would sit above a
placed fragile box, but does not reject a *fragile* candidate that slides under
the overhang of an already-placed box (an 80%-supported box leaves up to 20%
of its footprint unsupported). Observed as C4 = 98.8% on DGWO at seed 42, and
as 98.2-98.5% on 3 of 30 random baseline orders. The evaluator and the
independent validator both report it correctly. The fix is a few lines in
`fragile_below` / `_first_feasible` (also reject when any placed box lies above
the fragile candidate's footprint) but it changes results, so it is
**deliberately deferred** until after the defense. Say so if asked.

## 9. Infinity serialisation

MOGWO-family archive copies never set `scalar_fitness` (that copy was removed
as dead code in Step 5.5 because MOGWO's decisions never read it). The result
JSON serialised it as `Infinity`, which is not JSON; the Node side's
`JSON.parse` threw inside a bare `catch {}`, so `instance_complete` was
silently dropped and three of four strategies showed nothing in the UI, with
exit code 0. Fix: every emitted line goes through `json_safe` (non-finite to
`null`) and `json.dumps(..., allow_nan=False)`; the server now logs and
forwards any unparsable line instead of swallowing it.

## 10. argv drift between client, server and optimizer

Found in the integration pass before the mock defense:

- the hand-edited `spawn("python", args, ...)` referenced an undefined
  variable (`argv`), failing every run before Python started;
- the `Params: pop=16 iter=32` banner printed the legacy HD-GWO auto-scaling,
  not the thesis strategy's values (cosmetic, but it made the UI's settings
  unprovable on screen);
- the container was emitted in physics `{L,W,H}` while the viewer reads render
  `{L,H,D}` (depth undefined);
- three legacy "constraint" toggles reached nothing and flipped
  `isCustomized`, silently rerouting a wtpack run to the custom-BR path;
- `run_closed` overwrote a specific error message with the generic exit code.

All fixed in `6e98526`..`01192c4`. The result JSON now carries a `params`
echo, rendered in the Results tab, so what ran is what is shown.
