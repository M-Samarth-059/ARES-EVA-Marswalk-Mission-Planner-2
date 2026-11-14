import React, { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckSquare,
  Compass,
  Microscope,
  Navigation,
  Radio,
  Route,
  Send,
  Square,
} from 'lucide-react';
import {
  AssistantMessage,
  FieldObservation,
  RouteAnalysis,
  SciencePOI,
  SiteDataset,
  TrnGuidanceState,
  TrnScenarioId,
} from '../types/mission';
import { TrnDestinationOption, TrnSimulationConfig } from '../utils/trnEngine';
import { TrnMissionPanel } from './TrnMissionPanel';

export type RightTabId = 'copilot' | 'nav' | 'science' | 'hazards';

interface RightAnalysisSidebarProps {
  activeTab: RightTabId;
  onChangeTab: (tab: RightTabId) => void;
  site: SiteDataset;
  analysis: RouteAnalysis;
  messages: AssistantMessage[];
  onSendPrompt: (prompt: string) => void;
  onApplySafeRoute: () => void;
  selectedPoi: SciencePOI | null;
  onSelectPoi: (poi: SciencePOI) => void;
  selectedRover: boolean;
  onSelectRover: (val: boolean) => void;
  observations: FieldObservation[];
  completedTaskIds: Set<string>;
  onToggleTask: (taskKey: string) => void;
  trnGuidance: TrnGuidanceState;
  trnSim: TrnSimulationConfig;
  trnProgress: number;
  destinationOptions: TrnDestinationOption[];
  selectedDestId: string | null;
  onSelectDestination: (id: string) => void;
  onSelectScenario: (scenario: TrnScenarioId) => void;
  onScrubTrnProgress: (val: number) => void;
  onSteerOffset: (deltaUnits: number) => void;
  onReCenterRoute: () => void;
  onToggleRoverRef: () => void;
  onToggleVisualDegraded: () => void;
  onChangeSolarHour: (hour: number) => void;
  onRelocalize: () => void;
  onEnterMarswalkHud: () => void;
}

const QUICK_PROMPTS = [
  'Why is this location scientifically interesting?',
  'What hazards are along my route?',
  'Suggest a safer route for top science targets',
  'Explain the CRISM mineral signature',
];

export const RightAnalysisSidebar: React.FC<RightAnalysisSidebarProps> = ({
  activeTab,
  onChangeTab,
  site,
  analysis,
  messages,
  onSendPrompt,
  onApplySafeRoute,
  selectedPoi,
  onSelectPoi,
  selectedRover,
  onSelectRover,
  observations,
  completedTaskIds,
  onToggleTask,
  trnGuidance,
  trnSim,
  trnProgress,
  destinationOptions,
  selectedDestId,
  onSelectDestination,
  onSelectScenario,
  onScrubTrnProgress,
  onSteerOffset,
  onReCenterRoute,
  onToggleRoverRef,
  onToggleVisualDegraded,
  onChangeSolarHour,
  onRelocalize,
  onEnterMarswalkHud,
}) => {
  const [inputVal, setInputVal] = useState('');
  const [imgErrorIds, setImgErrorIds] = useState<Record<string, boolean>>({});
  const [hoveredLegIdx, setHoveredLegIdx] = useState<number | null>(null);

  const activePoi = selectedPoi || site.pois[0];
  const maxBarPct = Math.max(
    12,
    ...analysis.segments.flatMap((s) => [s.o2Pct, s.powerPct])
  );
  const hoveredSeg =
    hoveredLegIdx !== null && analysis.segments[hoveredLegIdx]
      ? analysis.segments[hoveredLegIdx]
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;
    onSendPrompt(trimmed);
    setInputVal('');
  };

  return (
    <aside className="w-full lg:w-[364px] shrink-0 bg-[#121721] border border-[#1E293B] rounded flex flex-col overflow-hidden">
      {/* Segmented Mode Tabs */}
      <div className="p-2 bg-[#0B0E14] border-b border-[#1E293B] grid grid-cols-4 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => onChangeTab('copilot')}
          className={`px-1.5 py-1.5 rounded text-[10.5px] font-semibold flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
            activeTab === 'copilot'
              ? 'bg-[#1A2230] text-[#DDB7FF] border border-[#A855F7]/70'
              : 'text-[#86948A] hover:text-[#DEE2F1] border border-transparent'
          }`}
        >
          <Bot className="w-3.5 h-3.5 shrink-0" />
          <span>Copilot</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTab('nav')}
          className={`px-1.5 py-1.5 rounded text-[10.5px] font-semibold flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
            activeTab === 'nav'
              ? 'bg-[#1A2230] text-[#4EDEA3] border border-[#10B981]/70'
              : trnGuidance.confidenceLevel === 'LOW' || trnGuidance.isOffCourse
              ? 'text-[#FCD34D] hover:text-white border border-[#F59E0B]/40'
              : 'text-[#86948A] hover:text-[#DEE2F1] border border-transparent'
          }`}
        >
          <Navigation className="w-3.5 h-3.5 shrink-0" />
          <span>TRN Nav</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTab('science')}
          className={`px-1.5 py-1.5 rounded text-[10.5px] font-semibold flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
            activeTab === 'science'
              ? 'bg-[#1A2230] text-[#7BD0FF] border border-[#38BDF8]/70'
              : 'text-[#86948A] hover:text-[#DEE2F1] border border-transparent'
          }`}
        >
          <Microscope className="w-3.5 h-3.5 shrink-0" />
          <span>Science</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTab('hazards')}
          className={`px-1.5 py-1.5 rounded text-[10.5px] font-semibold flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
            activeTab === 'hazards'
              ? 'bg-[#1A2230] text-[#DEE2F1] border border-[#10B981]/70'
              : analysis.safetyStatus === 'CRITICAL HAZARD'
              ? 'text-[#FCA5A5] hover:text-white border border-[#EF4444]/40'
              : 'text-[#86948A] hover:text-[#DEE2F1] border border-transparent'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            Hazards {analysis.detectedHazards.length > 0 ? `(${analysis.detectedHazards.length})` : ''}
          </span>
        </button>
      </div>

      {/* O2 & Power Consumption Bar Chart (Route Length & Terrain Difficulty) */}
      <div className="px-3 py-2.5 bg-[#0F141D] border-b border-[#1E293B] shrink-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#BBCABF]">
            Est. O2 &amp; Power Consumption
          </span>
          <span className="text-[10.5px] font-mono-tabular text-[#DEE2F1]">
            <span className="text-[#4EDEA3] font-semibold">{analysis.totalO2Liters}L</span>
            <span className="text-[#86948A]"> ({analysis.o2ConsumptionPct}%)</span>
            <span className="text-[#3C4A42] mx-1">·</span>
            <span className="text-[#38BDF8] font-semibold">{analysis.totalPowerWh}Wh</span>
            <span className="text-[#86948A]"> ({analysis.batteryConsumptionPct}%)</span>
          </span>
        </div>

        {analysis.segments.length === 0 ? (
          <div className="h-[68px] flex items-center justify-center text-[10.5px] font-mono-tabular text-[#86948A] border border-dashed border-[#1E293B] rounded">
            Add 2+ waypoints to plot consumption
          </div>
        ) : (
          <>
            <div className="h-[68px] flex items-end gap-2 pt-2 pb-1 px-1.5 bg-[#0B0E14] border border-[#1E293B] rounded">
              {analysis.segments.map((seg) => {
                const o2H = Math.max(8, Math.round((seg.o2Pct / maxBarPct) * 100));
                const pwrH = Math.max(8, Math.round((seg.powerPct / maxBarPct) * 100));
                const isHovered = hoveredLegIdx === seg.index;
                return (
                  <div
                    key={`${seg.fromId}-${seg.toId}-${seg.index}`}
                    onMouseEnter={() => setHoveredLegIdx(seg.index)}
                    onMouseLeave={() => setHoveredLegIdx(null)}
                    className={`flex-1 h-full flex flex-col items-center justify-end gap-1 rounded-xs px-1 cursor-pointer transition-colors ${
                      isHovered ? 'bg-[#1A2230]' : ''
                    }`}
                  >
                    <div className="w-full flex-1 flex items-end justify-center gap-1 pt-1">
                      <div
                        className="w-2.5 bg-[#4EDEA3] rounded-t-xs transition-all duration-200"
                        style={{ height: `${o2H}%` }}
                        title={`Leg ${seg.index + 1} O2: ${seg.o2Liters} L (${seg.o2Pct}%)`}
                      />
                      <div
                        className="w-2.5 bg-[#38BDF8] rounded-t-xs transition-all duration-200"
                        style={{ height: `${pwrH}%` }}
                        title={`Leg ${seg.index + 1} Power: ${seg.powerWh} Wh (${seg.powerPct}%)`}
                      />
                    </div>
                    <div className="flex items-center gap-0.5 text-[9px] font-mono-tabular leading-none pb-0.5">
                      <span
                        className={
                          seg.hazardSeverity === 'critical'
                            ? 'text-[#EF4444] font-bold'
                            : seg.hazardSeverity === 'caution'
                            ? 'text-[#F59E0B] font-bold'
                            : 'text-[#86948A]'
                        }
                      >
                        L{seg.index + 1}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 mt-1.5 text-[10px] font-mono-tabular">
              {hoveredSeg ? (
                <span className="text-[#DEE2F1] truncate">
                  L{hoveredSeg.index + 1} ({hoveredSeg.distanceKm}km · x{hoveredSeg.terrainDifficultyFactor}):{' '}
                  <span className="text-[#4EDEA3]">{hoveredSeg.o2Liters}L</span> /{' '}
                  <span className="text-[#38BDF8]">{hoveredSeg.powerWh}Wh</span>
                </span>
              ) : (
                <div className="flex items-center gap-3 text-[#86948A]">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-[#4EDEA3] rounded-xs" /> O2 (% PLSS)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 bg-[#38BDF8] rounded-xs" /> Power (% Bat)
                  </span>
                </div>
              )}
              <span className="text-[#86948A] shrink-0">
                {analysis.totalDistanceKm.toFixed(2)} km total
              </span>
            </div>
          </>
        )}
      </div>

      {/* TAB 1B: TERRAIN-RELATIVE NAVIGATION (TRN) */}
      {activeTab === 'nav' && (
        <TrnMissionPanel
          site={site}
          guidance={trnGuidance}
          sim={trnSim}
          progress={trnProgress}
          destinationOptions={destinationOptions}
          selectedDestId={selectedDestId}
          onSelectDestination={onSelectDestination}
          onSelectScenario={onSelectScenario}
          onScrubProgress={onScrubTrnProgress}
          onSteerOffset={onSteerOffset}
          onReCenterRoute={onReCenterRoute}
          onToggleRoverRef={onToggleRoverRef}
          onToggleVisualDegraded={onToggleVisualDegraded}
          onChangeSolarHour={onChangeSolarHour}
          onRelocalize={onRelocalize}
          onApplySafeRoute={onApplySafeRoute}
          onEnterMarswalkHud={onEnterMarswalkHud}
        />
      )}

      {/* TAB 1: AI MISSION COPILOT */}
      {activeTab === 'copilot' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Quick Prompts */}
          <div className="p-2.5 border-b border-[#1E293B] bg-[#0F141D] shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#86948A] mb-1.5">
              Quick Tactical Queries
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp}
                  type="button"
                  onClick={() => onSendPrompt(qp)}
                  className="text-left text-[10.5px] px-2 py-1 rounded bg-[#1A2230] border border-[#232B3A] text-[#BBCABF] hover:text-white hover:border-[#A855F7]/70 transition-colors"
                >
                  {qp}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className="space-y-1.5">
                {msg.role === 'user' ? (
                  <div className="bg-[#1A2230] border border-[#232B3A] rounded px-3 py-2 text-xs text-[#DEE2F1]">
                    <div className="text-[10px] font-mono-tabular text-[#7BD0FF] mb-1">
                      FLIGHT CONTROLLER · {msg.timestamp}
                    </div>
                    <p>{msg.text}</p>
                  </div>
                ) : (
                  <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-3 space-y-2.5">
                    <div className="flex items-center justify-between text-[10px] font-mono-tabular text-[#86948A]">
                      <span>ARES COPILOT RESPONSE</span>
                      <span>{msg.timestamp}</span>
                    </div>

                    {msg.datasetFacts && msg.datasetFacts.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="inline-block px-1.5 py-0.5 rounded-xs text-[10px] font-mono-tabular font-bold bg-[#38BDF8]/15 text-[#7BD0FF] border border-[#38BDF8]/40">
                          [NASA/JPL DATASET]
                        </div>
                        <ul className="space-y-1 text-[11.5px] font-mono-tabular text-[#BBCABF] leading-relaxed">
                          {msg.datasetFacts.map((fact, idx) => (
                            <li key={idx}>• {fact}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {msg.synthesisNotes && msg.synthesisNotes.length > 0 && (
                      <div className="space-y-1.5 pt-1 border-t border-[#1E293B]">
                        <div className="inline-block px-1.5 py-0.5 rounded-xs text-[10px] font-mono-tabular font-bold bg-[#A855F7]/15 text-[#DDB7FF] border border-[#A855F7]/40">
                          [AI MISSION SYNTHESIS]
                        </div>
                        <div className="space-y-1 text-xs text-[#DEE2F1] leading-relaxed">
                          {msg.synthesisNotes.map((note, idx) => (
                            <p key={idx}>{note}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {msg.suggestedRerouteAvailable && analysis.safetyStatus !== 'NOMINAL' && (
                      <button
                        type="button"
                        onClick={onApplySafeRoute}
                        className="w-full mt-1 px-3 py-1.5 rounded bg-[#10B981] text-[#0B0E14] hover:bg-[#4EDEA3] text-[11px] font-semibold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Route className="w-3.5 h-3.5" />
                        <span>{msg.rerouteLabel || 'Apply Suggested Reroute'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input Box */}
          <form onSubmit={handleSubmit} className="p-2.5 border-t border-[#1E293B] bg-[#0B0E14] flex gap-1.5 shrink-0">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Ask about slope hazards, CRISM spectra..."
              className="flex-1 bg-[#121721] border border-[#232B3A] focus:border-[#38BDF8] rounded px-2.5 py-1.5 text-xs font-mono-tabular text-[#DEE2F1] placeholder-[#86948A] outline-none"
            />
            <button
              type="submit"
              aria-label="Send query"
              className="px-3 py-1.5 rounded bg-[#10B981] text-[#0B0E14] hover:bg-[#4EDEA3] font-semibold text-xs flex items-center justify-center shrink-0 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: SCIENCE TARGETS & MASTCAM INSPECTION */}
      {activeTab === 'science' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* POI Selector Strip */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-[#86948A]">
              <span>Site Scientific Targets</span>
              <button
                type="button"
                onClick={() => onSelectRover(!selectedRover)}
                className={`text-[10px] font-mono-tabular px-1.5 py-0.5 rounded border transition-colors ${
                  selectedRover
                    ? 'bg-[#10B981]/15 border-[#10B981] text-[#6FFBAE]'
                    : 'bg-[#1A2230] border-[#232B3A] text-[#4EDEA3] hover:border-[#10B981]'
                }`}
              >
                {selectedRover ? 'Viewing Rover Cam' : 'Inspect Rover Cam'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {site.pois.map((poi) => {
                const active = !selectedRover && activePoi?.id === poi.id;
                return (
                  <button
                    key={poi.id}
                    type="button"
                    onClick={() => {
                      onSelectRover(false);
                      onSelectPoi(poi);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium border whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[#1A2230] border-[#A855F7] text-[#F0DBFF]'
                        : 'bg-[#0B0E14] border-[#1E293B] text-[#BBCABF] hover:text-white'
                    }`}
                  >
                    {poi.name}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedRover ? (
            /* Curiosity-II Scout Rover Panoramic Preview */
            <div className="bg-[#0B0E14] border border-[#1E293B] rounded overflow-hidden">
              <div className="relative aspect-video bg-[#171C26]">
                {!imgErrorIds['rover-pano'] ? (
                  <img
                    src={site.rover.panoramaUrl}
                    alt={`${site.rover.name} Mastcam-Z Panorama`}
                    referrerPolicy="no-referrer"
                    onError={() => setImgErrorIds((p) => ({ ...p, 'rover-pano': true }))}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#2B1D17] to-[#121721] p-4 text-center">
                    <Radio className="w-6 h-6 text-[#4EDEA3] mb-1.5" />
                    <span className="text-xs font-mono-tabular text-[#DEE2F1]">
                      MASTCAM-Z PANORAMA FEED · {site.rover.callsign}
                    </span>
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 py-2">
                  <div className="text-[10px] font-mono-tabular text-[#4EDEA3]">
                    {site.rover.callsign} · HDG {site.rover.headingDeg}° · {site.rover.mastcamStatus}
                  </div>
                </div>
              </div>
              <div className="p-3 space-y-2">
                <div className="text-xs font-semibold text-[#DEE2F1]">{site.rover.name}</div>
                <p className="text-[11.5px] text-[#BBCABF] leading-relaxed">
                  {site.rover.telemetryNote}
                </p>
                <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] font-mono-tabular">
                  <div className="bg-[#121721] border border-[#1E293B] rounded p-1.5">
                    <div className="text-[#86948A]">RTG PWR</div>
                    <div className="text-[#4EDEA3] font-semibold">{site.rover.rtgPowerW} W</div>
                  </div>
                  <div className="bg-[#121721] border border-[#1E293B] rounded p-1.5">
                    <div className="text-[#86948A]">CLEARANCE</div>
                    <div className="text-[#7BD0FF] font-semibold">{site.rover.hazcamClearanceCm} cm</div>
                  </div>
                  <div className="bg-[#121721] border border-[#1E293B] rounded p-1.5">
                    <div className="text-[#86948A]">UHF LINK</div>
                    <div className="text-[#DEE2F1] font-semibold">{site.rover.commLinkDb} dB</div>
                  </div>
                </div>
              </div>
            </div>
          ) : activePoi ? (
            /* Selected Science POI Inspection View */
            <div className="bg-[#0B0E14] border border-[#1E293B] rounded overflow-hidden">
              <div className="relative aspect-[4/3] bg-[#171C26]">
                {!imgErrorIds[activePoi.id] ? (
                  <img
                    src={activePoi.imageUrl}
                    alt={`${activePoi.name} Mastcam-Z inspection`}
                    referrerPolicy="no-referrer"
                    onError={() => setImgErrorIds((p) => ({ ...p, [activePoi.id]: true }))}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#321F18] to-[#121721] p-4 text-center">
                    <Microscope className="w-6 h-6 text-[#DDB7FF] mb-1.5" />
                    <span className="text-xs font-mono-tabular text-[#DEE2F1]">
                      {activePoi.datasetId} · {activePoi.name}
                    </span>
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent px-3 py-2">
                  <div className="text-[10px] font-mono-tabular text-[#7BD0FF]">
                    MASTCAM-Z / ORBITAL CLOSE-UP · {activePoi.datasetId}
                  </div>
                  <div className="text-xs font-semibold text-white">{activePoi.name}</div>
                </div>
              </div>

              <div className="p-3 space-y-3">
                <div className="text-[11px] font-mono-tabular text-[#86948A] flex items-center gap-2 flex-wrap">
                  <span className="text-[#DDB7FF]">{activePoi.mineralTag}</span>
                  <span>·</span>
                  <span>{activePoi.hiRiseId}</span>
                  <span>·</span>
                  <span>{activePoi.elevationM} m</span>
                </div>

                <p className="text-xs text-[#BBCABF] leading-relaxed">{activePoi.significance}</p>

                {/* Spectral Band Absorption Bar Readout */}
                <div className="pt-2 border-t border-[#1E293B]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#86948A] mb-2">
                    CRISM Spectral Band Strength
                  </div>
                  <div className="space-y-1.5">
                    {activePoi.spectralPeaks.map((peak) => (
                      <div key={peak.bandNm} className="flex items-center gap-2 text-[10.5px] font-mono-tabular">
                        <span className="w-24 text-[#BBCABF] truncate">
                          {peak.bandNm}nm {peak.label}
                        </span>
                        <div className="flex-1 h-1.5 bg-[#1A2230] rounded-xs overflow-hidden">
                          <div
                            className="h-full bg-[#A855F7]"
                            style={{ width: `${peak.intensity}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-[#DEE2F1]">{peak.intensity}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Investigation Tasks */}
                <div className="pt-2 border-t border-[#1E293B]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#86948A] mb-1.5">
                    EVA Investigation Tasks
                  </div>
                  <div className="space-y-1.5">
                    {activePoi.tasks.map((task, idx) => {
                      const key = `${activePoi.id}-task-${idx}`;
                      const done = completedTaskIds.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onToggleTask(key)}
                          className="w-full text-left flex items-start gap-2 text-xs text-[#DEE2F1] hover:text-white"
                        >
                          {done ? (
                            <CheckSquare className="w-3.5 h-3.5 text-[#10B981] shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-[#86948A] shrink-0 mt-0.5" />
                          )}
                          <span className={done ? 'line-through text-[#86948A]' : ''}>{task}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* User-Logged Field Observations */}
          <div className="pt-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#86948A] mb-1.5">
              Logged Field Discoveries ({observations.length})
            </div>
            {observations.length === 0 ? (
              <div className="bg-[#0B0E14] border border-[#1E293B] rounded px-3 py-2.5 text-[11px] font-mono-tabular text-[#86948A]">
                No field discoveries logged yet. Select "+ Log Sample" on the map to record a specimen.
              </div>
            ) : (
              <div className="space-y-1.5">
                {observations.map((obs) => (
                  <div
                    key={obs.id}
                    className="bg-[#0B0E14] border border-[#10B981]/35 rounded px-2.5 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#6FFBAE] truncate">
                        {obs.title}
                      </span>
                      <span className="text-[10px] font-mono-tabular text-[#86948A] shrink-0">
                        {obs.sampleType}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono-tabular text-[#86948A]">
                      Sol {obs.sol} · {obs.elevationM}m · {obs.slopeDeg}° · {obs.timestampUtc}
                    </div>
                    {obs.notes && <p className="text-[11px] text-[#BBCABF]">{obs.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: HAZARDS & SEGMENT TELEMETRY */}
      {activeTab === 'hazards' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Detected Hazard Intersections */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#86948A]">
                Detected Route Hazards
              </span>
              {analysis.safetyStatus !== 'NOMINAL' && (
                <button
                  type="button"
                  onClick={onApplySafeRoute}
                  className="text-[10px] font-mono-tabular font-semibold text-[#4EDEA3] hover:underline"
                >
                  Apply Safe Route →
                </button>
              )}
            </div>

            {analysis.detectedHazards.length === 0 ? (
              <div className="bg-[#0B0E14] border border-[#10B981]/40 rounded px-3 py-2.5 text-xs text-[#6FFBAE]">
                ● Zero hazard zone intersections detected. Route slope stays below EVA threshold.
              </div>
            ) : (
              <div className="space-y-2">
                {analysis.detectedHazards.map((h) => (
                  <div
                    key={h.id}
                    className={`bg-[#0B0E14] border rounded p-2.5 space-y-1 ${
                      h.severity === 'critical'
                        ? 'border-[#EF4444]/70'
                        : 'border-[#F59E0B]/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          h.severity === 'critical' ? 'text-[#FCA5A5]' : 'text-[#FCD34D]'
                        }`}
                      >
                        {h.severity === 'critical' ? '✖' : '▲'} {h.name}
                      </span>
                      <span className="text-[11px] font-mono-tabular font-bold text-[#DEE2F1]">
                        {h.maxSlopeDeg}°
                      </span>
                    </div>
                    <div className="text-[10px] font-mono-tabular text-[#86948A]">
                      {h.surfaceType} · {h.datasetId}
                    </div>
                    <p className="text-[11px] text-[#BBCABF] leading-relaxed">{h.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Segment-by-Segment Telemetry Table */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#86948A] mb-1.5">
              Segment Telemetry &amp; Resource Log
            </div>
            <div className="border border-[#1E293B] rounded overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0B0E14] border-b border-[#1E293B] text-[9.5px] font-mono-tabular text-[#86948A] uppercase">
                    <th className="py-1.5 px-2">Leg</th>
                    <th className="py-1.5 px-1 text-right">Dist</th>
                    <th className="py-1.5 px-1 text-right">O2 / Pwr</th>
                    <th className="py-1.5 px-1 text-right">Slope</th>
                    <th className="py-1.5 px-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] text-[10.5px] font-mono-tabular">
                  {analysis.segments.map((seg, idx) => (
                    <tr
                      key={`${seg.fromId}-${seg.toId}`}
                      className={idx % 2 === 0 ? 'bg-[#121721]' : 'bg-[#0F141D]'}
                    >
                      <td className="py-1.5 px-2 text-[#DEE2F1] max-w-[104px] truncate">
                        {seg.fromName} → {seg.toName}
                      </td>
                      <td className="py-1.5 px-1 text-right text-[#BBCABF]">
                        {seg.distanceKm.toFixed(1)}k
                      </td>
                      <td className="py-1.5 px-1 text-right">
                        <span className="text-[#4EDEA3]">{Math.round(seg.o2Liters)}L</span>
                        <span className="text-[#3C4A42]">/</span>
                        <span className="text-[#38BDF8]">{Math.round(seg.powerWh)}W</span>
                      </td>
                      <td className="py-1.5 px-1 text-right text-[#DEE2F1]">
                        {seg.maxSlopeDeg.toFixed(0)}°
                      </td>
                      <td className="py-1.5 px-2 text-right font-semibold">
                        {seg.hazardSeverity === 'critical' ? (
                          <span className="text-[#EF4444]">CRIT</span>
                        ) : seg.hazardSeverity === 'caution' ? (
                          <span className="text-[#F59E0B]">WARN</span>
                        ) : (
                          <span className="text-[#10B981]">NOM</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Robotic Scout Telemetry */}
          <div className="bg-[#0B0E14] border border-[#1E293B] rounded p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#4EDEA3]">
                <Compass className="w-3.5 h-3.5" />
                <span>{site.rover.name}</span>
              </div>
              <span className="text-[10px] font-mono-tabular text-[#86948A]">
                {site.rover.callsign}
              </span>
            </div>
            <p className="text-[11px] text-[#BBCABF] leading-relaxed">
              {site.rover.telemetryNote}
            </p>
            <button
              type="button"
              onClick={() => {
                onSelectRover(true);
                onChangeTab('science');
              }}
              className="w-full py-1.5 rounded bg-[#1A2230] border border-[#232B3A] hover:border-[#10B981] text-[11px] font-medium text-[#DEE2F1] transition-colors"
            >
              Open Rover Mastcam-Z Panorama
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
