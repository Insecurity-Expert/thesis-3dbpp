import React from "react";

// Home. Layout is the prototype's Home panel (design/Updated_Prototype.html):
// "New here?" banner, hero, three step cards, "What you'll need". Every
// sentence is about what this app actually does. The only numbers are counts
// of the user's own saved runs and studies, shown only when there are any.

function Step({ n, title, desc, onClick }) {
  return (
    <button type="button" className="card step-card" onClick={onClick}>
      <div className="badge badge-primary" style={{ marginBottom: 10 }}>Step {n}</div>
      <div className="card-title" style={{ marginBottom: 4 }}>{title}</div>
      <div className="card-desc">{desc} <b>Click to start →</b></div>
    </button>
  );
}

function Need({ n, children }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <span className="badge badge-primary" style={{ height: "fit-content" }}>{n}</span>
      <div>{children}</div>
    </div>
  );
}

export default function DashboardTab({ onStart, onHelp, runHistory = [], studies = [] }) {
  const finished = runHistory.filter((r) => r.status !== "failed").length;
  const done = studies.filter((s) => s.status === "done" || s.status === "imported").length;
  return (
    <>
      <div className="help-banner">
        <div className="help-banner-text"><b>New here?</b> Click the button on the right to see how STACKR works, step by step.</div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onHelp}>Show me how</button>
      </div>

      <div className="card" style={{ textAlign: "center", padding: "40px 32px", marginBottom: 20, background: "linear-gradient(155deg, var(--primary-light), var(--bg-card))" }}>
        <div className="font-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 10 }}>Plan how your boxes go into one truck</div>
        <div style={{ maxWidth: 560, margin: "0 auto 24px", color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.65 }}>
          STACKR takes your list of boxes and your container size and arranges them with four different methods. It shows where each box goes, which boxes did not fit, and which loading rules each box follows, and it gives you a loading plan you can print.
        </div>
        <button type="button" className="btn btn-primary" style={{ padding: "11px 26px", fontSize: 14 }} onClick={onStart}>Start analysis →</button>
        {(finished > 0 || done > 0) && (
          <div className="field-hint" style={{ marginTop: 14 }}>
            You have {finished} saved run{finished === 1 ? "" : "s"}{done > 0 ? ` and ${done} finished comparison${done === 1 ? "" : "s"}` : ""}.
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 14 }}>THREE EASY STEPS</div>
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <Step n={1} title="Add your boxes" desc="Upload a CSV file, type them in, or try a sample." onClick={onStart} />
        <Step n={2} title="Check and run" desc="Confirm the container and settings, then Run STACKR: all four methods pack your load." onClick={onStart} />
        <Step n={3} title="See the results" desc="Compare the four solutions, see which one is recommended and why, and print a loading guide." onClick={onStart} />
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>What you'll need before you start</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
          <Need n={1}>A list of your boxes: each box's length, width and height (cm), its weight (kg), how much weight it can carry on top (kg), and how many of it there are.</Need>
          <Need n={2}>Optional: a delivery stop for each box (1 to 3; stop 1 is unloaded first), and which boxes need careful handling.</Need>
          <Need n={3}>For your own boxes, the container size: length from the door to the cab × width × height, in cm. 587 × 233 × 220 cm is filled in; change it to match yours.</Need>
        </div>
        <div className="field-hint" style={{ marginTop: 14 }}>No box list yet? Try a sample load from the OR-Library benchmark first.</div>
      </div>
    </>
  );
}
