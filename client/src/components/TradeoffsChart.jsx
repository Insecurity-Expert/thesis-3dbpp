// Trade-offs: one dot per real run of a method on this load. x = container
// fill (%), y = rule-following over all boxes (%). Runs no other run beats on
// both at once are circled ("best of both"). Hover a dot for its numbers; the
// same data is available as a table.
import React, { useMemo, useState } from "react";
import { tradeoffPoints, nonDominated } from "../viewer/tradeoffs";

const W = 560, H = 320, M = { t: 16, r: 18, b: 44, l: 52 };

function ticks(lo, hi, n = 5) {
  const step = (hi - lo) / (n - 1);
  return Array.from({ length: n }, (_, i) => lo + i * step);
}

export default function TradeoffsChart({ runs, methodName }) {
  const [hover, setHover] = useState(null);
  const pts = useMemo(() => tradeoffPoints(runs), [runs]);
  const best = useMemo(() => new Set(nonDominated(pts).map((p) => p.key)), [pts]);
  if (!pts.length) return <div className="field-hint">No runs for this method.</div>;
  const pad = (lo, hi) => { const d = Math.max(hi - lo, 1); return [Math.max(0, lo - d * 0.15), Math.min(100, hi + d * 0.15)]; };
  const [x0, x1] = pad(Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)));
  const [y0, y1] = pad(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)));
  const sx = (v) => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
  const sy = (v) => H - M.b - ((v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);
  const f1 = (v) => Number(v).toFixed(1);
  return (
    <div>
      <div style={{ position: "relative", maxWidth: W }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} role="img"
          aria-label={`Trade-offs for ${methodName}: ${pts.length} runs, ${best.size} best-of-both`}>
          {ticks(y0, y1).map((t) => (
            <g key={`y${t}`}>
              <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth="1" />
              <text x={M.l - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-dim)">{f1(t)}%</text>
            </g>
          ))}
          {ticks(x0, x1).map((t) => (
            <text key={`x${t}`} x={sx(t)} y={H - M.b + 16} textAnchor="middle" fontSize="11" fill="var(--text-dim)">{f1(t)}%</text>
          ))}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--border-strong)" />
          <text x={(M.l + W - M.r) / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--text-muted)">Container fill →</text>
          <text x={14} y={(M.t + H - M.b) / 2} textAnchor="middle" fontSize="12" fill="var(--text-muted)" transform={`rotate(-90 14 ${(M.t + H - M.b) / 2})`}>Rule-following, all boxes →</text>
          {pts.map((p) => (
            <g key={p.key} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
              <circle cx={sx(p.x)} cy={sy(p.y)} r="12" fill="transparent" />
              {best.has(p.key) && <circle cx={sx(p.x)} cy={sy(p.y)} r="9" fill="none" stroke="var(--primary-hover)" strokeWidth="2" />}
              <circle cx={sx(p.x)} cy={sy(p.y)} r="4.5" fill="var(--primary)" stroke="var(--bg-card)" strokeWidth="2" />
            </g>
          ))}
        </svg>
        {hover && (
          <div style={{ position: "absolute", left: `${(sx(hover.x) / W) * 100}%`, top: `${(sy(hover.y) / H) * 100}%`, transform: "translate(12px, -110%)",
                        background: "var(--bg-card)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "6px 10px", fontSize: 12, boxShadow: "var(--shadow-2)", pointerEvents: "none", whiteSpace: "nowrap" }}>
            <b>Repeat code {hover.seed}</b>{best.has(hover.key) ? " · best of both" : ""}<br />
            Container fill {f1(hover.x)}% · rule-following {f1(hover.y)}%
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, marginTop: 6 }}>
        <b>Best-of-both runs: {best.size} out of {pts.length}</b>
        <span style={{ color: "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width="22" height="22" aria-hidden><circle cx="11" cy="11" r="8" fill="none" stroke="var(--primary-hover)" strokeWidth="2" /><circle cx="11" cy="11" r="4" fill="var(--primary)" /></svg>
          circled = no other run of {methodName} is better on both at once
        </span>
      </div>
      <details className="collapsible" style={{ marginTop: 8 }}>
        <summary>Show as a table</summary>
        <table className="data-table" style={{ marginTop: 6, maxWidth: 520 }}>
          <thead><tr><th>Repeat code</th><th>Container fill</th><th>Rule-following (all boxes)</th><th>Best of both</th></tr></thead>
          <tbody>{pts.map((p) => <tr key={p.key}><td>{p.seed}</td><td>{f1(p.x)}%</td><td>{f1(p.y)}%</td><td>{best.has(p.key) ? "yes" : ""}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}
