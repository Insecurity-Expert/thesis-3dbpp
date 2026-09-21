// client/src/study/StudyResults.jsx — the Results view of a study (four
// configurations x N runs). Layout follows design/Updated_Prototype.html;
// every number and sentence is computed from the study file's stats block.
import React from "react";
import { Section, Empty, ConfigName, cell, ConfoundNote } from "./StatsTables";
import { fmt, label, outcomeBanner, compositeSummary, sp1Summary, sp2Summary, sp3Summary, provenanceItems, MEASURE_PLAIN, DEFINITION_PLAIN } from "./verdicts";

const { th, td } = cell;

export function ProvenanceStrip({ study, stats }) {
  const pv = (stats && stats.provenance) || {};
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", fontSize: 12, color: "var(--text-dim)", padding: "10px 14px", background: "var(--bg-input)", borderRadius: 8, border: "1px solid var(--border)", alignItems: "center" }}>
      {pv.preliminary && (
        <span className="badge badge-warn" title={pv.preliminary_reason} style={{ textTransform: "none" }}>Preliminary — {pv.preliminary_reason}</span>
      )}
      {provenanceItems(study, stats).map(([k, v]) => (
        <span key={k}><span style={{ fontWeight: 700 }}>{k}:</span> <span style={{ color: "var(--text-muted)" }}>{String(v)}</span></span>
      ))}
    </div>
  );
}

export function StudyProgress({ progress, study }) {
  if (!progress) return null;
  const per = progress.per_configuration || {};
  const pct = progress.total ? (100 * (progress.done || 0)) / progress.total : 0;
  return (
    <Section title="Packing your boxes…" desc={`Run ${progress.done || 0} of ${progress.total || "?"} — ${progress.mode === "serial" ? "one run at a time (timing valid)" : "several runs at once (timing flagged concurrent)"}${progress.elapsed_s ? ` · ${Math.round(progress.elapsed_s)} s elapsed` : ""}`}>
      <div style={{ height: 10, background: "var(--bg-input)", borderRadius: 5, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, var(--primary), var(--blush))", transition: "width 0.4s ease" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {Object.entries(per).map(([c, p]) => (
          <div key={c} style={{ fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 4 }}>
              <span>{(study && study.configuration_labels && study.configuration_labels[c]) || c}</span><span>{p.done} / {p.total}</span>
            </div>
            <div style={{ height: 6, background: "var(--bg-input)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p.total ? (100 * p.done) / p.total : 0}%`, background: "var(--primary)" }} />
            </div>
          </div>
        ))}
      </div>
      {progress.last_run && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 12 }}>
          Last finished: {progress.last_run.configuration} seed {progress.last_run.seed} — container {fmt.pct(progress.last_run.su_pct)} full, CSR {fmt.pct(progress.last_run.csr_pct)}, {fmt.ms(progress.last_run.exec_time_ms)}.
        </div>
      )}
      {progress.status === "error" && <div className="alert-danger" style={{ marginTop: 12 }}>⚠ {progress.error}</div>}
    </Section>
  );
}

function Banner({ stats }) {
  const b = outcomeBanner(stats);
  if (!b) return null;
  const winner = b.kind === "winner";
  return (
    <div style={{ padding: "22px 26px", borderRadius: 14, border: `1px solid ${winner ? "var(--primary)" : "var(--border)"}`, background: winner ? "var(--primary-light)" : "var(--bg-card)", boxShadow: "var(--shadow)" }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: winner ? "var(--primary-hover)" : "var(--text-dim)" }}>
        {winner ? "🏆 Recommendation — from the composite ranking" : b.kind === "info" ? "Overall ranking" : "Outcome"}
      </div>
      <div className="font-display" style={{ fontSize: 24, fontWeight: 600, marginTop: 4, color: "var(--text-main)" }}>{b.title}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>{b.sub}</div>
    </div>
  );
}

function ScoreTable({ stats }) {
  const cs = stats.composite;
  if (!cs || !cs.available) return null;
  const rec = cs.recommendation && cs.recommendation.configuration;
  const ranked = cs.ranking;
  return (
    <Section title="Overall score for all four methods" desc={`Four things matter equally — container fill, rule compliance (${DEFINITION_PLAIN[cs.csr_definition]}), computational cost (time and memory) and consistency — each scaled 0–5 within every test case, then averaged over ${cs.n_instances} test cases. Higher is better.`}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Method</th><th style={th}>Container full</th><th style={th}>Rules followed</th><th style={th}>Speed & memory</th><th style={th}>Consistency</th><th style={th}>Overall</th><th style={th}>Rank</th>
          </tr></thead>
          <tbody>
            {ranked.map((c, i) => {
              const k = cs.components[c];
              const isRec = c === rec;
              return (
                <tr key={c} style={{ background: isRec ? "var(--primary-light)" : "transparent" }}>
                  <td style={{ ...td, fontWeight: 700 }}><ConfigName stats={stats} code={c} />{isRec && <span className="badge badge-primary" style={{ marginLeft: 8 }}>recommended</span>}</td>
                  <td style={td}>{fmt.num(k.SU_n * 5, 2)}</td>
                  <td style={td}>{fmt.num(k.CSR_n * 5, 2)}</td>
                  <td style={td}>{fmt.num((1 - k.CC_n) * 5, 2)}</td>
                  <td style={td}>{fmt.num((1 - k.Rob_n) * 5, 2)}</td>
                  <td style={{ ...td, fontWeight: 800, fontSize: 15 }}>{fmt.num(cs.mean_cs[c] * 5, 2)} / 5</td>
                  <td style={td}>{i + 1}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>{compositeSummary(stats)}</p>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>Score = CS × 5 where {cs.formula}.</p>
    </Section>
  );
}

function ComplianceTable({ stats }) {
  const sp2 = stats.SP2;
  const configs = stats.configurations;
  const primary = stats.primary_compliance;
  const measures = sp2.measures;
  return (
    <Section title="Did everything follow the safety rules?" desc="Each cell is the average share of boxes that satisfied the rule, across all runs. Two denominators are shown: over all boxes of the load (unplaced boxes count as non-compliant — the manuscript's definition) and over the boxes that were placed.">
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Safety rule</th><th style={th}>Definition</th>
            {configs.map((c) => <th key={c} style={th}>{label(stats, c)}</th>)}
            <th style={th}>Do the methods differ?</th>
          </tr></thead>
          <tbody>
            {measures.map((m) => ["all_boxes", "placed"].map((d, di) => {
              const cmp = sp2.by_definition[d].per_measure[m];
              const o = cmp.omnibus;
              const isPrimary = d === primary;
              return (
                <tr key={m + d} style={{ background: isPrimary ? "transparent" : "var(--bg-input)" }}>
                  {di === 0 && <td style={{ ...td, fontWeight: 700 }} rowSpan={2}>{MEASURE_PLAIN[m]}</td>}
                  <td style={{ ...td, fontSize: 11.5, color: isPrimary ? "var(--text-main)" : "var(--text-dim)" }}>
                    {DEFINITION_PLAIN[d]}{isPrimary && <span className="badge badge-primary" style={{ marginLeft: 6 }}>primary</span>}
                  </td>
                  {configs.map((c) => <td key={c} style={{ ...td, fontWeight: isPrimary ? 700 : 500 }}>{fmt.pct(stats.descriptives[m][d][c].mean, 2)}</td>)}
                  <td style={{ ...td, fontSize: 12, color: o.testable ? (o.significant_holm ? "var(--green)" : "var(--text-muted)") : "var(--text-dim)" }}>
                    {o.testable ? (o.significant_holm ? `Yes (Holm p = ${fmt.p(o.p_holm)})` : `No (Holm p = ${fmt.p(o.p_holm)})`) : o.reason}
                  </td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>{sp2Summary(stats, primary)}</p>
    </Section>
  );
}

function PerformanceTable({ stats }) {
  const configs = stats.configurations;
  const d = stats.descriptives;
  const primary = stats.primary_compliance;
  const timingOk = stats.provenance.timing_valid;
  return (
    <Section title="How each method performed" desc={`Averages across ${stats.provenance.runs_per_configuration} runs per method. The ± number is the spread (standard deviation) — smaller means more predictable.`}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Method</th><th style={th}>Container full</th><th style={th}>Consistency</th><th style={th}>Rules followed ({DEFINITION_PLAIN[primary]})</th><th style={th}>Boxes placed</th><th style={th}>Time</th><th style={th}>Memory</th>
          </tr></thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c}>
                <td style={{ ...td, fontWeight: 700 }}><ConfigName stats={stats} code={c} /></td>
                <td style={td}>{fmt.pct(d.SU[c].mean, 2)} ± {fmt.num(d.SU[c].sd, 2)}</td>
                <td style={td}>± {fmt.num(stats.robustness[c].sd_su, 2)}% run-to-run</td>
                <td style={td}>{fmt.pct(d.CSR[primary][c].mean, 2)} <span style={{ color: "var(--text-dim)", fontSize: 11 }}>({fmt.pct(d.CSR.placed[c].mean, 2)} over placed)</span></td>
                <td style={td}>{fmt.num(d.placed[c].mean, 1)} ± {fmt.num(d.placed[c].sd, 1)}</td>
                <td style={td}>{fmt.ms(d.ET[c].mean)}{timingOk ? "" : " *"}</td>
                <td style={td}>{fmt.mb(d.PM[c].mean)}{timingOk ? "" : " *"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!timingOk && <p style={{ fontSize: 12, color: "var(--amber)", marginTop: 8 }}>* {stats.provenance.timing_note} — time and memory are shown for reference only and are not tested.</p>}
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>{sp1Summary(stats)}</p>
      <div style={{ marginTop: 10 }}><ConfoundNote stats={stats} /></div>
    </Section>
  );
}

function ExtraNumbers({ stats, study }) {
  const configs = stats.configurations;
  const d = stats.descriptives;
  const [open, setOpen] = React.useState(false);
  return (
    <Section title="Extra technical numbers" desc="For reference only — not part of the overall score." right={<button className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Show"}</button>}>
      {open && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Method</th><th style={th}>Median fill</th><th style={th}>Lowest / highest fill</th><th style={th}>Run-to-run variation (sd of fill)</th><th style={th}>Time min / max</th><th style={th}>Memory min / max</th><th style={th}>Runs</th></tr></thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c}>
                  <td style={{ ...td, fontWeight: 700 }}>{label(stats, c)}</td>
                  <td style={td}>{fmt.pct(d.SU[c].median, 2)}</td>
                  <td style={td}>{fmt.pct(d.SU[c].min, 2)} / {fmt.pct(d.SU[c].max, 2)}</td>
                  <td style={td}>{fmt.num(d.SU[c].sd, 3)}</td>
                  <td style={td}>{fmt.ms(d.ET[c].min)} / {fmt.ms(d.ET[c].max)}</td>
                  <td style={td}>{fmt.mb(d.PM[c].min)} / {fmt.mb(d.PM[c].max)}</td>
                  <td style={td}>{d.SU[c].n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>
            Timing method: {study.timing_method || "—"}. Support threshold {study.support_threshold ?? "—"}; λ = {study.lambdas ? Object.values(study.lambdas).join(" / ") : "—"} (C3 / C4 / C5 / C6); decode-time enforcement of C5 {study.enforce_support ? "on" : "off"}, C4 {study.enforce_fragility ? "on" : "off"}.
          </p>
        </div>
      )}
    </Section>
  );
}

export default function StudyResults({ study, stats, progress, row, onOpenCompare }) {
  if (!row) return <Empty title="No study selected" text="Run a Full Comparison from Start analysis, or import a precomputed study, to see results here." />;
  if (row.status === "running" || (progress && progress.status === "running")) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <StudyProgress progress={progress} study={study} />
        <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Container fill (SP1) and safety rules (SP2) appear here when every run has finished. {row.n_instances === 1 || (row.params && row.params.instanceId !== null && row.params.instanceId !== undefined) ? "The overall ranking needs ≥ 2 test cases, so this study will not name a winner." : ""}</p>
      </div>
    );
  }
  if (row.status === "error") {
    return <Empty title="This study did not finish" text={(progress && progress.error) || "The study process stopped before writing results."} />;
  }
  if (!study || !stats) return <Empty title="No results yet" text="The study file has no statistics attached." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Banner stats={stats} />
      <ProvenanceStrip study={study} stats={stats} />
      <ScoreTable stats={stats} />
      <ComplianceTable stats={stats} />
      <PerformanceTable stats={stats} />
      {stats.SP3 && stats.SP3.available && (
        <Section title="Time and memory" desc="Serial study — timing is valid.">
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 }}>{sp3Summary(stats)}</p>
        </Section>
      )}
      <ExtraNumbers stats={stats} study={study} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={onOpenCompare}>Are the differences real? Open Compare →</button>
      </div>
    </div>
  );
}
