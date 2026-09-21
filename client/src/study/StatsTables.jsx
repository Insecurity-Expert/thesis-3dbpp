// client/src/study/StatsTables.jsx — building blocks shared by the study views.
// All text comes from stats fields through verdicts.js templates.
import React from "react";
import { fmt, label, pairVerdict, effectPlain, normalitySentence, omnibusSentence, pairSentence, MEASURE_PLAIN, CONFIG_DESC } from "./verdicts";

export function Section({ title, desc, children, right }) {
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 12 }}>
        <div>
          <div className="card-title">{title}</div>
          {desc && <div className="card-desc">{desc}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Empty({ title, text }) {
  return (
    <div style={{ padding: "40px", textAlign: "center", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px" }}>
      <span style={{ fontSize: "28px" }}>📊</span>
      <h4 style={{ marginTop: "12px", color: "var(--text-muted)" }}>{title}</h4>
      <p style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "4px" }}>{text}</p>
    </div>
  );
}

export function ConfigName({ stats, code, desc = true }) {
  return (
    <span>
      <b style={{ color: "var(--text-main)" }}>{label(stats, code)}</b>
      {desc && <span style={{ color: "var(--text-dim)", fontSize: 11, display: "block" }}>{CONFIG_DESC[code] || ""}</span>}
    </span>
  );
}

const th = { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dim)", fontWeight: 700, padding: "8px 10px", borderBottom: "1px solid var(--border)", textAlign: "left", whiteSpace: "nowrap" };
const td = { fontSize: 13, padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "top" };
export const cell = { th, td };

export function DescriptivesTable({ stats, measures }) {
  // measures: [{code, get: (stats, cfg) => descriptives, unit}]
  const configs = stats.configurations;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>
          <th style={th}>Configuration</th><th style={th}>Measure</th>
          <th style={th}>Average</th><th style={th}>Middle (median)</th><th style={th}>Spread (sd)</th><th style={th}>Lowest</th><th style={th}>Highest</th><th style={th}>Runs</th>
        </tr></thead>
        <tbody>
          {configs.map((c) => measures.map((m, i) => {
            const d = m.get(stats, c) || {};
            const f = m.fmt || ((v) => fmt.num(v, 2));
            return (
              <tr key={c + m.code}>
                {i === 0 && <td style={{ ...td, fontWeight: 700 }} rowSpan={measures.length}><ConfigName stats={stats} code={c} /></td>}
                <td style={td}>{m.label || MEASURE_PLAIN[m.code] || m.code}</td>
                <td style={{ ...td, fontWeight: 700 }}>{f(d.mean)}</td>
                <td style={td}>{f(d.median)}</td>
                <td style={td}>{d.sd === null || d.sd === undefined ? "—" : f(d.sd)}</td>
                <td style={td}>{f(d.min)}</td>
                <td style={td}>{f(d.max)}</td>
                <td style={td}>{d.n ?? "—"}</td>
              </tr>
            );
          }))}
        </tbody>
      </table>
    </div>
  );
}

export function NormalityTable({ stats, cmp, unitFmt }) {
  const f = unitFmt || ((v) => fmt.num(v, 2));
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Configuration</th><th style={th}>Average ± spread</th><th style={th}>Shapiro-Wilk W</th><th style={th}>p</th><th style={th}>Numbers look normal?</th></tr></thead>
          <tbody>
            {Object.entries(cmp.normality).map(([c, n]) => {
              const d = cmp.descriptives[c] || {};
              return (
                <tr key={c}>
                  <td style={{ ...td, fontWeight: 700 }}>{label(stats, c)}</td>
                  <td style={td}>{f(d.mean)} ± {d.sd === null || d.sd === undefined ? "—" : f(d.sd)}</td>
                  <td style={td}>{n.applicable ? fmt.num(n.W, 3) : "—"}</td>
                  <td style={td}>{n.applicable ? fmt.p(n.p) : "—"}</td>
                  <td style={{ ...td, color: n.applicable ? (n.normal ? "var(--green)" : "var(--amber)") : "var(--text-dim)" }}>
                    {n.applicable ? (n.normal ? "Yes" : "No — rank-based tests") : `Not applicable — ${n.reason}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>{normalitySentence(cmp)}</p>
    </div>
  );
}

export function OmnibusCard({ cmp, measureCode, holm }) {
  const o = cmp.omnibus;
  const sig = holm ? o.significant_holm : o.significant;
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
      <div className="stat-chip" style={{ flex: "1 1 200px" }}>
        <div className="stat-chip-label">Test</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>{o.testable ? o.test : "Not testable"}</div>
        <div className="stat-chip-sub">{o.testable ? `${o.statistic_name} = ${fmt.num(o.statistic, 3)}${o.df ? `, df = ${o.df.join(", ")}` : ""}` : o.reason}</div>
      </div>
      <div className="stat-chip" style={{ flex: "1 1 160px" }}>
        <div className="stat-chip-label">{holm ? "Holm-corrected p" : "p-value"}</div>
        <div className="stat-chip-value" style={{ fontSize: 22, color: sig ? "var(--green)" : "var(--text-muted)" }}>{o.testable ? fmt.p(holm ? o.p_holm : o.p) : "—"}</div>
        <div className="stat-chip-sub">{holm && o.testable ? `raw p = ${fmt.p(o.p)} · family of ${o.holm_family_size}` : `two-tailed, α = 0.05`}</div>
      </div>
      <div className="stat-chip" style={{ flex: "2 1 260px" }}>
        <div className="stat-chip-label">Result</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4, color: o.testable ? (sig ? "var(--green)" : "var(--text-muted)") : "var(--text-dim)" }}>
          {!o.testable ? "Cannot be tested" : sig ? "Yes — the configurations are not all the same" : "No difference detected"}
        </div>
        <div className="stat-chip-sub">{omnibusSentence(cmp, measureCode, { holm })}</div>
      </div>
    </div>
  );
}

export function PairsTable({ stats, cmp, measureCode }) {
  if (!cmp.pairs || !cmp.pairs.length) {
    return <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>No pairwise comparisons: {cmp.omnibus.reason || "the omnibus test could not be run"}.</p>;
  }
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={th}>Comparing</th><th style={th}>Averages</th><th style={th}>{cmp.posthoc_test} p</th><th style={th}>Is the difference real?</th><th style={th}>How big ({cmp.effect_size})</th><th style={th}>Verdict</th>
          </tr></thead>
          <tbody>
            {cmp.pairs.map((p) => {
              const v = pairVerdict(stats, p);
              return (
                <tr key={p.a + p.b}>
                  <td style={{ ...td, fontWeight: 600 }}>{label(stats, p.a)} vs {label(stats, p.b)}</td>
                  <td style={td}>{fmt.num(p.mean_a, 2)} vs {fmt.num(p.mean_b, 2)}</td>
                  <td style={td}>{fmt.p(p.p)}</td>
                  <td style={{ ...td, color: p.significant ? "var(--green)" : "var(--text-dim)" }}>{p.significant ? "Yes" : "No"}</td>
                  <td style={td}>{effectPlain(p.effect)}{p.effect.practical ? "" : " — below threshold"}</td>
                  <td style={{ ...td, fontWeight: 700, color: v.kind === "outperforms" ? "var(--primary)" : v.kind === "detectable" ? "var(--amber)" : "var(--text-dim)" }}>{v.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.6, paddingLeft: 18 }}>
        {cmp.pairs.map((p) => <li key={p.a + p.b}>{pairSentence(stats, p, measureCode)}</li>)}
      </ul>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
        A configuration "outperforms" another only when all three hold: the corrected post-hoc test is significant, the effect size reaches the threshold ({cmp.effect_size === "Cohen's d" ? "|d| ≥ 0.5" : "|r| ≥ 0.3"}), and the direction favours it. "Statistically detectable but not practically meaningful" means the first holds and the second does not.
      </p>
    </div>
  );
}

export function ConfoundNote({ stats }) {
  const note = stats && stats.SP1 && stats.SP1.confound_note;
  if (!note) return null;
  return (
    <div className="info-callout" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
      <b>Confound (Chapter 3):</b> {note}
    </div>
  );
}
