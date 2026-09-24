// server/customLoads.js — custom loads (typed in or imported from a CSV) and
// the ready-made OR-Library samples.
//
// The converter is preprocessing/custom_load.py: its validation messages are
// authoritative (the client may pre-check, never overrule). A converted load is
// stored as experiments/custom_loads/<id>.json and recorded user-scoped in the
// database; runs and studies then read it by id.
//
//   POST /api/instances/custom-load           { source, rows | csv, container, fragile_share, name }
//                                              -> { id, summary } | 422 { errors: [{row, column, message}] }
//   GET  /api/instances/custom-loads          the caller's custom loads
//   GET  /api/instances/custom-load/:id       one load (summary + the boxes as converted)
//   DELETE /api/instances/custom-load/:id
//   GET  /api/instances/custom-load-template/:mode   simple | advanced CSV template
//   GET  /api/instances/samples               ready-made OR-Library samples (computed box counts)
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn, execFile } = require("child_process");
const db = require("./db");
const { authRequired } = require("./auth");

const router = express.Router();
const ROOT = path.join(__dirname, "..");
const CONVERTER = path.join(ROOT, "preprocessing", "custom_load.py");
const LOADS_DIR = process.env.STACKR_CUSTOM_LOADS_DIR
  ? path.resolve(process.env.STACKR_CUSTOM_LOADS_DIR)
  : path.join(ROOT, "experiments", "custom_loads");
const ID_RE = /^cl_[a-f0-9]{16}$/;

// Owned by the caller, or null.
function ownedLoad(user, id) {
  if (!ID_RE.test(String(id || ""))) return null;
  return db.prepare("SELECT * FROM custom_loads WHERE id = ? AND user_id = ?").get(String(id), user.id) || null;
}

router.post("/custom-load", authRequired, express.json({ limit: "5mb" }), (req, res) => {
  const b = req.body || {};
  const request = {
    source: b.source === "csv" ? "csv" : b.source === "typed" ? "typed" : null,
    csv: typeof b.csv === "string" ? b.csv : undefined,
    rows: Array.isArray(b.rows) ? b.rows : undefined,
    container: b.container || {},
    fragile_share: b.fragile_share ?? null,
    name: typeof b.name === "string" ? b.name.slice(0, 120) : null,
  };
  if (!request.source) return res.status(400).json({ errors: [{ row: null, column: null, message: 'source must be "typed" or "csv"' }] });

  const id = "cl_" + crypto.randomBytes(8).toString("hex");
  if (!fs.existsSync(LOADS_DIR)) fs.mkdirSync(LOADS_DIR, { recursive: true });
  const file = path.join(LOADS_DIR, id + ".json");
  const child = spawn("python", [CONVERTER, "convert", "--out", file], {
    cwd: ROOT, windowsHide: true,
    env: { ...process.env, STACKR_CUSTOM_LOADS_DIR: LOADS_DIR, PYTHONIOENCODING: "utf-8" },
  });
  let out = "", err = "";
  child.stdout.on("data", (c) => { out += c.toString(); });
  child.stderr.on("data", (c) => { err += c.toString(); });
  child.on("error", (e) => { if (!res.headersSent) res.status(500).json({ errors: [{ row: null, column: null, message: "could not start python: " + e.message }] }); });
  child.on("close", (code) => {
    if (res.headersSent) return;
    let doc = null;
    try { doc = JSON.parse(out.trim().split(/\r?\n/).pop()); } catch {}
    if (!doc) return res.status(500).json({ errors: [{ row: null, column: null, message: "converter failed: " + (err.trim().split(/\r?\n/).slice(-2).join(" | ") || `exit ${code}`) }] });
    if (!doc.ok) return res.status(422).json({ errors: doc.errors });
    const s = doc.summary;
    db.prepare("INSERT INTO custom_loads (id, user_id, name, source, n_boxes, file, summary)")
      .run(id, req.user.id, s.name, s.source, s.totals.boxes, file, JSON.stringify(s));
    res.json({ id, summary: s });
  });
  child.stdin.end(JSON.stringify(request));
});

router.get("/custom-loads", authRequired, (req, res) => {
  const rows = db.prepare("SELECT * FROM custom_loads WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
  res.json(rows.map(({ file, ...r }) => ({ ...r, available: fs.existsSync(file) })));
});

router.get("/custom-load/:id", authRequired, (req, res) => {
  const row = ownedLoad(req.user, req.params.id);
  if (!row) return res.status(404).json({ error: "Custom load not found" });
  let doc = null;
  try { doc = JSON.parse(fs.readFileSync(row.file, "utf8")); } catch {}
  if (!doc) return res.status(404).json({ error: "the custom load file is missing on disk" });
  res.json({
    id: row.id, created_at: row.created_at, summary: row.summary,
    label: doc.label, name: doc.name, source: doc.source, mode: doc.mode,
    container: doc.container, raw_container: doc.raw.container, max_weight_kg: doc.max_weight_kg,
    boxes: doc.boxes, box_rows: doc.box_rows, row_names: doc.row_names,
  });
});

router.delete("/custom-load/:id", authRequired, (req, res) => {
  const row = ownedLoad(req.user, req.params.id);
  if (!row) return res.status(404).json({ error: "Custom load not found" });
  db.prepare("DELETE FROM custom_loads WHERE id = ? AND user_id = ?").run(row.id, req.user.id);
  // The file stays: saved runs and studies made on it still read it.
  res.json({ ok: true });
});

router.get("/custom-load-template/:mode", (req, res) => {
  const mode = req.params.mode === "advanced" ? "advanced" : "simple";
  execFile("python", [CONVERTER, "template", mode], { cwd: ROOT, windowsHide: true }, (e, stdout) => {
    if (e) return res.status(500).json({ error: e.message });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="stackr_boxes_${mode}.csv"`);
    res.send(stdout);
  });
});

// Computed once per server process (700 instances, a few seconds).
let samplesCache = null;
router.get("/samples", (req, res) => {
  if (samplesCache) return res.json(samplesCache);
  execFile("python", [CONVERTER, "samples"], { cwd: ROOT, windowsHide: true, maxBuffer: 8 << 20 }, (e, stdout) => {
    if (e) return res.status(500).json({ error: e.message });
    try { samplesCache = JSON.parse(stdout); } catch (err) { return res.status(500).json({ error: err.message }); }
    res.json(samplesCache);
  });
});

module.exports = { router, ownedLoad, LOADS_DIR };
