// server/errors.js — Express error handler that answers in JSON.
// It keeps the status the error carries (body-parser marks a malformed JSON
// body 400, an oversized one 413); anything without one is a server error,
// 500, reported with its message (e.g. an unreadable database, see db.js).
function jsonErrors(err, req, res, next) {
  const s = Number(err && (err.status || err.statusCode));
  const status = Number.isInteger(s) && s >= 400 && s < 600 ? s : 500;
  if (status >= 500) console.error("request failed:", err && err.message);
  if (res.headersSent) return next(err);
  res.status(status).json({ error: (err && err.message) || "request failed" });
}

module.exports = { jsonErrors };
