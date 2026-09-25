# Run settings: λ and C4/C5 enforcement per run vs Study A/B

A Run STACKR comparison started through the server (demo size: instance 350, Quick preset, seeds 1–5, 20 runs).
Each row shows the values the run's optimizer object actually used (`params_used`), next to the values
Study A and Study B were run with (one setting for all of their runs).
Source of the values: `experiments/calibration.json`, sent explicitly by `server/runSettings.js`.
`tools/test_run_settings.py` fails on any difference.

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
