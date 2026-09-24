import React from "react";
import { METHODS } from "../methods";

// Home. Layout follows the groupmate fork's DashboardTab; every sentence is
// about what this app actually does. The only numbers are counts of the
// user's own saved runs and studies, shown only when there are any.

function Step({ n, title, desc, cta, onClick }) {
  return (
    <button type="button" className="card" onClick={onClick}
      style={{ textAlign: "left", cursor: "pointer", border: "1px solid var(--border)", font: "inherit", color: "inherit" }}>
      <div className="badge badge-primary" style={{ marginBottom: 10 }}>Step {n}</div>
      <div className="card-title" style={{ marginBottom: 4 }}>{title}</div>
      <div className="card-desc" style={{ marginBottom: 10 }}>{desc}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--primary)" }}>{cta} →</div>
    </button>
  );
}

export default function DashboardTab({ setActiveTab, runHistory = [], studies = [] }) {
  const finished = runHistory.filter((r) => r.status !== "failed").length;
  const done = studies.filter((s) => s.status === "done" || s.status === "imported").length;
  return (
    <>
      <div className="card" style={{ textAlign: "center", padding: "40px 32px", marginBottom: 20, background: "linear-gradient(155deg, var(--primary-light), var(--bg-card))" }}>
        <div className="font-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 10 }}>Plan how boxes go into one truck</div>
        <div style={{ maxWidth: 580, margin: "0 auto 22px", color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.6 }}>
          STACKR takes a load of boxes and a single container that is loaded and unloaded through its rear door, searches for an arrangement with one of four methods, and shows where every box goes, which boxes were left out, and which loading rules each box follows.
        </div>
        <button type="button" className="btn btn-primary" style={{ padding: "11px 26px", fontSize: 14 }} onClick={() => setActiveTab("logistics")}>Start analysis →</button>
        {(finished > 0 || done > 0) && (
          <div className="field-hint" style={{ marginTop: 14 }}>
            You have {finished} saved run{finished === 1 ? "" : "s"}{done > 0 ? ` and ${done} finished stud${done === 1 ? "y" : "ies"}` : ""}.
          </div>
        )}
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <Step n={1} title="Pick a load" desc="Choose a test case from the OR-Library wtpack set. Each one supplies its container size, box sizes, weights and load-bearing strengths; STACKR marks the fragile boxes and assigns delivery stops (see Things to know)." cta="Start analysis" onClick={() => setActiveTab("logistics")} />
        <Step n={2} title="Pick a method and run" desc="A Quick Test runs one method once. A Full Comparison runs all four over several repeat codes and tests whether their differences are real." cta="Start analysis" onClick={() => setActiveTab("logistics")} />
        <Step n={3} title="Check the result" desc="See the arrangement in 3D with any rule problems highlighted, compare methods, and print a step-by-step loading plan." cta="3D viewer" onClick={() => setActiveTab("visualization")} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>The container</div>
          <div className="card-desc" style={{ lineHeight: 1.6 }}>
            One container per arrangement. The rear door is at y = 0 and the cab end at the far wall. Boxes for stop 1 come out first, so they should sit nearest the door and not under boxes for later stops. A box that does not fit is left out and counted, never moved to a second container.
          </div>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>The rules checked for every loaded box</div>
          <div className="card-desc" style={{ lineHeight: 1.6 }}>
            C3 — no more weight on top than the box can bear · C4 — nothing on top of a fragile box · C5 — at least 80% of the base supported · C6 — no box for a later stop above it or between it and the door. Boxes are always inside the container and never overlap.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 10 }}>The four methods</div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          {Object.values(METHODS).map((m) => (
            <div key={m.code} style={{ fontSize: 13, lineHeight: 1.5 }}>
              <b>{m.name}</b> <span style={{ color: "var(--text-dim)" }}>— {m.nick}</span>
              <div style={{ color: "var(--text-muted)" }}>{m.how}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
