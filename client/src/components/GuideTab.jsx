// Loading & Unloading Guide — the prototype's Loading Guide panel (help banner,
// method selector, Print button, three pages), built from ONE stored
// solution: by default the recommended method's representative run of the
// comparison on Results. Only what the stored solution determines is shown
// (viewer/guidePlan.js); no geographic destinations.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { runsApi, studiesApi } from "../services/api";
import { METHODS, methodOf, methodLabel } from "../methods";
import { buildGuide, guideCsv } from "../viewer/guidePlan";
import { fmtNum, RULES } from "../viewer/boxInfo";
import GuideViews from "./GuideViews";
import { customLoadOf, CUSTOM_LOAD_LABEL } from "./CustomLoadBanner";
import { useToast } from "./ui";

const nameOf = (c) => (methodOf(c) ? methodOf(c).name : c);
const RULE_ROW = {
  C3: ["Load on top", "a box never carries more than its strength allows"],
  C4: ["Fragile boxes", "nothing rests on a fragile box"],
  C5: ["Static stability / base support", "each box rests on at least 80% support"],
  C6: ["Unload order", "no box for a later stop above it or between it and the door"],
};
const secs = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} s`);

function Page({ n, title, desc, custom, children }) {
  return (
    <div className="card guide-page" style={{ marginBottom: 20 }}>
      <div className="card-head">
        <div>
          <div className="section-tag">Page {n} of 3</div>
          <div className="card-title">{title}</div>
          {desc && <div className="card-desc">{desc}</div>}
        </div>
        {custom && <span className="badge badge-warn" style={{ textTransform: "none" }}>{custom}</span>}
      </div>
      {children}
    </div>
  );
}

function Status({ text }) {
  if (text == null) return <span style={{ color: "var(--text-dim)" }}>not recorded</span>;
  const ok = text === "OK" || / OK$/.test(text);
  return <span style={{ color: ok ? "var(--green)" : "var(--red)", fontWeight: ok ? 500 : 700 }}>{text}</span>;
}

export default function GuideTab({ finalResult, runHistory = [], request = null, studies = [], selectedStudyId = null, studyDoc = null }) {
  const toast = useToast();
  const [rec, setRec] = useState(null);
  const [method, setMethod] = useState(null);
  const [loadIndex, setLoadIndex] = useState(0);
  const [view, setView] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [single, setSingle] = useState("");          // Advanced: "" | "screen" | saved run id
  const [singleResult, setSingleResult] = useState(null);
  const printed = useRef(null);

  const row = studyDoc && studyDoc.row && studyDoc.row.id === selectedStudyId ? studyDoc.row : null;
  const study = row ? studyDoc.study : null;
  const done = row && (row.status === "done" || row.status === "imported") && study;

  // The comparison's recommendation (representative runs per method).
  useEffect(() => {
    setRec(null); setView(null); setErr(null);
    if (!done) return undefined;
    let alive = true;
    studiesApi.recommendation(row.id).then((r) => alive && setRec(r)).catch((e) => alive && setErr(`Could not read the comparison: ${e.message}`));
    return () => { alive = false; };
  }, [done, row && row.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // A request from Results ("Export Guide" on a card) picks the method and load.
  useEffect(() => {
    if (!request) return;
    setSingle("");
    setMethod(request.method || null);
    setLoadIndex(request.loadIndex || 0);
  }, [request]);

  const load = rec && rec.loads.length ? rec.loads[Math.min(loadIndex, rec.loads.length - 1)] : null;
  const top = load && load.available ? load.top : null;
  const shownMethod = method && load && load.representative[method] ? method : top || (load ? load.configurations[0] : null);

  useEffect(() => {
    if (single || !load || !shownMethod) return undefined;
    let alive = true;
    setBusy(true); setView(null); setErr(null);
    studiesApi.runView(row.id, load.representative[shownMethod].run_index)
      .then((v) => alive && setView(v))
      .catch((e) => alive && setErr(`This solution could not be shown: ${e.message}`))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [single, load, shownMethod, row && row.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Advanced: a single saved run (or the Quick Test on screen) instead.
  useEffect(() => {
    if (!single) { setSingleResult(null); return undefined; }
    if (single === "screen") { setSingleResult(finalResult); return undefined; }
    let alive = true;
    runsApi.getRun(single).then((r) => alive && setSingleResult(r.result)).catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [single, finalResult]);

  const shown = single ? singleResult : view;
  const guide = useMemo(() => (shown && Array.isArray(shown.items) ? buildGuide(shown) : null), [shown]);
  const cl = customLoadOf(shown) || customLoadOf(study);
  const customText = cl ? cl.label || CUSTOM_LOAD_LABEL : null;
  const ready = guide && guide.steps.length > 0 && guide.check.ok;

  const exportPrint = () => {
    toast('Opening the print window — choose "Save as PDF" to keep a copy.');
    setTimeout(() => window.print(), 300);
  };
  const exportCsv = () => {
    const name = `STACKR-loading-guide-${shownMethod || "run"}${shown && shown.seed != null ? `-repeat-code-${shown.seed}` : ""}.csv`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([guideCsv(guide, customText)], { type: "text/csv" }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
    toast(`Loading order downloaded as ${name}.`, "ok");
  };

  // "Export Guide" from Results opens the print view once the guide is ready.
  useEffect(() => {
    if (request && request.print && ready && !single && shownMethod === (request.method || shownMethod) && printed.current !== request.at) {
      printed.current = request.at;
      exportPrint();
    }
  });   // eslint-disable-line react-hooks/exhaustive-deps

  const savedRows = (runHistory || []).filter((r) => r.has_result && r.status !== "failed");
  const controls = (
    <div className="no-print">
      <div className="help-banner">
        <div className="help-banner-text"><b>This is your loading plan.</b> Print it and take it to the truck. Page 1 lists the loading and unloading order, Page 2 shows where every box goes, Page 3 summarises the solution.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={!ready}>Download page 1 (CSV)</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={exportPrint} disabled={!ready}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
            Export Guide (print / PDF)
          </button>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <label className="field-label">Which method's plan do you want to see?</label>
          <select className="field-input" style={{ minWidth: 380 }} value={shownMethod || ""} disabled={!load || !!single}
            onChange={(e) => setMethod(e.target.value)}>
            {!load && <option value="">— run STACKR first —</option>}
            {load && Object.keys(METHODS).filter((c) => load.representative[c]).map((c) => (
              <option key={c} value={c}>{methodLabel(c)} — {fmtNum(load.representative[c].su_pct, 1)}% full{c === top ? " · recommended" : ""}</option>
            ))}
          </select>
        </div>
        {rec && rec.loads.length > 1 && (
          <div>
            <label className="field-label">Which load?</label>
            <select className="field-input" value={loadIndex} onChange={(e) => setLoadIndex(Number(e.target.value))}>
              {rec.loads.map((L, i) => <option key={i} value={i}>{L.instance_id === null ? "Your custom load" : `Test case ${L.instance_id}`}</option>)}
            </select>
          </div>
        )}
      </div>
      <details className="collapsible card" style={{ marginBottom: 18 }}>
        <summary>Advanced: a single saved run instead</summary>
        <select className="field-input" style={{ marginTop: 10, maxWidth: 520 }} value={single} onChange={(e) => setSingle(e.target.value === "" || e.target.value === "screen" ? e.target.value : Number(e.target.value))}>
          <option value="">— the comparison's solution (above) —</option>
          <option value="screen" disabled={!finalResult}>The Quick Test on screen{finalResult ? "" : " (none)"}</option>
          {savedRows.map((r) => <option key={r.id} value={r.id}>#{r.id} · {methodLabel(r.strategy_code || r.strategy)} · {r.instance}{r.seed != null ? ` · repeat code ${r.seed}` : ""}</option>)}
        </select>
        <div className="field-hint">A single run has no recommendation; its guide is built the same way.</div>
      </details>
    </div>
  );

  if (err) return <>{controls}<div className="alert-danger">{err}</div></>;
  if (!single && !done) {
    return (<>{controls}<div className="card" style={{ textAlign: "center", padding: "48px 32px", color: "var(--text-dim)", fontSize: 13 }}>
      No plan yet. Run STACKR from Start analysis; the recommended solution's plan appears here.</div></>);
  }
  if (!guide) return <>{controls}<div className="card"><div className="field-hint">{busy || !rec ? "Checking and loading the solution…" : "Pick a solution above."}</div></div></>;
  if (!guide.check.ok) {
    return (<>{controls}<div className="alert-danger"><b>This loading plan failed its own check and is not shown.</b> Every box must be loaded after the boxes it rests on; {guide.check.problems.length} step{guide.check.problems.length === 1 ? "" : "s"} break that, e.g. {guide.check.problems[0]}.</div></>);
  }

  const pv = guide.pv;
  const m = shown.metrics || {};
  const methodCode = single ? (shown.strategy || (shown.params && shown.params.strategy)) : shownMethod;
  const seed = shown.seed ?? (shown.params && shown.params.seed);
  const nItems = pv ? pv.n_items : shown.n_items;
  const container = shown.container || {};
  const w = cl && cl.max_weight_kg != null ? cl : null;
  const packedMass = guide.steps.reduce((a, s) => a + s.mass, 0);

  return (
    <>
      {controls}

      <Page n={1} title="Loading & Unloading Guide" custom={customText}
        desc={single ? "A single saved run (no recommendation)." : null}>
        {!single && (
          <div className="info-callout" style={{ marginBottom: 14, display: "block" }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              {methodCode === top ? "Recommended solution: " : "Solution shown: "}{methodLabel(methodCode)}, repeat code {seed}
            </div>
            <div style={{ fontSize: 12.5, marginTop: 2 }}>
              {top ? (methodCode === top ? "The method recommended for this load on the Results page; this is its best run." : `The method recommended for this load is ${nameOf(top)}; this plan shows ${nameOf(methodCode)}'s best run instead.`)
                : "No method is recommended for this comparison (see Results); this is the selected method's best run."}
            </div>
          </div>
        )}
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-muted)", marginTop: 0 }}>
          <b>Loading:</b> go down the list. Start at the cab end and work toward the rear door, putting floor boxes in first and building up. Positions are in cm: x across the truck, y from the rear door, z above the floor. Sizes are as placed: across × deep × high; the line under each size says which way the box stands.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table compact" style={{ width: "100%", fontSize: 11.5 }}>
            <thead><tr><th>Step</th><th>Box</th><th>Stop</th><th>Size as placed (cm)</th><th>Weight</th><th>Fragile</th><th>Position (x, y, z)</th><th style={{ minWidth: 190 }}>Placement</th><th>Load on top</th><th>Base support</th><th>Unload order</th></tr></thead>
            <tbody>
              {guide.steps.map((s) => (
                <tr key={s.step}>
                  <td className="mono">{s.step}</td><td className="mono" style={{ whiteSpace: "nowrap" }}>{s.label}</td><td>{s.stop}</td>
                  <td style={{ whiteSpace: "nowrap" }}><span className="mono">{s.size}</span><span className="sub">{s.orientationShort ?? "orientation not recorded"}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtNum(s.mass, 1)} kg</td><td>{s.fragile ? <b style={{ color: "var(--amber)" }}>yes</b> : "no"}</td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{s.position}</td>
                  <td>{s.instruction}{s.reachable && <span className="sub" style={{ color: "var(--primary-hover)", fontWeight: 700 }}>{s.reachable}</span>}</td>
                  <td style={{ whiteSpace: "nowrap" }}><Status text={s.c3} /></td><td style={{ whiteSpace: "nowrap" }}><Status text={s.c5} /></td><td><Status text={s.c6} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="field-hint">Checked: every box comes after all the boxes it rests on ({guide.steps.length} boxes).</p>

        <div className="card-title" style={{ marginTop: 18, marginBottom: 6 }}>Unloading order</div>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 0 }}>Stop {guide.stops[0]} first. Within a stop, the reverse of the loading order: nearest the door and topmost first.</p>
        <table className="data-table compact" style={{ fontSize: 11.5 }}>
          <thead><tr><th>#</th><th>Stop</th><th>What to do</th></tr></thead>
          <tbody>{guide.unloading.map((u) => (
            <tr key={u.n}><td className="mono">{u.n}</td><td>{u.stop}</td><td style={{ fontWeight: u.blockers.length ? 700 : 400, color: u.blockers.length ? "var(--red)" : undefined }}>{u.text}</td></tr>
          ))}</tbody>
        </table>

        {nItems != null && nItems - guide.steps.length > 0 && (
          <>
            <div className="card-title" style={{ marginTop: 18, marginBottom: 6 }}>Boxes not loaded ({nItems - guide.steps.length})</div>
            <p style={{ fontSize: 12.5, color: "var(--amber)", marginTop: 0, fontWeight: 700 }}>These did not fit — arrange separate transport.</p>
            {guide.notLoaded.length > 0 ? (
              <table className="data-table" style={{ fontSize: 11.5 }}>
                <thead><tr><th>Box</th><th>Size (L × W × H, cm)</th><th>Weight</th><th>Stop</th></tr></thead>
                <tbody>{guide.notLoaded.map((b) => <tr key={b.id}><td className="mono">{b.label}</td><td className="mono">{b.size ?? "not recorded"}</td><td>{fmtNum(b.mass, 1)} kg</td><td>{b.stop}</td></tr>)}</tbody>
              </table>
            ) : <p className="field-hint">This run did not record which boxes they were.</p>}
          </>
        )}
      </Page>

      <Page n={2} title="Container arrangement" custom={customText}
        desc={`Door and cab end marked; ${fmtNum(container.length_cm ?? container.D)} × ${fmtNum(container.width_cm ?? container.L)} × ${fmtNum(container.height_cm ?? container.H)} cm (length × width × height).`}>
        <GuideViews guide={guide} container={container} />
      </Page>

      <Page n={3} title="Solution summary" custom={customText}>
        <div className="grid grid-2" style={{ gap: 14, fontSize: 13 }}>
          <div><span className="field-hint">Space utilization (container fill)</span><div style={{ fontWeight: 700 }}>{fmtNum(m.M1_space_utilization_pct, 2)}%</div></div>
          <div><span className="field-hint">Boxes loaded</span><div style={{ fontWeight: 700 }}>{guide.steps.length}{nItems != null ? ` of ${nItems}` : ""}</div></div>
          <div><span className="field-hint">Rule-following, all boxes (a box not loaded counts as not following)</span>
            <div style={{ fontWeight: 700 }}>{pv ? `${pv.compliant_placed} of ${pv.n_items} (${fmtNum((100 * pv.compliant_placed) / pv.n_items, 1)}%)` : "—"}</div></div>
          <div><span className="field-hint">Rule score, loaded boxes</span><div style={{ fontWeight: 700 }}>{fmtNum(m.M2_constraint_satisfaction_pct, 2)}%</div></div>
        </div>
        <table className="data-table" style={{ marginTop: 14, fontSize: 12.5 }}>
          <thead><tr><th>Rule</th><th>What it checks</th><th>Boxes breaking it</th><th>Status</th></tr></thead>
          <tbody>{RULES.map((r) => {
            const n = pv ? pv.violating[r] : null;
            return (<tr key={r}><td style={{ fontWeight: 700 }}>{RULE_ROW[r][0]} ({r})</td><td>{RULE_ROW[r][1]}</td><td>{n ?? "not recorded"}</td>
              <td><Status text={n == null ? null : n === 0 ? "OK" : `${n} box${n === 1 ? "" : "es"}`} /></td></tr>);
          })}</tbody>
        </table>
        {w && (
          <p style={{ fontSize: 13, marginTop: 12 }}>
            <b>Truck weight limit:</b> packed weight {fmtNum(packedMass, 1)} kg vs limit {fmtNum(w.max_weight_kg, 1)} kg — {packedMass > w.max_weight_kg ? <span style={{ color: "var(--red)", fontWeight: 700 }}>over the limit</span> : "within the limit"}. Not used for packing.
          </p>
        )}
        <p style={{ fontSize: 13, marginTop: 12 }}><b>Boxes not loaded:</b> {nItems != null ? nItems - guide.steps.length : "—"}.</p>
        <p style={{ fontSize: 13, marginTop: 6, fontWeight: 700 }}>Balance / weight distribution across the truck is not checked by STACKR.</p>
        <details className="collapsible" style={{ marginTop: 12 }}>
          <summary>Technical details (optional)</summary>
          <ul style={{ margin: "8px 0 0 18px", padding: 0, fontSize: 12.5, lineHeight: 1.65, color: "var(--text-muted)" }}>
            <li>Method: {methodLabel(methodCode)}; repeat code (seed) {seed ?? "—"}.</li>
            <li>Preset: {study && study.preset ? `${study.preset.name} (pack size ${study.preset.pop_size} × ${study.preset.max_iter} iterations)` : shown.params ? `pack size ${shown.params.pop_size} × ${shown.params.max_iter} iterations` : "—"}.</li>
            <li>Time: {shown.timing ? `CPU ${secs(shown.timing.cpu_ms)}, wall-clock ${secs(shown.timing.wall_ms)} (${shown.timing.mode} comparison)` : `wall-clock ${shown.runtime_s != null ? `${shown.runtime_s} s` : "—"}`}.</li>
            {!single && load && load.available && <li>Overall scores for this load (0–5): {load.ranking.map((c) => `${nameOf(c)} ${fmtNum(load.composite[c].CS * 5, 2)}`).join(" · ")}.</li>}
          </ul>
        </details>
      </Page>
    </>
  );
}
