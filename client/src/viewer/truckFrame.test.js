// The door-position helper: the one place every view asks where the door is.
import { truckFrame, DOOR, FRONT_WALL } from "./truckFrame";

const C = { L: 233, H: 220, D: 587 };

test("rows without y_origin are door-based (every producer today)", () => {
  expect(truckFrame(C).origin).toBe(DOOR);
  expect(truckFrame(null).origin).toBe(DOOR);
  expect(truckFrame({ ...C, y_origin: "something else" }).origin).toBe(DOOR);
});

test("door origin: door at render z = 0, front wall at z = D, inward is +z", () => {
  const f = truckFrame({ ...C, y_origin: "door" });
  expect([f.doorZ, f.frontZ, f.inward]).toEqual([0, 587, 1]);
  expect(f.outside(50)).toBe(-50);
  expect([f.doorFace, f.frontFace]).toEqual(["y-", "y+"]);
  expect(f.wallName("y-")).toBe("rear door");
  expect(f.wallName("y+")).toBe("front wall");
});

test("front-wall origin (the paper): door at render z = D, inward is -z", () => {
  const f = truckFrame({ ...C, y_origin: FRONT_WALL });
  expect([f.doorZ, f.frontZ, f.inward]).toEqual([587, 0, -1]);
  expect(f.outside(50)).toBe(637);
  expect([f.doorFace, f.frontFace]).toEqual(["y+", "y-"]);
  expect(f.wallName("y+")).toBe("rear door");
});

test("depth from the front wall and from the door agree across both conventions", () => {
  // The same physical box: 100 cm deep, its door-side face 87 cm from the door.
  const doorBased = { y: 87, dy: 100 };
  const frontBased = { y: 587 - 87 - 100, dy: 100 };
  const d = truckFrame({ ...C, y_origin: DOOR }), w = truckFrame({ ...C, y_origin: FRONT_WALL });
  expect(d.fromFront(doorBased)).toBe(400);
  expect(w.fromFront(frontBased)).toBe(400);
  expect(d.fromDoor(doorBased)).toEqual({ near: 87, far: 187 });
  expect(w.fromDoor(frontBased)).toEqual({ near: 87, far: 187 });
});
