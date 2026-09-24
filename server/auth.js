// server/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const COOKIE = "stackr_token";

function sign(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authRequired(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
}

router.post("/register", (req, res) => {
  const { email, name, password, role } = req.body || {};
  if (!email || !name || !password)
    return res.status(400).json({ error: "email, name, password required" });
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) return res.status(409).json({ error: "Email already registered" });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare("INSERT INTO users (email, name, role, pass_hash) VALUES (?,?,?,?)")
    .run(email, name, role || "researcher", hash);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);

  res
    .cookie(COOKIE, sign(user), { httpOnly: true, sameSite: "lax", maxAge: 7 * 864e5 })
    .json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.pass_hash))
    return res.status(401).json({ error: "Wrong email or password" });

  res
    .cookie(COOKIE, sign(user), { httpOnly: true, sameSite: "lax", maxAge: 7 * 864e5 })
    .json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE).json({ ok: true });
});

router.get("/me", authRequired, (req, res) => {
  const u = db.prepare("SELECT id,email,name,role,created_at FROM users WHERE id = ?")
    .get(req.user.id);
  res.json(u);
});

// Per-row summary for the history table, read from the stored envelope.
// null means "not recorded for this row", never zero.
function runSummary(row) {
  const r = row.result || null;
  const cd = r && r.metrics && r.metrics.constraint_detail;
  const p = r && r.params;
  const pct = (k) => (cd && typeof cd[k] === "number" ? cd[k] : null);
  return {
    status: row.status || "ok",
    c3_pct: pct("C3_weight_pct"), c4_pct: pct("C4_fragility_pct"),
    c5_pct: pct("C5_balance_pct"), c6_pct: pct("C6_stop_order_pct"),
    unplaced: r && typeof r.unplaced === "number" ? r.unplaced
      : (row.n_items != null && row.placed != null ? row.n_items - row.placed : null),
    budget_exhausted: r && typeof r.budget_exhausted === "boolean" ? r.budget_exhausted : null,
    enforce_support: p && typeof p.enforce_support === "boolean" ? p.enforce_support : null,
    enforce_fragility: p && typeof p.enforce_fragility === "boolean" ? p.enforce_fragility : null,
    pop_size: p && p.pop_size != null ? p.pop_size : null,
    max_iter: p && p.max_iter != null ? p.max_iter : null,
    has_problem_view: !!(r && r.problem_view),
    // Custom loads (preprocessing/custom_load.py) are never thesis data.
    custom_load: row.dataset === "custom" ? {
      id: (r && r.custom_load && r.custom_load.id) || row.instance, label: (r && r.custom_load && r.custom_load.label) || "Custom load — not part of the thesis dataset",
      name: r && r.custom_load ? r.custom_load.name : null,
    } : null,
    // Rows from the retired manual entry (/api/instances/custom, BR JSON path),
    // which filled in synthetic weights.
    old_manual_entry: row.dataset !== "wtpack" && row.dataset !== "custom" &&
      /[\\/]custom[\\/]custom\.json$/.test(String(row.instance || "")),
  };
}

router.get("/runs", authRequired, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM runs WHERE user_id = ? ORDER BY id DESC LIMIT 100")
    .all(req.user.id);
  // Listing stays light: the full envelope is fetched per run on load.
  res.json(rows.map((row) => {
    const { result, convergence, ...rest } = row;
    return {
      ...rest,
      ...runSummary(row),
      has_result: !!result,
      has_convergence: Array.isArray(convergence) && convergence.length > 0,
    };
  }));
});

router.get("/runs/:id", authRequired, (req, res) => {
  const row = db
    .prepare("SELECT * FROM runs WHERE id = ? AND user_id = ?")
    .get(Number(req.params.id), req.user.id);
  if (!row) return res.status(404).json({ error: "Run not found" });
  res.json(row);
});

router.post("/runs", authRequired, (req, res) => {
  const r = req.body || {};
  // Legacy columns stay so old rows keep loading; result_json holds the full
  // instance_complete envelope and convergence_json the streamed series.
  // NOTE: db.js pattern-matches this literal — any new column goes in BOTH.
  const info = db
    .prepare(`INSERT INTO runs
      (user_id, strategy, instance, n_items, space_util, dissipation, runtime_s, bins_used, placements_json, container_json,
       strategy_code, dataset, seed, csr, placed, label, result_json, convergence_json, status, error)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(req.user.id, r.strategy, r.instance, r.n_items, r.space_util,
         r.dissipation, r.runtime_s, r.bins_used,
         r.placements ? JSON.stringify(r.placements) : null,
         r.container ? JSON.stringify(r.container) : null,
         r.strategy_code ?? null, r.dataset ?? null, r.seed ?? null, r.csr ?? null, r.placed ?? null,
         r.label ?? null,
         r.result ? JSON.stringify(r.result) : null,
         r.convergence ? JSON.stringify(r.convergence) : null,
         r.status === "failed" ? "failed" : "ok",
         r.error ? String(r.error).slice(0, 2000) : null);
  res.json({ id: info.lastInsertRowid });
});

router.patch("/runs/:id", authRequired, (req, res) => {
  const label = req.body && typeof req.body.label === "string" ? req.body.label.slice(0, 120) : null;
  const info = db
    .prepare("UPDATE runs SET label = ? WHERE id = ? AND user_id = ?")
    .run(label, Number(req.params.id), req.user.id);
  if (!info.changes) return res.status(404).json({ error: "Run not found" });
  res.json({ id: Number(req.params.id), label });
});

router.delete("/runs/:id", authRequired, (req, res) => {
  const info = db
    .prepare("DELETE FROM runs WHERE id = ? AND user_id = ?")
    .run(Number(req.params.id), req.user.id);
  if (!info.changes) return res.status(404).json({ error: "Run not found" });
  res.json({ ok: true });
});

// The signed-in user for a request that did not go through express (the
// WebSocket upgrade): parse the cookie header and verify the token.
function userFromCookieHeader(header) {
  const m = String(header || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!m) return null;
  try { return jwt.verify(decodeURIComponent(m.slice(COOKIE.length + 1)), JWT_SECRET); } catch { return null; }
}

module.exports = { router, authRequired, userFromCookieHeader };