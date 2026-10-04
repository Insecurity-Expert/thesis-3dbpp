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
