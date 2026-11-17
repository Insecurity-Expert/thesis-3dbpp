import React from "react";

// Home: a compact start screen. A title, the Start analysis button and the
// three steps. Help stays in the top bar ("How to use").

function Step({ n, title, onClick }) {
  return (
    <button type="button" className="card step-card" onClick={onClick}>
      <div className="badge badge-primary" style={{ marginBottom: 10 }}>Step {n}</div>
      <div className="card-title">{title}</div>
    </button>
  );
}

export default function DashboardTab({ onStart }) {
  return (
    <>
      <div className="card" style={{ textAlign: "center", padding: "40px 32px", marginBottom: 20, background: "linear-gradient(155deg, var(--primary-light), var(--bg-card))" }}>
        <div className="font-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 20 }}>Plan how your boxes go into one truck</div>
        <button type="button" className="btn btn-primary" style={{ padding: "11px 26px", fontSize: 14 }} onClick={onStart}>Start analysis →</button>
      </div>

      <div style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 14 }}>THREE EASY STEPS</div>
      <div className="grid grid-3">
        <Step n={1} title="Add your boxes" onClick={onStart} />
        <Step n={2} title="Check and run" onClick={onStart} />
        <Step n={3} title="See the results" onClick={onStart} />
      </div>
    </>
  );
}
