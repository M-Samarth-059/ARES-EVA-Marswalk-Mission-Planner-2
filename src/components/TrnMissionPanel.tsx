import React from 'react';
import {
  AlertTriangle,
  Compass,
  EyeOff,
  Landmark,
  Navigation,
  Radio,
  RefreshCw,
  Route,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import {
  SiteDataset,
  TrnGuidanceState,
  TrnScenarioId,
} from '../types/mission';
import { TrnDestinationOption, TrnSimulationConfig } from '../utils/trnEngine';
import { TrnGuidanceReticle } from './TrnGuidanceReticle';

interface TrnMissionPanelProps {
  site: SiteDataset;
  guidance: TrnGuidanceState;
  sim: TrnSimulationConfig;
  progress: number;
  destinationOptions: TrnDestinationOption[];
  selectedDestId: string | null;
  onSelectDestination: (id: string) => void;
  onSelectScenario: (scenario: TrnScenarioId) => void;
  onScrubProgress: (val: number) => void;
  onSteerOffset: (deltaUnits: number) => void;
  onReCenterRoute: () => void;
  onToggleRoverRef: () => void;
  onToggleVisualDegraded: () => void;
  onChangeSolarHour: (hour: number) => void;
  onRelocalize: () => void;
  onApplySafeRoute: () => void;
  onEnterMarswalkHud: () => void;
}

const SCENARIOS: { id: TrnScenarioId; label: string }[] = [
  { id: 'nominal', label: 'Nominal' },
  { id: 'off-course', label: 'Off-Course' },
  { id: 'obstacle', label: 'Obstacle' },
  { id: 'visual-loss', label: 'Visual Loss' },
  { id: 'target-approach', label: 'Target Near' },
  { id: 'rover-ref', label: 'Rover Ref' },
];

export const TrnMissionPanel: React.FC<TrnMissionPanelProps> = ({
  site,
  guidance,
  sim,
  progress,
  destinationOptions,
  selectedDestId,
  onSelectDestination,
  onSelectScenario,
  onScrubProgress,
  onSteerOffset,
  onReCenterRoute,
  onToggleRoverRef,
  onToggleVisualDegraded,
  onChangeSolarHour,
  onRelocalize,
  onApplySafeRoute,
  onEnterMarswalkHud,
}) => {
  const confBadge =
    guidance.confidenceLevel === 'HIGH'
      ? 'text-[#4EDEA3] border-[#10B981]/60 bg-[#10B981]/10'
      : guidance.confidenceLevel === 'MEDIUM'
      ? 'text-[#FCD34D] border-[#F59E0B]/70 bg-[#F59E0B]/10'
      : 'text-[#FCA5A5] border-[#EF4444] bg-[#EF4444]/15';

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* Transparent Simulation Labeling & Marswalk Launch */}
      <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono-tabular font-bold text-[#7BD0FF]">
            [SIMULATED TRN TELEMETRY]
          </span>
          <button
            type="button"
            onClick={onEnterMarswalkHud}
            className="px-2 py-1 rounded bg-[#10B981]/15 border border-[#10B981]/60 hover:bg-[#10B981] hover:text-[#0B0E14] text-[#6FFBAE] text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1 whitespace-nowrap transition-colors"
          >
            <Navigation className="w-3 h-3" />
            <span>Suit Visor HUD</span>
          </button>
        </div>
        <p className="text-[10.5px] text-[#86948A] leading-snug">
          Non-magnetic Mars navigation fusing simulated IMU, HiRISE/DTM terrain matching, visual landmarks, Sun azimuth, and {site.rover.callsign} ranging.
        </p>

        {/* Destination Picker */}
        <div>
          <label className="block text-[9.5px] font-mono-tabular uppercase tracking-wider text-[#86948A] mb-1">
            Selected Destination
          </label>
          <select
            value={selectedDestId || destinationOptions[0]?.id || ''}
            onChange={(e) => onSelectDestination(e.target.value)}
            className="w-full bg-[#121721] border border-[#232B3A] focus:border-[#38BDF8] rounded px-2.5 py-1.5 text-xs font-mono-tabular text-[#DEE2F1] outline-none"
          >
            {destinationOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Primary Astronaut-Centered Guidance Reticle + Landmark Command */}
      <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-3 flex flex-col items-center text-center space-y-2.5">
        <TrnGuidanceReticle guidance={guidance} variant="console" />

        <div className="space-y-1 w-full">
          <div className="text-xs font-bold text-white leading-snug">
            {guidance.recommendedDirectionLabel}
          </div>
          <div className="text-[11px] font-mono-tabular font-semibold text-[#4EDEA3]">
            {guidance.turnCommandLabel}
          </div>
          <div className="text-[10px] font-mono-tabular text-[#86948A]">
            {guidance.secondaryBearingLabel}
          </div>
        </div>
      </div>

      {/* Navigation Confidence + Low Confidence Recovery */}
      <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#BBCABF] flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-[#7BD0FF]" />
            <span>Navigation Confidence</span>
          </span>
          <span className={`px-2 py-0.5 rounded border text-[10px] font-mono-tabular font-bold ${confBadge}`}>
            {guidance.confidenceLevel} · {guidance.confidenceScore}% (±{guidance.uncertaintyRadiusM}m)
          </span>
        </div>

        <p className="text-[10.5px] font-mono-tabular text-[#86948A]">
          {guidance.confidenceLevel === 'HIGH'
            ? 'HIGH — strong terrain/visual match across DTM, landmarks & solar fix.'
            : guidance.confidenceLevel === 'MEDIUM'
            ? 'MEDIUM — partial landmark match; monitor drift or lock Rover baseline.'
            : 'LOW — insufficient visual or terrain reference; position uncertainty elevated.'}
        </p>

        {guidance.lowConfidenceActions.length > 0 && (
          <div className="pt-1.5 border-t border-[#1E293B] space-y-1.5">
            {guidance.lowConfidenceActions.map((act, idx) => (
              <div key={idx} className="text-[10.5px] text-[#FCA5A5] leading-snug flex items-start gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-[#EF4444] shrink-0 mt-0.5" />
                <span>{act}</span>
              </div>
            ))}
            <button
              type="button"
              onClick={onRelocalize}
              className="w-full py-1.5 rounded bg-[#1A2230] border border-[#38BDF8]/60 hover:bg-[#38BDF8] hover:text-[#0B0E14] text-[#7BD0FF] text-[10.5px] font-semibold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Stop &amp; Re-Localize (Visual + DTM + Sun)</span>
            </button>
          </div>
        )}
      </div>

      {/* Course Deviation & Obstacle Alert */}
      {(guidance.isOffCourse || guidance.safeBypassRecommended) && (
        <div
          className={`rounded border p-2.5 space-y-1.5 text-[11px] font-mono-tabular ${
            guidance.safeBypassRecommended
              ? 'bg-[#26090D] border-[#EF4444] text-[#FECACA]'
              : 'bg-[#281A07] border-[#F59E0B] text-[#FCD34D]'
          }`}
        >
          <div className="flex items-center justify-between gap-2 font-bold">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                {guidance.isOffCourse
                  ? `COURSE DEVIATION: ${guidance.absCourseDeviationDeg}°`
                  : 'ROUTE OBSTACLE DETECTED'}
              </span>
            </span>
            <span>{guidance.crossTrackErrorM}m OFF</span>
          </div>

          {guidance.correctedVector && (
            <p className="text-[10.5px] leading-snug opacity-90">
              Corrected Vector: {guidance.correctedVector.commandLabel} (BRG{' '}
              {String(guidance.correctedVector.bearingDeg).padStart(3, '0')}°) —{' '}
              {guidance.correctedVector.reason}
            </p>
          )}

          <div className="flex items-center gap-1.5 pt-1">
            {guidance.isOffCourse && (
              <button
                type="button"
                onClick={onReCenterRoute}
                className="flex-1 py-1 rounded bg-[#F59E0B] hover:bg-[#FBBF24] text-[#0B0E14] text-[10px] font-bold uppercase"
              >
                Rejoin Track
              </button>
            )}
            {guidance.safeBypassRecommended && (
              <button
                type="button"
                onClick={onApplySafeRoute}
                className="flex-1 py-1 rounded bg-[#10B981] hover:bg-[#4EDEA3] text-[#0B0E14] text-[10px] font-bold uppercase flex items-center justify-center gap-1"
              >
                <Route className="w-3 h-3" />
                <span>Apply Safe Route</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Position, Destination & Route Terrain Telemetry */}
      <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-2.5 space-y-2 text-[10.5px] font-mono-tabular">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[9.5px] text-[#86948A] uppercase">Current Position</div>
            <div className="text-[#DEE2F1] font-semibold">
              {guidance.currentPos.lat}
            </div>
            <div className="text-[#86948A]">
              {guidance.currentPos.lon} · {guidance.currentPos.elevationM}m
            </div>
          </div>
          <div>
            <div className="text-[9.5px] text-[#86948A] uppercase">Destination</div>
            <div className="text-[#7BD0FF] font-semibold truncate">
              {guidance.destination.name}
            </div>
            <div className="text-[#86948A]">
              {guidance.distanceRemainingM}m · {guidance.destination.elevationM}m
            </div>
          </div>
        </div>
        <div className="pt-1.5 border-t border-[#1E293B] flex items-center justify-between gap-2">
          <span className="text-[#86948A]">Forward Slope / Obstacles:</span>
          <span
            className={
              guidance.forwardTerrain.obstacleAhead?.severity === 'critical'
                ? 'text-[#EF4444] font-semibold text-right'
                : 'text-[#BBCABF] text-right'
            }
          >
            {guidance.forwardTerrain.summary}
          </span>
        </div>
      </div>

      {/* 5-Source Sensor Fusion Model (Simulated) */}
      <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#BBCABF]">
            5-Source Sensor Fusion (Simulated)
          </span>
          <span className="text-[9.5px] font-mono-tabular text-[#86948A]">
            {guidance.solar.localSolarTimeStr}
          </span>
        </div>

        <div className="space-y-1.5">
          {guidance.channels.map((ch) => (
            <div key={ch.id} className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px] font-mono-tabular">
                <span className={ch.active ? 'text-[#DEE2F1]' : 'text-[#86948A]'}>
                  {ch.label}
                </span>
                <span
                  className={
                    ch.qualityPct >= 75
                      ? 'text-[#4EDEA3] font-semibold'
                      : ch.qualityPct >= 45
                      ? 'text-[#F59E0B] font-semibold'
                      : 'text-[#EF4444] font-semibold'
                  }
                >
                  {ch.qualityPct}%
                </span>
              </div>
              <div className="h-1 bg-[#1A2230] rounded-xs overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    ch.qualityPct >= 75
                      ? 'bg-[#4EDEA3]'
                      : ch.qualityPct >= 45
                      ? 'bg-[#F59E0B]'
                      : 'bg-[#EF4444]'
                  }`}
                  style={{ width: `${ch.qualityPct}%` }}
                />
              </div>
              <div className="text-[9.5px] font-mono-tabular text-[#86948A] truncate">
                {ch.reading}
              </div>
            </div>
          ))}
        </div>

        {/* Interactive Sensor Controls */}
        <div className="pt-2 border-t border-[#1E293B] space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-mono-tabular">
            <Sun className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
            <span className="text-[#86948A] shrink-0">Mars Time</span>
            <input
              type="range"
              min={7}
              max={18}
              step={0.25}
              value={sim.marsSolarHour}
              onChange={(e) => onChangeSolarHour(Number(e.target.value))}
              aria-label="Simulated Mars Local Solar Time"
              className="tactical-slider flex-1"
            />
            <span className="text-[#FCD34D] w-11 text-right">
              {Math.floor(sim.marsSolarHour)}:{String(Math.round((sim.marsSolarHour % 1) * 60)).padStart(2, '0')}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={onToggleRoverRef}
              className={`px-2 py-1.5 rounded text-[10px] font-mono-tabular font-semibold border flex items-center justify-center gap-1 transition-colors ${
                sim.useRoverReference
                  ? 'bg-[#10B981]/15 border-[#10B981] text-[#6FFBAE]'
                  : 'bg-[#121721] border-[#232B3A] text-[#86948A] hover:text-white'
              }`}
            >
              <Radio className="w-3 h-3" />
              <span>Rover Ref: {sim.useRoverReference ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleVisualDegraded}
              className={`px-2 py-1.5 rounded text-[10px] font-mono-tabular font-semibold border flex items-center justify-center gap-1 transition-colors ${
                sim.visualDegraded
                  ? 'bg-[#EF4444]/15 border-[#EF4444] text-[#FCA5A5]'
                  : 'bg-[#121721] border-[#232B3A] text-[#86948A] hover:text-white'
              }`}
            >
              <EyeOff className="w-3 h-3" />
              <span>Dust Loss: {sim.visualDegraded ? 'ON' : 'OFF'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Nearby Visual Landmarks */}
      <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#BBCABF]">
          <Landmark className="w-3.5 h-3.5 text-[#FBBF24]" />
          <span>Nearby Visual Landmarks</span>
        </div>
        <div className="space-y-1">
          {guidance.nearbyLandmarks.slice(0, 4).map((item) => (
            <div
              key={item.landmark.id}
              className="flex items-center justify-between gap-2 text-[10.5px] font-mono-tabular py-1 border-b border-[#1E293B]/60 last:border-0"
            >
              <span className="text-[#DEE2F1] truncate">{item.landmark.name}</span>
              <span className="text-[#FCD34D] whitespace-nowrap shrink-0">
                {item.clockDirection} · {item.distanceM}m
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Simulation Mode Controls & Scenarios */}
      <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-2.5 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#BBCABF]">
          <span>TRN Simulation Mode</span>
          <span className="font-mono-tabular text-[#7BD0FF]">{Math.round(progress * 100)}% ROUTE</span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={progress}
            onChange={(e) => onScrubProgress(Number(e.target.value))}
            aria-label="Simulate astronaut position along route"
            className="tactical-slider flex-1"
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onSteerOffset(-14)}
            className="py-1 rounded bg-[#1A2230] border border-[#232B3A] hover:border-[#38BDF8] text-[10px] font-mono-tabular text-[#DEE2F1]"
          >
            ← Drift L
          </button>
          <button
            type="button"
            onClick={onReCenterRoute}
            className="py-1 rounded bg-[#1A2230] border border-[#232B3A] hover:border-[#10B981] text-[10px] font-mono-tabular text-[#4EDEA3]"
          >
            Center
          </button>
          <button
            type="button"
            onClick={() => onSteerOffset(14)}
            className="py-1 rounded bg-[#1A2230] border border-[#232B3A] hover:border-[#38BDF8] text-[10px] font-mono-tabular text-[#DEE2F1]"
          >
            Drift R →
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5 pt-1">
          {SCENARIOS.map((sc) => {
            const active = sim.scenario === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                onClick={() => onSelectScenario(sc.id)}
                className={`px-1.5 py-1 rounded text-[10px] font-mono-tabular border whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#1A2230] border-[#38BDF8] text-[#7BD0FF] font-semibold'
                    : 'bg-[#121721] border-[#1E293B] text-[#BBCABF] hover:text-white'
                }`}
              >
                {sc.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
