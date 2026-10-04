# Phase 2 log

## Summary (read this first)

**Status: items 1-5 done, each a separate commit, all pushed to
`origin/ccr-404428c3-7wury8` only. No stop condition was hit after item 3's
decision. No PR, no merge, no branch deleted. Items 6+ (auth, Results / Loading
Guide, greedy, race lanes) not started.**

| Item | Commit | Result |
|---|---|---|
| 1 Determinism-reference test | `d739e68` | done |
| 2 Commit recording (start / end / dirty) + numba pin 0.68.0 | `82d7f83` | done |
| - log: stopped at item 3 for a decision | `67a2827` | your answer: option 1 |
| 3 sample30 cleanup (option 1) | `21aacf0` | done |
| 4 Stats fixes + neutral presentation | `bd0bcbc` | done; Study A / B stats blocks re-attached (analysis only) |
| 5 Port the wip assertion | `ec0f7da` | done; it was a *weaker* existing check, now strengthened; branch kept |

**Hash check:** `tools/test_reference_hashes.py` passes **8 / 8 after every
commit**. DGWO, MOGWO, SEQ and REP at seeds 1 and 42 on instance 350 are
byte-identical to bbed351 / 3f4392b. No optimizer file was touched and no
study was rerun.

**Tests (final state)** (Python 3.11.15, numba 0.68.0): test_reference_hashes
8 / 8, test_geometry 92, test_stats (with the new SP2 / Holm-gate / neutral-text
checks), test_recommend, test_sample_guard 11, test_study_provenance 13,
test_run_settings, test_custom_load 62, test_custom_load_aliases,
test_determinism, pytest test_pipeline 31: **all PASS**. Client:
`react-scripts build` compiles with no warnings; **Jest 12 / 12** (the guide
test needs `PYTHON` pointing at an interpreter with numpy).

**Needs you:**
1. **Manuscript (Chapter 3, Statistical Treatment, SP2).** State the family as
   {CSR, C3, C6}, C4 / C5 reported descriptively, and that SP2 pairwise
   conclusions require the Holm-corrected omnibus test. Study B's SP2 decision
   is now "rejected (CSR, C3)", with the same Holm p-values as before.
2. **SP3 pair verdicts** are still gated on the raw per-class Friedman result,
   not the Holm (ET, PM) result. Say if you want them gated like SP2.
3. **numba pin:** after `pip install -r requirements.txt` on the laptop (0.62.1
   → 0.68.0), run `python tools/test_reference_hashes.py` there.
4. `wip/align-with-manuscript` can now be deleted (its content is superseded or
   ported) once you say so.
5. The Results cards and Loading Guide still show recommend.py's per-load
   "Recommended" badge; that is item 7.

**Correction (follow-up commit):** my earlier note that `docs/MOCK_DEFENSE_RESULTS.md`
says R_max = 3 / stop_seed = run seed was a misreading. Those rows are in the
"Superseded — do not cite" section and correctly describe the older runs. The
current parameter table already says R_max = 5 and stop_seed = 42, matching the
code and the manuscript. My item 1 edit had changed the determinism row inside
that superseded table; it is restored, and the new determinism row now sits in
the current table.

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
- (Corrected later: the row edited here was in the doc's superseded section; it
  was restored and the new row moved to the current table. See the summary.)

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

---

## Item 5 - Port the wip assertion (branch NOT deleted)

### Finding first

The Phase 1 review said HEAD had dropped the wip assertion "heaviest box (2) no
longer above box 0". It hadn't: HEAD has a check with that name, but a
**weaker** one. HEAD's stack case (`_b3`) passes if box 2 was *deferred*
(`2 not in _pl3 or …`) and only requires R1 to have acted at all. The wip
version (1bcefe9) required heaviest-first **relocation** with free floor:
nothing deferred, all three boxes still placed, and box 2 itself off box 0.
That stronger behaviour is what was missing, so that is what I ported. HEAD
already covers the wip branch's other repair checks (R1 defer, R2 relocate, R3
removal into the unpacked list) with equal or stricter assertions.

### A. Diff

| File | Change | + / - |
|---|---|---|
| `tools/test_geometry.py` | three checks added to the existing stack case (`_b3`): "stack: R1 deferred nothing", "stack: all three boxes still placed", "stack: heaviest box (2) relocated off box 0" (the wip condition, without the deferral escape); comment cites 1bcefe9 | +7 / 0 |
| `README.md` | geometry check count 89 → 92 | +1 / -1 |

### B. Risk assessment

| Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Optimizer behaviour | none: test only; repair.py untouched | - | - | reference hashes 8 / 8 |
| Study validity / manuscript / statistics / timing | none | - | - | - |
| Tests | the new checks pin the current relocation behaviour; a future repair change that defers instead would now fail here, which is intended | - | - | - |
| Branch | `wip/align-with-manuscript` left in place, as instructed. Its only unique content (1bcefe9) is now either superseded (stats.py, test_pipeline, sampling.py by edcc4a6) or ported (this item), so it can be deleted once you approve | - | - | - |
| Reversibility | `git revert` | - | - | - |

### C. Verification

- `tools/test_geometry.py`: **PASS, 92 / 92** (the 3 new checks pass on the current repair code).
- `tools/test_reference_hashes.py`: **PASS 8 / 8**.
- `origin/wip/align-with-manuscript` is still at 1bcefe9 (not deleted).

---

## Item 4b - SP3 pair verdicts gated on the Holm-corrected per-class result

Asked for after item 4 (Chapter 3 Table 3a).

### A. Diff

| File | Change | + / - |
|---|---|---|
| `experiments/stats.py` | after Holm across ET and PM within each BR class, `apply_verdicts(per[m], significant_holm, "Holm-corrected omnibus test")`, as SP2 does; docstring updated | +5 / -2 |
| `tools/test_stats.py` | section 7: every SP3 pair records the Holm gate, and every significant SP3 pair has a significant Holm-corrected per-class result (the gate logic itself is already unit-tested in 12a) | +5 / 0 |
| `experiments/results/studies/studyB_…json` | `stats` re-attached (analysis only) | verdict / gate text in SP3 pairs |

Study A has no SP3 (parallel timing), so its file is unchanged.

### B. Risk assessment

| Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Optimizer behaviour | none | - | - | reference hashes 8 / 8 |
| Study validity | Study B: only BR4 has 2 instances. Its ET and PM Friedman tests are not significant raw or after Holm, so **no SP3 verdict changed**. Everything outside `stats.SP3` is unchanged | - | - | field-by-field comparison |
| Manuscript | matches Table 3a as you described it; no edit needed beyond what item 4 lists | - | - | - |
| Statistics | more conservative SP3 pair verdicts (they need the Holm-corrected class result) | - | low | - |
| Timing / UI | none; the UI already reads `omnibus_gate` for the explanatory text | - | - | - |
| Reversibility | `git revert`, then rerun `stats.py` on Study B | - | - | - |

### C. Verification

- `tools/test_stats.py` PASS (2 new checks). `tools/test_reference_hashes.py` **8 / 8**. `tools/test_recommend.py` PASS.
- Study B before vs after: runs identical; every stats block except SP3 identical; no SP3 pair changed `significant` or `outperforms`.

---

## Item 6 - Auth: database guard, email normalisation, demo seed, forgot password, admin reset

### A. Diff

| File | Change | + / - |
|---|---|---|
| `server/db.js` | **Guard:** a file that exists but cannot be read, cannot be parsed, or has no `users` / `runs` lists now throws `DbLoadError` (the request fails with the reason); nothing is written. Previously it returned an empty database, which the next write saved over every account and run. **Backup:** before every write the current file is copied to `<file>.bak`. **Atomic write:** write to `<file>.tmp`, then rename; if Windows refuses the rename, write in place (the backup was just made). The `email` lookups compare trimmed, lower-cased emails. New `read` / `mutate` / `normEmail` exports. The data directory is created only for the file actually used | +61 / -13 |
| `server/accounts.js` | new: `migrateEmails` (one-time, idempotent; case-only duplicates are reported and left alone, not merged), `seedDemoAccount` (keyed on the normalised email; `STACKR_DEMO_EMAIL` default `admin@gmail.com`, `STACKR_DEMO_PASSWORD` default `stackr-demo`; never overwrites an existing account), `findForLogin` (tries every account with the normalised email), the recovery question list, `resetWithAnswer` (bcrypt-hashed answer compared case- and space-insensitively; 5 wrong answers lock that email for 15 minutes, in memory), `adminReset` | +138 / 0 |
| `server/auth.js` | register stores the normalised email and requires a recovery question from the list plus an answer (stored only as a bcrypt hash). Login uses `findForLogin`. New routes `GET /recovery-questions`, `POST /forgot/question`, `POST /forgot/reset` | +33 / -3 |
| `server/index.js` | at startup, `migrateEmails()` then `seedDemoAccount()` (an unreadable database is reported and left untouched; the server still starts). A JSON error handler, so a database error reaches the UI as a message rather than an HTML stack trace | +18 / 0 |
| `server/reset-password.js` | new admin CLI: `node server/reset-password.js <email> [--password <pw>]`, which prints a temporary password when none is given and refuses when several accounts share the email | +35 / 0 |
| `client/src/auth/RegisterPage.jsx` | recovery question select + answer, required, with a hint | +32 / -2 |
| `client/src/auth/LoginPage.jsx` | "Forgot password?" link | +4 / 0 |
| `client/src/auth/ForgotPasswordPage.jsx` | new: email → question → answer + new password (twice) → done. For an account without a question it shows the admin-reset message | +115 / 0 |
| `client/src/index.js`, `client/src/services/api.js` | `/forgot-password` route; three API calls | +13 / 0 |
| `tools/test_auth.js` | new Node test (37 checks) against the real router and a scratch database | +164 / 0 |
| `README.md` | accounts paragraph; test line | +13 / 0 |

### B. Risk assessment

| Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Optimizer / studies / statistics / SP3 timing | none: no optimizer, experiment or stats file touched | - | - | reference hashes 8 / 8 |
| Manuscript | none (tool feature, not methodology) | - | - | - |
| Existing accounts | the first start migrates stored emails to lower case; accounts that differ only by case are left as they are and still sign in (the one whose password matches) | low | low | migration tested (normalise, idempotent, collision) |
| Existing accounts without a recovery question | they cannot use Forgot password | certain | low | the page says to use the admin reset; `server/reset-password.js` covers it. Optional follow-up: let a signed-in user set a question in Account settings |
| Account enumeration | `/forgot/question` reveals that an account with a question exists (unknown email and no question give the same message) | certain | low (local tool) | 5-attempt lock per email; answers bcrypt-hashed |
| Lockout is in memory | a server restart clears it | - | low | acceptable for a local tool |
| Known demo password | anyone at the machine can sign in as the demo account | certain | low | set `STACKR_DEMO_PASSWORD` on the defense machine; the seed never changes an existing account's password |
| Windows file locks | rename can fail while another process has the file open | low | low | falls back to an in-place write after the backup |
| Database errors now surface | a corrupt file used to "work" (as an empty database, then wiped it); it now returns errors until restored from `.bak` | intended | - | the error message names the `.bak` file |
| UI and tests | Register, Sign in, the new Forgot password page | - | - | build compiles with no warnings; Jest 12 / 12; browser walkthrough below |
| Reversibility | `git revert`. Migrated emails stay lower-case, which the old code would then require users to type exactly | - | low | - |

### C. Verification

- `node tools/test_auth.js`: **PASS, 37 / 37**. Covers:
  - normalised register and sign-in (three spellings);
  - 409 on a case variant; question required; answer stored only as a hash;
  - migration (normalise, idempotent, collision kept and signs in);
  - demo seed (creates, idempotent, skips a case-variant existing account, env vars used);
  - forgot password (question, wrong answer 401, right answer with other case and spacing resets, old password rejected, lock after 5);
  - admin message for no question / unknown email, and the admin CLI;
  - database guard (backup equals the pre-write file, no tmp left, a corrupt file gives a 500 and stays byte-identical, sign-in on a corrupt file fails rather than succeeding on empty data, the startup seed refuses to write over it, a file without lists is refused).
- **Browser walkthrough** (real server + dev client, scratch database, Playwright/Chromium):
  - register "  Lydia@Example.COM " and sign in as "lydia@example.com";
  - Forgot password: a wrong answer shows "The answer does not match.", then "  quezon city " resets it and the new password signs in;
  - the demo account (seeded at server start) signs in;
  - its Forgot password shows the admin-reset message.
  - Screenshots checked for layout.
- `tools/test_reference_hashes.py` **8 / 8**; `tools/test_run_settings.py` PASS; client build OK; Jest 12 / 12.

---

## Item 7 - Results and Loading Guide: neutral comparison, hybrid default view, no default in the Guide

### A. Diff

| File | Change | + / - |
|---|---|---|
| `experiments/recommend.py`, `tools/test_recommend.py` | **deleted** (the per-load "Recommended" composite) | 0 / -265 |
| `experiments/representative.py` | new neutral helper: for each load and configuration, the **representative run** = the run whose SU is closest to that configuration's median SU on the load, ties to the lowest seed (distances compared to 1e-9), plus the means over the load's runs (SU, all-box and loaded-box compliance, boxes loaded, CPU / wall time, memory). Nothing ranked | +91 / 0 |
| `tools/test_representative.py` | new (17 checks): the median rule (odd / even counts, ties); on Study A and B the choice equals an independent re-implementation, `run_index` is right, and the means equal a direct computation; no ranking keys; fixed order | +85 / 0 |
| `server/studies.js` | `GET /api/studies/:id/representatives` (calls representative.py) replaces `/recommendation`; the study list no longer carries `recommendation` | +10 / -10 |
| `client/src/viewer/comparison.js` | new: fixed order; `MEASURES` with the display thresholds (2 pp for fill and both compliance measures, 2 boxes for boxes loaded); `positions` (level / highest / lowest / between), `profiles`, `pairText`, `byDesign` (Repair-Based's 100 % loaded-box compliance; Sequential's split budget from `seq_budget_split`), `baselineNote` | +100 / 0 |
| `client/src/viewer/comparison.test.js` | new (7 tests, on Study A's means plus constructed cases) | +62 / 0 |
| `client/src/components/ResultsPanel.jsx` | rewritten top half. Removed: the winner card, `whySentences`, "How the recommendation was decided", the Recommended badge and highlight. **Default view:** Sequential and Repair-Based cards plus a measure-by-measure table ("level" or "X higher by …"), and one neutral line when a baseline is higher than both hybrids by at least the threshold. **"View full comparison (4 configurations)"**: four cards in fixed order, a measures table with highest / lowest / level, and per-configuration "Highest on / Lowest on / Level on" profiles. Cards show means over the load's runs; Details shows the representative run; "by design" badges. Technical details keep the run table, trade-offs chart and statistics | +169 / -156 |
| `client/src/components/GuideTab.jsx` | uses the representatives; **no configuration selected by default** (prompt until one is chosen; "Export Guide" on a card still preselects that card's configuration); all four listed in the fixed order with no "recommended"; the callout states the representative-run rule; the composite-score line is removed; a single saved run is labelled "Preview: one run, one seed" | +26 / -21 |
| `Shell.jsx`, `ResultsTab.jsx`, `VisualizationTab.jsx`, `LogisticsTab.jsx` | "Preview: one run, one seed" on single-run views | +5 / -5 |
| `HowToModal.jsx`, `DashboardTab.jsx`, `ThingsToKnow.jsx` | wording without "recommended" | +3 / -3 |
| `client/src/services/api.js`, `client/src/viewer/guidePlan.test.js` | `representatives()`; the guide acceptance test uses Sequential's representative run on instance 350 (Repair-Based has no C6 blockers, which the test needs) | +11 / -11 |
| `PAGES.md`, `docs/DEMO.md`, `README.md` | describe the new Results / Guide behaviour and the test | +5 / -4 |

### B. Risk assessment

| Area | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Optimizer / studies / statistics / SP3 timing | none: presentation only; stats.py and the stored study files untouched | - | - | reference hashes 8 / 8 |
| Manuscript | if Chapter 4/5 or the tool description mention "Recommended for this load", that text must go (group decision) | possible | low | - |
| Representative run changed | was "highest all-box compliance, then highest SU, then lowest seed" (a best run); now the median-SU run, so the 3D view and Guide show a typical run, with lower numbers than before. **With an even number of runs (10 here, 30 in the thesis study) the two middle runs are always equidistant from the median, so the representative is always the lower-seed of the two middle runs** | certain | low | stated in the rule text shown in the UI; tested |
| "Level" thresholds | display rule only; with four configurations, "highest" / "lowest" mean within 2 pp (2 boxes) of the top / bottom value, so more than one configuration can carry a label and some carry none ("between") | - | low | the rule is printed under the table |
| Baseline line | appears only when a baseline beats BOTH hybrids by at least the threshold; none of Study B's 8 loads triggers it, so its live rendering was not seen | - | low | unit-tested text; the code path is a plain conditional |
| Things not changed | the Technical-details trade-offs chart still circles "best of both" runs; that compares runs **within** one configuration, not configurations. `docs/guided-ui/*` (historical design notes) still describe recommend.py | - | low | flagging only |
| UI / tests | Results, Loading Guide, Quick Test / 3D viewer labels | - | - | build compiles with no warnings; Jest **19 / 19**; browser walkthrough below |
| Reversibility | `git revert` (restores recommend.py and its route) | - | - | - |

### C. Verification

- `tools/test_representative.py` **PASS 17 / 17**; Jest **19 / 19** (new comparison tests 7 / 7; the guide acceptance test passes on Sequential's representative run).
- Full suite: test_reference_hashes **8 / 8**, test_stats, test_geometry 92, test_sample_guard, test_study_provenance, test_run_settings, test_custom_load, test_custom_load_aliases, test_determinism, pytest 31, test_auth 37: all PASS. Client build: compiled, no warnings.
- **Browser walkthrough** (real server + dev client, demo account, Study B imported):
  - Results opens on "Hybrid configurations: Sequential and Repair-Based" with 2 cards and no recommend / winner text.
  - "View full comparison (4 configurations)" shows DGWO, MOGWO, Sequential, Repair-Based in that order, with highest / lowest / level and the profiles.
  - Repair-Based's 100 % loaded-box compliance and Sequential's split budget carry "by design".
  - Loading Guide opens with "— choose a configuration —", lists all four, and shows the prompt; choosing Repair-Based builds its plan with the representative-run callout.
  - Screenshots checked for layout.
