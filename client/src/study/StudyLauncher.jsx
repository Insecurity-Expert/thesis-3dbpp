// client/src/study/StudyLauncher.jsx — "Two ways to run this": Quick Test
// (the existing single run) or Full Comparison (a study: four configurations
// x N seeds x instances). Also the locked "Test settings" panel — every value
// in it is read from the optimizer via /api/studies/sizes, none is typed here.
import React, { useState } from "react";
import { fmt } from "./verdicts";

export function TestSettingsPanel({ sizesInfo, size, wtpackInstance, seed }) {
  const d = sizesInfo && sizesInfo.defaults;
  const s = sizesInfo && sizesInfo.sizes ? sizesInfo.sizes.find((x) => x.key === size) : null;
  if (!d || d.error) {
    return (
      <div className="card">
        <h4 className="section-tag" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 12 }}>Test settings 🔒</h4>
        <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{d && d.error ? `Could not read the optimizer defaults: ${d.error}` : "Loading the optimizer's parameters…"}</div>
      </div>
    );
  }
  const lam = d.lambdas || {};
  const seedsSpec = s ? s.seeds : null;
  const rows = [
    ["Population (wolves)", s ? s.pop_size : "—"],
    ["Iterations per run", s ? s.max_iter : "—"],
    ["Penalty λ — C3 weight / C4 fragility / C5 stability / C6 stop order", [lam.w, lam.f, lam.b, lam.a].map((v) => (v === undefined ? "—" : v)).join(" / ")],
    ["Support required under a box (C5)", `${Math.round((d.support_threshold || 0) * 100)}%`],
    ["Decode-time enforcement", `C5 ${d.enforce_support ? "on" : "off"} · C4 ${d.enforce_fragility ? "on" : "off"}`],
    ["Seeds (one run each)", seedsSpec ? `${seedsSpec}` : seed ?? "—"],
    ["Runs per configuration", s ? s.runs / 4 : "—"],
    ["Delivery stops", `${d.stop_count} (assignment seed ${d.stop_seed})`],
    ["Sequential budget split", d.seq_budget_split],
  ];
  return (
    <div className="card">
      <div className="card-head" style={{ marginBottom: 10 }}>
        <div>
          <div className="card-title">Test settings <span className="badge badge-neutral" style={{ marginLeft: 6 }}>🔒 fixed</span></div>
          <div className="card-desc">Set to the optimizer's own values so results can be compared fairly. Read from the code, not typed here.</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, borderBottom: "1px dashed var(--border)", padding: "5px 0" }}>
            <span style={{ color: "var(--text-dim)" }}>{k}</span><b style={{ color: "var(--text-main)", textAlign: "right" }}>{String(v)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StudyLauncher({
  sizesInfo, studies, available, onLaunch, onImport, onOpenStudy, onDeleteStudy, onRefresh,
  wtpackId, wtpackInstances, seed, busy, size, setSize,
}) {
  const [customInstance, setCustomInstance] = useState(false);
  const sizes = (sizesInfo && sizesInfo.sizes) || [];
  const chosen = sizes.find((s) => s.key === size);
  const inst = wtpackInstances.find((i) => i.instance_id === wtpackId);
  const running = studies.filter((s) => s.status === "running");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card" style={{ border: "2px solid var(--primary)" }}>
        <div className="card-head">
          <div>
            <div className="card-title">Full Comparison</div>
            <div className="card-desc">Runs all four configurations many times each, then applies the Chapter 3 statistics and shows whether the differences are real. Detached job — it keeps running if this page closes.</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {sizes.map((s) => (
            <button key={s.key} onClick={() => setSize(s.key)} style={{
              textAlign: "left", padding: "14px 16px", borderRadius: 10, cursor: "pointer",
              border: size === s.key ? "2px solid var(--primary)" : "1px solid var(--border)",
              background: size === s.key ? "var(--primary-light)" : "var(--bg-card)", color: "var(--text-main)",
            }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{s.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>{s.blurb}</div>
              <div style={{ fontSize: 12, marginTop: 8, color: "var(--primary)", fontWeight: 700 }}>{s.runs} runs · estimated {fmt.duration(s.estimate_s)}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{s.mode === "serial" ? "one run at a time — time & memory valid (SP3)" : "parallel — time & memory flagged, not tested"}</div>
            </button>
          ))}
        </div>
        {chosen && chosen.instanceId !== undefined && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--text-muted)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={customInstance} onChange={(e) => setCustomInstance(e.target.checked)} />
              use the instance selected above{inst ? ` (${inst.label})` : ""} instead of the size's default (instance {chosen.instanceId})
            </label>
          </div>
        )}
        {chosen && chosen.key === "demo" && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
            One test case only: container fill (SP1) and safety rules (SP2) are compared; the overall ranking needs ≥ 2 test cases.
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" disabled={busy || !chosen} onClick={() => onLaunch({ size, instanceId: customInstance && wtpackId !== null ? wtpackId : undefined })}>
            Run {chosen ? chosen.name : "study"}
          </button>
          {running.length > 0 && <span className="badge badge-warn" style={{ textTransform: "none" }}>{running.length} study{running.length > 1 ? "ies" : ""} running</span>}
          <button className="btn btn-secondary btn-sm" onClick={onRefresh}>Refresh</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Your studies</div>
            <div className="card-desc">Every Full Comparison you launched or imported. Open one to see its Results and Compare screens.</div>
          </div>
        </div>
        {studies.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-dim)", padding: "14px 0" }}>No studies yet — run a Full Comparison above, or import a precomputed one below.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="custom-table" style={{ width: "100%" }}>
              <thead><tr><th>#</th><th>Name</th><th>Status</th><th>Runs</th><th>Test cases</th><th>Mode</th><th>Outcome</th><th></th></tr></thead>
              <tbody>
                {studies.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td style={{ textAlign: "left", fontWeight: 700 }}>{s.name}{s.imported && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>imported</span>}</td>
                    <td>
                      {s.status === "running" ? <span className="badge badge-warn">running {s.progress ? `${s.progress.done}/${s.progress.total}` : ""}</span>
                        : s.status === "error" ? <span className="badge badge-fragile">failed</span>
                        : <span className="badge badge-success">done</span>}
                    </td>
                    <td>{s.n_runs ?? (s.progress && s.progress.total) ?? "—"}</td>
                    <td>{s.n_instances ?? "—"}</td>
                    <td>{s.mode || "—"}{s.timing_valid === false ? " (timing flagged)" : ""}</td>
                    <td>{s.outcome ? `Outcome ${s.outcome}` : "—"}{s.recommendation ? ` · rec. ${s.recommendation}` : ""}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-primary btn-xs" onClick={() => onOpenStudy(s.id)}>Open</button>{" "}
                      <button className="btn btn-danger-outline btn-xs" onClick={() => onDeleteStudy(s)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Import a precomputed study</div>
            <div className="card-desc">Study files computed from the command line (experiments/study.py) in experiments/results/studies.</div>
          </div>
        </div>
        {(!available || available.length === 0) ? (
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>No study files found on this machine.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {available.map((f) => (
              <div key={f.file} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, fontSize: 12.5, padding: "8px 10px", background: "var(--bg-input)", borderRadius: 8 }}>
                <span>
                  <b>{f.name}</b> — {f.n_runs} runs, {f.n_instances} test case{f.n_instances === 1 ? "" : "s"}, {f.preset ? `${f.preset.name} (${f.preset.pop_size} × ${f.preset.max_iter})` : ""}, {f.mode}, seeds {fmt.seeds(f.seeds)}, commit {f.commit || "?"}
                  {!f.has_stats && <span className="badge badge-warn" style={{ marginLeft: 6 }}>no stats</span>}
                </span>
                <button className="btn btn-secondary btn-sm" disabled={f.imported || !f.has_stats} onClick={() => onImport(f.file)}>{f.imported ? "Imported" : "Import"}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
