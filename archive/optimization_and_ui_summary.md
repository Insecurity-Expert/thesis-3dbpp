# Summary of Changes — 3D Bin Packing Project

## 1. Visual & UI Improvements (Frontend)

* **Restructured Playback Overlay Layout:**
  * Re-arranged the controls inside the 3D Packing View overlay to place the **progress slider at the very top (Row 1)** so it spans the full width.
  * Placed all playback settings and buttons **below the slider (Row 2)** to eliminate container overflow issues.
  * Grouped controls cleanly: Loop and Speed controls on the left, step-by-step navigation buttons in the middle, and current frame counts on the right.
* **Granular Playback Controls:**
  * Added **⏮ (Step Back)** and **⏭ (Step Forward)** buttons next to the Play/Pause button for box-by-box inspection.
  * Added a **Loop Toggle** (`🔁 Loop: On/Off`) to automatically restart the packing animation when it reaches the last box.
  * Added a **Playback Speed** selector dropdown (`0.5x`, `1.0x`, `2.0x`, `4.0x`) with a visible prefix label to adjust animation intervals.
* **Premium Glassmorphic Box Labels:**
  * Restored the billboarded CSS `<Html>` label containers with a dark semi-transparent theme matching the dark mode styling of the dashboard.
  * Placed labels floating slightly above each box (`[0, h/2 + 2, 0]`) to keep them visible.
  * Removed the raycast `occlude` prop to ensure labels remain visible at all camera angles.
  * Configured hover events so that hovering over any box scales it by `1.03` in size, highlights its wireframe in bright white, and forces its label to show up (colored golden yellow) even when the global showLabels state is turned off.

---

## 2. Performance Optimizations (Backend)

* **Lowered Extreme Points Cap:**
  * Reduced `MAX_EPS_PER_BIN` from `60` to `30` in `optimizer/wolf.py`. This significantly cuts down sorting and comparison loops in the DBLF decoder without degrading packing results.
* **Inlined Inner Raycast Loops:**
  * Inlined the overlaps detection logic inside `_fits` (in `wolf.py`) to eliminate Python function-call overhead inside the deep inner loop.
* **Inlined Boundary Pruning:**
  * Added inline boundaries check inside `place_items` (in `wolf.py`) before invoking `_fits` to instantly prune orientations that exceed container dimensions.
* **Precomputed Rotation Orientations:**
  * Modified `optimizer/instance_reader.py` to calculate all valid permutations of item rotations **exactly once** per box definition type during instance load.
  * Replaced function calls to `get_orientations(item)` in `wolf.py` with direct dictionary access (`item['orientations']`), saving millions of memory allocations during optimization.
