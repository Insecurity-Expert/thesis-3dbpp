// client/src/Shell.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "./auth/AuthContext";
import logoImg from "./logo.png";

import LogisticsTab from "./components/LogisticsTab";
import ResultsTab from "./components/ResultsTab";
import VisualizationTab from "./components/VisualizationTab";
import RunHistoryTab from "./components/RunHistoryTab";
import { instancesApi, runsApi } from "./services/api";


// ── MAIN SHELL COMPONENT ──────────────────────────────────────────────────────
export default function Shell() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [activeTab, setActiveTab] = useState("logistics"); // logistics, results, visualization, history
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => { try { return localStorage.getItem("sidebar") === "collapsed"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem("sidebar", sidebarCollapsed ? "collapsed" : "open"); } catch {} }, [sidebarCollapsed]);

  // Profile dropdown state
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Dataset selection & Loader states
  const [instances, setInstances] = useState([]);
  const [selected, setSelected] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  // wtpack (thesis) dataset: sampled instances addressed by integer id 0..699
  const [dataset, setDataset] = useState("wtpack");          // "wtpack" | "br"
  const [wtpackInstances, setWtpackInstances] = useState([]);
  const [wtpackId, setWtpackId] = useState(null);
  const [optimizerReady, setOptimizerReady] = useState({ state: "cold", seconds: null });

  // Dynamic Custom Configurations
  const [containerSpecs, setContainerSpecs] = useState({ L: 587, H: 233, D: 220 });
  const [maxLoad, setMaxLoad] = useState(28000);
  const [itemsList, setItemsList] = useState([]);
  const [instanceItems, setInstanceItems] = useState([]);
  const [isCustomized, setIsCustomized] = useState(false);

  // Algorithm Settings & Constraints
  const [strategy, setStrategy] = useState("DGWO");
  const [maxTime] = useState(90);
  const [preset, setPresetState] = useState("quick");
  const [wolfSize, setWolfSize] = useState(10);
  const [maxIter, setMaxIter] = useState(60);

  // Presets drive pop_size / max_iter; editing either field switches to "custom".
  const PRESETS = useMemo(() => ({
    quick:    { pop: 10, iter: 60 },
    standard: { pop: 10, iter: 300 },
    full:     { pop: 30, iter: 500 },
  }), []);
  const setPreset = useCallback((name) => {
    setPresetState(name);
    const p = PRESETS[name];
    if (p) { setWolfSize(p.pop); setMaxIter(p.iter); }
  }, [PRESETS]);
  const setWolfSizeCustom = useCallback((v) => { setWolfSize(v); setPresetState("custom"); }, []);
  const setMaxIterCustom  = useCallback((v) => { setMaxIter(v);  setPresetState("custom"); }, []);

  // Optimizer parameters that reach main_optimizer.py verbatim (see params echo)
  const [seed, setSeed] = useState(42);
  const [lam, setLam] = useState(0.20);
  const [enforceSupport, setEnforceSupport] = useState(true);
  const [enforceFragility, setEnforceFragility] = useState(true);

  // WebSocket & Live optimization run states
  const [wsConnected, setWsConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Stream metrics
  const [instanceInfo, setInstanceInfo] = useState(null);
  const [placements, setPlacements] = useState(null);
  const [binsUsed, setBinsUsed] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [stats, setStats] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [error, setError] = useState(null);

  // Run History
  const [runHistory, setRunHistory] = useState([]);
  // Non-null while the Results tab shows a saved run instead of a live one.
  const [replay, setReplay] = useState(null);

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const handlerRef = useRef(() => {});   // latest handleMessage; the socket never captures a stale one
  const closingRef = useRef(false);      // set on unmount so onclose does not schedule a reconnect
  const chartRef = useRef([]);           // mirror of chartData for saveRun (no dep on state)
  const runningRef = useRef(false);      // mirror of running for the socket's onclose

  // Close profile dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Theme synchronization
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Load instances list
  useEffect(() => {
    instancesApi
      .getAll()
      .then((data) => {
        const list = data.instances || [];
        setInstances(list);
        // Don't auto-select — let the user choose
        setLoadingList(false);
      })
      .catch(() => {
        setError("Cannot reach backend server. Please verify the port 3001.");
        setLoadingList(false);
      });
  }, []);

  // Load the sampled wtpack instances
  useEffect(() => {
    instancesApi
      .getWtpack()
      .then((data) => {
        const list = data.instances || [];
        setWtpackInstances(list);
        // Default to the first sampled instance so the demo needs one click fewer
        if (list.length && wtpackId === null) setWtpackId(list[0].instance_id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll numba warm-up until the optimizer is ready (or errored)
  useEffect(() => {
    let timer = null;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await instancesApi.getReady();
        if (cancelled) return;
        setOptimizerReady({ state: r.state, seconds: r.seconds, error: r.error });
        if (r.state === "warm" || r.state === "error") return;
      } catch {
        if (cancelled) return;
        setOptimizerReady({ state: "offline", seconds: null });
      }
      timer = setTimeout(tick, 1500);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  // Load selected instance details
  useEffect(() => {
    if (!selected) {
      setInstanceItems([]);   // clear preview when nothing is selected
      return;
    }
    instancesApi
      .getDetails(selected)
      .then((data) => {
        if (data.container) {
          setContainerSpecs({ L: data.container.L, H: data.container.H, D: data.container.D });
        }
        if (data.items) {
          setInstanceItems(data.items);
        }
        setIsCustomized(false);
      })
      .catch(() => {});
  }, [selected]);

  // Fetch Run History
  const fetchRunHistory = useCallback(() => {
    runsApi
      .getHistory()
      .then((data) => setRunHistory(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchRunHistory();
  }, [fetchRunHistory]);

  // WebSocket message dispatcher
  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case "instance_info":
        setInstanceInfo({ container: msg.container, n_items: msg.n_items, lower_bound: msg.lower_bound });
        break;

      case "iteration_update":
        // Thesis strategies stream best_su / best_csr / best_placed (and no live
        // solution); the legacy HDGWO path streams best_bins / composite / solution.
        if (msg.solution) setPlacements(msg.solution);
        if (msg.best_bins !== undefined) setBinsUsed(msg.best_bins);
        setChartData((prev) => {
          const next = [...prev, {
            iter: msg.iteration,
            bins: msg.best_bins,
            composite: msg.best_composite,
            su: msg.best_su,
            csr: msg.best_csr,
            placed: msg.best_placed,
          }];
          const kept = next.length > 600 ? next.slice(-600) : next;
          chartRef.current = kept;
          return kept;
        });
        setStats({
          iteration: msg.iteration,
          maxIter: msg.max_iter,
          bins: msg.best_bins,
          dissipation: msg.best_dissipation,
          composite: msg.best_composite,
          temperature: msg.temperature,
          lastUdhc: msg.last_udhc,
          udhcAccepted: msg.udhc_accepted,
          su: msg.best_su,
          csr: msg.best_csr,
          placed: msg.best_placed,
          phase: msg.phase,
        });
        break;

      case "instance_complete":
        setPlacements(msg.items);
        setBinsUsed(msg.bins_used);
        setFinalResult(msg);
        setRunning(false);
        // Persist run details. Every field comes from the message (the server
        // stamps strategy/spawn from the process it actually launched) — never
        // from React state, which can be stale on a reconnected socket.
        runsApi.saveRun({
          strategy: msg.strategy_label || msg.strategy || msg.params?.strategy || "unknown",
          strategy_code: msg.strategy || msg.params?.strategy || null,
          instance: msg.dataset === "wtpack" ? `wtpack #${msg.instance}`
                  : String(msg.instance).split(/[\\/]/).pop(),
          dataset: msg.dataset ?? null,
          seed: msg.seed ?? msg.params?.seed ?? null,
          n_items: msg.n_items,
          space_util: msg.metrics?.M1_space_utilization_pct || msg.volume_util_pct,
          csr: msg.metrics?.M2_constraint_satisfaction_pct ?? null,
          placed: msg.placed ?? (msg.items ? msg.items.length : null),
          dissipation: msg.dissipation,
          runtime_s: msg.runtime_s,
          bins_used: msg.bins_used,
          placements: msg.items,
          container: msg.container,
          result: msg,
          convergence: chartRef.current,
        }).then(() => fetchRunHistory()).catch(() => {});
        break;

      case "stopped":
        setRunning(false);
        break;

      case "run_closed":
        if (msg.code !== 0) {
          setError((prev) => prev || (msg.error
            ? `Optimizer exited with code ${msg.code}: ${msg.error}`
            : `Optimizer process exited with code ${msg.code}`));
        }
        setRunning(false);
        break;

      case "error":
        setError(msg.error);
        // A rejected duplicate "run" does not end the run that is in progress.
        if (msg.code !== "run_in_progress") setRunning(false);
        break;

      default:
        break;
    }
  }, [fetchRunHistory]);

  // Keep the latest message handler reachable from the (single) socket.
  useEffect(() => { handlerRef.current = handleMessage; }, [handleMessage]);
  useEffect(() => { runningRef.current = running; }, [running]);

  // Connect once on mount. `connect` has no dependencies on purpose: a
  // strategy change used to recreate it, close the socket and leave a stale
  // reconnect timer whose socket delivered completions to an old handler.
  const connect = useCallback(() => {
    if (closingRef.current) return;
    const ws = new WebSocket("ws://localhost:3002");
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => {
      setWsConnected(false);
      if (wsRef.current === ws) wsRef.current = null;
      // The server kills the Python child when a socket drops, and no
      // run_closed can reach us over a dead socket — so report it here.
      if (runningRef.current && !closingRef.current) {
        setRunning(false);
        setError("Connection lost — the server stopped this run. Please re-run it.");
      }
      if (!closingRef.current) reconnectRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => {};
    ws.onmessage = (e) => {
      try {
        handlerRef.current(JSON.parse(e.data));
      } catch {}
    };
  }, []);

  useEffect(() => {
    closingRef.current = false;
    connect();
    return () => {
      closingRef.current = true;
      clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Run timer
  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Run handler
  const handleStartRun = useCallback(async () => {
    if (running || !wsConnected) return;
    setRunning(true);
    setInstanceInfo(null);
    setPlacements(null);
    setBinsUsed(0);
    setChartData([]);
    chartRef.current = [];
    setStats(null);
    setFinalResult(null);
    setError(null);
    setReplay(null);

    // wtpack (thesis) dataset: addressed by integer id, parameters are UI-driven
    if (dataset === "wtpack" && !isCustomized) {
      if (wtpackId === null) {
        setError("Select a wtpack instance first.");
        setRunning(false);
        return;
      }
      wsRef.current.send(JSON.stringify({
        action: "run",
        dataset: "wtpack",
        instanceId: wtpackId,
        strategy,
        popSize: wolfSize,
        maxIter,
        lambda: lam,
        enforceSupport,
        enforceFragility,
        seed: Number.isFinite(Number(seed)) && seed !== "" ? Number(seed) : null,
      }));
      setActiveTab("visualization");
      return;
    }

    let runPath = selected;

    // Use custom path if user added manual items OR if no OR-Library instance is selected
    if (isCustomized || !selected) {
      try {
        const data = await instancesApi.saveCustom({
          container: containerSpecs,
          items: itemsList
        });
        if (data.path) {
          runPath = data.path;
        } else {
          throw new Error(data.error || "Failed to compile custom configuration");
        }
      } catch (err) {
        setError(err.message);
        setRunning(false);
        return;
      }
    }

    wsRef.current.send(JSON.stringify({ action: "run", instancePath: runPath, maxTime, strategy }));
    setActiveTab("visualization");
  }, [selected, running, wsConnected, maxTime, isCustomized, containerSpecs, itemsList, strategy,
      dataset, wtpackId, wolfSize, maxIter, lam, enforceSupport, enforceFragility, seed]);

  const handleStopRun = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ action: "stop" }));
  }, []);

  // Exporters
  const handleExportResultsCSV = () => {
    if (!finalResult || !finalResult.items) return;
    const headers = "Sequence,Item ID,Bin ID,X,Y,Z,Length,Height,Depth\n";
    const rows = finalResult.items.map((item, idx) =>
      `${idx + 1},${item.id},Bin ${item.bin_id},${item.x},${item.y},${item.z},${item.dx ?? item.l},${item.dy ?? item.h},${item.dz ?? item.d}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `STACKR-Packing-Results-${isCustomized ? "custom" : String(finalResult.instance).split(/[\\/]/).pop().replace('.json', '')}.csv`;
    link.click();
  };

  const handleExportReport = () => {
    window.print();
  };

  const handleExportHistory = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(runHistory, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "STACKR-optimization-history.json");
    downloadAnchor.click();
  };

  // ── Saved runs: load / label / delete / export / import ──────────────────
  // Loading a run restores the Results page from the stored envelope. It never
  // opens a WebSocket run and it is always marked as a replay (see banner).
  const handleLoadRun = useCallback(async (run) => {
    if (!run) return;
    if (running) { setError("Stop the live run before loading a saved one."); return; }
    // The history list omits result/convergence; fetch the full row.
    let row = run;
    if (!row.result) {
      try { row = await runsApi.getRun(run.id); } catch (e) { setError(`Could not load run #${run.id}: ${e.message}`); return; }
    }
    const legacy = !row.result;
    const result = legacy
      ? {
          // Pre-capture row: only what was stored. Fields ResultsTab reads
          // unconditionally get neutral values so nothing crashes.
          status: "ok", legacy: true,
          instance: row.instance, n_items: row.n_items,
          bins_used: row.bins_used ?? 1, placed: row.placements ? row.placements.length : null,
          lower_bound: 1, gap_pct: 0, dissipation: row.dissipation ?? 0, composite_score: null,
          volume_util_pct: row.space_util, runtime_s: row.runtime_s ?? 0,
          container: row.container, items: row.placements || [],
          metrics: { M1_space_utilization_pct: row.space_util },
          strategy_label: row.strategy,
        }
      : row.result;
    const series = Array.isArray(row.convergence) ? row.convergence : [];
    setFinalResult(result);
    setPlacements(result.items || null);
    setInstanceInfo(result.container ? { container: result.container, n_items: result.n_items, lower_bound: result.lower_bound ?? 1 } : null);
    setBinsUsed(result.bins_used ?? 1);
    setChartData(series);
    chartRef.current = series;
    setStats(null);
    setError(null);
    setRunning(false);
    setReplay({
      id: row.id,
      strategy: row.strategy || result.strategy_label || result.params?.strategy || "?",
      instance: row.instance,
      seed: row.seed ?? result.seed ?? result.params?.seed ?? null,
      date: row.created_at,
      label: row.label || null,
      legacy,
    });
    setActiveTab("results");
  }, [running]);

  const handleLabelRun = useCallback(async (run, label) => {
    try {
      await runsApi.setLabel(run.id, label);
      fetchRunHistory();
      setReplay((r) => (r && r.id === run.id ? { ...r, label } : r));
    } catch (e) { setError(`Could not label run #${run.id}: ${e.message}`); }
  }, [fetchRunHistory]);

  const handleDeleteRun = useCallback(async (run) => {
    try {
      await runsApi.deleteRun(run.id);
      fetchRunHistory();
    } catch (e) { setError(`Could not delete run #${run.id}: ${e.message}`); }
  }, [fetchRunHistory]);

  const handleExportRun = useCallback(async (run) => {
    try {
      const row = await runsApi.getRun(run.id);
      const doc = { stackr_run: 1, exported_at: new Date().toISOString(), run: row };
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const strat = String(row.strategy_code || row.strategy || "run").replace(/[^A-Za-z0-9-]/g, "");
      a.download = `STACKR-run-${row.id}-${strat}-${String(row.instance || "").replace(/[^A-Za-z0-9#-]/g, "")}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setError(`Could not export run #${run.id}: ${e.message}`); }
  }, []);

  // Accepts the file written by handleExportRun. Validates shape before saving.
  const handleImportRun = useCallback(async (file) => {
    let doc;
    try { doc = JSON.parse(await file.text()); }
    catch { setError(`Import failed: ${file.name} is not valid JSON.`); return; }
    const row = doc && doc.stackr_run === 1 && doc.run ? doc.run : null;
    if (!row) { setError(`Import failed: ${file.name} is not a STACKR run export (missing stackr_run / run).`); return; }
    const r = row.result;
    const items = (r && Array.isArray(r.items)) ? r.items : (Array.isArray(row.placements) ? row.placements : null);
    const container = (r && r.container) || row.container;
    if (!items || !container || !row.strategy) {
      setError(`Import failed: ${file.name} lacks placements, container or strategy.`); return;
    }
    if (r && (typeof r.metrics !== "object" || r.metrics === null)) {
      setError(`Import failed: ${file.name} has a result without metrics.`); return;
    }
    try {
      await runsApi.saveRun({
        strategy: row.strategy, strategy_code: row.strategy_code ?? r?.strategy ?? null,
        instance: row.instance, dataset: row.dataset ?? r?.dataset ?? null, seed: row.seed ?? r?.seed ?? null,
        n_items: row.n_items ?? r?.n_items, space_util: row.space_util ?? r?.metrics?.M1_space_utilization_pct,
        csr: row.csr ?? r?.metrics?.M2_constraint_satisfaction_pct ?? null, placed: row.placed ?? r?.placed ?? items.length,
        dissipation: row.dissipation ?? r?.dissipation, runtime_s: row.runtime_s ?? r?.runtime_s, bins_used: row.bins_used ?? r?.bins_used,
        placements: items, container,
        label: row.label ? row.label : `imported ${file.name}`,
        result: r || null, convergence: Array.isArray(row.convergence) ? row.convergence : null,
      });
      fetchRunHistory();
      setError(null);
    } catch (e) { setError(`Import failed: ${e.message}`); }
  }, [fetchRunHistory]);

  // Group dataset instances
  const groupedInstances = useMemo(() => {
    const g = {};
    for (const inst of instances) {
      if (!g[inst.set]) g[inst.set] = [];
      g[inst.set].push(inst);
    }
    return g;
  }, [instances]);

  const selectedInstanceObj = useMemo(() => {
    return instances.find((i) => i.path === selected);
  }, [instances, selected]);

  const initials = user?.name ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "US";

  // Calculate actual X, Y, Z axis utilization dynamically
  const axisUtil = useMemo(() => {
    if (!finalResult || !finalResult.items || !finalResult.container) return { x: 91, y: 84, z: 78 };
    const { L, H, D } = finalResult.container;
    let maxX = 0, maxY = 0, maxZ = 0;
    // Optimizer output carries dx/dy/dz (render axes); l/h/d is the legacy shape.
    for (const item of finalResult.items) {
      const dx = item.dx ?? item.l ?? 0, dy = item.dy ?? item.h ?? 0, dz = item.dz ?? item.d ?? 0;
      if (item.x + dx > maxX) maxX = item.x + dx;
      if (item.y + dy > maxY) maxY = item.y + dy;
      if (item.z + dz > maxZ) maxZ = item.z + dz;
    }
    return {
      x: Math.round(Math.min(100, (maxX / L) * 100)),
      y: Math.round(Math.min(100, (maxY / H) * 100)),
      z: Math.round(Math.min(100, (maxZ / D) * 100)),
    };
  }, [finalResult]);

  const canRun = wsConnected && !running && (
    itemsList.length > 0 || instanceItems.length > 0 ||
    (dataset === "wtpack" && wtpackId !== null)
  );

  const NAV = [
    { id: "logistics", label: "Start analysis", title: "Logistics", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg> },
    { id: "results", label: "Results", title: "Results", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg> },
    { id: "visualization", label: "3D viewer", title: "Visualization", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12l8.73-5.04"/><path d="M12 22.08V12"/></svg> },
    { id: "history", label: "Run history", title: "Run history", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 106 5.3L3 8"/><path d="M12 7v5l4 2"/></svg> },
  ];
  const activeNav = NAV.find((n) => n.id === activeTab) || NAV[0];

  return (
    <div className="app">

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark"><img src={logoImg} alt="STACKR" /></div>
          <div>
            <div className="brand-text">STACKR</div>
            <div className="brand-sub">3D Bin Packing Optimizer</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Workflow</div>
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`nav-item${activeTab === n.id ? " active" : ""}`}
              onClick={() => setActiveTab(n.id)}
              title={n.label}
            >
              {n.icon}
              <span>{n.label}</span>
              {n.id === "results" && replay && <span className="badge badge-warn" style={{ marginLeft: "auto" }}>saved</span>}
              {n.id === "visualization" && running && <span className="badge badge-primary" style={{ marginLeft: "auto" }}>live</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="collapse-btn" onClick={() => setSidebarCollapsed((c) => !c)} title={sidebarCollapsed ? "Expand" : "Collapse"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6"/></svg>
            <span>Collapse</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="crumb">STACKR / <b>{activeNav.title}</b></div>
            <div className="page-title">{activeNav.title}</div>
          </div>
          <div className="topbar-right">
            {selectedInstanceObj && (
              <span className="chip"><span className="chip-dot" />OR-Library: {selectedInstanceObj.label}</span>
            )}
            {dataset === "wtpack" && wtpackId !== null && (
              <span className="chip"><span className={`chip-dot${optimizerReady.state === "warm" ? "" : optimizerReady.state === "error" || optimizerReady.state === "offline" ? " danger" : " warn"}`} />wtpack #{wtpackId}</span>
            )}
            {running && <span className="chip"><span className="chip-dot warn" />Running · {elapsed}s</span>}
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
              title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            >
              {theme === "light"
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>}
            </button>
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button type="button" className="avatar-btn" onClick={() => setProfileOpen((o) => !o)} title="Account">{initials}</button>
              {profileOpen && (
                <div className="card" style={{ position: "absolute", right: 0, top: "46px", width: "220px", boxShadow: "var(--shadow-2)", padding: "16px", zIndex: 1000 }}>
                  <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "12px", marginBottom: "12px" }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-main)" }}>{user?.name || "User"}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-dim)", textTransform: "capitalize" }}>{user?.role || "Researcher"}</div>
                  </div>
                  <button type="button" className="btn btn-danger-outline btn-sm btn-block" onClick={() => { logout(); setProfileOpen(false); }}>
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── ERROR DISPLAY ── */}
        {error && (
          <div className="alert-danger" style={{ margin: "16px 28px 0" }}>
            ⚠ {error}
          </div>
        )}

        <main className="content">

      {/* ── LOGISTICS TAB ── */}
      {activeTab === "logistics" && (
        <LogisticsTab
          containerSpecs={containerSpecs}
          setContainerSpecs={setContainerSpecs}
          maxLoad={maxLoad}
          setMaxLoad={setMaxLoad}
          strategy={strategy}
          setStrategy={setStrategy}
          wolfSize={wolfSize}
          setWolfSize={setWolfSize}
          maxIter={maxIter}
          setMaxIter={setMaxIter}
          seed={seed}
          setSeed={setSeed}
          lam={lam}
          setLam={setLam}
          enforceSupport={enforceSupport}
          setEnforceSupport={setEnforceSupport}
          enforceFragility={enforceFragility}
          setEnforceFragility={setEnforceFragility}
          itemsList={itemsList}
          setItemsList={setItemsList}
          setIsCustomized={setIsCustomized}
          instanceItems={instanceItems}
          loadingList={loadingList}
          selected={selected}
          setSelected={setSelected}
          groupedInstances={groupedInstances}
          running={running}
          elapsed={elapsed}
          handleStartRun={handleStartRun}
          handleStopRun={handleStopRun}
          canRun={canRun}
          dataset={dataset}
          setDataset={setDataset}
          wtpackInstances={wtpackInstances}
          wtpackId={wtpackId}
          setWtpackId={setWtpackId}
          preset={preset}
          setPreset={setPreset}
          setWolfSizeCustom={setWolfSizeCustom}
          setMaxIterCustom={setMaxIterCustom}
          optimizerReady={optimizerReady}
        />
      )}

      {/* ── RESULTS TAB ── */}
      {activeTab === "results" && (
        <ResultsTab
          finalResult={finalResult}
          runHistory={runHistory}
          replay={replay}
          strategy={strategy}
          stats={stats}
          axisUtil={axisUtil}
          chartData={chartData}
          maxIter={maxIter}
          wolfSize={wolfSize}
          handleExportResultsCSV={handleExportResultsCSV}
          handleExportReport={handleExportReport}
        />
      )}

      {/* ── VISUALIZATION TAB ── */}
      {activeTab === "visualization" && (
        <VisualizationTab
          placements={placements}
          itemsList={itemsList}
          instanceInfo={instanceInfo}
          binsUsed={binsUsed}
          running={running}
          stats={stats}
          chartData={chartData}
        />
      )}

      {/* ── RUN HISTORY TAB ── */}
      {activeTab === "history" && (
        <RunHistoryTab
          runHistory={runHistory}
          handleExportHistory={handleExportHistory}
          onLoadRun={handleLoadRun}
          onLabelRun={handleLabelRun}
          onDeleteRun={handleDeleteRun}
          onExportRun={handleExportRun}
          onImportRun={handleImportRun}
        />
      )}

        </main>
      </div>
    </div>
  );
}
