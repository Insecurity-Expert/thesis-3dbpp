// server/accounts.js — account housekeeping that is not a single request:
// email normalisation (and its one-time migration), the demo account seed,
// password recovery by a security question, and the attempt limit on it.
const bcrypt = require("bcryptjs");
const db = require("./db");

const normEmail = db.normEmail;

// Answers are compared case- and space-insensitively ("  Manila " == "manila").
const normAnswer = (a) => String(a == null ? "" : a).trim().toLowerCase().replace(/\s+/g, " ");

// Fixed list: a free-text question is easy to make guessable.
const RECOVERY_QUESTIONS = [
  "What was the name of your first pet?",
  "In what city were you born?",
  "What was the name of your elementary school?",
  "What is your favorite book or movie?",
  "What was your childhood nickname?",
];

const DEMO_EMAIL_DEFAULT = "admin@gmail.com";
const DEMO_PASSWORD_DEFAULT = "stackr-demo";   // local use only; override with STACKR_DEMO_PASSWORD

// ── one-time migration: stored emails trimmed + lower-cased ─────────────────
// Two accounts that only differ by case would collide; they are left as they
// are (and reported) rather than merged. Sign-in still finds them, because
// lookups compare normalised emails and try each matching account.
function migrateEmails(log = console.log) {
  return db.mutate((data) => {
    const groups = new Map();
    for (const u of data.users) {
      const k = normEmail(u.email);
      groups.set(k, (groups.get(k) || []).concat(u));
    }
    let changed = 0;
    const collisions = [];
    for (const [k, users] of groups) {
      if (users.length > 1) { collisions.push(k); continue; }
      if (users[0].email !== k) { users[0].email = k; changed += 1; }
    }
    if (changed) log(`accounts: normalised ${changed} stored email(s) (trimmed, lower-cased)`);
    if (collisions.length) log(`accounts: WARNING ${collisions.length} email(s) belong to more than one account and were left unchanged: ${collisions.join(", ")}`);
    return changed ? { changed, collisions } : false;   // false = nothing to save
  }) || { changed: 0, collisions: [] };
}

// ── demo account: created once, keyed on the normalised email ───────────────
function seedDemoAccount(env = process.env, log = console.log) {
  const email = normEmail(env.STACKR_DEMO_EMAIL || DEMO_EMAIL_DEFAULT);
  const password = env.STACKR_DEMO_PASSWORD || DEMO_PASSWORD_DEFAULT;
  const created = db.mutate((data) => {
    if (data.users.some((u) => normEmail(u.email) === email)) return false;
    const id = data.users.length ? Math.max(...data.users.map((u) => u.id)) + 1 : 1;
    data.users.push({
      id, email, name: "Demo account", role: "researcher",
      pass_hash: bcrypt.hashSync(password, 10),
      created_at: new Date().toISOString(),
      howto_auto_shown: false, demo: true,
    });
    return true;
  });
  if (created) {
    log(`accounts: demo account ${email} created` +
        (env.STACKR_DEMO_PASSWORD ? " (password from STACKR_DEMO_PASSWORD)" : ` (default password "${DEMO_PASSWORD_DEFAULT}")`));
  }
  return Boolean(created);
}

// ── sign-in: every account whose normalised email matches ───────────────────
function findForLogin(email, password) {
  const k = normEmail(email);
  const users = db.read((data) => data.users.filter((u) => normEmail(u.email) === k));
  return users.find((u) => u.pass_hash && bcrypt.compareSync(String(password || ""), u.pass_hash)) || null;
}

// ── password recovery ───────────────────────────────────────────────────────
const NO_QUESTION = "No recovery question is set for this account. Ask the administrator to reset the " +
                    "password (on the server machine: node server/reset-password.js <email>).";

function recoveryQuestion(email) {
  const k = normEmail(email);
  const u = db.read((data) => data.users.find((x) => normEmail(x.email) === k && x.recovery_question && x.recovery_answer_hash));
  return u ? u.recovery_question : null;
}

// Attempt limit per email: MAX_FAILS wrong answers lock the reset for LOCK_MS.
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map();   // normalised email -> { fails, lockedUntil }

function lockState(k, now = Date.now()) {
  const a = attempts.get(k);
  return a && a.lockedUntil && a.lockedUntil > now ? a.lockedUntil : null;
}

// Returns { ok } or { status, error }.
function resetWithAnswer(email, answer, newPassword, now = Date.now()) {
  const k = normEmail(email);
  if (!k || !answer || !newPassword) return { status: 400, error: "email, answer and new password are required" };
  const locked = lockState(k, now);
  if (locked) return { status: 429, error: `Too many wrong answers. Try again in ${Math.ceil((locked - now) / 60000)} minute(s), or ask the administrator.` };
  const target = db.read((data) => data.users.find((x) => normEmail(x.email) === k && x.recovery_answer_hash));
  if (!target) return { status: 404, error: NO_QUESTION };
  if (!bcrypt.compareSync(normAnswer(answer), target.recovery_answer_hash)) {
    const a = attempts.get(k) || { fails: 0, lockedUntil: null };
    a.fails += 1;
    if (a.fails >= MAX_FAILS) { a.fails = 0; a.lockedUntil = now + LOCK_MS; }
    attempts.set(k, a);
    return { status: 401, error: "The answer does not match." };
  }
  attempts.delete(k);
  db.mutate((data) => {
    const u = data.users.find((x) => x.id === target.id);
    u.pass_hash = bcrypt.hashSync(String(newPassword), 10);
    u.password_reset_at = new Date().toISOString();
  });
  return { ok: true };
}

// Admin path (server/reset-password.js): no question needed.
function adminReset(email, newPassword) {
  const k = normEmail(email);
  return db.mutate((data) => {
    const users = data.users.filter((x) => normEmail(x.email) === k);
    if (users.length !== 1) return false;
    users[0].pass_hash = bcrypt.hashSync(String(newPassword), 10);
    users[0].password_reset_at = new Date().toISOString();
    return users[0].id;
  }) || null;
}

function hashAnswer(answer) { return bcrypt.hashSync(normAnswer(answer), 10); }

module.exports = {
  RECOVERY_QUESTIONS, NO_QUESTION, DEMO_EMAIL_DEFAULT, DEMO_PASSWORD_DEFAULT, MAX_FAILS, LOCK_MS,
  normEmail, normAnswer, hashAnswer, migrateEmails, seedDemoAccount, findForLogin,
  recoveryQuestion, resetWithAnswer, adminReset, _attempts: attempts,
};
