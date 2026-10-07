// client/src/study/StudyList.jsx — Run History → Studies: the studies you ran
// or imported, and the precomputed study files you can import
// (experiments/results/studies). Moved here from the retired Studies page.
import React, { useMemo, useState } from "react";
import { fmt } from "./verdicts";
import { CUSTOM_LOAD_LABEL } from "../components/CustomLoadBanner";

// One entry per study: the same commit, name, size, preset, mode, seeds and
// shape is the same study computed again (e.g. the Demo study run twice on one
// commit). Two different studies from one commit (Study A and Study B) both stay.
const studyKey = (f) => JSON.stringify([f.commit || null, f.name || null, f.size || null, f.mode || null,
  f.preset ? [f.preset.name, f.preset.pop_size, f.preset.max_iter] : null, f.seeds || null, f.n_runs, f.n_instances]);
const createdAt = (f) => { const t = Date.parse(f.created_at || ""); return Number.isFinite(t) ? t : 0; };

// Newest first; of a group of duplicates the one already imported is kept,
// otherwise the newest.
export function dedupeAvailable(available) {
  const groups = new Map();
  for (const f of available || []) {
    const k = studyKey(f);
    const cur = groups.get(k);
    if (!cur || (f.imported && !cur.imported) || (f.imported === cur.imported && createdAt(f) > createdAt(cur))) groups.set(k, f);
  }
  return [...groups.values()].sort((a, b) => createdAt(b) - createdAt(a) || String(b.file).localeCompare(String(a.file)));
}

export function YourStudies({ studies, onOpenStudy, onDeleteStudy }) {
  const [confirmDelete, setConfirmDelete] = useState(null);   // study pending deletion
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Your studies</div>
          <div className="card-desc">Every Full Comparison you launched or imported. Open one to see its Results and Technical Details.</div>
        </div>
      </div>
      {confirmDelete && (
        <div role="alertdialog" className="confirm-bar" style={{ marginBottom: 12 }}>
          <span>Delete study <b>#{confirmDelete.id}</b> ({confirmDelete.name})? This cannot be undone.</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn btn-danger" onClick={() => { onDeleteStudy(confirmDelete); setConfirmDelete(null); }}>Delete</button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
          </div>
        </div>
      )}
      {studies.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-dim)", padding: "14px 0" }}>No studies yet — Run STACKR from Start analysis, or import a precomputed one below.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="custom-table" style={{ width: "100%" }}>
            <thead><tr><th>#</th><th>Name</th><th>Status</th><th>Runs</th><th>Test cases</th><th>Mode</th><th>Outcome</th><th></th></tr></thead>
            <tbody>
              {studies.map((s) => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td style={{ textAlign: "left", fontWeight: 700 }}>{s.name}{s.imported && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>imported</span>}
                    {s.custom_load && <span className="badge badge-warn" style={{ marginLeft: 6, textTransform: "none" }}>{s.custom_load_label || CUSTOM_LOAD_LABEL}</span>}</td>
                  <td>
                    {s.status === "running" ? <span className="badge badge-warn">running {s.progress ? `${s.progress.done}/${s.progress.total}` : ""}</span>
                      : s.status === "error" ? <span className="badge badge-fragile">failed</span>
                      : <span className="badge badge-success">done</span>}
                  </td>
                  <td>{s.n_runs ?? (s.progress && s.progress.total) ?? "—"}</td>
                  <td>{s.n_instances ?? "—"}</td>
                  <td>{s.mode || "—"}{s.timing_valid === false ? " (timing flagged)" : ""}</td>
                  <td>{s.outcome ? `Outcome ${s.outcome}` : "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-primary btn-xs" onClick={() => onOpenStudy(s.id)}>Open</button>{" "}
                    <button className="btn btn-danger-outline btn-xs" onClick={() => setConfirmDelete(s)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PrecomputedStudies({ available, onImport }) {
  const [open, setOpen] = useState(false);
  const list = useMemo(() => dedupeAvailable(available), [available]);
  return (
    <div className="card">
      <div className="card-head card-head-wrap" style={{ marginBottom: open ? undefined : 0 }}>
        <div>
          <div className="card-title">Import a precomputed study</div>
          <div className="card-desc">Study files computed from the command line (experiments/study.py) in experiments/results/studies.</div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide precomputed studies" : `Show precomputed studies (${list.length})`}
        </button>
      </div>
      {open && (list.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>No study files found on this machine.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((f) => (
            <div key={f.file} className="precomputed-row">
              <span>
                <b>{f.name}</b> — {f.n_runs} runs, {f.n_instances} test case{f.n_instances === 1 ? "" : "s"}, {f.preset ? `${f.preset.name} (${f.preset.pop_size} × ${f.preset.max_iter})` : ""}, {f.mode}, seeds {fmt.seeds(f.seeds)}, commit {f.commit || "?"}
                {!f.has_stats && <span className="badge badge-warn" style={{ marginLeft: 6 }}>no stats</span>}
              </span>
              <button className="btn btn-secondary btn-sm" disabled={f.imported || !f.has_stats} onClick={() => onImport(f.file)}>{f.imported ? "Imported" : "Import"}</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
