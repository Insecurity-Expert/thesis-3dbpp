// Runs saved before the M-3 / M-4 fix were timed under tracemalloc and
// without an untimed numba warm-up (about 4x slower on a Quick run) and their
// memory was tracemalloc's traced allocations, not the process peak. Such runs
// carry no metrics.timing_method; their time and memory are marked
// "old measurement" and are not compared with newer runs.
export const OLD_MEASUREMENT = "old measurement";
export const OLD_MEASUREMENT_NOTE =
  "Saved before the timing fix: timed under tracemalloc and without the untimed warm-up (about 4× slower), memory = tracemalloc's traced allocations. Not comparable with newer runs or with the studies.";

// run: a Run History row (the server flags old_measurement) or a result envelope.
export function isOldMeasurement(run) {
  if (!run) return false;
  if (typeof run.old_measurement === "boolean") return run.old_measurement;
  const r = run.result || run;
  if (r && r.metrics) return !r.metrics.timing_method;
  return run.runtime_s != null;
}
