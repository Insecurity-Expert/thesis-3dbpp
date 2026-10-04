# Studies — answering the SOP

The SOP asks whether the four configurations differ significantly: SP1
(space utilisation), SP2 (compliance, a–d), SP3 (time and memory under
increasing heterogeneity). A single run cannot answer that; a **study**
(four configurations × N seeds × instances + the Chapter 3 statistical
treatment) can.

## Pieces

| file | role |
|---|---|
| `experiments/study.py` | runs configurations × seeds × instances, one **fresh process per run** (numba warmed untimed; M-3 = wall-clock of `run()`, M-4 = process peak working set via psutil — `tracemalloc` is not used because it slows the optimizer ~4×), validates every arrangement with `tools/validate_arrangement.py`, writes one study file and its `.progress.json`, then calls `stats.py`. Each file records the git commit at the **start** (`commit`), the end commit, whether tracked files were modified at either point (`git.dirty_start` / `git.dirty_end`, warned on the console) and the numba / numpy / scipy / python versions (`versions`) |
| `experiments/stats.py` | Chapter 3 statistics, repeated measures with instances as subjects: descriptives; SP1 and SP2 via Shapiro–Wilk on within-instance differences → RM-ANOVA (Mauchly, Greenhouse–Geisser, paired t, d_z) or Friedman (Wilcoxon, rank-biserial r); SP2 Holm across the testable measures with an explicit H₀ decision; SP3 Friedman within each BR class, Holm across ET and PM (serial studies only); composite score + Friedman/Nemenyi; outperformance (three conditions); outcome pattern A–D. Compliance over all boxes (`PRIMARY_COMPLIANCE = "all_boxes"`) is tested; over placed boxes is descriptive |
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

* **Repeated measures.** Each instance is one subject; its value for a
  configuration is the mean over its seeds, and every test compares the four
  configurations within instances. A single-instance study (Study A) is
  therefore descriptive only: SP1, SP2, the composite and the outcome pattern
  all read "requires ≥ 2 instances". Study B (8 instances) is the testable one.
* **Route.** Shapiro–Wilk on the within-instance differences of each of the
  six pairs. All normal → repeated-measures ANOVA, with Mauchly's sphericity
  test and the Greenhouse–Geisser correction when sphericity is violated (or
  cannot be checked), then paired t-tests and d_z. Otherwise → Friedman, then
  Wilcoxon signed-rank and the matched-pairs rank-biserial
  r = (W⁺ − W⁻)/(W⁺ + W⁻). Post-hoc p-values are Holm-corrected across the
  six pairs.
* **SP3** runs a Friedman test within each BR class (≥ 2 instances of the
  class needed), Holm-corrected across ET and PM. With `sample8` only BR4 has
  two instances; the 30-instance sample (4–5 per class) is what SP3 is
  designed for.
* **Winner banner** only when the composite Friedman test is significant.
  Otherwise the banner states the outcome pattern, or "Statistical tests need
  ≥ 2 test cases" for a single-instance study.
* **Outperforms** = significant omnibus AND significant Holm-corrected post-hoc
  AND |d_z| ≥ 0.5 (or |r| ≥ 0.3) AND direction. Significant but below threshold = "statistically detectable
  but not practically meaningful".
* A measure constant across all configurations is *not testable — no
  variance* and is excluded from the Holm family. Note that C4 and C5 are
  100 % of placed boxes by construction (the decoder enforces them), so over
  all boxes they equal the share of boxes placed: their SP2 tests measure how
  many boxes each method loaded, not how well it protected fragile boxes or
  kept boxes supported.
* **Preliminary** is shown whenever fewer than 30 instances or 30 runs per
  configuration were used.
* The Sequential vs DGWO utilisation comparison carries the Chapter 3
  confound note: Sequential's DGWO phase gets `max_iter // 2` iterations
  (30 of 60 at Quick, 150 of 300 at Standard), the MOGWO phase the rest.
