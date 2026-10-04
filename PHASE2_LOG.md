# Phase 2 log

## Summary (read this first)

**Status: stopped at item 3 (ambiguity). Items 1 and 2 are committed. Items 3, 4 and 5 are not started. Nothing pushed, no branch deleted.**

| Item | Commit | Result |
|---|---|---|
| 1 Determinism-reference test | `d739e68` | done |
| 2 Commit recording + numba pin | `82d7f83` | done |
| 3 sample30 cleanup | - | **stopped, needs your decision (below)** |
| 4 Stats fixes | - | not started (the stop rule says wait) |
| 5 Port wip assertion | - | not started |

**Hash check:** `tools/test_reference_hashes.py` passes 8 / 8 after each commit.
DGWO, MOGWO, SEQ and REP at seeds 1 and 42 are unchanged from bbed351 / 3f4392b.

**Tests run** (Python 3.11.15, numba 0.68.0): test_reference_hashes (8 / 8),
test_study_provenance (13 / 13), test_run_settings, test_recommend, all PASS.
Before item 1 the full suite also passed: test_geometry 89, test_stats,
test_custom_load 62, test_custom_load_aliases, test_determinism, pytest
test_pipeline 31. The client Jest tests were not run (no `node_modules` here).

**Why I stopped on item 3.** The old file `experiments/samples/sample30_seed42.json`
is not only used by studies:

- `server/index.js:19` serves it as the UI's wtpack instance dropdown (`/api/instances`).
  The UI defaults to the list's first entry, which is **instance 350** (the demo,
  Study A and `demo_check` instance; `docs/DEMO.md:61` documents that default).
- **Instance 350 is not in the current sample** (`experiments/sample30_seed42.json`,
  whose first entry is instance 413, BR1, 105 boxes).
- `preprocessing/custom_load.py:570` reads `max_boxes` from it (200 in both files,
  so repointing that one is harmless).
- `data/README.md:47`, `docs/DEMO.md` (lines 13, 61, 150) and a comment in
  `client/src/services/api.js:82` name the old path.

Renaming the file therefore forces a choice about the dropdown, which goes beyond the agreed item:

1. **Point the dropdown at the current sample and add instance 350 as a
   separate "demo instance" entry at the top.** The demo default stays 350, and the
   other 29 entries become the thesis sample. Recommended.
2. Point the dropdown at the current sample only. The demo default becomes 413,
   and 350 is not selectable from the dropdown.
3. Keep the dropdown reading the renamed `_DEPRECATED` file (UI unchanged; only
   study.py refuses it).

The study.py part is unambiguous and ready: refuse a `--sample` whose file
name contains `DEPRECATED` or whose JSON has `"deprecated": true`, with a test.
Tell me which dropdown option to take and I'll finish item 3, then do 4 and 5.

**Also noted (not changed):** `docs/MOCK_DEFENSE_RESULTS.md` parameter table says
R_max = 3 and stop_seed = run seed; the code has R_MAX = 5 and stop seed 42.

---


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
| `tools/test_study_provenance.py` | new: `git_state` on a scratch repo (clean / untracked-only / edited tracked file) and a one-run study checking every new field | +84 / 0 |
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

- `tools/test_study_provenance.py`: **PASS, 13 / 13**.
- `tools/test_run_settings.py` (runs study.py end to end): PASS.
- `tools/test_reference_hashes.py`: **PASS, 8 / 8** (no hash change).
- `tools/test_recommend.py`: PASS.

---

## Item 3 - sample30 cleanup (option 1)

### A. Diff

| File | Change | + / - |
|---|---|---|
| `experiments/samples/sample30_seed42.json` -> `sample30_seed42_DEPRECATED.json` | `git mv`; two keys added at the top: `"deprecated": true` and a `deprecated_reason`. The rest of the content is unchanged | +2 / 0 |
| `experiments/samples/demo_instance_350.json` | new: the instance-350 entry copied from the old sample, with a `purpose` note (not in the 30-instance study sample) | +22 / 0 |
| `server/index.js` | `/api/instances` reads `experiments/sample30_seed42.json`, puts instance 350 first labelled "Demo instance (not in the 30-instance study sample) — BR1 — 3 box types — instance 350 (129 boxes, 26% fragile)", and adds `demo`, `in_study_sample` and `study_sample_count` fields. The UI already selects the first entry, so 350 stays the default and the client needs no change | +19 / -5 |
| `experiments/study.py` | `load_sample()` refuses a file whose name contains DEPRECATED (case-insensitive) or whose JSON has `"deprecated": true`. Used by `run_study` and by the CLI, where the error is reported through `argparse` (exit 2) before any run | +18 / -2 |
| `preprocessing/custom_load.py` | `ready_made_samples` reads `max_boxes` from the thesis sample (200 in both files) | +1 / -1 |
| `tools/test_sample_guard.py` | new test (11 checks) | +92 / 0 |
| `README.md`, `data/README.md`, `docs/DEMO.md`, `client/src/services/api.js` (comment only) | paths updated. DEMO.md also states the numba pin from item 2 | +11 / -7 |

Key hunk (study.py):

```python
+def load_sample(path):
+    path = Path(path)
+    if 'DEPRECATED' in path.name.upper():
+        raise ValueError(f"refusing deprecated sample file {path.name}: use experiments/sample30_seed42.json")
+    doc = json.loads(path.read_text(encoding='utf-8'))
+    if doc.get('deprecated') is True:
+        raise ValueError(...)
+    return doc
```

### B. Risk assessment

| Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Optimizer behaviour | none: no optimizer file touched | - | - | reference hashes 8 / 8 |
| Study validity | Study A (instance 350) and Study B (sample8) don't use this file. `--size thesis` already pointed at the kept file. Nothing to rerun | - | - | the test confirms the kept file equals a fresh `sampling.py` draw |
| Manuscript | none: the thesis sample is the one the current Chapter 3 sampling rule produces | - | - | - |
| Statistics | none | - | - | - |
| Timing (SP3) | none | - | - | - |
| UI | the dropdown now has 31 entries: the demo 350, then the 29 + 1 thesis-sample instances. Previously it had 30, from the old sample. 12 thesis instances are new to the dropdown and 12 old ones are gone (except 350, kept as the demo). Saved runs on removed instances still open from history | medium (visible change) | low | the label states the demo entry is not in the study sample, and `/api/instances` marks it `demo: true` |
| Old file elsewhere | anything else that reads `experiments/samples/sample30_seed42.json` by path now gets a file-not-found error | low | low | grep finds no other reader after this change |
| Tests | Jest is not run here. No client code changed apart from one comment | - | - | - |
| Reversibility | `git revert` (the rename reverts too) | - | - | - |

### C. Verification

- `tools/test_sample_guard.py`: **PASS, 11 / 11**. The guard refuses the deprecated file, a `*DEPRECATED*` name with valid content, and a `"deprecated": true` flag under any name. The CLI exits non-zero without writing a study file. The thesis sample equals a fresh `sampling.py` draw (same ids, same order). Demo 350 is outside it and matches the pipeline (129 boxes, 3 types, 33 fragile).
- Live server check (scratch database): `/api/instances` returns 31 entries. The first is 350 with the demo label, `demo: true`, `in_study_sample: false`. 350 appears once, and `study_sample_count` is 30.
- `tools/test_reference_hashes.py` **PASS 8 / 8**. test_custom_load, test_custom_load_aliases, test_study_provenance and test_run_settings: PASS. `ready_made_samples()` runs (4 samples).

---

## Item 4 - Stats fixes (SP2 family of 3, Holm-gated verdicts, neutral presentation)

### A. Diff

| File | Change | + / - |
|---|---|---|
| `experiments/stats.py` | `SP2_FAMILY = ("CSR", "C3", "C6")`. C4 and C5 on the primary definition become descriptive entries (`descriptive_only`, `decoder_enforced`, `equals_share_placed`, reason "decoder-enforced; all-box value = share placed"). Holm runs over the family only. New `apply_verdicts(cmp, omnibus_significant, gate)` sets each pair's `significant`, `outperforms` and verdict; SP1 and SP3 call it with the raw omnibus result (unchanged behaviour), SP2 calls it again with the **Holm-corrected** omnibus result. Neutral verdict text "X significantly higher than Y on <measure> (\|effect\| = …, magnitude)", X = higher mean (new field `higher`). Composite gains `title` "Supplementary composite ranking (Chapter 3)", `supplementary`, `distinguished`; its note reads "no configuration distinguished: …". **Kept unchanged:** every test, effect size, threshold, the composite formula / Friedman / Nemenyi, the `outperforms` computation and the JSON key `recommendation` (stored files, the server list and test_recommend read it) | +82 / -31 |
| `tools/test_stats.py` | the old C4 check asserted C4 was a tested measure; it now asserts the descriptive entry. New section 12a: family = (CSR, C3, C6), Holm family size 3, C4 / C5 descriptive and equal to the share placed, every significant SP2 pair has a significant Holm-corrected omnibus, `apply_verdicts` on a fabricated pair (gate not passed → no verdict; gate passed → exact neutral text), no "outperforms" in any verdict text; composite title, `distinguished` and the new note | +43 / -5 |
| `experiments/results/studies/studyA_…json`, `studyB_…json` | `stats` block re-attached with the new stats.py (`python experiments/stats.py <file>`). **No run was repeated; everything outside `stats` is byte-for-byte equal** | A +33 / -48, B +760 / -1560 (the removed C4 / C5 test blocks) |
| `client/src/study/verdicts.js` | `pairVerdict` → kind `significant`, text "X significantly higher than Y" (falls back to the means for stats without `higher`). Sentences give \|effect\|. The gate text comes from `omnibus_gate`. SP1: "No significant difference in container fill between the configurations". SP2 names C4 / C5 as descriptive, outside the family. SP3 "(rank 1 = lowest)" instead of "(lower is better)". `compositeSummary` lists scores in the fixed configuration order and ends "no configuration distinguished" when Friedman is not significant; when it is significant, "Highest mean composite score: X" plus which pairs Nemenyi separates. `outcomeBanner` has no "winner" kind; its title is "Outcome pattern <A–D> (Chapter 3)" and the composite is a supplementary sentence | +53 / -38 |
| `client/src/study/StudyResults.jsx` | banner: no trophy, no "Recommendation", no highlight. Composite table titled "Supplementary composite ranking (Chapter 3)", fixed configuration order, rank column kept, no "recommended" badge or row highlight, no "Higher is better" | +13 / -14 |
| `client/src/study/CompareTab.jsx` | headings: "Do the configurations differ?". The "What we recommend" section becomes the supplementary composite. "Lower rank = better" / "1 = best" replaced with neutral rank wording. Friedman chip reads "Significant" / "Not significant — no configuration distinguished". Tab label "Composite (supplementary)" | +15 / -15 |
| `client/src/study/StatsTables.jsx` | colour key follows the new kind; the explanatory note describes the conditions, including the Holm gate for SP2 | +2 / -2 |
| `client/src/study/StudyLauncher.jsx` | study list no longer appends "· rec. X" | +1 / -1 |
| `docs/STUDIES.md`, `docs/MOCK_DEFENSE_RESULTS.md` | describe the family of 3, the Holm gate, the neutral wording, and Study B's updated SP2 decision | +26 / -19 |

### B. Risk assessment

| Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Optimizer behaviour | none: no optimizer file touched | - | - | reference hashes 8 / 8 |
| Study validity | stored stats blocks are recomputed (re-analysis, not a rerun). Study B's SP2 decision changes from "rejected (CSR, C3, C4, C5)" to "rejected (CSR, C3)". The Holm p-values for CSR (0.0128), C3 and C6 (0.1357) are the same numbers as before: C4 and C5 sat at the top of the old ordering, so dropping them leaves the multipliers of the others unchanged. No pair verdict, SP1 / SP3 number, composite number or outcome pattern changed (checked field by field) | - | low | the before / after comparison is recorded below |
| Manuscript | Chapter 3 must state the SP2 family as {CSR, C3, C6}, with C4 / C5 reported descriptively (decoder-enforced; all-box value = share placed), and that SP2 pairwise conclusions require the Holm-corrected omnibus test. **Section to edit:** the SP2 paragraph of "Statistical Treatment" that lists the compliance measures tested with Holm (I don't have the manuscript text to quote; please paste it if you want exact wording) | certain | medium | wording in docs/STUDIES.md can be reused |
| Statistics | family size 5 → 3 (less conservative for CSR / C3 / C6 in general; identical values on Study B). SP2 pairs need the Holm-corrected omnibus result (more conservative). Tests, effect sizes (ES-1 d_z, ES-2 Kerby r), thresholds and the composite are unchanged | - | medium | test_stats 12a |
| Timing (SP3) | none | - | - | - |
| UI | Technical details (StudyResults, CompareTab, StatsTables) and the study list wording change. **Not changed (item 7):** the Results page cards and the Loading Guide, which still use recommend.py's per-load composite and "Recommended" badge | certain | low | build compiles with no warnings; Jest 12 / 12; the actual sentences for Study A and B were rendered with verdicts.js and read back (below) |
| Older stats files | a study file analysed before this change has no `higher`, `omnibus_gate` or `title` fields | low | low | verdicts.js falls back (higher from the means, generic gate text) |
| Reversibility | `git revert`; then rerun `python experiments/stats.py` on the two study files | - | - | - |

### C. Verification

- `tools/test_stats.py`: **PASS** (including the 11 new checks in 12a).
- Study A / B re-analysis: everything outside `stats` is identical. In Study B, SP1, SP3, the outcome pattern and the composite numbers are identical once the new text fields are ignored, and no SP2 pair changed `significant` or `outperforms`.
- Rendered UI text for Study B (verdicts.js on the stored stats): banner "Outcome pattern D (Chapter 3)"; SP1 "Sequential significantly higher than DGWO (|d_z| = 1.84, large); …"; SP2 "… C4 and C5 are reported descriptively, outside the Holm family … differ on overall rule compliance, weight limit on each box (C3)"; composite "… (significant). Highest mean composite score: MOGWO, 3.36 / 5. Nemenyi separates it from Repair-based. Nemenyi does not separate it from DGWO and Sequential."
- Full suite: test_reference_hashes **8 / 8**, test_geometry 89, test_recommend, test_sample_guard, test_study_provenance, test_run_settings, test_custom_load, test_custom_load_aliases, test_determinism, pytest test_pipeline 31: all PASS. Client: `react-scripts build` compiles with no warnings; **Jest 12 / 12** (run with `PYTHON` set to the venv; the guide test calls Python).

### Left as is (outside the agreed item; flagging only)

- **SP3 pair verdicts** are still gated on the raw per-class Friedman result, not on the Holm (ET, PM) result. Gating them too would be consistent with SP2; say if you want it.
- The **outcome-pattern descriptions** in stats.py are Chapter 3's definitions ("both hybrids outperform both baselines …") and are shown as written.
- `server/studies.js` still sends the composite's top configuration as `recommendation` in the study list. The UI no longer displays it.
