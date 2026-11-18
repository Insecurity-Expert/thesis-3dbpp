// SP1 on compliant SU in the Statistics page's texts (study/verdicts.js).
import { sp1Shown, sp1Summary, shownOutcome, shownFamily, familySummary } from "./verdicts";

const cmp = (p) => ({ omnibus: { testable: true, test: "repeated-measures ANOVA", p, significant: true }, pairs: [] });
const family = (m) => ({ decision: "H0 rejected", tests: [
  { measure: m, testable: true, p: 1e-9, p_holm: 6e-9, significant_holm: true },
  { measure: "CSR", testable: true, p: 1e-8, p_holm: 5e-8, significant_holm: true }] });
const raw = { SP1: { comparison: cmp(0.01) }, outcome: { pattern: "D" }, hypothesis_family: family("SU"), labels: {} };

test("older stats (raw SU only): SP1, outcome and H0 family stay on container fill", () => {
  expect(sp1Shown(raw).code).toBe("SU");
  expect(shownOutcome(raw).pattern).toBe("D");
  expect(shownFamily(raw).tests[0].measure).toBe("SU");
  expect(familySummary(raw)).toMatch(/Six tests \(container fill;/);
});

test("stats with compliant SU: SP1, outcome and H0 family switch to compliant fill", () => {
  const st = { ...raw, SP1_compliant: { comparison: cmp(1e-20) }, planned_family_compliant: { outcome: { pattern: "A" } },
               hypothesis_family_compliant: family("CSU") };
  const s = sp1Shown(st);
  expect(s.code).toBe("CSU");
  expect(s.cmp.omnibus.p_holm).toBe(6e-9);                 // Holm p from the compliant six-test family
  expect(sp1Summary(st)).toMatch(/compliant fill/);
  expect(shownOutcome(st).pattern).toBe("A");
  expect(familySummary(st)).toMatch(/Six tests \(compliant fill;/);
});
