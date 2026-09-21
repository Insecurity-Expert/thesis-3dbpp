import React, { useState, useRef, useMemo, useEffect } from "react";

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
  optimizerReady = { state: "cold" }
}) {
  const onWolfSize = setWolfSizeCustom || setWolfSize;
  const onMaxIter  = setMaxIterCustom  || setMaxIter;

  // Measured on the demo machine (i5-1235U), instance 350 (129 boxes), Quick
  // preset. See docs/DEMO.md for the full table.
  const PRESET_INFO = {
    quick:    { label: "Quick demo", pop: 10, iter: 60,  note: "measured: DGWO/MOGWO/SEQ 20–30 s · REP 5.5 min (for a live REP use pop 5 × 15 ≈ 30 s)" },
    standard: { label: "Standard",   pop: 10, iter: 300, note: "measured: DGWO 149 s · MOGWO 160 s · SEQ 138 s · REP ≈ 27 min (est.)" },
    full:     { label: "Full",       pop: 30, iter: 500, note: "estimated: ≈ 12 min per strategy · REP ≈ 2.5 h — not for live use" },
  };
  const selectedWtpack = wtpackInstances.find((i) => i.instance_id === wtpackId) || null;

  const fileInputRef = useRef(null);

  // Track which option is active: "A" = manual, "B" = OR-Library
  const [activeOption, setActiveOption] = useState("B");

  // New Item Input states (encapsulated locally)
  const [newItemId, setNewItemId] = useState("BOX-001");
  const [newItemL, setNewL] = useState("");
  const [newItemH, setNewH] = useState("");
  const [newItemD, setNewD] = useState("");
  const [newItemWeight, setNewWeight] = useState("");
  const [newItemQty, setNewQty] = useState("1");
  const [newItemType, setNewItemType] = useState("Standard");
  const [newItemStop, setNewItemStop] = useState("1");

  // Keep newItemId updated based on itemsList length
  useEffect(() => {
    const nextNum = itemsList.length + 1;
    setNewItemId(`BOX-${String(nextNum).padStart(3, "0")}`);
  }, [itemsList]);

  // Derived stats — based on active option
  const activeItems = activeOption === "A" ? itemsList : instanceItems;

  const totalItemsCount = useMemo(() => {
    return activeItems.reduce((sum, item) => sum + Number(item.Qty), 0);
  }, [activeItems]);

  const totalWeightSum = useMemo(() => {
    const sum = activeItems.reduce(
      (sum, item) => sum + Number(item.Weight || 0) * Number(item.Qty),
      0
    );
    return parseFloat(sum.toFixed(1));
  }, [activeItems]);

  const totalCategoriesCount = useMemo(() => {
    const cats = new Set(activeItems.map((item) => item.Type));
    return cats.size;
  }, [activeItems]);

  const handleAddItem = (e) => {
    e.preventDefault();
    if (!newItemL || !newItemH || !newItemD || !newItemQty) {
      alert("Please fill in item dimensions (W, D, H) and Qty.");
      return;
    }
    const newBox = {
      id: newItemId || `BOX-${String(itemsList.length + 1).padStart(3, "0")}`,
      L: Number(newItemL),
      H: Number(newItemH),
      D: Number(newItemD),
      Qty: Number(newItemQty),
      Weight:
        Number(newItemWeight) ||
        parseFloat((10 + (itemsList.length * 3.5) % 15).toFixed(1)),
      Type: newItemType,
      Stop: Number(newItemStop) || 1
    };
    setItemsList([...itemsList, newBox]);
    setIsCustomized(true);
    setNewL("");
    setNewH("");
    setNewD("");
    setNewWeight("");
    setNewQty("1");
    setNewItemStop("1");
  };

  const handleRemoveItem = (id) => {
    setItemsList(itemsList.filter((it) => it.id !== id));
    setIsCustomized(true);
  };

  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split("\n");
      const newItems = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(",").map((p) => p.trim());
        if (parts.length >= 4) {
          const hasStop = parts.length >= 8;
          const id = parts[0];
          const stop = hasStop ? Number(parts[1]) : 1;
          const lIdx = hasStop ? 2 : 1;
          const hIdx = hasStop ? 3 : 2;
          const dIdx = hasStop ? 4 : 3;
          const qtyIdx = hasStop ? 5 : 4;
          const typeIdx = hasStop ? 6 : 5;
          const wtIdx = hasStop ? 7 : 6;
          newItems.push({
            id:
              id ||
              `BOX-${String(itemsList.length + newItems.length + 1).padStart(3, "0")}`,
            Stop: isNaN(stop) ? 1 : stop,
            L: Number(parts[lIdx]) || 0,
            H: Number(parts[hIdx]) || 0,
            D: Number(parts[dIdx]) || 0,
            Qty: Number(parts[qtyIdx]) || 1,
            Type: parts[typeIdx] || "Standard",
            Weight: Number(parts[wtIdx]) || 10
          });
        }
      }
      if (newItems.length > 0) {
        setItemsList([...itemsList, ...newItems]);
        setIsCustomized(true);
      }
    };
    reader.readAsText(file);
  };

  // Shared tab button style
  const optionTabStyle = (opt) => ({
    flex: 1,
    padding: "12px 16px",
    borderRadius: "8px",
    border: activeOption === opt ? "2px solid var(--primary)" : "2px solid var(--border)",
    background: activeOption === opt ? "var(--primary)" : "var(--bg-input)",
    color: activeOption === opt ? "#ffffff" : "var(--text-muted)",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.15s ease",
    textAlign: "left",
    display: "flex",
    flexDirection: "column",
    gap: "2px"
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top row: Left sidebar + Right main panel */}
      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>

        {/* ── Left Sidebar ── */}
        <div style={{ flex: "1 1 350px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Container card */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
            <h4
              className="form-label"
              style={{ color: "var(--primary)", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}
            >
              ● CONTAINER (BIN)
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                  Dimensions (cm) — Weight × Depth × Height
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {["L", "D", "H"].map((dim) => (
                    <input
                      key={dim}
                      type="number"
                      value={containerSpecs[dim]}
                      onChange={(e) => {
                        setContainerSpecs({ ...containerSpecs, [dim]: Number(e.target.value) });
                        setIsCustomized(true);
                      }}
                      style={{ width: "33.3%", padding: "10px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px", fontWeight: "600", outline: "none", textAlign: "center" }}
                      disabled={running}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "6px" }}>
                  Max load capacity (kg)
                </label>
                <input
                  type="number"
                  value={maxLoad}
                  onChange={(e) => { setMaxLoad(Number(e.target.value)); setIsCustomized(true); }}
                  style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "6px", background: "var(--bg-input)", color: "var(--text-main)", fontSize: "14px", fontWeight: "600", outline: "none" }}
                  disabled={running}
                />
              </div>
              <div className="dashed-preview">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                <span>
                  {containerSpecs.L} × {containerSpecs.D} × {containerSpecs.H} cm<br />
                  {maxLoad.toLocaleString()} kg max load
                </span>
              </div>
            </div>
          </div>

          {/* Algorithm settings card */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
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
                <div style={{ display: "flex", gap: "6px" }}>
                  {["DGWO", "MOGWO", "Sequential", "Repair-based"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setStrategy(s)}
                      style={{
                        flex: 1, padding: "8px 4px", borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: strategy === s ? "var(--primary)" : "var(--bg-input)",
                        color: strategy === s ? "#ffffff" : "var(--text-muted)",
                        fontSize: "12px", fontWeight: "700", cursor: "pointer", transition: "all 0.15s ease"
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Demo presets: drive pop_size / max_iter. Durations are measured, not guessed. */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
                  Run preset
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  {Object.entries(PRESET_INFO).map(([key, p]) => (
                    <button
                      key={key}
                      onClick={() => setPreset(key)}
                      disabled={running}
                      title={`pop ${p.pop} × ${p.iter} iterations — ${p.note}`}
                      style={{
                        flex: 1, padding: "8px 4px", borderRadius: "6px",
                        border: preset === key ? "1px solid var(--primary)" : "1px solid var(--border)",
                        background: preset === key ? "var(--primary)" : "var(--bg-input)",
                        color: preset === key ? "#ffffff" : "var(--text-muted)",
                        fontSize: "12px", fontWeight: "700", cursor: "pointer", transition: "all 0.15s ease"
                      }}
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
        </div>

        {/* ── Right Main Panel ── */}
        <div style={{ flex: "2 1 600px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Stats cards */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            {[
              { icon: "📦", value: totalItemsCount, label: "Total items", bg: "var(--blue-light)", fg: "var(--blue)" },
              { icon: "⚖️", value: `${totalWeightSum} kg`, label: "Total weight", bg: "var(--green-light)", fg: "var(--green)" },
              { icon: "🏷️", value: totalCategoriesCount, label: "Item categories", bg: "var(--amber-light)", fg: "var(--amber)" }
            ].map(({ icon, value, label, bg, fg }) => (
              <div className="stat-summary-card" key={label}>
                <div className="stat-icon-wrapper" style={{ background: bg, color: fg }}>{icon}</div>
                <div>
                  <div style={{ fontSize: "22px", fontWeight: "800" }}>{value}</div>
                  <div style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: "600" }}>{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Option Selector Tabs ── */}
          <div style={{ display: "flex", gap: "12px" }}>
            <button style={optionTabStyle("A")} onClick={() => setActiveOption("A")}>
              <span style={{ fontSize: "11px", fontWeight: "800", opacity: 0.75, letterSpacing: "0.07em", textTransform: "uppercase" }}>Option A</span>
              <span style={{ fontSize: "14px" }}>Add items manually</span>
            </button>
            <button style={optionTabStyle("B")} onClick={() => setActiveOption("B")}>
              <span style={{ fontSize: "11px", fontWeight: "800", opacity: 0.75, letterSpacing: "0.07em", textTransform: "uppercase" }}>Option B</span>
              <span style={{ fontSize: "14px" }}>Use built-in OR-Library dataset</span>
            </button>
          </div>

          {/* ─────────────────────────────────────────
              OPTION A — Manual Item / Box log
          ───────────────────────────────────────── */}
          {activeOption === "A" && (
            <div style={{ background: "var(--bg-card)", border: "2px solid var(--primary)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px", marginBottom: "18px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h4 style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main)" }}>Item / Box log</h4>
                    <span className="badge badge-standard">{itemsList.length} items</span>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>
                    Manually add your own boxes below, or import a CSV.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} style={{ display: "none" }} />
                  <button
                    onClick={() => fileInputRef.current.click()}
                    style={{ padding: "6px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", cursor: "pointer" }}
                  >
                    Import CSV
                  </button>
                  <button
                    onClick={handleAddItem}
                    style={{ padding: "6px 12px", background: "var(--primary)", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "700", color: "#ffffff", cursor: "pointer" }}
                  >
                    Add item
                  </button>
                </div>
              </div>

              {/* Add box form row */}
              <form onSubmit={handleAddItem} className="add-box-form" style={{ display: "flex", gap: "8px", flexWrap: "wrap", background: "var(--bg-input)", padding: "12px", borderRadius: "8px", marginBottom: "16px", alignItems: "flex-end" }}>
                {[
                  { label: "Item ID", flex: "2 1 120px", value: newItemId, set: setNewItemId, type: "text" },
                  { label: "Stop", flex: "1 1 60px", value: newItemStop, set: setNewItemStop, type: "number", min: 1 },
                  { label: "Width (cm)", flex: "1 1 50px", value: newItemL, set: setNewL, type: "number" },
                  { label: "Depth (cm)", flex: "1 1 50px", value: newItemD, set: setNewD, type: "number" },
                  { label: "Height (cm)", flex: "1 1 50px", value: newItemH, set: setNewH, type: "number" },
                  { label: "Weight (kg)", flex: "1 1 70px", value: newItemWeight, set: setNewWeight, type: "number" },
                  { label: "Quantity", flex: "1 1 60px", value: newItemQty, set: setNewQty, type: "number" }
                ].map(({ label, flex, value, set, type, min }) => (
                  <div key={label} style={{ flex }}>
                    <label style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>{label}</label>
                    <input
                      type={type}
                      min={min}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--bg-card)", color: "var(--text-main)", fontSize: "13px", fontWeight: "600", outline: "none" }}
                    />
                  </div>
                ))}
                <div style={{ flex: "2 1 100px" }}>
                  <label style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-dim)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Type</label>
                  <select value={newItemType} onChange={(e) => setNewItemType(e.target.value)} style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--bg-card)", color: "var(--text-main)", fontSize: "13px", outline: "none", fontWeight: "600" }}>
                    <option value="Standard">Standard</option>
                    <option value="Fragile">Fragile</option>
                    <option value="Heavy">Heavy</option>
                  </select>
                </div>
                <button type="submit" style={{ padding: "8px 16px", background: "var(--primary)", border: "none", borderRadius: "4px", color: "#ffffff", fontSize: "13px", fontWeight: "700", cursor: "pointer", height: "35px" }}>
                  ✓ Add
                </button>
              </form>

              {/* Manual items table — empty state when no manual items */}
              <div style={{ overflowX: "auto", maxHeight: "300px" }}>
                {itemsList.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-dim)" }}>
                    <div style={{ fontSize: "32px", marginBottom: "10px", opacity: 0.4 }}>📦</div>
                    <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>No items added yet</div>
                    <div style={{ fontSize: "12px" }}>Use the form above or import a CSV to add boxes.</div>
                  </div>
                ) : (
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Item ID</th><th>Stop</th><th>Width (cm)</th><th>Depth (cm)</th><th>Height (cm)</th><th>Weight (kg)</th><th>Quantity</th><th>Type</th><th style={{ width: "60px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsList.map((item) => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: "700", color: "var(--text-main)" }}>{item.id}</td>
                          <td style={{ fontWeight: "700", color: "var(--primary)" }}>{item.Stop || 1}</td>
                          <td>{item.L}</td>
                          <td>{item.D}</td>
                          <td>{item.H}</td>
                          <td>{item.Weight}</td>
                          <td style={{ fontWeight: "700" }}>{item.Qty}</td>
                          <td><span className={`badge badge-${item.Type.toLowerCase()}`}>{item.Type}</span></td>
                          <td>
                            <button onClick={() => handleRemoveItem(item.id)} style={{ background: "transparent", border: "none", color: "var(--red)", fontSize: "16px", cursor: "pointer" }} title="Remove item">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────
              OPTION B — OR-Library Benchmark Dataset
          ───────────────────────────────────────── */}
          {activeOption === "B" && (
            <div style={{ background: "var(--bg-card)", border: "2px solid var(--primary)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
              <div style={{ marginBottom: "16px" }}>
                <h4 style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main)", marginBottom: "4px" }}>Built-in OR-Library Benchmark</h4>
                <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                  Select a pre-built benchmark instance. The item list below will reflect the loaded dataset — your manually added items are not affected.
                </p>
              </div>

              {/* Dataset toggle: wtpack (thesis, real physics) vs legacy BR JSON */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
                {[
                  { key: "wtpack", label: "OR-Library wtpack (thesis)" },
                  { key: "br",     label: "BR JSON (legacy)" },
                ].map((d) => (
                  <button
                    key={d.key}
                    onClick={() => setDataset(d.key)}
                    disabled={running}
                    style={{
                      flex: 1, padding: "8px 6px", borderRadius: "6px",
                      border: dataset === d.key ? "1px solid var(--primary)" : "1px solid var(--border)",
                      background: dataset === d.key ? "var(--primary)" : "var(--bg-input)",
                      color: dataset === d.key ? "#ffffff" : "var(--text-muted)",
                      fontSize: "12px", fontWeight: "700", cursor: "pointer"
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {/* wtpack: sampled instances with provenance, addressed by integer id */}
              {dataset === "wtpack" && (
                <div style={{ marginBottom: "20px" }}>
                  <select
                    style={{ width: "100%", padding: "12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "8px", color: wtpackId !== null ? "var(--text-main)" : "var(--text-dim)", fontSize: "14px", fontWeight: "600", outline: "none" }}
                    value={wtpackId === null ? "" : String(wtpackId)}
                    onChange={(e) => setWtpackId(e.target.value === "" ? null : Number(e.target.value))}
                    disabled={running}
                  >
                    <option value="" disabled>— Select a sampled wtpack instance —</option>
                    {wtpackInstances.map((inst) => (
                      <option key={inst.instance_id} value={String(inst.instance_id)}>{inst.label}</option>
                    ))}
                  </select>
                  {wtpackInstances.length === 0 && (
                    <div style={{ fontSize: "12px", color: "var(--amber)", marginTop: "6px" }}>
                      No sampled instances — is the server running and experiments/samples/sample30_seed42.json present?
                    </div>
                  )}
                  {selectedWtpack && (
                    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "10px", fontSize: "12px", color: "var(--text-dim)" }}>
                      <span>Class <b style={{ color: "var(--text-main)" }}>{selectedWtpack.br_class}</b> ({selectedWtpack.n_types} box types)</span>
                      <span>Container <b style={{ color: "var(--text-main)" }}>{selectedWtpack.container.L} × {selectedWtpack.container.W} × {selectedWtpack.container.H} cm</b></span>
                      <span>Boxes <b style={{ color: "var(--text-main)" }}>{selectedWtpack.n_boxes}</b></span>
                      <span>Fragile <b style={{ color: "var(--amber)" }}>{selectedWtpack.fragile_count} ({Math.round(selectedWtpack.fragile_rate * 100)}%)</b></span>
                    </div>
                  )}
                </div>
              )}

              {/* Legacy BR JSON dropdown, unchanged */}
              {dataset === "br" && (loadingList ? (
                <span style={{ color: "var(--text-muted)", fontSize: "14px" }}>Loading instances...</span>
              ) : (
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "20px" }}>
                  <select
                    style={{ flex: 1, padding: "12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "8px", color: selected ? "var(--text-main)" : "var(--text-dim)", fontSize: "14px", fontWeight: "600", outline: "none" }}
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={running}
                  >
                    <option value="" disabled>— Select a benchmark instance —</option>
                    {Object.entries(groupedInstances).map(([setName, insts]) => (
                      <optgroup key={setName} label={setName}>
                        {insts.map((inst) => (
                          <option key={inst.path} value={inst.path}>{inst.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {selected && (
                    <button
                      onClick={() => setSelected("")}
                      disabled={running}
                      style={{
                        padding: "10px 14px",
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        color: "var(--text-muted)",
                        fontSize: "13px",
                        fontWeight: "700",
                        cursor: running ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                        flexShrink: 0
                      }}
                      title="Clear selected instance"
                    >
                      ✕ Clear
                    </button>
                  )}
                </div>
              ))}

              {/* Instance preview table */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-main)" }}>Dataset Preview</span>
                  {instanceItems.length > 0 && (
                    <span className="badge badge-standard">{instanceItems.reduce((s, i) => s + Number(i.Qty), 0)} items loaded</span>
                  )}
                </div>
                <div style={{ overflowX: "auto", maxHeight: "300px" }}>
                  {instanceItems.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-dim)" }}>
                      <div style={{ fontSize: "32px", marginBottom: "10px", opacity: 0.4 }}>🗂️</div>
                      <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "4px" }}>No instance loaded</div>
                      <div style={{ fontSize: "12px" }}>Select a dataset above to preview its items here.</div>
                    </div>
                  ) : (
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Item ID</th><th>Stop</th><th>Width (cm)</th><th>Depth (cm)</th><th>Height (cm)</th><th>Weight (kg)</th><th>Quantity</th><th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {instanceItems.map((item, idx) => (
                          <tr key={item.id || idx}>
                            <td style={{ fontWeight: "700", color: "var(--text-main)" }}>{item.id}</td>
                            <td style={{ fontWeight: "700", color: "var(--primary)" }}>{item.Stop || 1}</td>
                            <td>{item.L}</td>
                            <td>{item.D}</td>
                            <td>{item.H}</td>
                            <td>{item.Weight}</td>
                            <td style={{ fontWeight: "700" }}>{item.Qty}</td>
                            <td><span className={`badge badge-${(item.Type || "standard").toLowerCase()}`}>{item.Type || "Standard"}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Status bar ── */}
      <div style={{
        background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px",
        padding: "16px 24px", boxShadow: "var(--shadow)",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px"
      }}>
        <div style={{ fontSize: "13px", color: "var(--text-dim)", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--text-main)", fontWeight: "700" }}>{totalItemsCount}</span> items ready
          <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span>
          Source: <span style={{ color: "var(--primary)", fontWeight: "700" }}>{activeOption === "A" ? "Manual" : (dataset === "wtpack" ? `wtpack #${wtpackId ?? "—"}` : "BR JSON")}</span>
          <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span>
          Strategy: <span style={{ color: "var(--primary)", fontWeight: "700" }}>{strategy}</span>
          <span style={{ opacity: 0.4, margin: "0 4px" }}>·</span>
          Total: <span style={{ color: "var(--text-main)", fontWeight: "700" }}>{totalWeightSum.toLocaleString()} kg</span>
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
          {activeOption === "A" && (
            <button
              onClick={() => { setItemsList([]); setIsCustomized(true); }}
              style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}
            >
              Clear all
            </button>
          )}
          {!running ? (
            <button
              onClick={handleStartRun}
              disabled={!canRun}
              style={{
                padding: "10px 24px",
                background: canRun ? "var(--primary)" : "var(--text-dim)",
                color: "#ffffff", border: "none", borderRadius: "6px",
                fontSize: "14px", fontWeight: "700",
                cursor: canRun ? "pointer" : "not-allowed",
                transition: "all 0.15s ease", whiteSpace: "nowrap"
              }}
            >
              Run optimizer
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
