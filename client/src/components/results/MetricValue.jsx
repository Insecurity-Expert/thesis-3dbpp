// One metric of one method: the value (with the best chip) and its bar.
// Shared by MethodCard and ComparisonTable so both views read the same.
import React from "react";
import MetricBar from "./MetricBar";
import BestChip from "./BestChip";
import { barPercent } from "../../viewer/resultsMetrics";

export function metricAria(metric, value, isBest) {
  const word = metric.higher ? "highest" : "lowest";
  const num = metric.unit === "ms" ? Math.round(value) : Number(value).toFixed(metric.decimals);
  return `${metric.label} ${num} ${metric.aria}${isBest ? `, ${word}` : ""}`;
}

export default function MetricValue({ metric, code, vals, best, size = "large", invalidNote = null }) {
  const v = vals[code];
  const value = v ? v.values[metric.key] : null;
  if (value == null) {
    return <div className={`ro-value ${size} muted`}>{v && v.ran ? "—" : "Not run"}</div>;
  }
  const isBest = best.includes(code);
  return (
    <div className="ro-metric-value">
      <div className={`ro-value ${size}${isBest ? " best" : ""}`}>
        <span>{metric.format(value, v.runs)}</span>
        {isBest && <BestChip higher={metric.higher} compact={size !== "large"} />}
        {invalidNote && <span className="ro-invalid" title={invalidNote}>invalid: parallel runs</span>}
      </div>
      <MetricBar percent={barPercent(metric, code, vals)} best={isBest} ariaLabel={metricAria(metric, value, isBest)} />
    </div>
  );
}
