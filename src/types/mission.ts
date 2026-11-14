export type SiteId = 'gale' | 'jezero' | 'valles';

export type LayerId = 'optical' | 'contours' | 'hazards' | 'crism' | 'themis' | 'rover' | 'trn';

export interface LayerConfig {
  id: LayerId;
  label: string;
  source: string;
  enabled: boolean;
  opacity: number;
  accentColor: string;
}

export interface VisualLandmark {
  id: string;
  name: string;
  featureType: 'boulder' | 'ridge' | 'outcrop' | 'crater' | 'butte';
  x: number;
  y: number;
  elevationM: number;
  visualDistinctness: number; // 0..1 how recognizable on visor/mastcam imagery
  guidanceCue: string; // e.g., "Triangular Basalt Boulder" or "Vera Rubin Saddle"
  passSide?: 'left' | 'right' | 'behind' | 'toward';
}

export type TrnScenarioId =
  | 'nominal'
  | 'off-course'
  | 'obstacle'
  | 'visual-loss'
  | 'target-approach'
  | 'rover-ref';

export type NavConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SensorChannelStatus {
  id: 'imu' | 'visual' | 'terrain' | 'solar' | 'rover';
  label: string;
  shortLabel: string;
  active: boolean;
  qualityPct: number;
  reading: string;
  isSimulated: true;
}

export interface NearbyLandmarkInfo {
  landmark: VisualLandmark;
  distanceM: number;
  bearingDeg: number;
  relativeAngleDeg: number; // -180..+180 relative to astronaut heading
  clockDirection: string; // e.g., "11 o'clock", "Ahead", "2 o'clock"
}

export interface TrnGuidanceState {
  currentPos: {
    x: number;
    y: number;
    lat: string;
    lon: string;
    elevationM: number;
  };
  destination: {
    id: string;
    name: string;
    kind: 'waypoint' | 'poi' | 'rover';
    x: number;
    y: number;
    lat: string;
    lon: string;
    elevationM: number;
  };
  distanceRemainingM: number;
  targetBearingDeg: number; // 0..360 Mars-grid azimuth (secondary MC readout)
  estimatedHeadingDeg: number; // 0..360 astronaut facing azimuth
  relativeTargetAngleDeg: number; // -180..+180 relative to astronaut facing
  courseDeviationDeg: number; // signed deviation from ideal route/heading
  absCourseDeviationDeg: number;
  crossTrackErrorM: number;
  isOffCourse: boolean;
  recommendedDirectionLabel: string; // e.g. "HEAD TOWARD TRIANGULAR BOULDER — 120 m"
  turnCommandLabel: string; // e.g. "TURN RIGHT 18°" or "TARGET AHEAD"
  secondaryBearingLabel: string; // e.g. "BRG 074° · HDG 056°"
  correctedVector: {
    targetX: number;
    targetY: number;
    bearingDeg: number;
    relativeAngleDeg: number;
    commandLabel: string;
    reason: string;
  } | null;
  safeBypassRecommended: boolean;
  forwardTerrain: {
    maxSlopeAheadDeg: number;
    obstacleAhead: HazardZone | null;
    summary: string;
  };
  nearbyLandmarks: NearbyLandmarkInfo[];
  primaryLandmark: NearbyLandmarkInfo | null;
  confidenceLevel: NavConfidenceLevel;
  confidenceScore: number; // 0..100
  uncertaintyRadiusM: number;
  lowConfidenceActions: string[];
  solar: {
    localSolarTimeStr: string;
    sunAzimuthDeg: number;
    sunElevationDeg: number;
    relativeSunAngleDeg: number;
  };
  roverRef: {
    available: boolean;
    active: boolean;
    distanceM: number;
    bearingDeg: number;
    relativeAngleDeg: number;
    signalQualityPct: number;
  };
  channels: SensorChannelStatus[];
}

export interface Waypoint {
  id: string;
  name: string;
  x: number; // 0..1000 map space
  y: number; // 0..1000 map space
  type: 'base' | 'science' | 'waypoint';
  notes?: string;
}

export interface HazardZone {
  id: string;
  name: string;
  severity: 'critical' | 'caution';
  maxSlopeDeg: number;
  surfaceType: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotationDeg: number;
  description: string;
  datasetId: string;
}

export interface MineralRegion {
  id: string;
  name: string;
  mineralClass: 'Hematite' | 'Smectite Clays' | 'Hydrated Sulfates';
  formula: string;
  wavelengthNm: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotationDeg: number;
  color: string;
  datasetId: string;
  summary: string;
}

export interface ThermalPatch {
  id: string;
  label: string;
  tiu: number;
  classification: 'bedrock' | 'dust';
  x: number;
  y: number;
  rx: number;
  ry: number;
  rotationDeg: number;
}

export interface SpectralPeak {
  bandNm: number;
  label: string;
  intensity: number;
}

export interface SciencePOI {
  id: string;
  name: string;
  x: number;
  y: number;
  mineralTag: string;
  datasetId: string;
  hiRiseId: string;
  elevationM: number;
  significance: string;
  tasks: string[];
  imageUrl: string;
  spectralPeaks: SpectralPeak[];
}

export interface RoverScout {
  id: string;
  name: string;
  callsign: string;
  x: number;
  y: number;
  headingDeg: number;
  rtgPowerW: number;
  mastcamStatus: string;
  hazcamClearanceCm: number;
  commLinkDb: number;
  panoramaUrl: string;
  telemetryNote: string;
}

export interface FieldObservation {
  id: string;
  title: string;
  sampleType: 'Core' | 'Regolith' | 'Spectral Scan' | 'Photo';
  notes: string;
  x: number;
  y: number;
  elevationM: number;
  slopeDeg: number;
  timestampUtc: string;
  sol: number;
}

export interface SiteDataset {
  id: SiteId;
  name: string;
  shortName: string;
  regionLabel: string;
  sol: number;
  baseLat: number; // positive = N, negative = S
  baseLon: number; // East longitude
  scaleMetersPerUnit: number;
  minElevM: number;
  maxElevM: number;
  terrainPalette: {
    low: string;
    mid: string;
    high: string;
    ridge: string;
  };
  defaultCamera: {
    x: number;
    y: number;
    zoom: number;
  };
  defaultWaypoints: Waypoint[];
  safeBedrockWaypoints: Waypoint[];
  hazards: HazardZone[];
  minerals: MineralRegion[];
  thermalPatches: ThermalPatch[];
  pois: SciencePOI[];
  landmarks: VisualLandmark[];
  rover: RoverScout;
  siteScienceSummary: string;
}

export interface TerrainSample {
  elevationM: number;
  slopeDeg: number;
  thermalInertia: number;
  mineralName: string | null;
  hazard: HazardZone | null;
}

export interface RouteSegmentAnalysis {
  index: number;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  distanceKm: number;
  maxSlopeDeg: number;
  avgSlopeDeg: number;
  elevGainM: number;
  elevLossM: number;
  estMinutes: number;
  terrainDifficultyFactor: number;
  o2Liters: number;
  o2Pct: number;
  powerWh: number;
  powerPct: number;
  isHazard: boolean;
  hazardSeverity: 'nominal' | 'caution' | 'critical';
  intersectedHazards: HazardZone[];
  minThermalInertia: number;
}

export interface ProfileSample {
  distKm: number;
  elevationM: number;
  slopeDeg: number;
  thermalInertia: number;
  x: number;
  y: number;
  hazardSeverity: 'nominal' | 'caution' | 'critical';
  waypointName?: string;
}

export interface RouteAnalysis {
  totalDistanceKm: number;
  totalElevGainM: number;
  totalElevLossM: number;
  totalTimeMin: number;
  maxSlopeDeg: number;
  totalO2Liters: number;
  totalPowerWh: number;
  o2ConsumptionPct: number;
  batteryConsumptionPct: number;
  safetyStatus: 'NOMINAL' | 'CAUTION' | 'CRITICAL HAZARD';
  segments: RouteSegmentAnalysis[];
  profile: ProfileSample[];
  detectedHazards: HazardZone[];
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  timestamp: string;
  text?: string;
  datasetFacts?: string[];
  synthesisNotes?: string[];
  suggestedRerouteAvailable?: boolean;
  rerouteLabel?: string;
}
