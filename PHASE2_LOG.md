# Phase 2 log

<!-- SUMMARY (filled in when items 1-5 are done) -->

Baseline before any Phase 2 change: HEAD 3f4392b. Output of the four
configurations on instance 350 (pop 10 x 20, seeds 1 and 42) is byte-identical
at bbed351 and 3f4392b; Study A seed 1 (pop 10 x 300) reproduces its stored
arrangement byte-identically for all four configurations.

Environment for every check below: Linux container, Python 3.11.15, numba
0.68.0, numpy / scipy from `requirements.txt` in a scratch virtualenv.
The client Jest suite is not run here (client `node_modules` not installed).

---

## Item 1 - Determinism-reference test

### A. Diff

| File | Change | + / - |
|---|---|---|
| `tools/test_reference_hashes.py` | new: runs DGWO, MOGWO, SEQ, REP x seeds 1, 42 on instance 350 (stop seed 42, 3 stops, pop 10 x 20, lambda 0.20, C4/C5 enforced), hashes placements + orientations + SU + CSR, compares with the reference; `--write` regenerates it | +100 / 0 |
| `tools/determinism_reference.json` | replaced: was one DGWO hash under a hash definition PR #3's `test_determinism.py` no longer computes (nothing read it); now 8 cases with full sha256, placed, SU, CSR, the settings and the numba / python / platform they were recorded with | +82 / -4 |
| `README.md` | one line under "Verifying" | +1 / 0 |
| `docs/MOCK_DEFENSE_RESULTS.md` | the "determinism" row points at the new test | +1 / -1 |

`tools/test_determinism.py` is unchanged (it still checks run-to-run
repeatability within one commit).

### B. Risk assessment

| Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Optimizer behaviour | none: no optimizer file touched; the test only calls `run()` | - | - | hashes equal before / after (below) |
| Study validity | none: no study or stored result touched | - | - | - |
| Manuscript | none | - | - | - |
| Statistics | none | - | - | - |
| Timing (SP3) | none: test only | - | - | - |
| Cross-platform false failure | reference recorded on Linux / numba 0.68; Windows or another numba could differ in a float and fail with no real change | low (all geometry is integer-valued; SU is one division) | medium (a false alarm) | the failure line prints placed / SU / CSR next to the hash, so a float-only difference is visible; if Windows differs, record a second reference rather than loosen the check |
| UI and tests | none affected; one new test (~60 s) | - | - | - |
| Reversibility | `git revert` of the commit | - | - | - |

### C. Verification

- `python tools/test_reference_hashes.py`: **PASS, 8 / 8**.
- The 8 hashes equal those computed independently at bbed351 and 3f4392b before
  this item (`DGWO 5e73df02 / 28e5f3a0, MOGWO 5bcb2b85 / 3afc1b61,
  SEQ 3c5c044c / b150c53a, REP a965e2d5 / 681939bc`, seeds 1 / 42).
- Noted, not changed (outside this item): the same table in
  `docs/MOCK_DEFENSE_RESULTS.md` says R_max = 3 and `stop_seed` = run seed;
  the code has R_MAX = 5 and a fixed stop seed 42.

---

## Item 2 - Commit recording (start / end / dirty) and numba pin

### A. Diff

| File | Change | + / - |
|---|---|---|
| `experiments/study.py` | `git_state()` (commit + dirty flag + changed files, tracked files only) and `library_versions()`; provenance taken **before the first run**, end state after the last run; the study file gains `git` {commit_start, dirty_start, dirty_files_start, commit_end, dirty_end, dirty_files_end, changed_during_run, dirty_rule} and `versions` {python, numba, numpy, scipy}; `commit` keeps its name and now holds the START commit (stats.py, the server and the UI read it unchanged); console warnings when dirty at start or changed during the run. `run_task` (the timed part) is untouched | +48 / -5 |
| `requirements.txt` | `numba>=0.62.0` -> `numba==0.68.0` (the version in `experiments/results/environment.txt` for the stored studies and the version the reference hashes were recorded with) | +5 / -3 |
| `tools/test_study_provenance.py` | new: `git_state` on a scratch repo (clean / untracked-only / edited tracked file) and a one-run study checking every new field | +88 / 0 |
| `README.md`, `docs/STUDIES.md` | one line each | +3 / -2 |

Key hunk (study.py):

```python
+    git_start = git_state()
+    if git_start['dirty']:
+        log(f"WARNING: working tree has uncommitted changes to tracked files: ...")
 ...
+    git_end = git_state()
+    changed_during_run = (git_end['commit'] != git_start['commit']
+                          or git_end['dirty_files'] != git_start['dirty_files'])
 ...
-        'commit': git_commit(),
+        'commit': git_start['commit'],                 # at the START of the study
+        'git': {...}, 'versions': library_versions(),
```

### B. Risk assessment

| Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Optimizer behaviour | none: no optimizer file touched | - | - | reference hashes 8 / 8 after the change |
| Study validity | none: existing study files keep their `commit` (recorded at the end, as before); only new files carry `git` / `versions` | - | - | readers tolerate the missing keys (they are not read anywhere yet) |
| numba pin | the old laptop has numba 0.62.1 (`environment.txt`); `pip install -r requirements.txt` will now upgrade it, and a defense-day machine on another version would not match the pin | medium | low-medium | run `python tools/test_reference_hashes.py` after installing on each machine; 0.68.0 is what produced every stored number. numba 0.68 supports the laptop's Python 3.12 |
| Manuscript | none (provenance only). If Chapter 3 lists the software environment, it should name numba 0.68.0 | - | low | - |
| Statistics | none | - | - | - |
| Timing (SP3) | `git status` and the version import run once before and once after all runs, in the parent process, outside every timed region (M-3 / M-4 are measured inside the worker) | - | - | - |
| Dirty rule | untracked files are not counted, so an untracked new optimizer module would not set the flag | low | low | stated in the file (`dirty_rule`); the final study should run from a tagged, clean checkout |
| UI and tests | none changed; the Commit shown in Technical details is now the start commit for new studies | - | - | - |
| Reversibility | `git revert` | - | - | - |

### C. Verification

- `tools/test_study_provenance.py`: **PASS, 12 / 12**.
- `tools/test_run_settings.py` (runs study.py end to end): PASS.
- `tools/test_reference_hashes.py`: **PASS, 8 / 8** (no hash change).
- `tools/test_recommend.py`: PASS.
