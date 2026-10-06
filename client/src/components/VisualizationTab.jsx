import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import CustomLoadBanner, { customLoadOf, CUSTOM_LOAD_LABEL } from "./CustomLoadBanner";
import BinViewer, { TYPE_COLOR, COMPLIANT_COLOR, PROBLEM_OUTLINE, stopColor } from "../BinViewer";
import { studiesApi } from "../services/api";
import {
  heavyRule, isHeavy, RULES, RULE_NAME, RULE_SHORT, RULE_COLOR,
  physics, orientationText, fmtNum,
} from "../viewer/boxInfo";

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
  studies,
  request = null,   // { studyId, runIndex, method } from a Results solution card
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
  const [requestBusy, setRequestBusy] = useState(false);

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
                {["Front", "Side", "Top", "3D"].map((dir) => (
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
              onInteract={() => { if (viewportOrientation !== "3D") setViewportOrientation("3D"); }}
            />
          ) : running && source === "run" ? (
            <LiveProgress stats={stats} />
          ) : (
            <div style={{ height: "450px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg-input)", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>📦</div>
              <h4 style={{ color: "var(--text-muted)", fontSize: "14px", fontWeight: "600" }}>Nothing to show yet</h4>
              <p style={{ color: "var(--text-dim)", fontSize: "12px", marginTop: "4px" }}>
                {source === "study" ? "Pick a study run and click “Show this run”." : "Start a run from Start analysis, or open a saved one from Run history."}
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
              <span className="switch-label" style={{ fontWeight: 600 }} title="Rear-door frame, cab-end wall and the door-to-cab arrow">Show orientation guides</span>
              <label className="switch"><input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} /><span className="slider" /></label>
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

        {/* Column 3: Run Selection */}
        <div>
          <h4 className="section-tag" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}>● WHICH RUN</h4>
          <div className="tabs-inline grow" style={{ marginBottom: 16 }}>
            <button type="button" className={source === "run" ? "active" : ""} onClick={() => setSource("run")}>This run</button>
            <button type="button" className={source === "study" ? "active" : ""} onClick={() => setSource("study")}>A study run</button>
          </div>
          {source === "run" ? (
            <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
              {finalResult ? "Preview: one run, one seed. Showing the run you just made, or the saved run you opened from Run history." : "No run yet — start one from Start analysis, or open one from Run history."}
            </div>
          ) : (
            <StudyRunPicker studies={studies} onLoaded={(v) => { setStudyError(null); setStudyView(v); }} onError={(m) => { setStudyView(null); setStudyError(m); }} />
          )}
        </div>

        {/* Column 4: Run Summary / Packing Metrics & Problems */}
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
