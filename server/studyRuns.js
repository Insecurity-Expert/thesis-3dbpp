// server/studyRuns.js — persist completed study runs into Run History (data.runs)
// and hydrate study-backed runs on load.
//
// The UI launches analyses via POST /api/studies (experiments/study.py). When a
// study finishes (or is imported), we record the representative run of each
// configuration per load into data.runs so Run History stays populated and
// replayable across page reloads and restarts.
//
// Idempotency: each study row gets `runs_recorded = true` in the same atomic
// db.mutate() call that writes its rows into data.runs. Deleting a run from Run
// History will therefore never cause it to be re-inserted.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const db = require("./db");
const { PYTHON } = require("./python");

const ROOT = path.join(__dirname, "..");
const VIEW_PY = path.join(ROOT, "experiments", "run_view.py");
const CONFIG_ORDER = ["DGWO", "MOGWO", "SEQ", "REP"];
const STRATEGY_LABEL = {
  DGWO: "DGWO",
  MOGWO: "MOGWO",
  SEQ: "Sequential",
  REP: "Repair-based",
};

function readJsonSafe(file) {
  if (!file) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Same selection rule as experiments/representative.py:
// run whose SU is closest to that configuration's median SU on the load, ties
// broken by lowest seed.
function pickRepresentative(indexedRuns) {
  const med = median(indexedRuns.map((x) => Number(x.run.su_pct)));
  let best = indexedRuns[0];
  let bestDiff = Math.round(Math.abs(Number(best.run.su_pct) - med) * 1e9);
  for (let i = 1; i < indexedRuns.length; i++) {
    const cur = indexedRuns[i];
    const diff = Math.round(Math.abs(Number(cur.run.su_pct) - med) * 1e9);
    if (diff < bestDiff || (diff === bestDiff && Number(cur.run.seed) < Number(best.run.seed))) {
      best = cur;
      bestDiff = diff;
    }
  }
  return best;
}

function buildRunRecord(studyRow, doc, runIndex, run, nextId) {
  const config = run.configuration;
  const isCustom = !!(run.custom_load || doc.custom_load);
  const customId = run.custom_load || doc.custom_load || null;
  const instanceText = isCustom
    ? `Custom load (${customId})`
    : `wtpack #${run.instance_id}`;
  const preset = doc.preset || {};
  const pu = run.params_used || {};
  const runtimeS = run.exec_time_ms != null && Number.isFinite(Number(run.exec_time_ms))
    ? Number((Number(run.exec_time_ms) / 1000).toFixed(3))
    : null;
  const nItems = run.n_items != null ? Number(run.n_items) : null;
  const placed = run.placed != null ? Number(run.placed) : null;
  const unplaced = nItems != null && placed != null ? nItems - placed : null;
  const strategyLabel = STRATEGY_LABEL[config] || config;

  const resultEnvelope = {
    status: "ok",
    source: "study",
    study_id: studyRow.id,
    study_run_index: runIndex,
    strategy: config,
    strategy_label: strategyLabel,
    dataset: isCustom ? "custom" : "wtpack",
    instance: isCustom ? customId : run.instance_id,
    seed: run.seed ?? null,
    n_items: nItems,
    placed,
    unplaced,
    bins_used: 1,
    volume_util_pct: run.su_pct ?? null,
    runtime_s: runtimeS,
    budget_exhausted: typeof run.budget_exhausted === "boolean" ? run.budget_exhausted : false,
    custom_load: isCustom ? {
      id: customId,
      label: doc.custom_load_label || "Custom load — not part of the thesis dataset",
      name: studyRow.name || doc.name || null,
    } : null,
    params: {
      strategy: config,
      dataset: isCustom ? "custom" : "wtpack",
      instance_id: isCustom ? customId : run.instance_id,
      pop_size: preset.pop_size ?? null,
      max_iter: preset.max_iter ?? null,
      lambda_w: pu.lambda_w ?? (doc.lambdas && doc.lambdas.w) ?? null,
      lambda_f: pu.lambda_f ?? (doc.lambdas && doc.lambdas.f) ?? null,
      lambda_b: pu.lambda_b ?? (doc.lambdas && doc.lambdas.b) ?? null,
      lambda_a: pu.lambda_a ?? (doc.lambdas && doc.lambdas.a) ?? null,
      enforce_support: typeof pu.enforce_support === "boolean" ? pu.enforce_support : (doc.enforce_support ?? true),
      enforce_fragility: typeof pu.enforce_fragility === "boolean" ? pu.enforce_fragility : (doc.enforce_fragility ?? true),
      seed: run.seed ?? null,
    },
    metrics: {
      M1_space_utilization_pct: run.su_pct ?? null,
      M2_constraint_satisfaction_pct: run.csr_pct ?? null,
      M3_execution_time_ms: run.exec_time_ms ?? null,
      M4_peak_memory_mb: run.peak_mem_mb ?? null,
      timing_method: doc.timing_method || "psutil",
      constraint_detail: {
        C3_weight_pct: run.C3_pct ?? null,
        C4_fragility_pct: run.C4_pct ?? null,
        C5_balance_pct: run.C5_pct ?? null,
        C6_stop_order_pct: run.C6_pct ?? null,
      },
    },
    items: [],
    container: null,
  };

  return {
    id: nextId,
    user_id: parseInt(studyRow.user_id, 10),
    study_id: studyRow.id,
    study_run_index: runIndex,
    strategy: strategyLabel,
    instance: instanceText,
    n_items: nItems,
    space_util: run.su_pct != null ? Number(run.su_pct) : null,
    dissipation: null,
    runtime_s: runtimeS,
    bins_used: 1,
    placements: null,
    container: null,
    strategy_code: config,
    dataset: isCustom ? "custom" : "wtpack",
    seed: run.seed != null ? Number(run.seed) : null,
    csr: run.csr_pct != null ? Number(run.csr_pct) : null,
    placed,
    label: studyRow.name || doc.name || null,
    result: resultEnvelope,
    convergence: null,
    status: "ok",
    error: null,
    created_at: studyRow.created_at || doc.created_at || new Date().toISOString(),
  };
}

// Atomically record representative runs for a finished/imported study into
// data.runs, once per study. Returns the number of rows inserted.
function recordStudyRuns(studyId) {
  const id = parseInt(studyId, 10);
  if (!Number.isInteger(id)) return 0;

  let studyRow = null;
  db.read((data) => {
    studyRow = (data.studies || []).find((s) => s.id === id) || null;
  });
  if (!studyRow || studyRow.runs_recorded) return 0;
  if (studyRow.status !== "done" && studyRow.status !== "imported") return 0;

  const doc = readJsonSafe(studyRow.file);
  if (!doc || !Array.isArray(doc.runs) || doc.runs.length === 0) return 0;

  // Group runs by load key (instance_id / custom_load) preserving order.
  const loadKeys = [];
  const byLoad = new Map();
  doc.runs.forEach((run, runIndex) => {
    const key = run.custom_load ? `custom:${run.custom_load}` : `inst:${run.instance_id}`;
    if (!byLoad.has(key)) {
      loadKeys.push(key);
      byLoad.set(key, []);
    }
    byLoad.get(key).push({ runIndex, run });
  });

  const picked = [];
  for (const key of loadKeys) {
    const entries = byLoad.get(key);
    for (const cfg of CONFIG_ORDER) {
      const mine = entries.filter((e) => e.run.configuration === cfg);
      if (mine.length) picked.push(pickRepresentative(mine));
    }
  }
  if (!picked.length) return 0;

  return db.mutate((data) => {
    const target = (data.studies || []).find((s) => s.id === id);
    if (!target || target.runs_recorded) return false;
    let nextId = data.runs.length ? Math.max(...data.runs.map((r) => r.id)) + 1 : 1;
    let added = 0;
    for (const { runIndex, run } of picked) {
      data.runs.push(buildRunRecord(target, doc, runIndex, run, nextId++));
      added += 1;
    }
    target.runs_recorded = true;
    return added;
  }) || 0;
}

// Check all studies owned by userId: sync any finished running study's status
// from its progress file and record runs for any finished/imported study that
// has not been persisted into data.runs yet.
function syncUserStudyRuns(userId) {
  const uid = parseInt(userId, 10);
  if (!Number.isInteger(uid)) return 0;

  let candidates = [];
  db.read((data) => {
    candidates = (data.studies || [])
      .filter((s) => s.user_id === uid && !s.runs_recorded)
      .map((s) => ({ id: s.id, status: s.status, progress_file: s.progress_file }));
  });
  if (!candidates.length) return 0;

  let totalAdded = 0;
  for (const s of candidates) {
    let status = s.status;
    if (status === "running" && s.progress_file) {
      const prog = readJsonSafe(s.progress_file);
      if (prog && prog.status === "done") {
        db.prepare("UPDATE studies SET status = ? WHERE id = ?").run("done", s.id);
        status = "done";
      }
    }
    if (status === "done" || status === "imported") {
      totalAdded += recordStudyRuns(s.id);
    }
  }
  return totalAdded;
}

// Hydrate container, placements and problem_view for a study-backed run when
// the user opens it from Run History ("Load"). Never fails the request if the
// underlying study file was removed or Python is unavailable.
function hydrateStudyRun(row, userId) {
  if (!row || row.study_id == null || row.study_run_index == null) return Promise.resolve(row);
  if (row.result && row.result.container && Array.isArray(row.result.items) && row.result.items.length > 0) {
    return Promise.resolve(row);
  }
  const study = db.prepare("SELECT * FROM studies WHERE id = ? AND user_id = ?").get(row.study_id, userId);
  if (!study || !study.file || !fs.existsSync(study.file)) return Promise.resolve(row);

  return new Promise((resolve) => {
    const child = spawn(PYTHON, [VIEW_PY, "--study", study.file, "--run", String(row.study_run_index)], {
      cwd: ROOT,
      windowsHide: true,
    });
    let out = "";
    child.stdout.on("data", (c) => { out += c.toString(); });
    child.on("error", () => resolve(row));
    child.on("close", (code) => {
      let doc = null;
      try { doc = JSON.parse(out.trim().split(/\r?\n/).pop()); } catch {}
      if (code === 0 && doc && doc.status === "ok") {
        const mergedResult = {
          ...(row.result || {}),
          container: doc.container || (row.result && row.result.container) || null,
          items: Array.isArray(doc.items) ? doc.items : ((row.result && row.result.items) || []),
          problem_view: doc.problem_view || (row.result && row.result.problem_view) || null,
          gaps: doc.gaps || null,
          edge: doc.edge || null,
          edge_fill: doc.edge_fill || null,
          fragile_lift: doc.fragile_lift || null,
          verified: doc.verified || null,
        };
        resolve({
          ...row,
          container: mergedResult.container,
          placements: mergedResult.items,
          result: mergedResult,
        });
        return;
      }
      resolve(row);
    });
  });
}

module.exports = { recordStudyRuns, syncUserStudyRuns, hydrateStudyRun };
