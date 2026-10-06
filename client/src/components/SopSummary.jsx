// SOP Summary: the answers to SP1–SP3 first, one row per specific problem.
// The model (viewer/sopSummary.js) decides every mark and sentence; this file
// only draws it. A mark is never colour alone: "Best" / "About the same" (or
// "No significant difference") is written next to the value.
import React from "react";

function Mark({ status, statusText }) {
  if (!status) return null;
  return (
    <span className={`sop-mark sop-mark-${status}`}>
      <span aria-hidden="true">{status === "best" ? "✓" : "≈"}</span> {statusText[status]}
    </span>
  );
}

export function SopSummary({ model, nameOf, title = "SOP Summary", desc }) {
  const { codes, rows, statusText } = model;
  return (
    <div className="card sop-summary" role="region" aria-label={title}>
      <div className="card-title" style={{ fontSize: 18 }}>{title}</div>
      {desc && <div className="card-desc" style={{ marginBottom: 10 }}>{desc}</div>}
      <div style={{ overflowX: "auto" }}>
        <table className="data-table sop-table">
          <thead>
            <tr>
              <th>Specific problem</th>
              <th>Measure shown</th>
              {codes.map((c) => <th key={c}>{nameOf(c)}</th>)}
              <th>Better is</th>
            </tr>
          </thead>
          {rows.map((row) => (
            <tbody key={row.id} className="sop-group">
              {row.measures.map((m, i) => (
                <tr key={m.key}>
                  {i === 0 && (
                    <td rowSpan={row.measures.length} className="sop-problem">
                      <b>{row.id}</b> {row.title}
                    </td>
                  )}
                  <td className="sop-measure">{m.label}{m.invalid && <span className="badge badge-warn" style={{ marginLeft: 6, textTransform: "none" }}>invalid: parallel runs</span>}</td>
                  {codes.map((c) => {
                    const cell = m.cells[c];
                    return (
                      <td key={c} className={cell.status ? `sop-cell sop-cell-${cell.status}` : "sop-cell"}
                        title={cell.sd != null ? `mean ${cell.text}, run-to-run SD ${Number(cell.sd).toFixed(2)}` : undefined}>
                        <span className="sop-value">{cell.text}</span>
                        <Mark status={cell.status} statusText={statusText} />
                      </td>
                    );
                  })}
                  {i === 0 && <td rowSpan={row.measures.length} className="sop-better">{row.better}</td>}
                </tr>
              ))}
              {(row.note || row.sentence) && (
                <tr className="sop-sentence-row">
                  <td colSpan={codes.length + 3}>
                    {row.sentence && <div className="sop-sentence">{row.sentence}</div>}
                    {row.note && <div className="sop-note">{row.note}</div>}
                  </td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
      </div>
      {model.note && <div className="field-hint sop-footnote" role="note">{model.note}</div>}
    </div>
  );
}

// Container fill and all-box rule compliance per configuration: one small
// panel per measure (same 0–100% scale), the marked bar green, the rest grey.
export function SopChart({ model, nameOf }) {
  const pick = (key) => model.rows.flatMap((r) => r.measures).find((m) => m.key === key);
  const panels = [pick("su"), pick("csr_all")].filter(Boolean);
  return (
    <div className="card sop-chart">
      <div className="card-title" style={{ fontSize: 14 }}>Container fill and rule compliance (all boxes)</div>
      <div className="card-desc" style={{ marginBottom: 10 }}>Mean per configuration, 0–100%. Green: marked in the summary above.</div>
      <div className="sop-chart-panels">
        {panels.map((m) => (
          <figure key={m.key} className="sop-chart-panel" aria-label={m.label}>
            <figcaption>{m.label}</figcaption>
            {model.codes.map((c) => {
              const cell = m.cells[c];
              const w = cell.value == null ? 0 : Math.max(0, Math.min(100, cell.value));
              return (
                <div key={c} className="sop-bar-row" title={`${nameOf(c)}: ${cell.text}${cell.status ? ` (${model.statusText[cell.status]})` : ""}`}>
                  <span className="sop-bar-label">{nameOf(c)}</span>
                  <span className="sop-bar-track">
                    <span className={`sop-bar${cell.status ? ` sop-bar-${cell.status}` : ""}`} style={{ width: `${w}%` }} />
                  </span>
                  <span className="sop-bar-value">{cell.text}{cell.status && <span className="sop-bar-mark"> {model.statusText[cell.status]}</span>}</span>
                </div>
              );
            })}
          </figure>
        ))}
      </div>
    </div>
  );
}
