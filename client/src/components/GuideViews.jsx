// Page 2 of the Loading Guide: a readable 2D picture of the arrangement.
//   Top views, one per height layer (the boxes whose bottom is at that height,
//   or within that band when there are many heights), door on the left.
//   One view from the rear door (what a worker sees when opening it).
// Boxes are coloured by stop and labelled with their loading step; where a
// label would not fit, the step is left out and the key table gives it.
import React from "react";
import { STOP_COLORS } from "../BinViewer";
import { layersOf } from "../viewer/guidePlan";

const stopColor = (stops, s) => STOP_COLORS[Math.max(0, stops.indexOf(Number(s))) % STOP_COLORS.length];

export function StopLegend({ stops }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" }}>
      {stops.map((s) => (
        <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: stopColor(stops, s), opacity: 0.85 }} />Stop {s}{s === stops[0] ? " (unloaded first)" : ""}
        </span>
      ))}
    </div>
  );
}

// Up to 6 exact layers; otherwise 4 equal height bands of the container.
export function layerGroups(steps, height) {
  const exact = layersOf(steps);
  if (exact.length <= 6) return exact.map((l) => ({ ...l, title: `Layer ${l.n}: boxes standing at ${Math.round(l.z)} cm` }));
  const n = 4, band = height / n;
  const out = [];
  for (let k = 0; k < n; k++) {
    const lo = k * band, hi = (k + 1) * band;
    const boxes = steps.filter((s) => s.p.z >= lo - 1e-6 && (s.p.z < hi - 1e-6 || (k === n - 1)));
    if (boxes.length) out.push({ n: out.length + 1, z: lo, boxes: boxes.slice().sort((a, b) => a.p.z - b.p.z), title: `Layer ${out.length + 1}: boxes whose bottom is ${Math.round(lo)}–${Math.round(hi)} cm above the floor` });
  }
  return out;
}

function TopView({ layer, container, stops }) {
  const Y = Number(container.D), X = Number(container.L);   // depth door->cab, width across
  const VW = 720, pad = 26, s = (VW - 2 * pad) / Y, VH = X * s + 2 * pad + 6;
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%", maxWidth: VW, display: "block" }} role="img" aria-label={layer.title}>
      <rect x={pad} y={pad} width={Y * s} height={X * s} fill="none" stroke="var(--text-dim)" strokeWidth="1.5" />
      {layer.boxes.map((b) => {
        const w = b.p.dy * s, h = b.p.dx * s, x = pad + b.p.y * s, y = pad + b.p.x * s;
        const c = stopColor(stops, b.stop);
        const fit = w >= 22 && h >= 14, wide = w >= 74 && h >= 30;
        return (
          <g key={b.step}>
            <rect x={x + 1} y={y + 1} width={Math.max(w - 2, 1)} height={Math.max(h - 2, 1)} fill="var(--bg-card)" rx="2" />
            <rect x={x + 1} y={y + 1} width={Math.max(w - 2, 1)} height={Math.max(h - 2, 1)} fill={c} fillOpacity="0.3" stroke={c} strokeWidth="1.5" rx="2" />
            {fit && <text x={x + w / 2} y={y + h / 2 + (wide ? -2 : 4)} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-main)">{b.step}</text>}
            {wide && <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" fontSize="9.5" fill="var(--text-muted)">{b.label}</text>}
          </g>
        );
      })}
      <line x1={pad} y1={pad} x2={pad} y2={pad + X * s} stroke="#22c55e" strokeWidth="5" />
      <text x={pad} y={pad - 8} fontSize="11.5" fontWeight="700" fill="var(--text-muted)">◀ Rear door</text>
      <text x={pad + Y * s} y={pad - 8} fontSize="11.5" fontWeight="700" fill="var(--text-muted)" textAnchor="end">Cab end ▶</text>
    </svg>
  );
}

// Looking in through the rear door: across (x) and height (z). Boxes are drawn
// far to near, opaque, so what is shown is what a worker sees; a box is
// labelled when no box nearer the door covers its centre.
function DoorView({ steps, container, stops }) {
  const X = Number(container.L), Z = Number(container.H);
  const VW = 720, pad = 26, s = (VW - 2 * pad) / X, VH = Z * s + 2 * pad + 8;
  const far = steps.slice().sort((a, b) => b.p.y - a.p.y);          // far ones first, nearest drawn last
  const covered = (b) => steps.some((o) => o !== b && o.p.y < b.p.y
    && o.p.x <= b.p.x + b.p.dx / 2 && b.p.x + b.p.dx / 2 <= o.p.x + o.p.dx
    && o.p.z <= b.p.z + b.p.dz / 2 && b.p.z + b.p.dz / 2 <= o.p.z + o.p.dz);
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%", maxWidth: VW, display: "block" }} role="img" aria-label="View through the rear door">
      <rect x={pad} y={pad} width={X * s} height={Z * s} fill="none" stroke="#22c55e" strokeWidth="4" />
      {far.map((b) => {
        const w = b.p.dx * s, h = b.p.dz * s, x = pad + b.p.x * s, y = pad + (Z - b.p.z - b.p.dz) * s;
        const c = stopColor(stops, b.stop);
        const show = !covered(b) && w >= 22 && h >= 14;
        return (
          <g key={b.step}>
            <rect x={x + 1} y={y + 1} width={Math.max(w - 2, 1)} height={Math.max(h - 2, 1)} fill="var(--bg-card)" rx="2" />
            <rect x={x + 1} y={y + 1} width={Math.max(w - 2, 1)} height={Math.max(h - 2, 1)} fill={c} fillOpacity="0.35" stroke={c} strokeWidth="1.5" rx="2" />
            {show && <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-main)">{b.step}</text>}
          </g>
        );
      })}
      <text x={pad} y={VH - 6} fontSize="11.5" fill="var(--text-muted)">Floor · seen from the rear door (the door frame is the green outline)</text>
    </svg>
  );
}

export default function GuideViews({ guide, container }) {
  const layers = layerGroups(guide.steps, Number(container.H));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <StopLegend stops={guide.stops} />
      <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Numbers are loading steps (Page 1). A box too small for its number is listed in the key below.</div>
      {layers.map((l) => (
        <div key={l.n} style={{ breakInside: "avoid" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>Top view — {l.title} ({l.boxes.length} box{l.boxes.length === 1 ? "" : "es"})</div>
          <TopView layer={l} container={container} stops={guide.stops} />
        </div>
      ))}
      <div style={{ breakInside: "avoid" }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>View from the rear door</div>
        <DoorView steps={guide.steps} container={container} stops={guide.stops} />
      </div>
      <details className="collapsible" open>
        <summary>Key: loading step → box</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "2px 12px", fontSize: 11.5, marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
          {guide.steps.map((s) => <span key={s.step} style={{ whiteSpace: "nowrap" }}>{s.step} = {s.label} · stop {s.stop}</span>)}
        </div>
      </details>
    </div>
  );
}
