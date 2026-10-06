import { isOldMeasurement } from "./measurement";

test("old measurement: server flag first, then the stored envelope", () => {
  expect(isOldMeasurement({ old_measurement: true })).toBe(true);
  expect(isOldMeasurement({ old_measurement: false })).toBe(false);
  expect(isOldMeasurement({ metrics: { M3_execution_time_ms: 1 } })).toBe(true);
  expect(isOldMeasurement({ metrics: { timing_method: "psutil" } })).toBe(false);
  expect(isOldMeasurement({ result: { metrics: { timing_method: "psutil" } } })).toBe(false);
  expect(isOldMeasurement({ runtime_s: 4.2 })).toBe(true);        // pre-capture row with a time
  expect(isOldMeasurement({ runtime_s: null, status: "failed" })).toBe(false);
  expect(isOldMeasurement(null)).toBe(false);
});
