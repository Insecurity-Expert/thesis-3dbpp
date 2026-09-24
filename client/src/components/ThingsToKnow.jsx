import React from "react";

// "Things to know" — one component, shown in Results and in Account.
// Every number comes from data the app holds (the loaded run, the study
// files); nothing is typed in. Where there is no data, it says so.

function stopCounts(result, studies) {
  const out = [];
  if (result && Array.isArray(result.items) && result.items.length) {
    const s = new Set(result.items.map((it) => Number(it.stop)).filter(Number.isFinite));
    if (result.problem_view) for (const u of result.problem_view.unplaced) s.add(Number(u.stop));
    if (s.size) out.push({ where: "the run on screen", n: s.size });
  }
  for (const st of studies || []) {
    if (st.stop_count != null) out.push({ where: st.name, n: st.stop_count, seed: st.stop_seed });
  }
  return out;
}

const machineText = (m) => (m ? [m.processor, m.cpu_count ? `${m.cpu_count} logical CPUs` : null, m.platform, m.python ? `Python ${m.python}` : null].filter(Boolean).join(", ") : null);

function Item({ n, title, children }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: n > 1 ? "1px solid var(--border)" : "none" }}>
      <div style={{ flex: "0 0 26px", height: 26, borderRadius: "50%", background: "var(--primary-light)", color: "var(--primary)", fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-muted)" }}>
        <div style={{ fontWeight: 700, color: "var(--text-main)", marginBottom: 2 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

export default function ThingsToKnow({ result = null, studies = [] }) {
  const done = (studies || []).filter((s) => s.status === "done" || s.status === "imported");
  const stops = stopCounts(result, done);
  const distinct = Array.from(new Set(stops.map((s) => s.n)));

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">Things to know</div>
          <div className="card-desc">How STACKR works, and what it does not model</div>
        </div>
      </div>

      <Item n={1} title={distinct.length === 0 ? "Delivery stops" : `${distinct.join(" or ")} delivery stop${distinct.length === 1 && distinct[0] === 1 ? "" : "s"} per load`}>
        {stops.length === 0
          ? "No run or study is loaded yet, so there is no stop count to show."
          : <>Read from the data: {stops.map((s, i) => <span key={i}>{i ? "; " : ""}{s.where}: {s.n}</span>)}. </>}
        {" "}Each box's stop is assigned at random during data preparation (balanced across the stops, with a fixed seed); it does not come from a real route. Routes where the truck is reloaded along the way are not modelled.
      </Item>

      <Item n={2} title="“Fragile” is derived, not measured">
        A box is marked fragile when its weakest load-bearing strength (LBS, from the dataset) ranks among the lowest in its load, so that about a quarter of the boxes are fragile. Real fragility also depends on material and packaging, which the data does not contain.
      </Item>

      <Item n={3} title="Support (C5) is a resting-load check">
        C5 checks that each box rests with at least 80% of its base on the floor or on the tops of boxes directly below it — in the packed, standing load. It does not model braking, cornering or vibration while the truck is moving.
      </Item>

      <Item n={4} title="Timing depends on how and where a run was made">
        {done.length === 0 ? "No finished study is loaded, so there is no timing record to show." : (
          <ul style={{ margin: "4px 0 6px", paddingLeft: 18 }}>
            {done.map((s) => (
              <li key={s.id}>
                <b>{s.name}</b>: run {s.mode || "in an unrecorded mode"}{s.mode === "parallel" && s.workers ? ` (${s.workers} at once)` : ""}
                {machineText(s.machine) ? ` on ${machineText(s.machine)}` : ", machine not recorded"}.{" "}
                {s.timing_valid ? "Its times can be compared across methods." : `Its times should not be compared across methods${s.timing_note ? ` (${s.timing_note})` : ""}.`}
              </li>
            ))}
          </ul>
        )}
        Times from the demo study and from Quick Test runs use other settings and conditions, so they are not comparable with study times, and no time here carries over to a different computer.
      </Item>

      <Item n={5} title="These results are preliminary">
        {done.length === 0 ? "No finished study is loaded yet." : (
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {done.map((s) => (
              <li key={s.id}>
                <b>{s.name}</b>: {s.n_instances ?? "?"} test case{s.n_instances === 1 ? "" : "s"} × {s.n_seeds ?? "?"} repeat codes × {s.n_configurations ?? "?"} methods
                {s.n_runs != null ? ` = ${s.n_runs} runs` : ""}, {s.preset ? `${s.preset.name} preset (pop ${s.preset.pop_size} × ${s.preset.max_iter} iterations)` : "preset not recorded"}.
              </li>
            ))}
          </ul>
        )}
      </Item>
    </div>
  );
}
