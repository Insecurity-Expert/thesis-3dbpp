import React, { useState, useMemo, useCallback, useEffect } from "react";
import CustomLoadBanner, { customLoadOf } from "./CustomLoadBanner";
import BinViewer, { TYPE_COLOR, COMPLIANT_COLOR, PROBLEM_OUTLINE, stopColor } from "../BinViewer";
import { studiesApi } from "../services/api";
import {
  heavyRule, isHeavy, RULES, RULE_NAME, RULE_SHORT, RULE_COLOR,
  physics, orientationText, fmtNum,
} from "../viewer/boxInfo";
import { buildPlan, checkPlan } from "../viewer/loadingPlan";
import { truckFrame } from "../viewer/truckFrame";
import { faceGapRows, gapLabel } from "../viewer/gapView";

// Shown in the viewport while a thesis strategy runs: they stream metrics,
// not partial packings, so there is nothing to draw until instance_complete.
function LiveProgress({ stats }) {
  const it = stats?.iteration ?? 0, n = stats?.maxIter ?? 0;
  const pct = n ? Math.min(100, (it / n) * 100) : 0;
  const fmt = (v, d = 1) => (v === undefined || v === null ? "—" : Number(v).toFixed(d));
  return (
    <div style={{ minHeight: "450px", display: "flex", flexDirection: "column", gap: "18px", padding: "24px", background: "var(--bg-input)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginBottom: "8px" }}>
          <span>Optimizing — iteration {it} / {n || "…"}</span>
          <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>{stats?.phase ? String(stats.phase) : "searching"}</span>
        </div>
        <div className="bar"><div style={{ width: `${pct}%`, background: "var(--primary)" }} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
        {[
          ["Best SU so far", stats?.su !== undefined && stats?.su !== null ? `${fmt(stats.su * 100)}%` : "—"],
          ["Best CSR so far", stats?.csr !== undefined && stats?.csr !== null ? `${fmt(stats.csr)}%` : "—"],
          ["Best placed", stats?.placed ?? "—"],
        ].map(([k, v]) => (
          <div key={k} className="stat-chip" style={{ padding: "14px 16px" }}>
            <div className="stat-chip-label">{k}</div>
            <div className="stat-chip-value" style={{ fontSize: "24px", color: "var(--primary)" }}>{v}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: 0 }}>The 3-D packing appears here when the run completes; thesis strategies stream metrics, not partial layouts.</p>
    </div>
  );
}

const CAPTION = { fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "8px" };
const LEGEND_TXT = { color: "#cbd5e1", fontSize: 12 };

function Swatch({ color, outline = false, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 12, height: 12, borderRadius: 2, background: outline ? "transparent" : color, border: outline ? `2px solid ${color}` : "none", boxSizing: "border-box" }} />
      <span style={LEGEND_TXT}>{label}</span>
    </span>
  );
}

function Row({ k, v, strong = true, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--text-dim)" }}>{k}</span>
      <span style={{ fontWeight: strong ? 700 : 500, color: color || "var(--text-main)", textAlign: "right" }}>{v}</span>
    </div>
  );
}

export default function VisualizationTab({
  finalResult,
  placements,
  instanceInfo,
  binsUsed,
  running,
  stats,
  studies,
  request = null,   // { studyId, runIndex, method } from a Results solution card
}) {
  const [viewportOrientation, setViewportOrientation] = useState("3D");
  const [viewportTrigger, setViewportTrigger] = useState(0);
  const [filterStandard, setFilterStandard] = useState(true);
  const [filterFragile, setFilterFragile] = useState(true);
  const [filterHeavy, setFilterHeavy] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [showGuides, setShowGuides] = useState(true);   // rear door / front wall / depth arrow
  const [showGaps, setShowGaps] = useState(false);       // dimension lines across significant gaps
  const [shadeEmpty, setShadeEmpty] = useState(false);   // translucent blocks over significant gaps
  const [selectedStop, setSelectedStop] = useState("All");
  const [colorMode, setColorMode] = useState("type");
  const [highlight, setHighlight] = useState(false);
  const [ruleFilter, setRuleFilter] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [pinned, setPinned] = useState(null);
  const [source, setSource] = useState("run");          // run | study
  const [studyView, setStudyView] = useState(null);
  const [studyError, setStudyError] = useState(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [centerLoad, setCenterLoad] = useState(false);

  // A new or reopened run is what the viewer shows; a "View Arrangement"
  // request (below, declared later so it wins on mount) switches to a study run.
  useEffect(() => { if (finalResult) setSource("run"); }, [finalResult]);

  // "View Arrangement" on a Results card: that method's representative run,
  // with the boxes that break a rule highlighted.
  useEffect(() => {
    if (!request) return undefined;
    let alive = true;
    setSource("study"); setStudyError(null); setStudyView(null); setRequestBusy(true);
    studiesApi.runView(request.studyId, request.runIndex)
      .then((v) => { if (!alive) return; setStudyView({ ...v, study_label: v.study_name || "Comparison" }); setHighlight(true); })
      .catch((e) => alive && setStudyError(`This run could not be shown: ${e.message}`))
      .finally(() => alive && setRequestBusy(false));
    return () => { alive = false; };
  }, [request]);

  const triggerViewReset = useCallback((dir) => {
    setViewportOrientation(dir);
    setViewportTrigger((prev) => prev + 1);
  }, []);

  // What is on screen: a study run, or the live / reloaded run from Shell.
  const result = useMemo(() => {
    if (source === "study") return studyView;
    if (finalResult && Array.isArray(finalResult.items)) return finalResult;
    if (placements && instanceInfo) return { items: placements, container: instanceInfo.container, bins_used: binsUsed, n_items: instanceInfo.n_items };
    return null;
  }, [source, studyView, finalResult, placements, instanceInfo, binsUsed]);

  useEffect(() => { setPinned(null); setHovered(null); setRuleFilter(null); setCenterLoad(false); }, [result]);

  const hasCentered = Boolean(
    result &&
    result.centered_items &&
    result.centered_items.length > 0
  );
  const isImproved = Boolean(result && result.lateral_balance && result.lateral_balance.improved);

  const items = useMemo(() => {
    if (centerLoad && hasCentered) return result.centered_items;
    return (result && result.items) || [];
  }, [result, centerLoad, hasCentered]);
  const pv = result ? result.problem_view : null;
  const heavy = useMemo(() => heavyRule(result), [result]);

  const uniqueStops = useMemo(() => {
    const s = new Set();
    for (const p of items) if (p.stop !== undefined) s.add(Number(p.stop));
    if (pv) for (const u of pv.unplaced) s.add(Number(u.stop));
    return Array.from(s).sort((a, b) => a - b);
  }, [items, pv]);

  // A box can be both heavy and fragile; hiding either category hides it.
  const filteredPlacements = useMemo(() => items.filter((p) => {
    if (selectedStop !== "All" && Number(p.stop) !== Number(selectedStop)) return false;
    if (ruleFilter && !(p.violations || []).includes(ruleFilter)) return false;
    const fr = p.fragile === 1 || p.fragile === true || p.type === "Fragile";
    const hv = isHeavy(p.mass ?? p.weight, heavy);
    if (fr && !filterFragile) return false;
    if (hv && !filterHeavy) return false;
    if (!fr && !hv && !filterStandard) return false;
    return true;
  }), [items, selectedStop, ruleFilter, filterStandard, filterFragile, filterHeavy, heavy]);

  const nItems = result ? (pv ? pv.n_items : result.n_items) : null;
  const nPlaced = items.length;
  const nNotLoaded = Number.isFinite(Number(nItems)) ? Number(nItems) - nPlaced : null;
  const multiBin = items.some((it) => Number(it.bin_id ?? 0) !== 0) || Number(result?.bins_used ?? 1) > 1;

  const container = result ? result.container : null;
  const details = pinned || hovered;
  const frame = useMemo(() => truckFrame(container), [container]);
  // The gaps of the layout in view: the Center Load toggle swaps the boxes, so it
  // must swap the summary too (results saved before this carry result.gaps only).
  const showCentered = centerLoad && hasCentered;
  const gaps = result ? ((showCentered && result.centered_gaps) || result.gaps) : null;
  const edge = result ? ((showCentered && result.centered_edge) || result.edge) : null;
  const r4 = result ? result.edge_fill : null;

  // Boxes that the centering pass physically moved (shift > 0.5 cm threshold).
  // Used to render a cyan outline in the 3-D viewer so the change is visible.
  const shiftedIdxs = useMemo(() => {
    if (!centerLoad || !hasCentered || !result || !result.lateral_balance || !result.lateral_balance.shifts) return null;
    const s = new Set();
    for (const [idx, delta] of Object.entries(result.lateral_balance.shifts)) {
      if (Math.abs(delta) > 0.5) s.add(Number(idx));
    }
    return s.size > 0 ? s : null;
  }, [centerLoad, hasCentered, result]);

  // Lateral centre-of-mass x position (physics x-axis = across the truck width).
  // Weighted by left_mass / total_mass, scaled to container width L.
  const centerOfMassX = useMemo(() => {
    if (!result || !result.lateral_balance || !container) return null;
    const lb = centerLoad && hasCentered ? result.lateral_balance.after : result.lateral_balance.before;
    if (!lb) return null;
    const total = lb.left_mass + lb.right_mass;
    if (total <= 0) return null;
    const L = Number(container.L || container.length_cm || 0);
    return (lb.left_mass / total) * L;
  }, [centerLoad, hasCentered, result, container]);
  const comBalanced = centerLoad && hasCentered;
  const idName = useMemo(() => {
    const m = new Map(items.map((it) => [Number(it.item_idx), it.id ?? `#${it.item_idx}`]));
    return (j) => `Box ${m.get(Number(j)) ?? j}`;
  }, [items]);

  // One loading order for the animation and the printed guide, built from the
  // whole load (filters only hide boxes from view).
  const plan = useMemo(() => (container ? buildPlan(items, container) : null), [items, container]);
  const planCheck = useMemo(() => (plan ? checkPlan(plan) : null), [plan]);

  const legend = (
    <>
      {colorMode === "type" && (
        <>
          <Swatch color={TYPE_COLOR.standard} label="Standard" />
          <Swatch color={TYPE_COLOR.heavy} label={heavy.threshold === null ? "Heavy" : `Heavy: mass ≥ ${fmtNum(heavy.threshold, 2)} kg (${heavy.nHeavy} of ${heavy.n} ${pv ? "boxes" : "placed boxes"})`} />
        </>
      )}
      {colorMode === "box" && <span style={LEGEND_TXT}>Each box has its own colour</span>}
      {colorMode === "stop" && uniqueStops.map((s) => <Swatch key={s} color={stopColor(s, uniqueStops)} label={`Stop ${s}`} />)}
      {colorMode === "problem" && pv && (
        <>
          <Swatch color={COMPLIANT_COLOR} label="Follows C3–C6" />
          {RULES.map((r) => <Swatch key={r} color={RULE_COLOR[r]} label={`${r} ${RULE_SHORT[r]}`} />)}
          <span style={{ ...LEGEND_TXT, color: "#94a3b8" }}>(several rules: first one's colour)</span>
        </>
      )}
      <Swatch color="#f59e0b" outline label="Fragile (outline)" />
      {highlight && pv && <Swatch color={PROBLEM_OUTLINE} outline label={`Breaks a rule: ${pv.n_placed - pv.compliant_placed}`} />}
      {centerLoad && shiftedIdxs && <Swatch color="#22d3ee" outline label={`Balanced — ${shiftedIdxs.size} box${shiftedIdxs.size === 1 ? '' : 'es'} shifted`} />}
      {nNotLoaded !== null && (
        <span style={{ ...LEGEND_TXT, fontWeight: 700, color: nNotLoaded > 0 ? "#fbbf24" : "#cbd5e1" }}>
          {nNotLoaded} of {nItems} boxes not loaded
        </span>
      )}
    </>
  );

  const renderDetails = (it) => {
    const ph = physics(it);
    const fr = it.fragile === 1 || it.fragile === true || it.type === "Fragile";
    const hasChecks = Array.isArray(it.violations);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
        <Row k="Box" v={it.id ?? `#${it.item_idx}`} />
        <Row k="Position (x, y from front wall, z)" v={`(${fmtNum(ph.x)}, ${fmtNum(frame.fromFront(ph))}, ${fmtNum(ph.z)}) cm`} />
        <Row k="Placed size (across × deep × high)" v={`${fmtNum(ph.dx)} × ${fmtNum(ph.dy)} × ${fmtNum(ph.dz)} cm`} />
        <Row k="Orientation" v={orientationText(it.orientation) ?? "not recorded for this run"} strong={!!it.orientation} />
        <Row k="Mass" v={`${fmtNum(it.mass ?? it.weight, 2)} kg`} />
        <Row k="Max load on top" v={it.max_load_kg !== undefined ? `${fmtNum(it.max_load_kg, 1)} kg` : "—"} />
        {it.max_load_kg !== undefined && (
          <div className="field-hint" style={{ marginTop: -4, textAlign: "right" }}>
            {fmtNum(it.lbs_kg_cm2, 4)} kg/cm² (top-face strength) × {fmtNum(ph.dx)} × {fmtNum(ph.dy)} cm²
          </div>
        )}
        <Row k="Load resting on it" v={it.load_above_kg !== undefined ? `${fmtNum(it.load_above_kg, 1)} kg` : "—"} />
        <Row k="Stop" v={`Stop ${it.stop}`} color="var(--primary)" />
        <Row k="Fragile" v={fr ? "Yes — nothing may rest on it" : "No"} color={fr ? "var(--amber)" : undefined} />
        <Row k="Heavy" v={isHeavy(it.mass ?? it.weight, heavy) ? "Yes" : "No"} />
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <div style={{ color: "var(--text-dim)", marginBottom: 4 }}>Gaps at its six faces (cm)</div>
          {(() => {
            const rows = faceGapRows(it, container, idName);
            if (!rows) return <div style={{ color: "var(--text-dim)" }}>Not available for this run (saved before the gap view).</div>;
            return rows.map((r) => (
              <div key={r.face} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "var(--text-dim)" }}>{r.name}</span>
                <span style={{ textAlign: "right", fontWeight: r.significant ? 700 : 500, color: r.significant ? "var(--amber)" : "var(--text-main)" }}>
                  {gapLabel(r.gap)} <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>to {r.beyond}</span>
                </span>
              </div>
            ));
          })()}
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <div style={{ color: "var(--text-dim)", marginBottom: 4 }}>Rules broken</div>
          {!hasChecks ? <div style={{ color: "var(--text-dim)" }}>Not available for this run (saved before the problem view).</div>
            : it.violations.length === 0 ? <div style={{ fontWeight: 700, color: "var(--green)" }}>None — follows C3, C4, C5 and C6</div>
              : it.violations.map((r) => (
                <div key={r} style={{ fontWeight: 700, color: RULE_COLOR[r] }}>
                  {r} · {RULE_NAME[r]}
                  {r === "C3" && ` (${fmtNum(it.load_above_kg, 1)} kg on a ${fmtNum(it.max_load_kg, 1)} kg limit)`}
                  {r === "C6" && it.c6_blocked_by && it.c6_blocked_by.length > 0 && ` — by ${it.c6_blocked_by.join(", ")}`}
                </div>
              ))}
        </div>
      </div>
    );
  };

  const pictureName = result
    ? `STACKR-${result.source === "study" ? `study-${result.strategy}-i${result.instance}-s${result.seed}` : `${result.strategy || "run"}${result.seed !== undefined && result.seed !== null ? `-s${result.seed}` : ""}`}-${viewportOrientation}`
    : "STACKR-3D-view";

  const totalWeight = items.reduce((sum, it) => sum + (it.mass ?? it.weight ?? 0), 0);
  const containerVol = container ? (container.length_cm ?? container.L) * (container.width_cm ?? container.D) * (container.height_cm ?? container.H) : 0;
  const packedVol = items.reduce((sum, it) => {
    const ph = physics(it);
    return sum + (ph.dx * ph.dy * ph.dz);
  }, 0);
  const suPct = result && result.verified && result.verified.su_pct !== undefined ? result.verified.su_pct : (containerVol > 0 ? (packedVol / containerVol) * 100 : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {customLoadOf(result) && <CustomLoadBanner info={customLoadOf(result)} />}

      {/* Upper Section: Inspection & 3D Viewer */}
      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* Left Column: Box Details (Pinned/Sticky) */}
        <div style={{ flex: "0 0 340px", minWidth: 320, position: "sticky", top: "24px" }}>
          <div className="card" style={{ minHeight: "180px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "14px" }}>
              <h4 className="section-tag" style={{ margin: 0 }}>● BOX DETAILS</h4>
              {pinned && <button type="button" className="btn btn-ghost btn-xs" onClick={() => setPinned(null)}>Clear</button>}
            </div>
            {details ? renderDetails(details) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--text-dim)", fontSize: "12px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "8px", padding: "16px" }}>
                Click a box to keep its details here, or hover to peek.
              </div>
            )}
          </div>

          {result && (
            <div className="card" style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "12px" }}>
                <h4 className="section-tag" style={{ margin: 0 }}>● LATERAL BALANCE (M-7)</h4>
                {hasCentered && (
                  <button
                    type="button"
                    className={`btn btn-xs ${centerLoad ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setCenterLoad((c) => !c)}
                    style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px" }}
                    title={centerLoad ? "Click to view original DBLF packing" : "Click to view balanced arrangement"}
                  >
                    {centerLoad ? "Centered ✓" : (isImproved ? "Center Load" : "Centered (Optimal)")}
                  </button>
                )}
              </div>
              {result.lateral_balance ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
                  <Row
                    k="Layout Mode"
                    v={centerLoad && hasCentered ? "Post-Centered (Balanced)" : "Standard DBLF"}
                    color={centerLoad && hasCentered ? "var(--green)" : "var(--primary)"}
                  />
                  <Row
                    k="Left vs Right Mass"
                    v={
                      centerLoad && hasCentered
                        ? `${fmtNum(result.lateral_balance.after.left_mass, 1)} / ${fmtNum(result.lateral_balance.after.right_mass, 1)} kg`
                        : `${fmtNum(result.lateral_balance.before.left_mass, 1)} / ${fmtNum(result.lateral_balance.before.right_mass, 1)} kg`
                    }
                  />
                  <Row
                    k="Imbalance (M-7)"
                    v={
                      centerLoad && hasCentered
                        ? `${fmtNum(result.lateral_balance.after.lr_mass_imbalance_pct, 1)}%${isImproved ? ` (was ${fmtNum(result.lateral_balance.before.lr_mass_imbalance_pct, 1)}%)` : ""}`
                        : `${fmtNum(result.lateral_balance.before.lr_mass_imbalance_pct, 1)}%`
                    }
                    color={centerLoad && hasCentered ? "var(--green)" : (result.lateral_balance.before.lr_mass_imbalance_pct > 15 ? "var(--amber)" : "var(--text-main)")}
                  />
                  <div className="field-hint">
                    {isImproved
                      ? "Post-processing shifts rigid vertical stacks toward the centerline without violating constraints C1\u2013C6."
                      : "Arrangement is already at minimum lateral imbalance or fully bounded by neighboring boxes."}
                  </div>
                  {centerLoad && hasCentered && result.lateral_balance.shifts && (() => {
                    const shifted = Object.values(result.lateral_balance.shifts).filter(d => Math.abs(d) > 0.5);
                    const maxShift = shifted.length > 0 ? Math.max(...shifted.map(Math.abs)) : 0;
                    return shifted.length > 0 ? (
                      <div className="field-hint" style={{ color: '#22d3ee', fontWeight: 600 }}>
                        {shifted.length} box{shifted.length === 1 ? '' : 'es'} shifted (max {fmtNum(maxShift, 1)} cm) — highlighted cyan in 3D
                      </div>
                    ) : (
                      <div className="field-hint">No boxes needed shifting — layout already optimal.</div>
                    );
                  })()}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  Lateral balance data not available for this run (run STACKR or open a study arrangement to view).
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="card" style={{ marginTop: 16 }}>
              <h4 className="section-tag" style={{ margin: 0, borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "12px" }}>● GAPS</h4>
              {gaps ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
                  <Row k="Mean face gap" v={gaps.mean_gap_cm === null ? "—" : `${fmtNum(gaps.mean_gap_cm, 2)} cm`} />
                  <Row k="Largest face gap" v={gaps.max_gap_cm === null ? "—" : `${fmtNum(gaps.max_gap_cm, 2)} cm`} />
                  <Row k="Significant gaps" v={`${gaps.significant_gaps} of ${gaps.n_faces} faces`} color="var(--amber)" />
                  <Row k="τ (smallest box dimension)" v={`${fmtNum(gaps.significant_threshold_cm, 2)} cm`} />
                  <div className="field-hint">
                    A face gap is the distance from a box face to the nearest box or wall beyond it; it is significant at τ or more.
                    Every face counts, the roof included; the view leaves out the lines to the roof.
                  </div>
                  {edge && (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: "8px" }}>
                      <Row k="Boxes touching nothing sideways" v={`${edge.isolated_boxes}`} color={edge.isolated_boxes > 0 ? "var(--amber)" : undefined} />
                      <Row k="Boxes touching one side only" v={`${edge.one_side_boxes}`} />
                      <Row k="Sideways gaps ≥ τ (a box fits)" v={`${edge.lateral_gaps_fillable.count} · ${fmtNum(edge.lateral_gaps_fillable.total_cm, 0)} cm`} />
                      <Row k="Sideways gaps < τ (dunnage)" v={`${edge.lateral_gaps_dunnage.count} · ${fmtNum(edge.lateral_gaps_dunnage.total_cm, 0)} cm`} />
                      <Row k="Side contact" v={edge.side_contact_ratio === null ? "—" : `${fmtNum(edge.side_contact_ratio * 100, 1)} % of side-face area`} />
                      {r4 && !showCentered && (
                        <div className="field-hint">
                          R4 edge filling: {r4.placed_A + r4.placed_A2} box{r4.placed_A + r4.placed_A2 === 1 ? "" : "es"} added,
                          {" "}{r4.compaction.moves} stack{r4.compaction.moves === 1 ? "" : "s"} moved flush ({fmtNum(r4.time_ms / 1000, 1)} s).
                          Gaps under τ are left for dunnage.
                        </div>
                      )}
                      {showCentered && <div className="field-hint">Centered view: these figures are for the centered boxes, not the R4 arrangement.</div>}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Not available for this run (saved before the gap view).</div>
              )}
            </div>
          )}

          {plan && plan.steps.length > 0 && (
            <div className="card" style={{ marginTop: 16, fontSize: 12.5 }}>
              <h4 className="section-tag" style={{ margin: 0, borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "10px" }}>● LOADING ORDER</h4>
              {!planCheck.ok ? (
                <div style={{ color: "var(--amber)", fontWeight: 600 }}>No valid loading order: {planCheck.problems[0]}</div>
              ) : (
                <>
                  <div style={{ color: "var(--text-muted)" }}>Last stop first; within a stop, front wall first, then bottom-up, then across. Same order as the Loading Guide.</div>
                  {plan.fixes.length === 0 ? (
                    <div style={{ marginTop: 6, fontWeight: 700, color: "var(--green)" }}>Purely in stop order.</div>
                  ) : (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ cursor: "pointer", color: "var(--amber)", fontWeight: 700 }}>
                        {plan.fixes.length} box{plan.fixes.length === 1 ? "" : "es"} could not go in at {plan.fixes.length === 1 ? "its" : "their"} turn
                      </summary>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--text-muted)" }}>
                        {plan.fixes.map((f) => <li key={f.it.item_idx}>{f.text}</li>)}
                      </ul>
                      <div className="field-hint" style={{ marginTop: 4 }}>{plan.deferred.length} box{plan.deferred.length === 1 ? " waits" : "es wait"} until what {plan.deferred.length === 1 ? "it needs is" : "they need is"} in.</div>
                    </details>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Column: 3D Viewer Canvas */}
        <div style={{ flex: "1 1 600px", minWidth: 0, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: "700" }}>Your packed container</h3>
              <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                {result && result.source === "study"
                  ? `${result.study_label || "Study"} · ${result.strategy} · ${result.dataset === "custom" ? "your custom load" : `instance ${result.instance}`} · repeat code ${result.seed} — container fill ${fmtNum(result.verified.su_pct, 2)}%, rules ${fmtNum(result.verified.csr_pct, 2)}%`
                  : "Drag to rotate, scroll to zoom. Click a box for its details."}
              </span>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div className="tabs-inline">
                {["Door", "Side", "Top", "3D", "Loading"].map((dir) => (
                  <button key={dir} onClick={() => triggerViewReset(dir)} className={viewportOrientation === dir ? "active" : ""} style={{ fontSize: "12px", fontWeight: "700", cursor: "pointer", padding: "4px 8px" }}>{dir}</button>
                ))}
              </div>
              {result && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Showing {filteredPlacements.length} of {nPlaced} loaded</span>}
            </div>
          </div>

          {requestBusy ? (
            <div style={{ height: "450px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 13 }}>Checking and loading the arrangement…</div>
          ) : source === "study" && studyError ? (
            <div className="alert-danger">{studyError}</div>
          ) : result && multiBin && pv ? (
            <div className="alert-danger">The viewer shows one container; this run uses more than one.</div>
          ) : result && container ? (
            <BinViewer
              placements={filteredPlacements}
              container={container}
              binsUsed={result.bins_used ?? 1}
              showLabels={showLabels}
              showGuides={showGuides}
              running={running && source === "run"}
              orientation={viewportOrientation}
              resetTrigger={viewportTrigger}
              onResetView={() => triggerViewReset("3D")}
              onHoverItem={setHovered}
              onSelectItem={(it) => setPinned((p) => (p && p.item_idx === it.item_idx ? null : it))}
              selectedIdx={pinned ? pinned.item_idx : null}
              colorMode={colorMode}
              heavy={heavy}
              stops={uniqueStops}
              highlightProblems={highlight && !!pv}
              legend={legend}
              pictureName={pictureName}
              plan={plan}
              planCheck={planCheck}
              showGaps={showGaps}
              shadeEmpty={shadeEmpty}
              onPlayStart={() => triggerViewReset("Loading")}
              onInteract={() => { if (viewportOrientation !== "3D") setViewportOrientation("3D"); }}
              shiftedIdxs={shiftedIdxs}
              centerOfMassX={centerOfMassX}
              comBalanced={comBalanced}
            />
          ) : running && source === "run" ? (
            <LiveProgress stats={stats} />
          ) : (
            <div style={{ height: "450px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg-input)", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>📦</div>
              <h4 style={{ color: "var(--text-muted)", fontSize: "14px", fontWeight: "600" }}>Nothing to show yet</h4>
              <p style={{ color: "var(--text-dim)", fontSize: "12px", marginTop: "4px" }}>
                Start a run from Start analysis, or open a saved one from Run history.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Lower Section: Full-Width Responsive Control Deck */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "24px",
        background: "var(--bg-card)",
        padding: "24px",
        borderRadius: "12px",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow)"
      }}>

        {/* Column 1: Visibility Filters */}
        <div>
          <h4 className="section-tag" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}>● VISIBILITY FILTERS</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[["Standard boxes", filterStandard, setFilterStandard], ["Fragile boxes", filterFragile, setFilterFragile], ["Heavy boxes", filterHeavy, setFilterHeavy]].map(([k, v, set]) => (
              <div className="switch-container" key={k}>
                <span className="switch-label" style={{ fontWeight: 600 }}>{k}</span>
                <label className="switch"><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /><span className="slider" /></label>
              </div>
            ))}
            <div className="field-hint" style={{ marginTop: 4 }}>Standard = neither fragile nor heavy.</div>
          </div>
        </div>

        {/* Column 2: Display Settings & Stop Filtering */}
        <div>
          <h4 className="section-tag" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}>● DISPLAY & STOPS</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="switch-container">
              <span className="switch-label" style={{ fontWeight: 600 }}>Box names</span>
              <label className="switch"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /><span className="slider" /></label>
            </div>
            <div className="switch-container">
              <span className="switch-label" style={{ fontWeight: 600 }} title="Rear-door frame, front wall and the door-to-front-wall arrow">Show orientation guides</span>
              <label className="switch"><input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} /><span className="slider" /></label>
            </div>
            <div className="switch-container">
              <span className="switch-label" style={{ fontWeight: 600 }} title="A line with its length in cm across every significant gap (not up to the roof); shown once all boxes are in">Show gaps (cm)</span>
              <label className="switch"><input type="checkbox" checked={showGaps} disabled={!gaps} onChange={(e) => setShowGaps(e.target.checked)} /><span className="slider" /></label>
            </div>
            <div className="switch-container">
              <span className="switch-label" style={{ fontWeight: 600 }} title="Shade the empty space in front of every significant gap">Shade empty space</span>
              <label className="switch"><input type="checkbox" checked={shadeEmpty} disabled={!gaps} onChange={(e) => setShadeEmpty(e.target.checked)} /><span className="slider" /></label>
            </div>
            <div className="switch-container">
              <span className="switch-label" style={{ fontWeight: 600 }} title="Shift rigid vertical stacks laterally to balance left-right weight without violating C1-C6">Balance lateral load (M-7)</span>
              <label className="switch"><input type="checkbox" checked={centerLoad} disabled={!hasCentered} onChange={(e) => setCenterLoad(e.target.checked)} /><span className="slider" /></label>
            </div>

            <div>
              <label style={CAPTION}>Stop</label>
              <select className="form-input" style={{ width: "100%" }} value={selectedStop} onChange={(e) => setSelectedStop(e.target.value)}>
                <option value="All">All stops</option>
                {uniqueStops.map((stop) => <option key={stop} value={stop}>Stop {stop}</option>)}
              </select>
            </div>

            <div>
              <label style={CAPTION}>Color mode</label>
              <select className="form-input" style={{ width: "100%" }} value={colorMode} onChange={(e) => setColorMode(e.target.value)}>
                <option value="type">By type (standard / heavy)</option>
                <option value="box">By box (each box its own colour)</option>
                <option value="stop">By delivery stop</option>
                <option value="problem" disabled={!pv}>By problem{pv ? "" : " (not available)"}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Column 3: Run Summary / Packing Metrics & Problems */}
        <div>
          <h4 className="section-tag" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}>● RUN SUMMARY</h4>
          {result ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
              <Row k="Volume utilization" v={`${fmtNum(suPct, 2)}%`} color="var(--primary)" />
              <Row k="Packed boxes" v={nPlaced} />
              <Row k="Unpacked boxes" v={nNotLoaded !== null ? nNotLoaded : "—"} color={nNotLoaded > 0 ? "var(--amber)" : undefined} />
              <Row k="Total weight loaded" v={`${fmtNum(totalWeight, 1)} kg`} />

              {container && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "4px", fontSize: 12, color: "var(--text-dim)" }}>
                  Container: {container.length_cm ?? container.L} × {container.width_cm ?? container.D} × {container.height_cm ?? container.H} cm
                </div>
              )}

              {pv && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "4px" }}>
                  <div className="switch-container" style={{ marginBottom: 10 }}>
                    <span className="switch-label" style={{ fontWeight: 600 }}>Highlight problems</span>
                    <label className="switch"><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /><span className="slider" /></label>
                  </div>
                  {RULES.some(r => pv.violating[r] > 0) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {RULES.map((r) => {
                        const n = pv.violating[r];
                        if (n === 0) return null;
                        const on = ruleFilter === r;
                        return (
                          <button key={r} type="button"
                            onClick={() => { setHighlight(true); setRuleFilter(on ? null : r); }}
                            style={{
                              padding: "4px 8px", borderRadius: 4, cursor: "pointer",
                              border: `1px solid ${on ? RULE_COLOR[r] : "var(--border)"}`,
                              background: on ? "var(--bg-input)" : "transparent",
                              color: "var(--text-main)", fontSize: 11, fontWeight: on ? 700 : 500
                            }}>
                            {r} ({n})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
              Run summary will appear here when a run is loaded.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
