// Results and Technical Details — one Run STACKR study on one load.
//   Results (default export) is the Performance Overview: the methods side by
//   side on the selected load, four tabs (Overall, SP1 packing efficiency, SP2
//   safety and delivery order, SP3 computational resources), the two hybrids
//   as cards by default and all four in a table with ?view=all. Numbers, best
//   values and the (descriptive) ranking come from viewer/resultsMetrics.js.
//   Technical Details (TechnicalDetailsPanel) holds everything else: the cards
//   with placed-box compliance and per-constraint rates, the measure-by-measure
//   tables, every run's numbers, the trade-offs chart, the thesis statistics
//   and the Quick Test.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { studiesApi } from "../services/api";
import { methodOf } from "../methods";
import TradeoffsChart from "./TradeoffsChart";
import CustomLoadBanner, { customLoadOf } from "./CustomLoadBanner";
import StudyResults, { StudyProgress } from "../study/StudyResults";
import { MEASURES, HYBRIDS, ordered, positions, profiles, pairText, byDesign, baselineNote, fmtVal } from "../viewer/comparison";
import { timingValid, TIMING_INVALID_SHORT, TIMING_INVALID_NOTE } from "../study/timing";
import MethodCard from "./results/MethodCard";
import ComparisonTable from "./results/ComparisonTable";
import ResultsTabs from "./results/ResultsTabs";
import { METHOD_ORDER, HYBRID_METHODS, methodValues, metricsFor, bestFor, ranksFor, runCountText, criterionText } from "../viewer/resultsMetrics";

const f1 = (v, d = 1) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d));
const nameOf = (c) => (methodOf(c) ? methodOf(c).name : c);
const nickOf = (c) => (methodOf(c) ? methodOf(c).nick : "");
const POS_TEXT = { highest: "highest", lowest: "lowest", level: "level", between: "" };

function Metric({ k, v, title, note, invalid }) {
  return (
    <div className="metric" title={title}>
      <span>{k}{title ? " ⓘ" : ""}</span>
      <b>{v}{note && <span className="badge" style={{ marginLeft: 6, textTransform: "none", fontWeight: 600 }} title={note}>by design</span>}
        {invalid && <span className="badge" style={{ marginLeft: 6, textTransform: "none", fontWeight: 600, color: "var(--amber)" }} title={TIMING_INVALID_NOTE}>{TIMING_INVALID_SHORT}</span>}</b>
    </div>
  );
}

// The four loading rules, each as the share of loaded boxes that follow it and
// the share of all boxes (a box left out counts as not following it). C4 and C5
// are enforced while boxes are placed, so every loaded box follows them by design.
const RULES = [
  ["C3", "Load on top", "A box never carries more than its strength allows."],
  ["C4", "Fragile boxes", "Nothing heavy rests on a fragile box. Enforced while boxes are placed."],
  ["C5", "Stable stacking", "Each box sits on enough support. Enforced while boxes are placed."],
  ["C6", "Unload order", "Boxes for earlier stops sit nearer the door."],
];

function RuleRows({ means }) {
  if (means.C3_pct == null) return null;      // representatives computed before the per-rule means
  const num = { textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, padding: "3px 0 3px 10px" };
  const head = { ...num, fontWeight: 500, color: "var(--text-dim)", fontSize: 11 };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, margin: "4px 0 8px" }}>
      <thead>
        <tr>
          <th style={{ ...head, textAlign: "left", padding: "3px 0" }}>Each rule</th>
          <th style={head} title="Share of the loaded boxes that follow the rule.">Loaded ⓘ</th>
          <th style={head} title="Share of all the boxes in the load that follow the rule; a box that was not loaded counts as not following it.">All boxes ⓘ</th>
        </tr>
      </thead>
      <tbody>
        {RULES.map(([code, name, what]) => {
          const enforced = code === "C4" || code === "C5";
          return (
            <tr key={code} style={{ borderTop: "1px dashed var(--border)" }} title={enforced ? `${what} So every loaded box follows it by design.` : what}>
              <td style={{ padding: "3px 0", color: "var(--text-muted)" }}>{name} ({code}){enforced && <sup title="Enforced while boxes are placed: every loaded box follows it by design."> †</sup>}</td>
              <td style={num}>{f1(means[`${code}_pct`])}%</td>
              <td style={num}>{f1(means[`${code}_all_pct`])}%</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr><td colSpan={3} className="field-hint" style={{ paddingTop: 4 }}>† Enforced while boxes are placed, so every loaded box follows it by design.</td></tr>
      </tfoot>
    </table>
  );
}

function SolutionCard({ code, means, rep, seqSplit, timingOk = true, onView, onGuide }) {
  const [open, setOpen] = useState(false);
  const notes = byDesign(code, means, seqSplit);
  return (
    <div className="card solution-card" style={{ display: "flex", flexDirection: "column" }}>
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div>
          <div className="card-title">{nameOf(code)}</div>
          <div className="card-desc">{nickOf(code)}</div>
        </div>
      </div>
      {notes.card && <div className="field-hint" style={{ marginTop: 0, marginBottom: 6 }}><span className="badge" style={{ textTransform: "none" }}>by design</span> {notes.card.replace(/^by design: /, "")}</div>}
      <div className="field-hint" style={{ marginTop: 0, marginBottom: 6 }}>Averages over its {means.n_runs} run{means.n_runs === 1 ? "" : "s"} on this load</div>
      <Metric k="Container fill" v={`${f1(means.su_pct)}%`} />
      <Metric k="Rule compliance, all boxes" v={`${f1(means.csr_all_pct)}%`} title="Share of ALL the boxes in the load that follow the four loading rules. A box that was not loaded counts as not following them." />
      <Metric k="Rule compliance, loaded boxes" v={`${f1(means.csr_placed_pct)}%`} title="Share of the loaded boxes that follow the four loading rules. Boxes left out are not counted." note={notes.csr_placed_pct} />
      <RuleRows means={means} />
      <Metric k="Boxes loaded" v={`${f1(means.placed)} of ${means.n_items}`} />
      <Metric k="Time" v={means.cpu_ms != null ? `${Math.round(means.cpu_ms)} ms CPU` : `${Math.round(means.wall_ms)} ms`} title={means.cpu_ms != null ? "Average processor time of the runs." : "Average wall-clock time of the runs."} invalid={!timingOk} />
      {open && (
        <div style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.6, color: "var(--text-muted)" }}>
          <div><b>Representative run</b> (repeat code {rep.seed}, the run closest to the median container fill, {f1(rep.median_su_pct)}%): container fill {f1(rep.su_pct)}%, boxes loaded {rep.placed} of {rep.n_items}, rule compliance {f1(rep.csr_all_pct)}% of all boxes and {f1(rep.csr_placed_pct)}% of loaded boxes.</div>
          <div><b>Loaded boxes following each rule</b> in that run: load on top (C3) {f1(rep.C3_pct)}% · fragile (C4) {f1(rep.C4_pct)}% · stable stacking (C5) {f1(rep.C5_pct)}% · unload order (C6) {f1(rep.C6_pct)}%.</div>
          <div>Container fill over all {means.n_runs} runs: {f1(means.su_min)}% to {f1(means.su_max)}%. Peak memory {f1(means.peak_mem_mb, 0)} MB on average{timingOk ? "" : ` (${TIMING_INVALID_SHORT})`}.</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "auto", paddingTop: 12 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Hide details" : "Details"}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onView}>View Arrangement</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onGuide}>Export Guide</button>
      </div>
    </div>
  );
}

// Hybrid view: Sequential vs Repair-Based, measure by measure.
function HybridTable({ means }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead><tr><th>Measure</th>{HYBRIDS.map((c) => <th key={c}>{nameOf(c)}</th>)}<th>Difference</th></tr></thead>
        <tbody>
          {MEASURES.map((m) => (
            <tr key={m.key}>
              <td title={m.hint}>{m.label}{m.hint ? " ⓘ" : ""}</td>
              {HYBRIDS.map((c) => {
                const note = byDesign(c, means[c])[m.key];
                return <td key={c}>{fmtVal(m, means[c][m.key])}{note && <span className="badge" style={{ marginLeft: 6, textTransform: "none" }} title={note}>by design</span>}</td>;
              })}
              <td>{pairText(means, "SEQ", "REP", m, nameOf)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Full view: four configurations, each measure's highest / lowest / level.
function FullTable({ means, codes }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead><tr><th>Measure</th>{codes.map((c) => <th key={c}>{nameOf(c)}</th>)}</tr></thead>
        <tbody>
          {MEASURES.map((m) => {
            const p = positions(means, codes, m);
            return (
              <tr key={m.key}>
                <td title={m.hint}>{m.label}{m.hint ? " ⓘ" : ""}</td>
                {codes.map((c) => {
                  const note = byDesign(c, means[c])[m.key];
                  return (
                    <td key={c}>
                      {fmtVal(m, means[c][m.key])}
                      {POS_TEXT[p[c]] && <span className="field-hint" style={{ marginLeft: 6 }}>{POS_TEXT[p[c]]}</span>}
                      {note && <span className="badge" style={{ marginLeft: 6, textTransform: "none" }} title={note}>by design</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Profiles({ means, codes }) {
  const pr = profiles(means, codes);
  const list = (xs) => (xs.length ? xs.join(", ") : "none");
  return (
    <div className={`grid grid-${codes.length}`} style={{ gap: 12 }}>
      {codes.map((c) => (
        <div key={c} className="card" style={{ padding: 14 }}>
          <div className="card-title" style={{ fontSize: 14 }}>{nameOf(c)}</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-muted)", marginTop: 6 }}>
            <div><b>Highest on:</b> {list(pr[c].highest)}</div>
            <div><b>Lowest on:</b> {list(pr[c].lowest)}</div>
            <div><b>Level on:</b> {list(pr[c].level)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RunTable({ runs, timingOk = true }) {
  const order = ["DGWO", "MOGWO", "SEQ", "REP"];
  const flag = timingOk ? "" : " *";
  const rows = runs.slice().sort((a, b) => order.indexOf(a.configuration) - order.indexOf(b.configuration) || a.seed - b.seed);
  return (
    <div className="card">
      <div className="card-title">Every run on this load</div>
      <div className="card-desc" style={{ marginBottom: 10 }}>C3–C6: share of the loaded boxes following each rule. Warm-up: the untimed numba start-up of the run's worker process, not included in its CPU time.{timingOk ? "" : " * CPU, wall-clock and memory: " + TIMING_INVALID_NOTE}</div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead><tr><th>Method</th><th>Repeat code</th><th>Fill</th><th>Rules (all boxes)</th><th>Rules (loaded)</th><th>C3</th><th>C4</th><th>C5</th><th>C6</th><th>Loaded</th><th>CPU</th><th>Wall-clock</th><th>Memory</th><th>Warm-up CPU</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.configuration}-${r.seed}`}>
                <td>{nameOf(r.configuration)}</td><td>{r.seed}</td><td>{f1(r.su_pct, 2)}%</td><td>{f1((r.csr_pct * r.placed) / r.n_items, 2)}%</td><td>{f1(r.csr_pct, 2)}%</td>
                <td>{f1(r.C3_pct)}%</td><td>{f1(r.C4_pct)}%</td><td>{f1(r.C5_pct)}%</td><td>{f1(r.C6_pct)}%</td><td>{r.placed}/{r.n_items}</td>
                <td>{r.cpu_time_ms != null ? Math.round(r.cpu_time_ms) + " ms" + flag : "—"}</td><td>{Math.round(r.exec_time_ms)} ms{flag}</td><td>{f1(r.peak_mem_mb, 0)} MB{flag}</td><td>{r.worker_warmup_cpu_ms != null ? Math.round(r.worker_warmup_cpu_ms) + " ms" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// The selected study, its representative runs and the chosen load.
function useStudyLoad(studyDoc) {
  const [rep, setRep] = useState(null);
  const [repErr, setRepErr] = useState(null);
  const [loadKey, setLoadKey] = useState(0);
  const row = studyDoc ? studyDoc.row : null;
  const study = studyDoc ? studyDoc.study : null;
  const stats = studyDoc ? studyDoc.stats : null;
  const done = row && (row.status === "done" || row.status === "imported") && study && stats;

  useEffect(() => {
    setRep(null); setRepErr(null); setLoadKey(0);
    if (!done) return;
    let alive = true;
    studiesApi.representatives(row.id).then((r) => alive && setRep(r)).catch((e) => alive && setRepErr(e.message));
    return () => { alive = false; };
  }, [done, row && row.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const load = useMemo(() => {
    if (!rep || !rep.loads.length) return null;
    const L = rep.loads[Math.min(loadKey, rep.loads.length - 1)];
    const runs = (study.runs || []).filter((r) => (r.instance_id ?? null) === (L.instance_id ?? null));
    return { ...L, runs, runsOf: (c) => runs.filter((r) => r.configuration === c) };
  }, [rep, loadKey, study]);
  return { rep, repErr, loadKey, setLoadKey, load, row, study, stats, done };
}

function Header({ studies, selectedStudyId, onSelectStudy, rep, loadKey, onLoad }) {
  // No study picker on Results (Run History -> Studies opens another
  // study); only a multi-load study needs this header, for the load picker.
  if (!(rep && rep.loads.length > 1)) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
      {rep && rep.loads.length > 1 && (
        <select className="form-input" style={{ width: "auto", paddingLeft: 12 }} value={loadKey} onChange={(e) => onLoad(Number(e.target.value))} aria-label="Which load">
          {rep.loads.map((L, i) => <option key={i} value={i}>{L.instance_id === null ? "Your custom load" : `Test case ${L.instance_id}`}</option>)}
        </select>
      )}
    </div>
  );
}

// Shared states before a study's numbers are available. null when they are.
function notReady({ row, progress, study, done, header, emptyExtra = null }) {
  if (!row) {
    return (<>{header}<div className="card" style={{ textAlign: "center", padding: "48px 32px" }}>
      <div className="card-title" style={{ marginBottom: 6 }}>No results yet</div>
      <div className="card-desc">Go to Start analysis, add your boxes and click Run STACKR. The comparison of the configurations appears here.</div>
    </div>{emptyExtra}</>);
  }
  if (row.status === "running" || (progress && progress.status === "running")) {
    return (<>{header}<StudyProgress progress={progress} study={study} /></>);
  }
  if (!done) {
    return (<>{header}<div className="alert-danger">This comparison did not finish{progress && progress.error ? `: ${progress.error}` : "."}</div></>);
  }
  return null;
}

function shownCodes(load, full) {
  const all = load ? ordered(load.configurations) : [];
  const hybridsHere = HYBRIDS.every((c) => all.includes(c));
  return { all, hybridsHere, shown: full || !hybridsHere ? all : HYBRIDS };
}

function ViewToggle({ all, hybridsHere, full, setFull }) {
  if (!hybridsHere) return null;
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFull((f) => !f)} aria-pressed={full}>
      {full ? "Back to the hybrid view (2 configurations)" : `View full comparison (${all.length} configurations)`}
    </button>
  );
}

// ── Results: Performance Overview ────────────────────────────────────────────
// Descriptive comparison of the methods on ONE load (means over its runs,
// viewer/resultsMetrics.js). Hybrids view: two cards; comparison view (?view=all):
// all four in a table. Ranking is a reading aid, never a statistical test.
function SkeletonCards() {
  return (
    <div className="ro-cards" aria-busy="true" aria-label="Loading the results">
      {[0, 1].map((i) => (
        <div key={i} className="ro-card">
          <div className="ro-skel" style={{ height: 26, width: "55%" }} />
          {[0, 1, 2].map((j) => (
            <div key={j}><div className="ro-skel" style={{ height: 12, width: "35%", marginBottom: 8 }} /><div className="ro-skel" style={{ height: 26, width: "25%", marginBottom: 8 }} /><div className="ro-skel" style={{ height: 6 }} /></div>
          ))}
          <div className="ro-skel" style={{ height: 36 }} />
        </div>
      ))}
    </div>
  );
}

export default function ResultsPanel({ studies = [], selectedStudyId, onSelectStudy, studyDoc, progress, onViewArrangement, onExportGuide,
                                       full = false, setFull = () => {}, onOpenTechnical = null, hasQuickTest = false,
                                       onStartAnalysis = null }) {
  const [tab, setTab] = useState("overall");          // kept when switching views
  const [scrollToTable, setScrollToTable] = useState(false);
  const tableRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { rep, repErr, loadKey, setLoadKey, load, row, study, stats, done } = useStudyLoad(studyDoc);

  // The view lives in the URL (?view=all) so it survives a refresh.
  const firstSync = useRef(true);
  useEffect(() => {
    const urlAll = searchParams.get("view") === "all";
    if (firstSync.current) {
      firstSync.current = false;
      if (urlAll !== full) { setFull(urlAll); return; }
    }
    if (urlAll === full) return;
    const p = new URLSearchParams(searchParams);
    if (full) p.set("view", "all"); else p.delete("view");
    setSearchParams(p, { replace: true });
  }, [full]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (full && scrollToTable && tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollToTable(false);
    }
  }, [full, scrollToTable]);

  const vals = useMemo(() => methodValues(load ? load.runs : [], METHOD_ORDER), [load]);

  const header = <Header studies={studies} selectedStudyId={selectedStudyId} onSelectStudy={onSelectStudy} rep={rep} loadKey={loadKey} onLoad={setLoadKey} />;
  const quickHint = hasQuickTest && onOpenTechnical ? (
    <div className="card" style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div className="card-desc" style={{ margin: 0 }}>Your Quick Test result (one run, one seed) is in Technical Details.</div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenTechnical}>Open Technical Details</button>
    </div>
  ) : null;
  const early = notReady({ row, progress, study, done, header, emptyExtra: quickHint });
  if (early) return early;

  const cl = customLoadOf(study);
  const timingOk = timingValid(study, stats);
  const invalidNote = timingOk ? null : TIMING_INVALID_NOTE;
  const metrics = metricsFor(tab);
  const bests = Object.fromEntries(metrics.map((m) => [m.key, m.timing && !timingOk ? [] : bestFor(m, vals)]));
  const rank = ranksFor(tab, vals, { timingOk });
  const ranks = rank.ranks || {};
  const nRan = METHOD_ORDER.filter((c) => vals[c].ran).length;
  const crit = criterionText(rank);
  const caption = crit
    ? `Ranked by ${crit} on this load${tab === "overall" && !timingOk ? " (time and memory left out: these runs shared the CPU)" : ""}. Not a statistical test — see Technical Details for significance results.`
    : tab === "sp3" && !timingOk && nRan > 1 ? "Not ranked: these runs shared the CPU (parallel), so their time and memory are not comparable." : null;

  const view = (c) => load && load.representative[c] && onViewArrangement({ studyId: row.id, runIndex: load.representative[c].run_index, method: c });
  const guide = (c) => onExportGuide({ studyId: row.id, method: c, loadIndex: loadKey });
  const run = () => (onStartAnalysis ? onStartAnalysis() : null);
  // Hybrid cards in rank order; unranked / tied keep the fixed order.
  const cardOrder = HYBRID_METHODS.slice().sort((a, b) => (ranks[a] ?? 99) - (ranks[b] ?? 99));

  return (
    <div>
      {header}
      {cl && <div style={{ marginBottom: 16 }}><CustomLoadBanner info={cl} /></div>}
      {repErr && <div className="alert-danger" style={{ marginBottom: 16 }}>Could not read the comparison: {repErr}</div>}

      <div className="ro-head">
        <div>
          <div className="ro-title">Performance Overview</div>
          <div className="ro-sub">
            {full ? "All four methods on this load." : "How our two proposed hybrid methods performed on this load."} {runCountText(vals)}
          </div>
        </div>
        {full && (
          <button type="button" className="btn ro-btn-outline" onClick={() => setFull(false)}>Hide comparison <span aria-hidden="true">⌃</span></button>
        )}
      </div>

      <ResultsTabs tab={tab} onChange={setTab} />
      {caption ? <div className="ro-caption">{caption}</div> : <div style={{ height: 14 }} />}

      {!rep && !repErr ? <SkeletonCards /> : load && (
        <>
          {nRan === 1 && <div className="ro-note">Only one method was run on this load, so nothing is ranked or marked best.</div>}
          {!full ? (
            <>
              <div className="ro-section-label">Proposed hybrid methods</div>
              <div className="ro-cards">
                {cardOrder.map((c) => (
                  <MethodCard key={c} code={c} metrics={metrics} vals={vals} bests={bests} rank={ranks[c]} invalidNote={invalidNote}
                    onView={() => view(c)} onGuide={() => guide(c)} onRun={run} />
                ))}
              </div>
              <div className="ro-banner">
                <div>
                  <b>See how they compare with DGWO and MOGWO</b>
                  <div className="ro-sub">DGWO and MOGWO are the baseline methods. Each one also has View Arrangement and Export Guide.</div>
                </div>
                <button type="button" className="btn ro-btn-dark" onClick={() => { setFull(true); setScrollToTable(true); }}>
                  Compare All Methods <span aria-hidden="true">⌄</span>
                </button>
              </div>
            </>
          ) : (
            <div ref={tableRef}>
              <ComparisonTable metrics={metrics} vals={vals} bests={bests} ranks={ranks} invalidNote={invalidNote}
                onView={view} onGuide={guide} onRun={run} />
            </div>
          )}
        </>
      )}

      <div className="ro-footer">
        <div className="ro-legend">
          <span className="ro-legend-key">Green ✓ = best value in that {full ? "column" : "row"}</span>
          <span>Fragility and stability are guaranteed for every loaded box.</span>
        </div>
        {onOpenTechnical && <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenTechnical}>Open Technical Details →</button>}
      </div>
    </div>
  );
}

// ── Technical Details: everything the summary leaves out, unchanged ─────────
export function TechnicalDetailsPanel({ studies = [], selectedStudyId, onSelectStudy, studyDoc, progress, onViewArrangement, onExportGuide,
                                        full = false, setFull = () => {}, compare = null, quickTest = null }) {
  const [tradeMethod, setTradeMethod] = useState(null);
  const { rep, repErr, loadKey, setLoadKey, load, row, study, stats, done } = useStudyLoad(studyDoc);
  useEffect(() => { if (load && !tradeMethod) setTradeMethod(ordered(load.configurations)[0]); }, [load, tradeMethod]);
  const header = <Header studies={studies} selectedStudyId={selectedStudyId} onSelectStudy={onSelectStudy} rep={rep} loadKey={loadKey}
    onLoad={(k) => { setLoadKey(k); setTradeMethod(null); }} />;
  const early = notReady({ row, progress, study, done, header, emptyExtra: quickTest ? <div style={{ marginTop: 20 }}>{quickTest}</div> : null });
  if (early) return early;

  const cl = customLoadOf(study);
  const { all, hybridsHere, shown } = shownCodes(load, full);
  const runsPer = load ? Math.round(load.n_runs / Math.max(1, load.configurations.length)) : null;
  const note = load && hybridsHere && !full ? baselineNote(load.means, nameOf) : null;
  const seqSplit = (rep && rep.seq_budget_split) || (study && study.seq_budget_split);

  return (
    <div>
      {header}
      {cl && <div style={{ marginBottom: 16 }}><CustomLoadBanner info={cl} /></div>}
      {repErr && <div className="alert-danger" style={{ marginBottom: 16 }}>Could not read the comparison: {repErr}</div>}
      {!rep && !repErr && <div className="card" style={{ marginBottom: 16 }}><div className="field-hint">Reading the comparison…</div></div>}

      {load && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="card-title" style={{ fontSize: 18 }}>
                {full || !hybridsHere ? `Full comparison (${all.length} configurations)` : "Hybrid configurations: Sequential and Repair-Based"}
              </div>
              <div className="card-desc" style={{ margin: 0 }}>
                Averages over {runsPer} run{runsPer === 1 ? "" : "s"} per configuration on this load. "Level" means the gap is under 2 percentage points (fill, compliance) or 2 boxes;
                a display rule, not a statistical test (the tests are further down this page).
              </div>
            </div>
            <ViewToggle all={all} hybridsHere={hybridsHere} full={full} setFull={setFull} />
          </div>

          {note && <div className="card-desc" role="note" style={{ marginBottom: 14 }}>{note}</div>}

          <div className={`grid grid-${shown.length}`} style={{ marginBottom: 20 }}>
            {shown.map((c) => (
              <SolutionCard key={c} code={c} means={load.means[c]} rep={load.representative[c]} seqSplit={seqSplit} timingOk={timingValid(study, stats)}
                onView={() => onViewArrangement({ studyId: row.id, runIndex: load.representative[c].run_index, method: c })}
                onGuide={() => onExportGuide({ studyId: row.id, method: c, loadIndex: loadKey })} />
            ))}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">{full || !hybridsHere ? "Measures, configuration by configuration" : "Sequential and Repair-Based, measure by measure"}</div>
            <div className="card-desc" style={{ marginBottom: 10 }}>
              {full || !hybridsHere
                ? "Highest / lowest: within 2 percentage points (2 boxes) of the top / bottom value on that measure. Level: every gap under that."
                : "Level: the gap is under 2 percentage points (2 boxes)."}
            </div>
            {full || !hybridsHere ? <FullTable means={load.means} codes={shown} /> : <HybridTable means={load.means} />}
          </div>

          {(full || !hybridsHere) && (
            <div style={{ marginBottom: 20 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>Where each configuration is highest and lowest</div>
              <Profiles means={load.means} codes={shown} />
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {load && <div className="card"><div className="card-desc" style={{ margin: 0 }}>Representative run of each configuration (cards, 3D viewer, Loading Guide): {rep.representative_rule}.</div></div>}
        {load && <RunTable runs={load.runs} timingOk={timingValid(study, stats)} />}
        {load && (
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Trade-offs within {nameOf(tradeMethod)}</div>
                <div className="card-desc">Each dot is one run of this configuration on this load. Further right = fuller container; higher = more boxes following the rules. Pick a configuration to see its runs; configurations are not compared on this chart.</div>
              </div>
              <div className="tabs-inline">
                {all.map((c) => <button key={c} type="button" className={tradeMethod === c ? "active" : ""} onClick={() => setTradeMethod(c)}>{nameOf(c)}</button>)}
              </div>
            </div>
            {tradeMethod && <TradeoffsChart runs={load.runsOf(tradeMethod)} methodName={nameOf(tradeMethod)} />}
          </div>
        )}
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>The thesis statistics for this comparison</div>
          <div className="card-desc" style={{ marginBottom: 12 }}>
            The Chapter 3 tests (experiments/stats.py). They need at least two test cases{stats.provenance && stats.provenance.n_instances < 2 ? " — this comparison has one, so it is described, not tested" : ""}.
          </div>
          <StudyResults row={row} study={study} stats={stats} progress={progress} onOpenCompare={null} />
        </div>
        {compare}
        {quickTest}
      </div>
    </div>
  );
}
