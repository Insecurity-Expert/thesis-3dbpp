// The entry animation: every box starts outside the rear door and ends exactly
// at its spot, whichever end of the depth axis the door is at.
import { entryOffset, OUTSIDE, LIFT } from "./entryMotion";
import { truckFrame } from "./truckFrame";

const C = { L: 233, H: 220, D: 587 };
// Render item: x across, y = base height, z = depth (render), l/h/d its extents.
const floorBox = { x: 0, y: 0, z: 300, l: 50, h: 40, d: 60 };
const topBox = { x: 0, y: 40, z: 300, l: 50, h: 40, d: 60 };
const at = (t, it, f) => { const o = entryOffset(t, it, f, C.H); return { zNear: it.z + o[2], zFar: it.z + it.d + o[2], lift: o[1] }; };

for (const origin of ["door", "front_wall"]) {
  const f = truckFrame({ ...C, y_origin: origin });
  test(`${origin}: starts fully outside the door, ends exactly in place`, () => {
    const s = at(0, floorBox, f);
    if (f.inward > 0) expect(s.zFar).toBeCloseTo(f.doorZ - OUTSIDE);   // whole box on the outside of z = 0
    else expect(s.zNear).toBeCloseTo(f.doorZ + OUTSIDE);                // whole box beyond z = D
    for (const v of entryOffset(1, floorBox, f, C.H)) expect(Math.abs(v)).toBeLessThan(1e-12);
  });
  test(`${origin}: moves only toward the front wall, never sideways`, () => {
    let prev = null;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const o = entryOffset(Math.min(t, 1), floorBox, f, C.H);
      expect(o[0]).toBe(0);
      const depthIn = -o[2] * f.inward;          // distance still to go, >= 0, shrinking
      expect(depthIn).toBeGreaterThanOrEqual(-1e-9);
      if (prev !== null) expect(depthIn).toBeLessThanOrEqual(prev + 1e-9);
      prev = depthIn;
    }
  });
}

test("a box going on top slides in above its spot, then is lowered", () => {
  const f = truckFrame(C);
  expect(at(0, topBox, f).lift).toBe(LIFT);
  expect(at(0.75, topBox, f).lift).toBe(LIFT);            // slide done, still carried
  expect(entryOffset(0.75, topBox, f, C.H)[2]).toBeCloseTo(0);
  expect(at(0.9, topBox, f).lift).toBeLessThan(LIFT);
  expect(at(1, topBox, f).lift).toBe(0);
  expect(at(0.5, floorBox, f).lift).toBe(0);               // floor boxes are never lifted
});
