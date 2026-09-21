import React from "react";
import ConvergenceChart from "./ConvergenceChart";

function StatChip({ label, value, color, subtitle }) {
  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      padding: "20px 24px",
      flex: "1 1 calc(25% - 16px)",
      boxShadow: "var(--shadow)",
      transition: "transform 0.15s ease",
      textAlign: "left"
    }}>
      <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-dim)" }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: "800", color: color || "var(--primary)", marginTop: "4px", lineHeight: 1.1 }}>{value}</div>
      {subtitle && <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>{subtitle}</div>}
    </div>
  );
}

function formatWhen(dateStr) {
  if (!dateStr) return "unknown date";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleString();
}

export default function ResultsTab({
  finalResult,
  runHistory,
  replay,
  strategy,
  wolfSize,
  stats,
  axisUtil,
  chartData,
  maxIter,
  handleExportResultsCSV,
  handleExportReport
}) {
  // What this page describes comes from the result envelope when it has one
  // (a replayed run must not borrow the live UI's strategy or preset).
  const shownStrategy = finalResult?.strategy_label || finalResult?.strategy || finalResult?.params?.strategy || strategy;
  const shownPop  = finalResult?.params?.pop_size ?? wolfSize;
  const shownIter = finalResult?.params?.max_iter ?? maxIter;
  const isRepair = shownStrategy === "Repair-based" || shownStrategy === "REP";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* Replay banner — a saved run must never pass for a live one */}
      {replay && (
        <div role="status" className="replay-banner">
          <span className="replay-banner-tag">SAVED RUN</span>
          <span>
            <b>{replay.strategy}</b>, instance <b>{replay.instance}</b>, seed <b>{replay.seed ?? "random"}</b>, {formatWhen(replay.date)}.
            {replay.label ? <> Label: <b>{replay.label}</b>.</> : null}
            {" "}<b>Not a live run.</b>
            {replay.legacy && <> Saved before full result capture — some metrics unavailable.</>}
          </span>
        </div>
      )}

      {/* Top row header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ fontSize: "18px", fontWeight: "800" }}>Metrics Panel</h3>
          <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>Compare visual layout achievements with mathematical bounds.</span>
        </div>
        {finalResult && (
          <span style={{
            padding: "6px 14px",
            background: "var(--primary-light)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: "700",
            color: "var(--primary)"
          }}>
            {replay ? `Saved run #${String(replay.id).padStart(3, "0")}` : `Run #${String(runHistory.length).padStart(3, "0")}`} - {shownStrategy}
          </span>
        )}
      </div>

      {/* Run Progress Live Bar */}
      {stats && !finalResult && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "10px", padding: "16px 20px", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", marginBottom: "8px" }}>
            <span>Optimization Loop Progress</span>
            <span>{stats.iteration} / {stats.maxIter} Iterations</span>
          </div>
          <div style={{ height: "8px", background: "var(--bg-input)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(stats.iteration / stats.maxIter) * 100}%`, background: "linear-gradient(90deg, var(--primary), #a78bfa)", transition: "width 0.3s ease" }} />
          </div>
        </div>
      )}

      {/* RESULTS METRICS CHIPS */}
      {finalResult ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Summary cards */}
          {(() => {
            const m = finalResult.metrics || {};
            const cd = m.constraint_detail;
            const thesis = cd && cd.C3_weight_pct !== undefined;   // DGWO / MOGWO / SEQ / REP
            const placed = finalResult.placed ?? (finalResult.items ? finalResult.items.length : 0);
            const total  = finalResult.n_items ?? placed;
            if (!thesis) {
              return (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                  <StatChip label="Space Utilization" value={`${Number(m.M1_space_utilization_pct ?? finalResult.volume_util_pct ?? 0).toFixed(1)}%`} color="var(--primary)" subtitle={finalResult.legacy ? "as saved" : "NAB score"} />
                  {finalResult.legacy ? (
                    <StatChip label="Boxes placed" value={`${placed}${finalResult.n_items ? ` / ${finalResult.n_items}` : ""}`} color="var(--text-muted)" subtitle="from saved placements" />
                  ) : (
                    <StatChip label="Optimality Gap" value={`${Number(finalResult.gap_pct ?? 0).toFixed(1)}%`} color={finalResult.gap_pct === 0 ? "var(--green)" : "var(--amber)"} subtitle="vs. lower bound" />
                  )}
                  {!finalResult.legacy && <StatChip label="Dissipation D(X)" value={Number(finalResult.dissipation ?? 0).toFixed(3)} color="var(--text-muted)" subtitle="C1=C2=0.5" />}
                  <StatChip label="Runtime" value={`${Number(finalResult.runtime_s ?? 0).toFixed(1)}s`} color="var(--text-muted)" subtitle={finalResult.legacy ? "as saved" : `${shownIter} iterations`} />
                </div>
              );
            }
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                <StatChip label="Space Utilization (M-1)" value={`${m.M1_space_utilization_pct.toFixed(1)}%`} color="var(--primary)" subtitle="single container, OF-1" />
                <StatChip
                  label="Constraint satisfaction (M-2)"
                  value={`${m.M2_constraint_satisfaction_pct.toFixed(1)}%`}
                  color={isRepair ? "var(--text-muted)" : m.M2_constraint_satisfaction_pct >= 99.99 ? "var(--green)" : "var(--amber)"}
                  subtitle={isRepair ? "100% by construction (repair R1–R5)" : "placed boxes satisfying C3–C6"}
                />
                <StatChip label="Boxes placed" value={`${placed} / ${total}`} color={placed === total ? "var(--green)" : "var(--amber)"} subtitle={`${(100 * placed / Math.max(total, 1)).toFixed(0)}% of the load`} />
                <StatChip label="Execution time (M-3)" value={`${finalResult.runtime_s.toFixed(1)}s`} color="var(--text-muted)" subtitle={`pop ${shownPop ?? "—"} × ${shownIter} iterations`} />
                <StatChip label="Peak memory (M-4)" value={`${(m.M4_peak_memory_mb ?? 0).toFixed(1)} MB`} color="var(--text-muted)" subtitle="tracemalloc peak" />
              </div>
            );
          })()}

          {/* Parameters the optimizer actually ran with — echoed by main_optimizer.py */}
          {finalResult.params && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "16px 24px", boxShadow: "var(--shadow)" }}>
              <h4 className="form-label" style={{ color: "var(--primary)", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "12px" }}>
                Parameters used — as reported by the optimizer
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px", fontSize: "13px" }}>
                {[
                  ["Strategy", finalResult.params.strategy],
                  ["Instance", `${finalResult.params.dataset} #${finalResult.params.instance_id}`],
                  ["Pop size", finalResult.params.pop_size],
                  ["Max iter", finalResult.params.max_iter],
                  ["λ (C3 / C4 / C5 / C6)", [finalResult.params.lambda_w, finalResult.params.lambda_f, finalResult.params.lambda_b, finalResult.params.lambda_a].map((v) => v ?? "—").join(" / ")],
                  ["Enforce C5 / C4", `${finalResult.params.enforce_support ? "on" : "off"} / ${finalResult.params.enforce_fragility ? "on" : "off"}`],
                  ["Seed", finalResult.params.seed ?? "random"],
                ].map(([k, v]) => (
                  <span key={k}><span style={{ color: "var(--text-dim)" }}>{k}:</span> <b style={{ color: "var(--text-main)" }}>{String(v)}</b></span>
                ))}
              </div>
            </div>
          )}

          {/* Per-constraint compliance (M-2a..M-2d) — thesis strategies only */}
          {finalResult.metrics?.constraint_detail?.C3_weight_pct !== undefined && (() => {
            const cd = finalResult.metrics.constraint_detail;
            const rows = [
              { k: "C3", name: "Load-bearing (C3)",   v: cd.C3_weight_pct,     note: "borne mass ≤ LBS × contact area" },
              { k: "C4", name: "Fragility (C4)",      v: cd.C4_fragility_pct,  note: "nothing rests on a fragile box" },
              { k: "C5", name: "Stability (C5)",      v: cd.C5_balance_pct,    note: "≥ 80% base support" },
              { k: "C6", name: "Stop order (C6)",     v: cd.C6_stop_order_pct, note: "no later stop blocks an earlier one" },
            ];
            return (
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
                <h4 className="form-label" style={{ color: "var(--primary)", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}>
                  Constraint compliance — share of placed boxes satisfying each constraint
                </h4>
                {isRepair && (
                  <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "14px", padding: "10px 12px", background: "var(--bg-input)", borderRadius: "8px", lineHeight: 1.5 }}>
                    <b style={{ color: "var(--text-main)" }}>100% by construction.</b> The repair-based configuration relocates or defers every violating box before evaluation (operators R1–R5), so its compliance is guaranteed rather than searched for. The cost shows up in <b>boxes placed</b> and <b>space utilization</b>, not here — compare those columns against the other configurations.
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {rows.map((r) => (
                    <div key={r.k}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                        <span style={{ color: "var(--text-muted)", fontWeight: "600" }}>{r.name} <span style={{ color: "var(--text-dim)", fontWeight: "400" }}>— {r.note}</span></span>
                        <span style={{ fontWeight: "700", color: r.v >= 99.99 ? "var(--green)" : r.v >= 75 ? "var(--amber)" : "var(--red)" }}>{r.v.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: "8px", background: "var(--bg-input)", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, r.v))}%`, background: r.v >= 99.99 ? "var(--green)" : r.v >= 75 ? "var(--amber)" : "var(--red)", transition: "width 0.3s ease" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Main columns: Left Metrics Summary, Right Axis & Chart */}
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "flex-start" }}>

            {/* Left Column (Metrics Summary) */}
            <div style={{ flex: "1 1 380px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
              <h4 className="form-label" style={{ color: "var(--primary)", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "20px" }}>
                Metrics summary
              </h4>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "14px", fontWeight: "600" }}>
                    {finalResult.metrics?.constraint_detail?.C3_weight_pct !== undefined ? "Scalar fitness F(X)" : "Composite score"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "14px" }}>
                      {finalResult.composite_score != null && Number.isFinite(finalResult.composite_score)
                        ? finalResult.composite_score.toFixed(3)
                        : "n/a (Pareto archive)"}
                    </span>
                    {finalResult.composite_score != null && Number.isFinite(finalResult.composite_score) && (
                      <span className="badge badge-success">Good</span>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "14px", fontWeight: "600" }}>NAB (space fill)</span>
                  <span style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "14px" }}>{(Number(finalResult.metrics?.M1_space_utilization_pct ?? finalResult.volume_util_pct ?? 0) / 100).toFixed(3)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "14px", fontWeight: "600" }}>Optimality gap</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "14px" }}>{Number(finalResult.gap_pct ?? 0).toFixed(1)}%</span>
                    <span className={`badge badge-${finalResult.gap_pct === 0 ? 'success' : 'fragile'}`}>
                      {finalResult.gap_pct === 0 ? 'Optimal' : 'Moderate'}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "14px", fontWeight: "600" }}>Fragility violations (C4)</span>
                  <span style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "14px" }}>
                    {finalResult.metrics?.constraint_detail?.C4_fragility_pct !== undefined
                      ? `${(100 - finalResult.metrics.constraint_detail.C4_fragility_pct).toFixed(1)}% of placed`
                      : "—"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "14px", fontWeight: "600" }}>Stop-order violations (C6)</span>
                  <span style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "14px" }}>
                    {finalResult.metrics?.constraint_detail?.C6_stop_order_pct !== undefined
                      ? `${(100 - finalResult.metrics.constraint_detail.C6_stop_order_pct).toFixed(1)}% of placed`
                      : "—"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "14px", fontWeight: "600" }}>CV (consistency)</span>
                  <span style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "14px" }}>{finalResult.metrics?.M5_robustness_su_std != null ? finalResult.metrics.M5_robustness_su_std.toFixed(3) : "n/a (single run)"}</span>
                </div>
              </div>
            </div>

            {/* Right Column (Axis utilization & Convergence Curve) */}
            <div style={{ flex: "2 1 500px", display: "flex", flexDirection: "column", gap: "20px" }}>

              {/* Axis utilization Card */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
                <h4 className="form-label" style={{ color: "var(--primary)", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "16px" }}>
                  Axis utilization
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", marginBottom: "6px" }}>
                      <span>X-axis</span>
                      <span>{axisUtil.x}%</span>
                    </div>
                    <div style={{ height: "8px", background: "var(--bg-input)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${axisUtil.x}%`, backgroundColor: "var(--primary)" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", marginBottom: "6px" }}>
                      <span>Y-axis</span>
                      <span>{axisUtil.y}%</span>
                    </div>
                    <div style={{ height: "8px", background: "var(--bg-input)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${axisUtil.y}%`, backgroundColor: "var(--green)" }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", marginBottom: "6px" }}>
                      <span>Z-axis</span>
                      <span>{axisUtil.z}%</span>
                    </div>
                    <div style={{ height: "8px", background: "var(--bg-input)", borderRadius: "4px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${axisUtil.z}%`, backgroundColor: "var(--amber)" }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Convergence Card */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px", padding: "24px", boxShadow: "var(--shadow)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h4 className="form-label" style={{ color: "var(--primary)", borderBottom: "1px solid var(--border)", paddingBottom: "8px", marginBottom: "0" }}>
                    CONVERGENCE CURVE
                  </h4>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      onClick={handleExportResultsCSV}
                      style={{ padding: "6px 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", cursor: "pointer" }}
                    >
                      Export CSV
                    </button>
                    <button
                      onClick={handleExportReport}
                      style={{ padding: "6px 12px", background: "var(--primary)", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: "700", color: "#ffffff", cursor: "pointer" }}
                    >
                      Export report
                    </button>
                  </div>
                </div>
                <ConvergenceChart data={chartData} lowerBound={finalResult.lower_bound} />
              </div>

            </div>
          </div>

        </div>
      ) : (
        <div style={{ padding: "40px", textAlign: "center", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "12px" }}>
          <span style={{ fontSize: "28px" }}>📊</span>
          <h4 style={{ marginTop: "12px", color: "var(--text-muted)" }}>No Results Available</h4>
          <p style={{ fontSize: "13px", color: "var(--text-dim)", marginTop: "4px" }}>Start the optimizer execution to compile and render metrics.</p>
        </div>
      )}

    </div>
  );
}
