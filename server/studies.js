// server/studies.js — SOP studies: four configurations x N seeds x instances.
//
// A study is a DETACHED python job (experiments/study.py) — it is not tied to
// a WebSocket and survives a client disconnect or a server restart. The
// server only records the job (user-scoped) and serves the study file and its
// progress file. CLI-computed study files in experiments/results/studies can
// be imported so they appear in the UI.
//
//   POST   /api/studies               { size, seeds?, instanceId?, customLoad?, preset?, mode? }
//   GET    /api/studies               the caller's studies (light rows)
//   GET    /api/studies/available     importable files not yet imported by the caller
//   POST   /api/studies/import        { file }   (basename inside the studies dir)
//   GET    /api/studies/:id           the study file (stats attached; arrangements stripped)
//   GET    /api/studies/:id/progress  { status, done, total, per_configuration, elapsed_s, ... }
//   GET    /api/studies/:id/runs/:idx/view  one run's arrangement for the 3-D viewer, rebuilt by
//          optimizer/arrangement_view.py (per-box C3-C6); refused if SU/CSR do not reproduce
//   DELETE /api/studies/:id
const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execFileSync } = require("child_process");
const db = require("./db");
const { authRequired } = require("./auth");

const router = express.Router();
const ROOT = path.join(__dirname, "..");
const STUDY_PY = path.join(ROOT, "experiments", "study.py");
const VIEW_PY = path.join(ROOT, "optimizer", "arrangement_view.py");
const STUDIES_DIR = path.join(ROOT, "experiments", "results", "studies");
const SAMPLE8 = path.join(ROOT, "experiments", "samples", "sample8_seed42.json");
if (!fs.existsSync(STUDIES_DIR)) fs.mkdirSync(STUDIES_DIR, { recursive: true });

// The three sizes of the "Full Comparison" picker. Estimates are MEASURED on
// the demo laptop (i5-1235U, 2P+8E cores, 12 threads) by experiments/study.py:
//   serial Quick per run: DGWO ~4 s, MOGWO ~4 s, SEQ ~4 s, REP ~30 s (+ ~3 s process start)
//   Demo (Quick, parallel): 5 seeds x 4 with 6 workers = 150 s wall (6 seeds/8 workers = 176 s,
//   10 seeds/10 workers = 277 s) - concurrent REP runs slow each other ~3x, so 5 seeds is
//   what fits the 3-minute target.
//   Study A (Standard, parallel, 120 runs, 10 workers): 3609 s wall (REP Standard ~900 s each under contention).
//   Study B (serial, 320 runs): 11146 s wall on a machine that was also in use; ~75 min idle.
const DEMO_SEEDS = Number(process.env.STACKR_DEMO_SEEDS || 5);
const SIZES = {
  demo:     { name: "Demo study",           preset: "quick",    mode: "parallel", seeds: `1-${DEMO_SEEDS}`, instanceId: 350, workers: 6,
              runs: 4 * DEMO_SEEDS,
              blurb: `one instance, Quick preset, ${DEMO_SEEDS} seeds x 4 configurations, run in parallel` },
  standard: { name: "Standard study (Study A)", preset: "standard", mode: "parallel", seeds: "1-30", instanceId: 350, workers: 10,
              runs: 120,
              blurb: "instance 350, Standard preset (10 x 300), seeds 1-30 x 4 configurations, run in parallel" },
  multi:    { name: "Multi-instance study (Study B)", preset: "quick", mode: "serial", seeds: "1-10", sample: SAMPLE8, workers: 1,
              runs: 320,
              blurb: "8 instances (BR1-BR7), Quick preset, seeds 1-10 x 4 configurations, run one at a time (timing valid)" },
};

// Duration estimate for a size, from finished studies stored on this machine
// that were made the same way: same execution mode (serial / parallel), same
// preset, and for parallel the same number of workers. Estimate = median
// wall-clock seconds per run over those studies x the size's run count.
// "This machine" = the study recorded the same logical CPU count and OS
// release as the one serving now. None -> null ("no estimate yet").
function estimateFor(s) {
  let files = [];
  try { files = fs.readdirSync(STUDIES_DIR).filter((f) => f.endsWith(".json") && !f.endsWith(".progress.json")); } catch { return null; }
  const perRun = [];
  for (const f of files) {
    const doc = readJson(path.join(STUDIES_DIR, f));
    if (!doc || doc.stackr_study !== 1 || !(doc.wall_clock_s > 0) || !Array.isArray(doc.runs) || !doc.runs.length) continue;
    if (doc.mode !== s.mode || !doc.preset || doc.preset.name !== s.preset) continue;
    if (s.mode === "parallel" && doc.workers !== s.workers) continue;
    const m = doc.machine || {};
    if (m.cpu_count !== os.cpus().length || !String(m.platform || "").includes(os.release())) continue;
    perRun.push(doc.wall_clock_s / doc.runs.length);
  }
  if (!perRun.length) return null;
  const a = perRun.slice().sort((x, y) => x - y);
  const med = a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
  return { estimate_s: Math.round(med * s.runs), basis_studies: a.length };
}

// The locked parameters the UI shows come from the optimizer itself
// (experiments/study.py --print-defaults reads the constructor defaults).
let DEFAULTS = null;
function studyDefaults() {
  if (DEFAULTS) return DEFAULTS;
  try {
    DEFAULTS = JSON.parse(execFileSync("python", [STUDY_PY, "--print-defaults"], { cwd: ROOT, windowsHide: true }).toString());
  } catch (err) {
    console.error("study defaults unavailable:", err.message);
    DEFAULTS = { error: err.message };
  }
  return DEFAULTS;
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function progressOf(row) {
  const prog = row.progress_file ? readJson(row.progress_file) : null;
  if (!prog) {
    if (row.status === "done" || row.status === "imported") return { status: "done", done: row.runs || null, total: row.runs || null };
    return { status: row.status || "unknown", done: 0, total: row.runs || null };
  }
  if (prog.status === "running" && row.pid && !pidAlive(row.pid)) {
    prog.status = "error";
    prog.error = prog.error || "the study process is no longer running (it was stopped or the machine restarted)";
  }
  return prog;
}

// Keep the db row's status in step with the progress file.
function syncStatus(row) {
  const prog = progressOf(row);
  const next = prog.status === "done" ? "done" : prog.status === "error" ? "error" : row.status;
  if (next !== row.status) {
    db.prepare("UPDATE studies SET status = ? WHERE id = ?").run(next, row.id);
    row.status = next;
  }
  return prog;
}

function light(row, study) {
  const prog = syncStatus(row);
  const st = study && study.stats;
  return {
    id: row.id, name: row.name, size: row.size, status: row.status, created_at: row.created_at,
    file: path.basename(row.file), imported: !!row.imported, params: row.params || null,
    progress: prog,
    mode: study ? study.mode : (row.params && row.params.mode) || null,
    timing_valid: study ? !!study.timing_valid : null,
    preset: study ? study.preset : null,
    n_instances: study ? (study.instances || []).length : null,
    n_runs: study ? (study.runs || []).length : null,
    seeds: study ? study.seeds : null,
    commit: study ? study.commit : null,
    // Captured by experiments/study.py at run time, for "Things to know".
    machine: study ? study.machine || null : null,
    workers: study ? study.workers ?? null : null,
    timing_note: study ? study.timing_note || null : null,
    n_configurations: study && Array.isArray(study.configurations) ? study.configurations.length : null,
    n_seeds: study && Array.isArray(study.seeds) ? study.seeds.length : null,
    stop_count: study ? study.stop_count ?? null : null,
    stop_seed: study ? study.stop_seed ?? null : null,
    study_created_at: study ? study.created_at || null : null,
    has_stats: !!st,
    outcome: st ? st.outcome && st.outcome.pattern : null,
    recommendation: st && st.composite && st.composite.recommendation ? st.composite.recommendation.configuration : null,
  };
}

function stripArrangements(study) {
  return {
    ...study,
    runs: (study.runs || []).map(({ placements, orientations, ...rest }) => rest),
  };
}

router.get("/", authRequired, (req, res) => {
  const rows = db.prepare("SELECT * FROM studies WHERE user_id = ? ORDER BY id DESC").all(req.user.id);
  res.json(rows.map((row) => light(row, row.status === "done" || row.status === "imported" ? readJson(row.file) : null)));
});

router.get("/sizes", authRequired, (req, res) => {
  const d = studyDefaults();
  res.json({
    sizes: Object.entries(SIZES).map(([key, s]) => ({ key, ...s, ...(estimateFor(s) || { estimate_s: null, basis_studies: 0 }),
                                                      sample: s.sample ? path.basename(s.sample) : null,
                                                      pop_size: d.presets ? d.presets[s.preset].pop_size : null,
                                                      max_iter: d.presets ? d.presets[s.preset].max_iter : null })),
    defaults: d,
  });
});

router.get("/available", authRequired, (req, res) => {
  const mine = new Set(db.prepare("SELECT * FROM studies WHERE user_id = ? ORDER BY id DESC").all(req.user.id).map((r) => path.resolve(r.file)));
  const files = fs.readdirSync(STUDIES_DIR)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".progress.json"))
    .map((f) => {
      const full = path.join(STUDIES_DIR, f);
      const doc = readJson(full);
      if (!doc || doc.stackr_study !== 1) return null;
      return {
        file: f, imported: mine.has(path.resolve(full)), name: doc.name, size: doc.size, mode: doc.mode,
        n_runs: (doc.runs || []).length, n_instances: (doc.instances || []).length,
        seeds: doc.seeds, preset: doc.preset, created_at: doc.created_at, commit: doc.commit,
        has_stats: !!doc.stats,
      };
    })
    .filter(Boolean);
  res.json(files);
});

router.post("/import", authRequired, (req, res) => {
  const file = req.body && typeof req.body.file === "string" ? path.basename(req.body.file) : null;
  if (!file) return res.status(400).json({ error: "file (basename in experiments/results/studies) required" });
  const full = path.join(STUDIES_DIR, file);
  const doc = readJson(full);
  if (!doc || doc.stackr_study !== 1) return res.status(404).json({ error: "not a STACKR study file" });
  if (!doc.stats) return res.status(422).json({ error: "the study has no stats attached — run python experiments/stats.py on it first" });
  const dup = db.prepare("SELECT * FROM studies WHERE user_id = ? ORDER BY id DESC").all(req.user.id)
    .find((r) => path.resolve(r.file) === path.resolve(full));
  if (dup) return res.json({ id: dup.id, already: true });
  const info = db.prepare("INSERT INTO studies (user_id, name, size, status, file, progress_file, pid, params, imported, runs)")
    .run(req.user.id, doc.name || file, doc.size || "custom", "imported", full, null, null,
         JSON.stringify({ preset: doc.preset && doc.preset.name, mode: doc.mode, seeds: doc.seeds, instances: (doc.instances || []).map((i) => i.instance_id) }),
         1, (doc.runs || []).length);
  res.json({ id: info.lastInsertRowid });
});

router.post("/", authRequired, (req, res) => {
  const b = req.body || {};
  const size = SIZES[b.size] ? b.size : null;
  if (!size && !b.preset) return res.status(400).json({ error: "size (demo|standard|multi) or explicit parameters required" });
  const def = size ? SIZES[size] : {};
  const preset = ["quick", "standard", "full"].includes(b.preset) ? b.preset : def.preset;
  const mode = ["serial", "parallel"].includes(b.mode) ? b.mode : def.mode;
  const seeds = typeof b.seeds === "string" && /^[0-9,\- ]+$/.test(b.seeds) ? b.seeds : def.seeds;
  const instanceId = Number.isInteger(Number(b.instanceId)) && b.instanceId !== undefined && b.instanceId !== null ? Number(b.instanceId) : def.instanceId;
  const customLoad = typeof b.customLoad === "string" && /^[A-Za-z0-9_\-]+$/.test(b.customLoad) ? b.customLoad : null;
  const sample = def.sample || null;
  if (!preset || !mode || !seeds) return res.status(400).json({ error: "preset, mode and seeds are required" });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${size || "custom"}_${stamp}`;
  const out = path.join(STUDIES_DIR, base + ".json");
  const log = path.join(STUDIES_DIR, base + ".log");
  const name = b.name || def.name || "Study";

  const argv = [STUDY_PY, "--preset", preset, "--mode", mode, "--seeds", seeds, "--out", out, "--name", name];
  if (size) argv.push("--size", size);
  if (customLoad) argv.push("--custom-load", customLoad);
  else if (sample && !Number.isInteger(instanceId)) argv.push("--sample", sample);
  else argv.push("--instance", String(instanceId));
  const workers = b.workers && Number.isInteger(Number(b.workers)) ? Number(b.workers) : def.workers;
  if (workers) argv.push("--workers", String(Math.min(Math.max(workers, 1), 32)));

  // Detached: its own process group, stdio to a log file, not tied to this
  // request or any socket. Progress is polled from <out>.progress.json.
  const fd = fs.openSync(log, "a");
  let child;
  try {
    child = spawn("python", argv, { cwd: ROOT, detached: true, stdio: ["ignore", fd, fd], windowsHide: true,
                                    env: { ...process.env, PYTHONMALLOC: "malloc" } });
    child.unref();
  } catch (err) {
    fs.closeSync(fd);
    return res.status(500).json({ error: "could not start python: " + err.message });
  }
  fs.closeSync(fd);
  console.log("STUDY spawn (pid " + child.pid + "):", argv.slice(1).join(" "));

  const params = { size, preset, mode, seeds, instanceId: customLoad ? null : (sample && !Number.isInteger(instanceId) ? null : instanceId),
                   customLoad, sample: sample ? path.basename(sample) : null, argv: argv.slice(1) };
  const info = db.prepare("INSERT INTO studies (user_id, name, size, status, file, progress_file, pid, params, imported, runs)")
    .run(req.user.id, name, size || "custom", "running", out, out + ".progress.json", child.pid,
         JSON.stringify(params), 0, size ? def.runs : null);
  res.json({ id: info.lastInsertRowid, pid: child.pid, file: path.basename(out) });
});

router.get("/:id", authRequired, (req, res) => {
  const row = db.prepare("SELECT * FROM studies WHERE id = ? AND user_id = ?").get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: "Study not found" });
  const prog = syncStatus(row);
  const doc = readJson(row.file);
  if (!doc) return res.json({ ...light(row, null), study: null, progress: prog });
  res.json({ ...light(row, doc), study: stripArrangements(doc) });
});

router.get("/:id/progress", authRequired, (req, res) => {
  const row = db.prepare("SELECT * FROM studies WHERE id = ? AND user_id = ?").get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: "Study not found" });
  res.json({ id: row.id, status: row.status, ...syncStatus(row) });
});

router.get("/:id/runs/:idx/view", authRequired, (req, res) => {
  const row = db.prepare("SELECT * FROM studies WHERE id = ? AND user_id = ?").get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: "Study not found" });
  const idx = Number(req.params.idx);
  if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: "run index must be a non-negative integer" });
  if (!row.file || !fs.existsSync(row.file)) return res.status(404).json({ error: "the study file is missing on disk" });
  const child = spawn("python", [VIEW_PY, "--study", row.file, "--run", String(idx)], { cwd: ROOT, windowsHide: true });
  let out = "", err = "";
  child.stdout.on("data", (c) => { out += c.toString(); });
  child.stderr.on("data", (c) => { err += c.toString(); });
  child.on("error", (e) => res.status(500).json({ error: "could not start python: " + e.message }));
  child.on("close", (code) => {
    if (res.headersSent) return;
    let doc = null;
    try { doc = JSON.parse(out.trim().split(/\r?\n/).pop()); } catch {}
    if (code === 0 && doc && doc.status === "ok") return res.json(doc);
    const msg = (doc && doc.error) || err.trim().split(/\r?\n/).slice(-3).join(" | ") || `exit ${code}`;
    res.status(422).json({ error: msg });
  });
});

router.delete("/:id", authRequired, (req, res) => {
  const row = db.prepare("SELECT * FROM studies WHERE id = ? AND user_id = ?").get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: "Study not found" });
  if (row.status === "running" && pidAlive(row.pid)) {
    try { process.kill(row.pid); } catch {}
  }
  db.prepare("DELETE FROM studies WHERE id = ? AND user_id = ?").run(row.id, req.user.id);
  // A study launched from the UI owns its files; an imported file stays.
  if (!row.imported) {
    for (const f of [row.file, row.progress_file, row.file && row.file.replace(/\.json$/, ".log")]) {
      try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
  res.json({ ok: true });
});

module.exports = { router, SIZES, STUDIES_DIR, estimateFor };
