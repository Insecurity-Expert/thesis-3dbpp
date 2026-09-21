// client/src/study/LineChart.jsx — small inline-SVG line chart (no chart library in the client).
import React from "react";

const COLORS = { DGWO: "var(--primary)", MOGWO: "var(--blush, #B86B7A)", SEQ: "var(--green)", REP: "var(--amber)" };

/**
 * series: [{ code, label, points: [{ x: index, y: number|null }] }]
 * xLabels: [{ label, sub }] one per x index
 */
export default function LineChart({ series, xLabels, yLabel, yFmt = (v) => v.toFixed(0), height = 240 }) {
  const W = 680, H = height;
  const PAD = { t: 18, r: 60, b: 52, l: 58 };
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const n = xLabels.length;
  const ys = series.flatMap((s) => s.points.map((p) => p.y).filter((v) => v !== null && v !== undefined));
  if (!n || !ys.length) return <div style={{ color: "var(--text-dim)", fontSize: 12 }}>No data to chart.</div>;
  const ymax = Math.max(...ys) * 1.08 || 1;
  const ymin = 0;
  const x = (i) => PAD.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => PAD.t + ih - ((v - ymin) / (ymax - ymin)) * ih;
  const ticks = 4;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, display: "block" }}>
        {[...Array(ticks + 1)].map((_, i) => {
          const v = ymin + ((ymax - ymin) * i) / ticks;
          return (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray="3 3" />
              <text x={PAD.l - 6} y={y(v) + 4} fontSize="10" fill="var(--text-dim)" textAnchor="end">{yFmt(v)}</text>
            </g>
          );
        })}
        <text x={12} y={PAD.t + ih / 2} fontSize="10" fill="var(--text-dim)" transform={`rotate(-90 12 ${PAD.t + ih / 2})`} textAnchor="middle">{yLabel}</text>
        {xLabels.map((l, i) => (
          <g key={i}>
            <text x={x(i)} y={H - PAD.b + 16} fontSize="11" fontWeight="700" fill="var(--text-muted)" textAnchor="middle">{l.label}</text>
            {l.sub && <text x={x(i)} y={H - PAD.b + 30} fontSize="9.5" fill="var(--text-dim)" textAnchor="middle">{l.sub}</text>}
          </g>
        ))}
        {series.map((s) => {
          const pts = s.points.filter((p) => p.y !== null && p.y !== undefined);
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
          return (
            <g key={s.code}>
              <path d={d} fill="none" stroke={COLORS[s.code] || "var(--text-muted)"} strokeWidth="2" />
              {pts.map((p) => <circle key={p.x} cx={x(p.x)} cy={y(p.y)} r="3.5" fill={COLORS[s.code] || "var(--text-muted)"} />)}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, marginTop: 6 }}>
        {series.map((s) => (
          <span key={s.code} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 3, background: COLORS[s.code] || "var(--text-muted)", display: "inline-block" }} />{s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
