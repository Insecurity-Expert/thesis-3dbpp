// Thin horizontal bar under a metric value. percent: 0-100 (already scaled by
// the caller); best -> the green "best" fill, otherwise the muted lavender.
import React from "react";

export default function MetricBar({ percent, best = false, ariaLabel }) {
  const w = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="ro-bar" role="img" aria-label={ariaLabel}>
      <div className={`ro-bar-fill${best ? " best" : ""}`} style={{ width: `${w}%` }} />
    </div>
  );
}
