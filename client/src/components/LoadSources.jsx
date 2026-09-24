// client/src/components/LoadSources.jsx — the four ways to give STACKR boxes:
//   1. Standard test case   wtpack BR1-BR7 (the thesis sample, unchanged)
//   2. Ready-made sample    real OR-Library instances picked by computed box count
//   3. Type them in         rows -> preprocessing/custom_load.py (custom load)
//   4. Import a CSV         same columns, simple or advanced
// Sources 3 and 4 are custom loads: never thesis data, always labelled so.
// Every validation message shown here comes from the server's converter.
import React, { useMemo, useRef } from "react";
import { customLoadsApi } from "../services/api";
import { CUSTOM_LOAD_LABEL } from "./CustomLoadBanner";

export const SOURCES = [
  { key: "standard", label: "Standard test case", sub: "wtpack BR1–BR7 (thesis)" },
  { key: "sample",   label: "Ready-made sample",  sub: "from the OR-Library benchmark" },
  { key: "typed",    label: "Type them in",       sub: "your own boxes" },
  { key: "csv",      label: "Import a CSV",       sub: "your own boxes" },
];

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
const panel = { background: "var(--bg-card)", border: "2px solid var(--primary)", borderRadius: "var(--radius-lg)", padding: 20 };

async function downloadTemplate(mode) {
  const text = await customLoadsApi.template(mode);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = `stackr_boxes_${mode}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Errors from the converter, grouped: file/container-level first, then per row.
function ErrorList({ errors }) {
  if (!errors || !errors.length) return null;
  return (
    <div className="alert-danger" role="alert" style={{ marginTop: 12 }}>
      <b>This load can't be used yet — {errors.length} problem{errors.length === 1 ? "" : "s"}:</b>
      <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 12.5, lineHeight: 1.55 }}>
        {errors.map((e, i) => <li key={i}>{e.message}</li>)}
      </ul>
    </div>
  );
}

function Summary({ load, stale }) {
  if (!load) return null;
  const s = load.summary;
  const st = s.stops, fr = s.fragility;
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "var(--amber-light)", border: "1px solid var(--amber)", fontSize: 12.5, lineHeight: 1.6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <b style={{ color: "var(--amber)" }}>{s.label || CUSTOM_LOAD_LABEL}</b>
        {stale ? <span className="badge badge-warn">changed since the check — it will be re-checked when you run</span>
               : <span className="badge badge-safe">checked · ready to run</span>}
      </div>
      <div>
        <b>{s.totals.boxes}</b> boxes · <b>{fmt(s.totals.volume_m3, 3)} m³</b> ({fmt(100 * s.totals.volume_m3 / s.totals.container_volume_m3)}% of the container) · <b>{fmt(s.totals.mass_kg)} kg</b>
        {s.mode === "advanced" ? " · advanced strength columns used as given" : " · custom boxes are kept upright"}
      </div>
      <div>
        Stops: {st.mode === "given"
          ? <>as you gave them ({Object.entries(st.counts).map(([k, v]) => `stop ${k}: ${v}`).join(", ")})</>
          : <>assigned once when checked — {st.num_stops} balanced stops, seed {st.seed} ({Object.entries(st.counts).map(([k, v]) => `stop ${k}: ${v}`).join(", ")}); every run uses these same labels</>}
      </div>
      <div>
        Fragile: {fr.fragile_count === 0 ? <b>no fragile boxes in this load</b>
          : <><b>{fr.fragile_count}</b> of {s.totals.boxes} ({fmt(100 * fr.fragile_rate)}%)
            {fr.ticked_count ? ` · ${fr.ticked_count} ticked "Handle with care"` : ""}
            {fr.share_target != null ? ` · weakest-share rule at ${fmt(100 * fr.share_target)}% marked ${fr.share_count} (reached ${fmt(100 * fr.share_count / s.totals.boxes)}%)` : ""}</>}
      </div>
      {s.max_weight_kg != null && <div>Max weight {fmt(s.max_weight_kg)} kg: checked after the run (packed weight vs limit) — not part of the optimization.</div>}
      {(s.warnings || []).filter((w) => !/^No fragile boxes/.test(w)).map((w) => <div key={w} style={{ color: "var(--amber)" }}>⚠ {w}</div>)}
    </div>
  );
}

function FragileShareOption({ share, setShare, disabled }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: "var(--text-muted)", marginTop: 10 }}>
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

export default function LoadSources({
  source, setSource, running, stopCount = 3,
  // 1. standard
  wtpackInstances = [], wtpackId, setWtpackId,
  // 2. samples
  samples, sampleId, setSampleId,
  // 3 + 4. custom
  typedRows, setTypedRows, fragileShare, setFragileShare, csvFile, setCsvFile,
  customLoad, customStale, customErrors, checking, onCheck,
}) {
  const fileRef = useRef(null);
  const selectedWtpack = wtpackInstances.find((i) => i.instance_id === wtpackId) || null;

  // Running totals over rows whose numbers are usable (the server decides validity).
  const totals = useMemo(() => {
    let boxes = 0, vol = 0, mass = 0, ticked = 0;
    for (const r of typedRows) {
      const q = num(r.qty);
      if (q === null || q <= 0 || !Number.isInteger(q)) continue;
      boxes += q;
      const l = num(r.length), w = num(r.width), h = num(r.height), m = num(r.weight);
      if (l && w && h) vol += (l * w * h * q) / 1e6;
      if (m) mass += m * q;
      if (r.fragile) ticked += q;
    }
    return { boxes, vol, mass, ticked };
  }, [typedRows]);

  // Highlight the cells the server named (typed rows: row n = typedRows[n - 1]).
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

  const custom = source === "typed" || source === "csv";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {SOURCES.map((s) => (
          <button key={s.key} type="button" disabled={running} onClick={() => setSource(s.key)} style={{
            textAlign: "left", padding: "10px 14px", borderRadius: 8, cursor: running ? "not-allowed" : "pointer",
            border: source === s.key ? "1px solid var(--primary)" : "1px solid var(--border)",
            background: source === s.key ? "var(--primary-light)" : "var(--bg-card)",
            color: source === s.key ? "var(--primary-hover)" : "var(--text-muted)",
          }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>{s.label}</div>
            <div style={{ fontSize: 11.5, opacity: 0.8 }}>{s.sub}</div>
          </button>
        ))}
      </div>

      {/* ── 1. Standard test case ── */}
      {source === "standard" && (
        <div style={panel}>
          <h4 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Standard test case</h4>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            The thesis's sampled OR-Library wtpack instances (BR1–BR7), with the thesis's fragility and stop augmentation.
          </p>
          <select style={{ ...inputStyle, padding: 12, fontSize: 14 }} value={wtpackId === null ? "" : String(wtpackId)}
            onChange={(e) => setWtpackId(e.target.value === "" ? null : Number(e.target.value))} disabled={running}>
            <option value="" disabled>— Select a sampled wtpack instance —</option>
            {wtpackInstances.map((inst) => <option key={inst.instance_id} value={String(inst.instance_id)}>{inst.label}</option>)}
          </select>
          {wtpackInstances.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--amber)", marginTop: 6 }}>No sampled instances — is the server running and experiments/samples/sample30_seed42.json present?</div>
          )}
          {selectedWtpack && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "var(--text-dim)" }}>
              <span>Class <b style={{ color: "var(--text-main)" }}>{selectedWtpack.br_class}</b> ({selectedWtpack.n_types} box types)</span>
              <span>Container <b style={{ color: "var(--text-main)" }}>{selectedWtpack.container.L} × {selectedWtpack.container.W} × {selectedWtpack.container.H} cm</b> (length door to cab × width × height), rear door</span>
              <span>Boxes <b style={{ color: "var(--text-main)" }}>{selectedWtpack.n_boxes}</b></span>
              <span>Fragile <b style={{ color: "var(--amber)" }}>{selectedWtpack.fragile_count} ({Math.round(selectedWtpack.fragile_rate * 100)}%)</b></span>
            </div>
          )}
        </div>
      )}

      {/* ── 2. Ready-made sample ── */}
      {source === "sample" && (
        <div style={panel}>
          <h4 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Ready-made sample <span className="badge badge-neutral" style={{ marginLeft: 6, textTransform: "none" }}>from the OR-Library benchmark</span></h4>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            Real wtpack instances picked by their actual box count (computed from the files), processed exactly like the thesis data. Not custom loads.
          </p>
          {!samples ? <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Counting boxes in the 700 benchmark instances…</div>
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
                      <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 4 }}>{s.why}</div>
                      {s.over_cap && <div style={{ marginTop: 6 }}><span className="badge badge-warn" style={{ textTransform: "none" }}>larger than the thesis study's {samples.cap}-box cap</span></div>}
                    </button>
                  ))}
                </div>
                {samples.largest_overall && samples.largest_overall.reason && (
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 12, lineHeight: 1.5 }}>
                    Why not the {samples.largest_overall.n_boxes}-box instance ({samples.largest_overall.br_class}, instance {samples.largest_overall.instance_id}), the benchmark's largest?
                    The thesis's fragility step rejects it: {samples.largest_overall.reason.replace(/^Fragile proportion/, "its fragile share")}, outside the 20–30% the thesis accepts.
                    {samples.excluded.length > 1 && <> {samples.excluded.length - 1} other instance{samples.excluded.length === 2 ? "" : "s"} nearer a target {samples.excluded.length === 2 ? "was" : "were"} skipped for the same reason.</>}
                  </div>
                )}
              </>
            )}
        </div>
      )}

      {/* ── 3. Type them in ── */}
      {source === "typed" && (
        <div style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h4 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Type them in</h4>
              <p style={{ fontSize: 12, color: "var(--text-dim)", maxWidth: 640, lineHeight: 1.5 }}>
                One row per kind of box; Qty makes that many. Custom boxes are kept upright (height stays vertical).
                Stop 1–{stopCount} (1 = first delivery): give every row a stop, or leave them all blank and STACKR assigns balanced stops once when the load is checked.
              </p>
            </div>
            <span className="badge badge-warn" style={{ textTransform: "none" }}>{CUSTOM_LOAD_LABEL}</span>
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
            <button type="button" className="btn btn-secondary btn-sm" disabled={running} onClick={() => setTypedRows([...typedRows, blankRow()])}>+ Add a row</button>
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              Running totals: <b>{totals.boxes}</b> boxes · <b>{fmt(totals.vol, 3)} m³</b> · <b>{fmt(totals.mass)} kg</b>
              {totals.boxes > 500 && <span style={{ color: "var(--red)" }}> · over the 500-box limit</span>}
            </div>
          </div>
          <FragileShareOption share={fragileShare} setShare={setFragileShare} disabled={running} />
          {!fragileShare.on && totals.ticked === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>No fragile boxes in this load (nothing ticked "Handle with care", and the weakest-share option is off).</div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={running || checking} onClick={onCheck}>{checking ? "Checking…" : "Check this load"}</button>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>The server checks every row; Quick Test and Full Comparison check it too if you skip this.</span>
          </div>
          <ErrorList errors={customErrors} />
          <Summary load={customLoad} stale={customStale} />
        </div>
      )}

      {/* ── 4. Import a CSV ── */}
      {source === "csv" && (
        <div style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <h4 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Import a CSV</h4>
              <p style={{ fontSize: 12, color: "var(--text-dim)", maxWidth: 640, lineHeight: 1.5 }}>
                The same columns as "Type them in". Simple: {COLUMNS.map((c) => c.title).join(", ")} — custom boxes are kept upright.
                Advanced adds Type ID, L/W/H flag (0/1: may that side point up) and LBS L/W/H (kg/cm²), used exactly as given.
              </p>
            </div>
            <span className="badge badge-warn" style={{ textTransform: "none" }}>{CUSTOM_LOAD_LABEL}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input type="file" accept=".csv,text/csv" ref={fileRef} onChange={onPickFile} style={{ display: "none" }} />
            {!csvFile
              ? <button type="button" className="btn btn-primary btn-sm" disabled={running} onClick={() => fileRef.current && fileRef.current.click()}>Choose a CSV file…</button>
              : <>
                  <span style={{ fontSize: 13 }}>📄 <b>{csvFile.name}</b> <span style={{ color: "var(--text-dim)" }}>({fmt(csvFile.size / 1024)} KB)</span></span>
                  <button type="button" className="btn btn-danger-outline btn-sm" disabled={running} onClick={() => setCsvFile(null)}>Remove this file</button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={running || checking} onClick={onCheck}>{checking ? "Checking…" : "Check this file"}</button>
                </>}
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Templates:</span>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => downloadTemplate("simple")}>simple.csv</button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => downloadTemplate("advanced")}>advanced.csv</button>
          </div>
          <FragileShareOption share={fragileShare} setShare={setFragileShare} disabled={running} />
          <ErrorList errors={customErrors} />
          <Summary load={customLoad} stale={customStale} />
        </div>
      )}

      {custom && (
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          Set the container on the left: Length runs from the rear door to the cab.
        </div>
      )}
    </div>
  );
}
