// tools/test_auth.js — accounts, sign-in, recovery and the database guard.
//
//   cd server && npm install && cd .. && node tools/test_auth.js
//
// Runs the real auth router against a scratch database file (STACKR_DB_FILE),
// never server/data/db_mock.json.
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "stackr-auth-"));
const DB = path.join(TMP, "db.json");
process.env.STACKR_DB_FILE = DB;
delete process.env.STACKR_DEMO_EMAIL;
delete process.env.STACKR_DEMO_PASSWORD;

const SERVER = path.join(__dirname, "..", "server");
const express = require(path.join(SERVER, "node_modules", "express"));
const cookieParser = require(path.join(SERVER, "node_modules", "cookie-parser"));
const bcrypt = require(path.join(SERVER, "node_modules", "bcryptjs"));
const db = require(path.join(SERVER, "db"));
const accounts = require(path.join(SERVER, "accounts"));
const { router } = require(path.join(SERVER, "auth"));
const resetCli = require(path.join(SERVER, "reset-password"));

let failed = 0;
function check(label, cond, detail) {
  if (!cond) failed += 1;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${cond || detail === undefined ? "" : `  (${detail})`}`);
}
const fresh = (data) => {
  for (const f of [DB, DB + ".bak", DB + ".tmp"]) if (fs.existsSync(f)) fs.unlinkSync(f);
  if (data) fs.writeFileSync(DB, JSON.stringify(data, null, 2));
};
const users = () => JSON.parse(fs.readFileSync(DB, "utf8")).users;
const Q = accounts.RECOVERY_QUESTIONS[1];

async function main() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/auth", router);
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));   // eslint-disable-line no-unused-vars
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  const post = async (p, body) => {
    const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch { /* not JSON */ }
    return { status: r.status, body: j };
  };
  const reg = (email, extra = {}) => post("/register", { email, name: "Lydia", password: "pw-123456",
                                                        recovery_question: Q, recovery_answer: "  Quezon   City ", ...extra });

  console.log("[email normalisation]");
  fresh();
  let r = await reg("  Lydia@Example.COM ");
  check("register with mixed case and spaces", r.status === 200, r.status);
  check("stored trimmed and lower-cased", users()[0].email === "lydia@example.com", users()[0].email);
  for (const e of ["lydia@example.com", "LYDIA@EXAMPLE.COM", " Lydia@Example.com  "]) {
    r = await post("/login", { email: e, password: "pw-123456" });
    check(`sign in as "${e}"`, r.status === 200, r.status);
  }
  r = await post("/login", { email: "lydia@example.com", password: "wrong" });
  check("wrong password refused", r.status === 401, r.status);
  r = await reg("LYDIA@example.com");
  check("same email in other case -> 409", r.status === 409, r.status);
  r = await post("/register", { email: "x@y.z", name: "X", password: "p" });
  check("registration without a recovery question -> 400", r.status === 400, r.status);
  check("answer stored only as a bcrypt hash", users()[0].recovery_answer_hash.startsWith("$2")
        && !JSON.stringify(users()).toLowerCase().includes("quezon"));

  console.log("[migration of existing accounts]");
  const h = bcrypt.hashSync("old-pass", 4);
  fresh({ users: [
    { id: 1, email: " Old@Mixed.Case ", name: "A", pass_hash: h },
    { id: 2, email: "Twin@x.com", name: "B", pass_hash: h },
    { id: 3, email: "twin@x.com", name: "C", pass_hash: bcrypt.hashSync("other", 4) },
  ], runs: [], studies: [], custom_loads: [] });
  let m = accounts.migrateEmails(() => {});
  check("one account normalised", m.changed === 1 && users()[0].email === "old@mixed.case", JSON.stringify(m));
  check("case-only duplicates reported, not merged", m.collisions.length === 1 && users().length === 3);
  m = accounts.migrateEmails(() => {});
  check("migration is idempotent (nothing to do the second time)", m.changed === 0);
  r = await post("/login", { email: "OLD@mixed.case", password: "old-pass" });
  check("migrated account signs in", r.status === 200, r.status);
  r = await post("/login", { email: "TWIN@X.COM", password: "other" });
  check("case-duplicate: the account whose password matches signs in", r.status === 200 && r.body.id === 3, JSON.stringify(r.body));

  console.log("[demo account seed]");
  fresh();
  check("seed creates the demo account", accounts.seedDemoAccount({}, () => {}) === true);
  check("seed is idempotent", accounts.seedDemoAccount({}, () => {}) === false && users().length === 1);
  r = await post("/login", { email: "Admin@Gmail.com", password: accounts.DEMO_PASSWORD_DEFAULT });
  check("demo signs in with the default password", r.status === 200, r.status);
  fresh({ users: [{ id: 7, email: "ADMIN@gmail.com ", name: "existing", pass_hash: h }], runs: [], studies: [], custom_loads: [] });
  check("existing account with the same email (other case) -> not seeded",
        accounts.seedDemoAccount({}, () => {}) === false && users().length === 1);
  fresh();
  accounts.seedDemoAccount({ STACKR_DEMO_EMAIL: "Demo@STACKR.local", STACKR_DEMO_PASSWORD: "from-env" }, () => {});
  r = await post("/login", { email: "demo@stackr.local", password: "from-env" });
  check("STACKR_DEMO_EMAIL / STACKR_DEMO_PASSWORD are used", r.status === 200, r.status);

  console.log("[forgot password]");
  fresh();
  await reg("lydia@example.com");
  r = await post("/forgot/question", { email: " LYDIA@example.com" });
  check("question returned for the account", r.status === 200 && r.body.question === Q, JSON.stringify(r.body));
  r = await post("/forgot/reset", { email: "lydia@example.com", answer: "Manila", new_password: "new-pw" });
  check("wrong answer -> 401", r.status === 401, r.status);
  r = await post("/forgot/reset", { email: "lydia@example.com", answer: "quezon city", new_password: "new-pw" });
  check("right answer (any case / spacing) resets", r.status === 200, JSON.stringify(r.body));
  r = await post("/login", { email: "lydia@example.com", password: "new-pw" });
  check("new password signs in", r.status === 200, r.status);
  r = await post("/login", { email: "lydia@example.com", password: "pw-123456" });
  check("old password no longer works", r.status === 401, r.status);
  for (let i = 0; i < accounts.MAX_FAILS; i++) await post("/forgot/reset", { email: "lydia@example.com", answer: "nope", new_password: "x" });
  r = await post("/forgot/reset", { email: "lydia@example.com", answer: "quezon city", new_password: "x" });
  check(`locked after ${accounts.MAX_FAILS} wrong answers, even with the right one`, r.status === 429, r.status);
  accounts._attempts.clear();
  fresh({ users: [{ id: 1, email: "noq@x.com", name: "N", pass_hash: h }], runs: [], studies: [], custom_loads: [] });
  r = await post("/forgot/question", { email: "noq@x.com" });
  check("account without a question -> 404 naming the admin reset", r.status === 404 && /reset-password/.test(r.body.error), JSON.stringify(r.body));
  r = await post("/forgot/question", { email: "nobody@x.com" });
  check("unknown email -> the same 404 message", r.status === 404 && r.body.error === accounts.NO_QUESTION);

  console.log("[admin reset]");
  const log = console.log, err = console.error; let out = "";
  console.log = (s) => { out += s; }; console.error = (s) => { out += s; };
  const code = resetCli.main(["NOQ@x.com", "--password", "admin-set"]);
  console.log = log; console.error = err;
  check("reset-password.js exits 0", code === 0, out);
  r = await post("/login", { email: "noq@x.com", password: "admin-set" });
  check("admin-set password signs in", r.status === 200, r.status);

  console.log("[database guard]");
  fresh({ users: [{ id: 1, email: "a@b.c", name: "A", pass_hash: h }], runs: [], studies: [], custom_loads: [] });
  await reg("second@x.com");
  const snapshot = fs.readFileSync(DB, "utf8");
  db.mutate((data) => { data.users[0].name = "renamed"; });
  check("a write first backs up the file exactly as it was", fs.readFileSync(DB + ".bak", "utf8") === snapshot);
  check("and then writes the new content", users()[0].name === "renamed");
  check("no temporary file left behind", !fs.existsSync(DB + ".tmp"));
  const before = fs.readFileSync(DB, "utf8");
  const corrupt = before.slice(0, before.length >> 1);   // half-written file
  fs.writeFileSync(DB, corrupt);
  r = await reg("third@x.com");
  check("unreadable database -> 500 with the reason", r.status === 500 && /could not be read/.test(r.body.error), JSON.stringify(r.body));
  check("the unreadable file is left untouched (no empty database written)", fs.readFileSync(DB, "utf8") === corrupt);
  r = await post("/login", { email: "a@b.c", password: "old-pass" });
  check("sign-in on an unreadable database fails, it does not succeed on empty data", r.status === 500, r.status);
  let threw = false;
  try { accounts.seedDemoAccount({}, () => {}); } catch { threw = true; }
  check("startup seed refuses to write over an unreadable file", threw && fs.readFileSync(DB, "utf8") === corrupt);
  fs.writeFileSync(DB, JSON.stringify({ something: "else" }));
  r = await post("/login", { email: "a@b.c", password: "old-pass" });
  check("a file without users / runs lists is also refused", r.status === 500, r.status);

  server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${failed ? "FAIL" : "PASS"} - ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
