// Where the box coming in through the rear door is, during its move. Render
// coordinates; the door comes from truckFrame, never from a constant.
// The box starts fully outside the truck at its final x and height (plus a
// small lift when it goes on top of other boxes), slides along the depth axis
// to its spot, then is lowered onto what it rests on.
export const ENTRY_SECONDS = 0.6;     // per box at 1x
export const OUTSIDE = 40;            // cm beyond the door where a box starts
export const LIFT = 12;               // cm a stacked box is carried above its spot
const SLIDE_PART = 0.75;              // share of the time spent sliding when it is lowered after
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Offset [x, y, z] from the box's final render position at progress t in [0, 1].
// `it` is a render item: y = height of its base, h its height, z / d its depth range.
export function entryOffset(t, it, frame, H) {
  const lift = Number(it.y) > 0.5 ? Math.min(LIFT, Math.max(0, H - (Number(it.y) + Number(it.h)))) : 0;
  const slidePart = lift > 0 ? SLIDE_PART : 1;
  const far = frame.fromDoor({ y: Number(it.z), dy: Number(it.d) }).far;   // render z is physics y
  const s = ease(Math.min(1, t / slidePart));
  const down = t <= slidePart ? 0 : ease((t - slidePart) / (1 - slidePart));
  return [0, lift * (1 - down), -frame.inward * (far + OUTSIDE) * (1 - s)];
}
