// Where the rear door is: the ONE place every view asks. The 3-D orientation
// guides, the camera presets, the entry animation, the loading order, the box
// details and the printed Loading Guide all go through truckFrame().
//
// The optimizer states where physics y = 0 is in container.y_origin
// (optimizer/arrangement_view.Y_ORIGIN):
//   "door"        y = 0 at the rear door, y = W at the front wall. Every
//                 producer today (decoder, repair, metrics, validator).
//   "front_wall"  y = 0 at the front wall (driver's end), y = W at the door:
//                 the paper's convention.
// Rows saved before the field existed are door-based.
//
// Physics axes: x across, y depth, z height. Render axes: x across, y height,
// z depth (render z = physics y). Positions shown to people are always the
// paper's: depth measured from the front wall, converted here when the data
// are door-based, never stored twice.
export const DOOR = "door";
export const FRONT_WALL = "front_wall";

export function truckFrame(container) {
  const c = container || {};
  const origin = c.y_origin === FRONT_WALL ? FRONT_WALL : DOOR;
  const depth = Number(c.D ?? c.Depth ?? 0);        // physics y extent = render z extent
  const atDoor = origin === DOOR;
  const inward = atDoor ? 1 : -1;                    // render z direction from the door into the truck
  const doorZ = atDoor ? 0 : depth;
  const doorFace = atDoor ? "y-" : "y+";             // the box face that looks toward the door
  const frontFace = atDoor ? "y+" : "y-";
  return {
    origin, depth, inward, doorZ, doorFace, frontFace,
    frontZ: depth - doorZ,
    // Render z of a plane `dist` cm outside the door.
    outside: (dist) => doorZ - inward * dist,
    // A physics placement {y, dy}: its depth range measured from the door.
    fromDoor: (p) => (atDoor ? { near: p.y, far: p.y + p.dy } : { near: depth - p.y - p.dy, far: depth - p.y }),
    // The paper's y: front wall to the box's corner nearest the front wall.
    fromFront: (p) => (atDoor ? depth - p.y - p.dy : p.y),
    // The container wall beyond a box face (face names as layout_metrics: x-, x+, y-, y+, z-, z+).
    wallName: (face) => ({ "x-": "side wall (x = 0)", "x+": "side wall (far side)", "z-": "floor", "z+": "roof",
      [doorFace]: "rear door", [frontFace]: "front wall" })[face],
    // Which way a face looks, for the box details.
    faceName: (face) => ({ "x-": "Across, toward x = 0", "x+": "Across, toward the far side", "z-": "Below", "z+": "Above",
      [doorFace]: "Toward the door", [frontFace]: "Toward the front wall" })[face],
  };
}
