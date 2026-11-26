import React from "react";
import logo from "../logo.png";

// Home: a compact start screen. A title, the Start analysis button and the
// three steps. Help stays in the top bar ("How to use").

function Step({ n, title, description, onClick }) {
  return (
    <button type="button" title="Open the analysis wizard" className="card step-card" onClick={onClick}>
      <div className="badge badge-primary" style={{ marginBottom: 10 }}>Step {n}</div>
      <div className="card-title">{title}</div><p className="card-desc">{description}</p>
    </button>
  );
}

export default function DashboardTab({ onStart }) {
  return (
    <>
      <div className="card" style={{ textAlign: "left", padding: "28px clamp(16px, 4vw, 48px)", marginBottom: 20, background: "linear-gradient(155deg, var(--primary-light), var(--bg-card))" }}>
        <img src={logo} alt="" style={{float: "right", width: "clamp(52px, 10vw, 120px)", marginLeft: 12}} />
        <div className="font-display" style={{ fontSize: 26, fontWeight: 600, marginBottom: 20 }}>Plan how your boxes go into one truck</div>
        <button type="button" title="Choose the boxes for your load" className="btn btn-primary" style={{ padding: "11px 26px", fontSize: 14 }} onClick={onStart}>Start analysis →</button>
      </div>

      <div style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", color: "var(--text-dim)", marginBottom: 14 }}>THREE EASY STEPS</div>
      <div className="grid grid-3">
        <Step n={1} title="Add your boxes" description="Upload a CSV, enter boxes by hand, or start with a sample load." onClick={onStart} />
        <Step n={2} title="Check and run" description="Review the truck dimensions and compare four packing methods." onClick={onStart} />
        <Step n={3} title="See the results" description="Inspect the arrangement in 3D and follow the loading guide." onClick={onStart} />
      </div>
    </>
  );
}
