import React, { useState, useMemo, useCallback } from "react";
import BinViewer from "../BinViewer";

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

export default function VisualizationTab({
  placements,
  itemsList,
  instanceInfo,
  binsUsed,
  running,
  stats,
  chartData
}) {
  // Visualization Control states (encapsulated locally)
  const [viewportOrientation, setViewportOrientation] = useState("3D");
  const [viewportTrigger, setViewportTrigger] = useState(0);
  const [filterStandard, setFilterStandard] = useState(true);
  const [filterFragile, setFilterFragile] = useState(true);
  const [filterHeavy, setFilterHeavy] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [selectedStop, setSelectedStop] = useState("All");
  const [selectedItemInfo, setSelectedItemInfo] = useState(null);

  const triggerViewReset = useCallback((dir) => {
    setViewportOrientation(dir);
    setViewportTrigger((prev) => prev + 1);
  }, []);

  // Derived stops from placements
  const uniqueStops = useMemo(() => {
    if (!placements) return [1];
    const stopsSet = new Set();
    for (const p of placements) {
      if (p.stop !== undefined) stopsSet.add(p.stop);
    }
    const sortedStops = Array.from(stopsSet).sort((a, b) => a - b);
    return sortedStops.length > 0 ? sortedStops : [1];
  }, [placements]);

  // Filtered placements for viewport visualization
  const filteredPlacements = useMemo(() => {
    if (!placements) return null;
    return placements.filter((p) => {
      if (selectedStop !== "All" && p.stop !== Number(selectedStop)) return false;
      const origItem = itemsList.find((it) => it.id === p.id);
      const type = origItem ? origItem.Type : (p.type || "Standard");
      if (type === "Standard") return filterStandard;
      if (type === "Fragile") return filterFragile;
      if (type === "Heavy") return filterHeavy;
      return true;
    });
  }, [placements, itemsList, filterStandard, filterFragile, filterHeavy, selectedStop]);

  return (
    <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>

      {/* Sidebar Left Column Wrapper */}
      <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: "20px" }}>

        {/* View controls panel */}
        <div className="card">
          <h4 className="section-tag" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}>
            ● VIEW CONTROLS
          </h4>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Rotate preset buttons */}
            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                Rotate view
              </label>
              <div className="tabs-inline grow">
                {["Front", "Side", "Top", "3D"].map((dir) => (
                  <button
                    key={dir}
                    onClick={() => triggerViewReset(dir)}
                    className={viewportOrientation === dir ? "active" : ""}
                    style={{
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer"
                    }}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter switches */}
            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                Filter by type
              </label>
              <div className="switch-container">
                <span className="switch-label">Standard</span>
                <label className="switch">
                  <input type="checkbox" checked={filterStandard} onChange={(e) => setFilterStandard(e.target.checked)} />
                  <span className="slider" />
                </label>
              </div>
              <div className="switch-container">
                <span className="switch-label">Fragile</span>
                <label className="switch">
                  <input type="checkbox" checked={filterFragile} onChange={(e) => setFilterFragile(e.target.checked)} />
                  <span className="slider" />
                </label>
              </div>
              <div className="switch-container">
                <span className="switch-label">Heavy</span>
                <label className="switch">
                  <input type="checkbox" checked={filterHeavy} onChange={(e) => setFilterHeavy(e.target.checked)} />
                  <span className="slider" />
                </label>
              </div>
            </div>

            {/* Labels switch */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
              <div className="switch-container">
                <span className="switch-label" style={{ fontWeight: "700" }}>Item IDs</span>
                <label className="switch">
                  <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                  <span className="slider" />
                </label>
              </div>
            </div>

            {/* Stop Select Dropdown */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
              <label className="form-label" style={{ display: "block", marginBottom: "6px", fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase" }}>Stop</label>
              <select
                value={selectedStop}
                onChange={(e) => setSelectedStop(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "var(--text-main)",
                  fontSize: "13px",
                  fontWeight: "600",
                  outline: "none",
                  cursor: "pointer",
                  transition: "border-color 0.15s ease"
                }}
              >
                <option value="All">All</option>
                {uniqueStops.map(stop => (
                  <option key={stop} value={stop}>Stop {stop}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Placement Details Card */}
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "24px",
          boxShadow: "var(--shadow)",
          minHeight: "180px",
          display: "flex",
          flexDirection: "column"
        }}>
          <h4 className="form-label" style={{ color: "var(--primary)", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px", fontSize: "13px", fontWeight: "700" }}>
            ● PLACEMENT DETAILS
          </h4>
          {selectedItemInfo ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>Name:</span>
                <span style={{ fontWeight: "700", color: "var(--text-main)" }}>{selectedItemInfo.id}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>Coordinates:</span>
                <span style={{ fontWeight: "700", color: "var(--text-main)" }}>({selectedItemInfo.x}, {selectedItemInfo.y}, {selectedItemInfo.z})</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>Size (W×D×H):</span>
                <span style={{ fontWeight: "700", color: "var(--text-main)" }}>{selectedItemInfo.l} × {selectedItemInfo.d} × {selectedItemInfo.h} cm</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>Stop:</span>
                <span style={{ fontWeight: "700", color: "var(--primary)" }}>Stop {selectedItemInfo.stop}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-dim)" }}>Weight:</span>
                <span style={{ fontWeight: "700", color: "var(--text-main)" }}>{selectedItemInfo.weight} kg</span>
              </div>
              {selectedItemInfo.fragile !== undefined && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-dim)" }}>Fragility:</span>
                  <span style={{ fontWeight: "700", color: selectedItemInfo.fragile ? "var(--amber)" : "var(--text-main)" }}>
                    {selectedItemInfo.fragile ? "Fragile — nothing may rest on it (C4)" : "Standard"}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--text-dim)", fontSize: "12px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "8px", padding: "16px" }}>
              <span style={{ fontSize: "16px" }}>🔍</span>
              <span style={{ marginTop: "6px" }}>Hover over a packed box to inspect details</span>
            </div>
          )}
        </div>
      </div>

      {/* Viewport canvas on right */}
      <div style={{ flex: "2 1 600px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "700" }}>3-D Packing Viewport</h3>
            <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>Updates dynamically during iteration loops. Use mouse controls to rotate/zoom.</span>
          </div>
        </div>

        {filteredPlacements && instanceInfo ? (
          <BinViewer
            placements={filteredPlacements}
            container={instanceInfo.container}
            binsUsed={binsUsed}
            showLabels={showLabels}
            running={running}
            orientation={viewportOrientation}
            resetTrigger={viewportTrigger}
            onResetView={() => triggerViewReset("3D")}
            onHoverItem={setSelectedItemInfo}
            onInteract={() => {
              if (viewportOrientation !== "3D") {
                setViewportOrientation("3D");
              }
            }}
          />
        ) : running ? (
          <LiveProgress stats={stats} chartData={chartData} />
        ) : (
          <div style={{ height: "450px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--bg-input)", borderRadius: "8px", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📦</div>
            <h4 style={{ color: "var(--text-muted)", fontSize: "14px", fontWeight: "600" }}>No Active Run Data</h4>
            <p style={{ color: "var(--text-dim)", fontSize: "12px", marginTop: "4px" }}>Start the optimizer from the Logistics tab to view output.</p>
          </div>
        )}
      </div>
    </div>
  );
}
