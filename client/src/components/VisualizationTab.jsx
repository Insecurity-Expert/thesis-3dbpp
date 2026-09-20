import React, { useState, useMemo, useCallback } from "react";
import BinViewer from "../BinViewer";

export default function VisualizationTab({
  placements,
  itemsList,
  instanceInfo,
  binsUsed,
  running
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
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
          <h4 className="form-label" style={{ color: "var(--primary)", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}>
            ● VIEW CONTROLS
          </h4>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Rotate preset buttons */}
            <div>
              <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                Rotate view
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {["Front", "Side", "Top", "3D"].map((dir) => (
                  <button
                    key={dir}
                    onClick={() => triggerViewReset(dir)}
                    style={{
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid var(--border)",
                      background: viewportOrientation === dir ? "var(--primary)" : "var(--bg-input)",
                      color: viewportOrientation === dir ? "#ffffff" : "var(--text-muted)",
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
