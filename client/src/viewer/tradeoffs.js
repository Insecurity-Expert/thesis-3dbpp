// Trade-offs between container fill and rule-following, from real runs:
// one point per run (x = container fill %, y = rule-following over ALL boxes %,
// a box left out counting as not following). A run is "not exceeded on both"
// (non-dominated) when no other run of the same configuration is at least as
// high on both and higher on one. Runs are compared within one configuration.

export const allBoxPct = (r) => (r.n_items ? (r.csr_pct * r.placed) / r.n_items : 0);

export function tradeoffPoints(runs) {
  return runs.map((r, i) => ({ key: `${r.configuration}-${r.instance_id ?? "c"}-${r.seed}-${i}`, seed: r.seed,
                               configuration: r.configuration, x: r.su_pct, y: allBoxPct(r) }));
}

export function nonDominated(points) {
  return points.filter((p) => !points.some((q) => q !== p && q.x >= p.x && q.y >= p.y && (q.x > p.x || q.y > p.y)));
}
