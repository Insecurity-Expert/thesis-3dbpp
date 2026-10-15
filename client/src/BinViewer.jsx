/**
 * BinViewer.jsx
 * Live 3-D packing visualiser using React Three Fiber.
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { isHeavy, RULE_COLOR, fmtNum } from './viewer/boxInfo';
import { truckFrame } from './viewer/truckFrame';
import { gapLines, gapLabel } from './viewer/gapView';
import { entryOffset, ENTRY_SECONDS } from './viewer/entryMotion';

// ── Per-item colour using golden-angle hue ("By box" mode) ──────────────────
export function itemHSL(itemIdx) {
  const hue = (itemIdx * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 70%, 60%)`;
}

// ── Fill colour per colour mode ─────────────────────────────────────────────
// Fragile is never a fill: it is always the amber outline, so a box can read
// as both heavy (fill) and fragile (outline).
export const TYPE_COLOR = { standard: '#3b82f6', heavy: '#ef4444' };
export const STOP_COLORS = ['#3b82f6', '#22c55e', '#e879f9', '#14b8a6', '#94a3b8', '#f43f5e'];
export const COMPLIANT_COLOR = '#64748b';
export const PROBLEM_OUTLINE = '#ff2d95';

export function stopColor(stop, stops) {
  const k = stops.indexOf(stop);
  return STOP_COLORS[(k < 0 ? 0 : k) % STOP_COLORS.length];
}

function fillColor(it, mode, heavy, stops) {
  if (mode === 'box') return itemHSL(it.item_idx);
  if (mode === 'stop') return stopColor(it.stop, stops);
  if (mode === 'problem') {
    const v = it.violations || [];
    return v.length ? RULE_COLOR[v[0]] : COMPLIANT_COLOR;
  }
  return isHeavy(it.mass ?? it.weight, heavy) ? TYPE_COLOR.heavy : TYPE_COLOR.standard;
}

// ── Container wireframe & visual shell ───────────────────────────────────────
const WireBox = React.memo(function WireBox({ x, y, z, l, h, d, frontZ }) {
  const nx = Number(x || 0);
  const ny = Number(y || 0);
  const nz = Number(z || 0);
  const nl = Number(l || 0);
  const nh = Number(h || 0);
  const nd = Number(d || 0);

  const geo = useMemo(() => new THREE.BoxGeometry(nl, nh, nd), [nl, nh, nd]);
  const cx = nx + nl / 2;
  const cy = ny + nh / 2;
  const cz = nz + nd / 2;

  return (
    <group>
      {/* Sleek outer wireframe outline */}
      <lineSegments position={[cx, cy, cz]}>
        <edgesGeometry args={[geo]} />
        <lineBasicMaterial color="#3b82f6" transparent opacity={0.5} />
      </lineSegments>

      {/* Semi-transparent bottom floor with subtle grid look */}
      <mesh position={[cx, ny, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[nl, nd]} />
        <meshStandardMaterial
          color="#1e293b"
          transparent
          opacity={0.35}
          roughness={0.4}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Semi-transparent end wall at the FRONT wall (truckFrame().frontZ).
          The door face is drawn by OrientationGuides. */}
      <mesh position={[cx, cy, nz + Number(frontZ ?? nd)]}>
        <planeGeometry args={[nl, nh]} />
        <meshStandardMaterial
          color="#111827"
          transparent
          opacity={0.2}
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Semi-transparent left wall */}
      <mesh position={[nx, cy, cz]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[nd, nh]} />
        <meshStandardMaterial
          color="#111827"
          transparent
          opacity={0.2}
          roughness={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
});

// ── Orientation guides: rear door, front wall, depth arrow ───────────────────
// Render coordinates: x = across the truck (L), y = height (H), z = depth (D).
// Which end of z is the door comes from truckFrame (viewer/truckFrame.js),
// never from a constant here.
const DOOR_COLOR  = '#22c55e';
const FRONT_COLOR = '#94a3b8';
const ARROW_COLOR = '#38bdf8';

const guideLabelStyle = {
  whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none',
  fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
  padding: '4px 9px', borderRadius: 6, color: '#0b1020',
  boxShadow: '0 1px 3px rgba(0,0,0,0.45)',
};

const OrientationGuides = React.memo(function OrientationGuides({ L, H, D, frame }) {
  const { doorZ, frontZ, inward } = frame;
  const doorFrame = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(L, H)), [L, H]);
  const arrow = useMemo(() => {
    // On the floor, just outside the x = 0 wall so no box can cover it; from
    // the door end toward the front wall.
    const len = D * 0.8;
    return new THREE.ArrowHelper(new THREE.Vector3(0, 0, inward), new THREE.Vector3(-L * 0.08, 0.5, doorZ + inward * D * 0.1),
      len, ARROW_COLOR, Math.min(30, len * 0.12), Math.min(14, len * 0.06));
  }, [L, D, doorZ, inward]);
  const cornerMarks = useMemo(() => {
    // Short ticks on the floor at the door corners, pointing inward.
    const t = Math.min(L * 0.15, 30), zi = doorZ + inward * t;
    const pts = [0, 0.6, doorZ, t, 0.6, doorZ, 0, 0.6, doorZ, 0, 0.6, zi,
                 L, 0.6, doorZ, L - t, 0.6, doorZ, L, 0.6, doorZ, L, 0.6, zi];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [L, doorZ, inward]);
  return (
    <group>
      {/* 1. Rear door face: coloured frame + faint translucent panel */}
      <lineSegments geometry={doorFrame} position={[L / 2, H / 2, doorZ]}>
        <lineBasicMaterial color={DOOR_COLOR} linewidth={2} />
      </lineSegments>
      <lineSegments geometry={doorFrame} position={[L / 2, H / 2, doorZ]} scale={[1.02, 1.02, 1]}>
        <lineBasicMaterial color={DOOR_COLOR} transparent opacity={0.6} />
      </lineSegments>
      {/* Just OUTSIDE the cargo volume. A panel inside would cut through any
          box loaded flush against the door and tint it. */}
      <mesh position={[L / 2, H / 2, frame.outside(0.3)]}>
        <planeGeometry args={[L, H]} />
        <meshBasicMaterial color={DOOR_COLOR} transparent opacity={0.10} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments geometry={cornerMarks}>
        <lineBasicMaterial color={DOOR_COLOR} />
      </lineSegments>
      <Html position={[L / 2, H + 14, doorZ]} center zIndexRange={[5, 0]}>
        <div style={{ ...guideLabelStyle, background: DOOR_COLOR }}>REAR DOOR — load and unload here</div>
      </Html>

      {/* 2. Front wall (driver's end): solid shaded wall + label, likewise just
          outside the cargo volume so a box flush against it is never cut. */}
      <mesh position={[L / 2, H / 2, frontZ + inward * 0.3]}>
        <planeGeometry args={[L, H]} />
        <meshStandardMaterial color={FRONT_COLOR} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[L / 2, H + 14, frontZ]} center zIndexRange={[5, 0]}>
        <div style={{ ...guideLabelStyle, background: FRONT_COLOR }}>FRONT WALL — driver's end</div>
      </Html>

      {/* 3. Depth arrow on the floor, door -> front wall */}
      <primitive object={arrow} />
      <Html position={[-L * 0.08, 2, D / 2]} center zIndexRange={[5, 0]}>
        <div style={{ ...guideLabelStyle, background: ARROW_COLOR }}>toward the front wall →</div>
      </Html>
    </group>
  );
});

// ── Gaps: dimension lines and shaded empty space ─────────────────────────────
// Everything here is the optimizer's (arrangement_view.gap_view); gapLines()
// only chooses what to draw. Physics [x, y, z] -> render [x, z, y].
const GAP_COLOR = '#fbbf24';
const EMPTY_COLOR = '#38bdf8';
const R = (p) => [p[0], p[2], p[1]];

const gapLabelStyle = {
  background: 'rgba(15, 23, 42, 0.88)', border: `1px solid ${GAP_COLOR}`, color: GAP_COLOR,
  padding: '1px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
  pointerEvents: 'none', fontFamily: 'sans-serif',
};

const GapLine = React.memo(function GapLine({ a, b, gap }) {
  const geo = useMemo(() => {
    const A = new THREE.Vector3(...R(a)), B = new THREE.Vector3(...R(b));
    const dir = B.clone().sub(A).normalize();
    // End ticks across the line, in a direction perpendicular to it.
    const side = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t = side.multiplyScalar(4);
    const pts = [A, B, A.clone().add(t), A.clone().sub(t), B.clone().add(t), B.clone().sub(t)];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [a, b]);
  const mid = R(a).map((v, k) => (v + R(b)[k]) / 2);
  return (
    <group>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color={GAP_COLOR} depthTest={false} transparent opacity={0.95} />
      </lineSegments>
      <Html position={mid} center zIndexRange={[6, 0]}>
        <div style={gapLabelStyle}>{gapLabel(gap)}</div>
      </Html>
    </group>
  );
});

const EmptyBlock = React.memo(function EmptyBlock({ block }) {
  const [x, y, z, dx, dy, dz] = block;
  const geo = useMemo(() => new THREE.BoxGeometry(dx, dz, dy), [dx, dy, dz]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);
  return (
    <group position={[x + dx / 2, z + dz / 2, y + dy / 2]} raycast={() => null}>
      <mesh geometry={geo} raycast={() => null}>
        <meshBasicMaterial color={EMPTY_COLOR} transparent opacity={0.07} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color={EMPTY_COLOR} transparent opacity={0.35} />
      </lineSegments>
    </group>
  );
});

function GapLayer({ items, container, frame, L, H, showLines, shadeEmpty }) {
  const g = useMemo(() => gapLines(items, container), [items, container]);
  return (
    <group>
      {shadeEmpty && g.blocks.map((b) => <EmptyBlock key={b.key} block={b.block} />)}
      {showLines && g.lines.map((l) => <GapLine key={l.key} a={l.a} b={l.b} gap={l.gap} />)}
      {showLines && g.doorMax && (
        <Html position={[L / 2, H + 34, frame.doorZ]} center zIndexRange={[6, 0]}>
          <div style={{ ...gapLabelStyle, fontSize: 12 }}>empty depth at the door: {fmtNum(g.doorMax.gap, 1)} cm</div>
        </Html>
      )}
    </group>
  );
}

// ── Entry animation (motion in viewer/entryMotion.js) ───────────────────────
function EntryMotion({ it, frame, H, progress, children }) {
  const ref = useRef();
  useFrame(() => {
    if (ref.current) ref.current.position.set(...entryOffset(progress.current, it, frame, H));
  });
  return <group ref={ref} position={entryOffset(progress.current, it, frame, H)}>{children}</group>;
}

// Advances the moving box while playback runs (or a single step animates).
// bringIn() resets progress to 0; reaching 1 ends the move exactly once.
function EntryDriver({ active, seconds, progress, onDone }) {
  useFrame((_, delta) => {
    if (!active || progress.current >= 1) return;
    progress.current = Math.min(1, progress.current + Math.min(delta, 0.1) / seconds);
    if (progress.current >= 1) onDone();
  });
  return null;
}

// ── Packed item: solid face + dark edge outline ───────────────────────────────
const FRAGILE_EDGE = '#f59e0b';

const ItemBox = React.memo(function ItemBox({ x, y, z, l, h, d, itemIdx, id, showLabels, onHover, onLeave, onSelect, fragile, color, problem, selected }) {
  const [hovered, setHovered] = useState(false);

  const nx = Number(x || 0);
  const ny = Number(y || 0);
  const nz = Number(z || 0);
  const nl = Number(l || 0);
  const nh = Number(h || 0);
  const nd = Number(d || 0);

  const faceGeo = useMemo(() => new THREE.BoxGeometry(nl - 1, nh - 1, nd - 1), [nl, nh, nd]);
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(faceGeo), [faceGeo]);
  const cx = nx + nl / 2, cy = ny + nh / 2, cz = nz + nd / 2;
  const boxId = id || `Box-${String(itemIdx + 1).padStart(3, '0')}`;

  return (
    <group position={[cx, cy, cz]} scale={hovered ? 1.03 : 1.0}>
      <mesh
        geometry={faceGeo}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHover();
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          onLeave();
        }}
        onClick={(e) => {
          // A drag to orbit also ends in a click; only a still click selects.
          if (e.delta > 4) return;
          e.stopPropagation();
          onSelect && onSelect();
        }}
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={hovered ? 0.95 : 0.82}
          emissive={hovered ? color : '#000000'}
          emissiveIntensity={hovered ? 0.45 : 0}
          roughness={0.35}
          metalness={0.08}
        />
      </mesh>
      {(showLabels || hovered) && (
        <Html
          position={[0, nh / 2 + 2, 0]}
          center
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: hovered ? '#f59e0b' : '#f1f5f9',
            padding: '3px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            fontFamily: 'sans-serif',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.15s ease',
          }}
        >
          {boxId}
        </Html>
      )}
      <lineSegments geometry={edgeGeo}>
        <lineBasicMaterial
          color={hovered ? '#ffffff' : '#000000'}
          transparent
          opacity={hovered ? 0.95 : 0.55}
        />
      </lineSegments>
      {/* Fragile marker: an extra amber outline, slightly inflated so it reads
          over the black edge. Purely additive; the mesh colour is unchanged. */}
      {fragile ? (
        <lineSegments geometry={edgeGeo} scale={1.015}>
          <lineBasicMaterial color={FRAGILE_EDGE} transparent opacity={0.95} linewidth={2} />
        </lineSegments>
      ) : null}
      {/* Problem highlight: breaks at least one of C3-C6 (optimizer's flags). */}
      {problem ? (
        <>
          <lineSegments geometry={edgeGeo} scale={1.035}>
            <lineBasicMaterial color={PROBLEM_OUTLINE} linewidth={2} />
          </lineSegments>
          <lineSegments geometry={edgeGeo} scale={1.05}>
            <lineBasicMaterial color={PROBLEM_OUTLINE} transparent opacity={0.6} />
          </lineSegments>
        </>
      ) : null}
      {selected ? (
        <lineSegments geometry={edgeGeo} scale={1.07}>
          <lineBasicMaterial color="#ffffff" linewidth={2} />
        </lineSegments>
      ) : null}
    </group>
  );
});

// ── Interactive Camera Controller ───────────────────────────────────────────
function CameraController({ orientation, target, H, camDist, totalWidth, D, frame, resetTrigger }) {
  const { camera, controls } = useThree();
  const lastTriggerRef = useRef(-1);

  useEffect(() => {
    if (resetTrigger === lastTriggerRef.current) return;
    lastTriggerRef.current = resetTrigger;

    if (!orientation) return;
    const nH = Number(H || 0);
    const nW = Number(totalWidth || 0);
    const nD = Number(D || 0);

    // Fit the extents that actually face the camera. A rear-door container is
    // 587 deep but only 233 across, so one distance for every view either
    // overflows the frame (Top, where depth runs up the screen) or leaves the
    // load tiny (Front). MARGIN leaves room for the orientation labels, which
    // sit outside the shell at the door and cab ends.
    // Per view, because the labels sit outside the shell in different
    // directions: Side and Top carry a label at each end of the 587 cm axis,
    // and Top must also clear the playback bar along the canvas bottom.
    const MARGIN = { Door: 1.35, Side: 1.50, Top: 1.60, "3D": 1.45, Loading: 1.25 };
    const vFov = (Number(camera.fov || 30) * Math.PI) / 180;
    const aspect = Number(camera.aspect || 1.6);
    const fit = (screenW, screenH) => {
      const byH = (screenH / 2) / Math.tan(vFov / 2);
      const byW = (screenW / 2) / (Math.tan(vFov / 2) * aspect);
      return Math.max(byH, byW, 1) * (MARGIN[orientation] || 1.4);
    };
    // Render axes: x = across (totalWidth), y = height, z = depth.
    const dist =
      orientation === "Door" || orientation === "Loading" ? fit(nW, nH) :
      orientation === "Side"  ? fit(nD, nH) :
      orientation === "Top"   ? fit(nW, nD) :
      fit(Math.hypot(nW, nD) * 0.85, Math.max(nH, nD * 0.55));
    const nCamDist = dist > 0 ? dist : Number(camDist || 0);

    // Set camera up vector based on orientation to prevent gimbal lock in Top view
    const { doorZ, inward } = frame;
    if (orientation === "Top") {
      camera.up.set(0, 0, inward);   // door at the bottom of the screen, front wall at the top
    } else {
      camera.up.set(0, 1, 0);
    }

    // The door is at render z = doorZ and the truck runs `inward` from it
    // (truckFrame). "Door" looks in through the door; "Loading" (playback)
    // looks in through the door from above and behind it, so a box starts
    // near the viewer and slides away into the truck; "3D" is a three-quarter
    // view from behind and above the door so the long axis runs away from the
    // viewer toward the front wall.
    // Each view is framed against the plane it actually shows. Door looks in
    // through the door, so its distance is measured from the door plane, not
    // from the container centre 293 cm further in - otherwise a box at the
    // door looms over the frame and its label projects off-screen.
    // Top is aimed slightly doorward so the door label clears the playback bar
    // along the bottom of the canvas.
    const aim = [target[0], target[1], target[2]];
    if (orientation === "Door") {
      camera.position.set(target[0], target[1], doorZ - inward * nCamDist);
    } else if (orientation === "Loading") {
      aim[1] = nH * 0.25;
      aim[2] = doorZ + inward * nD * 0.5;
      camera.position.set(target[0] + nW * 0.3, nH * 1.75, doorZ - inward * nCamDist * 1.25);
    } else if (orientation === "Side") {
      camera.position.set(target[0] + nCamDist, target[1], target[2]);
    } else if (orientation === "Top") {
      aim[2] = target[2] - inward * nD * 0.09;
      camera.position.set(target[0], target[1] + nCamDist, aim[2]);
    } else if (orientation === "3D") {
      camera.position.set(target[0] + nCamDist * 0.55, target[1] + nH * 1.3, target[2] - inward * nCamDist * 0.75);
    }
    camera.lookAt(aim[0], aim[1], aim[2]);
    if (controls) {
      controls.target.set(aim[0], aim[1], aim[2]);
      controls.update();
    }
    camera.updateProjectionMatrix();
  }, [orientation, target, H, camDist, totalWidth, D, frame, camera, controls, resetTrigger]);

  return null;
}

// ── Main viewer ───────────────────────────────────────────────────────────────
export default function BinViewer({ result, placements: placementsProp, container: containerProp, binsUsed: binsUsedProp, showLabels, showGuides = true, running, orientation, resetTrigger, onResetView, onHoverItem, onInteract,
                                    colorMode = 'type', heavy = null, stops = [], highlightProblems = false, onSelectItem, selectedIdx = null, legend = null, pictureName = 'STACKR-3D-view',
                                    plan = null, planCheck = null, showGaps = false, shadeEmpty = false, onPlayStart }) {
  // Parse container specs to numbers
  const container = useMemo(() => {
    const raw = result ? result.container : containerProp;
    if (!raw) return null;
    return {
      L: Number(raw.L || raw.Length || 0),
      H: Number(raw.H || raw.Height || 0),
      D: Number(raw.D || raw.Depth || 0),
      y_origin: raw.y_origin,
    };
  }, [result, containerProp]);
  const frame = useMemo(() => truckFrame(container), [container]);

  // Parse placements to numbers to prevent string concatenation bugs
  const items = useMemo(() => {
    const rawItems = result ? result.items : (placementsProp || []);
    return rawItems.map((it) => ({
      ...it,
      x: Number(it.x ?? 0),
      y: Number(it.y ?? 0),
      z: Number(it.z ?? 0),
      l: Number(it.l ?? it.length ?? 0),
      h: Number(it.h ?? it.height ?? 0),
      d: Number(it.d ?? it.width ?? 0),
      bin_id: Number(it.bin_id ?? 0),
      item_idx: Number(it.item_idx ?? 0),
      stop: it.stop !== undefined ? Number(it.stop) : undefined,
      weight: it.weight !== undefined ? Number(it.weight ?? it.mass) : (it.mass !== undefined ? Number(it.mass) : undefined),
      fragile: it.fragile === 1 || it.fragile === true || it.type === 'Fragile'
    }));
  }, [result, placementsProp]);

  const binsUsed = useMemo(() => {
    const rawBins = result ? result.bins_used : (binsUsedProp || 0);
    return Number(rawBins);
  }, [result, binsUsedProp]);

  // Playback order = the physical loading order (viewer/loadingPlan.js, the
  // same order as the printed Loading Guide), not the array order of items.
  const ordered = useMemo(() => {
    const rank = new Map(((plan && plan.steps) || []).map((st) => [Number(st.it.item_idx), st.step]));
    return items.slice().sort((a, b) => (rank.get(a.item_idx) ?? Infinity) - (rank.get(b.item_idx) ?? Infinity));
  }, [items, plan]);
  const n = ordered.length;
  const planOk = !planCheck || planCheck.ok;

  const [currentStep, setCurrentStep] = useState(n);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isLooping, setIsLooping] = useState(false);
  const [moving, setMoving] = useState(null);        // item_idx of the box coming in
  const [stepAnim, setStepAnim] = useState(false);   // a single step forward animates too
  const progress = useRef(1);

  const canvasRef = useRef(null);

  useEffect(() => {
    setCurrentStep(n);
    setMoving(null);
    setIsPlaying(false);
  }, [ordered, n]);

  // Bring box k (0-based in loading order) in through the door.
  const bringIn = useCallback((k) => {
    progress.current = 0;
    setMoving(ordered[k].item_idx);
    setCurrentStep(k + 1);
  }, [ordered]);

  useEffect(() => {
    if (!isPlaying || moving !== null) return;
    if (currentStep < n) bringIn(currentStep);
    else if (isLooping) setCurrentStep(0);
    else setIsPlaying(false);
  }, [isPlaying, moving, currentStep, n, isLooping, bringIn]);

  const finishMove = useCallback(() => { setMoving(null); setStepAnim(false); }, []);
  const stopAt = (k) => { setIsPlaying(false); setStepAnim(false); setMoving(null); progress.current = 1; setCurrentStep(k); };

  const visibleItems = useMemo(() => ordered.slice(0, currentStep), [ordered, currentStep]);
  const stepBox = currentStep > 0 ? ordered[currentStep - 1] : null;
  const hiddenByFilters = plan ? plan.steps.length - n : 0;
  const settled = currentStep === n && moving === null;

  const byBin = useMemo(() => {
    const m = {};
    for (const it of visibleItems) {
      const bid = it.bin_id;
      if (!m[bid]) m[bid] = [];
      m[bid].push(it);
    }
    return m;
  }, [visibleItems]);

  const { L = 0, H = 0, D = 0 } = container || {};
  const BIN_GAP     = L * 0.12;

  // Calculate bin count matching actual bins used and/or the highest bin_id present in placements
  const binCount = Math.max(
    1,
    binsUsed,
    Object.keys(byBin).length > 0 ? Math.max(...Object.keys(byBin).map(Number)) + 1 : 0
  );

  const totalWidth  = binCount * L + (binCount - 1) * BIN_GAP;
  const camDist     = Math.max(totalWidth, H, D) * 1.8;

  const target = useMemo(() => [totalWidth / 2, H / 2, D / 2], [totalWidth, H, D]);

  const cameraConfig = useMemo(() => ({
    position: [target[0] + camDist * 0.55, target[1] + H * 1.3, target[2] - frame.inward * camDist * 0.75],
    fov: 30,
    near: 1,
    far: Math.max(10000, camDist * 10)
  }), [target, H, camDist, frame]);

  if (!container) return null;

  // Export PNG function
  const handleExportPNG = () => {
    if (!canvasRef.current) return;
    const dataURL = canvasRef.current.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `${pictureName}.png`;
    link.href = dataURL;
    link.click();
  };

  return (
    <div style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ width: '100%', height: 520, background: '#111827', position: 'relative' }}>
        <Canvas
          ref={canvasRef}
          camera={cameraConfig}
          gl={{ antialias: true, preserveDrawingBuffer: true }}
        >
          <ambientLight intensity={0.65} />
          <directionalLight position={[totalWidth * 0.5, H * 2, D * 1.5]} intensity={0.8} />
          <directionalLight position={[-totalWidth * 0.5, H * 0.5, -D * 1.0]} intensity={0.3} />

          {Array.from({ length: binCount }, (_, binId) => {
            const offsetX  = binId * (L + BIN_GAP);
            const binItems = byBin[binId] || [];
            return (
              <group key={binId} position={[offsetX, 0, 0]}>
                <WireBox x={0} y={0} z={0} l={L} h={H} d={D} frontZ={frame.frontZ} />
                {showGuides && <OrientationGuides L={L} H={H} D={D} frame={frame} />}
                {(showGaps || shadeEmpty) && settled && binId === 0 && (
                  <GapLayer items={binItems} container={container} frame={frame} L={L} H={H} showLines={showGaps} shadeEmpty={shadeEmpty} />
                )}
                {binItems.map((it) => {
                  const box = (
                  <ItemBox
                    key={it.item_idx}
                    x={it.x} y={it.y} z={it.z}
                    l={it.l} h={it.h} d={it.d}
                    itemIdx={it.item_idx}
                    id={it.id}
                    fragile={it.fragile}
                    color={fillColor(it, colorMode, heavy, stops)}
                    problem={highlightProblems && Array.isArray(it.violations) && it.violations.length > 0}
                    selected={selectedIdx !== null && selectedIdx === it.item_idx}
                    showLabels={showLabels}
                    onHover={() => onHoverItem && onHoverItem(it)}
                    onLeave={() => onHoverItem && onHoverItem(null)}
                    onSelect={() => onSelectItem && onSelectItem(it)}
                  />
                  );
                  return it.item_idx === moving
                    ? <EntryMotion key={it.item_idx} it={it} frame={frame} H={H} progress={progress}>{box}</EntryMotion>
                    : box;
                })}
              </group>
            );
          })}

          <EntryDriver active={moving !== null && (isPlaying || stepAnim)} seconds={ENTRY_SECONDS / playbackSpeed} progress={progress} onDone={finishMove} />
          <CameraController orientation={orientation} target={target} H={H} camDist={camDist} totalWidth={totalWidth} D={D} frame={frame} resetTrigger={resetTrigger} />
          <OrbitControls makeDefault target={target} onStart={onInteract} />
        </Canvas>

        {/* Playback Controls Overlay */}
        {!running && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              zIndex: 10,
              width: '90%',
              maxWidth: 580,
              backdropFilter: 'blur(8px)',
              pointerEvents: 'auto',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {!planOk && (
              <div style={{ color: '#fbbf24', fontSize: 12, fontWeight: 600 }}>
                Loading animation not shown: no valid loading order for this arrangement ({planCheck.problems[0]}).
              </div>
            )}
            {/* Row 1: Progress Slider */}
            <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
              <input
                type="range"
                min="0"
                max={n}
                value={currentStep}
                disabled={!planOk}
                onChange={(e) => stopAt(parseInt(e.target.value, 10))}
                style={{
                  width: '100%',
                  cursor: 'pointer',
                  accentColor: '#3b82f6',
                  height: '6px',
                }}
              />
            </div>

            {/* Row 2: Controls & Settings */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              width: '100%'
            }}>
              {/* Loop & Speed Options (Left) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setIsLooping(prev => !prev)}
                  style={{
                    background: isLooping ? '#10b981' : '#475569',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Toggle Loop"
                >
                  🔁 {isLooping ? 'Loop: On' : 'Loop: Off'}
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#475569', borderRadius: 4, padding: '0 6px' }}>
                  <span style={{ color: '#cbd5e1', fontSize: 11, fontWeight: 'bold' }}>Speed:</span>
                  <select
                    value={String(playbackSpeed)}
                    onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                    style={{
                      background: 'transparent',
                      color: '#fff',
                      border: 'none',
                      padding: '6px 2px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                    title="Playback Speed"
                  >
                    <option value="0.5" style={{ background: '#1e293b' }}>0.5x</option>
                    <option value="1" style={{ background: '#1e293b' }}>1.0x</option>
                    <option value="2" style={{ background: '#1e293b' }}>2.0x</option>
                    <option value="4" style={{ background: '#1e293b' }}>4.0x</option>
                  </select>
                </div>
              </div>

              {/* Playback Navigation Buttons (Middle) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={() => stopAt(Math.max(0, currentStep - 1))}
                  disabled={currentStep === 0 || !planOk}
                  style={{
                    background: '#475569',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
                    opacity: currentStep === 0 ? 0.5 : 1,
                  }}
                  title="Previous Box"
                >
                  ⏮
                </button>

                <button
                  disabled={!planOk}
                  onClick={() => {
                    if (isPlaying) { setIsPlaying(false); return; }
                    if (currentStep >= n && moving === null) {
                      setCurrentStep(0);
                      onPlayStart && onPlayStart();
                    } else if (currentStep === 0) {
                      onPlayStart && onPlayStart();
                    }
                    setStepAnim(false);
                    setIsPlaying(true);
                  }}
                  style={{
                    background: isPlaying ? '#ef4444' : '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    minWidth: 70,
                  }}
                >
                  {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>

                <button
                  onClick={() => {
                    setIsPlaying(false);
                    if (currentStep >= n) return;
                    setStepAnim(true);
                    bringIn(currentStep);
                  }}
                  disabled={currentStep === n || !planOk}
                  style={{
                    background: '#475569',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: currentStep === n ? 'not-allowed' : 'pointer',
                    opacity: currentStep === n ? 0.5 : 1,
                  }}
                  title="Next Box"
                >
                  ⏭
                </button>
              </div>

              <span style={{ color: '#f1f5f9', fontSize: 12, whiteSpace: 'nowrap', fontWeight: 600 }}>
                Step {currentStep} / {n}{stepBox && stepBox.stop !== undefined ? ` · Stop ${stepBox.stop}` : ''}
                {hiddenByFilters > 0 ? ` · ${hiddenByFilters} hidden by filters` : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Legend & Action Triggers at bottom of viewport */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '12px 16px',
        background: '#1f2937', flexWrap: 'wrap', alignItems: 'center', gap: 14
      }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {legend}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleExportPNG}
            style={{ padding: "6px 12px", background: "transparent", border: "1px solid #4b5563", borderRadius: "4px", color: "#cbd5e1", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
          >
            Save as picture
          </button>
          <button
            onClick={onResetView}
            style={{ padding: "6px 12px", background: "transparent", border: "1px solid #4b5563", borderRadius: "4px", color: "#cbd5e1", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
          >
            Reset view
          </button>
        </div>
      </div>
    </div>
  );
}
