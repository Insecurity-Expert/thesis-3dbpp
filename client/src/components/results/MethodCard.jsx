// One method as a card: rank badge, name, tag pill, one block per metric of
// the active tab, and its two output buttons. Used for the hybrids view and,
// under ~640 px, for every row of the comparison table.
import React from "react";
import RankBadge from "./RankBadge";
import MethodSwatch from "./MethodSwatch";
import MetricValue from "./MetricValue";
import { METHOD_INFO } from "../../viewer/resultsMetrics";

export default function MethodCard({ code, metrics, vals, bests, rank, showSwatch = false, invalidNote = null,
                                     onView, onGuide, onRun }) {
  const info = METHOD_INFO[code];
  const ran = vals[code] && vals[code].ran;
  return (
    <div className={`ro-card${rank === 1 ? " top" : ""}`}>
      <div className="ro-card-head">
        <div className="ro-card-name">
          <RankBadge rank={ran ? rank : null} />
          {showSwatch && <MethodSwatch code={code} />}
          <span>{info.name}</span>
        </div>
        <span className="ro-tag">{info.tag}</span>
      </div>
      {ran ? metrics.map((m) => (
        <div className="ro-card-metric" key={m.key}>
          <div className="ro-label">{m.label}</div>
          <MetricValue metric={m} code={code} vals={vals} best={bests[m.key] || []} invalidNote={m.timing ? invalidNote : null} />
        </div>
      )) : (
        <div className="ro-not-run">
          <div className="ro-value large muted">Not run</div>
          <button type="button" className="link-btn" onClick={onRun}>Run this method</button>
        </div>
      )}
      <div className="ro-card-actions">
        <button type="button" className="btn btn-secondary" disabled={!ran} onClick={onView}>View Arrangement</button>
        <button type="button" className="btn btn-primary" disabled={!ran} onClick={onGuide}>Export Guide</button>
      </div>
    </div>
  );
}
