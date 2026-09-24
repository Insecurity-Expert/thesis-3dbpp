// The four configurations: study name + a nickname that describes the
// MECHANISM, never a result (no "safe", "best", "fast").
export const METHODS = {
  DGWO:  { code: "DGWO",  name: "DGWO",         nick: "single-goal packer",
           how: "Searches on one score: container fill minus a penalty for each rule broken." },
  MOGWO: { code: "MOGWO", name: "MOGWO",        nick: "two-goal balancer",
           how: "Keeps the arrangements where container fill cannot improve without the rule score getting worse (and vice versa), and steers the search by them." },
  SEQ:   { code: "SEQ",   name: "Sequential",   nick: "two-stage",
           how: "Runs DGWO for the first half of its iterations, then continues from that population with MOGWO." },
  REP:   { code: "REP",   name: "Repair-Based", nick: "fixes every placement (may load fewer boxes)",
           how: "Moves every box that breaks a rule to a spot where it follows them; a box with no such spot is left out." },
};

const ALIASES = { dgwo: "DGWO", mogwo: "MOGWO", seq: "SEQ", sequential: "SEQ", rep: "REP", "repair-based": "REP", repairbased: "REP" };

export function methodOf(codeOrLabel) {
  if (!codeOrLabel) return null;
  const k = ALIASES[String(codeOrLabel).toLowerCase().replace(/\s+/g, "")];
  return k ? METHODS[k] : null;
}

// "DGWO — single-goal packer"; unknown strategies (e.g. legacy HDGWO) pass through.
export function methodLabel(codeOrLabel) {
  const m = methodOf(codeOrLabel);
  return m ? `${m.name} — ${m.nick}` : (codeOrLabel || "—");
}
