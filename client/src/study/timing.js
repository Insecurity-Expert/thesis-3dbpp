// Timing validity of a study (parallel runs share the CPU, so their execution
// times, peak memory and anything built on them - the composite score - are
// not comparable). One rule for every screen that shows those figures.
export function timingValid(study, stats) {
  if (stats && stats.timing && typeof stats.timing.valid === "boolean") return stats.timing.valid;
  if (stats && stats.provenance && typeof stats.provenance.timing_valid === "boolean") return stats.provenance.timing_valid;
  if (study && typeof study.timing_valid === "boolean") return study.timing_valid;
  return !!study && study.mode === "serial";
}

export const TIMING_INVALID_SHORT = "invalid: parallel runs";
export const TIMING_INVALID_NOTE =
  "Invalid — this study ran several optimizers at once (parallel), so they shared the CPU. Time, memory and the composite score are not comparable across methods; rerun the study serially to compare them.";
