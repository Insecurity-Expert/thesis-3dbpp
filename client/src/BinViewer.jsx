/**
 * BinViewer.jsx
 * Live 3-D packing visualiser using React Three Fiber.
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

// ── Per-item colour using golden-angle hue ───────────────────────────────────
function itemHSL(itemIdx) {
  const hue = (itemIdx * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 70%, 60%)`;
}

// ── Container wireframe & visual shell ───────────────────────────────────────
const WireBox = React.memo(function WireBox({ x, y, z, l, h, d }) {
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

      {/* Semi-transparent back wall */}
      <mesh position={[cx, cy, nz]}>
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

// ── Packed item: solid face + dark edge outline ───────────────────────────────
const FRAGILE_EDGE = '#f59e0b';

const ItemBox = React.memo(function ItemBox({ x, y, z, l, h, d, itemIdx, id, showLabels, onHover, onLeave, fragile }) {
  const [hovered, setHovered] = useState(false);
  const color   = useMemo(() => itemHSL(itemIdx), [itemIdx]);

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
    </group>
  );
});

// ── Interactive Camera Controller ───────────────────────────────────────────
function CameraController({ orientation, target, H, camDist, resetTrigger }) {
  const { camera, controls } = useThree();
  const lastTriggerRef = useRef(-1);

  useEffect(() => {
    if (resetTrigger === lastTriggerRef.current) return;
    lastTriggerRef.current = resetTrigger;

    if (!orientation) return;
    const nH = Number(H || 0);
    const nCamDist = Number(camDist || 0);

    // Set camera up vector based on orientation to prevent gimbal lock in Top view
    if (orientation === "Top") {
      camera.up.set(0, 0, -1);
    } else {
      camera.up.set(0, 1, 0);
    }

    if (orientation === "Front") {
      camera.position.set(target[0], target[1], target[2] + nCamDist);
    } else if (orientation === "Side") {
      camera.position.set(target[0] + nCamDist, target[1], target[2]);
    } else if (orientation === "Top") {
      camera.position.set(target[0], target[1] + nCamDist, target[2]);
    } else if (orientation === "3D") {
      camera.position.set(target[0] + nCamDist * 0.6, target[1] + nH * 1.0, target[2] + nCamDist * 0.8);
    }
    camera.lookAt(target[0], target[1], target[2]);
    if (controls) {
      controls.target.set(target[0], target[1], target[2]);
      controls.update();
    }
    camera.updateProjectionMatrix();
  }, [orientation, target, H, camDist, camera, controls, resetTrigger]);

  return null;
}

// ── Main viewer ───────────────────────────────────────────────────────────────
export default function BinViewer({ result, placements: placementsProp, container: containerProp, binsUsed: binsUsedProp, showLabels, running, orientation, resetTrigger, onResetView, onHoverItem, onInteract }) {
  // Parse container specs to numbers
  const container = useMemo(() => {
    const raw = result ? result.container : containerProp;
    if (!raw) return null;
    return {
      L: Number(raw.L || raw.Length || 0),
      H: Number(raw.H || raw.Height || 0),
      D: Number(raw.D || raw.Depth || 0),
    };
  }, [result, containerProp]);

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

  const [currentStep, setCurrentStep] = useState(items.length);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isLooping, setIsLooping] = useState(false);

  const canvasRef = useRef(null);

  useEffect(() => {
    setCurrentStep(items.length);
  }, [items.length]);

  useEffect(() => {
    if (!isPlaying) return;
    const intervalDelay = Math.round(500 / playbackSpeed);
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= items.length) {
          if (isLooping) {
            return 0;
          } else {
            setIsPlaying(false);
            return prev;
          }
        }
        return prev + 1;
      });
    }, intervalDelay);

    return () => clearInterval(interval);
  }, [isPlaying, items.length, playbackSpeed, isLooping]);

  const visibleItems = useMemo(() => {
    return items.slice(0, currentStep);
  }, [items, currentStep]);

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
    position: [target[0], target[1] + H * 0.8, target[2] + camDist],
    fov: 30,
    near: 1,
    far: Math.max(10000, camDist * 10)
  }), [target, H, camDist]);

  if (!container || !items || items.length === 0) return null;

  // Export PNG function
  const handleExportPNG = () => {
    if (!canvasRef.current) return;
    const dataURL = canvasRef.current.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `STACKR-3D-Packing-Bin.png`;
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
                <WireBox x={0} y={0} z={0} l={L} h={H} d={D} />
                {binItems.map((it) => (
                  <ItemBox
                    key={it.item_idx}
                    x={it.x} y={it.y} z={it.z}
                    l={it.l} h={it.h} d={it.d}
                    itemIdx={it.item_idx}
                    id={it.id}
                    fragile={it.fragile}
                    showLabels={showLabels}
                    onHover={() => onHoverItem && onHoverItem({
                      id: it.id,
                      x: it.x,
                      y: it.y,
                      z: it.z,
                      l: it.l,
                      h: it.h,
                      d: it.d,
                      stop: it.stop || 1,
                      weight: it.weight || 0,
                      fragile: it.fragile
                    })}
                    onLeave={() => onHoverItem && onHoverItem(null)}
                  />
                ))}
              </group>
            );
          })}

          <CameraController orientation={orientation} target={target} H={H} camDist={camDist} resetTrigger={resetTrigger} />
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
            {/* Row 1: Progress Slider */}
            <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
              <input
                type="range"
                min="0"
                max={items.length}
                value={currentStep}
                onChange={(e) => {
                  setCurrentStep(parseInt(e.target.value, 10));
                  setIsPlaying(false);
                }}
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
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStep((prev) => Math.max(0, prev - 1));
                  }}
                  disabled={currentStep === 0}
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
                  onClick={() => {
                    if (currentStep >= items.length) {
                      setCurrentStep(0);
                    }
                    setIsPlaying(prev => !prev);
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
                    setCurrentStep((prev) => Math.min(items.length, prev + 1));
                  }}
                  disabled={currentStep === items.length}
                  style={{
                    background: '#475569',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: currentStep === items.length ? 'not-allowed' : 'pointer',
                    opacity: currentStep === items.length ? 0.5 : 1,
                  }}
                  title="Next Box"
                >
                  ⏭
                </button>
              </div>

              <span style={{ color: '#f1f5f9', fontSize: 12, whiteSpace: 'nowrap', fontWeight: 600 }}>
                Showing {currentStep} of {items.length}
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
          <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: '600' }}>
            {binCount} bin{binCount !== 1 ? 's' : ''} · {items.length} items
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#3b82f6' }} />
            <span style={{ color: '#9ca3af', fontSize: 12 }}>Standard</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#f59e0b' }} />
            <span style={{ color: '#9ca3af', fontSize: 12 }}>Fragile</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#ef4444' }} />
            <span style={{ color: '#9ca3af', fontSize: 12 }}>Heavy</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleExportPNG}
            style={{ padding: "6px 12px", background: "transparent", border: "1px solid #4b5563", borderRadius: "4px", color: "#cbd5e1", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
          >
            Export PNG
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
