import React from "react";

const ConvergenceChart = React.memo(function ConvergenceChart({ data: rawData, lowerBound: rawLowerBound }) {
  // Thesis strategies stream best_su / best_csr (no bins). Map SU onto the
  // left axis and CSR onto the right one so the chart geometry is reused as-is.
  const thesis = !!(rawData && rawData.length && rawData[0].bins === undefined && rawData[0].su !== undefined);
  const data = thesis
    ? rawData.map((d) => ({ iter: d.iter, bins: +(d.su * 100).toFixed(2), composite: d.csr }))
    : rawData;
  const lowerBound = thesis ? null : rawLowerBound;
  const leftLabel  = thesis ? "Best SU (%)" : "Bins used";
  const rightLabel = thesis ? "Best CSR (%)" : "Composite score";

  if (!data || !data.length) {
    return (
      <div style={{
        padding: 24, textAlign: "center", color: "var(--text-dim)",
        background: "var(--bg-input)", borderRadius: 8, border: "1px solid var(--border)"
      }}>
        No data available yet. Start the optimizer to see the convergence curve.
      </div>
    );
  }

  const W = 620, H = 200;
  const PAD = { t: 16, r: 56, b: 36, l: 44 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  // ── Bins axis (left, integer) ──────────────────────────────────────────────
  const allBins   = data.map((d) => d.bins);
  const minBins   = Math.min(...allBins);
  const maxBins   = Math.max(...allBins);
  // Always give bins axis at least 1 unit of range so toYBins never divides by 0
  const binsRange = Math.max(maxBins - minBins, 1);

  const toYBins = (b) =>
    PAD.t + innerH - ((b - minBins) / binsRange) * innerH;

  // ── Composite axis (right, float) ─────────────────────────────────────────
  const allComp   = data.map((d) => d.composite).filter((v) => v != null && isFinite(v));
  const hasComp   = allComp.length > 0;
  const minComp   = hasComp ? Math.min(...allComp) : 0;
  const maxComp   = hasComp ? Math.max(...allComp) : 1;
  // Always give composite axis at least a small range
  const compRange = Math.max(maxComp - minComp, 0.001);

  const toYComp = (c) =>
    PAD.t + innerH - ((c - minComp) / compRange) * innerH;

  // ── X mapping ─────────────────────────────────────────────────────────────
  const maxIter = Math.max(...data.map((d) => d.iter), 1);
  const toX     = (iter) => PAD.l + (iter / maxIter) * innerW;

  // ── Paths ─────────────────────────────────────────────────────────────────
  const binsPts  = data.map((d) => `${toX(d.iter)},${toYBins(d.bins)}`).join(" ");
  const compPts  = hasComp
    ? data
        .filter((d) => d.composite != null && isFinite(d.composite))
        .map((d) => `${toX(d.iter)},${toYComp(d.composite)}`)
        .join(" ")
    : null;

  // Lower bound line on bins axis
  const lbY = lowerBound != null ? toYBins(Math.max(lowerBound, minBins)) : null;

  // ── Y-axis ticks ──────────────────────────────────────────────────────────
  // Bins: just the distinct integer values that actually appear
  const binsTickSet = [...new Set(allBins)].sort((a, b) => a - b);
  // If only one value, add ±1 to show context
  const binsTicks = thesis
    ? [...new Set([0, 1, 2, 3].map((i) => +(minBins + (binsRange / 3) * i).toFixed(1)))]
    : binsTickSet.length === 1
      ? [binsTickSet[0] - 1, binsTickSet[0], binsTickSet[0] + 1]
      : binsTickSet;

  // Composite: 4 evenly spaced ticks
  const compTicks = hasComp
    ? [...new Set([0, 1, 2, 3].map((i) => +(minComp + (compRange / 3) * i).toFixed(2)))]
    : [];

  // ── X-axis ticks (5 evenly spaced) ────────────────────────────────────────
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxIter));

  const lastBin  = data.at(-1);
  const lastComp = hasComp ? data.filter((d) => d.composite != null).at(-1) : null;

  return (
    <div style={{
      background: "var(--bg-input)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "16px 8px 8px", boxShadow: "var(--shadow)"
    }}>
      {/* Legend */}
      <div style={{ display: "flex", gap: 20, paddingLeft: PAD.l, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="var(--primary)" strokeWidth="2.5" /></svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)" }}>{leftLabel}</span>
        </div>
        {hasComp && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="var(--amber)" strokeWidth="2" strokeDasharray="4 2" /></svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)" }}>{rightLabel}</span>
          </div>
        )}
        {lbY !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="var(--green)" strokeWidth="1.5" strokeDasharray="6 3" /></svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)" }}>Lower bound</span>
          </div>
        )}
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>

        {/* ── Horizontal grid lines (from bins ticks) ── */}
        {binsTicks.map((v) => (
          <line key={`hg-${v}`}
            x1={PAD.l} y1={toYBins(v)} x2={W - PAD.r} y2={toYBins(v)}
            stroke="var(--border)" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
        ))}

        {/* ── Left Y-axis: Bins ── */}
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + innerH}
          stroke="var(--border)" strokeWidth={1} />
        {binsTicks.map((v) => (
          <g key={`lt-${v}`}>
            <line x1={PAD.l - 4} y1={toYBins(v)} x2={PAD.l} y2={toYBins(v)}
              stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 7} y={toYBins(v) + 4} textAnchor="end"
              fill="var(--primary)" fontSize={10} fontWeight="700">{v}</text>
          </g>
        ))}
        <text x={12} y={PAD.t + innerH / 2} textAnchor="middle"
          fill="var(--primary)" fontSize={10} fontWeight="700"
          transform={`rotate(-90, 12, ${PAD.t + innerH / 2})`}>
          {leftLabel}
        </text>

        {/* ── Right Y-axis: Composite ── */}
        {hasComp && (
          <>
            <line x1={W - PAD.r} y1={PAD.t} x2={W - PAD.r} y2={PAD.t + innerH}
              stroke="var(--border)" strokeWidth={1} />
            {compTicks.map((v) => (
              <g key={`rt-${v}`}>
                <line x1={W - PAD.r} y1={toYComp(v)} x2={W - PAD.r + 4} y2={toYComp(v)}
                  stroke="var(--border)" strokeWidth={1} />
                <text x={W - PAD.r + 7} y={toYComp(v) + 4} textAnchor="start"
                  fill="var(--amber)" fontSize={10} fontWeight="700">{v}</text>
              </g>
            ))}
            <text x={W - 10} y={PAD.t + innerH / 2} textAnchor="middle"
              fill="var(--amber)" fontSize={10} fontWeight="700"
              transform={`rotate(90, ${W - 10}, ${PAD.t + innerH / 2})`}>
              Composite
            </text>
          </>
        )}

        {/* ── X-axis ── */}
        <line x1={PAD.l} y1={PAD.t + innerH} x2={W - PAD.r} y2={PAD.t + innerH}
          stroke="var(--border)" strokeWidth={1} />
        {xTicks.map((v) => (
          <g key={`xt-${v}`}>
            <line x1={toX(v)} y1={PAD.t + innerH} x2={toX(v)} y2={PAD.t + innerH + 4}
              stroke="var(--border)" strokeWidth={1} />
            <text x={toX(v)} y={PAD.t + innerH + 14} textAnchor="middle"
              fill="var(--text-dim)" fontSize={9} fontWeight="600">{v}</text>
          </g>
        ))}
        <text x={PAD.l + innerW / 2} y={H - 2} textAnchor="middle"
          fill="var(--text-dim)" fontSize={10} fontWeight="600">
          Iteration
        </text>

        {/* ── Lower bound reference ── */}
        {lbY !== null && (
          <>
            <line x1={PAD.l} y1={lbY} x2={W - PAD.r} y2={lbY}
              stroke="var(--green)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.85} />
            <text x={W - PAD.r - 4} y={lbY - 4} textAnchor="end"
              fill="var(--green)" fontSize={9} fontWeight="700">
              LB = {lowerBound}
            </text>
          </>
        )}

        {/* ── Composite line (draw before bins so bins is on top) ── */}
        {compPts && (
          <polyline points={compPts} fill="none"
            stroke="var(--amber)" strokeWidth={2} strokeDasharray="5 2" opacity={0.85} />
        )}
        {lastComp && (
          <circle cx={toX(lastComp.iter)} cy={toYComp(lastComp.composite)}
            r={3.5} fill="var(--amber)" />
        )}

        {/* ── Bins line ── */}
        <polyline points={binsPts} fill="none"
          stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round" />
        {lastBin && (
          <circle cx={toX(lastBin.iter)} cy={toYBins(lastBin.bins)}
            r={4.5} fill="var(--primary)" />
        )}

      </svg>
    </div>
  );
});

export default ConvergenceChart;
