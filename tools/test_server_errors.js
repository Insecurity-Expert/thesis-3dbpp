// tools/test_server_errors.js — server error handling.
//
//   cd server && npm install && cd .. && node tools/test_server_errors.js
//
// 1. A malformed JSON body is answered 400 (the error's own status), not 500.
// 2. A database error inside a route is a JSON 500.
// 3. Saving a custom load while the database file is unreadable answers 500
//    from the converter's callback, and the server keeps serving (the error
//    used to be thrown outside Express and stop the process). Runs the real
//    converter, so Python with the project's requirements must be on PATH as
//    "python" (as for the server).
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "stackr-errors-"));
const DB = path.join(TMP, "db.json");
process.env.STACKR_DB_FILE = DB;
process.env.STACKR_CUSTOM_LOADS_DIR = path.join(TMP, "loads");

const SERVER = path.join(__dirname, "..", "server");
const express = require(path.join(SERVER, "node_modules", "express"));
const cookieParser = require(path.join(SERVER, "node_modules", "cookie-parser"));
const { router: authRouter } = require(path.join(SERVER, "auth"));
const { router: loadsRouter } = require(path.join(SERVER, "customLoads"));
const { jsonErrors } = require(path.join(SERVER, "errors"));
const { RECOVERY_QUESTIONS } = require(path.join(SERVER, "accounts"));

let failed = 0;
function check(label, cond, detail) {
  if (!cond) failed += 1;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${cond || detail === undefined ? "" : `  (${detail})`}`);
}

let uncaught = null;
process.on("uncaughtException", (e) => { uncaught = e; });

async function main() {
  // Mounted as in index.js: custom loads (own JSON parser) before the global one.
  const app = express();
  app.use(cookieParser());
  app.use("/api/instances", loadsRouter);
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use(jsonErrors);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, body, cookie, raw) => {
    let r;
    try {
      r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
                                  body: raw !== undefined ? raw : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    } catch (e) {
      return { status: "no answer (" + e.name + ")", body: null, cookie: null };   // the request was never answered
    }
    let j = null; try { j = await r.json(); } catch { /* not JSON */ }
    return { status: r.status, body: j, cookie: r.headers.get("set-cookie") };
  };

  console.log("[status codes]");
  let r = await call("/api/auth/login", null, null, "{bad json");
  check("malformed JSON body -> 400", r.status === 400, r.status);
  check("... answered as JSON", r.body && typeof r.body.error === "string", JSON.stringify(r.body));

  const reg = await call("/api/auth/register", { email: "e@x.com", name: "E", password: "pw",
                                                 recovery_question: RECOVERY_QUESTIONS[0], recovery_answer: "a" });
  check("register (setup)", reg.status === 200, reg.status);
  const cookie = (reg.cookie || "").split(";")[0];

  const good = fs.readFileSync(DB, "utf8");
  fs.writeFileSync(DB, good.slice(0, good.length >> 1));        // half-written file
  r = await call("/api/auth/login", { email: "e@x.com", password: "pw" });
  check("database error in a route -> JSON 500", r.status === 500 && /could not be read/.test(r.body && r.body.error), JSON.stringify(r.body));

  console.log("[custom load saved while the database is unreadable]");
  r = await call("/api/instances/custom-load", {
    source: "typed", name: "t",
    container: { length: 587, width: 233, height: 220 },
    rows: [{ name: "A", length: 60, width: 40, height: 50, weight: 20, max_load: 120, qty: 7 },
           { name: "B", length: 40, width: 30, height: 30, weight: 8, max_load: 24, qty: 5 }],
  }, cookie);
  check("answered 500 with the reason", r.status === 500 && /could not save the load/.test(JSON.stringify(r.body)), `${r.status} ${JSON.stringify(r.body)}`);
  check("no exception escaped to the process", uncaught === null, uncaught && uncaught.message);
  const left = fs.existsSync(process.env.STACKR_CUSTOM_LOADS_DIR) ? fs.readdirSync(process.env.STACKR_CUSTOM_LOADS_DIR) : [];
  check("the converted file is not kept without its record", left.length === 0, left.join(", "));
  fs.writeFileSync(DB, good);
  r = await call("/api/auth/login", { email: "e@x.com", password: "pw" });
  check("the server still answers afterwards", r.status === 200, r.status);

  server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${failed ? "FAIL" : "PASS"} - ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
