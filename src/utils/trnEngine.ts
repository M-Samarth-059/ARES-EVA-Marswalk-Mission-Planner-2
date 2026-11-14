import {
  HazardZone,
  NavConfidenceLevel,
  NearbyLandmarkInfo,
  SensorChannelStatus,
  SiteDataset,
  TrnGuidanceState,
  TrnScenarioId,
  Waypoint,
} from '../types/mission';
import {
  getRawElevationM,
  mapToLatLon,
  sampleTerrainAt,
} from './terrainEngine';

function normalizeAngle360(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

export function shortestSignedAngle(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

export function bearingBetweenMapPoints(
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  return normalizeAngle360((Math.atan2(dx, -dy) * 180) / Math.PI);
}

export function formatClockDirection(relativeAngleDeg: number): string {
  const abs = Math.abs(relativeAngleDeg);
  if (abs <= 15) return 'Ahead';
  if (abs >= 165) return 'Behind';
  const hourFloat = normalizeAngle360(relativeAngleDeg) / 30;
  let hour = Math.round(hourFloat);
  if (hour === 0 || hour === 12) hour = 12;
  return `${hour} o'clock`;
}

export function computeMarsSolarPosition(
  site: SiteDataset,
  marsHour: number
): { localSolarTimeStr: string; sunAzimuthDeg: number; sunElevationDeg: number } {
  const clampedHour = ((marsHour % 24) + 24) % 24;
  const hh = Math.floor(clampedHour);
  const mm = Math.floor((clampedHour - hh) * 60);
  const localSolarTimeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} LMST`;

  // Martian solar declination Ls approximated from site sol
  const lsRad = (((site.sol * 0.524) % 360) * Math.PI) / 180;
  const declinationRad = (25.19 * Math.PI) / 180 * Math.sin(lsRad);
  const latRad = (site.baseLat * Math.PI) / 180;
  const hourAngleRad = ((clampedHour - 12) * 15 * Math.PI) / 180;

  const sinAlt =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
  const altRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const sunElevationDeg = Number(((altRad * 180) / Math.PI).toFixed(1));

  const cosAlt = Math.max(0.001, Math.cos(altRad));
  const cosAz =
    (Math.sin(declinationRad) - Math.sin(latRad) * sinAlt) /
    (Math.cos(latRad) * cosAlt);
  let azDeg = (Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180) / Math.PI;
  if (hourAngleRad > 0) {
    azDeg = 360 - azDeg;
  }

  return {
    localSolarTimeStr,
    sunAzimuthDeg: Math.round(normalizeAngle360(azDeg)),
    sunElevationDeg,
  };
}

export interface TrnSimulationConfig {
  scenario: TrnScenarioId;
  lateralOffsetUnits: number; // perpendicular offset from planned route (+right, -left)
  headingBiasDeg: number; // simulated astronaut facing offset relative to route heading
  marsSolarHour: number; // 0..24 LMST
  useRoverReference: boolean;
  visualDegraded: boolean;
  relocalizeBoost: number; // 0..30 temporary fix bonus after Re-Localize
}

export function getScenarioPreset(scenario: TrnScenarioId): {
  progress: number;
  lateralOffsetUnits: number;
  headingBiasDeg: number;
  useRoverReference: boolean;
  visualDegraded: boolean;
  marsSolarHour: number;
  summary: string;
} {
  switch (scenario) {
    case 'nominal':
      return {
        progress: 0.24,
        lateralOffsetUnits: 0,
        headingBiasDeg: 0,
        useRoverReference: true,
        visualDegraded: false,
        marsSolarHour: 14.35,
        summary: 'Nominal traverse aligned with bedrock corridor & visual landmarks.',
      };
    case 'off-course':
      return {
        progress: 0.42,
        lateralOffsetUnits: 34,
        headingBiasDeg: -22,
        useRoverReference: true,
        visualDegraded: false,
        marsSolarHour: 14.35,
        summary: 'Simulated drift south of route triggering off-course vector correction.',
      };
    case 'obstacle':
      return {
        progress: 0.72,
        lateralOffsetUnits: 0,
        headingBiasDeg: 4,
        useRoverReference: true,
        visualDegraded: false,
        marsSolarHour: 14.35,
        summary: 'Approaching steep slope / sand trap hazard requiring left bypass.',
      };
    case 'visual-loss':
      return {
        progress: 0.56,
        lateralOffsetUnits: 14,
        headingBiasDeg: 11,
        useRoverReference: false,
        visualDegraded: true,
        marsSolarHour: 17.85,
        summary: 'Dust squall occludes landmarks & low Sun reduces confidence to LOW.',
      };
    case 'target-approach':
      return {
        progress: 0.62,
        lateralOffsetUnits: 0,
        headingBiasDeg: 2,
        useRoverReference: true,
        visualDegraded: false,
        marsSolarHour: 13.8,
        summary: 'Final approach to Science POI behind foreground rock outcrop.',
      };
    case 'rover-ref':
      return {
        progress: 0.52,
        lateralOffsetUnits: 10,
        headingBiasDeg: -8,
        useRoverReference: true,
        visualDegraded: false,
        marsSolarHour: 14.35,
        summary: 'Curiosity-II Scout Rover locked as primary optical/UHF triangulation anchor.',
      };
  }
}

export interface TrnDestinationOption {
  id: string;
  name: string;
  kind: 'waypoint' | 'poi' | 'rover';
  x: number;
  y: number;
}

export function getDestinationOptions(
  site: SiteDataset,
  waypoints: Waypoint[],
  nextWaypoint: Waypoint | null
): TrnDestinationOption[] {
  const options: TrnDestinationOption[] = [];
  if (nextWaypoint) {
    options.push({
      id: `wp:${nextWaypoint.id}`,
      name: `Next: ${nextWaypoint.name}`,
      kind: 'waypoint',
      x: nextWaypoint.x,
      y: nextWaypoint.y,
    });
  }
  const finalWp = waypoints[waypoints.length - 1];
  if (finalWp && (!nextWaypoint || finalWp.id !== nextWaypoint.id)) {
    options.push({
      id: `wp:${finalWp.id}`,
      name: `Final: ${finalWp.name}`,
      kind: 'waypoint',
      x: finalWp.x,
      y: finalWp.y,
    });
  }
  for (const poi of site.pois) {
    options.push({
      id: `poi:${poi.id}`,
      name: poi.name,
      kind: 'poi',
      x: poi.x,
      y: poi.y,
    });
  }
  options.push({
    id: `rover:${site.rover.id}`,
    name: `${site.rover.name} (${site.rover.callsign})`,
    kind: 'rover',
    x: site.rover.x,
    y: site.rover.y,
  });
  return options;
}

export function computeAstronautWorldPose(
  waypoints: Waypoint[],
  baseRoutePos: { x: number; y: number; headingDeg: number },
  sim: TrnSimulationConfig
): { x: number; y: number; headingDeg: number; crossTrackUnits: number } {
  const rad = (baseRoutePos.headingDeg * Math.PI) / 180;
  // Right-hand perpendicular vector of heading (0=N=(0,-1), 90=E=(1,0)) -> right=(cos, sin)
  const rightX = Math.cos(rad);
  const rightY = Math.sin(rad);

  const x = Math.max(25, Math.min(975, baseRoutePos.x + rightX * sim.lateralOffsetUnits));
  const y = Math.max(25, Math.min(975, baseRoutePos.y + rightY * sim.lateralOffsetUnits));
  const headingDeg = Math.round(normalizeAngle360(baseRoutePos.headingDeg + sim.headingBiasDeg));

  // If route has <2 waypoints just return base
  if (waypoints.length < 2) {
    return { x: baseRoutePos.x, y: baseRoutePos.y, headingDeg: baseRoutePos.headingDeg, crossTrackUnits: 0 };
  }

  return {
    x,
    y,
    headingDeg,
    crossTrackUnits: Math.abs(sim.lateralOffsetUnits),
  };
}

export function computeTrnGuidance(params: {
  site: SiteDataset;
  waypoints: Waypoint[];
  baseRoutePos: {
    x: number;
    y: number;
    headingDeg: number;
    nextWaypoint: Waypoint | null;
  };
  selectedDestId: string | null;
  roverLayerEnabled: boolean;
  sim: TrnSimulationConfig;
}): TrnGuidanceState {
  const { site, waypoints, baseRoutePos, selectedDestId, roverLayerEnabled, sim } = params;

  const pose = computeAstronautWorldPose(waypoints, baseRoutePos, sim);
  const currentTerrain = sampleTerrainAt(site, pose.x, pose.y);
  const currentLatLon = mapToLatLon(site, pose.x, pose.y);

  // Resolve destination
  const options = getDestinationOptions(site, waypoints, baseRoutePos.nextWaypoint);
  const matchedOption =
    (selectedDestId ? options.find((o) => o.id === selectedDestId) : undefined) ||
    options[0] || {
      id: 'default',
      name: 'Target Station',
      kind: 'waypoint' as const,
      x: 500,
      y: 500,
    };

  const destElev = getRawElevationM(site, matchedOption.x, matchedOption.y);
  const destLatLon = mapToLatLon(site, matchedOption.x, matchedOption.y);

  const dx = matchedOption.x - pose.x;
  const dy = matchedOption.y - pose.y;
  const distUnits = Math.hypot(dx, dy);
  const distanceRemainingM = Math.round(distUnits * site.scaleMetersPerUnit);
  const targetBearingDeg = Math.round(
    bearingBetweenMapPoints(pose.x, pose.y, matchedOption.x, matchedOption.y)
  );
  const estimatedHeadingDeg = pose.headingDeg;
  const relativeTargetAngleDeg = Math.round(
    shortestSignedAngle(estimatedHeadingDeg, targetBearingDeg)
  );

  // Off-course detection: compares current facing + cross-track offset against route bearing
  const crossTrackErrorM = Math.round(pose.crossTrackUnits * site.scaleMetersPerUnit);
  const courseDeviationDeg = Math.round(
    shortestSignedAngle(targetBearingDeg, estimatedHeadingDeg)
  );
  const absCourseDeviationDeg = Math.abs(courseDeviationDeg);
  const isOffCourse =
    absCourseDeviationDeg >= 10 || crossTrackErrorM >= 35 || sim.scenario === 'off-course';

  // Forward terrain & obstacle scanning toward destination (up to ~180m ahead)
  let maxSlopeAheadDeg = currentTerrain.slopeDeg;
  let obstacleAhead: HazardZone | null = currentTerrain.hazard;
  const scanSteps = 6;
  const scanMaxFrac = Math.min(1, 65 / Math.max(1, distUnits));
  for (let i = 1; i <= scanSteps; i++) {
    const f = (i / scanSteps) * scanMaxFrac;
    const sx = pose.x + dx * f;
    const sy = pose.y + dy * f;
    const sample = sampleTerrainAt(site, sx, sy);
    if (sample.slopeDeg > maxSlopeAheadDeg) maxSlopeAheadDeg = sample.slopeDeg;
    if (sample.hazard && (!obstacleAhead || sample.hazard.severity === 'critical')) {
      obstacleAhead = sample.hazard;
    }
  }

  const forwardSummary = obstacleAhead
    ? `${obstacleAhead.name} (${obstacleAhead.maxSlopeDeg}° · ${obstacleAhead.surfaceType})`
    : maxSlopeAheadDeg >= 15
    ? `Moderate grade (${maxSlopeAheadDeg.toFixed(1)}°)`
    : `Clear bedrock/regolith (${maxSlopeAheadDeg.toFixed(1)}° max slope)`;

  // Nearby visual landmarks sorted by distance
  const nearbyLandmarks: NearbyLandmarkInfo[] = site.landmarks
    .map((lm) => {
      const lmDistM = Math.round(
        Math.hypot(lm.x - pose.x, lm.y - pose.y) * site.scaleMetersPerUnit
      );
      const lmBrg = Math.round(bearingBetweenMapPoints(pose.x, pose.y, lm.x, lm.y));
      const rel = Math.round(shortestSignedAngle(estimatedHeadingDeg, lmBrg));
      return {
        landmark: lm,
        distanceM: lmDistM,
        bearingDeg: lmBrg,
        relativeAngleDeg: rel,
        clockDirection: formatClockDirection(rel),
      };
    })
    .sort((a, b) => a.distanceM - b.distanceM);

  // Pick a landmark near the forward corridor (within ±65° of target bearing) if available
  const forwardLandmark =
    nearbyLandmarks.find(
      (item) =>
        item.distanceM >= 18 &&
        item.distanceM <= Math.max(380, distanceRemainingM + 90) &&
        Math.abs(shortestSignedAngle(targetBearingDeg, item.bearingDeg)) <= 58
    ) || nearbyLandmarks[0] || null;

  // Solar reference
  const solarRaw = computeMarsSolarPosition(site, sim.marsSolarHour);
  const relativeSunAngleDeg = Math.round(
    shortestSignedAngle(estimatedHeadingDeg, solarRaw.sunAzimuthDeg)
  );
  const sunVisible = solarRaw.sunElevationDeg > 8 && !sim.visualDegraded;

  // Rover reference
  const roverDistM = Math.round(
    Math.hypot(site.rover.x - pose.x, site.rover.y - pose.y) * site.scaleMetersPerUnit
  );
  const roverBearingDeg = Math.round(
    bearingBetweenMapPoints(pose.x, pose.y, site.rover.x, site.rover.y)
  );
  const roverRelAngle = Math.round(shortestSignedAngle(estimatedHeadingDeg, roverBearingDeg));
  const roverAvailable = roverLayerEnabled && roverDistM <= 1800;
  const roverActive = roverAvailable && (sim.useRoverReference || sim.scenario === 'rover-ref');
  const roverSignalQualityPct = roverAvailable
    ? Math.max(35, Math.min(99, Math.round(100 - (roverDistM / 1800) * 55)))
    : 0;

  // 5-Channel Conceptual Sensor Fusion Model (simulated)
  const imuQuality = sim.visualDegraded ? 68 : isOffCourse ? 81 : 90;
  const visualQuality = sim.visualDegraded
    ? 18
    : forwardLandmark
    ? Math.max(58, Math.round(forwardLandmark.landmark.visualDistinctness * 96 - Math.min(25, forwardLandmark.distanceM / 25)))
    : 65;
  const terrainQuality =
    currentTerrain.thermalInertia < 180 && sim.visualDegraded
      ? 36
      : currentTerrain.slopeDeg >= 10
      ? 91 // steeper topographic relief gives stronger DTM correlation
      : 78;
  const solarQuality = sim.visualDegraded
    ? 22
    : solarRaw.sunElevationDeg >= 18
    ? 92
    : solarRaw.sunElevationDeg >= 8
    ? 68
    : 20;

  const channels: SensorChannelStatus[] = [
    {
      id: 'imu',
      label: 'IMU / Inertial Dead-Reckoning',
      shortLabel: 'IMU',
      active: true,
      qualityPct: imuQuality,
      reading: isOffCourse
        ? `Drift +${crossTrackErrorM}m cross-track`
        : 'Stride & gyro rate nominal',
      isSimulated: true,
    },
    {
      id: 'visual',
      label: 'Visual Landmark Localization',
      shortLabel: 'Visual',
      active: !sim.visualDegraded,
      qualityPct: visualQuality,
      reading: sim.visualDegraded
        ? 'Dust haze — landmark occlusion'
        : forwardLandmark
        ? `Matched ${forwardLandmark.landmark.guidanceCue} (${forwardLandmark.distanceM}m)`
        : 'Horizon ridge match active',
      isSimulated: true,
    },
    {
      id: 'terrain',
      label: 'Terrain-Relative DTM Match',
      shortLabel: 'DTM',
      active: true,
      qualityPct: terrainQuality,
      reading: `Elev ${currentTerrain.elevationM}m · Slope ${currentTerrain.slopeDeg.toFixed(1)}°`,
      isSimulated: true,
    },
    {
      id: 'solar',
      label: 'Mars Solar Azimuth Reference',
      shortLabel: 'Solar',
      active: sunVisible,
      qualityPct: solarQuality,
      reading: sunVisible
        ? `Sun ${solarRaw.sunAzimuthDeg}° @ ${solarRaw.sunElevationDeg}° el (${solarRaw.localSolarTimeStr})`
        : `Low/occluded Sun (${solarRaw.sunElevationDeg}° el)`,
      isSimulated: true,
    },
    {
      id: 'rover',
      label: `${site.rover.callsign} Rover Reference`,
      shortLabel: 'Rover',
      active: roverActive,
      qualityPct: roverActive ? roverSignalQualityPct : 0,
      reading: roverActive
        ? `Range ${roverDistM}m · Rel ${formatClockDirection(roverRelAngle)}`
        : roverAvailable
        ? 'Standby — enable Rover Ref to lock'
        : 'Out of optical/UHF baseline',
      isSimulated: true,
    },
  ];

  // Weighted fusion confidence
  const weightedSum =
    imuQuality * 0.2 +
    visualQuality * 0.3 +
    terrainQuality * 0.24 +
    solarQuality * 0.14 +
    (roverActive ? roverSignalQualityPct : 45) * 0.12;
  const confidenceScore = Math.max(
    15,
    Math.min(99, Math.round(weightedSum + sim.relocalizeBoost))
  );

  const confidenceLevel: NavConfidenceLevel =
    confidenceScore >= 76 ? 'HIGH' : confidenceScore >= 48 ? 'MEDIUM' : 'LOW';

  const uncertaintyRadiusM =
    confidenceLevel === 'HIGH'
      ? Math.max(4, Math.round((100 - confidenceScore) * 0.6))
      : confidenceLevel === 'MEDIUM'
      ? Math.round(18 + (76 - confidenceScore) * 0.9)
      : Math.round(45 + (48 - confidenceScore) * 1.4);

  const lowConfidenceActions: string[] = [];
  if (confidenceLevel !== 'HIGH') {
    if (forwardLandmark) {
      lowConfidenceActions.push(
        `Return toward recognizable landmark: ${forwardLandmark.landmark.name} (${forwardLandmark.distanceM} m, ${forwardLandmark.clockDirection}).`
      );
    }
    if (roverAvailable && !roverActive) {
      lowConfidenceActions.push(
        `Enable ${site.rover.callsign} Rover Reference (${roverDistM} m) for UHF/Mastcam triangulation.`
      );
    } else if (roverAvailable) {
      lowConfidenceActions.push(
        `Maintain line-of-sight with ${site.rover.callsign} (${roverDistM} m) as baseline anchor.`
      );
    }
    lowConfidenceActions.push(
      'Pause traverse for 10 seconds to run Visual + DTM + Solar re-localization fix.'
    );
  }

  // Turn command (human-readable)
  let turnCommandLabel = `TARGET AHEAD — ${distanceRemainingM} m`;
  if (distanceRemainingM <= 22) {
    turnCommandLabel = `ARRIVING AT TARGET — ${distanceRemainingM} m`;
  } else if (Math.abs(relativeTargetAngleDeg) <= 7) {
    turnCommandLabel = `TARGET AHEAD — ${distanceRemainingM} m`;
  } else if (relativeTargetAngleDeg > 7 && relativeTargetAngleDeg <= 135) {
    turnCommandLabel = `TURN RIGHT ${Math.abs(relativeTargetAngleDeg)}° — ${distanceRemainingM} m`;
  } else if (relativeTargetAngleDeg < -7 && relativeTargetAngleDeg >= -135) {
    turnCommandLabel = `TURN LEFT ${Math.abs(relativeTargetAngleDeg)}° — ${distanceRemainingM} m`;
  } else {
    turnCommandLabel = `TARGET BEHIND (${Math.abs(relativeTargetAngleDeg)}°) — ${distanceRemainingM} m`;
  }

  // Landmark-oriented recommended direction of travel
  let recommendedDirectionLabel = turnCommandLabel;
  if (matchedOption.kind === 'poi' && distanceRemainingM <= 190 && forwardLandmark?.landmark.passSide === 'behind') {
    recommendedDirectionLabel = `SCIENCE TARGET BEHIND ${forwardLandmark.landmark.guidanceCue} — ${distanceRemainingM} m`;
  } else if (obstacleAhead && obstacleAhead.severity === 'critical') {
    recommendedDirectionLabel = `PASS LEFT OF ${obstacleAhead.name.toUpperCase()} (${obstacleAhead.maxSlopeDeg}° SLOPE)`;
  } else if (isOffCourse && forwardLandmark) {
    const turnSide = relativeTargetAngleDeg >= 0 ? 'RIGHT' : 'LEFT';
    recommendedDirectionLabel = `TURN ${turnSide} ${Math.abs(relativeTargetAngleDeg)}° TOWARD ${forwardLandmark.landmark.guidanceCue} — ${forwardLandmark.distanceM} m`;
  } else if (forwardLandmark && forwardLandmark.distanceM <= 320) {
    if (forwardLandmark.landmark.passSide === 'left') {
      recommendedDirectionLabel = `PASS LEFT OF ${forwardLandmark.landmark.guidanceCue} — ${forwardLandmark.distanceM} m`;
    } else if (forwardLandmark.landmark.passSide === 'right') {
      recommendedDirectionLabel = `PASS RIGHT OF ${forwardLandmark.landmark.guidanceCue} — ${forwardLandmark.distanceM} m`;
    } else if (forwardLandmark.landmark.passSide === 'behind' && distanceRemainingM <= 240) {
      recommendedDirectionLabel = `SCIENCE TARGET BEHIND ${forwardLandmark.landmark.guidanceCue} — ${distanceRemainingM} m`;
    } else {
      recommendedDirectionLabel = `HEAD TOWARD ${forwardLandmark.landmark.guidanceCue} — ${forwardLandmark.distanceM} m`;
    }
  } else if (roverActive && sim.scenario === 'rover-ref') {
    recommendedDirectionLabel = `ALIGN WITH ${site.rover.callsign} (${roverDistM} m ${formatClockDirection(roverRelAngle).toUpperCase()})`;
  }

  // Corrected navigation vector when off-course or obstacle ahead
  let correctedVector: TrnGuidanceState['correctedVector'] = null;
  const safeBypassRecommended = Boolean(obstacleAhead && obstacleAhead.severity === 'critical');

  if (isOffCourse || safeBypassRecommended) {
    let corrX = matchedOption.x;
    let corrY = matchedOption.y;
    let reason = `Corrects ${absCourseDeviationDeg}° course deviation (${crossTrackErrorM} m off track)`;

    if (safeBypassRecommended && site.safeBedrockWaypoints.length >= 2) {
      // Pick nearest safe intermediate bedrock waypoint ahead
      const safeCorridorWp =
        site.safeBedrockWaypoints.find((w) => w.type === 'waypoint') ||
        site.safeBedrockWaypoints[Math.max(0, site.safeBedrockWaypoints.length - 2)];
      corrX = safeCorridorWp.x;
      corrY = safeCorridorWp.y;
      reason = `Bypasses ${obstacleAhead!.name} (${obstacleAhead!.maxSlopeDeg}°) via ${safeCorridorWp.name}`;
    } else if (baseRoutePos.nextWaypoint) {
      corrX = baseRoutePos.nextWaypoint.x;
      corrY = baseRoutePos.nextWaypoint.y;
    }

    const corrBrg = Math.round(bearingBetweenMapPoints(pose.x, pose.y, corrX, corrY));
    const corrRel = Math.round(shortestSignedAngle(estimatedHeadingDeg, corrBrg));
    const corrCmd =
      Math.abs(corrRel) <= 7
        ? 'HOLD CORRECTED HEADING'
        : corrRel > 0
        ? `STEER RIGHT ${Math.abs(corrRel)}°`
        : `STEER LEFT ${Math.abs(corrRel)}°`;

    correctedVector = {
      targetX: corrX,
      targetY: corrY,
      bearingDeg: corrBrg,
      relativeAngleDeg: corrRel,
      commandLabel: corrCmd,
      reason,
    };
  }

  const secondaryBearingLabel = `BRG ${String(targetBearingDeg).padStart(3, '0')}° · HDG ${String(
    estimatedHeadingDeg
  ).padStart(3, '0')}° · SUN ${String(solarRaw.sunAzimuthDeg).padStart(3, '0')}°`;

  return {
    currentPos: {
      x: pose.x,
      y: pose.y,
      lat: currentLatLon.lat,
      lon: currentLatLon.lon,
      elevationM: currentTerrain.elevationM,
    },
    destination: {
      id: matchedOption.id,
      name: matchedOption.name,
      kind: matchedOption.kind,
      x: matchedOption.x,
      y: matchedOption.y,
      lat: destLatLon.lat,
      lon: destLatLon.lon,
      elevationM: destElev,
    },
    distanceRemainingM,
    targetBearingDeg,
    estimatedHeadingDeg,
    relativeTargetAngleDeg,
    courseDeviationDeg,
    absCourseDeviationDeg,
    crossTrackErrorM,
    isOffCourse,
    recommendedDirectionLabel,
    turnCommandLabel,
    secondaryBearingLabel,
    correctedVector,
    safeBypassRecommended,
    forwardTerrain: {
      maxSlopeAheadDeg: Number(maxSlopeAheadDeg.toFixed(1)),
      obstacleAhead,
      summary: forwardSummary,
    },
    nearbyLandmarks,
    primaryLandmark: forwardLandmark,
    confidenceLevel,
    confidenceScore,
    uncertaintyRadiusM,
    lowConfidenceActions,
    solar: {
      localSolarTimeStr: solarRaw.localSolarTimeStr,
      sunAzimuthDeg: solarRaw.sunAzimuthDeg,
      sunElevationDeg: solarRaw.sunElevationDeg,
      relativeSunAngleDeg,
    },
    roverRef: {
      available: roverAvailable,
      active: roverActive,
      distanceM: roverDistM,
      bearingDeg: roverBearingDeg,
      relativeAngleDeg: roverRelAngle,
      signalQualityPct: roverSignalQualityPct,
    },
    channels,
  };
}
