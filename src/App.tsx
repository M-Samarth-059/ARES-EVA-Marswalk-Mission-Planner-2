import React, { useEffect, useMemo, useState } from 'react';
import { Box, FileText, Navigation, SlidersHorizontal } from 'lucide-react';
import { DEFAULT_LAYERS, MARS_SITES } from './data/marsSites';
import {
  AssistantMessage,
  FieldObservation,
  LayerConfig,
  LayerId,
  SciencePOI,
  SiteId,
  TrnScenarioId,
  Waypoint,
} from './types/mission';
import {
  computeRouteAnalysis,
  interpolatePositionAlongRoute,
  sampleTerrainAt,
} from './utils/terrainEngine';
import {
  computeTrnGuidance,
  getDestinationOptions,
  getScenarioPreset,
  TrnSimulationConfig,
} from './utils/trnEngine';
import { generateAssistantResponse } from './utils/missionAssistant';
import { TacticalMapCanvas, MapToolMode } from './components/TacticalMapCanvas';
import { TacticalMap3D } from './components/TacticalMap3D';
import { ElevationProfileChart } from './components/ElevationProfileChart';
import { LeftControlSidebar } from './components/LeftControlSidebar';
import { RightAnalysisSidebar, RightTabId } from './components/RightAnalysisSidebar';
import { MarswalkHudOverlay } from './components/MarswalkHudOverlay';
import { ObservationModal } from './components/ObservationModal';
import { MissionReportModal } from './components/MissionReportModal';

type MobilePanelTab = 'map' | 'controls' | 'analysis';

export default function App() {
  const [siteId, setSiteId] = useState<SiteId>('gale');
  const site = MARS_SITES[siteId];

  const [layers, setLayers] = useState<LayerConfig[]>(DEFAULT_LAYERS);

  // Per-site waypoints & observations so switching sites preserves user edits
  const [waypointsBySite, setWaypointsBySite] = useState<Record<SiteId, Waypoint[]>>({
    gale: MARS_SITES.gale.defaultWaypoints,
    jezero: MARS_SITES.jezero.defaultWaypoints,
    valles: MARS_SITES.valles.defaultWaypoints,
  });

  const [observationsBySite, setObservationsBySite] = useState<Record<SiteId, FieldObservation[]>>({
    gale: [],
    jezero: [],
    valles: [],
  });

  const waypoints = waypointsBySite[siteId];
  const observations = observationsBySite[siteId];

  const [showSafeComparison, setShowSafeComparison] = useState(false);
  const [mapViewMode, setMapViewMode] = useState<'3d' | '2d'>('3d');
  const [mapTool, setMapTool] = useState<MapToolMode>('select');
  const [rightTab, setRightTab] = useState<RightTabId>('copilot');
  const [mobileTab, setMobileTab] = useState<MobilePanelTab>('map');

  const [selectedPoi, setSelectedPoi] = useState<SciencePOI | null>(MARS_SITES.gale.pois[0]);
  const [selectedRover, setSelectedRover] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  // Marswalk HUD & TRN Simulation State
  const [marswalkMode, setMarswalkMode] = useState(false);
  const [marswalkProgress, setMarswalkProgress] = useState(0.18);
  const [isPlayingTraverse, setIsPlayingTraverse] = useState(false);
  const [traverseSpeed, setTraverseSpeed] = useState<1 | 5>(1);
  const [selectedDestId, setSelectedDestId] = useState<string | null>(null);
  const [trnSim, setTrnSim] = useState<TrnSimulationConfig>({
    scenario: 'nominal',
    lateralOffsetUnits: 0,
    headingBiasDeg: 0,
    marsSolarHour: 14.35,
    useRoverReference: true,
    visualDegraded: false,
    relocalizeBoost: 0,
  });

  // Modals
  const [logModalCoords, setLogModalCoords] = useState<{ x: number; y: number } | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Real-time Route Physics & Hazard Analysis
  const routeAnalysis = useMemo(
    () => computeRouteAnalysis(site, waypoints),
    [site, waypoints]
  );

  // AI Mission Copilot Messages per site
  const [messagesBySite, setMessagesBySite] = useState<Record<SiteId, AssistantMessage[]>>(() => {
    const initialGale = generateAssistantResponse({
      query: 'What hazards are along my route?',
      site: MARS_SITES.gale,
      layers: DEFAULT_LAYERS,
      waypoints: MARS_SITES.gale.defaultWaypoints,
      analysis: computeRouteAnalysis(MARS_SITES.gale, MARS_SITES.gale.defaultWaypoints),
      selectedPoi: MARS_SITES.gale.pois[0],
    });
    const initialJezero = generateAssistantResponse({
      query: 'What hazards are along my route?',
      site: MARS_SITES.jezero,
      layers: DEFAULT_LAYERS,
      waypoints: MARS_SITES.jezero.defaultWaypoints,
      analysis: computeRouteAnalysis(MARS_SITES.jezero, MARS_SITES.jezero.defaultWaypoints),
      selectedPoi: MARS_SITES.jezero.pois[0],
    });
    const initialValles = generateAssistantResponse({
      query: 'What hazards are along my route?',
      site: MARS_SITES.valles,
      layers: DEFAULT_LAYERS,
      waypoints: MARS_SITES.valles.defaultWaypoints,
      analysis: computeRouteAnalysis(MARS_SITES.valles, MARS_SITES.valles.defaultWaypoints),
      selectedPoi: MARS_SITES.valles.pois[0],
    });
    return {
      gale: [initialGale],
      jezero: [initialJezero],
      valles: [initialValles],
    };
  });

  // Marswalk Base Route Position & TRN Sensor-Fused Guidance
  const astronautState = useMemo(
    () => interpolatePositionAlongRoute(site, waypoints, marswalkProgress),
    [site, waypoints, marswalkProgress]
  );

  const destinationOptions = useMemo(
    () => getDestinationOptions(site, waypoints, astronautState.nextWaypoint),
    [site, waypoints, astronautState.nextWaypoint]
  );

  const roverLayerEnabled = useMemo(
    () => layers.find((l) => l.id === 'rover')?.enabled ?? true,
    [layers]
  );

  const trnGuidance = useMemo(
    () =>
      computeTrnGuidance({
        site,
        waypoints,
        baseRoutePos: astronautState,
        selectedDestId,
        roverLayerEnabled,
        sim: trnSim,
      }),
    [site, waypoints, astronautState, selectedDestId, roverLayerEnabled, trnSim]
  );

  const astronautLiveTerrain = useMemo(
    () => sampleTerrainAt(site, trnGuidance.currentPos.x, trnGuidance.currentPos.y),
    [site, trnGuidance.currentPos.x, trnGuidance.currentPos.y]
  );

  // Marswalk Simulation Playback Loop
  useEffect(() => {
    if (!marswalkMode || !isPlayingTraverse) return;
    let lastTime = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dtSec = (now - lastTime) / 1000;
      lastTime = now;

      setMarswalkProgress((prev) => {
        const rate = traverseSpeed === 5 ? 0.14 : 0.032; // ~31s at 1x, ~7s at 5x
        const next = prev + dtSec * rate;
        if (next >= 1) {
          setIsPlayingTraverse(false);
          setShowReportModal(true);
          return 1;
        }
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [marswalkMode, isPlayingTraverse, traverseSpeed]);

  // Handlers
  const handleSelectSite = (nextId: SiteId) => {
    setSiteId(nextId);
    setSelectedPoi(MARS_SITES[nextId].pois[0] || null);
    setSelectedRover(false);
    setShowSafeComparison(false);
    setMarswalkProgress(0.18);
    setIsPlayingTraverse(false);
    setSelectedDestId(null);
    setTrnSim({
      scenario: 'nominal',
      lateralOffsetUnits: 0,
      headingBiasDeg: 0,
      marsSolarHour: 14.35,
      useRoverReference: true,
      visualDegraded: false,
      relocalizeBoost: 0,
    });
    setMapTool('select');
  };

  const handleSelectTrnScenario = (scenario: TrnScenarioId) => {
    const preset = getScenarioPreset(scenario);
    setIsPlayingTraverse(false);
    setMarswalkProgress(preset.progress);
    setTrnSim({
      scenario,
      lateralOffsetUnits: preset.lateralOffsetUnits,
      headingBiasDeg: preset.headingBiasDeg,
      useRoverReference: preset.useRoverReference,
      visualDegraded: preset.visualDegraded,
      marsSolarHour: preset.marsSolarHour,
      relocalizeBoost: 0,
    });
    if (scenario === 'target-approach' && site.pois[0]) {
      setSelectedDestId(`poi:${site.pois[0].id}`);
    } else if (scenario === 'rover-ref') {
      setSelectedDestId(null);
    }
  };

  const handleSteerOffset = (deltaUnits: number) => {
    setTrnSim((prev) => {
      const nextLat = Math.max(-60, Math.min(60, prev.lateralOffsetUnits + deltaUnits));
      const nextBias = Math.max(-45, Math.min(45, prev.headingBiasDeg - Math.sign(deltaUnits) * 9));
      return {
        ...prev,
        scenario: Math.abs(nextLat) >= 18 ? 'off-course' : prev.scenario,
        lateralOffsetUnits: nextLat,
        headingBiasDeg: nextBias,
      };
    });
  };

  const handleReCenterRoute = () => {
    setTrnSim((prev) => ({
      ...prev,
      scenario: prev.visualDegraded ? 'visual-loss' : 'nominal',
      lateralOffsetUnits: 0,
      headingBiasDeg: 0,
    }));
  };

  const handleRelocalize = () => {
    setIsPlayingTraverse(false);
    setTrnSim((prev) => ({
      ...prev,
      scenario: 'nominal',
      visualDegraded: false,
      headingBiasDeg: 0,
      useRoverReference: true,
      relocalizeBoost: 15,
    }));
  };

  const handleToggleLayer = (id: LayerId) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l))
    );
  };

  const handleChangeLayerOpacity = (id: LayerId, opacity: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, opacity } : l))
    );
  };

  const handleUpdateWaypoint = (id: string, x: number, y: number) => {
    setWaypointsBySite((prev) => ({
      ...prev,
      [siteId]: prev[siteId].map((wp) => (wp.id === id ? { ...wp, x, y } : wp)),
    }));
  };

  const handleAddWaypoint = (x: number, y: number) => {
    const nextNum = waypoints.length + 1;
    const newWp: Waypoint = {
      id: `wp-custom-${Date.now()}`,
      name: `Station ${nextNum}`,
      x,
      y,
      type: 'waypoint',
    };
    setWaypointsBySite((prev) => ({
      ...prev,
      [siteId]: [...prev[siteId], newWp],
    }));
    setMapTool('select');
  };

  const handleDeleteWaypoint = (id: string) => {
    if (waypoints.length <= 2) return;
    setWaypointsBySite((prev) => ({
      ...prev,
      [siteId]: prev[siteId].filter((w) => w.id !== id),
    }));
  };

  const handleResetDemoRoute = () => {
    setWaypointsBySite((prev) => ({
      ...prev,
      [siteId]: site.defaultWaypoints,
    }));
    setShowSafeComparison(false);
  };

  const handleApplySafeRoute = () => {
    setWaypointsBySite((prev) => ({
      ...prev,
      [siteId]: site.safeBedrockWaypoints,
    }));
    setShowSafeComparison(false);
    const confirmMsg: AssistantMessage = {
      id: `ai-reroute-${Date.now()}`,
      role: 'assistant',
      timestamp: new Date().toISOString().slice(11, 19) + ' UTC',
      datasetFacts: [
        `Applied ${site.safeBedrockWaypoints.length}-waypoint Safe Bedrock Traverse for ${site.shortName}.`,
        `THEMIS exposed bedrock corridor maintains slope <14.8° across all legs.`,
      ],
      synthesisNotes: [
        `Hazard intersection cleared. Route status upgraded to NOMINAL while retaining all primary CRISM science stops.`,
      ],
    };
    setMessagesBySite((prev) => ({
      ...prev,
      [siteId]: [...prev[siteId], confirmMsg],
    }));
  };

  const handleSendPrompt = (prompt: string) => {
    const userMsg: AssistantMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      timestamp: new Date().toISOString().slice(11, 19) + ' UTC',
      text: prompt,
    };
    const reply = generateAssistantResponse({
      query: prompt,
      site,
      layers,
      waypoints,
      analysis: routeAnalysis,
      selectedPoi,
    });
    setMessagesBySite((prev) => ({
      ...prev,
      [siteId]: [...prev[siteId], userMsg, reply],
    }));
    setRightTab('copilot');
  };

  const handleSaveObservation = (obs: FieldObservation) => {
    setObservationsBySite((prev) => ({
      ...prev,
      [siteId]: [obs, ...prev[siteId]],
    }));
    setLogModalCoords(null);
    setMapTool('select');
    if (!marswalkMode) {
      setRightTab('science');
      setSelectedRover(false);
    }
  };

  const handleToggleTask = (taskKey: string) => {
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskKey)) next.delete(taskKey);
      else next.add(taskKey);
      return next;
    });
  };

  const totalSiteTasks = site.pois.reduce((sum, p) => sum + p.tasks.length, 0);
  const completedSiteTasks = site.pois.reduce(
    (sum, p) =>
      sum + p.tasks.filter((_, idx) => completedTasks.has(`${p.id}-task-${idx}`)).length,
    0
  );

  const toggleMarswalkHud = () => {
    if (!marswalkMode) {
      setMarswalkMode(true);
      setMapTool('select');
      if (marswalkProgress >= 1) setMarswalkProgress(0);
    } else {
      setMarswalkMode(false);
      setIsPlayingTraverse(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0B0E14] text-[#DEE2F1] flex flex-col">
      {/* TOP BAR: Clean 3-Zone Aerospace Command Ribbon */}
      <header className="h-12 shrink-0 bg-[#121721] border-b border-[#1E293B] px-2.5 sm:px-4 flex items-center justify-between gap-2 sm:gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <span className="text-sm sm:text-base font-bold tracking-tight text-[#DEE2F1]">
            ARES-EVA
          </span>
          <span className="hidden md:inline text-xs text-[#86948A]">
            · Marswalk Mission Planner
          </span>
        </div>

        {/* Zone 2: Site Switcher & Operational Mode */}
        <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar min-w-0">
          {(['gale', 'jezero', 'valles'] as SiteId[]).map((id) => {
            const active = siteId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectSite(id)}
                className={`px-2 sm:px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 border transition-colors ${
                  active
                    ? 'bg-[#1A2230] text-[#7BD0FF] border-[#38BDF8]/70'
                    : 'text-[#BBCABF] hover:text-white border-transparent hover:border-[#232B3A]'
                }`}
              >
                {MARS_SITES[id].shortName}
              </button>
            );
          })}

          <div className="h-4 w-px bg-[#232B3A] mx-1 hidden sm:block shrink-0" />

          <button
            type="button"
            onClick={toggleMarswalkHud}
            className={`px-2 sm:px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1 whitespace-nowrap shrink-0 border transition-colors ${
              marswalkMode
                ? 'bg-[#10B981] text-[#0B0E14] border-[#10B981]'
                : 'bg-[#1A2230] text-[#4EDEA3] border-[#10B981]/50 hover:border-[#10B981]'
            }`}
          >
            <Navigation className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">
              {marswalkMode ? 'MARSWALK HUD: ACTIVE' : 'MARSWALK HUD'}
            </span>
            <span className="sm:hidden">{marswalkMode ? 'HUD ON' : 'HUD'}</span>
          </button>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="px-2.5 sm:px-3 py-1.5 rounded bg-[#10B981] hover:bg-[#4EDEA3] text-[#0B0E14] text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mission Report</span>
            <span className="sm:hidden">Report</span>
          </button>
        </div>
      </header>

      {/* MOBILE / TABLET PANEL SWITCHER (hidden on lg+) */}
      {!marswalkMode && (
        <div className="lg:hidden px-2.5 py-1.5 bg-[#0B0E14] border-b border-[#1E293B] grid grid-cols-3 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('map')}
            className={`py-1.5 rounded text-[11px] font-semibold border ${
              mobileTab === 'map'
                ? 'bg-[#1A2230] border-[#38BDF8] text-[#7BD0FF]'
                : 'bg-[#121721] border-[#1E293B] text-[#86948A]'
            }`}
          >
            Tactical Map
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('controls')}
            className={`py-1.5 rounded text-[11px] font-semibold border flex items-center justify-center gap-1 ${
              mobileTab === 'controls'
                ? 'bg-[#1A2230] border-[#10B981] text-[#6FFBAE]'
                : 'bg-[#121721] border-[#1E293B] text-[#86948A]'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>Layers &amp; Route</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('analysis')}
            className={`py-1.5 rounded text-[11px] font-semibold border ${
              mobileTab === 'analysis'
                ? 'bg-[#1A2230] border-[#A855F7] text-[#DDB7FF]'
                : 'bg-[#121721] border-[#1E293B] text-[#86948A]'
            }`}
          >
            TRN &amp; Science
          </button>
        </div>
      )}

      {/* MAIN WORKSPACE */}
      <main className="flex-1 min-h-0 p-2.5 flex flex-col lg:flex-row gap-2.5 overflow-hidden">
        {/* LEFT SIDEBAR: Layers, Route Budget, Waypoints */}
        {!marswalkMode && (
          <div
            className={`${
              mobileTab === 'controls' ? 'flex' : 'hidden'
            } lg:flex flex-col min-h-0 h-full`}
          >
            <LeftControlSidebar
              site={site}
              layers={layers}
              waypoints={waypoints}
              analysis={routeAnalysis}
              showSafeComparison={showSafeComparison}
              isAddingWaypoint={mapTool === 'add-waypoint'}
              onToggleLayer={handleToggleLayer}
              onChangeLayerOpacity={handleChangeLayerOpacity}
              onDeleteWaypoint={handleDeleteWaypoint}
              onToggleAddWaypoint={() =>
                setMapTool((t) => (t === 'add-waypoint' ? 'select' : 'add-waypoint'))
              }
              onResetDemoRoute={handleResetDemoRoute}
              onToggleSafeComparison={() => setShowSafeComparison((v) => !v)}
              onApplySafeRoute={handleApplySafeRoute}
            />
          </div>
        )}

        {/* CENTER STAGE: Tactical Multi-Layered Canvas + Docked Elevation Profile */}
        <section
          className={`${
            marswalkMode || mobileTab === 'map' ? 'flex' : 'hidden'
          } lg:flex flex-1 min-w-0 min-h-0 flex-col gap-2.5`}
        >
          <div className="relative flex-1 min-h-0 flex flex-col">
            {(() => {
              const viewModeToggle = (
                <button
                  type="button"
                  onClick={() => setMapViewMode((m) => (m === '3d' ? '2d' : '3d'))}
                  title={mapViewMode === '3d' ? 'Switch to 2D Topographic Map' : 'Switch to 3D Terrain Map'}
                  className="px-2 py-1 text-[11px] font-mono-tabular font-semibold rounded-xs flex items-center gap-1 whitespace-nowrap shrink-0 border-l border-[#232B3A] ml-0.5 text-[#7BD0FF] hover:bg-[#1A2230] transition-colors"
                >
                  <Box className="w-3 h-3" />
                  <span>{mapViewMode === '3d' ? '2D Map' : '3D Terrain'}</span>
                </button>
              );

              const sharedMapProps = {
                site,
                layers,
                waypoints,
                routeAnalysis,
                showSafeComparison,
                observations,
                selectedPoiId: selectedPoi?.id || null,
                selectedRover,
                marswalkMode,
                astronautPos: {
                  x: trnGuidance.currentPos.x,
                  y: trnGuidance.currentPos.y,
                  headingDeg: trnGuidance.estimatedHeadingDeg,
                },
                trnGuidance,
                mapTool,
                onChangeMapTool: setMapTool,
                onUpdateWaypoint: handleUpdateWaypoint,
                onAddWaypoint: handleAddWaypoint,
                onSelectPoi: (poi: SciencePOI) => {
                  setSelectedPoi(poi);
                  setSelectedRover(false);
                  setRightTab('science');
                  setMobileTab('analysis');
                },
                onSelectRover: () => {
                  setSelectedRover(true);
                  setRightTab('science');
                  setMobileTab('analysis');
                },
                onSelectObservation: () => {
                  setSelectedRover(false);
                  setRightTab('science');
                  setMobileTab('analysis');
                },
                onRequestLogAt: (x: number, y: number) => setLogModalCoords({ x, y }),
                onApplySafeRoute: handleApplySafeRoute,
                onInspectHazards: () => {
                  setRightTab('hazards');
                  setMobileTab('analysis');
                },
                viewModeToggle,
              };

              return mapViewMode === '3d' ? (
                <TacticalMap3D {...sharedMapProps} />
              ) : (
                <TacticalMapCanvas {...sharedMapProps} />
              );
            })()}

            {/* MARSWALK HUD OVERLAY */}
            {marswalkMode && (
              <MarswalkHudOverlay
                site={site}
                analysis={routeAnalysis}
                progress={marswalkProgress}
                isPlaying={isPlayingTraverse}
                speed={traverseSpeed}
                astronautTerrain={astronautLiveTerrain}
                trnGuidance={trnGuidance}
                destinationOptions={destinationOptions}
                selectedDestId={selectedDestId}
                activeScenario={trnSim.scenario}
                onSelectDestination={setSelectedDestId}
                onSelectScenario={handleSelectTrnScenario}
                onSteerOffset={handleSteerOffset}
                onReCenterRoute={handleReCenterRoute}
                onRelocalize={handleRelocalize}
                onApplySafeRoute={handleApplySafeRoute}
                onTogglePlay={() => {
                  if (marswalkProgress >= 1) setMarswalkProgress(0);
                  setIsPlayingTraverse((p) => !p);
                }}
                onToggleSpeed={() => setTraverseSpeed((s) => (s === 1 ? 5 : 1))}
                onScrub={(val) => {
                  setIsPlayingTraverse(false);
                  setMarswalkProgress(val);
                }}
                onReset={() => {
                  setIsPlayingTraverse(false);
                  setMarswalkProgress(0);
                }}
                onLogDiscovery={() =>
                  setLogModalCoords({
                    x: trnGuidance.currentPos.x,
                    y: trnGuidance.currentPos.y,
                  })
                }
                onOpenReport={() => setShowReportModal(true)}
                onExitHud={toggleMarswalkHud}
              />
            )}
          </div>

          <div className={marswalkMode ? 'hidden sm:block' : ''}>
            <ElevationProfileChart
              analysis={routeAnalysis}
              marswalkProgress={marswalkMode ? marswalkProgress : null}
            />
          </div>
        </section>

        {/* RIGHT SIDEBAR: AI Copilot, TRN Nav, Science Targets, Hazards & Telemetry */}
        {!marswalkMode && (
          <div
            className={`${
              mobileTab === 'analysis' ? 'flex' : 'hidden'
            } lg:flex flex-col min-h-0 h-full`}
          >
            <RightAnalysisSidebar
              activeTab={rightTab}
              onChangeTab={setRightTab}
              site={site}
              analysis={routeAnalysis}
              messages={messagesBySite[siteId]}
              onSendPrompt={handleSendPrompt}
              onApplySafeRoute={handleApplySafeRoute}
              selectedPoi={selectedPoi}
              onSelectPoi={setSelectedPoi}
              selectedRover={selectedRover}
              onSelectRover={setSelectedRover}
              observations={observations}
              completedTaskIds={completedTasks}
              onToggleTask={handleToggleTask}
              trnGuidance={trnGuidance}
              trnSim={trnSim}
              trnProgress={marswalkProgress}
              destinationOptions={destinationOptions}
              selectedDestId={selectedDestId}
              onSelectDestination={setSelectedDestId}
              onSelectScenario={handleSelectTrnScenario}
              onScrubTrnProgress={(val) => {
                setIsPlayingTraverse(false);
                setMarswalkProgress(val);
              }}
              onSteerOffset={handleSteerOffset}
              onReCenterRoute={handleReCenterRoute}
              onToggleRoverRef={() =>
                setTrnSim((p) => ({ ...p, useRoverReference: !p.useRoverReference }))
              }
              onToggleVisualDegraded={() =>
                setTrnSim((p) => ({
                  ...p,
                  visualDegraded: !p.visualDegraded,
                  relocalizeBoost: 0,
                }))
              }
              onChangeSolarHour={(hour) =>
                setTrnSim((p) => ({ ...p, marsSolarHour: hour }))
              }
              onRelocalize={handleRelocalize}
              onEnterMarswalkHud={() => {
                setMarswalkMode(true);
                setMapTool('select');
              }}
            />
          </div>
        )}
      </main>

      {/* MODALS */}
      {logModalCoords && (
        <ObservationModal
          site={site}
          coords={logModalCoords}
          onClose={() => {
            setLogModalCoords(null);
            setMapTool('select');
          }}
          onSave={handleSaveObservation}
        />
      )}

      {showReportModal && (
        <MissionReportModal
          site={site}
          waypoints={waypoints}
          analysis={routeAnalysis}
          observations={observations}
          completedTaskCount={completedSiteTasks}
          totalTaskCount={totalSiteTasks}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}
