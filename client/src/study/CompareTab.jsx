// client/src/study/CompareTab.jsx — "Want to know which method is actually
// better?" Four sub-tabs (SP1 / SP2 / SP3 / composite) over a study's stats
// block, plus a side-by-side view of saved single runs.
import React, { useState, useMemo } from "react";
import { Section, Empty, DescriptivesTable, NormalityTable, OmnibusCard, PairsTable, ConfoundNote, cell, ConfigName } from "./StatsTables";
import { ProvenanceStrip } from "./StudyResults";
import LineChart from "./LineChart";
import { fmt, label, sp1Summary, sp2Summary, sp3Summary, compositeSummary, MEASURE_PLAIN, DEFINITION_PLAIN } from "./verdicts";

const { th, td } = cell;

function SP1({ stats }) {
  const cmp = stats.SP1.comparison;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Section title="Result" desc="Is any method actually better at filling the container?">
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-main)" }}>{sp1Summary(stats)}</p>
        <div style={{ marginTop: 10 }}><ConfoundNote stats={stats} /></div>
      </Section>
      <Section title="All numbers at a glance" desc={`The full range of results for each method across ${stats.provenance.runs_per_configuration} runs.`}>
        <DescriptivesTable stats={stats} measures={[
          { code: "SU", label: "Container full (%)", get: (s, c) => s.descriptives.SU[c] },
          { code: "placed", label: "Boxes placed", get: (s, c) => s.descriptives.placed[c], fmt: (v) => fmt.num(v, 1) },
        ]} />
      </Section>
      <Section title="Do the numbers look normal?" desc="A quick check that decides which family of tests is appropriate.">
        <NormalityTable stats={stats} cmp={cmp} />
      </Section>
      <Section title="Are any of the differences real?" desc="One test asks whether there is any difference at all between the four methods.">
        <OmnibusCard cmp={cmp} measureCode="SU" />
      </Section>
      <Section title="Which methods are different from each other?" desc="Every pair, compared one at a time.">
        <PairsTable stats={stats} cmp={cmp} measureCode="SU" />
      </Section>
    </div>
  );
}

function SP2({ stats }) {
  const [def, setDef] = useState(stats.primary_compliance);
  const [measure, setMeasure] = useState("CSR");
  const blk = stats.SP2.by_definition[def];
  const cmp = blk.per_measure[measure];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Section title="Result" desc="Do the methods follow the safety rules by different amounts?"
        right={
          <div className="tabs-inline">
            {["all_boxes", "placed"].map((d) => (
              <button key={d} className={def === d ? "active" : ""} onClick={() => setDef(d)}>{DEFINITION_PLAIN[d]}{d === stats.primary_compliance ? " · primary" : ""}</button>
            ))}
          </div>
        }>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-main)" }}>{sp2Summary(stats, def)}</p>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Safety measure</th><th style={th}>Test</th><th style={th}>Statistic</th><th style={th}>Raw p</th><th style={th}>Holm-corrected p</th><th style={th}>Result</th></tr></thead>
            <tbody>
              {stats.SP2.measures.map((m) => {
                const o = blk.per_measure[m].omnibus;
                return (
                  <tr key={m} style={{ cursor: "pointer", background: m === measure ? "var(--primary-light)" : "transparent" }} onClick={() => setMeasure(m)}>
                    <td style={{ ...td, fontWeight: 700 }}>{MEASURE_PLAIN[m]}</td>
                    <td style={td}>{o.testable ? o.test : "—"}</td>
                    <td style={td}>{o.testable ? `${o.statistic_name} = ${fmt.num(o.statistic, 3)}, df = ${o.df.join(", ")}` : "—"}</td>
                    <td style={td}>{o.testable ? fmt.p(o.p) : "—"}</td>
                    <td style={td}>{o.testable ? fmt.p(o.p_holm) : "—"}</td>
                    <td style={{ ...td, color: o.testable ? (o.significant_holm ? "var(--green)" : "var(--text-muted)") : "var(--text-dim)" }}>
                      {o.testable ? (o.significant_holm ? "Yes — methods differ" : "No difference detected") : o.reason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>Holm-Bonferroni across the {blk.holm_family_size} testable measure(s). Click a row to see its details below. {blk.decision}.</p>
      </Section>
      <Section title={`Details — ${MEASURE_PLAIN[measure]} (${DEFINITION_PLAIN[def]})`}>
        <DescriptivesTable stats={{ ...stats, descriptives: stats.descriptives }} measures={[
          { code: measure, label: `${MEASURE_PLAIN[measure]} (%)`, get: (s, c) => s.descriptives[measure][def][c] },
        ]} />
        <div style={{ marginTop: 16 }}><NormalityTable stats={stats} cmp={cmp} /></div>
        <div style={{ marginTop: 16 }}><OmnibusCard cmp={cmp} measureCode={measure} holm /></div>
        <div style={{ marginTop: 16 }}><PairsTable stats={stats} cmp={cmp} measureCode={measure} /></div>
      </Section>
    </div>
  );
}

function SP3({ stats, study }) {
  const s3 = stats.SP3;
  const [metric, setMetric] = useState("ET");
  if (!s3.available) {
    return <Empty title="Time and memory were not compared" text={`${s3.reason}.`} />;
  }
  const cmp = s3.per_metric[metric];
  const prof = s3.profiles || [];
  const configs = stats.configurations;
  const xLabels = prof.map((p) => ({ label: `${p.br_class} — ${p.n_types ?? "?"} types`, sub: `${p.n_boxes.join("/")} boxes` }));
  const series = configs.map((c) => ({ code: c, label: label(stats, c), points: prof.map((p, i) => ({ x: i, y: p.per_configuration[c][metric].mean })) }));
  const fr = s3.friedman && s3.friedman[metric];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Section title="Result" desc="Time and memory as loads get more heterogeneous (BR1 = 3 box types … BR7 = 20 box types).">
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-main)" }}>{sp3Summary(stats)}</p>
      </Section>
      <Section title={`${MEASURE_PLAIN[metric]} by test case`} desc="x-axis: heterogeneity class (number of box types); the box count of each instance is the secondary label."
        right={<div className="tabs-inline">{["ET", "PM"].map((m) => <button key={m} className={metric === m ? "active" : ""} onClick={() => setMetric(m)}>{MEASURE_PLAIN[m]}</button>)}</div>}>
        <LineChart series={series} xLabels={xLabels} yLabel={metric === "ET" ? "seconds" : "MB"} yFmt={(v) => (metric === "ET" ? (v / 1000).toFixed(1) : v.toFixed(0))} />
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Method</th>{prof.map((p) => <th key={p.br_class} style={th}>{p.br_class} ({p.n_types ?? "?"} types)<div style={{ fontWeight: 400 }}>{p.n_boxes.join(" / ")} boxes</div></th>)}</tr></thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c}>
                  <td style={{ ...td, fontWeight: 700 }}>{label(stats, c)}</td>
                  {prof.map((p) => {
                    const e = p.per_configuration[c];
                    return <td key={p.br_class} style={td}>{fmt.ms(e.ET.mean)} / {fmt.mb(e.PM.mean)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>Each cell: mean time / mean peak memory over the seeds of that class.</p>
      </Section>
      <Section title="All numbers at a glance">
        <DescriptivesTable stats={stats} measures={[
          { code: "ET", label: "Time (s)", get: (s, c) => s.descriptives.ET[c], fmt: (v) => (v === null || v === undefined ? "—" : (v / 1000).toFixed(2)) },
          { code: "PM", label: "Peak memory (MB)", get: (s, c) => s.descriptives.PM[c], fmt: (v) => fmt.num(v, 1) },
        ]} />
      </Section>
      <Section title={`Do the numbers look normal? — ${MEASURE_PLAIN[metric]}`}>
        <NormalityTable stats={stats} cmp={cmp} unitFmt={(v) => (metric === "ET" ? (v / 1000).toFixed(2) : fmt.num(v, 1))} />
      </Section>
      <Section title="Are any of the differences real?" desc="Holm-corrected across the two metrics (time, memory).">
        <OmnibusCard cmp={cmp} measureCode={metric} holm />
      </Section>
      <Section title="Which methods are different from each other?">
        <PairsTable stats={stats} cmp={cmp} measureCode={metric} />
      </Section>
      <Section title="Is the ranking consistent across test cases?" desc="Friedman test with the test cases as blocks (per-instance means).">
        {fr && fr.testable ? (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div className="stat-chip"><div className="stat-chip-label">Friedman χ²</div><div className="stat-chip-value" style={{ fontSize: 22 }}>{fmt.num(fr.statistic, 2)}</div><div className="stat-chip-sub">df = {fr.df.join(", ")} · {fr.blocks} test cases</div></div>
            <div className="stat-chip"><div className="stat-chip-label">p</div><div className="stat-chip-value" style={{ fontSize: 22, color: fr.significant ? "var(--green)" : "var(--text-muted)" }}>{fmt.p(fr.p)}</div><div className="stat-chip-sub">{fr.significant ? "rankings are consistent" : "rankings not distinguishable from chance"}</div></div>
            <div className="stat-chip" style={{ flex: "2 1 260px" }}><div className="stat-chip-label">Mean rank (1 = best)</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>{Object.entries(fr.mean_rank).sort((a, b) => a[1] - b[1]).map(([c, r]) => `${label(stats, c)} ${fmt.num(r, 2)}`).join(" · ")}</div></div>
          </div>
        ) : <p style={{ fontSize: 13, color: "var(--text-dim)" }}>{fr ? fr.reason : "—"}</p>}
      </Section>
    </div>
  );
}

function Overall({ stats }) {
  const cs = stats.composite;
  if (!cs.available) return <Empty title="No overall ranking for this study" text={`${cs.reason}.`} />;
  const fr = cs.friedman;
  const configs = stats.configurations;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Section title="What we recommend" desc="Based on all the numbers — a recommendation exists only when the ranking passes the Friedman test.">
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-main)" }}>{compositeSummary(stats)}</p>
      </Section>
      <Section title="Overall ranking" desc="Mean composite score (0–5) and mean rank across test cases. Lower rank = better.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Method</th><th style={th}>Container full</th><th style={th}>Rules followed</th><th style={th}>Speed & memory</th><th style={th}>Consistency</th><th style={th}>Overall (0–5)</th><th style={th}>± sd</th><th style={th}>Mean rank</th></tr></thead>
            <tbody>
              {cs.ranking.map((c) => {
                const k = cs.components[c];
                return (
                  <tr key={c} style={{ background: cs.recommendation && cs.recommendation.configuration === c ? "var(--primary-light)" : "transparent" }}>
                    <td style={{ ...td, fontWeight: 700 }}><ConfigName stats={stats} code={c} /></td>
                    <td style={td}>{fmt.num(k.SU_n * 5, 2)}</td><td style={td}>{fmt.num(k.CSR_n * 5, 2)}</td><td style={td}>{fmt.num((1 - k.CC_n) * 5, 2)}</td><td style={td}>{fmt.num((1 - k.Rob_n) * 5, 2)}</td>
                    <td style={{ ...td, fontWeight: 800 }}>{fmt.num(cs.mean_cs[c] * 5, 2)}</td>
                    <td style={td}>{cs.sd_cs[c] === null ? "—" : fmt.num(cs.sd_cs[c] * 5, 2)}</td>
                    <td style={td}>{fr.testable ? fmt.num(fr.mean_rank[c], 2) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Score per test case" desc="CS(c, p) — each row is one test case; ~ values are min-max scaled within the row.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Test case</th>{configs.map((c) => <th key={c} style={th}>{label(stats, c)}</th>)}</tr></thead>
            <tbody>
              {cs.per_instance.map((row) => {
                const inst = (stats.provenance.instances || []).find((i) => i.instance_id === row.instance_id);
                return (
                  <tr key={row.instance_id}>
                    <td style={{ ...td, fontWeight: 700 }}>{inst ? `${inst.br_class} — ${inst.n_types ?? "?"} box types (instance ${inst.instance_id}, ${inst.n_boxes} boxes)` : row.instance_id}</td>
                    {configs.map((c) => {
                      const k = row.per_configuration[c];
                      return <td key={c} style={td} title={`SU ${fmt.num(k.SU, 2)}% · CSR ${fmt.num(k.CSR, 2)}% · ET ${fmt.ms(k.ET)} · PM ${fmt.mb(k.PM)} · Rob ${fmt.num(k.Rob, 2)}`}>{fmt.num(k.CS * 5, 2)}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Are the rankings real?" desc="Friedman test on the composite score (test cases × 4 methods).">
        {fr.testable ? (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div className="stat-chip"><div className="stat-chip-label">Friedman χ²</div><div className="stat-chip-value" style={{ fontSize: 22 }}>{fmt.num(fr.statistic, 2)}</div><div className="stat-chip-sub">df = {fr.df.join(", ")} · {fr.blocks} test cases</div></div>
            <div className="stat-chip"><div className="stat-chip-label">p</div><div className="stat-chip-value" style={{ fontSize: 22, color: fr.significant ? "var(--green)" : "var(--text-muted)" }}>{fmt.p(fr.p)}</div><div className="stat-chip-sub">{fr.significant ? "Yes — the rankings are real" : "No — not distinguishable from chance"}</div></div>
          </div>
        ) : <p style={{ fontSize: 13, color: "var(--text-dim)" }}>{fr.reason}</p>}
        {fr.posthoc && (
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Comparing</th><th style={th}>Nemenyi p</th><th style={th}>Verdict</th></tr></thead>
              <tbody>
                {fr.posthoc.pairs.map((p) => (
                  <tr key={p.a + p.b}>
                    <td style={{ ...td, fontWeight: 600 }}>{label(stats, p.a)} vs {label(stats, p.b)}</td>
                    <td style={td}>{fmt.p(p.p)}</td>
                    <td style={{ ...td, color: p.significant ? "var(--primary)" : "var(--text-dim)", fontWeight: 700 }}>{p.significant && p.favours ? `${label(stats, p.favours)} ranks higher` : "statistically tied"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── side-by-side saved runs (single Quick Test runs from Run history) ────────
function SavedRuns({ runHistory }) {
  const [picked, setPicked] = useState([]);
  const rows = useMemo(() => runHistory.filter((r) => picked.includes(r.id)), [runHistory, picked]);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p));
  if (!runHistory.length) return <Empty title="No saved runs" text="Quick Test runs are saved to Run history; pick up to four here to view them side by side." />;
  const allBox = (r) => (r.csr == null || r.placed == null || !r.n_items ? null : (r.csr * r.placed) / r.n_items);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Section title="Pick up to four saved runs" desc="Single runs are not a statistical comparison — use a Full Comparison for that. This view only places saved runs next to each other.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {runHistory.slice(0, 40).map((r) => (
            <button key={r.id} className={`btn btn-sm ${picked.includes(r.id) ? "btn-primary" : "btn-secondary"}`} onClick={() => toggle(r.id)}>
              #{r.id} {r.strategy} · {r.instance} · seed {r.seed ?? "?"}
            </button>
          ))}
        </div>
      </Section>
      {rows.length > 0 && (
        <Section title="Side by side">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Measure</th>{rows.map((r) => <th key={r.id} style={th}>#{r.id} {r.strategy}<div style={{ fontWeight: 400 }}>{r.instance} · seed {r.seed ?? "?"}</div></th>)}</tr></thead>
              <tbody>
                {[
                  ["Container full", (r) => fmt.pct(r.space_util, 2)],
                  ["Rules followed (all boxes)", (r) => fmt.pct(allBox(r), 2)],
                  ["Rules followed (placed)", (r) => fmt.pct(r.csr, 2)],
                  ["Boxes placed", (r) => (r.placed == null ? "—" : `${r.placed} / ${r.n_items}`)],
                  ["Time", (r) => (r.runtime_s == null ? "—" : `${Number(r.runtime_s).toFixed(1)} s`)],
                  ["Saved", (r) => (r.created_at ? new Date(r.created_at).toLocaleString() : "—")],
                ].map(([name, get]) => (
                  <tr key={name}><td style={{ ...td, fontWeight: 700 }}>{name}</td>{rows.map((r) => <td key={r.id} style={td}>{get(r)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

const SUBTABS = [
  { id: "sp1", label: "Container full" },
  { id: "sp2", label: "Safety rules" },
  { id: "sp3", label: "Time & memory" },
  { id: "overall", label: "Overall" },
  { id: "saved", label: "Saved runs side by side" },
];

export default function CompareTab({ study, stats, row, runHistory, studies, selectedStudyId, onSelectStudy }) {
  const [sub, setSub] = useState("sp1");
  const ready = row && row.status !== "running" && study && stats;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 className="font-display" style={{ fontSize: 20, fontWeight: 600 }}>Want to know which method is actually better?</h3>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>These tables show whether the differences are real or just luck. If you're new to this, start with "Overall".</span>
        </div>
        <StudySelect studies={studies} value={selectedStudyId} onChange={onSelectStudy} />
      </div>
      <div className="tabs-inline">
        {SUBTABS.map((t) => <button key={t.id} className={sub === t.id ? "active" : ""} onClick={() => setSub(t.id)}>{t.label}</button>)}
      </div>
      {sub === "saved" ? <SavedRuns runHistory={runHistory} /> : !ready ? (
        <Empty title={row && row.status === "running" ? "This study is still running" : "No study selected"} text={row && row.status === "running" ? "Come back when every run has finished." : "Run a Full Comparison or import a precomputed study to compare the four configurations."} />
      ) : (
        <>
          <ProvenanceStrip study={study} stats={stats} />
          {sub === "sp1" && <SP1 stats={stats} />}
          {sub === "sp2" && <SP2 stats={stats} />}
          {sub === "sp3" && <SP3 stats={stats} study={study} />}
          {sub === "overall" && <Overall stats={stats} />}
        </>
      )}
    </div>
  );
}

export function StudySelect({ studies, value, onChange }) {
  return (
    <select className="field-input" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      style={{ padding: "8px 12px", fontSize: 13, fontWeight: 600, minWidth: 260 }}>
      <option value="">— {studies.length ? "select a study" : "no studies yet"} —</option>
      {studies.map((s) => (
        <option key={s.id} value={s.id}>#{s.id} {s.name} · {s.status}{s.n_runs ? ` · ${s.n_runs} runs` : ""}</option>
      ))}
    </select>
  );
}
