// client/src/study/StudyDetails.jsx — the detail view of one study (Technical
// Details). Visible by default: a header line (outcome, test cases, runs,
// preset) and the SOP Summary — the six measures of SP1–SP3 with their
// significance marks and one-sentence findings. Everything else is under one
// "Show all numbers" disclosure, grouped by specific problem, each part
// collapsed again. Nothing is mounted until it is opened (charts included).
// No number is computed here: every section is an existing component.
import React, { useState } from "react";
import { StudySopSummary, SP1, SP2, SP3, Overall, SavedRuns, HypothesisFamily } from "./StatsSections";
import { Banner, ProvenanceStrip, ScoreTable, ComplianceTable, PerformanceTable, SupplementaryBaselines, ExtraNumbers, Sp3Note } from "./StudyResults";
import { outcomeBanner } from "./verdicts";

// A button that shows / hides its children; closed children are not mounted.
export function Disclosure({ title, sub = null, level = 2, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`disclosure disclosure-l${level}${open ? " open" : ""}`}>
      <button type="button" className="disclosure-summary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="disclosure-chevron" aria-hidden="true">›</span>
        <span className="disclosure-text">
          <span className="disclosure-title">{title}</span>
          {sub && <span className="disclosure-sub">{sub}</span>}
        </span>
      </button>
      {open && <div className="disclosure-body">{children}</div>}
    </div>
  );
}

const stack = { display: "flex", flexDirection: "column", gap: 16 };

// "Outcome D · 8 test cases · 320 runs (80 per configuration) · quick preset (pop 10 × 60)".
export function StudyHeaderLine({ study, stats }) {
  const oc = stats.outcome;
  const b = outcomeBanner(stats);
  const label = oc && oc.pattern ? `Outcome ${oc.pattern}` : b ? b.title : "No outcome pattern";
  const nInst = stats.provenance ? stats.provenance.n_instances : (study.instances || []).length;
  const nRuns = (study.runs || []).length;
  const per = stats.provenance && stats.provenance.runs_per_configuration;
  const preset = study.preset;
  return (
    <div className="study-headline" role="note">
      <span className="study-outcome" title={oc && oc.pattern ? `${oc.description} (Chapter 3)` : b ? b.sub : undefined}>{label}</span>
      {oc && oc.pattern && <span className="study-headline-desc">{oc.description}</span>}
      <span className="study-headline-facts">
        <span>{nInst} test case{nInst === 1 ? "" : "s"}</span>
        <span>{nRuns} runs{per ? ` (${per} per configuration)` : ""}</span>
        {preset && <span>{preset.name} preset (pop {preset.pop_size} × {preset.max_iter} iterations)</span>}
      </span>
    </div>
  );
}

// Header + SOP Summary, then "Show all numbers". `perLoad` is the per-load
// part (configuration cards, every run, trade-offs) the caller builds.
export default function StudyDetails({ study, stats, runHistory = [], perLoad = null }) {
  const [all, setAll] = useState(false);
  return (
    <div style={stack}>
      <StudyHeaderLine study={study} stats={stats} />
      <StudySopSummary study={study} stats={stats} />
      <div className={`all-numbers${all ? " open" : ""}`}>
        <button type="button" className="btn btn-secondary all-numbers-toggle" aria-expanded={all} onClick={() => setAll((o) => !o)}>
          {all ? "Hide all numbers" : "Show all numbers"}
        </button>
        <span className="field-hint all-numbers-hint">Every table and chart behind the summary: tests, summary statistics, every run, the composite and the baselines.</span>
        {all && (
          <div style={{ ...stack, marginTop: 14 }}>
            <Disclosure level={1} title="SP1 — Packing efficiency" sub="Container fill: summary statistics, normality, omnibus and pairwise tests">
              <Disclosure title="Tests and summary statistics" sub="Mean / median / SD / min / max, normality, omnibus, pairwise and effect sizes"><SP1 stats={stats} /></Disclosure>
              <Disclosure title="How each method performed" sub="Means ± SD, consistency (robustness), boxes placed, time and memory"><PerformanceTable stats={stats} /></Disclosure>
            </Disclosure>
            <Disclosure level={1} title="SP2 — Safety and delivery-order compliance" sub="CSR, C3–C6 over all boxes and over placed boxes">
              <Disclosure title="Compliance by rule and definition" sub="Both denominators, with the omnibus verdict per rule"><ComplianceTable stats={stats} /></Disclosure>
              <Disclosure title="Tests per measure" sub="Summary statistics, normality, omnibus, pairwise and effect sizes"><SP2 stats={stats} /></Disclosure>
            </Disclosure>
            <Disclosure level={1} title="SP3 — Computational resources" sub="Execution time and peak memory">
              <Disclosure title="Tests, charts and tables" sub="By heterogeneity class, all-instance tests, summary statistics"><SP3 stats={stats} /></Disclosure>
              {stats.SP3 && stats.SP3.available && <Disclosure title="Time and memory in one paragraph"><Sp3Note stats={stats} /></Disclosure>}
            </Disclosure>
            <Disclosure level={1} title="Supplementary" sub="Outcome, hypothesis test, composite ranking, baselines, run settings">
              <Disclosure title="Outcome and study provenance" sub="Outcome pattern, preliminary flag, test cases, preset, seeds, mode, commit">
                <div style={stack}><Banner stats={stats} /><ProvenanceStrip study={study} stats={stats} /><HypothesisFamily stats={stats} /></div>
              </Disclosure>
              <Disclosure title="Composite ranking" sub="Supplementary to SP1–SP3; needs ≥ 2 test cases">
                <div style={stack}><ScoreTable stats={stats} /><Overall stats={stats} /></div>
              </Disclosure>
              <Disclosure title="Baselines: Greedy and Random Order" sub="Outside SP1–SP3"><SupplementaryBaselines stats={stats} /></Disclosure>
              <Disclosure title="Extra numbers and run settings" sub="Median, min / max, run-to-run variation, timing method, support threshold, λ"><ExtraNumbers stats={stats} study={study} alwaysOpen /></Disclosure>
              <Disclosure title="Saved runs side by side" sub="Single runs from Run History; not a statistical comparison"><SavedRuns runHistory={runHistory} /></Disclosure>
            </Disclosure>
            {perLoad && (
              <Disclosure level={1} title="Per load and per run" sub="Configuration cards, measure-by-measure table, every run, trade-offs chart">
                {perLoad}
              </Disclosure>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
