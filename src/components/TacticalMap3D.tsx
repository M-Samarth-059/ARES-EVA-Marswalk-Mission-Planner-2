import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Compass,
  Crosshair,
  Eye,
  LocateFixed,
  MapPinPlus,
  MousePointer,
  Radio,
  ShieldAlert,
} from 'lucide-react';
import {
  FieldObservation,
  LayerConfig,
  LayerId,
  RouteAnalysis,
  SciencePOI,
  SiteDataset,
  TrnGuidanceState,
  Waypoint,
} from '../types/mission';
import {
  getRawElevationM,
  mapToLatLon,
  pointInRotatedEllipse,
  sampleTerrainAt,
} from '../utils/terrainEngine';
import { MapToolMode } from './TacticalMapCanvas';

interface TacticalMap3DProps {
  site: SiteDataset;
  layers: LayerConfig[];
  waypoints: Waypoint[];
  routeAnalysis: RouteAnalysis;
  showSafeComparison: boolean;
  observations: FieldObservation[];
  selectedPoiId: string | null;
  selectedRover: boolean;
  marswalkMode: boolean;
  astronautPos: {
    x: number;
    y: number;
    headingDeg: number;
  } | null;
  mapTool: MapToolMode;
  onChangeMapTool: (tool: MapToolMode) => void;
  onUpdateWaypoint: (id: string, x: number, y: number) => void;
  onAddWaypoint: (x: number, y: number) => void;
  onSelectPoi: (poi: SciencePOI) => void;
  onSelectRover: () => void;
  onSelectObservation: (obs: FieldObservation) => void;
  onRequestLogAt: (x: number, y: number) => void;
  onApplySafeRoute?: () => void;
  onInspectHazards?: () => void;
  viewModeToggle?: React.ReactNode;
  trnGuidance?: TrnGuidanceState | null;
}

// Reusable math objects (zero GC in render loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _camTargetGoal = new THREE.Vector3();
const _camPosGoal = new THREE.Vector3();
const _mouseNdc = new THREE.Vector2();
const _dummyObj = new THREE.Object3D();
const _tmpColor = new THREE.Color();

const WORLD_SIZE = 100; // maps 0..1000 -> -50..+50
const TERRAIN_EXTENT = 170; // extended horizon skirt so terrain never floats in a void
const TERRAIN_SEGMENTS = 180;

function mapToWorldXZ(mx: number, my: number): [number, number] {
  return [(mx - 500) * 0.1, (my - 500) * 0.1];
}

function worldXZToMap(wx: number, wz: number): { x: number; y: number } {
  return {
    x: Math.max(20, Math.min(980, wx * 10 + 500)),
    y: Math.max(20, Math.min(980, wz * 10 + 500)),
  };
}

function getWorldHeight(site: SiteDataset, wx: number, wz: number): number {
  const mx = Math.max(0, Math.min(1000, wx * 10 + 500));
  const my = Math.max(0, Math.min(1000, wz * 10 + 500));
  const elev = getRawElevationM(site, mx, my);
  const span = Math.max(1, site.maxElevM - site.minElevM);
  const norm = (elev - site.minElevM) / span;

  // Fine geological micro-relief & strata steps
  const microStrata = Math.sin(norm * Math.PI * 12) * 0.22;
  const rockRipple =
    Math.sin(wx * 0.42 + wz * 0.31) * Math.cos(wx * 0.27 - wz * 0.49) * 0.28;

  // Beyond core map (|wx|>50 or |wz|>50), gently roll into surrounding crater walls
  const edgeDist = Math.max(0, Math.max(Math.abs(wx), Math.abs(wz)) - 50);
  const rimLift = Math.pow(edgeDist / 35, 1.5) * 4.5;

  return norm * 17.5 + microStrata + rockRipple + rimLift;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpRgb(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

function buildMartianSurfaceTextures(
  site: SiteDataset,
  opticalEnabled: boolean,
  opticalOpacity: number,
  maxAnisotropy: number
): { albedoMap: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const size = 512;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;
  const aImg = aCtx.createImageData(size, size);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nCtx = normalCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(size, size);

  const cLow = hexToRgb(site.terrainPalette.low);
  const cMid = hexToRgb(site.terrainPalette.mid);
  const cHigh = hexToRgb(site.terrainPalette.high);
  const cRidge = hexToRgb(site.terrainPalette.ridge);
  const elevSpan = Math.max(1, site.maxElevM - site.minElevM);

  const heights = new Float32Array(size * size);

  for (let py = 0; py < size; py++) {
    const wz = ((py / size) - 0.5) * TERRAIN_EXTENT;
    const my = Math.max(0, Math.min(1000, wz * 10 + 500));
    for (let px = 0; px < size; px++) {
      const wx = ((px / size) - 0.5) * TERRAIN_EXTENT;
      const mx = Math.max(0, Math.min(1000, wx * 10 + 500));

      const elev = getRawElevationM(site, mx, my);
      const t = Math.max(0, Math.min(1, (elev - site.minElevM) / elevSpan));

      // Strata + wind-blown grit detail
      const strata = Math.sin(t * Math.PI * 16) * 0.055;
      const grit =
        Math.sin(wx * 2.1 + wz * 1.4) * Math.cos(wx * 1.7 - wz * 2.5) * 0.045 +
        Math.sin(wx * 6.3 - wz * 5.7) * 0.02;
      heights[py * size + px] = t * 18 + strata * 3 + grit * 2.5;

      let rgb: [number, number, number];
      if (!opticalEnabled) {
        rgb = [22, 28, 38];
      } else {
        const tMod = Math.max(0, Math.min(1, t + strata + grit));
        if (tMod < 0.36) rgb = lerpRgb(cLow, cMid, tMod / 0.36);
        else if (tMod < 0.74) rgb = lerpRgb(cMid, cHigh, (tMod - 0.36) / 0.38);
        else rgb = lerpRgb(cHigh, cRidge, (tMod - 0.74) / 0.26);

        // Dark basaltic sand ripples inside sand traps
        for (const h of site.hazards) {
          if (/sand|ripple|drift/i.test(h.surfaceType)) {
            const d = pointInRotatedEllipse(mx, my, h.x, h.y, h.rx, h.ry, h.rotationDeg);
            if (d < 1.0) {
              const blend = (1 - d) * 0.55;
              const ripple = Math.sin((mx + my) * 0.35) * 10;
              rgb = [
                Math.max(20, Math.round(rgb[0] * (1 - blend) + (46 + ripple) * blend)),
                Math.max(16, Math.round(rgb[1] * (1 - blend) + (35 + ripple) * blend)),
                Math.max(16, Math.round(rgb[2] * (1 - blend) + (33 + ripple) * blend)),
              ];
              heights[py * size + px] += Math.sin((mx + my) * 0.35) * 0.35 * (1 - d);
            }
          }
        }

        // Exposed bright caprock patches
        for (const tp of site.thermalPatches) {
          if (tp.classification === 'bedrock') {
            const d = pointInRotatedEllipse(mx, my, tp.x, tp.y, tp.rx, tp.ry, tp.rotationDeg);
            if (d < 1.0) {
              const b = (1 - d) * 0.25;
              rgb = lerpRgb(rgb, [175, 130, 102], b);
            }
          }
        }

        const optScale = 0.2 + 0.8 * (opticalOpacity / 100);
        rgb = [
          Math.round(rgb[0] * optScale),
          Math.round(rgb[1] * optScale),
          Math.round(rgb[2] * optScale),
        ];
      }

      const idx = (py * size + px) * 4;
      aImg.data[idx] = rgb[0];
      aImg.data[idx + 1] = rgb[1];
      aImg.data[idx + 2] = rgb[2];
      aImg.data[idx + 3] = 255;
    }
  }
  aCtx.putImageData(aImg, 0, 0);

  // Derive tangent-space normal map from heightfield
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const hL = heights[py * size + Math.max(0, px - 1)];
      const hR = heights[py * size + Math.min(size - 1, px + 1)];
      const hU = heights[Math.max(0, py - 1) * size + px];
      const hD = heights[Math.min(size - 1, py + 1) * size + px];

      const nx = (hL - hR) * 1.4;
      const ny = (hU - hD) * 1.4;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;

      const idx = (py * size + px) * 4;
      nImg.data[idx] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      nImg.data[idx + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      nImg.data[idx + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      nImg.data[idx + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);

  const albedoMap = new THREE.CanvasTexture(albedoCanvas);
  albedoMap.colorSpace = THREE.SRGBColorSpace;
  albedoMap.anisotropy = maxAnisotropy;

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.anisotropy = maxAnisotropy;

  return { albedoMap, normalMap };
}

function buildDataOverlayTexture(
  site: SiteDataset,
  layerMap: Record<LayerId, LayerConfig>,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const toPx = (v: number) => (v / 1000) * size;

  // 1. THEMIS Thermal Inertia
  const themis = layerMap.themis;
  if (themis?.enabled) {
    ctx.save();
    ctx.globalAlpha = themis.opacity / 100;
    for (const tp of site.thermalPatches) {
      ctx.save();
      ctx.translate(toPx(tp.x), toPx(tp.y));
      ctx.rotate((tp.rotationDeg * Math.PI) / 180);
      const rx = toPx(tp.rx);
      const ry = toPx(tp.ry);
      const grad = ctx.createRadialGradient(0, 0, 6, 0, 0, Math.max(rx, ry));
      if (tp.classification === 'bedrock') {
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.55)');
        grad.addColorStop(0.7, 'rgba(14, 165, 233, 0.22)');
        grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
      } else {
        grad.addColorStop(0, 'rgba(245, 158, 11, 0.55)');
        grad.addColorStop(0.7, 'rgba(217, 119, 6, 0.2)');
        grad.addColorStop(1, 'rgba(217, 119, 6, 0)');
      }
      ctx.scale(1, ry / rx);
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // 2. CRISM Mineralogy Spectral Regions
  const crism = layerMap.crism;
  if (crism?.enabled) {
    ctx.save();
    ctx.globalAlpha = crism.opacity / 100;
    for (const m of site.minerals) {
      ctx.save();
      ctx.translate(toPx(m.x), toPx(m.y));
      ctx.rotate((m.rotationDeg * Math.PI) / 180);
      const rx = toPx(m.rx);
      const ry = toPx(m.ry);
      const [r, g, b] = hexToRgb(m.color);
      const grad = ctx.createRadialGradient(0, 0, 6, 0, 0, rx);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.52)`);
      grad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, 0.2)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.scale(1, ry / rx);
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // 3. Elevation Contours (MOLA / HiRISE DTM)
  const contours = layerMap.contours;
  if (contours?.enabled) {
    ctx.save();
    ctx.globalAlpha = contours.opacity / 100;
    const step = 4;
    const gridN = size / step;
    const interval = Math.max(15, Math.round((site.maxElevM - site.minElevM) / 14));
    const vals: number[][] = [];
    for (let gy = 0; gy <= gridN; gy++) {
      const row: number[] = [];
      for (let gx = 0; gx <= gridN; gx++) {
        row.push(getRawElevationM(site, (gx * step * 1000) / size, (gy * step * 1000) / size));
      }
      vals.push(row);
    }
    for (let gy = 0; gy < gridN; gy++) {
      for (let gx = 0; gx < gridN; gx++) {
        const v00 = Math.floor(vals[gy][gx] / interval);
        const v10 = Math.floor(vals[gy][gx + 1] / interval);
        const v01 = Math.floor(vals[gy + 1][gx] / interval);
        if (v00 !== v10 || v00 !== v01) {
          const level = Math.max(v00, v10, v01) * interval;
          const isMajor = level % (interval * 3) === 0;
          ctx.fillStyle = isMajor ? 'rgba(56, 189, 248, 0.82)' : 'rgba(56, 189, 248, 0.34)';
          ctx.fillRect(gx * step, gy * step, isMajor ? 2.4 : 1.5, isMajor ? 2.4 : 1.5);
        }
      }
    }
    ctx.restore();
  }

  // 4. Slope & Sand Hazard Zones
  const hazards = layerMap.hazards;
  if (hazards?.enabled) {
    ctx.save();
    ctx.globalAlpha = hazards.opacity / 100;
    for (const h of site.hazards) {
      const isCrit = h.severity === 'critical';
      ctx.save();
      ctx.translate(toPx(h.x), toPx(h.y));
      ctx.rotate((h.rotationDeg * Math.PI) / 180);
      const rx = toPx(h.rx);
      const ry = toPx(h.ry);

      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = isCrit ? 'rgba(239, 68, 68, 0.34)' : 'rgba(245, 158, 11, 0.28)';
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.strokeStyle = isCrit ? 'rgba(239, 68, 68, 0.65)' : 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = 2;
      const span = Math.max(rx, ry) * 2;
      for (let d = -span; d <= span; d += 14) {
        ctx.beginPath();
        ctx.moveTo(d, -ry - 12);
        ctx.lineTo(d - 38, ry + 12);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = isCrit ? '#EF4444' : '#F59E0B';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([8, 5]);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // Subtle 100m tactical coordinate grid
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.08)';
  ctx.lineWidth = 1;
  for (let g = 0; g <= size; g += size / 10) {
    ctx.beginPath();
    ctx.moveTo(g, 0);
    ctx.lineTo(g, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, g);
    ctx.lineTo(size, g);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

// Composite 6-part Mars Base Camp Habitat (grounded bottom-center)
function createHabitatGroup(): THREE.Group {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xd8dee9,
    roughness: 0.42,
    metalness: 0.35,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x2b3445,
    roughness: 0.35,
    metalness: 0.8,
  });
  const solarMat = new THREE.MeshStandardMaterial({
    color: 0x15365e,
    roughness: 0.18,
    metalness: 0.75,
  });
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });

  // 1. Foundation landing pad
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.35, 0.3, 8), darkMetalMat);
  pad.position.y = 0.15;
  pad.castShadow = true;
  pad.receiveShadow = true;
  group.add(pad);

  // 2. Main pressurized dome/cylinder
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 1.35, 8), hullMat);
  core.position.y = 0.95;
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);

  // 3. Upper pressure cap
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.48, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45),
    hullMat
  );
  dome.position.y = 1.5;
  dome.castShadow = true;
  group.add(dome);

  // 4. Airlock vestibule
  const airlock = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 1.2), darkMetalMat);
  airlock.position.set(0, 0.65, 1.65);
  airlock.castShadow = true;
  group.add(airlock);

  // 5. Dual solar wings
  [-2.6, 2.6].forEach((offsetX) => {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 1.2), solarMat);
    wing.position.set(offsetX, 1.05, 0);
    wing.rotation.x = 0.25;
    wing.castShadow = true;
    group.add(wing);
  });

  // 6. Comms mast & status beacon
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 8), darkMetalMat);
  mast.position.set(0.5, 2.3, -0.3);
  group.add(mast);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), beaconMat);
  beacon.position.set(0.5, 3.05, -0.3);
  group.add(beacon);

  return group;
}

// Composite 7-part Curiosity-II Scout Rover (grounded bottom-center)
function createRoverGroup(): { group: THREE.Group; radarRing: THREE.Mesh } {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.38,
    metalness: 0.55,
  });
  const goldFoilMat = new THREE.MeshStandardMaterial({
    color: 0xd4a024,
    roughness: 0.25,
    metalness: 0.9,
  });
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x1e2430,
    roughness: 0.78,
    metalness: 0.35,
  });
  const mastEyeMat = new THREE.MeshStandardMaterial({
    color: 0x4edea3,
    emissive: 0x10b981,
    emissiveIntensity: 1.8,
  });

  // 1. Warm electronics chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 1.85), bodyMat);
  chassis.position.y = 0.65;
  chassis.castShadow = true;
  group.add(chassis);

  // 2. Gold MLI thermal deck accent
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 1.3), goldFoilMat);
  deck.position.set(0, 0.96, 0.1);
  group.add(deck);

  // 3. Rear RTG power fin assembly
  const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.85, 8), darkGoldMat());
  rtg.rotation.x = Math.PI / 4;
  rtg.position.set(0, 0.85, -1.05);
  rtg.castShadow = true;
  group.add(rtg);

  // 4. 6 Rocker-Bogie Wheels grounded at y = 0.28
  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  [-0.82, 0.82].forEach((wx) => {
    [-0.75, 0, 0.75].forEach((wz) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, 0.28, wz);
      wheel.castShadow = true;
      group.add(wheel);
    });
  });

  // 5. Remote Sensing Mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.15, 8), bodyMat);
  mast.position.set(0.32, 1.45, 0.55);
  mast.castShadow = true;
  group.add(mast);

  // 6. Mastcam-Z ChemCam Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.34), bodyMat);
  head.position.set(0.32, 2.05, 0.6);
  head.castShadow = true;
  group.add(head);

  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 12), mastEyeMat);
  eye.rotation.x = Math.PI / 2;
  eye.position.set(0.32, 2.05, 0.78);
  group.add(eye);

  // 7. Ground Radar Sweep Ring
  const radarRing = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.9, 32),
    new THREE.MeshBasicMaterial({
      color: 0x4edea3,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  radarRing.rotation.x = -Math.PI / 2;
  radarRing.position.y = 0.18;
  group.add(radarRing);

  return { group, radarRing };

  function darkGoldMat() {
    return new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.45,
      metalness: 0.75,
    });
  }
}

// Composite 5-part xEMU Astronaut Unit (grounded bottom-center)
function createAstronautGroup(): THREE.Group {
  const group = new THREE.Group();

  const suitMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.55,
    metalness: 0.1,
  });
  const plssMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.6,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.12,
    metalness: 0.95,
    emissive: 0x4edea3,
    emissiveIntensity: 0.25,
  });

  // Boots/legs
  [-0.18, 0.18].forEach((lx) => {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.52, 4, 8), suitMat);
    leg.position.set(lx, 0.38, 0);
    leg.castShadow = true;
    group.add(leg);
  });

  // Torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.48, 6, 12), suitMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);

  // PLSS Backpack
  const plss = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.34), plssMat);
  plss.position.set(0, 1.1, -0.32);
  plss.castShadow = true;
  group.add(plss);

  // Helmet + Gold Visor
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), suitMat);
  helmet.position.set(0, 1.65, 0);
  helmet.castShadow = true;
  group.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 16, 12, -Math.PI * 0.4, Math.PI * 0.8, Math.PI * 0.2, Math.PI * 0.5),
    visorMat
  );
  visor.position.set(0, 1.65, 0.08);
  group.add(visor);

  // Forward visor FOV cone on ground
  const fovGeo = new THREE.ConeGeometry(2.6, 5.5, 16, 1, true);
  fovGeo.rotateX(Math.PI / 2);
  fovGeo.translate(0, 0.3, 2.75);
  const fovMat = new THREE.MeshBasicMaterial({
    color: 0x4edea3,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  group.add(new THREE.Mesh(fovGeo, fovMat));

  return group;
}

export const TacticalMap3D: React.FC<TacticalMap3DProps> = ({
  site,
  layers,
  waypoints,
  routeAnalysis,
  showSafeComparison,
  observations,
  selectedPoiId,
  selectedRover,
  marswalkMode,
  astronautPos,
  mapTool,
  onChangeMapTool,
  onUpdateWaypoint,
  onAddWaypoint,
  onSelectPoi,
  onSelectRover,
  onSelectObservation,
  onRequestLogAt,
  onApplySafeRoute,
  onInspectHazards,
  viewModeToggle,
  trnGuidance,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  const [cursorInfo, setCursorInfo] = useState<{
    lat: string;
    lon: string;
    elevM: number;
    slopeDeg: number;
    tiu: number;
  } | null>(null);

  // Projected HTML label coordinates
  const [projectedLabels, setProjectedLabels] = useState<
    Array<{
      id: string;
      text: string;
      x: number;
      y: number;
      kind: 'waypoint' | 'poi' | 'rover' | 'obs' | 'hazard' | 'landmark';
      index?: number;
      visible: boolean;
    }>
  >([]);

  const layerMap = useMemo(() => {
    const map: Record<LayerId, LayerConfig> = {} as Record<LayerId, LayerConfig>;
    for (const l of layers) map[l.id] = l;
    return map;
  }, [layers]);

  // Mutable refs so the WebGL loop and pointer handlers always read latest props without tearing down WebGL
  const propsRef = useRef({
    site,
    waypoints,
    routeAnalysis,
    showSafeComparison,
    observations,
    selectedPoiId,
    selectedRover,
    marswalkMode,
    astronautPos,
    trnGuidance,
    mapTool,
    layerMap,
    onUpdateWaypoint,
    onAddWaypoint,
    onSelectPoi,
    onSelectRover,
    onSelectObservation,
    onRequestLogAt,
  });
  propsRef.current = {
    site,
    waypoints,
    routeAnalysis,
    showSafeComparison,
    observations,
    selectedPoiId,
    selectedRover,
    marswalkMode,
    astronautPos,
    trnGuidance,
    mapTool,
    layerMap,
    onUpdateWaypoint,
    onAddWaypoint,
    onSelectPoi,
    onSelectRover,
    onSelectObservation,
    onRequestLogAt,
  };

  // References to dynamic Three.js groups updated cleanly when props change
  const sceneHandlesRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    terrainMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    overlayMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    rocksInstanced: THREE.InstancedMesh;
    habitatGroup: THREE.Group;
    roverObj: { group: THREE.Group; radarRing: THREE.Mesh };
    astronautGroup: THREE.Group;
    routeGroup: THREE.Group;
    safeRouteGroup: THREE.Group;
    markersGroup: THREE.Group;
    trnGroup: THREE.Group;
    waypointHitMeshes: THREE.Mesh[];
    poiHitMeshes: THREE.Mesh[];
    obsHitMeshes: THREE.Mesh[];
    roverHitMesh: THREE.Mesh;
    criticalMaterials: THREE.MeshBasicMaterial[];
    camAnimActive: boolean;
    isSoftwareGl: boolean;
    requestRender: () => void;
    setCameraPreset: (preset: '3d' | 'top' | 'rover') => void;
    rebuildSiteGeometry: (s: SiteDataset) => void;
    rebuildOverlayTexture: (s: SiteDataset, lm: Record<LayerId, LayerConfig>) => void;
    rebuildRouteAndMarkers: () => void;
    rebuildTrnVisuals: () => void;
  } | null>(null);

  // Initialize Three.js WebGL scene ONCE
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Software WebGL detection per Three.js skill
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 500);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#19110E');
    scene.fog = new THREE.FogExp2('#1c1310', 0.0072);

    // Mandatory studio environment map for metallic rover/visor reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      46,
      (container.clientWidth || 800) / (container.clientHeight || 500),
      0.5,
      450
    );
    camera.position.set(-48, 56, 68);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI * 0.465; // prevent clipping under terrain
    controls.minDistance = 14;
    controls.maxDistance = 145;
    controls.target.set(0, 6, 0);

    // 3-Point Martian Sunlight + Atmospheric Fill Rig
    const hemiLight = new THREE.HemisphereLight(0xc9b29b, 0x5c3322, 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffe1bd, 2.35);
    sunLight.position.set(-55, 68, 42);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 210;
    sunLight.shadow.camera.left = -65;
    sunLight.shadow.camera.right = 65;
    sunLight.shadow.camera.top = 65;
    sunLight.shadow.camera.bottom = -65;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.03;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x7bd0ff, 0.42);
    rimLight.position.set(60, 28, -55);
    scene.add(rimLight);

    // Subtle Martian sky dome gradient
    const skyGeo = new THREE.SphereGeometry(240, 24, 16);
    const skyPos = skyGeo.attributes.position;
    const skyColors = new Float32Array(skyPos.count * 3);
    const colHorizon = new THREE.Color('#301d16');
    const colZenith = new THREE.Color('#090d14');
    for (let i = 0; i < skyPos.count; i++) {
      const yNorm = Math.max(0, Math.min(1, skyPos.getY(i) / 180));
      _tmpColor.copy(colHorizon).lerp(colZenith, Math.pow(yNorm, 0.55));
      skyColors[i * 3] = _tmpColor.r;
      skyColors[i * 3 + 1] = _tmpColor.g;
      skyColors[i * 3 + 2] = _tmpColor.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
    const skyDome = new THREE.Mesh(
      skyGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })
    );
    scene.add(skyDome);

    // Terrain Mesh (170x170m world skirt)
    const terrainGeo = new THREE.PlaneGeometry(
      TERRAIN_EXTENT,
      TERRAIN_EXTENT,
      TERRAIN_SEGMENTS,
      TERRAIN_SEGMENTS
    );
    terrainGeo.rotateX(-Math.PI / 2);
    const terrainMat = new THREE.MeshStandardMaterial({
      roughness: 0.88,
      metalness: 0.04,
      normalScale: new THREE.Vector2(1.15, 1.15),
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);

    // Core 100x100m Data Overlay Mesh (Contours, Hazards, CRISM, THEMIS)
    const overlayGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 120, 120);
    overlayGeo.rotateX(-Math.PI / 2);
    const overlayMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const overlayMesh = new THREE.Mesh(overlayGeo, overlayMat);
    overlayMesh.position.y = 0.06;
    scene.add(overlayMesh);

    // Instanced Martian Rocks & Boulders (280 boulders)
    const ROCK_COUNT = 280;
    const rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
    const rPos = rockGeo.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const vx = rPos.getX(i);
      const vy = rPos.getY(i);
      const vz = rPos.getZ(i);
      const scaleJit = 0.82 + 0.35 * Math.abs(Math.sin(vx * 7 + vy * 11 + vz * 5));
      rPos.setXYZ(i, vx * scaleJit, vy * scaleJit * 0.7, vz * scaleJit);
    }
    rockGeo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0.05,
    });
    const rocksInstanced = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
    rocksInstanced.castShadow = !isSoftwareGl;
    rocksInstanced.receiveShadow = true;
    scene.add(rocksInstanced);

    // Composite Hero Props
    const habitatGroup = createHabitatGroup();
    scene.add(habitatGroup);

    const roverObj = createRoverGroup();
    scene.add(roverObj.group);

    // Invisible larger hit mesh for easy rover picking
    const roverHitMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.8, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    scene.add(roverHitMesh);

    const astronautGroup = createAstronautGroup();
    astronautGroup.visible = false;
    scene.add(astronautGroup);

    const routeGroup = new THREE.Group();
    const safeRouteGroup = new THREE.Group();
    const markersGroup = new THREE.Group();
    const trnGroup = new THREE.Group();
    scene.add(routeGroup, safeRouteGroup, markersGroup, trnGroup);

    const handles = {
      renderer,
      scene,
      camera,
      controls,
      terrainMesh,
      overlayMesh,
      rocksInstanced,
      habitatGroup,
      roverObj,
      astronautGroup,
      routeGroup,
      safeRouteGroup,
      markersGroup,
      trnGroup,
      waypointHitMeshes: [] as THREE.Mesh[],
      poiHitMeshes: [] as THREE.Mesh[],
      obsHitMeshes: [] as THREE.Mesh[],
      roverHitMesh,
      criticalMaterials: [] as THREE.MeshBasicMaterial[],
      camAnimActive: false,
      isSoftwareGl,
      requestRender: () => {},
      setCameraPreset: (preset: '3d' | 'top' | 'rover') => {
        const s = propsRef.current.site;
        if (preset === 'top') {
          _camTargetGoal.set(0, 6, 0);
          _camPosGoal.set(0, 118, 2.5);
        } else if (preset === 'rover') {
          const [rx, rz] = mapToWorldXZ(s.rover.x, s.rover.y);
          const ry = getWorldHeight(s, rx, rz);
          _camTargetGoal.set(rx, ry + 1.2, rz);
          _camPosGoal.set(rx - 14, ry + 12, rz + 16);
        } else {
          _camTargetGoal.set(0, 6, 0);
          _camPosGoal.set(-48, 56, 68);
        }
        handles.camAnimActive = true;
      },
      rebuildSiteGeometry: (s: SiteDataset) => {
        // 1. Update main terrain heightfield
        const pos = terrainGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i);
          const vz = pos.getZ(i);
          pos.setY(i, getWorldHeight(s, vx, vz));
        }
        pos.needsUpdate = true;
        terrainGeo.computeVertexNormals();
        terrainGeo.computeBoundingSphere();

        // 2. Update draped overlay mesh heightfield
        const oPos = overlayGeo.attributes.position;
        for (let i = 0; i < oPos.count; i++) {
          const vx = oPos.getX(i);
          const vz = oPos.getZ(i);
          oPos.setY(i, getWorldHeight(s, vx, vz));
        }
        oPos.needsUpdate = true;
        overlayGeo.computeVertexNormals();

        // 3. Rebuild site surface textures
        const lm = propsRef.current.layerMap;
        const opt = lm.optical;
        const { albedoMap, normalMap } = buildMartianSurfaceTextures(
          s,
          opt?.enabled ?? true,
          opt?.opacity ?? 100,
          renderer.capabilities.getMaxAnisotropy()
        );
        terrainMat.map?.dispose();
        terrainMat.normalMap?.dispose();
        terrainMat.map = albedoMap;
        terrainMat.normalMap = normalMap;
        terrainMat.needsUpdate = true;

        // 4. Scatter instanced Martian rocks grounded flush on terrain
        const seedOffset = s.id === 'gale' ? 11 : s.id === 'jezero' ? 37 : 73;
        for (let i = 0; i < ROCK_COUNT; i++) {
          const a = Math.sin(i * 12.9898 + seedOffset) * 43758.5453;
          const b = Math.sin(i * 78.233 + seedOffset * 2) * 43758.5453;
          const rx = ((a - Math.floor(a)) - 0.5) * 116;
          const rz = ((b - Math.floor(b)) - 0.5) * 116;
          const ry = getWorldHeight(s, rx, rz);
          const sc = 0.45 + ((i * 7) % 13) * 0.1;

          _dummyObj.position.set(rx, ry + sc * 0.15, rz);
          _dummyObj.rotation.set(
            ((i * 3) % 7) * 0.3,
            ((i * 5) % 11) * 0.6,
            ((i * 2) % 5) * 0.2
          );
          _dummyObj.scale.set(sc * 1.2, sc * 0.75, sc);
          _dummyObj.updateMatrix();
          rocksInstanced.setMatrixAt(i, _dummyObj.matrix);

          const shade = 0.55 + ((i * 13) % 10) * 0.045;
          _tmpColor.setRGB(shade * 0.68, shade * 0.4, shade * 0.3);
          rocksInstanced.setColorAt(i, _tmpColor);
        }
        rocksInstanced.instanceMatrix.needsUpdate = true;
        if (rocksInstanced.instanceColor) rocksInstanced.instanceColor.needsUpdate = true;
        rocksInstanced.computeBoundingSphere();
      },
      rebuildOverlayTexture: (s: SiteDataset, lm: Record<LayerId, LayerConfig>) => {
        const tex = buildDataOverlayTexture(s, lm, renderer.capabilities.getMaxAnisotropy());
        overlayMat.map?.dispose();
        overlayMat.map = tex;
        overlayMat.needsUpdate = true;
      },
      rebuildRouteAndMarkers: () => {
        const {
          site: s,
          waypoints: wps,
          routeAnalysis: ra,
          showSafeComparison: showSafe,
          observations: obsList,
          selectedPoiId: selPoi,
          layerMap: lm,
        } = propsRef.current;

        // Helper to dispose children of a group
        const clearGroup = (grp: THREE.Group) => {
          while (grp.children.length > 0) {
            const c = grp.children[0];
            grp.remove(c);
            c.traverse((obj) => {
              if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
              const mat = (obj as THREE.Mesh).material;
              if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
              else if (mat) mat.dispose();
            });
          }
        };

        clearGroup(routeGroup);
        clearGroup(safeRouteGroup);
        clearGroup(markersGroup);
        handles.waypointHitMeshes = [];
        handles.poiHitMeshes = [];
        handles.obsHitMeshes = [];
        handles.criticalMaterials = [];

        // Position Habitat at Base Camp (waypoint 0)
        if (wps.length > 0) {
          const [hx, hz] = mapToWorldXZ(wps[0].x, wps[0].y);
          const hy = getWorldHeight(s, hx, hz);
          habitatGroup.position.set(hx, hy, hz);
          habitatGroup.visible = true;
        } else {
          habitatGroup.visible = false;
        }

        // Position Curiosity-II Scout Rover
        const roverVisible = lm.rover?.enabled ?? true;
        roverObj.group.visible = roverVisible;
        roverHitMesh.visible = roverVisible;
        if (roverVisible) {
          const [rvX, rvZ] = mapToWorldXZ(s.rover.x, s.rover.y);
          const rvY = getWorldHeight(s, rvX, rvZ);
          roverObj.group.position.set(rvX, rvY, rvZ);
          roverObj.group.rotation.y = (-s.rover.headingDeg * Math.PI) / 180;
          roverHitMesh.position.set(rvX, rvY + 1.2, rvZ);
        }

        // Render Safe Bedrock Comparison Route
        if (showSafe && s.safeBedrockWaypoints.length > 1) {
          const safePts: THREE.Vector3[] = [];
          for (let i = 0; i < s.safeBedrockWaypoints.length - 1; i++) {
            const a = s.safeBedrockWaypoints[i];
            const b = s.safeBedrockWaypoints[i + 1];
            const steps = 26;
            for (let k = 0; k <= steps; k++) {
              if (i > 0 && k === 0) continue;
              const t = k / steps;
              const [wx, wz] = mapToWorldXZ(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
              safePts.push(new THREE.Vector3(wx, getWorldHeight(s, wx, wz) + 0.55, wz));
            }
          }
          const safeCurve = new THREE.CatmullRomCurve3(safePts);
          const safeTube = new THREE.TubeGeometry(safeCurve, 90, 0.24, 6, false);
          const safeMat = new THREE.MeshBasicMaterial({
            color: 0x10b981,
            transparent: true,
            opacity: 0.85,
          });
          safeRouteGroup.add(new THREE.Mesh(safeTube, safeMat));
        }

        // Render Active Route Segments (hugging 3D terrain relief)
        for (let i = 0; i < wps.length - 1; i++) {
          const a = wps[i];
          const b = wps[i + 1];
          const seg = ra.segments[i];
          const sev = seg?.hazardSeverity || 'nominal';

          const pts: THREE.Vector3[] = [];
          const steps = 28;
          for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            const [wx, wz] = mapToWorldXZ(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
            pts.push(new THREE.Vector3(wx, getWorldHeight(s, wx, wz) + 0.42, wz));
          }
          const curve = new THREE.CatmullRomCurve3(pts);

          if (sev === 'critical') {
            // Core crimson tube
            const coreTube = new THREE.TubeGeometry(curve, 36, 0.34, 8, false);
            const coreMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
            routeGroup.add(new THREE.Mesh(coreTube, coreMat));

            // Pulsating outer hazard sheath
            const haloTube = new THREE.TubeGeometry(curve, 36, 0.78, 8, false);
            const haloMat = new THREE.MeshBasicMaterial({
              color: 0xef4444,
              transparent: true,
              opacity: 0.38,
              depthWrite: false,
            });
            handles.criticalMaterials.push(haloMat);
            routeGroup.add(new THREE.Mesh(haloTube, haloMat));
          } else {
            const segColor = sev === 'caution' ? 0xf59e0b : 0x38bdf8;
            const segTube = new THREE.TubeGeometry(curve, 32, 0.26, 7, false);
            const segMat = new THREE.MeshBasicMaterial({ color: segColor });
            routeGroup.add(new THREE.Mesh(segTube, segMat));
          }
        }

        // Waypoint Beacons & Invisible Drag Hit Spheres
        wps.forEach((wp, idx) => {
          const [wx, wz] = mapToWorldXZ(wp.x, wp.y);
          const wy = getWorldHeight(s, wx, wz);
          const isBase = idx === 0;
          const colorHex = isBase ? 0x10b981 : 0x38bdf8;

          const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8),
            new THREE.MeshBasicMaterial({ color: colorHex })
          );
          stem.position.set(wx, wy + 1.2, wz);
          markersGroup.add(stem);

          const orb = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.65, 0),
            new THREE.MeshStandardMaterial({
              color: colorHex,
              emissive: colorHex,
              emissiveIntensity: 0.75,
              roughness: 0.25,
              metalness: 0.5,
            })
          );
          orb.position.set(wx, wy + 2.6, wz);
          markersGroup.add(orb);

          const hit = new THREE.Mesh(
            new THREE.SphereGeometry(2.2, 8, 8),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          hit.position.set(wx, wy + 1.8, wz);
          hit.userData = { kind: 'waypoint', waypointId: wp.id };
          markersGroup.add(hit);
          handles.waypointHitMeshes.push(hit);
        });

        // Science POIs
        s.pois.forEach((poi) => {
          const [px, pz] = mapToWorldXZ(poi.x, poi.y);
          const py = getWorldHeight(s, px, pz);
          const isSel = poi.id === selPoi;

          const diamond = new THREE.Mesh(
            new THREE.OctahedronGeometry(isSel ? 0.95 : 0.7, 0),
            new THREE.MeshStandardMaterial({
              color: 0xa855f7,
              emissive: 0xa855f7,
              emissiveIntensity: isSel ? 1.4 : 0.65,
              roughness: 0.2,
            })
          );
          diamond.position.set(px, py + 2.1, pz);
          markersGroup.add(diamond);

          const ring = new THREE.Mesh(
            new THREE.RingGeometry(1.1, 1.35, 24),
            new THREE.MeshBasicMaterial({
              color: 0xddb7ff,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.75,
            })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(px, py + 0.2, pz);
          markersGroup.add(ring);

          const hit = new THREE.Mesh(
            new THREE.SphereGeometry(2.0, 8, 8),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          hit.position.set(px, py + 1.5, pz);
          hit.userData = { kind: 'poi', poi };
          markersGroup.add(hit);
          handles.poiHitMeshes.push(hit);
        });

        // Logged Field Observations
        obsList.forEach((obs) => {
          const [ox, oz] = mapToWorldXZ(obs.x, obs.y);
          const oy = getWorldHeight(s, ox, oz);

          const cube = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.85, 0.85),
            new THREE.MeshStandardMaterial({
              color: 0x4edea3,
              emissive: 0x10b981,
              emissiveIntensity: 0.9,
            })
          );
          cube.position.set(ox, oy + 1.4, oz);
          markersGroup.add(cube);

          const hit = new THREE.Mesh(
            new THREE.SphereGeometry(1.8, 8, 8),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          hit.position.set(ox, oy + 1.2, oz);
          hit.userData = { kind: 'obs', obs };
          markersGroup.add(hit);
          handles.obsHitMeshes.push(hit);
        });
      },
      rebuildTrnVisuals: () => {
        const { site: s, trnGuidance: trn, layerMap: lm, marswalkMode: mw } = propsRef.current;

        while (trnGroup.children.length > 0) {
          const c = trnGroup.children[0];
          trnGroup.remove(c);
          c.traverse((obj) => {
            if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
            const mat = (obj as THREE.Mesh).material;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else if (mat) mat.dispose();
          });
        }

        const trnEnabled = (lm.trn?.enabled ?? true) || mw;
        trnGroup.visible = trnEnabled;
        if (!trnEnabled) return;

        // 1. Visual Landmarks (distinctive rock outcrops, boulders, ridges)
        s.landmarks.forEach((lmItem) => {
          const [lx, lz] = mapToWorldXZ(lmItem.x, lmItem.y);
          const ly = getWorldHeight(s, lx, lz);

          const isPrimary = trn?.primaryLandmark?.landmark.id === lmItem.id;
          const markerMat = new THREE.MeshStandardMaterial({
            color: isPrimary ? 0xfbbf24 : 0xd97706,
            emissive: isPrimary ? 0xf59e0b : 0x78350f,
            emissiveIntensity: isPrimary ? 0.9 : 0.3,
            roughness: 0.72,
            metalness: 0.15,
          });
          const markerMesh = new THREE.Mesh(
            lmItem.featureType === 'boulder'
              ? new THREE.DodecahedronGeometry(isPrimary ? 1.05 : 0.78, 0)
              : lmItem.featureType === 'ridge' || lmItem.featureType === 'butte'
              ? new THREE.ConeGeometry(isPrimary ? 1.15 : 0.85, isPrimary ? 1.8 : 1.35, 5)
              : new THREE.OctahedronGeometry(isPrimary ? 0.95 : 0.72, 0),
            markerMat
          );
          markerMesh.position.set(lx, ly + 0.75, lz);
          markerMesh.castShadow = !isSoftwareGl;
          trnGroup.add(markerMesh);

          const lmRing = new THREE.Mesh(
            new THREE.RingGeometry(1.15, 1.4, 24),
            new THREE.MeshBasicMaterial({
              color: 0xfbbf24,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: isPrimary ? 0.88 : 0.42,
              depthWrite: false,
            })
          );
          lmRing.rotation.x = -Math.PI / 2;
          lmRing.position.set(lx, ly + 0.18, lz);
          trnGroup.add(lmRing);
        });

        // 2. Astronaut TRN Uncertainty Envelope, Target Vector, Corrected Vector, Solar Ray & Rover Baseline
        if (trn) {
          const [ax, az] = mapToWorldXZ(trn.currentPos.x, trn.currentPos.y);
          const ay = getWorldHeight(s, ax, az);

          const confHex =
            trn.confidenceLevel === 'HIGH'
              ? 0x4edea3
              : trn.confidenceLevel === 'MEDIUM'
              ? 0xf59e0b
              : 0xef4444;

          const uncWorldR = Math.max(
            1.4,
            Math.min(12, (trn.uncertaintyRadiusM / s.scaleMetersPerUnit) * 0.1)
          );
          const uncRing = new THREE.Mesh(
            new THREE.RingGeometry(uncWorldR - 0.18, uncWorldR, 36),
            new THREE.MeshBasicMaterial({
              color: confHex,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.8,
              depthWrite: false,
            })
          );
          uncRing.rotation.x = -Math.PI / 2;
          uncRing.position.set(ax, ay + 0.22, az);
          trnGroup.add(uncRing);

          // Target Destination Vector Beam
          const [tx, tz] = mapToWorldXZ(trn.destination.x, trn.destination.y);
          const vecPts: THREE.Vector3[] = [];
          for (let k = 0; k <= 18; k++) {
            const t = k / 18;
            const px = ax + (tx - ax) * t;
            const pz = az + (tz - az) * t;
            vecPts.push(new THREE.Vector3(px, getWorldHeight(s, px, pz) + 0.85, pz));
          }
          if (vecPts.length >= 2) {
            const beamGeo = new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3(vecPts),
              24,
              0.14,
              6,
              false
            );
            const beamMat = new THREE.MeshBasicMaterial({
              color: trn.isOffCourse ? 0xf59e0b : 0x38bdf8,
              transparent: true,
              opacity: 0.88,
            });
            trnGroup.add(new THREE.Mesh(beamGeo, beamMat));
          }

          // Corrected Navigation Vector (if off-course or obstacle bypass)
          if (trn.correctedVector) {
            const [cx, cz] = mapToWorldXZ(
              trn.correctedVector.targetX,
              trn.correctedVector.targetY
            );
            const corrPts: THREE.Vector3[] = [];
            for (let k = 0; k <= 16; k++) {
              const t = k / 16;
              const px = ax + (cx - ax) * t;
              const pz = az + (cz - az) * t;
              corrPts.push(new THREE.Vector3(px, getWorldHeight(s, px, pz) + 1.05, pz));
            }
            const corrGeo = new THREE.TubeGeometry(
              new THREE.CatmullRomCurve3(corrPts),
              20,
              0.18,
              6,
              false
            );
            const corrMat = new THREE.MeshBasicMaterial({
              color: 0x4edea3,
              transparent: true,
              opacity: 0.95,
            });
            trnGroup.add(new THREE.Mesh(corrGeo, corrMat));
          }

          // Solar Azimuth Reference Ray
          const sunRad = (trn.solar.sunAzimuthDeg * Math.PI) / 180;
          const sunLen = 13;
          const sx = ax + Math.sin(sunRad) * sunLen;
          const sz = az - Math.cos(sunRad) * sunLen;
          const sy = getWorldHeight(s, sx, sz) + 2.2;
          const sunLineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(ax, ay + 1.4, az),
            new THREE.Vector3(sx, sy, sz),
          ]);
          const sunLineMat = new THREE.LineBasicMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.78,
          });
          trnGroup.add(new THREE.Line(sunLineGeo, sunLineMat));

          // Scout Rover Reference Baseline
          if (trn.roverRef.active && (lm.rover?.enabled ?? true)) {
            const [rvx, rvz] = mapToWorldXZ(s.rover.x, s.rover.y);
            const rvy = getWorldHeight(s, rvx, rvz) + 1.2;
            const roverLineGeo = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(ax, ay + 1.1, az),
              new THREE.Vector3(rvx, rvy, rvz),
            ]);
            const roverLineMat = new THREE.LineBasicMaterial({
              color: 0x10b981,
              transparent: true,
              opacity: 0.85,
            });
            trnGroup.add(new THREE.Line(roverLineGeo, roverLineMat));
          }
        }
      },
    };

    sceneHandlesRef.current = handles;

    // Initial site build + shader pre-warm
    handles.rebuildSiteGeometry(propsRef.current.site);
    handles.rebuildOverlayTexture(propsRef.current.site, propsRef.current.layerMap);
    handles.rebuildTrnVisuals();
    handles.rebuildRouteAndMarkers();
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Cancel scripted camera glide on manual user orbit/pan
    const onControlStart = () => {
      handles.camAnimActive = false;
    };
    controls.addEventListener('start', onControlStart);

    // ResizeObserver for crisp layout sync
    const resizeObs = new ResizeObserver(() => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 500;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObs.observe(container);

    // Animation loop (supports pulsating critical hazards, rover radar, astronaut, & camera damping)
    let frameId = 0;
    let lastTime = performance.now();
    let labelTick = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      // Smooth damped camera preset transitions
      if (handles.camAnimActive) {
        const lambda = 5.5;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _camPosGoal.x, lambda, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _camPosGoal.y, lambda, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _camPosGoal.z, lambda, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _camTargetGoal.x, lambda, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _camTargetGoal.y, lambda, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _camTargetGoal.z, lambda, dt);

        if (
          camera.position.distanceTo(_camPosGoal) < 0.25 &&
          controls.target.distanceTo(_camTargetGoal) < 0.2
        ) {
          handles.camAnimActive = false;
        }
      }

      // Update Marswalk Astronaut live 3D position & smooth follow
      const { marswalkMode: mw, astronautPos: aPos, site: s, layerMap: lm } = propsRef.current;
      const showTrnAstronaut = Boolean(aPos && (mw || lm.trn?.enabled));
      if (showTrnAstronaut && aPos) {
        const [ax, az] = mapToWorldXZ(aPos.x, aPos.y);
        const ay = getWorldHeight(s, ax, az);
        astronautGroup.visible = true;
        astronautGroup.position.set(ax, ay, az);
        astronautGroup.rotation.y = (-aPos.headingDeg * Math.PI) / 180 + Math.PI;
        if (mw && !handles.camAnimActive) {
          controls.target.x = THREE.MathUtils.damp(controls.target.x, ax, 4, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, ay + 1.4, 4, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, az, 4, dt);
        }
      } else {
        astronautGroup.visible = false;
      }

      // Pulse critical hazard route halos
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
      for (const mat of handles.criticalMaterials) {
        mat.opacity = 0.18 + pulse * 0.48;
      }

      // Animate rover radar scan ring
      const rCycle = (now % 2200) / 2200;
      const rScale = 0.8 + rCycle * 2.2;
      roverObj.radarRing.scale.set(rScale, rScale, 1);
      (roverObj.radarRing.material as THREE.MeshBasicMaterial).opacity = (1 - rCycle) * 0.65;

      controls.update();
      renderer.render(scene, camera);

      // Update projected HTML labels at ~20Hz
      labelTick++;
      if (labelTick % 3 === 0) {
        const w = container.clientWidth || 800;
        const h = container.clientHeight || 500;
        const nextLabels: typeof projectedLabels = [];
        const {
          waypoints: wps,
          observations: obsList,
          layerMap: lm,
          routeAnalysis: ra,
        } = propsRef.current;

        const projectPt = (wx: number, wy: number, wz: number) => {
          _vec3A.set(wx, wy, wz).project(camera);
          const visible = _vec3A.z < 1 && _vec3A.x >= -1.05 && _vec3A.x <= 1.05 && _vec3A.y >= -1.05 && _vec3A.y <= 1.05;
          return {
            sx: ((_vec3A.x + 1) / 2) * w,
            sy: ((-_vec3A.y + 1) / 2) * h,
            visible,
          };
        };

        wps.forEach((wp, idx) => {
          const [wx, wz] = mapToWorldXZ(wp.x, wp.y);
          const wy = getWorldHeight(s, wx, wz) + 3.4;
          const p = projectPt(wx, wy, wz);
          nextLabels.push({
            id: `wp-${wp.id}`,
            text: wp.name,
            x: p.sx,
            y: p.sy,
            kind: 'waypoint',
            index: idx + 1,
            visible: p.visible,
          });
        });

        s.pois.forEach((poi) => {
          const [px, pz] = mapToWorldXZ(poi.x, poi.y);
          const py = getWorldHeight(s, px, pz) + 3.2;
          const p = projectPt(px, py, pz);
          nextLabels.push({
            id: `poi-${poi.id}`,
            text: poi.name,
            x: p.sx,
            y: p.sy,
            kind: 'poi',
            visible: p.visible,
          });
        });

        if (lm.rover?.enabled) {
          const [rx, rz] = mapToWorldXZ(s.rover.x, s.rover.y);
          const ry = getWorldHeight(s, rx, rz) + 2.8;
          const p = projectPt(rx, ry, rz);
          nextLabels.push({
            id: 'rover',
            text: s.rover.callsign,
            x: p.sx,
            y: p.sy,
            kind: 'rover',
            visible: p.visible,
          });
        }

        obsList.forEach((obs) => {
          const [ox, oz] = mapToWorldXZ(obs.x, obs.y);
          const oy = getWorldHeight(s, ox, oz) + 2.5;
          const p = projectPt(ox, oy, oz);
          nextLabels.push({
            id: `obs-${obs.id}`,
            text: obs.title,
            x: p.sx,
            y: p.sy,
            kind: 'obs',
            visible: p.visible,
          });
        });

        // Landmark projected tags when TRN layer is active
        if (lm.trn?.enabled) {
          s.landmarks.forEach((lmItem) => {
            const [lx, lz] = mapToWorldXZ(lmItem.x, lmItem.y);
            const ly = getWorldHeight(s, lx, lz) + 2.3;
            const p = projectPt(lx, ly, lz);
            nextLabels.push({
              id: `lm-${lmItem.id}`,
              text: lmItem.guidanceCue,
              x: p.sx,
              y: p.sy,
              kind: 'landmark',
              visible: p.visible,
            });
          });
        }

        // Critical segment floating midpoint badges
        ra.segments.forEach((seg) => {
          if (seg.hazardSeverity === 'critical') {
            const from = wps[seg.index];
            const to = wps[seg.index + 1];
            if (from && to) {
              const [mx, mz] = mapToWorldXZ((from.x + to.x) / 2, (from.y + to.y) / 2);
              const my = getWorldHeight(s, mx, mz) + 2.6;
              const p = projectPt(mx, my, mz);
              nextLabels.push({
                id: `haz-seg-${seg.index}`,
                text: `CRITICAL ${seg.maxSlopeDeg.toFixed(1)}°`,
                x: p.sx,
                y: p.sy,
                kind: 'hazard',
                visible: p.visible,
              });
            }
          }
        });

        setProjectedLabels(nextLabels);
      }

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    if (isSoftwareGl) frameId = requestAnimationFrame(tick);
    else frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      terrainGeo.dispose();
      terrainMat.map?.dispose();
      terrainMat.normalMap?.dispose();
      terrainMat.dispose();
      overlayGeo.dispose();
      overlayMat.map?.dispose();
      overlayMat.dispose();
      rockGeo.dispose();
      rockMat.dispose();
      skyGeo.dispose();
      (skyDome.material as THREE.Material).dispose();
      envRT.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // React to site changes: rebuild 3D terrain mesh + fly camera smoothly
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.rebuildSiteGeometry(site);
    h.rebuildOverlayTexture(site, layerMap);
    h.rebuildRouteAndMarkers();
    h.setCameraPreset('3d');
  }, [site]);

  // React to layer toggles/opacities: update overlay & optical texture without resetting camera
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.rebuildOverlayTexture(site, layerMap);
    // Update optical opacity/toggle on terrain material
    const opt = layerMap.optical;
    const { albedoMap, normalMap } = buildMartianSurfaceTextures(
      site,
      opt?.enabled ?? true,
      opt?.opacity ?? 100,
      h.renderer.capabilities.getMaxAnisotropy()
    );
    h.terrainMesh.material.map?.dispose();
    h.terrainMesh.material.normalMap?.dispose();
    h.terrainMesh.material.map = albedoMap;
    h.terrainMesh.material.normalMap = normalMap;
    h.terrainMesh.material.needsUpdate = true;
    h.rebuildRouteAndMarkers();
    h.rebuildTrnVisuals();
  }, [layers, site]);

  // React to waypoint, route, observation, selection, and TRN guidance changes
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.rebuildRouteAndMarkers();
    h.rebuildTrnVisuals();
  }, [waypoints, routeAnalysis, showSafeComparison, observations, selectedPoiId, selectedRover, trnGuidance, marswalkMode]);

  // Pointer Raycasting for Waypoint Dragging, Terrain Clicks & POI Inspection
  const raycasterRef = useRef(new THREE.Raycaster());
  const dragStateRef = useRef<{
    waypointId: string | null;
    downClientX: number;
    downClientY: number;
  }>({ waypointId: null, downClientX: 0, downClientY: 0 });

  const updateMouseNdc = (clientX: number, clientY: number) => {
    const el = sceneHandlesRef.current?.renderer.domElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    _mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    updateMouseNdc(e.clientX, e.clientY);
    raycasterRef.current.setFromCamera(_mouseNdc, h.camera);

    dragStateRef.current.downClientX = e.clientX;
    dragStateRef.current.downClientY = e.clientY;

    if (mapTool === 'add-waypoint' || mapTool === 'log-observation') {
      const hits = raycasterRef.current.intersectObject(h.terrainMesh, false);
      if (hits.length > 0) {
        const pt = worldXZToMap(hits[0].point.x, hits[0].point.z);
        if (mapTool === 'add-waypoint') onAddWaypoint(pt.x, pt.y);
        else onRequestLogAt(pt.x, pt.y);
      }
      return;
    }

    // Hit test waypoints for dragging
    if (e.button === 0) {
      const wpHits = raycasterRef.current.intersectObjects(h.waypointHitMeshes, false);
      if (wpHits.length > 0) {
        const wpId = wpHits[0].object.userData.waypointId as string;
        dragStateRef.current.waypointId = wpId;
        h.controls.enabled = false;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    updateMouseNdc(e.clientX, e.clientY);
    raycasterRef.current.setFromCamera(_mouseNdc, h.camera);

    const hits = raycasterRef.current.intersectObject(h.terrainMesh, false);
    if (hits.length > 0) {
      const mapPt = worldXZToMap(hits[0].point.x, hits[0].point.z);
      const ll = mapToLatLon(site, mapPt.x, mapPt.y);
      const sample = sampleTerrainAt(site, mapPt.x, mapPt.y);
      setCursorInfo({
        lat: ll.lat,
        lon: ll.lon,
        elevM: sample.elevationM,
        slopeDeg: sample.slopeDeg,
        tiu: sample.thermalInertia,
      });

      if (dragStateRef.current.waypointId) {
        onUpdateWaypoint(dragStateRef.current.waypointId, mapPt.x, mapPt.y);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const h = sceneHandlesRef.current;
    if (!h) return;

    if (dragStateRef.current.waypointId) {
      dragStateRef.current.waypointId = null;
      h.controls.enabled = true;
      return;
    }

    const moved = Math.hypot(
      e.clientX - dragStateRef.current.downClientX,
      e.clientY - dragStateRef.current.downClientY
    );
    if (moved < 5 && mapTool === 'select' && e.button === 0) {
      updateMouseNdc(e.clientX, e.clientY);
      raycasterRef.current.setFromCamera(_mouseNdc, h.camera);

      if (layerMap.rover?.enabled) {
        const rvHits = raycasterRef.current.intersectObject(h.roverHitMesh, false);
        if (rvHits.length > 0) {
          onSelectRover();
          return;
        }
      }

      const poiHits = raycasterRef.current.intersectObjects(h.poiHitMeshes, false);
      if (poiHits.length > 0) {
        onSelectPoi(poiHits[0].object.userData.poi as SciencePOI);
        return;
      }

      const obsHits = raycasterRef.current.intersectObjects(h.obsHitMeshes, false);
      if (obsHits.length > 0) {
        onSelectObservation(obsHits[0].object.userData.obs as FieldObservation);
      }
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative flex-1 w-full h-full overflow-hidden bg-[#090D14] border border-[#1E293B] rounded select-none ${
        mapTool === 'select' ? 'cursor-grab active:cursor-grabbing' : 'cursor-cell'
      }`}
    >
      {/* Dedicated Empty Mount Ref for Three.js WebGL Canvas */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Projected 3D Spatial Labels (Zero backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {projectedLabels.map((lbl) => {
          if (!lbl.visible) return null;
          if (lbl.kind === 'waypoint') {
            return (
              <div
                key={lbl.id}
                style={{ transform: `translate(${lbl.x}px, ${lbl.y}px) translate(-50%, -100%)` }}
                className="absolute top-0 left-0 px-1.5 py-0.5 bg-[#0B0E14]/90 border border-[#38BDF8]/55 rounded-xs text-[10px] font-mono-tabular text-[#DEE2F1] whitespace-nowrap"
              >
                <span className="text-[#4EDEA3] font-bold mr-1">{lbl.index}.</span>
                {lbl.text}
              </div>
            );
          }
          if (lbl.kind === 'poi') {
            return (
              <div
                key={lbl.id}
                style={{ transform: `translate(${lbl.x}px, ${lbl.y}px) translate(-50%, -100%)` }}
                className="absolute top-0 left-0 px-1.5 py-0.5 bg-[#121721]/90 border border-[#A855F7]/65 rounded-xs text-[9.5px] font-mono-tabular text-[#F0DBFF] whitespace-nowrap"
              >
                ◆ {lbl.text}
              </div>
            );
          }
          if (lbl.kind === 'rover') {
            return (
              <div
                key={lbl.id}
                style={{ transform: `translate(${lbl.x}px, ${lbl.y}px) translate(-50%, -100%)` }}
                className="absolute top-0 left-0 px-1.5 py-0.5 bg-[#0B0E14]/92 border border-[#10B981] rounded-xs text-[9.5px] font-mono-tabular font-bold text-[#4EDEA3] whitespace-nowrap"
              >
                ROVER: {lbl.text}
              </div>
            );
          }
          if (lbl.kind === 'obs') {
            return (
              <div
                key={lbl.id}
                style={{ transform: `translate(${lbl.x}px, ${lbl.y}px) translate(-50%, -100%)` }}
                className="absolute top-0 left-0 px-1.5 py-0.5 bg-[#0B0E14]/92 border border-[#4EDEA3]/70 rounded-xs text-[9.5px] font-mono-tabular text-[#6FFBAE] whitespace-nowrap"
              >
                ■ {lbl.text}
              </div>
            );
          }
          if (lbl.kind === 'landmark') {
            return (
              <div
                key={lbl.id}
                style={{ transform: `translate(${lbl.x}px, ${lbl.y}px) translate(-50%, -100%)` }}
                className="absolute top-0 left-0 px-1.5 py-0.5 bg-[#1C1406]/90 border border-[#F59E0B]/65 rounded-xs text-[9px] font-mono-tabular text-[#FDE68A] whitespace-nowrap"
              >
                ▲ {lbl.text}
              </div>
            );
          }
          return (
            <div
              key={lbl.id}
              style={{ transform: `translate(${lbl.x}px, ${lbl.y}px) translate(-50%, -50%)` }}
              className="absolute top-0 left-0 px-2 py-0.5 bg-[#2A080C]/95 border border-[#EF4444] rounded-xs text-[9.5px] font-mono-tabular font-bold text-[#FECACA] whitespace-nowrap"
            >
              {lbl.text}
            </div>
          );
        })}
      </div>

      {/* Pulsating Critical Hazard Perimeter Overlay */}
      {routeAnalysis.safetyStatus === 'CRITICAL HAZARD' && (
        <div className="pointer-events-none absolute inset-0 border-2 border-[#EF4444]/65 rounded animate-pulse" />
      )}

      {/* Top-Left Live Coordinate & Surface Telemetry HUD (Planning Mode only) */}
      {!marswalkMode && (
        <div className="pointer-events-none absolute top-2.5 left-2.5 hidden sm:flex flex-col gap-1.5 max-w-[330px]">
          <div className="bg-[#0B0E14]/92 border border-[#232B3A] rounded px-2.5 py-1.5">
            <div className="flex items-center gap-3 text-[11px] font-mono-tabular">
              <span className="text-[#86948A] uppercase tracking-wider">MARS 3D DTM</span>
              <span className="text-[#DEE2F1] font-medium">
                {cursorInfo
                  ? `${cursorInfo.lat} · ${cursorInfo.lon}`
                  : `${Math.abs(site.baseLat).toFixed(4)}° · ${site.baseLon.toFixed(4)}° E`}
              </span>
            </div>
            {cursorInfo && (
              <div className="flex items-center gap-3 mt-1 text-[11px] font-mono-tabular">
                <span className="text-[#7BD0FF]">ELEV {cursorInfo.elevM} m</span>
                <span className="text-[#3C4A42]">|</span>
                <span
                  className={
                    cursorInfo.slopeDeg >= 22
                      ? 'text-[#EF4444] font-semibold'
                      : cursorInfo.slopeDeg >= 15
                      ? 'text-[#F59E0B] font-semibold'
                      : 'text-[#4EDEA3]'
                  }
                >
                  SLOPE {cursorInfo.slopeDeg.toFixed(1)}°
                </span>
                <span className="text-[#3C4A42]">|</span>
                <span className="text-[#BBCABF]">TI {cursorInfo.tiu} tiu</span>
              </div>
            )}
          </div>

          {/* Visual Critical Hazard Warning Overlay */}
          {routeAnalysis.safetyStatus === 'CRITICAL HAZARD' && (
            <div className="pointer-events-auto bg-[#26090D]/95 border border-[#EF4444] rounded px-3 py-2 shadow-lg space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-mono-tabular font-bold text-[#FECACA]">
                  <ShieldAlert className="w-4 h-4 text-[#EF4444] animate-pulse shrink-0" />
                  <span>CRITICAL HAZARD</span>
                </div>
                <span className="text-[10px] font-mono-tabular font-semibold text-[#FCA5A5]">
                  PEAK {routeAnalysis.maxSlopeDeg.toFixed(1)}°
                </span>
              </div>
              <p className="text-[10.5px] font-mono-tabular text-[#FCA5A5] leading-snug">
                {routeAnalysis.segments
                  .filter((s) => s.hazardSeverity === 'critical')
                  .map((s) => `Leg ${s.index + 1} (${s.fromName} → ${s.toName})`)
                  .join(', ')}{' '}
                crosses{' '}
                {routeAnalysis.detectedHazards[0]
                  ? `${routeAnalysis.detectedHazards[0].name} (${routeAnalysis.detectedHazards[0].surfaceType})`
                  : 'high-slope / rocky terrain (>22°)'}.
              </p>
              <div className="flex items-center gap-1.5 pt-0.5">
                {onApplySafeRoute && (
                  <button
                    type="button"
                    onClick={onApplySafeRoute}
                    className="px-2 py-1 rounded bg-[#10B981] hover:bg-[#4EDEA3] text-[#0B0E14] text-[10px] font-bold uppercase tracking-wide transition-colors"
                  >
                    Apply Safe Route
                  </button>
                )}
                {onInspectHazards && (
                  <button
                    type="button"
                    onClick={onInspectHazards}
                    className="px-2 py-1 rounded bg-[#1A2230] border border-[#EF4444]/60 hover:border-[#EF4444] text-[#FECACA] text-[10px] font-medium transition-colors"
                  >
                    Inspect Legs
                  </button>
                )}
              </div>
            </div>
          )}

          {routeAnalysis.safetyStatus === 'CAUTION' && (
            <div className="px-2.5 py-1 rounded border text-[11px] font-mono-tabular flex items-center gap-1.5 bg-[#281C0B]/92 border-[#F59E0B]/80 text-[#FCD34D]">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>
                CAUTION: {routeAnalysis.detectedHazards[0]?.name || 'Moderate Slope'} (
                {routeAnalysis.maxSlopeDeg}°)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Top-Right Tools, 3D Camera Presets & 2D/3D Switch */}
      {!marswalkMode && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-2.5 right-2.5 left-2.5 sm:left-auto flex flex-wrap items-center justify-end gap-1.5"
        >
          <div className="flex items-center bg-[#0B0E14]/92 border border-[#232B3A] rounded p-0.5">
            <button
              type="button"
              onClick={() => onChangeMapTool('select')}
              className={`px-2 sm:px-2.5 py-1 text-[11px] font-medium rounded-xs flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                mapTool === 'select'
                  ? 'bg-[#1A2230] text-[#7BD0FF] border border-[#38BDF8]/50'
                  : 'text-[#BBCABF] hover:text-white border border-transparent'
              }`}
            >
              <MousePointer className="w-3 h-3" />
              <span className="hidden sm:inline">Orbit / Drag</span>
              <span className="sm:hidden">Orbit</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeMapTool('add-waypoint')}
              className={`px-2 sm:px-2.5 py-1 text-[11px] font-medium rounded-xs flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                mapTool === 'add-waypoint'
                  ? 'bg-[#1A2230] text-[#4EDEA3] border border-[#10B981]/60'
                  : 'text-[#BBCABF] hover:text-white border border-transparent'
              }`}
            >
              <MapPinPlus className="w-3 h-3" />
              <span>+ WP</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeMapTool('log-observation')}
              className={`px-2 sm:px-2.5 py-1 text-[11px] font-medium rounded-xs flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                mapTool === 'log-observation'
                  ? 'bg-[#1A2230] text-[#DDB7FF] border border-[#A855F7]/60'
                  : 'text-[#BBCABF] hover:text-white border border-transparent'
              }`}
            >
              <Crosshair className="w-3 h-3" />
              <span className="hidden sm:inline">+ Log Sample</span>
              <span className="sm:hidden">+ Log</span>
            </button>
          </div>

          <div className="flex items-center bg-[#0B0E14]/92 border border-[#232B3A] rounded p-0.5">
            <button
              type="button"
              onClick={() => sceneHandlesRef.current?.setCameraPreset('3d')}
              title="3D Orbital Perspective"
              className="px-2 py-1 text-[11px] font-mono-tabular text-[#BBCABF] hover:text-white hover:bg-[#1A2230] rounded-xs flex items-center gap-1 whitespace-nowrap"
            >
              <Eye className="w-3 h-3 text-[#7BD0FF]" />
              <span className="hidden md:inline">3D Orbit</span>
            </button>
            <button
              type="button"
              onClick={() => sceneHandlesRef.current?.setCameraPreset('top')}
              title="Overhead Tactical View"
              className="px-2 py-1 text-[11px] font-mono-tabular text-[#BBCABF] hover:text-white hover:bg-[#1A2230] rounded-xs flex items-center gap-1 whitespace-nowrap"
            >
              <Compass className="w-3 h-3 text-[#4EDEA3]" />
              <span>Top</span>
            </button>
            <button
              type="button"
              onClick={() => sceneHandlesRef.current?.setCameraPreset('rover')}
              title="Focus Curiosity-II Scout Rover"
              className="px-2 py-1 text-[11px] font-mono-tabular text-[#BBCABF] hover:text-white hover:bg-[#1A2230] rounded-xs flex items-center gap-1 whitespace-nowrap"
            >
              <LocateFixed className="w-3 h-3 text-[#4EDEA3]" />
              <span className="hidden md:inline">Rover</span>
            </button>
            {viewModeToggle}
          </div>
        </div>
      )}

      {mapTool !== 'select' && !marswalkMode && (
        <div className="pointer-events-none absolute top-14 right-2.5 bg-[#0B0E14]/95 border border-[#38BDF8]/60 rounded px-3 py-1.5 text-[11px] font-mono-tabular text-[#7BD0FF]">
          {mapTool === 'add-waypoint'
            ? 'CLICK ANYWHERE ON 3D TERRAIN TO APPEND WAYPOINT'
            : 'CLICK ANYWHERE ON 3D TERRAIN TO DROP SAMPLE MARKER'}
        </div>
      )}

      {/* Bottom Controls Hint & Symbology Key (Planning Mode only) */}
      {!marswalkMode && (
        <>
          <div className="pointer-events-none absolute bottom-2.5 left-2.5 hidden sm:block bg-[#0B0E14]/88 border border-[#232B3A] rounded px-2.5 py-1 text-[10px] font-mono-tabular text-[#BBCABF]">
            LEFT DRAG: ORBIT · RIGHT DRAG: PAN · SCROLL: ZOOM · DRAG BEACONS TO REROUTE
          </div>

          <div className="pointer-events-none absolute bottom-2.5 right-2.5 bg-[#0B0E14]/88 border border-[#232B3A] rounded px-2.5 py-1 hidden md:flex items-center gap-3 text-[10px] font-mono-tabular text-[#BBCABF]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-0.5 bg-[#38BDF8]" /> NOMINAL
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-0.5 bg-[#EF4444]" /> CRITICAL &gt;22°
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rotate-45 bg-[#FBBF24]" /> LANDMARK
            </span>
            <span className="flex items-center gap-1">
              <Radio className="w-3 h-3 text-[#4EDEA3]" /> ROVER
            </span>
          </div>
        </>
      )}
    </div>
  );
};
