import React from "react";

const sources = [
  ["csv", "Upload a CSV", "Bring in your manifest or download a template with the required columns."],
  ["typed", "Enter boxes", "Enter dimensions, weights and quantities for each kind of box."],
  ["sample", "Try a sample", "Explore the workflow with a prepared OR-Library load."]
];

export default function LoadSourceShortcuts({ onSource }) {
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
