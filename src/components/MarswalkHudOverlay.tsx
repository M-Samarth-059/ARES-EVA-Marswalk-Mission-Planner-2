import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Compass,
  FileText,
  Pause,
  Play,
  PlusCircle,
  Radio,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  RouteAnalysis,
  SiteDataset,
  TerrainSample,
  TrnGuidanceState,
  TrnScenarioId,
} from '../types/mission';
import { TrnDestinationOption } from '../utils/trnEngine';
import { TrnGuidanceReticle } from './TrnGuidanceReticle';

interface MarswalkHudOverlayProps {
  site: SiteDataset;
  analysis: RouteAnalysis;
  progress: number; // 0..1
  isPlaying: boolean;
  speed: 1 | 5;
  astronautTerrain: TerrainSample;
  trnGuidance: TrnGuidanceState;
  destinationOptions: TrnDestinationOption[];
  selectedDestId: string | null;
  activeScenario: TrnScenarioId;
  onSelectDestination: (destId: string) => void;
  onSelectScenario: (scenario: TrnScenarioId) => void;
  onSteerOffset: (deltaUnits: number) => void;
  onReCenterRoute: () => void;
  onRelocalize: () => void;
  onApplySafeRoute: () => void;
  onTogglePlay: () => void;
  onToggleSpeed: () => void;
  onScrub: (val: number) => void;
  onReset: () => void;
  onLogDiscovery: () => void;
  onOpenReport: () => void;
  onExitHud: () => void;
}

const SCENARIO_BUTTONS: { id: TrnScenarioId; label: string }[] = [
  { id: 'nominal', label: 'Nominal' },
  { id: 'off-course', label: 'Off-Course' },
  { id: 'obstacle', label: 'Obstacle' },
  { id: 'visual-loss', label: 'Visual Loss' },
  { id: 'target-approach', label: 'Target Near' },
  { id: 'rover-ref', label: 'Rover Ref' },
];

export const MarswalkHudOverlay: React.FC<MarswalkHudOverlayProps> = ({
  site,
  analysis,
  progress,
  isPlaying,
  speed,
  astronautTerrain,
  trnGuidance,
  destinationOptions,
  selectedDestId,
  activeScenario,
  onSelectDestination,
  onSelectScenario,
  onSteerOffset,
  onReCenterRoute,
  onRelocalize,
  onApplySafeRoute,
  onTogglePlay,
  onToggleSpeed,
  onScrub,
  onReset,
  onLogDiscovery,
  onOpenReport,
  onExitHud,
}) => {
  const [simDrawerOpen, setSimDrawerOpen] = useState(false);

  const o2RemainPct = Math.max(
    5,
    Number((100 - analysis.o2ConsumptionPct * progress).toFixed(1))
  );
  const batRemainPct = Math.max(
    5,
    Number((100 - analysis.batteryConsumptionPct * progress).toFixed(1))
  );

  const isCriticalFoot =
    astronautTerrain.hazard?.severity === 'critical' || astronautTerrain.slopeDeg >= 22;
  const isCautionFoot =
    !isCriticalFoot &&
    (astronautTerrain.hazard?.severity === 'caution' || astronautTerrain.slopeDeg >= 15);

  const confStyle =
    trnGuidance.confidenceLevel === 'HIGH'
      ? {
          border: 'border-[#10B981]/60',
          text: 'text-[#4EDEA3]',
          bg: 'bg-[#0B0E14]/92',
          sub: 'Strong Terrain + Visual Match',
        }
      : trnGuidance.confidenceLevel === 'MEDIUM'
      ? {
          border: 'border-[#F59E0B]/75',
          text: 'text-[#FCD34D]',
          bg: 'bg-[#1D1508]/92',
          sub: 'Partial Landmark Match',
        }
      : {
          border: 'border-[#EF4444]',
          text: 'text-[#FCA5A5]',
          bg: 'bg-[#280B0F]/95',
          sub: 'Insufficient Visual/Terrain Ref',
        };

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2.5 sm:p-4 overflow-hidden">
      {/* Subtle Suit Visor Frame */}
      <div className="pointer-events-none absolute inset-2 sm:inset-3 border border-[#4EDEA3]/15 rounded-lg" />

      {/* TOP BAR: Minimal Life Support + TRN Confidence + Exit */}
      <div className="relative z-10 flex items-start justify-between gap-2">
        {/* Suit Reserves (Minimal) */}
        <div className="pointer-events-auto bg-[#0B0E14]/92 border border-[#232B3A] rounded px-2.5 py-1.5 sm:px-3 sm:py-2">
          <div className="flex items-center gap-3 sm:gap-4 font-mono-tabular">
            <div>
              <span className="text-[10px] text-[#86948A]">O2 </span>
              <span className="text-xs sm:text-sm font-bold text-[#4EDEA3]">{o2RemainPct}%</span>
            </div>
            <div>
              <span className="text-[10px] text-[#86948A]">BAT </span>
              <span className="text-xs sm:text-sm font-bold text-[#7BD0FF]">{batRemainPct}%</span>
            </div>
            <div className="hidden sm:block text-[10px] text-[#86948A] border-l border-[#1E293B] pl-3">
              SLOPE{' '}
              <span
                className={
                  isCriticalFoot
                    ? 'text-[#EF4444] font-bold'
                    : isCautionFoot
                    ? 'text-[#F59E0B] font-bold'
                    : 'text-[#DEE2F1] font-semibold'
                }
              >
                {astronautTerrain.slopeDeg.toFixed(1)}°
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Confidence Pill (Uncluttered Suit Indicator) */}
        <div
          className={`pointer-events-auto ${confStyle.bg} border ${confStyle.border} rounded px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 flex items-center gap-2`}
        >
          <Compass className={`w-3.5 h-3.5 shrink-0 ${confStyle.text}`} />
          <div className="leading-tight">
            <div className="flex items-center gap-1.5 font-mono-tabular text-[11px] sm:text-xs font-bold">
              <span className="text-[#86948A] hidden sm:inline">TRN CONFIDENCE:</span>
              <span className={confStyle.text}>{trnGuidance.confidenceLevel}</span>
              <span className="text-[#86948A] text-[10px]">
                ±{trnGuidance.uncertaintyRadiusM}m
              </span>
            </div>
            <div className="hidden md:block text-[9.5px] font-mono-tabular text-[#BBCABF]">
              {confStyle.sub} · SIMULATED TRN
            </div>
          </div>
        </div>

        {/* Exit Marswalk HUD */}
        <button
          type="button"
          onClick={onExitHud}
          className="pointer-events-auto min-h-[38px] sm:min-h-0 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded bg-[#0B0E14]/92 border border-[#232B3A] hover:border-[#38BDF8] text-xs font-medium text-[#DEE2F1] flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Exit HUD</span>
        </button>
      </div>

      {/* UPPER-CENTER MINIMAL ASTRONAUT GUIDANCE & CONTEXTUAL ALERTS */}
      <div className="relative z-10 flex flex-col items-center gap-2 my-auto pointer-events-none">
        {/* Primary Visor Guidance Pod */}
        <div className="pointer-events-auto bg-[#0B0E14]/92 border border-[#232B3A] rounded-lg px-3 py-2.5 sm:px-4 sm:py-3 max-w-[94vw] sm:max-w-[540px] w-full flex items-center gap-3 sm:gap-4 shadow-xl">
          <TrnGuidanceReticle guidance={trnGuidance} variant="visor" />

          <div className="min-w-0 flex-1 space-y-1">
            {/* Destination Selector + Simulated Tag */}
            <div className="flex items-center justify-between gap-2">
              <select
                value={selectedDestId || destinationOptions[0]?.id || ''}
                onChange={(e) => onSelectDestination(e.target.value)}
                aria-label="Select navigation destination"
                className="bg-[#121721] border border-[#232B3A] focus:border-[#38BDF8] rounded px-2 py-0.5 text-[11px] font-mono-tabular text-[#7BD0FF] outline-none max-w-[190px] sm:max-w-[260px] truncate"
              >
                {destinationOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    DEST: {opt.name}
                  </option>
                ))}
              </select>
              <span className="text-[9.5px] font-mono-tabular text-[#86948A] whitespace-nowrap shrink-0">
                {trnGuidance.distanceRemainingM} m
              </span>
            </div>

            {/* Human-Readable Landmark-Oriented Direction */}
            <div className="text-sm sm:text-base font-bold tracking-tight text-white leading-snug">
              {trnGuidance.recommendedDirectionLabel}
            </div>

            {/* Turn Cue & Secondary Bearing for Mission Control */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10.5px] font-mono-tabular">
              <span className="text-[#4EDEA3] font-semibold">
                {trnGuidance.turnCommandLabel}
              </span>
              <span className="text-[#3C4A42]">·</span>
              <span className="text-[#86948A]">{trnGuidance.secondaryBearingLabel}</span>
            </div>
          </div>
        </div>

        {/* Intelligent Off-Course Warning (Only shown when deviating) */}
        {trnGuidance.isOffCourse && (
          <div className="pointer-events-auto bg-[#281A07]/95 border border-[#F59E0B] rounded px-3 py-2 max-w-[94vw] sm:max-w-[540px] w-full flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular">
            <div className="flex items-center gap-2 text-[#FCD34D] min-w-0">
              <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
              <div className="min-w-0">
                <span className="font-bold">
                  COURSE DEVIATION: {trnGuidance.absCourseDeviationDeg}°
                </span>
                <span className="text-[#FDE68A] ml-2 text-[11px]">
                  ({trnGuidance.crossTrackErrorM}m off track)
                  {trnGuidance.correctedVector
                    ? ` · ${trnGuidance.correctedVector.commandLabel}`
                    : ''}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onReCenterRoute}
                className="px-2.5 py-1 rounded bg-[#F59E0B] hover:bg-[#FBBF24] text-[#0B0E14] text-[10.5px] font-bold uppercase whitespace-nowrap transition-colors"
              >
                Rejoin Route
              </button>
              {trnGuidance.safeBypassRecommended && (
                <button
                  type="button"
                  onClick={onApplySafeRoute}
                  className="px-2.5 py-1 rounded bg-[#10B981] hover:bg-[#4EDEA3] text-[#0B0E14] text-[10.5px] font-bold uppercase whitespace-nowrap transition-colors"
                >
                  Safe Route
                </button>
              )}
            </div>
          </div>
        )}

        {/* Low Navigation Confidence Alert & Recovery Actions */}
        {trnGuidance.confidenceLevel === 'LOW' && (
          <div className="pointer-events-auto bg-[#2A0B0F]/95 border border-[#EF4444] rounded px-3 py-2 max-w-[94vw] sm:max-w-[540px] w-full flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular">
            <div className="min-w-0 flex-1 text-[#FECACA]">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldAlert className="w-4 h-4 text-[#EF4444] shrink-0" />
                <span>LOW NAVIGATION CONFIDENCE — RE-LOCALIZE</span>
              </div>
              <p className="text-[10.5px] text-[#FCA5A5] mt-0.5 leading-snug">
                {trnGuidance.lowConfidenceActions[0] ||
                  'Stop traverse, orient toward nearest landmark, or lock Rover reference.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onRelocalize}
              className="px-2.5 py-1.5 rounded bg-[#EF4444] hover:bg-[#F87171] text-white text-[10.5px] font-bold uppercase whitespace-nowrap shrink-0 transition-colors"
            >
              Re-Localize
            </button>
          </div>
        )}

        {/* Proximity Terrain / Obstacle Alert */}
        {(isCriticalFoot || isCautionFoot || trnGuidance.forwardTerrain.obstacleAhead) && (
          <div
            className={`pointer-events-auto px-3 py-1.5 rounded border flex flex-wrap items-center justify-between gap-2 max-w-[94vw] sm:max-w-[540px] w-full text-[11px] font-mono-tabular font-semibold ${
              isCriticalFoot || trnGuidance.forwardTerrain.obstacleAhead?.severity === 'critical'
                ? 'bg-[#2A0E12]/95 border-[#EF4444] text-[#FCA5A5]'
                : 'bg-[#281C0B]/95 border-[#F59E0B] text-[#FCD34D]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {isCriticalFoot ? 'TERRAIN HAZARD UNDERFOOT' : 'OBSTACLE AHEAD'}:{' '}
                {astronautTerrain.hazard?.name ||
                  trnGuidance.forwardTerrain.obstacleAhead?.name ||
                  'Steep Grade'}{' '}
                ({Math.max(astronautTerrain.slopeDeg, trnGuidance.forwardTerrain.maxSlopeAheadDeg).toFixed(1)}°)
              </span>
            </div>
            {trnGuidance.safeBypassRecommended && (
              <button
                type="button"
                onClick={onApplySafeRoute}
                className="px-2 py-0.5 rounded bg-[#10B981] text-[#0B0E14] text-[10px] font-bold uppercase whitespace-nowrap shrink-0"
              >
                Use Safe Bypass
              </button>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM MINIMAL PLAYBACK & EXPANDABLE SCENARIO SIMULATOR */}
      <div className="relative z-10 flex flex-col items-center gap-2 w-full">
        {/* Expandable Scenario & Steering Drawer */}
        {simDrawerOpen && (
          <div className="pointer-events-auto w-full max-w-[780px] bg-[#0B0E14]/95 border border-[#232B3A] rounded p-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-mono-tabular uppercase tracking-wider text-[#86948A]">
                Simulated TRN Scenarios · Test Navigation Response
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSteerOffset(-14)}
                  className="px-2 py-1 rounded bg-[#1A2230] border border-[#232B3A] hover:border-[#38BDF8] text-[10.5px] font-mono-tabular text-[#DEE2F1] whitespace-nowrap"
                >
                  ← Drift L
                </button>
                <button
                  type="button"
                  onClick={onReCenterRoute}
                  className="px-2 py-1 rounded bg-[#1A2230] border border-[#232B3A] hover:border-[#10B981] text-[10.5px] font-mono-tabular text-[#4EDEA3] whitespace-nowrap"
                >
                  On Track
                </button>
                <button
                  type="button"
                  onClick={() => onSteerOffset(14)}
                  className="px-2 py-1 rounded bg-[#1A2230] border border-[#232B3A] hover:border-[#38BDF8] text-[10.5px] font-mono-tabular text-[#DEE2F1] whitespace-nowrap"
                >
                  Drift R →
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {SCENARIO_BUTTONS.map((sc) => {
                const active = activeScenario === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => onSelectScenario(sc.id)}
                    className={`px-2 py-1.5 rounded text-[10.5px] font-mono-tabular font-medium border whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[#1A2230] border-[#38BDF8] text-[#7BD0FF]'
                        : 'bg-[#121721] border-[#1E293B] text-[#BBCABF] hover:text-white'
                    }`}
                  >
                    {sc.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Compact Bottom Control Bar */}
        <div className="pointer-events-auto w-full max-w-[920px] bg-[#0B0E14]/95 border border-[#232B3A] rounded px-2.5 py-2 sm:px-3.5 sm:py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          {/* Play / Speed / Scrub */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <button
              type="button"
              onClick={onTogglePlay}
              className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded bg-[#10B981] hover:bg-[#4EDEA3] text-[#0B0E14] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : progress >= 0.99 ? 'Replay' : 'Walk'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleSpeed}
              className="min-h-[38px] sm:min-h-0 px-2 py-1.5 rounded bg-[#1A2230] border border-[#232B3A] hover:border-[#38BDF8] text-xs font-mono-tabular font-semibold text-[#7BD0FF] whitespace-nowrap shrink-0"
            >
              {speed}x
            </button>

            <button
              type="button"
              onClick={onReset}
              title="Reset traverse"
              className="min-h-[38px] sm:min-h-0 p-1.5 rounded bg-[#1A2230] border border-[#232B3A] hover:border-[#38BDF8] text-[#BBCABF] hover:text-white shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={progress}
              onChange={(e) => onScrub(Number(e.target.value))}
              aria-label="EVA Traverse Progress"
              className="tactical-slider flex-1 min-w-[60px] mx-1"
            />

            <span className="text-[11px] font-mono-tabular text-[#DEE2F1] w-9 text-right shrink-0">
              {Math.round(progress * 100)}%
            </span>
          </div>

          {/* Secondary Quick Suit Actions */}
          <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0">
            <div className="flex items-center gap-1 text-[10.5px] font-mono-tabular text-[#4EDEA3] px-2 py-1 bg-[#121721] border border-[#1E293B] rounded whitespace-nowrap">
              <Radio className="w-3 h-3 shrink-0" />
              <span>
                {trnGuidance.roverRef.distanceM}m
              </span>
            </div>

            <button
              type="button"
              onClick={() => setSimDrawerOpen((v) => !v)}
              className={`min-h-[38px] sm:min-h-0 px-2.5 py-1.5 rounded border text-xs font-medium flex items-center gap-1 whitespace-nowrap transition-colors ${
                simDrawerOpen
                  ? 'bg-[#1A2230] border-[#38BDF8] text-[#7BD0FF]'
                  : 'bg-[#121721] border-[#232B3A] text-[#BBCABF] hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Sim</span>
              {simDrawerOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronUp className="w-3 h-3" />
              )}
            </button>

            <button
              type="button"
              onClick={onLogDiscovery}
              className="min-h-[38px] sm:min-h-0 px-2.5 py-1.5 rounded bg-[#A855F7]/20 border border-[#A855F7] hover:bg-[#A855F7]/30 text-[#F0DBFF] text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Log Sample</span>
              <span className="md:hidden">Log</span>
            </button>

            <button
              type="button"
              onClick={onOpenReport}
              title="Open Mission Report"
              className="min-h-[38px] sm:min-h-0 px-2.5 py-1.5 rounded bg-[#1A2230] border border-[#232B3A] hover:border-[#10B981] text-xs font-medium text-[#DEE2F1] flex items-center gap-1 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-[#4EDEA3]" />
              <span className="hidden lg:inline">Report</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
