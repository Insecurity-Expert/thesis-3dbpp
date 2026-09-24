import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import CustomLoadBanner, { customLoadOf, CUSTOM_LOAD_LABEL } from "./CustomLoadBanner";
import BinViewer, { TYPE_COLOR, COMPLIANT_COLOR, PROBLEM_OUTLINE, stopColor } from "../BinViewer";
import { studiesApi } from "../services/api";
import {
  heavyRule, isHeavy, HEAVY_PERCENTILE, RULES, RULE_NAME, RULE_SHORT, RULE_COLOR,
  physics, orientationText, fmtNum,
} from "../viewer/boxInfo";

// Tiny inline SVG sparkline of best-so-far SU (and CSR) while a run streams.
function Sparkline({ data, maxIter }) {
  const W = 520, H = 120, P = 6;
  const pts = (data || []).filter((d) => d.su !== undefined && d.su !== null);
  if (pts.length < 2) return <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--text-dim)" }}>Waiting for the first iterations…</div>;
  const n = Math.max(maxIter || 0, pts[pts.length - 1].iter || pts.length);
  const x = (it) => P + ((it - 1) / Math.max(n - 1, 1)) * (W - 2 * P);
  const y = (v) => H - P - Math.max(0, Math.min(1, v)) * (H - 2 * P);
  const su = pts.map((d) => `${x(d.iter).toFixed(1)},${y(d.su).toFixed(1)}`).join(" ");
  const csr = pts.filter((d) => d.csr !== undefined && d.csr !== null).map((d) => `${x(d.iter).toFixed(1)},${y(d.csr / 100).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }} aria-label="live convergence">
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={P} x2={W - P} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray="3 4" />)}
      {csr && <polyline points={csr} fill="none" stroke="var(--green)" strokeWidth="1.5" opacity="0.8" />}
      <polyline points={su} fill="none" stroke="var(--primary)" strokeWidth="2" />
    </svg>
  );
}

// Shown in the viewport while a thesis strategy runs: they stream metrics,
// not partial packings, so there is nothing to draw until instance_complete.
function LiveProgress({ stats, chartData }) {
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
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dim)", marginBottom: "6px" }}>
          <span>Live convergence</span>
          <span><span style={{ color: "var(--primary)" }}>■</span> SU &nbsp;<span style={{ color: "var(--green)" }}>■</span> CSR</span>
        </div>
        <Sparkline data={chartData} maxIter={n} />
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

// ── Study run picker: configuration / test case / seed -> run index ─────────
function StudyRunPicker({ studies, onLoaded, onError }) {
  const usable = (studies || []).filter((s) => s.status === "done" || s.status === "imported");
  const [studyId, setStudyId] = useState(usable[0] ? usable[0].id : null);
  const [doc, setDoc] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [inst, setInst] = useState(null);
  const [seed, setSeed] = useState(null);
  const [busy, setBusy] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (studyId === null) return;
    let alive = true;
    setDoc(null);
    studiesApi.get(studyId).then((d) => {
      if (!alive) return;
      const runs = (d.study && d.study.runs) || [];
      setDoc(d.study);
      setCfg(runs[0] ? runs[0].configuration : null);
      setInst(runs[0] ? runs[0].instance_id : null);
      setSeed(runs[0] ? runs[0].seed : null);
    }).catch((e) => alive && onErrorRef.current(`Could not open the study: ${e.message}`));
    return () => { alive = false; };
  }, [studyId]);

  if (usable.length === 0) return <div style={{ fontSize: 12, color: "var(--text-dim)" }}>No finished studies yet. Import or run one from Start analysis.</div>;
  const runs = (doc && doc.runs) || [];
  const uniq = (xs) => Array.from(new Set(xs));
  const cfgs = uniq(runs.map((r) => r.configuration));
  const insts = uniq(runs.filter((r) => r.configuration === cfg).map((r) => r.instance_id));
  const seeds = uniq(runs.filter((r) => r.configuration === cfg && r.instance_id === inst).map((r) => r.seed));
  const idx = runs.findIndex((r) => r.configuration === cfg && r.instance_id === inst && r.seed === seed);
  const sel = { width: "100%", marginBottom: 8 };

  const load = async () => {
    if (idx < 0) return;
    setBusy(true);
    try {
      const view = await studiesApi.runView(studyId, idx);
      onLoaded({ ...view, study_label: doc.name });
    } catch (e) {
      onError(`This study run could not be shown: ${e.message}`);
    } finally { setBusy(false); }
  };

  return (
    <div>
      <select className="form-input" style={sel} value={studyId ?? ""} onChange={(e) => setStudyId(Number(e.target.value))}>
        {usable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {doc && (
        <>
          <select className="form-input" style={sel} value={cfg ?? ""} onChange={(e) => setCfg(e.target.value)}>
            {cfgs.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-input" style={sel} value={inst ?? ""} onChange={(e) => setInst(e.target.value === "" ? null : Number(e.target.value))}>
            {insts.map((i) => <option key={i ?? "custom"} value={i ?? ""}>{i === null ? `Custom load (${CUSTOM_LOAD_LABEL.split(" \u2014 ")[1]})` : `Instance ${i}`}</option>)}
          </select>
          <select className="form-input" style={sel} value={seed ?? ""} onChange={(e) => setSeed(Number(e.target.value))}>
            {seeds.map((s) => <option key={s} value={s}>Repeat code (seed) {s}</option>)}
          </select>
          <button type="button" className="btn btn-primary btn-sm btn-block" disabled={busy || idx < 0} onClick={load}>
            {busy ? "Rebuilding…" : "Show this run"}
          </button>
          <div className="field-hint" style={{ marginTop: 6 }}>The stored arrangement is re-checked first: if its container fill or rule score does not match what the study recorded, you get an error instead of a picture.</div>
        </>
      )}
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
  chartData,
  studies,
}) {
  const [viewportOrientation, setViewportOrientation] = useState("3D");
  const [viewportTrigger, setViewportTrigger] = useState(0);
  const [filterStandard, setFilterStandard] = useState(true);
  const [filterFragile, setFilterFragile] = useState(true);
  const [filterHeavy, setFilterHeavy] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [showGuides, setShowGuides] = useState(true);   // rear door / cab end / depth arrow
  const [selectedStop, setSelectedStop] = useState("All");
  const [colorMode, setColorMode] = useState("type");
  const [highlight, setHighlight] = useState(false);
  const [ruleFilter, setRuleFilter] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [pinned, setPinned] = useState(null);
  const [source, setSource] = useState("run");          // run | study
  const [studyView, setStudyView] = useState(null);
  const [studyError, setStudyError] = useState(null);
  const [showUnplaced, setShowUnplaced] = useState(false);

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

  useEffect(() => { setPinned(null); setHovered(null); setRuleFilter(null); }, [result]);

  const items = useMemo(() => (result && result.items) || [], [result]);
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
        <Row k="Position (x, y from door, z)" v={`(${fmtNum(ph.x)}, ${fmtNum(ph.y)}, ${fmtNum(ph.z)}) cm`} />
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

  return (
    <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>

      {/* Sidebar */}
      <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: "20px", minWidth: 0 }}>

        {/* Which run */}
        <div className="card">
          <h4 className="section-tag" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "12px" }}>● WHICH RUN</h4>
          <div className="tabs-inline grow" style={{ marginBottom: 12 }}>
            <button type="button" className={source === "run" ? "active" : ""} onClick={() => setSource("run")}>This run</button>
            <button type="button" className={source === "study" ? "active" : ""} onClick={() => setSource("study")}>A study run</button>
          </div>
          {source === "run" ? (
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
              {finalResult ? "The run you just made, or the saved run you opened from Run history." : "No run yet — start one from Start analysis, or open one from Run history."}
            </div>
          ) : (
            <StudyRunPicker studies={studies} onLoaded={(v) => { setStudyError(null); setStudyView(v); }} onError={(m) => { setStudyView(null); setStudyError(m); }} />
          )}
          {customLoadOf(result) && <div style={{ marginTop: 12 }}><CustomLoadBanner info={customLoadOf(result)} /></div>}
        </div>

        {/* View controls */}
        <div className="card">
          <h4 className="section-tag" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}>● VIEW CONTROLS</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div>
              <label style={CAPTION}>Which angle?</label>
              <div className="tabs-inline grow">
                {["Front", "Side", "Top", "3D"].map((dir) => (
                  <button key={dir} onClick={() => triggerViewReset(dir)} className={viewportOrientation === dir ? "active" : ""} style={{ fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>{dir}</button>
                ))}
              </div>
            </div>

            <div>
              <label style={CAPTION}>What do the colours mean?</label>
              <select className="form-input" style={{ width: "100%" }} value={colorMode} onChange={(e) => setColorMode(e.target.value)}>
                <option value="type">By type (standard / heavy)</option>
                <option value="box">By box (each box its own colour)</option>
                <option value="stop">By delivery stop</option>
                <option value="problem" disabled={!pv}>By problem{pv ? "" : " (not available for this run)"}</option>
              </select>
              <div className="field-hint" style={{ marginTop: 6 }}>
                Heavy = mass at or above the {HEAVY_PERCENTILE}th percentile of the {heavy.scope}
                {heavy.threshold !== null ? ` (${fmtNum(heavy.threshold, 2)} kg)` : ""}. Fragile boxes always carry an amber outline, so a box can be both.
              </div>
            </div>

            <div>
              <label style={CAPTION}>Show or hide</label>
              {[["Standard boxes", filterStandard, setFilterStandard], ["Fragile boxes", filterFragile, setFilterFragile], ["Heavy boxes", filterHeavy, setFilterHeavy]].map(([k, v, set]) => (
                <div className="switch-container" key={k}>
                  <span className="switch-label">{k}</span>
                  <label className="switch"><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /><span className="slider" /></label>
                </div>
              ))}
              <div className="field-hint">Standard = neither fragile nor heavy.</div>
            </div>

            <div>
              <label style={CAPTION}>Stop</label>
              <select className="form-input" style={{ width: "100%" }} value={selectedStop} onChange={(e) => setSelectedStop(e.target.value)}>
                <option value="All">All stops</option>
                {uniqueStops.map((stop) => <option key={stop} value={stop}>Stop {stop}</option>)}
              </select>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
              <div className="switch-container">
                <span className="switch-label" style={{ fontWeight: "700" }}>Box names</span>
                <label className="switch"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /><span className="slider" /></label>
              </div>
              <div className="switch-container">
                <span className="switch-label" style={{ fontWeight: "700" }} title="Rear-door frame, cab-end wall and the door-to-cab arrow">Show orientation guides</span>
                <label className="switch"><input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} /><span className="slider" /></label>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", fontSize: "12px", lineHeight: 1.5 }}>
              <div style={CAPTION}>Container</div>
              {container ? (
                <div style={{ color: "var(--text-main)", fontWeight: 600 }}>
                  {`${container.length_cm ?? container.L} × ${container.width_cm ?? container.D} × ${container.height_cm ?? container.H} cm (length × width × height), rear door`}
                </div>
              ) : result ? (
                <div className="alert-danger" style={{ fontSize: 12 }}>This run does not carry its container size, so it cannot be drawn.</div>
              ) : (
                <div style={{ color: "var(--text-dim)" }}>—</div>
              )}
              <div style={{ color: "var(--text-dim)" }}>Loaded and unloaded through the rear door. Stop 1 is unloaded first, so its boxes should sit nearest the door.</div>
            </div>
          </div>
        </div>

        {/* Problems */}
        {result && (
          <div className="card">
            <h4 className="section-tag" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "12px" }}>● PROBLEMS</h4>
            {!pv ? (
              <div className="info-callout" style={{ fontSize: 12.5 }}>
                Problem view unavailable for runs saved before v1 of the problem view (24 Sep 2026). The arrangement is shown as saved; per-box rule checks were not recorded for it.
              </div>
            ) : (
              <>
                <div className="switch-container">
                  <span className="switch-label" style={{ fontWeight: 700 }}>Highlight boxes with problems</span>
                  <label className="switch"><input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} /><span className="slider" /></label>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0" }}>
                  {RULES.map((r) => {
                    const n = pv.violating[r];
                    const on = ruleFilter === r;
                    return (
                      <button key={r} type="button" disabled={n === 0}
                        onClick={() => { setHighlight(true); setRuleFilter(on ? null : r); }}
                        title={n === 0 ? "No box breaks this rule" : on ? "Show all boxes again" : "Show only the boxes breaking this rule"}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, cursor: n === 0 ? "default" : "pointer",
                                 border: `1px solid ${on ? RULE_COLOR[r] : "var(--border)"}`, background: on ? "var(--bg-input)" : "transparent", color: "var(--text-main)", fontSize: 12.5, textAlign: "left" }}>
                        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: RULE_COLOR[r], marginRight: 7 }} />{r} · {RULE_NAME[r]}</span>
                        <b>{n}</b>
                      </button>
                    );
                  })}
                </div>
                {ruleFilter && <div className="field-hint" style={{ marginBottom: 8 }}>Showing only boxes breaking {ruleFilter}. Click it again to show all.</div>}
                <div style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Row k="Loaded boxes following C3–C6" v={`${pv.compliant_placed} of ${pv.n_placed}`} />
                  <Row k="All boxes following C3–C6" v={`${pv.compliant_placed} of ${pv.n_items} (${fmtNum((100 * pv.compliant_placed) / pv.n_items, 1)}%)`} />
                  <div className="field-hint" style={{ marginTop: -2 }}>A box that was not loaded counts as not following the rules.</div>
                </div>
              </>
            )}
            {nNotLoaded !== null && (
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, fontSize: 12.5 }}>
                <Row k="Boxes not loaded" v={`${nNotLoaded} of ${nItems}`} color={nNotLoaded > 0 ? "var(--amber)" : undefined} />
                {pv && pv.unplaced.length > 0 && (
                  <>
                    <button type="button" className="btn btn-ghost btn-xs" style={{ marginTop: 6 }} onClick={() => setShowUnplaced((s) => !s)}>
                      {showUnplaced ? "Hide the list" : "List them"}
                    </button>
                    {showUnplaced && (
                      <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 6 }}>
                        <table className="data-table" style={{ width: "100%", fontSize: 12 }}>
                          <thead><tr><th>Box</th><th>Stop</th><th>Fragile</th></tr></thead>
                          <tbody>
                            {pv.unplaced.map((u) => <tr key={u.item_idx}><td className="mono">{u.id}</td><td>{u.stop}</td><td>{u.fragile ? "Yes" : "No"}</td></tr>)}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Box details */}
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
      </div>

      {/* Viewport */}
      <div style={{ flex: "2 1 600px", minWidth: 0, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "700" }}>Your packed container</h3>
            <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
              {result && result.source === "study"
                ? `${result.study_label || "Study"} · ${result.strategy} · instance ${result.instance} · seed ${result.seed} — container fill ${fmtNum(result.verified.su_pct, 2)}%, rules ${fmtNum(result.verified.csr_pct, 2)}% (both match the stored study)`
                : "Drag to rotate, scroll to zoom. Click a box for its details."}
            </span>
          </div>
          {result && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Showing {filteredPlacements.length} of {nPlaced} loaded boxes</span>}
        </div>

        {source === "study" && studyError ? (
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
            onInteract={() => { if (viewportOrientation !== "3D") setViewportOrientation("3D"); }}
          />
        ) : running && source === "run" ? (
          <LiveProgress stats={stats} chartData={chartData} />
        ) : (
          <div style={{ height: "450px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg-input)", borderRadius: "8px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📦</div>
            <h4 style={{ color: "var(--text-muted)", fontSize: "14px", fontWeight: "600" }}>Nothing to show yet</h4>
            <p style={{ color: "var(--text-dim)", fontSize: "12px", marginTop: "4px" }}>
              {source === "study" ? "Pick a study run on the left and click “Show this run”." : "Start a run from Start analysis, or open a saved one from Run history."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
