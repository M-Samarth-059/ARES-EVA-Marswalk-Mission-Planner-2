import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Crosshair,
  LocateFixed,
  MapPinPlus,
  Minus,
  MousePointer,
  Plus,
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

export type MapToolMode = 'select' | 'add-waypoint' | 'log-observation';

interface TacticalMapCanvasProps {
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

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

function buildTerrainOffscreen(site: SiteDataset): HTMLCanvasElement {
  const size = 500;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  const cLow = hexToRgb(site.terrainPalette.low);
  const cMid = hexToRgb(site.terrainPalette.mid);
  const cHigh = hexToRgb(site.terrainPalette.high);
  const cRidge = hexToRgb(site.terrainPalette.ridge);

  const elevSpan = Math.max(1, site.maxElevM - site.minElevM);
  const stepWorld = 1000 / size;

  for (let py = 0; py < size; py++) {
    const wy = py * stepWorld;
    for (let px = 0; px < size; px++) {
      const wx = px * stepWorld;
      const e = getRawElevationM(site, wx, wy);
      const eRight = getRawElevationM(site, Math.min(1000, wx + 4), wy);
      const eDown = getRawElevationM(site, wx, Math.min(1000, wy + 4));

      const t = Math.max(0, Math.min(1, (e - site.minElevM) / elevSpan));

      // Hillshade from NW azimuth
      const dx = (eRight - e) * 0.55;
      const dy = (eDown - e) * 0.55;
      const shade = Math.max(0.45, Math.min(1.42, 1.0 - dx * 0.14 - dy * 0.14));

      // Sedimentary strata micro-banding + fine surface grit
      const strataBand = Math.sin((e / 4.5) * Math.PI) * 0.05;
      const grit = (Math.sin(wx * 0.65 + wy * 0.37) * Math.cos(wx * 0.29 - wy * 0.71)) * 0.04;
      const tMod = Math.max(0, Math.min(1, t + strataBand + grit));

      let rgb: [number, number, number];
      if (tMod < 0.38) {
        rgb = lerpColor(cLow, cMid, tMod / 0.38);
      } else if (tMod < 0.76) {
        rgb = lerpColor(cMid, cHigh, (tMod - 0.38) / 0.38);
      } else {
        rgb = lerpColor(cHigh, cRidge, (tMod - 0.76) / 0.24);
      }

      // Darken aeolian dune sand traps subtly in optical terrain
      for (const h of site.hazards) {
        if (h.surfaceType.toLowerCase().includes('sand') || h.surfaceType.toLowerCase().includes('ripple')) {
          const d = pointInRotatedEllipse(wx, wy, h.x, h.y, h.rx, h.ry, h.rotationDeg);
          if (d < 1.0) {
            const blend = (1 - d) * 0.42;
            const ripple = Math.sin((wx * 0.25 + wy * 0.25)) * 8;
            rgb = [
              Math.max(18, Math.round(rgb[0] * (1 - blend) + (42 + ripple) * blend)),
              Math.max(15, Math.round(rgb[1] * (1 - blend) + (34 + ripple) * blend)),
              Math.max(15, Math.round(rgb[2] * (1 - blend) + (32 + ripple) * blend)),
            ];
          }
        }
      }

      const idx = (py * size + px) * 4;
      data[idx] = Math.min(255, Math.round(rgb[0] * shade));
      data[idx + 1] = Math.min(255, Math.round(rgb[1] * shade));
      data[idx + 2] = Math.min(255, Math.round(rgb[2] * shade));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return off;
}

function buildContoursOffscreen(site: SiteDataset): HTMLCanvasElement {
  const size = 800;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d')!;
  const step = 4; // sample every 4px for crisp marching contour lines
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

  ctx.lineWidth = 1;
  const labeledLevels = new Set<number>();

  for (let gy = 0; gy < gridN; gy++) {
    for (let gx = 0; gx < gridN; gx++) {
      const v00 = Math.floor(vals[gy][gx] / interval);
      const v10 = Math.floor(vals[gy][gx + 1] / interval);
      const v01 = Math.floor(vals[gy + 1][gx] / interval);

      if (v00 !== v10 || v00 !== v01) {
        const level = Math.max(v00, v10, v01) * interval;
        const isMajor = level % (interval * 3) === 0;
        ctx.fillStyle = isMajor ? 'rgba(56, 189, 248, 0.72)' : 'rgba(56, 189, 248, 0.28)';
        ctx.fillRect(gx * step, gy * step, isMajor ? 2 : 1.3, isMajor ? 2 : 1.3);

        if (isMajor && !labeledLevels.has(level) && gx > 15 && gx < gridN - 25 && gy > 15 && gy < gridN - 15) {
          labeledLevels.add(level);
          ctx.font = '600 10px "JetBrains Mono", monospace';
          ctx.fillStyle = 'rgba(123, 208, 255, 0.92)';
          ctx.fillText(`${level}m`, gx * step + 4, gy * step - 3);
        }
      }
    }
  }

  return off;
}

export const TacticalMapCanvas: React.FC<TacticalMapCanvasProps> = ({
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
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Camera state in map space (0..1000 centered)
  const camRef = useRef({
    x: site.defaultCamera.x,
    y: site.defaultCamera.y,
    zoom: site.defaultCamera.zoom,
    targetX: site.defaultCamera.x,
    targetY: site.defaultCamera.y,
    targetZoom: site.defaultCamera.zoom,
  });

  const [zoomDisplay, setZoomDisplay] = useState(1);
  const [cursorInfo, setCursorInfo] = useState<{
    lat: string;
    lon: string;
    elevM: number;
    slopeDeg: number;
    tiu: number;
  } | null>(null);

  const terrainCacheRef = useRef<Record<string, HTMLCanvasElement>>({});
  const contoursCacheRef = useRef<Record<string, HTMLCanvasElement>>({});

  const draggingRef = useRef<{
    mode: 'pan' | 'waypoint' | null;
    waypointId?: string;
    startClientX: number;
    startClientY: number;
    startCamX: number;
    startCamY: number;
    moved: boolean;
  }>({
    mode: null,
    startClientX: 0,
    startClientY: 0,
    startCamX: 500,
    startCamY: 500,
    moved: false,
  });

  const layerMap = useMemo(() => {
    const map: Record<LayerId, LayerConfig> = {} as Record<LayerId, LayerConfig>;
    for (const l of layers) map[l.id] = l;
    return map;
  }, [layers]);

  // Smooth fly-in when site changes
  useEffect(() => {
    camRef.current.zoom = 0.65;
    camRef.current.x = 500;
    camRef.current.y = 500;
    camRef.current.targetX = site.defaultCamera.x;
    camRef.current.targetY = site.defaultCamera.y;
    camRef.current.targetZoom = site.defaultCamera.zoom;
    setZoomDisplay(site.defaultCamera.zoom);
  }, [site]);

  // Follow astronaut gently in Marswalk HUD
  useEffect(() => {
    if (marswalkMode && astronautPos) {
      camRef.current.targetX = astronautPos.x;
      camRef.current.targetY = astronautPos.y;
      if (camRef.current.targetZoom < 1.35) {
        camRef.current.targetZoom = 1.45;
        setZoomDisplay(1.45);
      }
    }
  }, [marswalkMode, astronautPos]);

  const screenToMap = (clientX: number, clientY: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 500, y: 500 };
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const minDim = Math.min(rect.width, rect.height);
    const scale = (minDim / 920) * camRef.current.zoom;
    const mx = (sx - rect.width / 2) / scale + camRef.current.x;
    const my = (sy - rect.height / 2) / scale + camRef.current.y;
    return {
      x: Math.max(20, Math.min(980, mx)),
      y: Math.max(20, Math.min(980, my)),
    };
  };

  // Main 60fps Canvas render loop
  useEffect(() => {
    let animId = 0;

    if (!terrainCacheRef.current[site.id]) {
      terrainCacheRef.current[site.id] = buildTerrainOffscreen(site);
    }
    if (!contoursCacheRef.current[site.id]) {
      contoursCacheRef.current[site.id] = buildContoursOffscreen(site);
    }

    const render = (timeMs: number) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) {
        animId = requestAnimationFrame(render);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
        canvas.width = Math.floor(cw * dpr);
        canvas.height = Math.floor(ch * dpr);
      }

      // Smooth camera interpolation
      const cam = camRef.current;
      cam.x += (cam.targetX - cam.x) * 0.14;
      cam.y += (cam.targetY - cam.y) * 0.14;
      cam.zoom += (cam.targetZoom - cam.zoom) * 0.14;

      const ctx = canvas.getContext('2d')!;
      ctx.save();
      ctx.scale(dpr, dpr);

      // Deep space base
      ctx.fillStyle = '#090D14';
      ctx.fillRect(0, 0, cw, ch);

      const minDim = Math.min(cw, ch);
      const scale = (minDim / 920) * cam.zoom;

      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.scale(scale, scale);
      ctx.translate(-cam.x, -cam.y);

      // 1. Optical Terrain & Hillshade
      const optLayer = layerMap.optical;
      if (optLayer?.enabled) {
        ctx.save();
        ctx.globalAlpha = optLayer.opacity / 100;
        ctx.drawImage(terrainCacheRef.current[site.id], 0, 0, 1000, 1000);
        ctx.restore();
      } else {
        ctx.fillStyle = '#121721';
        ctx.fillRect(0, 0, 1000, 1000);
      }

      // Subtle tactical coordinate grid (200m intervals)
      ctx.save();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.06)';
      ctx.lineWidth = 1 / scale;
      for (let g = 0; g <= 1000; g += 100) {
        ctx.beginPath();
        ctx.moveTo(g, 0);
        ctx.lineTo(g, 1000);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, g);
        ctx.lineTo(1000, g);
        ctx.stroke();
      }
      ctx.restore();

      // 2. THEMIS Thermal Inertia
      const themisLayer = layerMap.themis;
      if (themisLayer?.enabled) {
        ctx.save();
        ctx.globalAlpha = themisLayer.opacity / 100;
        for (const tp of site.thermalPatches) {
          ctx.save();
          ctx.translate(tp.x, tp.y);
          ctx.rotate((tp.rotationDeg * Math.PI) / 180);
          const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, Math.max(tp.rx, tp.ry));
          if (tp.classification === 'bedrock') {
            grad.addColorStop(0, 'rgba(56, 189, 248, 0.58)');
            grad.addColorStop(0.7, 'rgba(14, 165, 233, 0.25)');
            grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
          } else {
            grad.addColorStop(0, 'rgba(245, 158, 11, 0.52)');
            grad.addColorStop(0.7, 'rgba(217, 119, 6, 0.22)');
            grad.addColorStop(1, 'rgba(217, 119, 6, 0)');
          }
          ctx.scale(1, tp.ry / tp.rx);
          ctx.beginPath();
          ctx.arc(0, 0, tp.rx, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.restore();

          ctx.font = `600 ${Math.max(9, 10 / Math.sqrt(cam.zoom))}px "JetBrains Mono", monospace`;
          ctx.fillStyle = tp.classification === 'bedrock' ? '#7BD0FF' : '#FBBF24';
          ctx.textAlign = 'center';
          ctx.fillText(`TI ${tp.tiu} · ${tp.classification.toUpperCase()}`, tp.x, tp.y + 4);
        }
        ctx.restore();
      }

      // 3. CRISM Mineralogy Spectral Overlay
      const crismLayer = layerMap.crism;
      if (crismLayer?.enabled) {
        ctx.save();
        ctx.globalAlpha = crismLayer.opacity / 100;
        for (const m of site.minerals) {
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.rotate((m.rotationDeg * Math.PI) / 180);
          const [r, g, b] = hexToRgb(m.color);
          const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, m.rx);
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.52)`);
          grad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, 0.22)`);
          grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

          ctx.scale(1, m.ry / m.rx);
          ctx.beginPath();
          ctx.arc(0, 0, m.rx, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();

          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.65)`;
          ctx.lineWidth = 1.2 / scale;
          ctx.setLineDash([4 / scale, 3 / scale]);
          ctx.stroke();
          ctx.restore();

          ctx.font = `600 ${10}px "JetBrains Mono", monospace`;
          ctx.fillStyle = m.color;
          ctx.textAlign = 'center';
          ctx.fillText(m.mineralClass.toUpperCase(), m.x, m.y - m.ry * 0.45);
        }
        ctx.restore();
      }

      // 4. Elevation Contours (MOLA/HiRISE DTM)
      const contourLayer = layerMap.contours;
      if (contourLayer?.enabled) {
        ctx.save();
        ctx.globalAlpha = contourLayer.opacity / 100;
        ctx.drawImage(contoursCacheRef.current[site.id], 0, 0, 1000, 1000);
        ctx.restore();
      }

      // 5. Slope & Sand Hazard Overlay
      const hazLayer = layerMap.hazards;
      if (hazLayer?.enabled) {
        ctx.save();
        ctx.globalAlpha = hazLayer.opacity / 100;
        for (const h of site.hazards) {
          const isCritical = h.severity === 'critical';
          const fillCol = isCritical ? 'rgba(239, 68, 68, 0.28)' : 'rgba(245, 158, 11, 0.24)';
          const strokeCol = isCritical ? '#EF4444' : '#F59E0B';

          ctx.save();
          ctx.translate(h.x, h.y);
          ctx.rotate((h.rotationDeg * Math.PI) / 180);

          // Ellipse region
          ctx.beginPath();
          ctx.ellipse(0, 0, h.rx, h.ry, 0, 0, Math.PI * 2);
          ctx.fillStyle = fillCol;
          ctx.fill();

          // Diagonal aeolian sand-trap hatching clipped to ellipse
          ctx.save();
          ctx.clip();
          ctx.strokeStyle = isCritical ? 'rgba(239, 68, 68, 0.45)' : 'rgba(245, 158, 11, 0.4)';
          ctx.lineWidth = 1.1 / scale;
          const span = Math.max(h.rx, h.ry) * 2;
          for (let d = -span; d <= span; d += 12) {
            ctx.beginPath();
            ctx.moveTo(d, -h.ry - 10);
            ctx.lineTo(d - 32, h.ry + 10);
            ctx.stroke();
          }
          ctx.restore();

          ctx.strokeStyle = strokeCol;
          ctx.lineWidth = 1.6 / scale;
          ctx.setLineDash([5 / scale, 3 / scale]);
          ctx.stroke();
          ctx.restore();

          // Hazard label
          ctx.font = '700 9.5px "JetBrains Mono", monospace';
          ctx.fillStyle = isCritical ? '#FCA5A5' : '#FCD34D';
          ctx.textAlign = 'center';
          ctx.fillText(`⚠ ${h.name.toUpperCase()} (${h.maxSlopeDeg}°)`, h.x, h.y + h.ry + 14);
        }
        ctx.restore();
      }

      // 6. AI-Optimized Safe Bedrock Comparison Route
      if (showSafeComparison && site.safeBedrockWaypoints.length > 1) {
        ctx.save();
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 3 / scale;
        ctx.setLineDash([8 / scale, 6 / scale]);
        ctx.beginPath();
        site.safeBedrockWaypoints.forEach((wp, idx) => {
          if (idx === 0) ctx.moveTo(wp.x, wp.y);
          else ctx.lineTo(wp.x, wp.y);
        });
        ctx.stroke();

        // Highlight intermediate bedrock spur
        for (const wp of site.safeBedrockWaypoints) {
          if (wp.type === 'waypoint') {
            ctx.setLineDash([]);
            ctx.fillStyle = '#0B0E14';
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = 2 / scale;
            ctx.beginPath();
            ctx.arc(wp.x, wp.y, 7 / scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.font = `600 ${10 / Math.sqrt(cam.zoom)}px "JetBrains Mono", monospace`;
            ctx.fillStyle = '#4EDEA3';
            ctx.textAlign = 'left';
            ctx.fillText(`SAFE REROUTE: ${wp.name}`, wp.x + 11 / scale, wp.y + 3 / scale);
          }
        }
        ctx.restore();
      }

      // 7. Active Planned Route Segments
      const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.008);
      for (let i = 0; i < waypoints.length - 1; i++) {
        const from = waypoints[i];
        const to = waypoints[i + 1];
        const seg = routeAnalysis.segments[i];
        const sev = seg?.hazardSeverity || 'nominal';

        ctx.save();
        if (sev === 'critical') {
          // Wide breathing outer hazard halo
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.22 + pulse * 0.48})`;
          ctx.lineWidth = (12 + pulse * 7) / scale;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();

          // Animated marching hazard stripes along high-risk segment
          ctx.save();
          ctx.strokeStyle = `rgba(254, 202, 202, ${0.45 + pulse * 0.45})`;
          ctx.lineWidth = 5.2 / scale;
          ctx.setLineDash([9 / scale, 7 / scale]);
          ctx.lineDashOffset = -(timeMs * 0.03) / scale;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
          ctx.restore();

          // Core crimson vector
          ctx.strokeStyle = '#EF4444';
          ctx.lineWidth = 3.2 / scale;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();

          // Pulsing alert rings at segment endpoints
          [from, to].forEach((pt) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, (13 + pulse * 7) / scale, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(239, 68, 68, ${0.3 + pulse * 0.5})`;
            ctx.lineWidth = 1.6 / scale;
            ctx.stroke();
          });

          // Segment hazard midpoint callout
          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2;
          ctx.fillStyle = '#2A080C';
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.75 + pulse * 0.25})`;
          ctx.lineWidth = 1.4 / scale;
          const boxW = 136 / scale;
          const boxH = 20 / scale;
          ctx.fillRect(mx - boxW / 2, my - boxH / 2, boxW, boxH);
          ctx.strokeRect(mx - boxW / 2, my - boxH / 2, boxW, boxH);
          ctx.font = `700 ${9 / scale}px "JetBrains Mono", monospace`;
          ctx.fillStyle = '#FECACA';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`CRITICAL HAZARD ${seg.maxSlopeDeg}°`, mx, my);
        } else if (sev === 'caution') {
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2.8 / scale;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 2.8 / scale;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 8. Scientific POIs
      for (const poi of site.pois) {
        const isSelected = poi.id === selectedPoiId;
        ctx.save();
        ctx.translate(poi.x, poi.y);

        // Diamond marker for science POI
        const r = (isSelected ? 10 : 7.5) / scale;
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(0, r);
        ctx.lineTo(-r, 0);
        ctx.closePath();
        ctx.fillStyle = isSelected ? '#A855F7' : '#1A2230';
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#F0DBFF' : '#DDB7FF';
        ctx.lineWidth = (isSelected ? 2 : 1.5) / scale;
        ctx.stroke();

        ctx.font = `600 ${9.5 / scale}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#DDB7FF';
        ctx.textAlign = 'left';
        ctx.fillText(`◆ ${poi.name}`, 12 / scale, -6 / scale);
        ctx.restore();
      }

      // 9. User-Logged Field Observations
      for (const obs of observations) {
        ctx.save();
        ctx.translate(obs.x, obs.y);
        const r = 6 / scale;
        ctx.fillStyle = '#4EDEA3';
        ctx.strokeStyle = '#0B0E14';
        ctx.lineWidth = 1.5 / scale;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.strokeRect(-r, -r, r * 2, r * 2);

        ctx.font = `600 ${9.5 / scale}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#6FFBAE';
        ctx.textAlign = 'left';
        ctx.fillText(`■ ${obs.title}`, 10 / scale, 3 / scale);
        ctx.restore();
      }

      // 10. Curiosity-II Scout Rover
      const roverLayer = layerMap.rover;
      if (roverLayer?.enabled) {
        ctx.save();
        ctx.globalAlpha = roverLayer.opacity / 100;
        const rv = site.rover;
        ctx.translate(rv.x, rv.y);

        // Pulsing telemetry scan ring
        const radarRadius = ((timeMs % 2400) / 2400) * (34 / scale) + 8 / scale;
        const radarAlpha = Math.max(0, 1 - (timeMs % 2400) / 2400) * 0.65;
        ctx.beginPath();
        ctx.arc(0, 0, radarRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(16, 185, 129, ${radarAlpha})`;
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();

        // Heading cone
        const rad = ((rv.headingDeg - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 28 / scale, rad - 0.35, rad + 0.35);
        ctx.closePath();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
        ctx.fill();

        // Rover body marker
        ctx.beginPath();
        ctx.arc(0, 0, 8.5 / scale, 0, Math.PI * 2);
        ctx.fillStyle = selectedRover ? '#10B981' : '#0B0E14';
        ctx.fill();
        ctx.strokeStyle = '#4EDEA3';
        ctx.lineWidth = 2 / scale;
        ctx.stroke();

        ctx.font = `700 ${9.5 / scale}px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#4EDEA3';
        ctx.textAlign = 'left';
        ctx.fillText(`ROVER: ${rv.callsign}`, 13 / scale, 3 / scale);
        ctx.restore();
      }

      // 11. Planned Waypoints
      waypoints.forEach((wp, idx) => {
        ctx.save();
        ctx.translate(wp.x, wp.y);

        const isBase = idx === 0;
        const r = (isBase ? 10 : 8.5) / scale;

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = isBase ? '#10B981' : wp.type === 'waypoint' ? '#38BDF8' : '#0B0E14';
        ctx.fill();
        ctx.strokeStyle = isBase ? '#6FFBAE' : '#38BDF8';
        ctx.lineWidth = 2.2 / scale;
        ctx.stroke();

        // Waypoint index number
        ctx.font = `700 ${9.5 / scale}px "JetBrains Mono", monospace`;
        ctx.fillStyle = isBase ? '#0B0E14' : '#DEE2F1';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(idx + 1), 0, 0.5 / scale);

        // Label plate
        ctx.font = `600 ${10 / scale}px "IBM Plex Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(11, 14, 20, 0.86)';
        const labelText = wp.name;
        const tw = ctx.measureText(labelText).width + 10 / scale;
        ctx.fillRect(-tw / 2, r + 4 / scale, tw, 15 / scale);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = 0.8 / scale;
        ctx.strokeRect(-tw / 2, r + 4 / scale, tw, 15 / scale);
        ctx.fillStyle = '#E2E8F0';
        ctx.fillText(labelText, 0, r + 6.5 / scale);

        ctx.restore();
      });

      // 11. Terrain-Relative Navigation (TRN) Layer: Landmarks, Solar & Rover References, Vectors
      const trnLayerOn = (layerMap.trn?.enabled ?? true) || marswalkMode;
      if (trnLayerOn) {
        const trnAlpha = marswalkMode ? 1 : (layerMap.trn?.opacity ?? 90) / 100;
        ctx.save();
        ctx.globalAlpha = trnAlpha;

        // Visual Landmarks
        for (const lm of site.landmarks) {
          const isPrimary = trnGuidance?.primaryLandmark?.landmark.id === lm.id;
          ctx.save();
          ctx.translate(lm.x, lm.y);
          const r = (isPrimary ? 8.5 : 6) / scale;
          ctx.beginPath();
          ctx.moveTo(0, -r);
          ctx.lineTo(r * 0.95, r * 0.8);
          ctx.lineTo(-r * 0.95, r * 0.8);
          ctx.closePath();
          ctx.fillStyle = isPrimary ? '#FBBF24' : 'rgba(217, 119, 6, 0.85)';
          ctx.fill();
          ctx.strokeStyle = '#0B0E14';
          ctx.lineWidth = 1.4 / scale;
          ctx.stroke();

          ctx.font = `600 ${8.5 / scale}px "JetBrains Mono", monospace`;
          ctx.fillStyle = isPrimary ? '#FEF08A' : 'rgba(253, 230, 138, 0.85)';
          ctx.textAlign = 'center';
          ctx.fillText(lm.guidanceCue, 0, -r - 4 / scale);
          ctx.restore();
        }

        // TRN Vectors from Astronaut
        if (trnGuidance) {
          const ax = trnGuidance.currentPos.x;
          const ay = trnGuidance.currentPos.y;
          const confColor =
            trnGuidance.confidenceLevel === 'HIGH'
              ? 'rgba(78, 222, 163, 0.72)'
              : trnGuidance.confidenceLevel === 'MEDIUM'
              ? 'rgba(245, 158, 11, 0.82)'
              : 'rgba(239, 68, 68, 0.9)';

          // Uncertainty radius ring
          const uncMapR = Math.max(
            12,
            Math.min(85, trnGuidance.uncertaintyRadiusM / site.scaleMetersPerUnit)
          );
          ctx.beginPath();
          ctx.arc(ax, ay, uncMapR, 0, Math.PI * 2);
          ctx.strokeStyle = confColor;
          ctx.lineWidth = 1.6 / scale;
          ctx.setLineDash([4 / scale, 4 / scale]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Solar Azimuth Reference Ray
          const sunRad = (trnGuidance.solar.sunAzimuthDeg * Math.PI) / 180;
          const sunRayLen = 78 / scale;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax + Math.sin(sunRad) * sunRayLen, ay - Math.cos(sunRad) * sunRayLen);
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
          ctx.lineWidth = 1.8 / scale;
          ctx.stroke();

          // Rover Baseline
          if (trnGuidance.roverRef.active && layerMap.rover?.enabled) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(site.rover.x, site.rover.y);
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
            ctx.lineWidth = 1.6 / scale;
            ctx.setLineDash([6 / scale, 4 / scale]);
            ctx.stroke();
            ctx.restore();
          }

          // Target Vector
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(trnGuidance.destination.x, trnGuidance.destination.y);
          ctx.strokeStyle = trnGuidance.isOffCourse ? '#F59E0B' : '#38BDF8';
          ctx.lineWidth = 2.2 / scale;
          ctx.stroke();

          // Corrected Navigation Vector
          if (trnGuidance.correctedVector) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(trnGuidance.correctedVector.targetX, trnGuidance.correctedVector.targetY);
            ctx.strokeStyle = '#4EDEA3';
            ctx.lineWidth = 2.6 / scale;
            ctx.setLineDash([7 / scale, 4 / scale]);
            ctx.stroke();
            ctx.restore();
          }
        }
        ctx.restore();
      }

      // 12. Astronaut Live Position (Marswalk Mode or TRN Layer)
      if ((marswalkMode || layerMap.trn?.enabled) && astronautPos) {
        ctx.save();
        ctx.translate(astronautPos.x, astronautPos.y);

        // Visor FOV cone
        const rad = ((astronautPos.headingDeg - 90) * Math.PI) / 180;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 56 / scale, rad - 0.42, rad + 0.42);
        ctx.closePath();
        const fovGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 56 / scale);
        fovGrad.addColorStop(0, 'rgba(78, 222, 163, 0.42)');
        fovGrad.addColorStop(1, 'rgba(78, 222, 163, 0.0)');
        ctx.fillStyle = fovGrad;
        ctx.fill();

        // Outer ring
        ctx.beginPath();
        ctx.arc(0, 0, 14 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(111, 251, 190, 0.65)';
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();

        // Inner astronaut beacon
        ctx.beginPath();
        ctx.arc(0, 0, 7.5 / scale, 0, Math.PI * 2);
        ctx.fillStyle = '#6FFBAE';
        ctx.fill();
        ctx.strokeStyle = '#002113';
        ctx.lineWidth = 2 / scale;
        ctx.stroke();

        ctx.restore();
      }

      ctx.restore(); // end world transform
      ctx.restore(); // end dpr

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    site,
    layerMap,
    waypoints,
    routeAnalysis,
    showSafeComparison,
    observations,
    selectedPoiId,
    selectedRover,
    marswalkMode,
    astronautPos,
    trnGuidance,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mapPt = screenToMap(e.clientX, e.clientY);
    const scale = (Math.min(containerRef.current?.clientWidth || 800, containerRef.current?.clientHeight || 600) / 920) * camRef.current.zoom;
    const hitRadius = 18 / scale;

    if (mapTool === 'add-waypoint') {
      onAddWaypoint(mapPt.x, mapPt.y);
      return;
    }

    if (mapTool === 'log-observation') {
      onRequestLogAt(mapPt.x, mapPt.y);
      return;
    }

    // Hit test waypoints for dragging
    for (const wp of waypoints) {
      const dist = Math.hypot(wp.x - mapPt.x, wp.y - mapPt.y);
      if (dist <= hitRadius) {
        draggingRef.current = {
          mode: 'waypoint',
          waypointId: wp.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startCamX: camRef.current.targetX,
          startCamY: camRef.current.targetY,
          moved: false,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
    }

    // Start pan
    draggingRef.current = {
      mode: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCamX: camRef.current.targetX,
      startCamY: camRef.current.targetY,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const mapPt = screenToMap(e.clientX, e.clientY);
    const ll = mapToLatLon(site, mapPt.x, mapPt.y);
    const sample = sampleTerrainAt(site, mapPt.x, mapPt.y);
    setCursorInfo({
      lat: ll.lat,
      lon: ll.lon,
      elevM: sample.elevationM,
      slopeDeg: sample.slopeDeg,
      tiu: sample.thermalInertia,
    });

    const drag = draggingRef.current;
    if (!drag.mode) return;

    const dxPx = e.clientX - drag.startClientX;
    const dyPx = e.clientY - drag.startClientY;
    if (Math.hypot(dxPx, dyPx) > 3) drag.moved = true;

    if (drag.mode === 'waypoint' && drag.waypointId) {
      onUpdateWaypoint(drag.waypointId, mapPt.x, mapPt.y);
    } else if (drag.mode === 'pan') {
      const container = containerRef.current;
      const minDim = Math.min(container?.clientWidth || 800, container?.clientHeight || 600);
      const scale = (minDim / 920) * camRef.current.zoom;
      camRef.current.targetX = Math.max(80, Math.min(920, drag.startCamX - dxPx / scale));
      camRef.current.targetY = Math.max(80, Math.min(920, drag.startCamY - dyPx / scale));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = draggingRef.current;
    const wasClick = !drag.moved && drag.mode === 'pan';
    draggingRef.current.mode = null;

    if (wasClick && mapTool === 'select') {
      const mapPt = screenToMap(e.clientX, e.clientY);
      const scale =
        (Math.min(containerRef.current?.clientWidth || 800, containerRef.current?.clientHeight || 600) /
          920) *
        camRef.current.zoom;
      const hitRadius = 20 / scale;

      // Check Rover click
      if (layerMap.rover?.enabled) {
        if (Math.hypot(site.rover.x - mapPt.x, site.rover.y - mapPt.y) <= hitRadius) {
          onSelectRover();
          return;
        }
      }

      // Check POI click
      for (const poi of site.pois) {
        if (Math.hypot(poi.x - mapPt.x, poi.y - mapPt.y) <= hitRadius) {
          onSelectPoi(poi);
          return;
        }
      }

      // Check Observation click
      for (const obs of observations) {
        if (Math.hypot(obs.x - mapPt.x, obs.y - mapPt.y) <= hitRadius) {
          onSelectObservation(obs);
          return;
        }
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.14 : 0.88;
    const nextZoom = Math.max(0.65, Math.min(4.2, Number((camRef.current.targetZoom * factor).toFixed(2))));
    camRef.current.targetZoom = nextZoom;
    setZoomDisplay(nextZoom);
  };

  const adjustZoom = (delta: number) => {
    const nextZoom = Math.max(0.65, Math.min(4.2, Number((camRef.current.targetZoom + delta).toFixed(2))));
    camRef.current.targetZoom = nextZoom;
    setZoomDisplay(nextZoom);
  };

  const resetCamera = () => {
    camRef.current.targetX = site.defaultCamera.x;
    camRef.current.targetY = site.defaultCamera.y;
    camRef.current.targetZoom = site.defaultCamera.zoom;
    setZoomDisplay(site.defaultCamera.zoom);
  };

  // Scale bar calculation: 500m in screen pixels
  const minContainerDim = Math.min(containerRef.current?.clientWidth || 720, containerRef.current?.clientHeight || 520);
  const currentScale = (minContainerDim / 920) * zoomDisplay;
  const unitsFor500m = 500 / site.scaleMetersPerUnit;
  const scaleBarPx = Math.max(48, Math.min(180, Math.round(unitsFor500m * currentScale)));

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full overflow-hidden bg-[#090D14] border border-[#1E293B] rounded select-none"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        className={`w-full h-full block ${
          mapTool === 'select' ? 'cursor-crosshair' : 'cursor-cell'
        }`}
      />

      {/* Pulsating Critical Hazard Perimeter Overlay */}
      {routeAnalysis.safetyStatus === 'CRITICAL HAZARD' && (
        <div className="pointer-events-none absolute inset-0 border-2 border-[#EF4444]/65 rounded animate-pulse" />
      )}

      {/* Top-Left Live Coordinate & Surface Telemetry HUD (Planning Mode only) */}
      {!marswalkMode && (
        <div className="pointer-events-none absolute top-2.5 left-2.5 hidden sm:flex flex-col gap-1.5 max-w-[330px]">
          <div className="bg-[#0B0E14]/90 border border-[#232B3A] rounded px-2.5 py-1.5 backdrop-blur-xs">
            <div className="flex items-center gap-3 text-[11px] font-mono-tabular">
              <span className="text-[#86948A] uppercase tracking-wider">MARS CRS</span>
              <span className="text-[#DEE2F1] font-medium">
                {cursorInfo ? `${cursorInfo.lat} · ${cursorInfo.lon}` : `${Math.abs(site.baseLat).toFixed(4)}° · ${site.baseLon.toFixed(4)}° E`}
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

          {/* Visual Critical Hazard / Caution Warning Overlay */}
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
            <div className="px-2.5 py-1 rounded border text-[11px] font-mono-tabular flex items-center gap-1.5 bg-[#281C0B]/90 border-[#F59E0B]/80 text-[#FCD34D]">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>
                CAUTION: {routeAnalysis.detectedHazards[0]?.name || 'Moderate Slope'} ({routeAnalysis.maxSlopeDeg}°)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Top-Right Tactical Map Tools & Zoom Controls */}
      {!marswalkMode && (
        <div className="absolute top-2.5 right-2.5 left-2.5 sm:left-auto flex flex-wrap items-center justify-end gap-1.5">
          <div className="flex items-center bg-[#0B0E14]/90 border border-[#232B3A] rounded p-0.5">
            <button
              type="button"
              onClick={() => onChangeMapTool('select')}
              title="Pan map or drag waypoints"
              className={`px-2.5 py-1 text-[11px] font-medium rounded-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                mapTool === 'select'
                  ? 'bg-[#1A2230] text-[#7BD0FF] border border-[#38BDF8]/50'
                  : 'text-[#BBCABF] hover:text-white border border-transparent'
              }`}
            >
              <MousePointer className="w-3 h-3" />
              <span>Pan / Drag</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeMapTool('add-waypoint')}
              title="Click map to append waypoint"
              className={`px-2.5 py-1 text-[11px] font-medium rounded-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                mapTool === 'add-waypoint'
                  ? 'bg-[#1A2230] text-[#4EDEA3] border border-[#10B981]/60'
                  : 'text-[#BBCABF] hover:text-white border border-transparent'
              }`}
            >
              <MapPinPlus className="w-3 h-3" />
              <span>+ Waypoint</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeMapTool('log-observation')}
              title="Click map to log field sample or observation"
              className={`px-2.5 py-1 text-[11px] font-medium rounded-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                mapTool === 'log-observation'
                  ? 'bg-[#1A2230] text-[#DDB7FF] border border-[#A855F7]/60'
                  : 'text-[#BBCABF] hover:text-white border border-transparent'
              }`}
            >
              <Crosshair className="w-3 h-3" />
              <span>+ Log Sample</span>
            </button>
          </div>

          <div className="flex items-center bg-[#0B0E14]/90 border border-[#232B3A] rounded p-0.5">
            <button
              type="button"
              onClick={() => adjustZoom(0.35)}
              aria-label="Zoom in"
              className="p-1.5 text-[#BBCABF] hover:text-white hover:bg-[#1A2230] rounded-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] font-mono-tabular text-[#DEE2F1] min-w-[42px] text-center">
              {zoomDisplay.toFixed(1)}x
            </span>
            <button
              type="button"
              onClick={() => adjustZoom(-0.35)}
              aria-label="Zoom out"
              className="p-1.5 text-[#BBCABF] hover:text-white hover:bg-[#1A2230] rounded-xs transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={resetCamera}
              aria-label="Reset camera"
              title="Reset view"
              className="p-1.5 text-[#BBCABF] hover:text-[#7BD0FF] hover:bg-[#1A2230] rounded-xs transition-colors border-l border-[#232B3A] ml-0.5"
            >
              <LocateFixed className="w-3.5 h-3.5" />
            </button>
            {viewModeToggle}
          </div>
        </div>
      )}

      {/* Active tool prompt banner */}
      {mapTool !== 'select' && !marswalkMode && (
        <div className="pointer-events-none absolute top-14 right-2.5 bg-[#0B0E14]/95 border border-[#38BDF8]/60 rounded px-3 py-1.5 text-[11px] font-mono-tabular text-[#7BD0FF]">
          {mapTool === 'add-waypoint'
            ? 'CLICK ANYWHERE ON TERRAIN TO APPEND WAYPOINT'
            : 'CLICK ANYWHERE ON TERRAIN TO DROP SAMPLE MARKER'}
        </div>
      )}

      {/* Bottom-Left Alternating Scale Bar & Symbology (Planning Mode only) */}
      {!marswalkMode && (
        <>
          <div className="pointer-events-none absolute bottom-2.5 left-2.5 hidden sm:block bg-[#0B0E14]/85 border border-[#232B3A] rounded px-2.5 py-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono-tabular text-[#DEE2F1] mb-1">
              <span>0</span>
              <span>250 m</span>
              <span>500 m</span>
            </div>
            <div className="flex h-1.5 border border-[#86948A]" style={{ width: `${scaleBarPx}px` }}>
              <div className="w-1/4 bg-white" />
              <div className="w-1/4 bg-[#0B0E14]" />
              <div className="w-1/4 bg-white" />
              <div className="w-1/4 bg-[#0B0E14]" />
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-2.5 right-2.5 bg-[#0B0E14]/85 border border-[#232B3A] rounded px-2.5 py-1.5 hidden md:flex items-center gap-3 text-[10px] font-mono-tabular text-[#BBCABF]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-0.5 bg-[#38BDF8]" /> NOMINAL LEG
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-0.5 bg-[#EF4444]" /> HAZARD &gt;22°
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rotate-45 bg-[#DDB7FF]" /> SCIENCE POI
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
