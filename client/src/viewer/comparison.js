// client/src/viewer/comparison.js — the Results page's neutral comparison.
//
// Every label is computed from the per-configuration means of one load
// (experiments/representative.py). Nothing is ranked or recommended: a
// measure is "level" when the gap is under its threshold, otherwise the
// configurations are described as highest / lowest on it. Results that
// follow from how a configuration is built are labelled "by design".

export const CONFIG_ORDER = ["DGWO", "MOGWO", "SEQ", "REP"];
export const HYBRIDS = ["SEQ", "REP"];
export const BASELINES = ["DGWO", "MOGWO"];

// Display rule only (not a statistical test): gaps under these are "level".
export const MEASURES = [
  { key: "su_pct", label: "Container fill", unit: "%", threshold: 2, thresholdText: "2 percentage points" },
  { key: "csr_all_pct", label: "Rule compliance, all boxes", unit: "%", threshold: 2, thresholdText: "2 percentage points",
    hint: "Share of ALL boxes in the load that follow the four loading rules; a box not loaded counts as not following them." },
  { key: "csr_placed_pct", label: "Rule compliance, loaded boxes", unit: "%", threshold: 2, thresholdText: "2 percentage points",
    hint: "Share of the loaded boxes that follow the four loading rules." },
  { key: "placed", label: "Boxes loaded", unit: "boxes", threshold: 2, thresholdText: "2 boxes" },
];

export const ordered = (codes) => CONFIG_ORDER.filter((c) => codes.includes(c));

const fmtVal = (m, v) => (v == null || !Number.isFinite(Number(v)) ? "—"
  : m.unit === "%" ? `${Number(v).toFixed(1)}%` : `${Number(v).toFixed(1)}`);
export { fmtVal };

// For one measure over a set of configurations: each one's position.
// "level" (every gap under the threshold), else "highest" / "lowest" for the
// configurations within the threshold of the top / bottom value, "between"
// for the rest (and for one within the threshold of both ends).
export function positions(means, codes, m) {
  const vals = codes.map((c) => [c, means[c] ? means[c][m.key] : null]).filter(([, v]) => v != null);
  const out = {};
  if (vals.length < 2) { for (const [c] of vals) out[c] = "level"; return out; }
  const hi = Math.max(...vals.map(([, v]) => v));
  const lo = Math.min(...vals.map(([, v]) => v));
  if (hi - lo < m.threshold) { for (const [c] of vals) out[c] = "level"; return out; }
  for (const [c, v] of vals) {
    const nearHi = hi - v < m.threshold;
    const nearLo = v - lo < m.threshold;
    out[c] = nearHi && !nearLo ? "highest" : nearLo && !nearHi ? "lowest" : "between";
  }
  return out;
}

// Per configuration: the measures where it is highest, lowest, or level.
// A measure whose value is by design carries "(by design)".
export function profiles(means, codes, seqSplit) {
  const out = Object.fromEntries(codes.map((c) => [c, { highest: [], lowest: [], level: [] }]));
  for (const m of MEASURES) {
    const p = positions(means, codes, m);
    for (const c of codes) {
      const label = byDesign(c, means[c], seqSplit)[m.key] ? `${m.label} (by design)` : m.label;
      if (p[c] === "highest") out[c].highest.push(label);
      else if (p[c] === "lowest") out[c].lowest.push(label);
      else if (p[c] === "level") out[c].level.push(label);
    }
  }
  return out;
}

// Two configurations on one measure: "level" or which is higher, by how much.
export function pairText(means, a, b, m, nameOf) {
  const va = means[a] && means[a][m.key], vb = means[b] && means[b][m.key];
  if (va == null || vb == null) return "—";
  const d = va - vb;
  if (Math.abs(d) < m.threshold) return "level";
  const unit = m.unit === "%" ? " percentage points" : " boxes";
  return `${nameOf(d > 0 ? a : b)} higher by ${Math.abs(d).toFixed(1)}${unit}`;
}

// Labels for results that come from how a configuration is built.
export function byDesign(code, means, seqSplit) {
  const notes = {};
  if (code === "REP" && means && means.csr_placed_pct != null && Math.abs(means.csr_placed_pct - 100) < 1e-9) {
    notes.csr_placed_pct = "by design: repair removes every loaded box that still breaks a rule, so the loaded boxes always follow them";
  }
  if (code === "SEQ") {
    const t1 = seqSplit && seqSplit.dgwo_iters, t2 = seqSplit && seqSplit.mogwo_iters;
    notes.card = `by design: the iteration budget is split${t1 != null ? `, ${t1} DGWO then ${t2} MOGWO iterations` : " between a DGWO phase and a MOGWO phase"}`;
  }
  return notes;
}

// One neutral line for the hybrid view: measures on which a baseline is higher
// than BOTH hybrids by at least the level threshold. null when none.
export function baselineNote(means, nameOf) {
  const parts = [];
  for (const m of MEASURES) {
    const hy = HYBRIDS.map((h) => means[h] && means[h][m.key]).filter((v) => v != null);
    if (hy.length < HYBRIDS.length) continue;
    const top = Math.max(...hy);
    const higher = BASELINES.filter((b) => means[b] && means[b][m.key] != null && means[b][m.key] - top >= m.threshold);
    if (higher.length) parts.push(`${m.label.toLowerCase()} (${higher.map(nameOf).join(", ")})`);
  }
  if (!parts.length) return null;
  return `A baseline configuration is higher than both hybrids on: ${parts.join("; ")}. See the full comparison.`;
}
