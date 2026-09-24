// client/src/components/CustomLoadBanner.jsx — the "Custom load — not part of
// the thesis dataset" label every tab shows for a run or study made on a
// typed or imported load (preprocessing/custom_load.py). Thesis data never
// carries it; the label text comes from the server when it has one.
import React from "react";

export const CUSTOM_LOAD_LABEL = "Custom load — not part of the thesis dataset";

/** The custom-load info of a result / study / history row, or null. */
export function customLoadOf(x) {
  if (!x) return null;
  if (x.custom_load && typeof x.custom_load === "object") return x.custom_load;
  if (typeof x.custom_load === "string" && x.custom_load) return { id: x.custom_load, label: x.custom_load_label };
  if (x.dataset === "custom") return { id: x.instance, label: null };
  return null;
}

export function CustomLoadBadge({ info, style }) {
  if (!info) return null;
  return (
    <span className="badge badge-warn" style={{ textTransform: "none", ...style }} title={info.name ? `Custom load "${info.name}"` : "Custom load"}>
      {info.label || CUSTOM_LOAD_LABEL}
    </span>
  );
}

/** Post-run weight check: shown only when the user entered a max weight. */
export function WeightCheck({ info }) {
  if (!info || info.max_weight_kg == null || info.packed_mass_kg == null) return null;
  const over = info.packed_mass_kg > info.max_weight_kg;
  return (
    <div style={{ fontSize: 12.5, marginTop: 6, color: over ? "var(--red)" : "var(--text-muted)" }}>
      Packed weight <b>{fmtKg(info.packed_mass_kg)} kg</b> vs limit <b>{fmtKg(info.max_weight_kg)} kg</b>
      {over ? " — over the limit" : " — within the limit"}
      <span style={{ color: "var(--text-dim)" }}> · not part of the optimization</span>
    </div>
  );
}

const fmtKg = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });

export default function CustomLoadBanner({ info, children }) {
  if (!info) return null;
  return (
    <div role="note" style={{
      display: "flex", flexDirection: "column", gap: 2, padding: "10px 14px", borderRadius: 10,
      background: "var(--amber-light)", border: "1px solid var(--amber)", color: "var(--text-main)", fontSize: 13,
    }}>
      <div>
        <b style={{ color: "var(--amber)" }}>{info.label || CUSTOM_LOAD_LABEL}</b>
        {info.name ? <span style={{ color: "var(--text-muted)" }}> · “{info.name}”</span> : null}
        <span style={{ color: "var(--text-dim)" }}> · typed in or imported by you; results say nothing about the thesis's benchmark.</span>
      </div>
      <WeightCheck info={info} />
      {children}
    </div>
  );
}
