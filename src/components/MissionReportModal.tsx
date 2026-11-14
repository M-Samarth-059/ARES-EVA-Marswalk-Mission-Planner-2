import React from 'react';
import { CheckCircle2, Download, Printer, ShieldCheck, X } from 'lucide-react';
import {
  FieldObservation,
  RouteAnalysis,
  SiteDataset,
  Waypoint,
} from '../types/mission';

interface MissionReportModalProps {
  site: SiteDataset;
  waypoints: Waypoint[];
  analysis: RouteAnalysis;
  observations: FieldObservation[];
  completedTaskCount: number;
  totalTaskCount: number;
  onClose: () => void;
}

export const MissionReportModal: React.FC<MissionReportModalProps> = ({
  site,
  waypoints,
  analysis,
  observations,
  completedTaskCount,
  totalTaskCount,
  onClose,
}) => {
  // Compute scientific return score grounded in targets, tasks, observations & route safety
  const safetyPoints =
    analysis.safetyStatus === 'NOMINAL'
      ? 30
      : analysis.safetyStatus === 'CAUTION'
      ? 18
      : 6;
  const targetPoints = Math.min(35, waypoints.filter((w) => w.type === 'science').length * 11);
  const discoveryPoints = Math.min(20, observations.length * 7 + completedTaskCount * 3);
  const coveragePoints = Math.min(15, Math.round(analysis.totalDistanceKm * 5));
  const scienceScore = Math.min(100, safetyPoints + targetPoints + discoveryPoints + coveragePoints);

  const avoidedHazards = site.hazards.filter(
    (h) => !analysis.detectedHazards.some((dh) => dh.id === h.id)
  );

  const handleExportJson = () => {
    const payload = {
      mission: 'ARES-EVA Marswalk Mission Debrief',
      site: site.name,
      sol: site.sol,
      exportedAt: new Date().toISOString(),
      routeSummary: {
        totalDistanceKm: analysis.totalDistanceKm,
        elevationGainM: analysis.totalElevGainM,
        estimatedTimeMin: analysis.totalTimeMin,
        maxSlopeDeg: analysis.maxSlopeDeg,
        safetyStatus: analysis.safetyStatus,
        suitO2DrawPct: analysis.o2ConsumptionPct,
        suitBatteryDrawPct: analysis.batteryConsumptionPct,
      },
      waypoints,
      hazardsAvoided: avoidedHazards.map((h) => h.name),
      hazardsEncountered: analysis.detectedHazards.map((h) => h.name),
      loggedDiscoveries: observations,
      scientificValueScore: scienceScore,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ares-eva-${site.id}-sol${site.sol}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#121721] border border-[#232B3A] rounded shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#0B0E14] border-b border-[#1E293B] flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-[#4EDEA3]">
              NASA / JPL TACTICAL EVA DEBRIEF · SOL {site.sol}
            </div>
            <h2 className="text-base font-semibold text-[#DEE2F1] mt-0.5">
              Post-EVA Mission Report — {site.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close mission report"
            className="p-1 text-[#86948A] hover:text-white no-print"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Top KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-3">
              <div className="text-[10px] uppercase tracking-wider text-[#86948A]">
                Distance Covered
              </div>
              <div className="text-xl font-mono-tabular font-bold text-[#DEE2F1] mt-1">
                {analysis.totalDistanceKm.toFixed(2)} <span className="text-xs text-[#86948A]">km</span>
              </div>
            </div>

            <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-3">
              <div className="text-[10px] uppercase tracking-wider text-[#86948A]">
                Elevation Gain
              </div>
              <div className="text-xl font-mono-tabular font-bold text-[#7BD0FF] mt-1">
                +{analysis.totalElevGainM} <span className="text-xs text-[#86948A]">m</span>
              </div>
            </div>

            <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-3">
              <div className="text-[10px] uppercase tracking-wider text-[#86948A]">
                Hazards Avoided
              </div>
              <div className="text-xl font-mono-tabular font-bold text-[#4EDEA3] mt-1">
                {avoidedHazards.length} <span className="text-xs text-[#86948A]">/ {site.hazards.length}</span>
              </div>
            </div>

            <div className="bg-[#0B0E14] border border-[#A855F7]/50 rounded p-3">
              <div className="text-[10px] uppercase tracking-wider text-[#DDB7FF]">
                Science Value Score
              </div>
              <div className="text-xl font-mono-tabular font-bold text-[#F0DBFF] mt-1">
                {scienceScore} <span className="text-xs text-[#86948A]">/ 100</span>
              </div>
            </div>
          </div>

          {/* Safety & Resource Posture */}
          <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#DEE2F1]">
                <ShieldCheck className="w-4 h-4 text-[#4EDEA3]" />
                <span>EVA Safety &amp; PLSS Consumption Assessment</span>
              </div>
              <span
                className={`text-xs font-mono-tabular font-bold ${
                  analysis.safetyStatus === 'CRITICAL HAZARD'
                    ? 'text-[#EF4444]'
                    : analysis.safetyStatus === 'CAUTION'
                    ? 'text-[#F59E0B]'
                    : 'text-[#10B981]'
                }`}
              >
                {analysis.safetyStatus}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono-tabular text-[#BBCABF] pt-1">
              <div>Est. Duration: {analysis.totalTimeMin} min</div>
              <div>Suit O2 Burn: {analysis.o2ConsumptionPct.toFixed(1)}%</div>
              <div>Battery Draw: {analysis.batteryConsumptionPct.toFixed(1)}%</div>
            </div>
            {avoidedHazards.length > 0 && (
              <div className="text-[11px] font-mono-tabular text-[#4EDEA3] pt-1">
                Avoided Hazard Zones: {avoidedHazards.map((h) => `${h.name} (${h.maxSlopeDeg}°)`).join(', ')}
              </div>
            )}
            {analysis.detectedHazards.length > 0 && (
              <div className="text-[11px] font-mono-tabular text-[#FCA5A5]">
                Unresolved Route Intersections:{' '}
                {analysis.detectedHazards.map((h) => `${h.name} (${h.maxSlopeDeg}°)`).join(', ')}
              </div>
            )}
          </div>

          {/* Targets & Tasks Investigated */}
          <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#DEE2F1]">
              <span>Traverse Stations &amp; Science Targets ({waypoints.length})</span>
              <span className="text-[11px] font-mono-tabular text-[#7BD0FF]">
                Tasks Completed: {completedTaskCount} / {totalTaskCount}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {waypoints.map((wp, idx) => (
                <div
                  key={wp.id}
                  className="px-2.5 py-1 rounded bg-[#121721] border border-[#1E293B] text-xs font-mono-tabular text-[#DEE2F1] flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>
                    {idx + 1}. {wp.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Logged Astronaut Discoveries */}
          <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-3.5 space-y-2">
            <div className="text-xs font-semibold text-[#DEE2F1]">
              Astronaut Field Discoveries ({observations.length})
            </div>
            {observations.length === 0 ? (
              <p className="text-xs font-mono-tabular text-[#86948A]">
                No custom specimen observations were logged during this EVA plan.
              </p>
            ) : (
              <div className="divide-y divide-[#1E293B]">
                {observations.map((obs) => (
                  <div key={obs.id} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#6FFBAE]">{obs.title}</span>
                      <span className="font-mono-tabular text-[#86948A]">
                        {obs.sampleType} · {obs.elevationM}m · {obs.timestampUtc}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#BBCABF] mt-0.5">{obs.notes}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-[#0B0E14] border-t border-[#1E293B] flex items-center justify-between gap-3 no-print">
          <span className="text-[11px] font-mono-tabular text-[#86948A]">
            Companion Scout: {site.rover.name} ({site.rover.callsign})
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded bg-[#1A2230] border border-[#232B3A] hover:border-[#38BDF8] text-xs font-medium text-[#DEE2F1] flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Brief</span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="px-3.5 py-1.5 rounded bg-[#10B981] hover:bg-[#4EDEA3] text-[#0B0E14] text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
