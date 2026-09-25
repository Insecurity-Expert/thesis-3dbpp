// Processing — the prototype's processing screen (design/Updated_Prototype.html,
// #wiz-processing): title, run label, status text, progress bar, sub-label.
// Every value is read from the comparison's real progress file; nothing is
// driven by a timer. Stop ends every process of the comparison.
import React from "react";
import { methodOf } from "../methods";

export default function ProcessingPanel({ progress, study, state, error, onStop, stopping, onBack }) {
  const p = progress || {};
  const total = p.total || 0, done = p.done || 0;
  const pct = total ? (100 * done) / total : 0;
  const per = p.per_configuration || {};
  const codes = Object.keys(per);
  const finished = codes.filter((c) => per[c].total && per[c].done >= per[c].total).length;
  const nm = (c) => (methodOf(c) ? methodOf(c).name : (study && study.configuration_labels && study.configuration_labels[c]) || c);
  const failed = state === "error", stopped = state === "stopped";
  const status = failed ? "The comparison stopped with an error."
    : stopped ? "Stopped. Nothing was saved."
    : !total ? "Starting the four methods…"
    : finished >= (codes.length || 4) ? "All runs finished — checking and scoring the results…"
    : `Packing with method ${finished + 1} of ${codes.length || 4}…`;

  return (
    <div className="card" style={{ padding: "48px 32px", textAlign: "center" }}>
      {!failed && !stopped && <div className="processing-spinner" style={{ margin: "0 auto 20px" }} aria-hidden />}
      <div className="font-display" style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
        {failed ? "Packing did not finish" : stopped ? "Packing stopped" : "Packing your boxes…"}
      </div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600, color: "var(--primary-hover)", marginBottom: 6 }}>
        {total ? `Run ${done} of ${total} finished` : "Run 0 finished"}
        {p.last_run ? ` — last: ${nm(p.last_run.configuration)}, repeat code ${p.last_run.seed}` : ""}
      </div>
      <div role="status" aria-live="polite" style={{ color: failed ? "var(--red)" : "var(--text-muted)", fontSize: 12.5, maxWidth: 480, margin: "0 auto" }}>
        {status}
      </div>
      <div style={{ height: 8, background: "var(--bg-input)", borderRadius: 100, maxWidth: 360, margin: "22px auto 0", overflow: "hidden" }}
        role="progressbar" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={done}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--primary)", borderRadius: 100, transition: "width 0.3s ease" }} />
      </div>
      <div className="field-hint" style={{ marginTop: 10 }}>
        {finished} of {codes.length || 4} methods finished{p.elapsed_s ? ` · ${Math.round(p.elapsed_s)} s so far` : ""}
      </div>

      {codes.length > 0 && (
        <details className="collapsible" style={{ maxWidth: 420, margin: "18px auto 0", textAlign: "left" }}>
          <summary>Progress per method</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {codes.map((c) => (
              <div key={c} style={{ fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 3 }}>
                  <span>{nm(c)}{methodOf(c) ? <span style={{ fontWeight: 400, color: "var(--text-dim)" }}> — {methodOf(c).nick}</span> : null}</span>
                  <span>{per[c].done} / {per[c].total}</span>
                </div>
                <div style={{ height: 6, background: "var(--bg-input)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${per[c].total ? (100 * per[c].done) / per[c].total : 0}%`, background: "var(--primary)" }} />
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {failed && <div className="alert-danger" style={{ maxWidth: 560, margin: "18px auto 0", textAlign: "left" }}>⚠ {error || p.error || "The comparison process stopped before writing its results."} It was saved to Run History as a failed run.</div>}

      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}>
        {!failed && !stopped
          ? <button type="button" className="btn btn-danger-outline" onClick={onStop} disabled={stopping}>{stopping ? "Stopping…" : "■ Stop"}</button>
          : <button type="button" className="btn btn-secondary" onClick={onBack}>← Back to review</button>}
      </div>
    </div>
  );
}
