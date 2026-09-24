import React from "react";

import { methodOf, methodLabel } from "../methods";
import LoadSources from "./LoadSources";

// "on this machine: DGWO 9.9 s (median of 3) · …" from saved, finished runs
// at exactly this pop x iterations. Nothing measured -> say so.
function timingNote(runs, pop, iter) {
  const by = {};
  for (const r of runs || []) {
    if (r.status === "failed" || r.pop_size !== pop || r.max_iter !== iter || r.runtime_s == null) continue;
    const m = methodOf(r.strategy_code || r.strategy);
    if (!m) continue;
    (by[m.code] = by[m.code] || []).push(Number(r.runtime_s));
  }
  const parts = ["DGWO", "MOGWO", "SEQ", "REP"].filter((c) => by[c]).map((c) => {
    const a = by[c].slice().sort((x, y) => x - y);
    const med = a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
    const txt = med >= 120 ? `${(med / 60).toFixed(1)} min` : `${med.toFixed(1)} s`;
    return `${c} ${txt} (median of ${a.length})`;
  });
  return parts.length ? `on this machine: ${parts.join(" · ")}` : "no timed runs at this size on this machine yet";
}

export default function LogisticsTab({
  containerSpecs,
  setContainerSpecs,
  maxLoad,
  setMaxLoad,
  strategy,
  setStrategy,
  wolfSize,
  setWolfSize,
  maxIter,
  setMaxIter,
  seed,
  setSeed,
  lam,
  setLam,
  enforceSupport,
  setEnforceSupport,
  enforceFragility,
  setEnforceFragility,
  itemsList,
  setItemsList,
  setIsCustomized,
  loadingList,
  selected,
  setSelected,
  groupedInstances,
  // NEW: instanceItems should be passed from parent — the parsed items from the selected OR-lib JSON
  instanceItems = [],
  running,
  elapsed,
  handleStartRun,
  handleStopRun,
  canRun,
  // wtpack (thesis) dataset + demo presets + optimizer readiness
  dataset = "wtpack",
  setDataset = () => {},
  wtpackInstances = [],
  wtpackId = null,
  setWtpackId = () => {},
  preset = "quick",
  setPreset = () => {},
  setWolfSizeCustom,
  setMaxIterCustom,
  optimizerReady = { state: "cold" },
  // SOP: the locked "Test settings" panel and the Full Comparison launcher (Shell builds both)
  testSettings = null,
  studyLauncher = null,
  runHistory = [],
  // the four load sources (LoadSources) and what the footer says about the chosen one
  loadSources = {},
  loadSummary = { boxes: null, text: "—" },
}) {
  const onWolfSize = setWolfSizeCustom || setWolfSize;
  const onMaxIter  = setMaxIterCustom  || setMaxIter;

  // Preset sizes only. How long each takes is read from this machine's own
  // saved runs (median per method), never typed in.
  const PRESET_SIZES = {
    quick:    { label: "Quick demo", pop: 10, iter: 60 },
    standard: { label: "Standard",   pop: 10, iter: 300 },
    full:     { label: "Full",       pop: 30, iter: 500 },
  };
  const PRESET_INFO = Object.fromEntries(Object.entries(PRESET_SIZES).map(([k, p]) => [k, { ...p, note: timingNote(runHistory, p.pop, p.iter) }]));
  const customSource = loadSources.source === "typed" || loadSources.source === "csv";
  const sampleMeta = loadSources.samples && loadSources.samples.samples
    ? loadSources.samples.samples.find((x) => x.instance_id === loadSources.sampleId) : null;
  const selectedWtpack = wtpackInstances.find((i) => i.instance_id === wtpackId) || null;
  // The container of the chosen source: editable for a custom load, read-only
  // (the instance's own) for the OR-Library sources.
  const shownContainer = customSource ? null
    : loadSources.source === "sample" ? (sampleMeta ? sampleMeta.container : null)
    : (selectedWtpack ? selectedWtpack.container : null);
  const setDim = (k, v) => setContainerSpecs({ ...containerSpecs, [k]: v });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top row: Left sidebar + Right main panel */}
      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>

        {/* ── Left Sidebar ── */}
        <div style={{ flex: "1 1 350px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Container card */}
          <div className="card">
            <h4
              className="form-label"
              style={{ color: "var(--primary)", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}
            >
              ● CONTAINER (BIN)
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                  Length (door to cab) × Width × Height (cm)
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[["length", "Length (door to cab)", "L"], ["width", "Width", "W"], ["height", "Height", "H"]].map(([k, title, rawKey]) => (
                    <input
                      key={k}
                      type="number"
                      aria-label={`Container ${title} (cm)`}
                      title={`${title} (cm)`}
                      value={shownContainer ? shownContainer[rawKey] : containerSpecs[k]}
                      onChange={(e) => setDim(k, e.target.value)}
                      style={{ width: "33.3%", padding: "10px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px", fontWeight: "600", outline: "none", textAlign: "center" }}
                      disabled={running || !customSource}
                    />
                  ))}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "6px", lineHeight: 1.4 }}>
                  {customSource
                    ? "Your container. Length runs from the rear door toward the cab; the door is the Width × Height face."
                    : "This test case's own container (rear door on the width × height face). Pick \"Type them in\" or \"Import a CSV\" to set your own."}
                </div>
              </div>
              {customSource && (
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                    Max weight (kg) — optional
                  </label>
                  <input type="number" min="0" placeholder="no limit" aria-label="Container max weight (kg)"
                    value={containerSpecs.max_weight} disabled={running} onChange={(e) => setDim("max_weight", e.target.value)}
                    style={{ width: "100%", padding: "10px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px", fontWeight: "600", outline: "none", textAlign: "center" }} />
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "6px", lineHeight: 1.4 }}>
                    Checked after the run (packed weight vs this limit). Not part of the optimization.
                  </div>
                </div>
              )}
              <div className="dashed-preview">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                <span>
                  {shownContainer
                    ? `${shownContainer.L} × ${shownContainer.W} × ${shownContainer.H} cm`
                    : `${containerSpecs.length || "?"} × ${containerSpecs.width || "?"} × ${containerSpecs.height || "?"} cm`} (length × width × height)
                </span>
              </div>
            </div>
          </div>

          {/* Algorithm settings card */}
          <div className="card">
            <h4
              className="form-label"
              style={{ color: "var(--primary)", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}
            >
              ● ALGORITHM SETTINGS
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                  Configuration
                </label>
                <div className="tabs-inline grow">
                  {["DGWO", "MOGWO", "Sequential", "Repair-based"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setStrategy(s)}
                      className={strategy === s ? "active" : ""}
                      title={methodLabel(s)}
                    >
                      {methodOf(s) ? methodOf(s).name : s}
                    </button>
                  ))}
                </div>
                {methodOf(strategy) && (
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px", lineHeight: 1.45 }}>
                    <b>{methodLabel(strategy)}.</b> {methodOf(strategy).how}
                  </div>
                )}
              </div>

              {/* Demo presets: drive pop_size / max_iter. Durations are measured, not guessed. */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                  Run preset
                </label>
                <div className="tabs-inline grow">
                  {Object.entries(PRESET_INFO).map(([key, p]) => (
                    <button
                      key={key}
                      onClick={() => setPreset(key)}
                      disabled={running}
                      title={`pop ${p.pop} × ${p.iter} iterations — ${p.note}`}
                      className={preset === key ? "active" : ""}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: "11px", color: preset === "full" ? "var(--amber)" : "var(--text-dim)", marginTop: "6px", lineHeight: 1.4 }}>
                  {preset === "custom"
                    ? `Custom — pop ${wolfSize} × ${maxIter} iterations`
                    : `pop ${PRESET_INFO[preset]?.pop} × ${PRESET_INFO[preset]?.iter} iterations · ${PRESET_INFO[preset]?.note}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Wolf pack size</label>
                  <input type="number" value={wolfSize} onChange={(e) => onWolfSize(Number(e.target.value))} style={{ width: "100%", padding: "10px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px", fontWeight: "600", outline: "none", textAlign: "center" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Max iterations</label>
                  <input type="number" value={maxIter} onChange={(e) => onMaxIter(Number(e.target.value))} style={{ width: "100%", padding: "10px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px", fontWeight: "600", outline: "none", textAlign: "center" }} />
                </div>
              </div>
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "4px" }}>
                <label style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>Decode-time constraints</label>
                {[
                  { label: "Enforce stability (C5) at placement", val: enforceSupport, set: setEnforceSupport },
                  { label: "Enforce fragility (C4) at placement", val: enforceFragility, set: setEnforceFragility },
                ].map(({ label, val, set }) => (
                  <div className="switch-container" key={label}>
                    <span className="switch-label">{label}</span>
                    <label className="switch">
                      <input type="checkbox" checked={val} disabled={running} onChange={(e) => set(e.target.checked)} />
                      <span className="slider" />
                    </label>
                  </div>
                ))}
                <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Penalty λ (all four)</label>
                    <input type="number" step="0.05" min="0" value={lam} disabled={running}
                      onChange={(e) => setLam(Number(e.target.value))}
                      style={{ width: "100%", padding: "10px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px", fontWeight: "600", outline: "none", textAlign: "center" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>Seed</label>
                    <input type="number" value={seed} disabled={running}
                      onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="random"
                      style={{ width: "100%", padding: "10px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px", fontWeight: "600", outline: "none", textAlign: "center" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {testSettings}
        </div>

        {/* ── Right Main Panel ── */}
        <div style={{ flex: "2 1 600px", display: "flex", flexDirection: "column", gap: "20px" }}>

          <LoadSources wtpackInstances={wtpackInstances} wtpackId={wtpackId} setWtpackId={setWtpackId}
            running={running} {...loadSources} />
        </div>
      </div>

      {/* ── Two ways to run this ── */}
      <div>
        <h4 style={{ fontSize: 16, fontWeight: 800, color: "var(--text-main)", marginBottom: 4 }}>Two ways to run this</h4>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14 }}>
          <b>Quick Test</b> — a single run of the configuration you picked, with the 3D viewer (the bar below). <b>Full Comparison</b> — all four configurations, many runs each, then the Chapter 3 statistics.
        </p>
        {studyLauncher}
      </div>

      {/* ── Bottom Status bar ── */}
      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px",
        padding: "16px 24px", boxShadow: "var(--shadow)",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px"
      }}>
        <div style={{ fontSize: "13px", color: "var(--text-dim)", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--text-main)", fontWeight: "700" }}>{loadSummary.boxes ?? "—"}</span> boxes ready
          <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span>
          Source: <span style={{ color: "var(--primary)", fontWeight: "700" }}>{loadSummary.text}</span>
          <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span>
          Strategy: <span style={{ color: "var(--primary)", fontWeight: "700" }}>{strategy}</span>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* numba warm-up state, so the first run does not look like a hang */}
          <span
            title={optimizerReady.state === "warm" ? `Compiled in ${(optimizerReady.seconds || 0).toFixed(1)} s` : (optimizerReady.error || "")}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              fontSize: "12px", fontWeight: "700", padding: "6px 10px", borderRadius: "999px",
              border: "1px solid var(--border)",
              color: optimizerReady.state === "warm" ? "var(--green)"
                   : optimizerReady.state === "error" || optimizerReady.state === "offline" ? "var(--red)"
                   : "var(--amber)",
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
            {optimizerReady.state === "warm" ? "Optimizer ready"
             : optimizerReady.state === "warming" ? "Warming up optimizer…"
             : optimizerReady.state === "error" ? "Optimizer warm-up failed"
             : optimizerReady.state === "offline" ? "Server offline"
             : "Optimizer cold"}
          </span>
          {!running ? (
            <button
              onClick={handleStartRun}
              disabled={!canRun}
              className="btn btn-primary"
              style={{ padding: "10px 24px", fontSize: "14px", whiteSpace: "nowrap" }}
            >
              Quick Test — run optimizer
            </button>
          ) : (
            <>
              <button disabled style={{ padding: "10px 24px", background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: "6px", fontSize: "14px", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Running... {elapsed}s
              </button>
              <button onClick={handleStopRun} style={{ padding: "10px 24px", background: "var(--red-light)", border: "1px solid var(--red)", color: "var(--red)", borderRadius: "6px", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
                ■ Stop
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
