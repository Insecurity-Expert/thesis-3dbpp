// client/src/components/LoadSources.jsx — wizard Step 1 "Your boxes"
// (design/Updated_Prototype.html): three ways to give STACKR boxes.
//   Upload your own dataset   a CSV -> preprocessing/custom_load.py (custom load)
//   Type in your boxes        rows  -> the same converter (custom load)
//   Try a sample              OR-Library benchmark: ready-made samples and the
//                             thesis's standard test cases (not custom loads)
// The format explanation is generated from the converter's schema
// (preprocessing/load_info.py), and every validation message comes from the
// converter itself. Custom loads are always labelled as such.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { customLoadsApi } from "../services/api";
import { CUSTOM_LOAD_LABEL } from "./CustomLoadBanner";

export const CHOICES = [
  { key: "csv",    label: "Upload your own dataset" },
  { key: "typed",  label: "Type in your boxes" },
  { key: "sample", label: "Try a sample" },
];
// "Try a sample" covers two sources.
export const choiceOf = (source) => (source === "standard" ? "sample" : source);

export const COLUMNS = [
  { key: "name",     title: "Box name",             type: "text",   width: 130 },
  { key: "stop",     title: "Stop",                 type: "number", width: 60 },
  { key: "length",   title: "Length (cm)",          type: "number", width: 80 },
  { key: "width",    title: "Width (cm)",           type: "number", width: 80 },
  { key: "height",   title: "Height (cm)",          type: "number", width: 80 },
  { key: "weight",   title: "Weight (kg)",          type: "number", width: 80 },
  { key: "max_load", title: "Max load on top (kg)", type: "number", width: 110 },
  { key: "qty",      title: "Qty",                  type: "number", width: 60 },
  { key: "fragile",  title: "Handle with care",     type: "check",  width: 80 },
];

let _rowKey = 0;
export const blankRow = () => ({ key: ++_rowKey, name: "", stop: "", length: "", width: "", height: "", weight: "", max_load: "", qty: "1", fragile: false });

const num = (v) => { const x = Number(v); return v !== "" && v !== null && Number.isFinite(x) ? x : null; };
const fmt = (v, d = 1) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
const inputStyle = { width: "100%", padding: "7px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--bg-card)", color: "var(--text-main)", fontSize: 13, fontWeight: 600, outline: "none" };

async function downloadTemplate(mode) {
  const text = await customLoadsApi.template(mode);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = `stackr_boxes_${mode}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// "delivery_sequence" -> "Delivery Sequence"
const titleCase = (k) => k.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const parseCsv = (text) => String(text || "").trim().split(/\r?\n/).map((l) => l.split(","));

// ── The format explanation, generated from the converter's schema ──────────
function FormatHelp({ schema, error }) {
  if (error) return <div className="alert-danger" style={{ marginBottom: 12 }}>Could not load the format description: {error}</div>;
  if (!schema) return <div className="field-hint" style={{ marginBottom: 12 }}>Loading the file format…</div>;
  const stop = schema.columns.find((c) => c.key === "stop");
  const stopNames = stop ? stop.aliases.filter((a) => a !== "stop" && a !== "delivery_stop").map(titleCase) : [];
  const example = parseCsv(schema.template);
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="info-callout" style={{ marginBottom: 12, display: "block" }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>What your file needs</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          A CSV file with one row per kind of box and these columns (the first row holds the column names):
        </div>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead><tr><th>Column</th><th>Needed?</th><th>What to put in it</th></tr></thead>
            <tbody>
              {schema.columns.map((c) => (
                <tr key={c.key}>
                  <td style={{ fontWeight: 700 }}>{c.title}</td>
                  <td>{c.required ? "Required" : "Optional"}</td>
                  <td>{c.type} — {c.rule}{c.key === "stop" && stopNames.length > 0 ? `. The column may also be called ${stopNames.map((n) => `“${n}”`).join(", ")}.` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul style={{ margin: "10px 0 0 18px", padding: 0, fontSize: 12.5, lineHeight: 1.65 }}>
          <li>Sizes are in centimetres (cm) and weights in kilograms (kg). Sizes, weights and max load are positive numbers; Qty is a whole number.</li>
          <li>Stops: 1 to {schema.stop_count}, where stop 1 is unloaded first. Either every row has a stop or none does; if none do, STACKR assigns balanced stops.</li>
          <li>“Max load on top” is how many kg can rest on the top of the box.</li>
          <li>“Handle with care” is optional: “yes” marks a box as fragile, so nothing may rest on it.</li>
          <li>Up to {schema.max_boxes} boxes in total, after Qty.</li>
          <li>Boxes are kept upright: the height always stays vertical.</li>
          <li>Any other column is ignored, and you'll see a note saying so.</li>
        </ul>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>A small example (this is the template)</div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadTemplate("simple")}>Download the template</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="custom-table" style={{ fontSize: 12 }}>
          <thead><tr>{example[0].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{example.slice(1).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── Invalid Dataset (the prototype's invalid-dataset panel) ────────────────
function InvalidDataset({ errors, notes, onDiscard, onCancel }) {
  return (
    <div className="invalid-panel" role="alert">
      <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--red)", marginBottom: 4 }}>Invalid Dataset</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 8 }}>
        The uploaded dataset does not meet the required format or contains invalid data.
      </div>
      <ul style={{ margin: "0 0 12px 18px", padding: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--text-main)" }}>
        {errors.map((e, i) => <li key={i}>{e.message}</li>)}
      </ul>
      {notes && notes.length > 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>{notes.join(" ")}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDiscard}>Discard Dataset</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ErrorList({ errors }) {
  if (!errors || !errors.length) return null;
  return (
    <div className="alert-danger" role="alert" style={{ marginTop: 12 }}>
      <b>These boxes can't be used yet — {errors.length} problem{errors.length === 1 ? "" : "s"}:</b>
      <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 12.5, lineHeight: 1.55 }}>
        {errors.map((e, i) => <li key={i}>{e.message}</li>)}
      </ul>
    </div>
  );
}

// ── The short "ready" summary (boxes, stops, fragile) ──────────────────────
export function LoadReady({ boxes, stops, fragile, custom, notes = [], warnings = [], stale = false, extra = null }) {
  return (
    <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: stale ? "var(--amber-light)" : "var(--green-light)", border: `1px solid ${stale ? "var(--amber)" : "var(--green)"}`, fontSize: 12.5, lineHeight: 1.6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <b style={{ color: stale ? "var(--amber)" : "var(--green)" }}>{stale ? "Changed since it was checked — it will be checked again" : "✓ Ready"}</b>
        {custom && <span className="badge badge-warn" style={{ textTransform: "none" }}>{CUSTOM_LOAD_LABEL}</span>}
      </div>
      <div><b>{boxes ?? "—"}</b> boxes · <b>{stops ?? "—"}</b> stops · <b>{fragile ?? "—"}</b> fragile</div>
      {extra}
      {notes.map((n) => <div key={n} style={{ color: "var(--text-muted)" }}>{n}</div>)}
      {warnings.map((w) => <div key={w} style={{ color: "var(--amber)" }}>⚠ {w}</div>)}
    </div>
  );
}

function FragileShareOption({ share, setShare, disabled }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={share.on} disabled={disabled} onChange={(e) => setShare({ ...share, on: e.target.checked })} />
        Also mark the weakest share as fragile
      </label>
      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", opacity: share.on ? 1 : 0.5 }}>
        target
        <input type="number" min="1" max="99" value={share.target} disabled={disabled || !share.on}
          onChange={(e) => setShare({ ...share, target: e.target.value })} style={{ ...inputStyle, width: 64, padding: "4px 6px" }} />%
      </label>
      <span style={{ color: "var(--text-dim)" }}>
        the thesis's type-level rule: box types ranked weakest first, cut at the type boundary closest to the target. A "Handle with care" tick always wins.
      </span>
    </div>
  );
}

function CustomAdvanced({ fragileShare, setFragileShare, running }) {
  return (
    <details className="collapsible" style={{ marginTop: 12 }}>
      <summary>Advanced</summary>
      <FragileShareOption share={fragileShare} setShare={setFragileShare} disabled={running} />
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>
        Advanced CSV: adds Type ID, L/W/H flag (0/1: may that side point up) and LBS L/W/H (kg/cm²), used exactly as given.{" "}
        <button type="button" className="link-btn" onClick={() => downloadTemplate("advanced")}>Download the advanced template</button>
      </div>
    </details>
  );
}

export default function LoadSources({
  source, setSource, running, stopCount = 3,
  wtpackInstances = [], wtpackId, setWtpackId,
  samples, sampleId, setSampleId,
  typedRows, setTypedRows, fragileShare, setFragileShare, csvFile, setCsvFile,
  customLoad, customStale, customErrors, customNotes = [], checking, onCheck,
  onDiscard, onCancel,
}) {
  const fileRef = useRef(null);
  const [schema, setSchema] = useState(null);
  const [schemaErr, setSchemaErr] = useState(null);
  useEffect(() => {
    if (choiceOf(source) !== "csv" || schema) return;
    customLoadsApi.schema().then(setSchema).catch((e) => setSchemaErr(e.message));
  }, [source, schema]);

  const selectedWtpack = wtpackInstances.find((i) => i.instance_id === wtpackId) || null;
  const sampleMeta = samples && samples.samples ? samples.samples.find((x) => x.instance_id === sampleId) : null;

  const totals = useMemo(() => {
    let boxes = 0, vol = 0, mass = 0;
    for (const r of typedRows) {
      const q = num(r.qty);
      if (q === null || q <= 0 || !Number.isInteger(q)) continue;
      boxes += q;
      const l = num(r.length), w = num(r.width), h = num(r.height), m = num(r.weight);
      if (l && w && h) vol += (l * w * h * q) / 1e6;
      if (m) mass += m * q;
    }
    return { boxes, vol, mass };
  }, [typedRows]);

  const badCell = useMemo(() => {
    const out = new Set();
    for (const e of customErrors || []) if (e.row) out.add(`${e.row}|${e.column || "*"}`);
    return out;
  }, [customErrors]);

  const setCell = (i, key, v) => setTypedRows(typedRows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  const onPickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsvFile({ name: f.name, size: f.size, text: String(reader.result) });
    reader.readAsText(f);
  };

  const choice = choiceOf(source);
  const customReady = customLoad && customLoad.summary && !(customErrors && customErrors.length);
  const customSummary = customReady && (
    <LoadReady custom stale={customStale}
      boxes={customLoad.summary.totals.boxes}
      stops={Object.keys(customLoad.summary.stops.counts).length}
      fragile={customLoad.summary.fragility.fragile_count}
      notes={[...(customLoad.summary.notes || []),
              customLoad.summary.stops.mode === "assigned" ? "No stops were given, so STACKR assigned balanced stops once; every run uses these same stops." : null].filter(Boolean)}
      warnings={(customLoad.summary.warnings || []).filter((w) => !/^No fragile boxes/.test(w))} />
  );

  return (
    <div>
      <div className="info-callout" style={{ marginBottom: 16 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>Three ways to add your boxes</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>Pick whichever is easiest for you. Upload your own file, type your boxes in, or try a sample from the OR-Library benchmark. All three work the same way from here on.</div>
        </div>
      </div>

      <div className="tabs-inline" style={{ marginBottom: 16, width: "fit-content", maxWidth: "100%", flexWrap: "wrap" }}>
        {CHOICES.map((c) => (
          <button key={c.key} type="button" disabled={running} className={choice === c.key ? "active" : ""}
            onClick={() => setSource(c.key === "sample" ? (source === "standard" ? "standard" : "sample") : c.key)}>{c.label}</button>
        ))}
      </div>

      {!choice && (
        <div className="card" style={{ textAlign: "center", padding: "32px 24px", color: "var(--text-dim)", fontSize: 13 }}>
          Pick one of the three ways above to add your boxes.
        </div>
      )}

      {/* ── Upload your own dataset ── */}
      {choice === "csv" && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Upload your own dataset</div>
              <div className="card-desc">A CSV file with your boxes. Read the format below first, or start from the template.</div>
            </div>
            <span className="badge badge-warn" style={{ textTransform: "none" }}>{CUSTOM_LOAD_LABEL}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input type="file" accept=".csv,text/csv" ref={fileRef} onChange={onPickFile} style={{ display: "none" }} />
            {!csvFile
              ? <button type="button" className="btn btn-primary btn-sm" disabled={running} onClick={() => fileRef.current && fileRef.current.click()}>Choose a CSV file…</button>
              : <>
                  <span style={{ fontSize: 13 }}>📄 <b>{csvFile.name}</b> <span style={{ color: "var(--text-dim)" }}>({fmt(csvFile.size / 1024)} KB)</span></span>
                  {checking && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Checking…</span>}
                  {!(customErrors && customErrors.length) && <button type="button" className="btn btn-secondary btn-sm" disabled={running} onClick={onDiscard}>Choose a different file</button>}
                </>}
          </div>
          {csvFile && customErrors && customErrors.length > 0 &&
            <InvalidDataset errors={customErrors} notes={customNotes} onDiscard={onDiscard} onCancel={onCancel} />}
          {csvFile && customSummary}
          <details className="collapsible" key={csvFile ? "file" : "none"} open={!csvFile} style={{ marginTop: 14 }}>
            <summary>File format and template</summary>
            <div style={{ marginTop: 10 }}><FormatHelp schema={schema} error={schemaErr} /></div>
          </details>
          <CustomAdvanced fragileShare={fragileShare} setFragileShare={setFragileShare} running={running} />
        </div>
      )}

      {/* ── Type in your boxes ── */}
      {choice === "typed" && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Type in your boxes</div>
              <div className="card-desc">One row per kind of box; Qty makes that many. Sizes in cm, weights in kg. Boxes are kept upright.
                Stop 1–{stopCount} (stop 1 is unloaded first): give every row a stop, or leave them all blank and STACKR assigns balanced stops.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" disabled={running} onClick={() => setSource("csv")}>Upload a file instead</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={running} onClick={() => setTypedRows([...typedRows, blankRow()])}>+ Add a box</button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="custom-table">
              <thead><tr>{COLUMNS.map((c) => <th key={c.key}>{c.title}</th>)}<th /></tr></thead>
              <tbody>
                {typedRows.map((r, i) => (
                  <tr key={r.key}>
                    {COLUMNS.map((c) => {
                      const bad = badCell.has(`${i + 1}|${c.title}`) || (c.key === "length" && badCell.has(`${i + 1}|*`));
                      return (
                        <td key={c.key} style={{ minWidth: c.width }}>
                          {c.type === "check"
                            ? <input type="checkbox" checked={!!r.fragile} disabled={running} onChange={(e) => setCell(i, "fragile", e.target.checked)} aria-label={`Row ${i + 1} handle with care`} />
                            : <input type={c.type} value={r[c.key]} disabled={running} aria-label={`Row ${i + 1} ${c.title}`}
                                min={c.type === "number" ? 0 : undefined} step="any"
                                onChange={(e) => setCell(i, c.key, e.target.value)}
                                style={{ ...inputStyle, borderColor: bad ? "var(--red)" : "var(--border)", background: bad ? "var(--red-light)" : "var(--bg-card)" }} />}
                        </td>
                      );
                    })}
                    <td>
                      <button type="button" title="Remove this row" disabled={running || typedRows.length === 1}
                        onClick={() => setTypedRows(typedRows.filter((_, j) => j !== i))}
                        style={{ background: "transparent", border: "none", color: "var(--red)", fontSize: 16, cursor: "pointer" }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={running || checking} onClick={onCheck}>{checking ? "Checking…" : "Check these boxes"}</button>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              Running totals: <b>{totals.boxes}</b> boxes · <b>{fmt(totals.vol, 3)} m³</b> · <b>{fmt(totals.mass)} kg</b>
              {totals.boxes > 500 && <span style={{ color: "var(--red)" }}> · over the 500-box limit</span>}
            </div>
          </div>
          <ErrorList errors={customErrors} />
          {customSummary}
          <CustomAdvanced fragileShare={fragileShare} setFragileShare={setFragileShare} running={running} />
        </div>
      )}

      {/* ── Try a sample ── */}
      {choice === "sample" && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Try a sample <span className="badge badge-neutral" style={{ marginLeft: 6, textTransform: "none" }}>from the OR-Library benchmark</span></div>
              <div className="card-desc">Real benchmark loads, so you can try STACKR without typing anything in. Their container, box sizes, weights and strengths come from the benchmark; STACKR marks the fragile boxes and assigns the delivery stops.</div>
            </div>
          </div>
          <div className="tabs-inline" style={{ marginBottom: 14, width: "fit-content" }}>
            <button type="button" className={source === "sample" ? "active" : ""} disabled={running} onClick={() => setSource("sample")}>Ready-made samples</button>
            <button type="button" className={source === "standard" ? "active" : ""} disabled={running} onClick={() => setSource("standard")}>Standard test cases</button>
          </div>

          {source === "sample" && (
            !samples ? <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Counting boxes in the benchmark instances…</div>
            : samples.error ? <div className="alert-danger">{samples.error}</div>
            : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                  {samples.samples.map((s) => (
                    <button key={s.instance_id} type="button" disabled={running} onClick={() => setSampleId(s.instance_id)} style={{
                      textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer", color: "var(--text-main)",
                      border: sampleId === s.instance_id ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: sampleId === s.instance_id ? "var(--primary-light)" : "var(--bg-card)",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase" }}>{s.target}</div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{s.n_boxes} boxes</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.br_class} · {s.n_types} box types · instance {s.instance_id}</div>
                      <div style={{ fontSize: 12, color: "var(--amber)" }}>{s.fragile_count} fragile ({Math.round(s.fragile_rate * 100)}%)</div>
                      {s.over_cap && <div style={{ marginTop: 6 }}><span className="badge badge-warn" style={{ textTransform: "none" }}>larger than the thesis study's {samples.cap}-box cap</span></div>}
                    </button>
                  ))}
                </div>
                <div className="field-hint" style={{ marginTop: 10 }}>Bigger loads take longer to pack.</div>
              </>
            )
          )}

          {source === "standard" && (
            <>
              <label className="field-label">Pick a test case</label>
              <select className="field-input" style={{ ...inputStyle, padding: 10, fontSize: 14 }} value={wtpackId === null ? "" : String(wtpackId)}
                onChange={(e) => setWtpackId(e.target.value === "" ? null : Number(e.target.value))} disabled={running}>
                <option value="" disabled>— Select a test case —</option>
                {wtpackInstances.map((inst) => <option key={inst.instance_id} value={String(inst.instance_id)}>{inst.label}</option>)}
              </select>
              <div className="field-hint">The thesis's sampled test cases (classes BR1–BR7). A higher class number means more kinds of box.</div>
              {wtpackInstances.length === 0 && <div style={{ fontSize: 12, color: "var(--amber)", marginTop: 6 }}>No test cases found — is the server running?</div>}
            </>
          )}

          {source === "sample" && sampleMeta && (
            <LoadReady boxes={sampleMeta.n_boxes} stops={stopCount} fragile={sampleMeta.fragile_count} />
          )}
          {source === "standard" && selectedWtpack && (
            <LoadReady boxes={selectedWtpack.n_boxes} stops={stopCount} fragile={selectedWtpack.fragile_count} />
          )}
        </div>
      )}
    </div>
  );
}
