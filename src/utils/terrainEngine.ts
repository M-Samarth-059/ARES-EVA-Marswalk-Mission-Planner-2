import {
  HazardZone,
  ProfileSample,
  RouteAnalysis,
  RouteSegmentAnalysis,
  SiteDataset,
  TerrainSample,
  Waypoint,
} from '../types/mission';

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function pointInRotatedEllipse(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotationDeg: number
): number {
  const rad = degToRad(-rotationDeg);
  const dx = px - cx;
  const dy = py - cy;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const tx = dx * cos - dy * sin;
  const ty = dx * sin + dy * cos;
  return (tx * tx) / (rx * rx) + (ty * ty) / (ry * ry);
}

/**
 * Deterministic elevation field per site (in meters), combining realistic
 * regional gradient (rising towards Mount Sharp / Delta / Canyon Terrace),
 * multi-frequency topographic ridges, and crater depressions.
 */
export function getRawElevationM(site: SiteDataset, x: number, y: number): number {
  const nx = x / 1000;
  const ny = y / 1000;
  const elevSpan = site.maxElevM - site.minElevM;

  // Regional climb from SW (bottom-left) to NE (top-right)
  const regionalClimb = (nx * 0.52 + (1 - ny) * 0.48);

  // Site-specific seed offset
  const seed = site.id === 'gale' ? 1.0 : site.id === 'jezero' ? 2.4 : 4.1;

  // Multi-octave topographic ridges & strata benches
  const ridge1 = Math.sin(nx * 7.5 + ny * 4.2 + seed) * 0.08;
  const ridge2 = Math.cos(nx * 14.0 - ny * 11.0 + seed * 1.7) * 0.035;
  const strata = Math.sin((nx * 0.4 + (1 - ny) * 0.85) * 26.0 + seed) * 0.018;

  // Subtle impact crater bowl on NW quadrant
  const crDx = nx - 0.28;
  const crDy = ny - 0.30;
  const crDist = Math.sqrt(crDx * crDx + crDy * crDy);
  const craterBowl = crDist < 0.14 ? -0.11 * Math.cos((crDist / 0.14) * (Math.PI / 2)) : 0;
  const craterRim = Math.exp(-Math.pow((crDist - 0.145) / 0.025, 2)) * 0.045;

  const normalized = Math.max(
    0,
    Math.min(1, regionalClimb + ridge1 + ridge2 + strata + craterBowl + craterRim)
  );
  return Math.round(site.minElevM + normalized * elevSpan);
}

export function sampleTerrainAt(site: SiteDataset, x: number, y: number): TerrainSample {
  const clampedX = Math.max(0, Math.min(1000, x));
  const clampedY = Math.max(0, Math.min(1000, y));

  const elevationM = getRawElevationM(site, clampedX, clampedY);

  // Numerical gradient for natural slope
  const step = 6;
  const ex1 = getRawElevationM(site, Math.min(1000, clampedX + step), clampedY);
  const ex0 = getRawElevationM(site, Math.max(0, clampedX - step), clampedY);
  const ey1 = getRawElevationM(site, clampedX, Math.min(1000, clampedY + step));
  const ey0 = getRawElevationM(site, clampedX, Math.max(0, clampedY - step));

  const metersStep = step * 2 * site.scaleMetersPerUnit;
  const dzdx = (ex1 - ex0) / metersStep;
  const dzdy = (ey1 - ey0) / metersStep;
  const baseSlopeDeg = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * (180 / Math.PI);

  // Check hazard intersections
  let matchedHazard: HazardZone | null = null;
  let hazardSlopeBoost = 0;
  for (const h of site.hazards) {
    const normDist = pointInRotatedEllipse(clampedX, clampedY, h.x, h.y, h.rx, h.ry, h.rotationDeg);
    if (normDist <= 1.0) {
      const weight = 1 - Math.sqrt(normDist) * 0.35;
      const effectiveSlope = h.maxSlopeDeg * weight;
      if (effectiveSlope > hazardSlopeBoost) {
        hazardSlopeBoost = effectiveSlope;
      }
      if (!matchedHazard || h.severity === 'critical') {
        matchedHazard = h;
      }
    }
  }

  const slopeDeg = Number(Math.max(baseSlopeDeg, hazardSlopeBoost).toFixed(1));

  // Thermal inertia (TIU): bedrock high (~480-610), loose dust low (~130-190), default regolith (~310)
  let thermalInertia = 315 + Math.sin(clampedX * 0.02 + clampedY * 0.015) * 35;
  for (const tp of site.thermalPatches) {
    const d = pointInRotatedEllipse(clampedX, clampedY, tp.x, tp.y, tp.rx, tp.ry, tp.rotationDeg);
    if (d <= 1.0) {
      const blend = 1 - d;
      thermalInertia = thermalInertia * (1 - blend) + tp.tiu * blend;
    }
  }
  if (matchedHazard?.surfaceType.toLowerCase().includes('sand')) {
    thermalInertia = Math.min(thermalInertia, 155);
  }

  // Mineral lookup
  let mineralName: string | null = null;
  for (const m of site.minerals) {
    const d = pointInRotatedEllipse(clampedX, clampedY, m.x, m.y, m.rx, m.ry, m.rotationDeg);
    if (d <= 1.0) {
      mineralName = `${m.mineralClass} (${m.datasetId})`;
      break;
    }
  }

  return {
    elevationM,
    slopeDeg,
    thermalInertia: Math.round(thermalInertia),
    mineralName,
    hazard: matchedHazard,
  };
}

export function mapToLatLon(site: SiteDataset, x: number, y: number): { lat: string; lon: string } {
  // 1 degree on Mars ~ 59,274 m
  const metersPerDeg = 59274;
  const dxMeters = (x - 500) * site.scaleMetersPerUnit;
  const dyMeters = (500 - y) * site.scaleMetersPerUnit;

  const latVal = site.baseLat + dyMeters / metersPerDeg;
  const lonVal = site.baseLon + dxMeters / (metersPerDeg * Math.cos(degToRad(site.baseLat)));

  const latDir = latVal >= 0 ? 'N' : 'S';
  return {
    lat: `${Math.abs(latVal).toFixed(4)}° ${latDir}`,
    lon: `${lonVal.toFixed(4)}° E`,
  };
}

export function computeRouteAnalysis(site: SiteDataset, waypoints: Waypoint[]): RouteAnalysis {
  if (waypoints.length < 2) {
    const singleSample =
      waypoints.length === 1 ? sampleTerrainAt(site, waypoints[0].x, waypoints[0].y) : null;
    return {
      totalDistanceKm: 0,
      totalElevGainM: 0,
      totalElevLossM: 0,
      totalTimeMin: 0,
      maxSlopeDeg: singleSample?.slopeDeg ?? 0,
      totalO2Liters: 0,
      totalPowerWh: 0,
      o2ConsumptionPct: 0,
      batteryConsumptionPct: 0,
      safetyStatus: 'NOMINAL',
      segments: [],
      profile:
        waypoints.length === 1 && singleSample
          ? [
              {
                distKm: 0,
                elevationM: singleSample.elevationM,
                slopeDeg: singleSample.slopeDeg,
                thermalInertia: singleSample.thermalInertia,
                x: waypoints[0].x,
                y: waypoints[0].y,
                hazardSeverity: 'nominal',
                waypointName: waypoints[0].name,
              },
            ]
          : [],
      detectedHazards: [],
    };
  }

  const segments: RouteSegmentAnalysis[] = [];
  const profile: ProfileSample[] = [];
  const detectedHazardsMap = new Map<string, HazardZone>();

  let cumulativeDistKm = 0;
  let totalElevGainM = 0;
  let totalElevLossM = 0;
  let totalTimeMin = 0;
  let totalO2Liters = 0;
  let totalPowerWh = 0;
  let globalMaxSlope = 0;

  // Nominal xEMU PLSS capacities for percentage scaling
  const PLSS_O2_CAPACITY_LITERS = 420;
  const SUIT_BATTERY_CAPACITY_WH = 1100;
  const SAMPLES_PER_SEGMENT = 28;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];

    const dxUnits = to.x - from.x;
    const dyUnits = to.y - from.y;
    const planarMeters = Math.sqrt(dxUnits * dxUnits + dyUnits * dyUnits) * site.scaleMetersPerUnit;
    const segDistKm = planarMeters / 1000;

    let segMaxSlope = 0;
    let segSlopeSum = 0;
    let segElevGain = 0;
    let segElevLoss = 0;
    let segMinTI = 999;
    const segHazards = new Map<string, HazardZone>();

    let prevElev: number | null = null;

    for (let s = 0; s <= SAMPLES_PER_SEGMENT; s++) {
      const t = s / SAMPLES_PER_SEGMENT;
      const sx = from.x + dxUnits * t;
      const sy = from.y + dyUnits * t;
      const sample = sampleTerrainAt(site, sx, sy);

      if (prevElev !== null) {
        const dElev = sample.elevationM - prevElev;
        if (dElev > 0) segElevGain += dElev;
        else segElevLoss += Math.abs(dElev);
      }
      prevElev = sample.elevationM;

      segMaxSlope = Math.max(segMaxSlope, sample.slopeDeg);
      segSlopeSum += sample.slopeDeg;
      segMinTI = Math.min(segMinTI, sample.thermalInertia);

      if (sample.hazard) {
        segHazards.set(sample.hazard.id, sample.hazard);
        detectedHazardsMap.set(sample.hazard.id, sample.hazard);
      }

      const pointSeverity: 'nominal' | 'caution' | 'critical' =
        sample.hazard?.severity === 'critical' || sample.slopeDeg >= 22
          ? 'critical'
          : sample.hazard?.severity === 'caution' || sample.slopeDeg >= 15
          ? 'caution'
          : 'nominal';

      // Avoid duplicating exact junction points except first point
      if (i === 0 || s > 0) {
        profile.push({
          distKm: Number((cumulativeDistKm + segDistKm * t).toFixed(3)),
          elevationM: sample.elevationM,
          slopeDeg: sample.slopeDeg,
          thermalInertia: sample.thermalInertia,
          x: sx,
          y: sy,
          hazardSeverity: pointSeverity,
          waypointName: s === 0 ? from.name : s === SAMPLES_PER_SEGMENT ? to.name : undefined,
        });
      }
    }

    const avgSlopeDeg = Number((segSlopeSum / (SAMPLES_PER_SEGMENT + 1)).toFixed(1));
    const hasCritical =
      Array.from(segHazards.values()).some((h) => h.severity === 'critical') || segMaxSlope >= 22;
    const hasCaution =
      !hasCritical &&
      (Array.from(segHazards.values()).some((h) => h.severity === 'caution') || segMaxSlope >= 15);

    const hazardSeverity: 'nominal' | 'caution' | 'critical' = hasCritical
      ? 'critical'
      : hasCaution
      ? 'caution'
      : 'nominal';

    // Martian EVA walking pace: base ~3.0 km/h (50 m/min) with slope & sand drag penalties
    const slopePenaltyFactor = 1 + Math.pow(avgSlopeDeg / 14, 1.45) * 0.42;
    const sandPenalty = segMinTI < 200 ? 1.32 : 1.0;
    const rockyPenalty = Array.from(segHazards.values()).some((h) =>
      /boulder|scree|mudstone|cliff|fractured/i.test(h.surfaceType)
    )
      ? 1.18
      : 1.0;
    const terrainDifficultyFactor = Number(
      (slopePenaltyFactor * sandPenalty * rockyPenalty).toFixed(2)
    );
    const estMinutes = Math.round((segDistKm / 3.0) * 60 * terrainDifficultyFactor);

    // Per-segment O2 (liters) & Suit Power (Wh) grounded in route length + terrain difficulty + climb
    const baseO2LitersPerMin = 0.85;
    const climbEffortMultiplier = 1 + (segElevGain / Math.max(80, planarMeters)) * 0.65;
    const segO2Liters = Number(
      (estMinutes * baseO2LitersPerMin * (0.85 + 0.32 * terrainDifficultyFactor) * climbEffortMultiplier).toFixed(1)
    );
    const segO2Pct = Number(((segO2Liters / PLSS_O2_CAPACITY_LITERS) * 100).toFixed(1));

    const baseSuitPowerW = 148; // Life support + thermal loop + avionics + visor HUD
    const terrainPowerFactor = 0.9 + 0.28 * terrainDifficultyFactor + segElevGain * 0.004;
    const segPowerWh = Number(((estMinutes / 60) * baseSuitPowerW * terrainPowerFactor).toFixed(1));
    const segPowerPct = Number(((segPowerWh / SUIT_BATTERY_CAPACITY_WH) * 100).toFixed(1));

    segments.push({
      index: i,
      fromId: from.id,
      toId: to.id,
      fromName: from.name,
      toName: to.name,
      distanceKm: Number(segDistKm.toFixed(2)),
      maxSlopeDeg: Number(segMaxSlope.toFixed(1)),
      avgSlopeDeg,
      elevGainM: Math.round(segElevGain),
      elevLossM: Math.round(segElevLoss),
      estMinutes,
      terrainDifficultyFactor,
      o2Liters: segO2Liters,
      o2Pct: segO2Pct,
      powerWh: segPowerWh,
      powerPct: segPowerPct,
      isHazard: hazardSeverity !== 'nominal',
      hazardSeverity,
      intersectedHazards: Array.from(segHazards.values()),
      minThermalInertia: Math.round(segMinTI),
    });

    cumulativeDistKm += segDistKm;
    totalElevGainM += segElevGain;
    totalElevLossM += segElevLoss;
    totalTimeMin += estMinutes;
    totalO2Liters += segO2Liters;
    totalPowerWh += segPowerWh;
    globalMaxSlope = Math.max(globalMaxSlope, segMaxSlope);
  }

  const anyCritical = segments.some((s) => s.hazardSeverity === 'critical');
  const anyCaution = segments.some((s) => s.hazardSeverity === 'caution');
  const safetyStatus: RouteAnalysis['safetyStatus'] = anyCritical
    ? 'CRITICAL HAZARD'
    : anyCaution
    ? 'CAUTION'
    : 'NOMINAL';

  const o2ConsumptionPct = Math.min(
    99,
    Number(((totalO2Liters / PLSS_O2_CAPACITY_LITERS) * 100).toFixed(1))
  );
  const batteryConsumptionPct = Math.min(
    99,
    Number(((totalPowerWh / SUIT_BATTERY_CAPACITY_WH) * 100).toFixed(1))
  );

  return {
    totalDistanceKm: Number(cumulativeDistKm.toFixed(2)),
    totalElevGainM: Math.round(totalElevGainM),
    totalElevLossM: Math.round(totalElevLossM),
    totalTimeMin,
    maxSlopeDeg: Number(globalMaxSlope.toFixed(1)),
    totalO2Liters: Number(totalO2Liters.toFixed(1)),
    totalPowerWh: Number(totalPowerWh.toFixed(1)),
    o2ConsumptionPct,
    batteryConsumptionPct,
    safetyStatus,
    segments,
    profile,
    detectedHazards: Array.from(detectedHazardsMap.values()),
  };
}

export function interpolatePositionAlongRoute(
  site: SiteDataset,
  waypoints: Waypoint[],
  progress01: number
): {
  x: number;
  y: number;
  headingDeg: number;
  nextWaypoint: Waypoint | null;
  distanceToNextM: number;
  terrain: TerrainSample;
} {
  if (waypoints.length === 0) {
    return {
      x: 500,
      y: 500,
      headingDeg: 0,
      nextWaypoint: null,
      distanceToNextM: 0,
      terrain: sampleTerrainAt(site, 500, 500),
    };
  }
  if (waypoints.length === 1) {
    return {
      x: waypoints[0].x,
      y: waypoints[0].y,
      headingDeg: 0,
      nextWaypoint: waypoints[0],
      distanceToNextM: 0,
      terrain: sampleTerrainAt(site, waypoints[0].x, waypoints[0].y),
    };
  }

  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const dx = waypoints[i + 1].x - waypoints[i].x;
    const dy = waypoints[i + 1].y - waypoints[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalLen += len;
  }

  const targetDist = Math.max(0, Math.min(1, progress01)) * totalLen;
  let acc = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const len = segLengths[i];
    if (acc + len >= targetDist || i === segLengths.length - 1) {
      const localT = len > 0 ? (targetDist - acc) / len : 0;
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const x = from.x + (to.x - from.x) * localT;
      const y = from.y + (to.y - from.y) * localT;

      // Heading in compass degrees (0 = North = -y, 90 = East = +x)
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      let headingDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (headingDeg < 0) headingDeg += 360;

      const remUnits = Math.sqrt(Math.pow(to.x - x, 2) + Math.pow(to.y - y, 2));
      const distanceToNextM = Math.round(remUnits * site.scaleMetersPerUnit);

      return {
        x,
        y,
        headingDeg: Math.round(headingDeg),
        nextWaypoint: to,
        distanceToNextM,
        terrain: sampleTerrainAt(site, x, y),
      };
    }
    acc += len;
  }

  const last = waypoints[waypoints.length - 1];
  return {
    x: last.x,
    y: last.y,
    headingDeg: 0,
    nextWaypoint: last,
    distanceToNextM: 0,
    terrain: sampleTerrainAt(site, last.x, last.y),
  };
}
