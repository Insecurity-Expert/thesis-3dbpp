# Studies — answering the SOP

The SOP asks whether the four configurations differ significantly: SP1
(space utilisation), SP2 (compliance, a–d), SP3 (time and memory under
increasing heterogeneity). A single run cannot answer that; a **study**
(four configurations × N seeds × instances + the Chapter 3 statistical
treatment) can.

## Pieces

| file | role |
|---|---|
| `experiments/study.py` | runs configurations × seeds × instances, one **fresh process per run** (numba warmed untimed; M-3 = wall-clock of `run()`, M-4 = process peak working set via psutil — `tracemalloc` is not used because it slows the optimizer ~4×), validates every arrangement with `tools/validate_arrangement.py`, writes one study file and its `.progress.json`, then calls `stats.py` |
| `experiments/stats.py` | Chapter 3 statistics: descriptives, SP1, SP2 (Holm across five measures, explicit H₀ decision), SP3 (serial studies only), composite score + Friedman/Nemenyi, outperformance (three conditions), outcome pattern A–D. Both compliance definitions are reported; `PRIMARY_COMPLIANCE = "all_boxes"` |
| `tools/test_stats.py` | acceptance checks for `stats.py` |
| `server/studies.js` | `POST/GET /api/studies`, `/progress`, `/import`, `/available`, `/sizes` — detached jobs (not tied to the WebSocket), user-scoped, mirrored in the `db.js` mock |
| `client/src/study/` | launcher + locked test settings, study Results view, Compare tab (SP1 / SP2 / SP3 / Overall / saved runs side by side); **every sentence is generated in `verdicts.js` from the stats block** |

## Running

```bash
python experiments/study.py --size demo                 # instance 350, Quick, seeds 1-N, parallel
python experiments/study.py --size standard             # Study A: instance 350, Standard, seeds 1-30, parallel
python experiments/study.py --size multi                # Study B: sample8, Quick, seeds 1-10, serial
python experiments/study.py --instance 350 --preset quick --seeds 1-5 --mode serial --out x.json
python experiments/stats.py x.json --print              # (re)attach stats, print the summary
python experiments/study.py --print-defaults            # the locked parameters the UI shows
```

`--mode serial` runs one optimizer at a time (timing valid → SP3 and the
composite are computed). `--mode parallel` shares the CPU and the file is
flagged *concurrent*; `stats.py` then refuses SP3 and the composite.

Study A and Study B result files **are committed** (~3.6 MB together). A
rerun with the `--size standard` and `--size multi` commands above takes about
4 hours and is not byte-identical (timings differ), so the stored files are the
reference. They were briefly untracked in b15b704 and restored byte-identical
from its parent; the independent validator agrees on all 440 arrangements.
UI-launched studies, logs and progress files are not committed.

CLI-computed files in `experiments/results/studies/` appear in the UI under
*Import a precomputed study* (Logistics → Full Comparison). Nothing is
imported automatically: a fresh database shows empty states everywhere.

## Reading the output

* **Winner banner** only when the composite Friedman test is significant.
  Otherwise the banner states the outcome pattern, or "Overall ranking needs
  ≥ 2 test cases" for a single-instance study.
* **Outperforms** = significant corrected post-hoc AND |d| ≥ 0.5 (or |r| ≥ 0.3)
  AND direction. Significant but below threshold = "statistically detectable
  but not practically meaningful".
* A measure constant across all configurations (C4, C5 at 100 % over placed
  boxes) is *not testable — no variance; enforced by the decoder* and is
  excluded from the Holm family.
* **Preliminary** is shown whenever fewer than 30 instances or 30 runs per
  configuration were used.
* The Sequential vs DGWO utilisation comparison carries the Chapter 3
  confound note: Sequential's DGWO phase gets `max_iter // 2` iterations
  (30 of 60 at Quick, 150 of 300 at Standard), the MOGWO phase the rest.
