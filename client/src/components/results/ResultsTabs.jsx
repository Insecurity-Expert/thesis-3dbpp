// Segmented tabs: white pill on a light-grey track (the app's .tabs-inline).
import React from "react";
import { TABS } from "../../viewer/resultsMetrics";

export default function ResultsTabs({ tab, onChange }) {
  return (
    <div className="tabs-inline ro-tabs" role="tablist" aria-label="Results view">
      {TABS.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
