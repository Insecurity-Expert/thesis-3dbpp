# Run settings: λ and C4/C5 enforcement per run vs Study A/B

A Run STACKR comparison started through the server (demo size: instance 350, Quick preset, seeds 1–5, 20 runs).
Each row shows the values the run's optimizer object actually used (`params_used`), next to the values
Study A and Study B were run with (one setting for all of their runs).
Source of the values: `experiments/calibration.json`, sent explicitly by `server/runSettings.js`.
`tools/test_run_settings.py` fails on any difference.

## The calibration values (printed from `experiments/calibration.json`)

| Key in the file | Value | Meaning (Chapter 3) |
|---|---|---|
| `lambdas.w` | 0.2 | λ for C3 — load-bearing (weight on top) penalty weight |
| `lambdas.f` | 0.2 | λ for C4 — fragility penalty weight |
| `lambdas.b` | 0.2 | λ for C5 — stability / base-support penalty weight |
| `lambdas.a` | 0.2 | λ for C6 — stop-order (unloading) penalty weight |
| `enforce_support` | true | C5 enforced while boxes are placed (decode time) |
| `enforce_fragility` | true | C4 enforced while boxes are placed (decode time) |

The file verbatim:

```json
{
  "note": "The calibrated penalty weights and decode-time enforcement every run uses (Quick Test and every comparison). They are the values Study A and Study B were run with; tools/test_run_settings.py fails if they, or any run's recorded values, differ from those studies. The server sends them explicitly on every run; no optimizer or CLI default is relied on.",
  "lambdas": {"w": 0.2, "f": 0.2, "b": 0.2, "a": 0.2},
  "enforce_support": true,
  "enforce_fragility": true
}
```

Related fixed values the runs also use (not in this file; read from the code, for the same check):
C5 support threshold 0.8 (`experiments/study.py` SUPPORT_THRESHOLD, `tools/validate_arrangement.py` SUPPORT);
3 delivery stops, stop-assignment seed 42;
Run STACKR preset "quick" = pack size 10 × 60 iterations.

## The 20 runs

| Method | Seed | Run: λ C3 / C4 / C5 / C6 | Run: enforce C5 | Run: enforce C4 | Study A | Study B | Identical |
|---|---|---|---|---|---|---|---|
| DGWO | 1 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| DGWO | 2 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| DGWO | 3 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| DGWO | 4 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| DGWO | 5 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| MOGWO | 1 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| MOGWO | 2 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| MOGWO | 3 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| MOGWO | 4 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| MOGWO | 5 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| SEQ | 1 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| SEQ | 2 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| SEQ | 3 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| SEQ | 4 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| SEQ | 5 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| REP | 1 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| REP | 2 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| REP | 3 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| REP | 4 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
| REP | 5 | 0.2 / 0.2 / 0.2 / 0.2 | on | on | 0.2 / 0.2 / 0.2 / 0.2, on, on | 0.2 / 0.2 / 0.2 / 0.2, on, on | yes |
