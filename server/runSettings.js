// server/runSettings.js — the calibrated λ (C3/C4/C5/C6 penalty weights) and
// decode-time enforcement flags, read from experiments/calibration.json, as
// explicit command-line arguments. Every Quick Test and every comparison the
// server launches passes these; nothing relies on an optimizer or CLI default.
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "experiments", "calibration.json");
const CAL = JSON.parse(fs.readFileSync(FILE, "utf8"));

// Same flags for optimizer/main_optimizer.py and experiments/study.py.
function calibratedArgs() {
  const l = CAL.lambdas;
  return [
    "--lambda-w", String(l.w), "--lambda-f", String(l.f), "--lambda-b", String(l.b), "--lambda-a", String(l.a),
    CAL.enforce_support ? "--enforce-support" : "--no-enforce-support",
    CAL.enforce_fragility ? "--enforce-fragility" : "--no-enforce-fragility",
  ];
}

module.exports = { CAL, calibratedArgs };
