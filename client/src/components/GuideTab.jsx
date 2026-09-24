import React, { useEffect, useMemo, useState } from "react";
import { runsApi } from "../services/api";
import { methodLabel } from "../methods";
import { buildPlan, checkPlan, supportersOf } from "../viewer/loadingPlan";
import { orientationText, fmtNum, RULES, RULE_NAME, RULE_COLOR } from "../viewer/boxInfo";
import { STOP_COLORS } from "../BinViewer";

// Printable loading plan. Layout follows the groupmate fork's GuideTab (pages,
// print button); its logic is replaced: the order is a physically feasible
// LOADING order for a rear-door truck, verified before it is shown.

function SideView({ steps, container, stops }) {
  // Side view: depth from the door (left) to the cab (right), height up.
  const W = Number(container.D), H = Number(container.H);
  if (!W || !H) return null;
  const VW = 760, pad = 24, s = (VW - 2 * pad) / W, VH = H * s + 2 * pad + 18;
  const color = (st) => STOP_COLORS[Math.max(0, stops.indexOf(st)) % STOP_COLORS.length];
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%", maxWidth: VW, display: "block" }} role="img" aria-label="Side view of the loaded container">
      <rect x={pad} y={pad} width={W * s} height={H * s} fill="none" stroke="var(--text-dim)" />
      {steps.slice().sort((a, b) => a.p.x - b.p.x).map((st) => (
        <rect key={st.it.item_idx} x={pad + st.p.y * s} y={pad + (H - st.p.z - st.p.dz) * s} width={st.p.dy * s} height={st.p.dz * s}
          fill={color(Number(st.it.stop))} fillOpacity="0.28" stroke={color(Number(st.it.stop))} strokeWidth="1" />
      ))}
      <line x1={pad} y1={pad} x2={pad} y2={pad + H * s} stroke="#22c55e" strokeWidth="4" />
      <text x={pad} y={VH - 6} fontSize="12" fill="var(--text-muted)">← Rear door (y = 0)</text>
      <text x={VW - pad} y={VH - 6} fontSize="12" fill="var(--text-muted)" textAnchor="end">Cab end →</text>
    </svg>
  );
}

export default function GuideTab({ finalResult, runHistory = [] }) {
  const [source, setSource] = useState("screen");     // "screen" | saved run id
  const [saved, setSaved] = useState(null);
  const [loadErr, setLoadErr] = useState(null);

  const savedRows = (runHistory || []).filter((r) => r.has_result && r.status !== "failed");

  useEffect(() => {
    if (source === "screen") { setSaved(null); setLoadErr(null); return; }
    let alive = true;
    runsApi.getRun(source).then((row) => alive && setSaved(row.result)).catch((e) => alive && setLoadErr(e.message));
    return () => { alive = false; };
  }, [source]);

  const result = source === "screen" ? finalResult : saved;
  const items = useMemo(() => (result && Array.isArray(result.items) ? result.items : []), [result]);
  const plan = useMemo(() => buildPlan(items), [items]);
  const check = useMemo(() => checkPlan(plan), [plan]);
  const pv = result ? result.problem_view : null;
  const stops = useMemo(() => Array.from(new Set(items.map((i) => Number(i.stop)))).sort((a, b) => a - b), [items]);
  const nItems = result ? (pv ? pv.n_items : result.n_items) : null;
  const notLoaded = nItems != null ? nItems - items.length : null;

  const picker = (
    <div className="no-print" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
      <div>
        <label className="form-label" style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 6 }}>Which run's plan?</label>
        <select className="form-input" style={{ minWidth: 320 }} value={source} onChange={(e) => setSource(e.target.value === "screen" ? "screen" : Number(e.target.value))}>
          <option value="screen">The run on screen{finalResult ? "" : " (none yet)"}</option>
          {savedRows.map((r) => (
            <option key={r.id} value={r.id}>#{r.id} · {methodLabel(r.strategy_code || r.strategy)} · {r.instance}{r.seed != null ? ` · repeat code ${r.seed}` : ""}{r.label ? ` · ${r.label}` : ""}</option>
          ))}
        </select>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={!items.length || !check.ok}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        Print this plan
      </button>
    </div>
  );

  if (loadErr) return <>{picker}<div className="alert-danger">Could not open that saved run: {loadErr}</div></>;
  if (!items.length) {
    return (
      <>
        {picker}
        <div className="card" style={{ textAlign: "center", padding: "48px 32px", color: "var(--text-dim)", fontSize: 13 }}>
          No arrangement to plan yet. Run a Quick Test from Start analysis, or pick a saved run above.
        </div>
      </>
    );
  }
  if (!check.ok) {
    return (
      <>
        {picker}
        <div className="alert-danger">
          <b>This loading plan failed its own check and is not shown.</b> Every box must be loaded after the boxes it rests on; {check.problems.length} step{check.problems.length === 1 ? "" : "s"} break that, e.g. {check.problems[0]}.
        </div>
      </>
    );
  }

  const broken = pv ? RULES.filter((r) => pv.violating[r] > 0) : [];

  return (
    <>
      {picker}
      <div className="card guide-page" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <div>
            <div className="section-tag">Page 1 of 3</div>
            <div className="card-title">Loading order</div>
            <div className="card-desc">
              {methodLabel(result.strategy || result.params?.strategy)} · {result.dataset === "wtpack" ? `wtpack #${result.instance}` : String(result.instance || "")}{result.seed != null ? ` · repeat code ${result.seed}` : ""}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)", marginTop: 0 }}>
          Load from the top of this list down. Start at the cab end and work toward the rear door; within each depth band ({plan.nBands} in this plan), put the floor boxes in first and build upward. At delivery, each stop's boxes come out through the rear door, stop 1 first.
          Positions are in cm: x across the truck, y from the rear door, z above the floor.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", fontSize: 12.5 }}>
            <thead>
              <tr><th>Step</th><th>Box</th><th>Stop</th><th>Position (x, y from door, z)</th><th>Orientation</th><th>Fragile</th><th>Rests on</th></tr>
            </thead>
            <tbody>
              {plan.steps.map((s) => {
                const on = supportersOf(s, plan.steps);
                const fr = s.it.fragile === 1 || s.it.fragile === true || s.it.type === "Fragile";
                return (
                  <tr key={s.it.item_idx}>
                    <td className="mono">{s.step}</td>
                    <td className="mono">{s.it.id ?? s.it.item_idx}</td>
                    <td>{s.it.stop}</td>
                    <td className="mono">({fmtNum(s.p.x)}, {fmtNum(s.p.y)}, {fmtNum(s.p.z)})</td>
                    <td>{orientationText(s.it.orientation) ?? "not recorded for this run"}</td>
                    <td style={{ color: fr ? "var(--amber)" : undefined, fontWeight: fr ? 700 : 400 }}>{fr ? "Yes — nothing on top" : "No"}</td>
                    <td className="mono">{on.length ? on.map((o) => o.it.id ?? o.it.item_idx).join(", ") : "floor"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="field-hint">Checked: every box above comes after all the boxes it rests on ({plan.steps.length} boxes).</p>
        {notLoaded > 0 && (
          <div className="info-callout" style={{ marginTop: 10, fontSize: 12.5 }}>
            <div>
              <b>{notLoaded} of {nItems} boxes are not in this plan</b> — this arrangement did not load them.
              {pv && pv.unplaced.length > 0 && <> Left out: {pv.unplaced.map((u) => `${u.id} (stop ${u.stop})`).join(", ")}.</>}
            </div>
          </div>
        )}
      </div>

      <div className="card guide-page" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <div>
            <div className="section-tag">Page 2 of 3</div>
            <div className="card-title">Side view</div>
            <div className="card-desc">Looking at the container from the side; colours are delivery stops ({stops.map((s) => `stop ${s}`).join(", ")}).</div>
          </div>
        </div>
        <SideView steps={plan.steps} container={result.container || {}} stops={stops} />
      </div>

      <div className="card guide-page">
        <div className="card-head">
          <div>
            <div className="section-tag">Page 3 of 3</div>
            <div className="card-title">Summary</div>
            <div className="card-desc">What this arrangement achieves, from the run's own numbers</div>
          </div>
        </div>
        <div className="grid grid-2" style={{ gap: 14, fontSize: 13 }}>
          <div><span className="field-hint">Container full</span><div style={{ fontWeight: 700 }}>{fmtNum(result.metrics?.M1_space_utilization_pct, 2)}%</div></div>
          <div><span className="field-hint">Boxes loaded</span><div style={{ fontWeight: 700 }}>{items.length}{nItems != null ? ` of ${nItems}` : ""}</div></div>
          <div><span className="field-hint">Rules followed (loaded boxes)</span><div style={{ fontWeight: 700 }}>{fmtNum(result.metrics?.M2_constraint_satisfaction_pct, 2)}%</div></div>
          <div><span className="field-hint">Rules followed (all boxes; left-out boxes count as not following)</span>
            <div style={{ fontWeight: 700 }}>{pv ? `${pv.compliant_placed} of ${pv.n_items} (${fmtNum((100 * pv.compliant_placed) / pv.n_items, 1)}%)` : "—"}</div></div>
        </div>
        {pv ? (
          <div style={{ marginTop: 14, fontSize: 13 }}>
            {broken.length === 0
              ? <div style={{ color: "var(--green)", fontWeight: 700 }}>Every loaded box follows C3, C4, C5 and C6.</div>
              : broken.map((r) => <div key={r} style={{ color: RULE_COLOR[r], fontWeight: 700 }}>{r} · {RULE_NAME[r]}: {pv.violating[r]} box{pv.violating[r] === 1 ? "" : "es"}</div>)}
            {broken.length > 0 && <p className="field-hint">Open the 3D viewer with “Highlight boxes with problems” to see which ones.</p>}
          </div>
        ) : (
          <p className="field-hint" style={{ marginTop: 14 }}>Per-box rule checks were not recorded for this run (saved before the problem view).</p>
        )}
      </div>
    </>
  );
}
