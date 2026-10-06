import { timingValid } from "./timing";

test("timing validity: stats first, then the study file, then the mode", () => {
  expect(timingValid({ mode: "parallel", timing_valid: false }, { timing: { valid: false } })).toBe(false);
  expect(timingValid({ mode: "serial", timing_valid: true }, { timing: { valid: true } })).toBe(true);
  expect(timingValid({ mode: "parallel", timing_valid: false }, { provenance: { timing_valid: false } })).toBe(false);
  expect(timingValid({ mode: "parallel" }, null)).toBe(false);
  expect(timingValid({ mode: "serial" }, null)).toBe(true);
  expect(timingValid(null, null)).toBe(false);
});
