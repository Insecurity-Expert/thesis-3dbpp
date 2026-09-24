// client/src/components/LogisticsTab.jsx — "Start analysis": the prototype's
// three-step wizard (design/Updated_Prototype.html).
//   Step 1  Your boxes     (LoadSources)
//   Step 2  Settings       container, the four methods, the safety rules
//   Step 3  Review & run   facts computed from the load, then Run STACKR
// Every value shown is read from the load, the converter or the server's
// study sizes; controls that cannot work are disabled with a note.
import React from "react";

import { METHODS, methodOf, methodLabel } from "../methods";
import LoadSources from "./LoadSources";
import { CUSTOM_LOAD_LABEL } from "./CustomLoadBanner";
import { fmt as vfmt } from "../study/verdicts";
import { useToast } from "./ui";

const n1 = (v, d = 1) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d });

// "on this machine: DGWO 9.9 s (median of 3) · …" from saved, finished runs
// at exactly this pop x iterations. Nothing measured -> say so.
function timingNote(runs, pop, iter) {
  const by = {};
  for (const r of runs || []) {
    if (r.status === "failed" || r.pop_size !== pop || r.max_iter !== iter || r.runtime_s == null) continue;
    const m = methodOf(r.strategy_code || r.strategy);
    if (!m) continue;
    (by[m.code] = by[m.code] || []).push(Number(r.runtime_s));
  }
  const parts = ["DGWO", "MOGWO", "SEQ", "REP"].filter((c) => by[c]).map((c) => {
    const a = by[c].slice().sort((x, y) => x - y);
    const med = a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
    const txt = med >= 120 ? `${(med / 60).toFixed(1)} min` : `${med.toFixed(1)} s`;
    return `${c} ${txt} (median of ${a.length})`;
  });
  return parts.length ? `on this machine: ${parts.join(" · ")}` : "no timed runs at this size on this machine yet";
}

const STEPS = [
  { n: 1, label: "Your boxes", sub: "Add or pick a load" },
  { n: 2, label: "Settings", sub: "Container & safety rules" },
  { n: 3, label: "Review & run", sub: "Check, then pack" },
];

// Labels fixed by the guided flow; C3 is load-bearing, never a "weight limit".
const RULE_ROWS = [
  ["C3", "Load on top", "a box never carries more than its strength allows"],
  ["C4", "Fragile boxes", "nothing heavy rests on them"],
  ["C5", "Stable stacking", "each box sits on enough support"],
  ["C6", "Unload order", "earlier stops sit nearer the door"],
];

function Review({ label, value, sub, warn }) {
  return (
    <div className="review-item">
      <div className="field-hint" style={{ marginTop: 0 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 3 }}>{value}</div>
      {sub && <div className="field-hint" style={{ marginTop: 2 }}>{sub}</div>}
      {warn && <div style={{ fontSize: 11.5, color: "var(--amber)", marginTop: 4, lineHeight: 1.4 }}>⚠ {warn}</div>}
    </div>
  );
}

export default function LogisticsTab({
  step, setStep,
  containerSpecs, setContainerSpecs,
  running, elapsed,
  // Quick Test (Advanced)
  strategy, setStrategy, preset, setPreset, wolfSize, maxIter, setWolfSizeCustom, setMaxIterCustom,
  seed, setSeed, handleStartRun, handleStopRun, canRun, runHistory = [],
  optimizerReady = { state: "cold" },
  // the load
  wtpackInstances = [], wtpackId = null, setWtpackId = () => {},
  loadSources = {}, selectedLoad = {}, loadFacts = null,
  // Settings -> Review: re-checks a custom load against the container on screen
  onToReview,
  // Run STACKR and the larger comparison sizes
  sizesInfo = null, onRunStackr, studyBusy = false, largerSizes = null, testSettings = null,
}) {
  const toast = useToast();
  const custom = selectedLoad.custom;
  const src = loadSources.source;
  const sampleMeta = loadSources.samples && loadSources.samples.samples
    ? loadSources.samples.samples.find((x) => x.instance_id === loadSources.sampleId) : null;
  const selectedWtpack = wtpackInstances.find((i) => i.instance_id === wtpackId) || null;
  const shownContainer = custom ? null
    : src === "sample" ? (sampleMeta ? sampleMeta.container : null)
    : src === "standard" ? (selectedWtpack ? selectedWtpack.container : null) : null;
  const setDim = (k, v) => setContainerSpecs({ ...containerSpecs, [k]: v });

  const demo = sizesInfo && sizesInfo.sizes ? sizesInfo.sizes.find((s) => s.key === "demo") : null;
  const PRESET_INFO = {
    quick:    { label: "Quick demo", pop: 10, iter: 60 },
    standard: { label: "Standard",   pop: 10, iter: 300 },
    full:     { label: "Full",       pop: 30, iter: 500 },
  };

  // Step 1 is done when the load on screen is ready.
  const step1Ready = custom ? !!selectedLoad.checked
    : src === "sample" ? loadSources.sampleId !== null && loadSources.sampleId !== undefined
    : src === "standard" ? wtpackId !== null : false;
  const containerOk = !custom || ["length", "width", "height"].every((k) => Number(containerSpecs[k]) > 0);
  const canNext = step === 1 ? step1Ready : step === 2 ? containerOk : false;

  const goNext = async () => {
    if (step === 1 && step1Ready) setStep(2);
    else if (step === 2 && containerOk) { if (await onToReview()) setStep(3); }
  };

  const f = loadFacts;       // { boxes, volume_m3, mass_kg, container_volume_m3, n_stops, fragile_count } | null
  const fillPct = f && f.container_volume_m3 ? (100 * f.volume_m3) / f.container_volume_m3 : null;
  const cDims = shownContainer ? [shownContainer.L, shownContainer.W, shownContainer.H]
    : [containerSpecs.length, containerSpecs.width, containerSpecs.height];

  return (
    <div>
      {/* Wizard step indicator */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s.n}>
              {i > 0 && <div className="wiz-line" />}
              <button type="button" className={`wiz-step${step === s.n ? " active" : step > s.n ? " done" : ""}`} style={{ flex: 1 }}
                disabled={running}
                onClick={() => {
                  if (s.n < step) setStep(s.n);
                  else if (s.n === step + 1 && canNext) goNext();
                  else if (s.n > step) toast("Finish the earlier steps first.", "warn");
                }}>
                <div className="wiz-num">{step > s.n ? "✓" : s.n}</div>
                <div><div className="wiz-label">{s.label}</div><div className="wiz-sub">{s.sub}</div></div>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── STEP 1: YOUR BOXES ── */}
      {step === 1 && (
        <div className="wiz-panel">
          <LoadSources wtpackInstances={wtpackInstances} wtpackId={wtpackId} setWtpackId={setWtpackId} running={running} {...loadSources} />
        </div>
      )}

      {/* ── STEP 2: SETTINGS ── */}
      {step === 2 && (
        <div className="wiz-panel">
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <div>
                <div className="card-title">Your container size</div>
                <div className="card-desc">
                  {custom
                    ? "How big is the truck or container you're loading? 587 × 233 × 220 cm is filled in — change it if yours is different. The rear door is the width × height face."
                    : "This sample's own container, from the benchmark. It can't be changed; to use your own container, add your own boxes in Step 1."}
                </div>
              </div>
              {custom && <span className="badge badge-warn" style={{ textTransform: "none" }}>{CUSTOM_LOAD_LABEL}</span>}
            </div>
            <div className="grid grid-4">
              {[["length", "L", "Length, door to cab (cm)"], ["width", "W", "Width (cm)"], ["height", "H", "Height (cm)"]].map(([k, raw, title]) => (
                <div key={k}>
                  <label className="field-label">{title}</label>
                  <input type="number" className="field-input" min="1" aria-label={`Container ${title}`}
                    value={shownContainer ? shownContainer[raw] : containerSpecs[k]}
                    disabled={running || !custom} onChange={(e) => setDim(k, e.target.value)} />
                </div>
              ))}
              <div>
                <label className="field-label">Truck weight limit (kg) — optional</label>
                <input type="number" className="field-input" min="0" placeholder="no limit" aria-label="Truck weight limit (kg)"
                  value={custom ? containerSpecs.max_weight : ""} disabled={running || !custom}
                  onChange={(e) => setDim("max_weight", e.target.value)} />
              </div>
            </div>
            <div className="field-hint" style={{ marginTop: 8 }}>
              {cDims.map((v) => v || "?").join(" × ")} cm (length door-to-cab × width × height).{" "}
              {custom ? "Weight limit: checked after the run, not used for packing." : "A weight limit can be set for your own boxes only."}
            </div>
            {!containerOk && <div className="alert-danger" style={{ marginTop: 10 }}>Each container size must be a number greater than 0.</div>}
            {custom && loadSources.customErrors && loadSources.customErrors.length > 0 && (
              <div className="alert-danger" role="alert" style={{ marginTop: 10 }}>
                <b>Your boxes don't work with this container:</b>
                <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 12.5 }}>{loadSources.customErrors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
              </div>
            )}
          </div>

          <div className="grid grid-2" style={{ alignItems: "start" }}>
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">The four packing methods</div>
                  <div className="card-desc">STACKR runs all four on your load, so there's nothing to pick. The study name comes first, then what the method does.</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.values(METHODS).map((m) => (
                  <div key={m.code} className="strategy-opt on">
                    <span aria-hidden style={{ color: "var(--primary)", fontWeight: 800, marginTop: 1 }}>✓</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{m.name} <span className="field-hint" style={{ fontWeight: 400 }}>— {m.nick}</span></div>
                      <div className="field-hint">{m.how}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Safety rules</div>
                  <div className="card-desc">These four rules are always checked — that's how STACKR is designed.</div>
                </div>
                <span className="lock-pill">🔒 Always on</span>
              </div>
              <div>
                {RULE_ROWS.map(([code, name, what]) => (
                  <div key={code} className="constraint-row locked-constraint" title={code}
                    onClick={() => toast(`"${name}" is always on — it can't be turned off.`, "warn")}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{name}: {what}</div>
                      <div className="field-hint">{code}</div>
                    </div>
                    <label className="switch"><input type="checkbox" checked disabled readOnly aria-label={`${name} (always on)`} /><span className="slider" /></label>
                  </div>
                ))}
                <div className="constraint-row" style={{ borderBottom: "none" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Allow boxes to be turned sideways</div>
                    <div className="field-hint">Coming in a later version. Benchmark boxes turn only as their published data allows; typed and imported boxes stay upright.</div>
                  </div>
                  <label className="switch"><input type="checkbox" checked={false} disabled readOnly aria-label="Allow boxes to be turned sideways (not available)" /><span className="slider" /></label>
                </div>
              </div>
              <div className="field-hint" style={{ marginTop: 10, lineHeight: 1.5 }}>
                Every run checks all four rules. Fragile boxes and stable stacking are enforced while boxes are placed; load on top and unload order are scored, so a result can still break them.
              </div>
            </div>
          </div>

          <details className="collapsible card" style={{ marginTop: 18 }}>
            <summary>Advanced</summary>
            <div style={{ marginTop: 12, maxWidth: 360 }}>
              <label className="field-label">Repeat code (seed) — for Quick Test</label>
              <input type="number" className="field-input" value={seed} disabled={running}
                onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))} placeholder="random" />
              <div className="field-hint">Same code, same load and same settings give the same result. Run STACKR always uses repeat codes {demo ? String(demo.seeds).replace("-", "–") : "—"}, so its results can be repeated too.</div>
            </div>
            {testSettings && <div style={{ marginTop: 16 }}>{testSettings}</div>}
          </details>
        </div>
      )}

      {/* ── STEP 3: REVIEW & RUN ── */}
      {step === 3 && (
        <div className="wiz-panel">
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <div>
                <div className="card-title">Quick check before you pack</div>
                <div className="card-desc">Have a look at what STACKR is about to work with. If anything looks wrong, click "Back" to change it.</div>
              </div>
              {custom && <span className="badge badge-warn" style={{ textTransform: "none" }}>{CUSTOM_LOAD_LABEL}</span>}
            </div>
            {!f ? <div className="field-hint">Reading the load…</div> : (
              <div className="grid grid-3">
                <Review label="Your boxes" value={`${f.boxes} boxes ready`} sub={`From: ${selectedLoad.text}`} />
                <Review label="Total volume and mass" value={`${n1(f.volume_m3, 2)} m³ · ${n1(f.mass_kg)} kg`} />
                <Review label="Load volume" value={fillPct === null ? "—" : `${n1(fillPct)}% of the container`}
                  sub={`container ${cDims.join(" × ")} cm`}
                  warn={fillPct !== null && fillPct > 90 ? "This load nearly fills the container, so some boxes may not fit." : null} />
                <Review label="Stops and fragile boxes" value={`${f.n_stops} stop${f.n_stops === 1 ? "" : "s"} · ${f.fragile_count} fragile`}
                  sub={`${n1((100 * f.fragile_count) / Math.max(f.boxes, 1))}% of the boxes are fragile`} />
                <Review label="Truck weight limit" value={custom && f.max_weight_kg != null ? `${n1(f.max_weight_kg)} kg` : "None"}
                  sub={custom && f.max_weight_kg != null ? "checked after the run, not used for packing" : custom ? "none entered" : "benchmark load — no limit"} />
                <Review label="Time estimate" value={demo && demo.estimate_s != null ? `about ${vfmt.duration(demo.estimate_s)}` : "no estimate yet"}
                  sub={demo && demo.estimate_s != null
                    ? `from ${demo.basis_studies} earlier run${demo.basis_studies === 1 ? "" : "s"} of this size on this machine${custom && demo.basis_boxes ? ` (${Math.round(demo.basis_boxes)}-box loads; yours has ${f.boxes})` : ""}`
                    : "no Run STACKR has finished on this machine yet"} />
              </div>
            )}
          </div>

          <div className="info-callout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>What Run STACKR does</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                {demo
                  ? <>It packs this load with all four methods, {demo.runs / 4} times each (repeat codes {String(demo.seeds).replace("-", "–")}): {demo.runs} runs, up to {demo.workers} at a time. Then Results shows the four solutions side by side and which one is recommended for this load.</>
                  : "Reading the run settings from the server…"}
              </div>
            </div>
          </div>

          <details className="collapsible card" style={{ marginTop: 18 }}>
            <summary>Advanced</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 12 }}>
              <div>
                <div className="card-title">Quick Test</div>
                <div className="card-desc" style={{ marginBottom: 10 }}>One method, one run. No recommendation — use Run STACKR for that. Uses the repeat code from Settings → Advanced.</div>
                <div className="tabs-inline grow" style={{ marginBottom: 8 }}>
                  {["DGWO", "MOGWO", "Sequential", "Repair-based"].map((s) => (
                    <button key={s} type="button" onClick={() => setStrategy(s)} className={strategy === s ? "active" : ""} title={methodLabel(s)} disabled={running}>
                      {methodOf(s) ? methodOf(s).name : s}
                    </button>
                  ))}
                </div>
                <div className="tabs-inline grow" style={{ marginBottom: 6 }}>
                  {Object.entries(PRESET_INFO).map(([key, p]) => (
                    <button key={key} type="button" onClick={() => setPreset(key)} disabled={running} className={preset === key ? "active" : ""}
                      title={`pack size ${p.pop} × ${p.iter} iterations — ${timingNote(runHistory, p.pop, p.iter)}`}>{p.label}</button>
                  ))}
                </div>
                <div className="field-hint" style={{ marginBottom: 10 }}>
                  {preset === "custom" ? `Custom — pack size ${wolfSize} × ${maxIter} iterations. Saved runs are labelled "custom settings".`
                    : `pack size ${PRESET_INFO[preset].pop} × ${PRESET_INFO[preset].iter} iterations · ${timingNote(runHistory, PRESET_INFO[preset].pop, PRESET_INFO[preset].iter)}`}
                </div>
                <div style={{ display: "flex", gap: 12, maxWidth: 420, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label className="field-label">Pack size (wolves, 3–60)</label>
                    <input type="number" className="field-input" min="3" max="60" value={wolfSize} disabled={running} onChange={(e) => setWolfSizeCustom(Number(e.target.value))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="field-label">Iterations (1–2000)</label>
                    <input type="number" className="field-input" min="1" max="2000" value={maxIter} disabled={running} onChange={(e) => setMaxIterCustom(Number(e.target.value))} />
                  </div>
                </div>
                {!running
                  ? <button type="button" className="btn btn-secondary" onClick={handleStartRun} disabled={!canRun}>Quick Test — one run of {methodOf(strategy) ? methodOf(strategy).name : strategy}</button>
                  : <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Running… {elapsed}s</span>
                      <button type="button" className="btn btn-danger-outline btn-sm" onClick={handleStopRun}>■ Stop</button>
                    </div>}
              </div>
              {largerSizes && (
                <div>
                  <div className="card-title">Larger comparisons</div>
                  <div className="card-desc" style={{ marginBottom: 10 }}>More repeat codes or more test cases than Run STACKR. They take much longer.</div>
                  {largerSizes}
                </div>
              )}
            </div>
          </details>
        </div>
      )}

      {/* Persistent nav */}
      <div className="card wiz-nav">
        <div className="field-hint" style={{ margin: 0 }}>All four safety rules are checked in every run.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {step === 3 && (
            <span title={optimizerReady.state === "warm" ? `Compiled in ${(optimizerReady.seconds || 0).toFixed(1)} s` : (optimizerReady.error || "")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700,
                       color: optimizerReady.state === "warm" ? "var(--green)" : optimizerReady.state === "error" || optimizerReady.state === "offline" ? "var(--red)" : "var(--amber)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
              {optimizerReady.state === "warm" ? "Optimizer ready" : optimizerReady.state === "warming" ? "Warming up optimizer…"
                : optimizerReady.state === "error" ? "Optimizer warm-up failed" : optimizerReady.state === "offline" ? "Server offline" : "Optimizer cold"}
            </span>
          )}
          {step > 1 && <button type="button" className="btn btn-secondary" disabled={running} onClick={() => setStep(step - 1)}>← Back</button>}
          {step < 3 && <button type="button" className="btn btn-secondary" disabled={!canNext || running || loadSources.checking} onClick={goNext}>{loadSources.checking ? "Checking…" : "Next →"}</button>}
          {step === 3 && (
            <button type="button" className="btn btn-primary" disabled={studyBusy || running || !f || !demo} onClick={onRunStackr}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              {studyBusy ? "Starting…" : "Run STACKR"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
