import React from "react";

const sources = [
  ["csv", "Upload a CSV", "Bring in your manifest or download a template with the required columns."],
  ["typed", "Enter boxes", "Enter dimensions, weights and quantities for each kind of box."],
  ["sample", "Try a sample", "Explore the workflow with a prepared OR-Library load."]
];

export function LoadSourceShortcuts({ onSource }) {
  return (
    <section>
        <h3>Choose a load source</h3>
        <div className="source-grid">
          {sources.map(([key, title, description]) => (
            <button key={key} className="card step-card" onClick={() => onSource(key)}>
              <strong>{title} →</strong><p className="card-desc">{description}</p>
            </button>
          ))}
        </div>
      </section>
  );
}

export default function DashboardTab({ onStart, onSource, studies, onOpenStudy, onHistory }) {
  const recent = [...studies].sort((a, b) => b.id - a.id).slice(0, 3);
  return (
    <div className="home-workspace">
      <section className="card home-intro">
        <div>
          <h2 className="font-display">Plan how your boxes go into one truck</h2>
          <p>Compare four packing methods, inspect the arrangement in 3D and take a box-by-box loading guide to the truck.</p>
          <button className="btn btn-primary" onClick={onStart}>Start analysis →</button>
        </div>
        <ol className="home-sequence">
          <li>Add your boxes</li><li>Check the truck and safety settings</li><li>Compare the packing results</li>
        </ol>
      </section>
      <LoadSourceShortcuts onSource={onSource} />
      <section className="card recent-comparisons">
        <div className="card-head"><h3>Recent comparisons</h3>
          <button className="btn btn-secondary btn-sm" onClick={onHistory}>Run history →</button>
        </div>
        {recent.length ? recent.map(s => (
          <button className="recent-study" key={s.id} onClick={() => onOpenStudy(s.id)}>
            <strong>{s.name || `Comparison #${s.id}`}</strong><span>{s.status} →</span>
          </button>
        )) : <p className="card-desc">Your first comparison will appear here. Choose a load source above to get started, or open Run history to import a saved study.</p>}
      </section>
    </div>
  );
}
