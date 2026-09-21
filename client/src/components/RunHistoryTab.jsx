import React, { useState, useMemo, useRef } from "react";

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

const fmtPct = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : `${Number(v).toFixed(2)}%`);

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
          <h3 style={{ fontSize: "18px", fontWeight: "800" }}>Run history</h3>
          <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
            Saved runs on this machine (server/data). Load one to replay its full Results page; export it to move it to another laptop.
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
            <option value="All">All strategies</option>
            {strategies.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPickFile} style={{ display: "none" }} />
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current && fileRef.current.click()}>
            Import run…
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleExportHistory}>
            Export list
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
                  <th>Instance</th>
                  <th>Strategy</th>
                  <th style={{ textAlign: "right" }}>Seed</th>
                  <th style={{ textAlign: "right" }}>SU</th>
                  <th style={{ textAlign: "right" }}>CSR</th>
                  <th style={{ textAlign: "right" }}>Placed</th>
                  <th style={{ textAlign: "right" }}>Runtime</th>
                  <th style={{ textAlign: "right" }}>Completed</th>
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
                      <td style={{ fontWeight: 600 }}>{run.instance}</td>
                      <td>
                        <span className={`chip chip-${String(run.strategy_code || run.strategy || "").toLowerCase().replace(/[^a-z]/g, "")}`}>
                          {run.strategy}{run.strategy_code && run.strategy_code !== run.strategy ? ` (${run.strategy_code})` : ""}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>{run.seed ?? "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "var(--green)" }}>{fmtPct(run.space_util)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtPct(run.csr)}</td>
                      <td style={{ textAlign: "right" }}>{run.placed ?? "—"}{run.n_items ? ` / ${run.n_items}` : ""}</td>
                      <td style={{ textAlign: "right" }}>{run.runtime_s != null ? `${Number(run.runtime_s).toFixed(1)}s` : "—"}</td>
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
            <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>Completed runs are saved here automatically. You can also import a run exported from another machine.</p>
          </div>
        )}
      </div>

    </div>
  );
}
