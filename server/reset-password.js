// server/reset-password.js — administrator password reset, for accounts that
// have no recovery question (made before Forgot password existed) or whose
// owner cannot answer it. Run on the machine that holds the database:
//
//   node server/reset-password.js <email>                 # prints a new temporary password
//   node server/reset-password.js <email> --password <pw> # sets this password
//
// STACKR_DB_FILE selects another database file, as for the server.
const crypto = require("crypto");
const db = require("./db");
const accounts = require("./accounts");

function main(argv) {
  const email = argv[0];
  if (!email || email.startsWith("--")) {
    console.error("usage: node server/reset-password.js <email> [--password <new password>]");
    return 2;
  }
  const i = argv.indexOf("--password");
  const password = i >= 0 ? argv[i + 1] : crypto.randomBytes(6).toString("base64url");
  if (!password) { console.error("--password needs a value"); return 2; }
  const k = accounts.normEmail(email);
  const matches = db.read((data) => data.users.filter((u) => accounts.normEmail(u.email) === k));
  if (matches.length === 0) { console.error(`no account for ${k}`); return 1; }
  if (matches.length > 1) {
    console.error(`${matches.length} accounts share ${k} (ids ${matches.map((u) => u.id).join(", ")}); not reset`);
    return 1;
  }
  accounts.adminReset(k, password);
  console.log(`password reset for ${k}` + (i >= 0 ? "" : `; temporary password: ${password}`));
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main };
