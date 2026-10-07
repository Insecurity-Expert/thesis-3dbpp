// All four methods: one row per method, grouped into the proposed hybrids and
// the baselines, one column per metric of the active tab, and the outputs.
// Under ~640 px the table gives way to one MethodCard per method.
import React from "react";
import RankBadge from "./RankBadge";
import MethodSwatch from "./MethodSwatch";
import MetricValue from "./MetricValue";
import MethodCard from "./MethodCard";
import { METHOD_INFO, HYBRID_METHODS, BASELINE_METHODS } from "../../viewer/resultsMetrics";

const GROUPS = [["PROPOSED HYBRID METHODS", HYBRID_METHODS], ["BASELINE METHODS", BASELINE_METHODS]];

export default function ComparisonTable({ metrics, vals, bests, ranks, invalidNote, onView, onGuide, onRun }) {
  return (
    <>
      <div className="ro-table-card ro-wide">
        <table className="ro-table">
          <thead>
            <tr>
              <th scope="col">Method</th>
              {metrics.map((m) => <th scope="col" key={m.key}>{m.label}</th>)}
              <th scope="col">Output</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map(([title, codes]) => (
              <React.Fragment key={title}>
                <tr className="ro-group"><th scope="rowgroup" colSpan={metrics.length + 2}>{title}</th></tr>
                {codes.map((c) => {
                  const ran = vals[c] && vals[c].ran;
                  return (
                    <tr key={c} className={ranks[c] === 1 ? "top" : ""}>
                      <th scope="row">
                        <div className="ro-row-name">
                          <RankBadge rank={ran ? ranks[c] : null} />
                          <MethodSwatch code={c} />
                          <span>{METHOD_INFO[c].name}</span>
                        </div>
                        {!ran && <button type="button" className="link-btn ro-run-link" onClick={() => onRun(c)}>Run this method</button>}
                      </th>
                      {metrics.map((m) => (
                        <td key={m.key}>
                          <MetricValue metric={m} code={c} vals={vals} best={bests[m.key] || []} size="small"
                            invalidNote={m.timing ? invalidNote : null} />
                        </td>
                      ))}
                      <td className="ro-output">
                        <button type="button" className="btn btn-secondary btn-sm" disabled={!ran} onClick={() => onView(c)}>View Arrangement</button>
                        <button type="button" className="btn btn-primary btn-sm" disabled={!ran} onClick={() => onGuide(c)}>Export Guide</button>
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ro-narrow">
        {GROUPS.map(([title, codes]) => (
          <div key={title} className="ro-narrow-group">
            <div className="ro-section-label">{title}</div>
            {codes.map((c) => (
              <MethodCard key={c} code={c} metrics={metrics} vals={vals} bests={bests} rank={ranks[c]} showSwatch
                invalidNote={invalidNote} onView={() => onView(c)} onGuide={() => onGuide(c)} onRun={() => onRun(c)} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
