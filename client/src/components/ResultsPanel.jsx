// Results — the prototype's Results panel (design/Updated_Prototype.html):
//   "Recommended for this load" (the winner card), the Things to know button,
//   four solution cards (View Solution → View Arrangement → Export Guide),
//   and everything technical behind one "Show all numbers" toggle.
// The recommendation is Chapter 3's composite over THIS load's runs
// (experiments/recommend.py -> stats.composite_scores); every sentence is
// generated from those numbers.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { studiesApi } from "../services/api";
import { METHODS, methodOf } from "../methods";
import { Modal } from "./ui";
import ThingsToKnow from "./ThingsToKnow";
import TradeoffsChart from "./TradeoffsChart";
import CustomLoadBanner, { customLoadOf } from "./CustomLoadBanner";
import StudyResults, { StudyProgress } from "../study/StudyResults";
import { StudySelect } from "../study/CompareTab";

const f1 = (v, d = 1) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d));
const secs = (ms) => (ms == null ? "—" : ms >= 120000 ? `${(ms / 60000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`);
const nameOf = (c) => (methodOf(c) ? methodOf(c).name : c);
const nickOf = (c) => (methodOf(c) ? methodOf(c).nick : "");
const ORD = ["", "first", "second", "third", "fourth"];
const andList = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// 2–3 plain sentences on why, from the computed criteria of this load.
export function whySentences(load) {
  const per = load.composite, cs = load.configurations, top = load.top, t = per[top];
  const rank = (key, better) => 1 + cs.filter((c) => better(per[c][key], t[key])).length;
  const suRank = rank("SU", (a, b) => a > b);
  const bestCsr = Math.max(...cs.map((c) => per[c].CSR));
  const bestCsrC = cs.find((c) => per[c].CSR === bestCsr);
  const out = [];
  // "Same" = equal when shown to one decimal.
  const same = (a, b) => f1(a) === f1(b);
  const maxSU = Math.max(...cs.map((c) => per[c].SU));
  const sharing = cs.filter((c) => same(per[c].SU, maxSU)).length;
  if (same(t.SU, maxSU) && sharing === cs.length) out.push(`All four methods filled the same share of the container: ${f1(t.SU)}% on average.`);
  else if (same(t.SU, maxSU) && sharing > 1) out.push(`It filled as much space as the fullest of the four: ${f1(t.SU)}% of the container on average.`);
  else if (suRank === 1) out.push(`It filled the most space: ${f1(t.SU)}% of the container on average.`);
  else out.push(`It filled ${f1(t.SU)}% of the container on average, the ${ORD[suRank]} most of the four.`);
  if (t.CSR === bestCsr) out.push(`Its boxes followed the loading rules most often: ${f1(t.CSR)}% of all boxes, counting boxes left out as not following.`);
  else if (bestCsr - t.CSR <= 1) out.push(`Its boxes followed the loading rules about as often as the others (${f1(t.CSR)}% of all boxes; best ${f1(bestCsr)}%).`);
  else out.push(`Its boxes followed the loading rules less often than ${nameOf(bestCsrC)}'s (${f1(t.CSR)}% of all boxes against ${f1(bestCsr)}%).`);
  const least = (key) => cs.every((c) => per[c][key] >= t[key]);
  if (least("ET") && least("Rob")) out.push("It also used the least computing time and varied the least between repeat codes.");
  else if (least("ET")) out.push("It also used the least computing time.");
  else if (least("Rob")) out.push("Its results also varied the least between repeat codes.");
  else out.push("It came out ahead once container fill, rule-following, computing time and consistency are weighed equally.");
  return out;
}

function Metric({ k, v, title }) {
  return <div className="metric" title={title}><span>{k}{title ? " ⓘ" : ""}</span><b>{v}</b></div>;
}

function SolutionCard({ code, rep, load, recommended, onView, onGuide }) {
  const [open, setOpen] = useState(false);
  const runs = load.runsOf(code);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return (
    <div className={`card solution-card${recommended ? " recommended" : ""}`} style={{ display: "flex", flexDirection: "column" }}>
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div>
          <div className="card-title">{nameOf(code)}</div>
          <div className="card-desc">{nickOf(code)}</div>
        </div>
        {recommended && <span className="badge badge-primary">Recommended</span>}
      </div>
      <div className="field-hint" style={{ marginTop: 0, marginBottom: 6 }}>Its best run (repeat code {rep.seed}) of {runs.length}</div>
      <Metric k="Container fill" v={`${f1(rep.su_pct)}%`} />
      <Metric k="Rule-following (all boxes)" v={`${f1(rep.csr_all_pct)}%`} title="Share of ALL the boxes in the load that follow the four loading rules. A box that was not loaded counts as not following them." />
      <Metric k="Rule score (loaded boxes)" v={`${f1(rep.csr_placed_pct)}%`} title="Share of the boxes that were loaded that follow the four loading rules. Boxes left out are not counted." />
      <Metric k="Boxes not loaded" v={`${rep.not_loaded} of ${rep.n_items}`} />
      <Metric k="Time" v={rep.cpu_ms != null ? `${secs(rep.cpu_ms)} CPU` : `${secs(rep.wall_ms)}`} title={rep.cpu_ms != null ? `Processor time the run used (${secs(rep.wall_ms)} on the clock while sharing the machine).` : "Wall-clock time."} />
      {open && (
        <div style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.6, color: "var(--text-muted)" }}>
          <div><b>Loaded boxes following each rule:</b> load on top (C3) {f1(rep.C3_pct)}% · fragile (C4) {f1(rep.C4_pct)}% · stable stacking (C5) {f1(rep.C5_pct)}% · unload order (C6) {f1(rep.C6_pct)}%.</div>
          <div><b>All {runs.length} runs of {nameOf(code)}:</b> container fill {f1(mean(runs.map((r) => r.su_pct)))}% on average (from {f1(Math.min(...runs.map((r) => r.su_pct)))}% to {f1(Math.max(...runs.map((r) => r.su_pct)))}%).</div>
          <div>Boxes loaded {rep.placed} of {rep.n_items}. Peak memory {f1(rep.peak_mem_mb, 0)} MB. Wall-clock {secs(rep.wall_ms)}.</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "auto", paddingTop: 12 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Hide solution" : "View Solution"}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onView}>View Arrangement</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onGuide}>Export Guide</button>
      </div>
    </div>
  );
}

function HowDecided({ load, study }) {
  const per = load.composite;
  const lam = study && study.lambdas;
  return (
    <div className="card">
      <div className="card-title">How the recommendation was decided</div>
      <div className="card-desc" style={{ marginBottom: 10 }}>Chapter 3's overall score, computed over this load's {load.n_runs} runs ({load.seeds.length} repeat codes per method) by experiments/stats.py. Each part runs from 0 (worst of the four on this load) to 5 (best). It compares the four methods on this load only — the thesis's statistical conclusion is below.</div>
      <div style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead><tr><th>Method</th><th>Fill (avg)</th><th>Rules, all boxes (avg)</th><th>{load.cost_basis === "cpu" ? "CPU time (avg)" : "Time (avg)"}</th><th>Memory (avg)</th><th>Variation of fill (sd)</th>
            <th>Fill /5</th><th>Rules /5</th><th>Cost /5</th><th>Consistency /5</th><th>Overall /5</th><th>Rank</th></tr></thead>
          <tbody>
            {load.ranking.map((c, i) => (
              <tr key={c} style={{ background: c === load.top ? "var(--primary-light)" : undefined }}>
                <td style={{ fontWeight: 700 }}>{nameOf(c)}</td>
                <td>{f1(per[c].SU)}%</td><td>{f1(per[c].CSR)}%</td><td>{secs(per[c].ET)}</td><td>{f1(per[c].PM, 0)} MB</td><td>{f1(per[c].Rob, 2)}</td>
                <td>{f1(per[c].SU_n * 5, 2)}</td><td>{f1(per[c].CSR_n * 5, 2)}</td><td>{f1((1 - per[c].CC_n) * 5, 2)}</td><td>{f1((1 - per[c].Rob_n) * 5, 2)}</td>
                <td style={{ fontWeight: 800 }}>{f1(per[c].CS * 5, 2)}</td><td>{i + 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul style={{ margin: "10px 0 0 18px", padding: 0, fontSize: 12.5, lineHeight: 1.65, color: "var(--text-muted)" }}>
        <li>{load.formula}; the four criteria (space utilization, constraint satisfaction over all boxes, computational cost, robustness) weigh 0.25 each. Cost = the average of the z-scores of time and memory across the four methods; robustness = the standard deviation of container fill across repeat codes.</li>
        <li>{load.cost_note} {load.memory_note}</li>
        <li>Tie check: {load.tie.rule}.{" "}
          {load.tie.checked
            ? <>Top method with each repeat code left out: {load.tie.replicates.map((r) => `${r.left_out} → ${nameOf(r.top)}`).join(" · ")}.</>
            : "Not enough repeat codes to run it."}</li>
        <li>Representative run of each method (shown on the cards, the 3D viewer and the Loading Guide): {load.representative_rule}.</li>
        <li>Settings every run used: penalty λ {lam ? `${lam.w} / ${lam.f} / ${lam.b} / ${lam.a}` : "—"} (C3 / C4 / C5 / C6), fragile boxes (C4) {study && study.enforce_fragility ? "enforced" : "not enforced"} and stable stacking (C5) {study && study.enforce_support ? "enforced" : "not enforced"} while placing. Not user settings.</li>
      </ul>
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
                <td>{secs(r.cpu_time_ms)}</td><td>{secs(r.exec_time_ms)}</td><td>{f1(r.peak_mem_mb, 0)} MB</td><td>{r.worker_warmup_cpu_ms != null ? secs(r.worker_warmup_cpu_ms) : "—"}</td>
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
  const [rec, setRec] = useState(null);
  const [recErr, setRecErr] = useState(null);
  const [loadKey, setLoadKey] = useState(0);
  const [showThings, setShowThings] = useState(false);
  const [numbers, setNumbers] = useState(openNumbers);
  const [tradeMethod, setTradeMethod] = useState(null);
  const numbersRef = useRef(null);
  const row = studyDoc ? studyDoc.row : null;
  const study = studyDoc ? studyDoc.study : null;
  const stats = studyDoc ? studyDoc.stats : null;
  const done = row && (row.status === "done" || row.status === "imported") && study && stats;

  useEffect(() => {
    setRec(null); setRecErr(null); setLoadKey(0);
    if (!done) return;
    let alive = true;
    studiesApi.recommendation(row.id).then((r) => alive && setRec(r)).catch((e) => alive && setRecErr(e.message));
    return () => { alive = false; };
  }, [done, row && row.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const load = useMemo(() => {
    if (!rec || !rec.loads.length) return null;
    const L = rec.loads[Math.min(loadKey, rec.loads.length - 1)];
    const runs = (study.runs || []).filter((r) => (r.instance_id ?? null) === (L.instance_id ?? null));
    return { ...L, runs, runsOf: (c) => runs.filter((r) => r.configuration === c) };
  }, [rec, loadKey, study]);
  useEffect(() => { if (load && !tradeMethod) setTradeMethod(load.available ? load.top : load.configurations[0]); }, [load, tradeMethod]);

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
      <StudySelect studies={studies} value={selectedStudyId} onChange={onSelectStudy} />
      {rec && rec.loads.length > 1 && (
        <select className="form-input" style={{ width: "auto", paddingLeft: 12 }} value={loadKey} onChange={(e) => { setLoadKey(Number(e.target.value)); setTradeMethod(null); }} aria-label="Which load">
          {rec.loads.map((L, i) => <option key={i} value={i}>{L.instance_id === null ? "Your custom load" : `Test case ${L.instance_id}`}</option>)}
        </select>
      )}
    </div>
  );

  if (!row) {
    return (<>{header}<div className="card" style={{ textAlign: "center", padding: "48px 32px" }}>
      <div className="card-title" style={{ marginBottom: 6 }}>No results yet</div>
      <div className="card-desc">Go to Start analysis, add your boxes and click Run STACKR. The four solutions and the recommendation appear here.</div>
    </div></>);
  }
  if (row.status === "running" || (progress && progress.status === "running")) {
    return (<>{header}<StudyProgress progress={progress} study={study} /></>);
  }
  if (!done) {
    return (<>{header}<div className="alert-danger">This comparison did not finish{progress && progress.error ? `: ${progress.error}` : "."}</div></>);
  }

  const cl = customLoadOf(study);
  const runsPer = load ? Math.round(load.n_runs / load.configurations.length) : null;
  const tie = load && load.available && load.tie && load.tie.is_tie;
  const others = tie ? load.tie.also_top : [];
  const top = load && load.available ? load.top : null;
  const t = top ? load.composite[top] : null;
  const openNumbers2 = () => { setNumbers(true); setTimeout(() => numbersRef.current && numbersRef.current.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  return (
    <div>
      {header}
      {cl && <div style={{ marginBottom: 16 }}><CustomLoadBanner info={cl} /></div>}
      {recErr && <div className="alert-danger" style={{ marginBottom: 16 }}>Could not work out the recommendation: {recErr}</div>}
      {!rec && !recErr && <div className="card" style={{ marginBottom: 16 }}><div className="field-hint">Working out the recommendation…</div></div>}

      {load && (
        <div className="winner-card">
          <div className="winner-inner">
            <div className="winner-tag"><span>★</span><span>Recommended for this load</span></div>
            {top ? (
              <>
                <div className="winner-label">{tie ? `${others.length === 1 ? "Two" : "Several"} methods did about equally well` : "Recommended method"}</div>
                <div className="winner-name">{nameOf(top)}</div>
                <div className="winner-algo">{nickOf(top)}{tie ? ` — together with ${andList(others.map(nameOf))}` : ""}</div>
                <div className="winner-stats">
                  <div><div className="winner-stat-label">Overall score</div><div className="winner-stat-value">{f1(t.CS * 5, 2)} / 5</div></div>
                  <div><div className="winner-stat-label">Container full</div><div className="winner-stat-value">{f1(t.SU)}%</div></div>
                  <div><div className="winner-stat-label">Rules followed</div><div className="winner-stat-value">{f1(t.CSR)}%</div></div>
                  <div><div className="winner-stat-label">{load.cost_basis === "cpu" ? "CPU time" : "Time"}</div><div className="winner-stat-value">{secs(t.ET)}</div></div>
                </div>
                <div className="winner-note">
                  {tie && <b>{others.length === 1 ? "Two" : "Several"} methods did about equally well: {andList([top, ...others].map(nameOf))}. </b>}
                  {whySentences(load).join(" ")}
                </div>
                <div className="winner-small">
                  Averages over this load's {runsPer} runs per method. This compares the four methods on this load; it is not the thesis's statistical conclusion.{" "}
                  <button type="button" onClick={openNumbers2}>How it was decided — Technical details</button>
                </div>
              </>
            ) : (
              <>
                <div className="winner-label">No recommendation for this load</div>
                <div className="winner-note">This comparison can't name one: {load.reason}. The four solutions are still shown below.</div>
                <div className="winner-small"><button type="button" onClick={openNumbers2}>Technical details</button></div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
        <div className="card-desc" style={{ margin: 0 }}>All four solutions below{top ? " — the recommended one is highlighted" : ""}.</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {load && <span className="badge badge-primary" style={{ textTransform: "none" }}>{runsPer} run{runsPer === 1 ? "" : "s"} per method</span>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowThings(true)}>Things to know</button>
        </div>
      </div>

      {load && (
        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          {Object.keys(METHODS).filter((c) => load.representative[c]).map((c) => (
            <SolutionCard key={c} code={c} rep={load.representative[c]} load={load} recommended={c === top}
              onView={() => onViewArrangement({ studyId: row.id, runIndex: load.representative[c].run_index, method: c })}
              onGuide={() => onExportGuide({ studyId: row.id, method: c, loadIndex: loadKey })} />
          ))}
        </div>
      )}

      <div ref={numbersRef} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: numbers ? 18 : 0 }}>
        <div>
          <div className="card-title">Technical details</div>
          <div className="card-desc">How the recommendation was decided, every run's numbers, the trade-offs chart and the thesis statistics (SP1–SP3).</div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNumbers((n) => !n)} aria-expanded={numbers}>{numbers ? "Hide all numbers" : "Show all numbers"}</button>
      </div>

      {numbers && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {load && load.available && <HowDecided load={load} study={study} />}
          {load && !load.available && <div className="card"><div className="card-title">No recommendation</div><div className="card-desc">{load.reason}. Representative run of each method: {load.representative_rule}.</div></div>}
          {load && <RunTable runs={load.runs} />}
          {load && (
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Trade-offs — {nameOf(tradeMethod)}</div>
                  <div className="card-desc">Each dot is one run on this load. Further right = fuller container; higher = more boxes following the rules.</div>
                </div>
                <div className="tabs-inline">
                  {load.configurations.map((c) => <button key={c} type="button" className={tradeMethod === c ? "active" : ""} onClick={() => setTradeMethod(c)}>{nameOf(c)}</button>)}
                </div>
              </div>
              {tradeMethod && <TradeoffsChart runs={load.runsOf(tradeMethod)} methodName={nameOf(tradeMethod)} />}
            </div>
          )}
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>The thesis statistics for this comparison</div>
            <div className="card-desc" style={{ marginBottom: 12 }}>
              The Chapter 3 tests (experiments/stats.py). The outcome badge and the overall ranking need at least two test cases{stats.provenance && stats.provenance.n_instances < 2 ? " — this comparison has one, so its statistical verdict reads \"needs ≥ 2 test cases\"" : ""}.
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
