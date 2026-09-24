import React, { useState, useMemo, useRef } from "react";
import { CustomLoadBadge, CUSTOM_LOAD_LABEL } from "./CustomLoadBanner";
import { methodLabel, methodOf } from "../methods";

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  let date;
  if (dateStr.endsWith("Z") || dateStr.includes("T")) {
    date = new Date(dateStr);
  } else {
    date = new Date(dateStr.replace(" ", "T") + "Z");
  }
  if (isNaN(date.getTime())) return dateStr;
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Chapter 3 compliance: over all n boxes, unplaced = non-compliant. Exact from the stored ratio.
const allBoxCompliance = (run) => (run.csr == null || run.placed == null || !run.n_items) ? null : run.csr * run.placed / run.n_items;
const fmtPct = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : `${Number(v).toFixed(2)}%`);

// Status: Failed = the optimizer process exited with an error; Hit attempt
// limit = result.budget_exhausted (the placement routine stopped checking
// positions at its work limit and left the remaining boxes unplaced).
export function runStatus(run) {
  if (run.status === "failed") return { key: "failed", text: "Failed", cls: "badge-danger", title: run.error || "The optimizer process exited with an error" };
  if (run.budget_exhausted === true) return { key: "limit", text: "Hit attempt limit", cls: "badge-warn", title: "The placement routine reached its limit on position checks; the boxes after that point were left unplaced" };
  if (run.budget_exhausted === false) return { key: "ok", text: "OK", cls: "badge-safe", title: "Finished normally" };
  return { key: "not-recorded", text: "Not recorded", cls: "badge-neutral", title: "Saved before the attempt-limit flag was recorded, so whether it hit the limit is unknown" };
}

// Rows from the retired manual entry (the server flags them): its weights were invented.
const OLD_MANUAL = "made-up weights (old manual entry)";

const customRules = (run) => run.enforce_support === false || run.enforce_fragility === false;
const customRulesText = (run) => [run.enforce_support === false && "support (C5) not enforced while placing",
                                   run.enforce_fragility === false && "fragility (C4) not enforced while placing"].filter(Boolean).join("; ");

const CSV_COLS = [
  ["id", (r) => r.id], ["label", (r) => r.label ?? ""], ["test_case", (r) => r.instance ?? ""],
  ["dataset_note", (r) => (r.custom_load ? r.custom_load.label || CUSTOM_LOAD_LABEL : r.old_manual_entry ? OLD_MANUAL : "")],
  ["method", (r) => r.strategy_code || r.strategy || ""], ["repeat_code_seed", (r) => r.seed ?? ""],
  ["rules_setting", (r) => (customRules(r) ? "custom rules: " + customRulesText(r) : r.enforce_support === null || r.enforce_support === undefined ? "" : "standard")],
  ["container_full_pct", (r) => r.space_util ?? ""], ["rules_loaded_boxes_pct", (r) => r.csr ?? ""],
  ["rules_all_boxes_pct", (r) => { const v = allBoxCompliance(r); return v === null ? "" : v; }],
  ["C3_pct", (r) => r.c3_pct ?? ""], ["C4_pct", (r) => r.c4_pct ?? ""], ["C5_pct", (r) => r.c5_pct ?? ""], ["C6_pct", (r) => r.c6_pct ?? ""],
  ["boxes", (r) => r.n_items ?? ""], ["loaded", (r) => r.placed ?? ""], ["not_loaded", (r) => r.unplaced ?? ""],
  ["time_s", (r) => r.runtime_s ?? ""], ["status", (r) => runStatus(r).text], ["error", (r) => r.error ?? ""],
  ["saved_at", (r) => r.created_at ?? ""],
];

function downloadCsv(rows) {
  const esc = (v) => { const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = [CSV_COLS.map(([h]) => h).join(","), ...rows.map((r) => CSV_COLS.map(([, f]) => esc(f(r))).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = "STACKR-run-history.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// Inline, click-to-edit label cell.
function LabelCell({ run, onLabelRun }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(run.label || "");
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v !== (run.label || "")) onLabelRun(run, v);
  };
  if (editing) {
    return (
      <input
        autoFocus
        className="field-input"
        value={draft}
        placeholder="Label this run"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(run.label || ""); setEditing(false); } }}
        style={{ width: "180px", padding: "4px 8px", fontSize: "12px" }}
      />
    );
  }
  return (
    <button
      type="button"
      className="link-btn"
      onClick={() => { setDraft(run.label || ""); setEditing(true); }}
      title="Click to edit label"
      style={{ fontWeight: run.label ? 600 : 400, color: run.label ? "var(--text-main)" : "var(--text-dim)", fontStyle: run.label ? "normal" : "italic" }}
    >
      {run.label || "add label"}
    </button>
  );
}

export default function RunHistoryTab({
  runHistory,
  handleExportHistory,
  onLoadRun,
  onLabelRun,
  onDeleteRun,
  onExportRun,
  onImportRun
}) {
  const [historyFilter, setHistoryFilter] = useState("All");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);   // run pending deletion
  const fileRef = useRef(null);

  const strategies = useMemo(() => {
    const set = new Set(runHistory.map((r) => r.strategy).filter(Boolean));
    return Array.from(set).sort();
  }, [runHistory]);

  const filteredHistory = useMemo(() => {
    let list = runHistory;
    if (historyFilter !== "All") list = list.filter((r) => r.strategy === historyFilter);
    const q = historySearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        String(r.instance || "").toLowerCase().includes(q) ||
        String(r.label || "").toLowerCase().includes(q) ||
        String(r.strategy || "").toLowerCase().includes(q) ||
        String(r.seed ?? "").includes(q)
      );
    }
    return list;
  }, [runHistory, historyFilter, historySearchQuery]);

  const onPickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (f) onImportRun(f);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h3 className="font-display" style={{ fontSize: "20px", fontWeight: 600 }}>Run history</h3>
          <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
            Saved runs on this machine (server/data). Load one to replay its full Results page; export it to move it to another laptop. Runs made with a placement rule switched off are marked “custom rules”.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <input
            type="text"
            className="field-input"
            placeholder="Search instance, label, seed…"
            value={historySearchQuery}
            onChange={(e) => setHistorySearchQuery(e.target.value)}
            style={{ width: "200px" }}
          />
          <select className="field-input" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} style={{ fontWeight: 600 }}>
            <option value="All">All methods</option>
            {strategies.map((s) => <option key={s} value={s}>{methodLabel(s)}</option>)}
          </select>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPickFile} style={{ display: "none" }} />
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current && fileRef.current.click()}>
            Import run…
          </button>
          <button type="button" className="btn btn-primary" onClick={() => downloadCsv(filteredHistory)} disabled={filteredHistory.length === 0}>
            Download as CSV
          </button>
        </div>
      </div>

      {confirmDelete && (
        <div role="alertdialog" className="confirm-bar">
          <span>
            Delete run <b>#{confirmDelete.id}</b> ({confirmDelete.strategy}, {confirmDelete.instance}{confirmDelete.label ? `, "${confirmDelete.label}"` : ""})? This cannot be undone.
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn btn-danger" onClick={() => { onDeleteRun(confirmDelete); setConfirmDelete(null); }}>Delete</button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filteredHistory.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Label</th>
                  <th>Test case</th>
                  <th>Method</th>
                  <th style={{ textAlign: "right" }} title="The seed: the same code gives the same result">Repeat code</th>
                  <th style={{ textAlign: "right" }}>Container full</th>
                  <th style={{ textAlign: "right" }} title="Rules followed, counting only the boxes that were loaded">Rules (loaded)</th>
                  <th style={{ textAlign: "right" }} title="Rules followed over ALL boxes: a box left out counts as not following them (= loaded-box figure × loaded / total)">Rules (all boxes)</th>
                  <th style={{ textAlign: "right" }} title="C3 weight on top — share of loaded boxes that follow it">C3</th>
                  <th style={{ textAlign: "right" }} title="C4 fragile — share of loaded boxes that follow it">C4</th>
                  <th style={{ textAlign: "right" }} title="C5 support — share of loaded boxes that follow it">C5</th>
                  <th style={{ textAlign: "right" }} title="C6 unload order — share of loaded boxes that follow it">C6</th>
                  <th style={{ textAlign: "right" }}>Not loaded</th>
                  <th style={{ textAlign: "right" }}>Time</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Saved</th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((run) => {
                  const full = run.has_result || !!run.result;
                  const loadable = full || !!run.placements;
                  return (
                    <tr key={run.id}>
                      <td style={{ fontWeight: 700, color: "var(--primary)" }}>#{String(run.id).padStart(3, "0")}</td>
                      <td><LabelCell run={run} onLabelRun={onLabelRun} /></td>
                      <td style={{ fontWeight: 600 }}>
                        {run.instance}
                        {run.custom_load && <div><CustomLoadBadge info={run.custom_load} /></div>}
                        {run.old_manual_entry && <div><span className="badge badge-danger" style={{ textTransform: "none" }} title="Saved by the retired manual entry, which filled in synthetic weights">{OLD_MANUAL}</span></div>}
                      </td>
                      <td>
                        <span className={`chip chip-${String(run.strategy_code || run.strategy || "").toLowerCase().replace(/[^a-z]/g, "")}`} title={methodLabel(run.strategy_code || run.strategy)}>
                          {methodOf(run.strategy_code || run.strategy) ? methodOf(run.strategy_code || run.strategy).name : run.strategy}
                        </span>
                        {customRules(run) && <span className="badge badge-warn" style={{ marginLeft: 6 }} title={customRulesText(run)}>custom rules</span>}
                        {methodOf(run.strategy_code || run.strategy) && (
                          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3, maxWidth: 170, lineHeight: 1.3 }}>{methodOf(run.strategy_code || run.strategy).nick}</div>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>{run.seed ?? "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "var(--green)" }}>{fmtPct(run.space_util)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtPct(run.csr)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtPct(allBoxCompliance(run))}</td>
                      {["c3_pct", "c4_pct", "c5_pct", "c6_pct"].map((k) => <td key={k} style={{ textAlign: "right" }}>{fmtPct(run[k])}</td>)}
                      <td style={{ textAlign: "right" }}>{run.unplaced != null && run.n_items ? `${run.unplaced} of ${run.n_items}` : "—"}</td>
                      <td style={{ textAlign: "right" }}>{run.runtime_s != null ? `${Number(run.runtime_s).toFixed(1)}s` : "—"}</td>
                      <td>{(() => { const s = runStatus(run); return <span className={`badge ${s.cls}`} title={s.title}>{s.text}</span>; })()}</td>
                      <td style={{ textAlign: "right", color: "var(--text-dim)" }}>{formatDate(run.created_at)}</td>
                      <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-xs"
                            onClick={() => onLoadRun(run)}
                            disabled={!loadable}
                            title={full ? "Replay the full Results page for this run" : loadable ? "Legacy row: only SU and placements were saved" : "Nothing stored for this run"}
                          >
                            {full ? "Load" : "Load (partial)"}
                          </button>
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => onExportRun(run)} title="Download this run as JSON">Export</button>
                          <button type="button" className="btn btn-danger-outline btn-xs" onClick={() => setConfirmDelete(run)} title="Delete this run">Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: "48px", textAlign: "center" }}>
            <span style={{ fontSize: "28px" }}>📂</span>
            <h4 style={{ marginTop: "12px", color: "var(--text-muted)" }}>No runs saved</h4>
            <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>Finished and failed runs are saved here automatically. You can also import a run exported from another machine.</p>
          </div>
        )}
      </div>

    </div>
  );
}
