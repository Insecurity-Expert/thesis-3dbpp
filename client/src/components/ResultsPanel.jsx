// Results — the comparison of one Run STACKR study on one load.
//   Default view: the two hybrids (Sequential, Repair-Based). "View full
//   comparison (4 configurations)" adds the two baselines. Fixed order,
//   nothing ranked or recommended: per measure the configurations are
//   "level" (gap under 2 percentage points / 2 boxes) or highest / lowest
//   (viewer/comparison.js). Results that follow from a configuration's design
//   are labelled "by design". Each card shows the means over the load's runs
//   and opens its representative run (closest to the median container fill;
//   experiments/representative.py). The statistics are in Technical details.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { studiesApi } from "../services/api";
import { methodOf } from "../methods";
import { Modal } from "./ui";
import ThingsToKnow from "./ThingsToKnow";
import TradeoffsChart from "./TradeoffsChart";
import CustomLoadBanner, { customLoadOf } from "./CustomLoadBanner";
import StudyResults, { StudyProgress } from "../study/StudyResults";
import { StudySelect } from "../study/CompareTab";
import { MEASURES, HYBRIDS, ordered, positions, profiles, pairText, byDesign, baselineNote, fmtVal } from "../viewer/comparison";

const f1 = (v, d = 1) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d));
const nameOf = (c) => (methodOf(c) ? methodOf(c).name : c);
const nickOf = (c) => (methodOf(c) ? methodOf(c).nick : "");
const POS_TEXT = { highest: "highest", lowest: "lowest", level: "level", between: "" };

function Metric({ k, v, title, note }) {
  return (
    <div className="metric" title={title}>
      <span>{k}{title ? " ⓘ" : ""}</span>
      <b>{v}{note && <span className="badge" style={{ marginLeft: 6, textTransform: "none", fontWeight: 600 }} title={note}>by design</span>}</b>
    </div>
  );
}

function SolutionCard({ code, means, rep, seqSplit, onView, onGuide }) {
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
      <Metric k="Boxes loaded" v={`${f1(means.placed)} of ${means.n_items}`} />
      <Metric k="Time" v={means.cpu_ms != null ? `${Math.round(means.cpu_ms)} ms CPU` : `${Math.round(means.wall_ms)} ms`} title={means.cpu_ms != null ? "Average processor time of the runs." : "Average wall-clock time of the runs."} />
      {open && (
        <div style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.6, color: "var(--text-muted)" }}>
          <div><b>Representative run</b> (repeat code {rep.seed}, the run closest to the median container fill, {f1(rep.median_su_pct)}%): container fill {f1(rep.su_pct)}%, boxes loaded {rep.placed} of {rep.n_items}, rule compliance {f1(rep.csr_all_pct)}% of all boxes and {f1(rep.csr_placed_pct)}% of loaded boxes.</div>
          <div><b>Loaded boxes following each rule</b> in that run: load on top (C3) {f1(rep.C3_pct)}% · fragile (C4) {f1(rep.C4_pct)}% · stable stacking (C5) {f1(rep.C5_pct)}% · unload order (C6) {f1(rep.C6_pct)}%.</div>
          <div>Container fill over all {means.n_runs} runs: {f1(means.su_min)}% to {f1(means.su_max)}%. Peak memory {f1(means.peak_mem_mb, 0)} MB on average.</div>
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

function RunTable({ runs }) {
  const order = ["DGWO", "MOGWO", "SEQ", "REP"];
  const rows = runs.slice().sort((a, b) => order.indexOf(a.configuration) - order.indexOf(b.configuration) || a.seed - b.seed);
  return (
    <div className="card">
      <div className="card-title">Every run on this load</div>
      <div className="card-desc" style={{ marginBottom: 10 }}>C3–C6: share of the loaded boxes following each rule. Warm-up: the untimed numba start-up of the run's worker process, not included in its CPU time.</div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead><tr><th>Method</th><th>Repeat code</th><th>Fill</th><th>Rules (all boxes)</th><th>Rules (loaded)</th><th>C3</th><th>C4</th><th>C5</th><th>C6</th><th>Loaded</th><th>CPU</th><th>Wall-clock</th><th>Memory</th><th>Warm-up CPU</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.configuration}-${r.seed}`}>
                <td>{nameOf(r.configuration)}</td><td>{r.seed}</td><td>{f1(r.su_pct, 2)}%</td><td>{f1((r.csr_pct * r.placed) / r.n_items, 2)}%</td><td>{f1(r.csr_pct, 2)}%</td>
                <td>{f1(r.C3_pct)}%</td><td>{f1(r.C4_pct)}%</td><td>{f1(r.C5_pct)}%</td><td>{f1(r.C6_pct)}%</td><td>{r.placed}/{r.n_items}</td>
                <td>{r.cpu_time_ms != null ? Math.round(r.cpu_time_ms) + " ms" : "—"}</td><td>{Math.round(r.exec_time_ms)} ms</td><td>{f1(r.peak_mem_mb, 0)} MB</td><td>{r.worker_warmup_cpu_ms != null ? Math.round(r.worker_warmup_cpu_ms) + " ms" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ResultsPanel({ studies = [], selectedStudyId, onSelectStudy, studyDoc, progress, onViewArrangement, onExportGuide,
                                       compare = null, quickTest = null, openNumbers = false }) {
  const [rep, setRep] = useState(null);
  const [repErr, setRepErr] = useState(null);
  const [loadKey, setLoadKey] = useState(0);
  const [full, setFull] = useState(false);
  const [showThings, setShowThings] = useState(false);
  const [numbers, setNumbers] = useState(openNumbers);
  const [tradeMethod, setTradeMethod] = useState(null);
  const numbersRef = useRef(null);
  const row = studyDoc ? studyDoc.row : null;
  const study = studyDoc ? studyDoc.study : null;
  const stats = studyDoc ? studyDoc.stats : null;
  const done = row && (row.status === "done" || row.status === "imported") && study && stats;

  useEffect(() => {
    setRep(null); setRepErr(null); setLoadKey(0); setFull(false);
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
  useEffect(() => { if (load && !tradeMethod) setTradeMethod(ordered(load.configurations)[0]); }, [load, tradeMethod]);

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
      <StudySelect studies={studies} value={selectedStudyId} onChange={onSelectStudy} />
      {rep && rep.loads.length > 1 && (
        <select className="form-input" style={{ width: "auto", paddingLeft: 12 }} value={loadKey} onChange={(e) => { setLoadKey(Number(e.target.value)); setTradeMethod(null); }} aria-label="Which load">
          {rep.loads.map((L, i) => <option key={i} value={i}>{L.instance_id === null ? "Your custom load" : `Test case ${L.instance_id}`}</option>)}
        </select>
      )}
    </div>
  );

  if (!row) {
    return (<>{header}<div className="card" style={{ textAlign: "center", padding: "48px 32px" }}>
      <div className="card-title" style={{ marginBottom: 6 }}>No results yet</div>
      <div className="card-desc">Go to Start analysis, add your boxes and click Run STACKR. The comparison of the configurations appears here.</div>
    </div></>);
  }
  if (row.status === "running" || (progress && progress.status === "running")) {
    return (<>{header}<StudyProgress progress={progress} study={study} /></>);
  }
  if (!done) {
    return (<>{header}<div className="alert-danger">This comparison did not finish{progress && progress.error ? `: ${progress.error}` : "."}</div></>);
  }

  const cl = customLoadOf(study);
  const all = load ? ordered(load.configurations) : [];
  const hybridsHere = HYBRIDS.every((c) => all.includes(c));
  const shown = full || !hybridsHere ? all : HYBRIDS;
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
                a display rule, not a statistical test (the tests are in Technical details).
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {hybridsHere && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFull((f) => !f)} aria-pressed={full}>
                  {full ? "Back to the hybrid view (2 configurations)" : `View full comparison (${all.length} configurations)`}
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowThings(true)}>Things to know</button>
            </div>
          </div>

          {note && <div className="card-desc" role="note" style={{ marginBottom: 14 }}>{note}</div>}

          <div className={`grid grid-${shown.length}`} style={{ marginBottom: 20 }}>
            {shown.map((c) => (
              <SolutionCard key={c} code={c} means={load.means[c]} rep={load.representative[c]} seqSplit={seqSplit}
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

      <div ref={numbersRef} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: numbers ? 18 : 0 }}>
        <div>
          <div className="card-title">Technical details</div>
          <div className="card-desc">Every run's numbers, the trade-offs chart and the thesis statistics (SP1–SP3).</div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNumbers((n) => !n)} aria-expanded={numbers}>{numbers ? "Hide all numbers" : "Show all numbers"}</button>
      </div>

      {numbers && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {load && <div className="card"><div className="card-desc" style={{ margin: 0 }}>Representative run of each configuration (cards, 3D viewer, Loading Guide): {rep.representative_rule}.</div></div>}
          {load && <RunTable runs={load.runs} />}
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
      )}

      <Modal open={showThings} onClose={() => setShowThings(false)} title="Things to know" desc="How STACKR works, and what it does not model"
        footer={<button type="button" className="btn btn-primary" onClick={() => setShowThings(false)}>Understood</button>}>
        <ThingsToKnow bare studies={studies.filter((s) => s.id === row.id)} />
      </Modal>
    </div>
  );
}
