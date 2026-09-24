// client/src/Shell.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "./auth/AuthContext";
import logoImg from "./logo.png";

import LogisticsTab from "./components/LogisticsTab";
import ResultsTab from "./components/ResultsTab";
import VisualizationTab from "./components/VisualizationTab";
import RunHistoryTab from "./components/RunHistoryTab";
import DashboardTab from "./components/DashboardTab";
import GuideTab from "./components/GuideTab";
import AccountTab from "./components/AccountTab";
import ThingsToKnow from "./components/ThingsToKnow";
import HowToModal from "./components/HowToModal";
import { useToast } from "./components/ui";
import { instancesApi, runsApi, studiesApi, customLoadsApi } from "./services/api";
import { blankRow } from "./components/LoadSources";
import { customLoadOf, CUSTOM_LOAD_LABEL } from "./components/CustomLoadBanner";
import StudyLauncher, { TestSettingsPanel } from "./study/StudyLauncher";
import StudyResults from "./study/StudyResults";
import CompareTab, { StudySelect } from "./study/CompareTab";


// ── MAIN SHELL COMPONENT ──────────────────────────────────────────────────────
export default function Shell() {
  const { user, logout, setPrefs } = useAuth();
  const toast = useToast();
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [activeTab, setActiveTab] = useState("home"); // home, logistics, results, guide, compare, visualization, history, account
  const [showThings, setShowThings] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  // "How to use" opens by itself once per login, unless this account ticked
  // "Don't show this again" (stored on the account, not in the browser).
  useEffect(() => {
    if (!user || user.howto_hidden) return;
    const key = `howto-shown-${user.id}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch {}
    setShowHowTo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.id]);
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

  // Where the boxes come from: "standard" (thesis wtpack sample), "sample"
  // (ready-made OR-Library instance), "typed" or "csv" (custom loads).
  const [source, setSource] = useState("standard");
  const [samples, setSamples] = useState(null);
  const [sampleId, setSampleId] = useState(null);
  // Custom-load container: length runs door -> cab (loader.py 'L'), then width, height.
  const [containerSpecs, setContainerSpecs] = useState({ length: 587, width: 233, height: 220, max_weight: "" });
  const [typedRows, setTypedRows] = useState(() => [blankRow()]);
  const [fragileShare, setFragileShare] = useState({ on: false, target: 25 });
  const [csvFile, setCsvFile] = useState(null);
  // The converted load for the current inputs: { id, summary, key }; key = the request it was made from.
  const [customLoad, setCustomLoad] = useState(null);
  const [customErrors, setCustomErrors] = useState([]);
  const [checking, setChecking] = useState(false);
  const [maxLoad, setMaxLoad] = useState(null);   // never sent to the optimizer; not shown
  const [itemsList, setItemsList] = useState([]);
  const [instanceItems, setInstanceItems] = useState([]);
  const [, setIsCustomized] = useState(false);   // legacy BR preview flag

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

  // ── SOP studies (four configurations x N seeds x instances) ──────────────
  const [studies, setStudies] = useState([]);
  const [sizesInfo, setSizesInfo] = useState(null);
  const [availableStudies, setAvailableStudies] = useState([]);
  const [selectedStudyId, setSelectedStudyId] = useState(null);
  const [studyDoc, setStudyDoc] = useState(null);        // { row, study, stats } of the selected study
  const [studyProgress, setStudyProgress] = useState(null);
  const [resultsMode, setResultsMode] = useState("quick"); // "quick" (single run) | "study"
  const [studyBusy, setStudyBusy] = useState(false);
  const [studySize, setStudySize] = useState("demo");     // Full Comparison picker

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

  useEffect(() => {
    if (source !== "sample" || samples) return;
    customLoadsApi.samples()
      .then((d) => { setSamples(d); if (sampleId === null && d.samples && d.samples.length) setSampleId(d.samples[0].instance_id); })
      .catch((e) => setSamples({ error: `Could not load the samples: ${e.message}` }));
  }, [source, samples, sampleId]);

  // ── custom loads: the request the server converts, and whether the stored
  // conversion still matches the inputs on screen.
  const customRequest = useMemo(() => {
    if (source !== "typed" && source !== "csv") return null;
    const base = {
      source,
      container: { ...containerSpecs },
      fragile_share: fragileShare.on ? Number(fragileShare.target) / 100 : null,
    };
    if (source === "csv") return csvFile ? { ...base, csv: csvFile.text, name: csvFile.name } : null;
    return {
      ...base,
      name: null,
      rows: typedRows.map(({ key, fragile, ...r }) => ({ ...r, fragile: fragile ? "yes" : "no" })),
    };
  }, [source, containerSpecs, fragileShare, csvFile, typedRows]);
  const customKey = customRequest ? JSON.stringify(customRequest) : null;
  const customCurrent = customLoad && customLoad.key === customKey && customLoad.source === source ? customLoad : null;
  const customShown = customLoad && customLoad.source === source ? customLoad : null;

  // Convert (or reuse) the load on screen. -> its id, or null with the errors shown.
  const ensureCustomLoad = useCallback(async () => {
    if (!customRequest) { setCustomErrors([{ row: null, column: null, message: source === "csv" ? "Choose a CSV file first." : "Add at least one row." }]); return null; }
    if (customCurrent) return customCurrent.id;
    setChecking(true);
    const r = await customLoadsApi.convert(customRequest);
    setChecking(false);
    if (!r.ok) { setCustomErrors(r.errors); setCustomLoad(null); return null; }
    setCustomErrors([]);
    setCustomLoad({ id: r.id, summary: r.summary, key: customKey, source });
    return r.id;
  }, [customRequest, customCurrent, customKey, source]);
  // Errors belong to the inputs they were found in.
  useEffect(() => { setCustomErrors([]); }, [source, csvFile]);

  // Load selected instance details
  useEffect(() => {
    if (!selected) {
      setInstanceItems([]);   // clear preview when nothing is selected
      return;
    }
    instancesApi
      .getDetails(selected)
      .then((data) => {
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

  const fetchStudies = useCallback(() => {
    studiesApi.list().then((rows) => setStudies(Array.isArray(rows) ? rows : [])).catch(() => {});
    studiesApi.available().then((rows) => setAvailableStudies(Array.isArray(rows) ? rows : [])).catch(() => {});
  }, []);
  useEffect(() => {
    fetchStudies();
    studiesApi.sizes().then(setSizesInfo).catch((e) => setSizesInfo({ sizes: [], defaults: { error: e.message } }));
  }, [fetchStudies]);

  // Load the selected study's file (stats attached) whenever the selection changes.
  const loadStudy = useCallback(async (id) => {
    if (id === null || id === undefined) { setStudyDoc(null); setStudyProgress(null); return; }
    try {
      const doc = await studiesApi.get(id);
      setStudyDoc({ row: doc, study: doc.study, stats: doc.study ? doc.study.stats : null });
      setStudyProgress(doc.progress || null);
    } catch (e) {
      setError(`Could not load study #${id}: ${e.message}`);
    }
  }, []);
  useEffect(() => { loadStudy(selectedStudyId); }, [selectedStudyId, loadStudy]);

  // Poll progress while the selected study is running (detached job; survives a reload).
  useEffect(() => {
    if (!studyDoc || !studyDoc.row || studyDoc.row.status !== "running") return undefined;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      try {
        const p = await studiesApi.progress(studyDoc.row.id);
        if (cancelled) return;
        setStudyProgress(p);
        if (p.status === "done" || p.status === "error") { loadStudy(studyDoc.row.id); fetchStudies(); return; }
      } catch { /* keep polling */ }
      if (!cancelled) timer = setTimeout(tick, 2000);
    };
    timer = setTimeout(tick, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [studyDoc, loadStudy, fetchStudies]);

  const handleLaunchStudy = useCallback(async ({ size, instanceId, useCustom }) => {
    setStudyBusy(true);
    setError(null);
    try {
      let payload = { size, instanceId };
      if (useCustom) {
        const id = await ensureCustomLoad();
        if (!id) { setStudyBusy(false); setError("Fix the problems listed under your load, then run the Full Comparison again."); return; }
        payload = { size, customLoad: id };
      }
      const r = await studiesApi.create(payload);
      fetchStudies();
      setSelectedStudyId(r.id);
      setResultsMode("study");
      setActiveTab("results");
    } catch (e) { setError(`Could not start the study: ${e.message}`); }
    setStudyBusy(false);
  }, [fetchStudies, ensureCustomLoad]);

  const handleImportStudy = useCallback(async (file) => {
    try {
      const r = await studiesApi.importFile(file);
      fetchStudies();
      setSelectedStudyId(r.id);
      setResultsMode("study");
      setActiveTab("results");
    } catch (e) { setError(`Import failed: ${e.message}`); }
  }, [fetchStudies]);

  const handleDeleteStudy = useCallback(async (s) => {
    try {
      await studiesApi.remove(s.id);
      if (selectedStudyId === s.id) setSelectedStudyId(null);
      fetchStudies();
    } catch (e) { setError(`Could not delete study #${s.id}: ${e.message}`); }
  }, [fetchStudies, selectedStudyId]);

  const handleOpenStudy = useCallback((id) => {
    setSelectedStudyId(id);
    setResultsMode("study");
    setActiveTab("results");
  }, []);

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
                  : msg.dataset === "custom" ? `Custom load ${msg.custom_load && msg.custom_load.name ? `"${msg.custom_load.name}" ` : ""}(${msg.instance})`
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
        if (msg.code !== 0 && !msg.stopped) {
          setError((prev) => prev || (msg.error
            ? `Optimizer exited with code ${msg.code}: ${msg.error}`
            : `Optimizer process exited with code ${msg.code}`));
          // Failed runs are kept in Run history (status "failed") so how
          // often they happen stays visible. A run the user stopped is not.
          const sp = msg.spawn;
          if (sp) {
            runsApi.saveRun({
              strategy: sp.strategy_label || sp.strategy, strategy_code: sp.strategy,
              instance: sp.dataset === "wtpack" ? `wtpack #${sp.instance}` : sp.dataset === "custom" ? `Custom load (${sp.instance})` : String(sp.instance).split(/[\\/]/).pop(),
              dataset: sp.dataset, seed: sp.seed, n_items: null, space_util: null, csr: null, placed: null,
              dissipation: null, runtime_s: null, bins_used: null, placements: null, container: null,
              result: null, convergence: null, status: "failed",
              // The traceback / usage tail's last line that names the error.
              error: (() => {
                const lines = String(msg.error || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                return lines.reverse().find((l) => /error/i.test(l)) || lines[0] || `exit code ${msg.code}`;
              })(),
            }).then(() => fetchRunHistory()).catch(() => {});
          }
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

    const tuning = {
      strategy,
      popSize: wolfSize,
      maxIter,
      lambda: lam,
      enforceSupport,
      enforceFragility,
      seed: Number.isFinite(Number(seed)) && seed !== "" ? Number(seed) : null,
    };

    // Custom load (typed / CSV): converted and stored by the server first.
    if (source === "typed" || source === "csv") {
      const id = await ensureCustomLoad();
      if (!id) {
        setRunning(false);
        setError("Fix the problems listed under your load, then run again.");
        setActiveTab("logistics");
        return;
      }
      wsRef.current.send(JSON.stringify({ action: "run", dataset: "custom", customLoadId: id, ...tuning }));
      setActiveTab("visualization");
      return;
    }

    // OR-Library: the standard test case or a ready-made sample, both wtpack ids.
    if (dataset === "wtpack") {
      const id = source === "sample" ? sampleId : wtpackId;
      if (id === null) {
        setError(source === "sample" ? "Pick a ready-made sample first." : "Select a wtpack instance first.");
        setRunning(false);
        return;
      }
      wsRef.current.send(JSON.stringify({ action: "run", dataset: "wtpack", instanceId: id, ...tuning }));
      setActiveTab("visualization");
      return;
    }

    // Legacy BR JSON path (not offered in the UI).
    wsRef.current.send(JSON.stringify({ action: "run", instancePath: selected, maxTime, strategy }));
    setActiveTab("visualization");
  }, [selected, running, wsConnected, maxTime, strategy, source, sampleId, ensureCustomLoad,
      dataset, wtpackId, wolfSize, maxIter, lam, enforceSupport, enforceFragility, seed]);

  const handleStopRun = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ action: "stop" }));
  }, []);

  // Exporters
  const handleExportResultsCSV = () => {
    if (!finalResult || !finalResult.items) return;
    const cl = customLoadOf(finalResult);
    // A custom load is labelled on every row, so the file cannot pass as thesis data.
    const headers = "Sequence,Item ID,Bin ID,X,Y,Z,Length,Height,Depth" + (cl ? ",Dataset" : "") + "\n";
    const tag = cl ? `,"${cl.label || CUSTOM_LOAD_LABEL}"` : "";
    const rows = finalResult.items.map((item, idx) =>
      `${idx + 1},${item.id},Bin ${item.bin_id},${item.x},${item.y},${item.z},${item.dx ?? item.l},${item.dy ?? item.h},${item.dz ?? item.d}${tag}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `STACKR-Packing-Results-${cl ? `custom-load-${finalResult.instance}` : String(finalResult.instance).split(/[\\/]/).pop().replace('.json', '')}.csv`;
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
      const cl = customLoadOf(row.result) || customLoadOf(row);
      const doc = { stackr_run: 1, exported_at: new Date().toISOString(),
                    ...(cl ? { dataset_note: cl.label || CUSTOM_LOAD_LABEL } : {}), run: row };
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
    if (!finalResult || !finalResult.items || !finalResult.container) return null;
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
    source === "typed" ? typedRows.length > 0
    : source === "csv" ? !!csvFile
    : source === "sample" ? sampleId !== null
    : dataset === "wtpack" && wtpackId !== null
  );

  // What the footer, the top chip and the study launcher say about the chosen load.
  const sampleMeta = samples && samples.samples ? samples.samples.find((x) => x.instance_id === sampleId) : null;
  const standardMeta = wtpackInstances.find((i) => i.instance_id === wtpackId) || null;
  const selectedLoad = useMemo(() => {
    if (source === "typed" || source === "csv") {
      const sm = customShown && customShown.summary;
      return { kind: "custom", custom: true, label: CUSTOM_LOAD_LABEL,
               text: source === "csv" ? `CSV${csvFile ? ` (${csvFile.name})` : ""}` : "typed-in boxes",
               n_boxes: sm ? sm.totals.boxes : null, checked: !!customCurrent };
    }
    if (source === "sample") {
      return { kind: "sample", custom: false, instanceId: sampleId,
               text: sampleMeta ? `sample — ${sampleMeta.br_class}, instance ${sampleMeta.instance_id}` : "ready-made sample",
               label: sampleMeta ? `${sampleMeta.br_class}, instance ${sampleMeta.instance_id}, ${sampleMeta.n_boxes} boxes (OR-Library benchmark)` : null,
               n_boxes: sampleMeta ? sampleMeta.n_boxes : null };
    }
    return { kind: "standard", custom: false, instanceId: wtpackId,
             text: `wtpack #${wtpackId ?? "—"}`, label: standardMeta ? standardMeta.label : null,
             n_boxes: standardMeta ? standardMeta.n_boxes : null };
  }, [source, customShown, customCurrent, csvFile, sampleId, sampleMeta, wtpackId, standardMeta]);

  const NAV = [
    { id: "home", group: "Get started", label: "Home", title: "Home", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg> },
    { id: "logistics", group: "Get started", label: "Start analysis", title: "Start analysis", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg> },
    { id: "results", group: "Get started", label: "Results", title: "Results", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg> },
    { id: "guide", group: "Get started", label: "Loading Guide", title: "Loading Guide", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 4h10v16H9z"/><path d="M5 8h4M5 12h4M5 16h4"/></svg> },
    { id: "compare", group: "Advanced tools", label: "Technical details", title: "Technical details", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20h16"/><path d="M7 16V9"/><path d="M12 16V4"/><path d="M17 16v-6"/></svg> },
    { id: "visualization", group: "Advanced tools", label: "3D Viewer", title: "3D Viewer", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12l8.73-5.04"/><path d="M12 22.08V12"/></svg> },
    { id: "history", group: "Advanced tools", label: "Run History", title: "Run History", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 106 5.3L3 8"/><path d="M12 7v5l4 2"/></svg> },
    { id: "account", group: "Account", label: "Account Settings", title: "Account Settings", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg> },
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
            <div className="brand-sub">Box Packing Helper</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((n, i) => (
            <React.Fragment key={n.id}>
            {(i === 0 || NAV[i - 1].group !== n.group) && <div className="nav-section-label">{n.group}</div>}
            <button
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
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="collapse-btn" onClick={() => setSidebarCollapsed((c) => !c)} title={sidebarCollapsed ? "Show menu" : "Hide menu"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6"/></svg>
            <span>Hide menu</span>
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
            {dataset === "wtpack" && (selectedLoad.custom || selectedLoad.instanceId !== null) && (
              <span className="chip"><span className={`chip-dot${optimizerReady.state === "warm" ? "" : optimizerReady.state === "error" || optimizerReady.state === "offline" ? " danger" : " warn"}`} />{selectedLoad.custom ? "Custom load" : selectedLoad.text}</span>
            )}
            {running && <span className="chip"><span className="chip-dot warn" />Running · {elapsed}s</span>}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowHowTo(true)} title="Show the quick guide">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              How to use
            </button>
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
                  <button type="button" className="btn btn-secondary btn-sm btn-block" style={{ marginBottom: 8 }} onClick={() => { setActiveTab("account"); setProfileOpen(false); }}>
                    Account
                  </button>
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

      {/* ── HOME ── */}
      {activeTab === "home" && (
        <DashboardTab onStart={() => setActiveTab("logistics")} onHelp={() => setShowHowTo(true)} runHistory={runHistory} studies={studies} />
      )}

      {/* ── LOADING GUIDE ── */}
      {activeTab === "guide" && (
        <GuideTab finalResult={finalResult} runHistory={runHistory} />
      )}

      {/* ── ACCOUNT ── */}
      {activeTab === "account" && (
        <AccountTab user={user} logout={logout} studies={studies} result={finalResult} />
      )}

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
          runHistory={runHistory}
          loadSources={{
            source, setSource, stopCount: sizesInfo && sizesInfo.defaults ? sizesInfo.defaults.stop_count : 3,
            samples, sampleId, setSampleId,
            typedRows, setTypedRows, fragileShare, setFragileShare, csvFile, setCsvFile,
            customLoad: customShown, customStale: !!customShown && !customCurrent, customErrors, checking,
            onCheck: () => { ensureCustomLoad(); },
          }}
          loadSummary={{ boxes: selectedLoad.n_boxes, text: selectedLoad.text }}
          testSettings={<TestSettingsPanel sizesInfo={sizesInfo} size={studySize} seed={seed} selectedLoad={selectedLoad} customLoad={customShown} />}
          studyLauncher={
            <StudyLauncher
              sizesInfo={sizesInfo}
              studies={studies}
              available={availableStudies}
              onLaunch={handleLaunchStudy}
              onImport={handleImportStudy}
              onOpenStudy={handleOpenStudy}
              onDeleteStudy={handleDeleteStudy}
              onRefresh={fetchStudies}
              wtpackId={wtpackId}
              wtpackInstances={wtpackInstances}
              selectedLoad={selectedLoad}
              seed={seed}
              busy={studyBusy}
              size={studySize}
              setSize={setStudySize}
            />
          }
        />
      )}

      {/* ── RESULTS TAB ── */}
      {activeTab === "results" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div className="tabs-inline">
              <button className={resultsMode === "quick" ? "active" : ""} onClick={() => setResultsMode("quick")}>Quick Test (single run)</button>
              <button className={resultsMode === "study" ? "active" : ""} onClick={() => setResultsMode("study")}>Full Comparison (study)</button>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {resultsMode === "study" && <StudySelect studies={studies} value={selectedStudyId} onChange={setSelectedStudyId} />}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowThings((s) => !s)}>
                {showThings ? "Hide things to know" : "Things to know"}
              </button>
            </div>
          </div>
          {showThings && <ThingsToKnow result={resultsMode === "quick" ? finalResult : null} studies={studies} />}
          {resultsMode === "study" && (
            <StudyResults
              row={studyDoc ? studyDoc.row : null}
              study={studyDoc ? studyDoc.study : null}
              stats={studyDoc ? studyDoc.stats : null}
              progress={studyProgress}
              onOpenCompare={() => setActiveTab("compare")}
            />
          )}
        </div>
      )}
      {activeTab === "results" && resultsMode === "quick" && (
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

      {/* ── COMPARE TAB ── */}
      {activeTab === "compare" && (
        <CompareTab
          row={studyDoc ? studyDoc.row : null}
          study={studyDoc ? studyDoc.study : null}
          stats={studyDoc ? studyDoc.stats : null}
          runHistory={runHistory}
          studies={studies}
          selectedStudyId={selectedStudyId}
          onSelectStudy={setSelectedStudyId}
        />
      )}

      {/* ── VISUALIZATION TAB ── */}
      {activeTab === "visualization" && (
        <VisualizationTab
          finalResult={finalResult}
          studies={studies}
          placements={placements}
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
      <HowToModal open={showHowTo} onClose={() => setShowHowTo(false)} hidden={user && user.howto_hidden}
        onSetHidden={async (h) => {
          try { await setPrefs({ howto_hidden: h }); toast(h ? "It won't open by itself again. Use \"How to use\" any time." : "It will open again after you log in.", "ok"); }
          catch (e) { toast(`Could not save that: ${e.message}`, "err"); }
        }} />
    </div>
  );
}
