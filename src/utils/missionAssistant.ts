import {
  AssistantMessage,
  LayerConfig,
  RouteAnalysis,
  SciencePOI,
  SiteDataset,
  Waypoint,
} from '../types/mission';

function nowUtcLabel(): string {
  const d = new Date();
  return d.toISOString().slice(11, 19) + ' UTC';
}

export function generateAssistantResponse(params: {
  query: string;
  site: SiteDataset;
  layers: LayerConfig[];
  waypoints: Waypoint[];
  analysis: RouteAnalysis;
  selectedPoi: SciencePOI | null;
}): AssistantMessage {
  const { query, site, layers, waypoints, analysis, selectedPoi } = params;
  const q = query.toLowerCase();

  const activeLayerNames = layers
    .filter((l) => l.enabled)
    .map((l) => `${l.label} (${l.source})`)
    .join(', ');

  const criticalHazards = analysis.detectedHazards.filter((h) => h.severity === 'critical');
  const cautionHazards = analysis.detectedHazards.filter((h) => h.severity === 'caution');

  // 1. Hazards query
  if (q.includes('hazard') || q.includes('risk') || q.includes('slope') || q.includes('safe')) {
    if (q.includes('suggest') || q.includes('reroute') || q.includes('safer')) {
      const hazardList =
        analysis.detectedHazards.length > 0
          ? analysis.detectedHazards.map((h) => `${h.name} (${h.maxSlopeDeg}° · ${h.datasetId})`).join('; ')
          : 'No active zone intersections on current track';

      const bedrockNames = site.thermalPatches
        .filter((t) => t.classification === 'bedrock')
        .map((t) => `${t.label} (${t.tiu} tiu)`)
        .join(', ');

      return {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        timestamp: nowUtcLabel(),
        datasetFacts: [
          `Site: ${site.name} (${site.regionLabel}) · Sol ${site.sol}.`,
          `Detected route hazards: ${hazardList}.`,
          `THEMIS high-thermal-inertia exposed bedrock corridors available: ${bedrockNames || 'Eastern flank sandstone shelf'}.`,
          `Current traverse metrics: ${analysis.totalDistanceKm} km · Max slope ${analysis.maxSlopeDeg}° · Est. O2 burn ${analysis.o2ConsumptionPct}%.`,
        ],
        synthesisNotes:
          analysis.safetyStatus === 'NOMINAL'
            ? [
                `Current ${waypoints.length}-waypoint corridor stays within the <15° EVA suit slope limit and avoids low-TI sand traps.`,
                `Recommend maintaining current bedrock track with Curiosity-II Scout Rover 250 m ahead for real-time Hazcam verification.`,
              ]
            : [
                `Reroute recommended: insert an intermediate bedrock spur waypoint to bypass ${
                  criticalHazards[0]?.name || cautionHazards[0]?.name || 'steep unconsolidated sand'
                }.`,
                `The AI-Optimized Safe Bedrock Route reduces peak slope below 14.5°, cuts boot sinkage slip penalties, and preserves all primary CRISM science stops.`,
              ],
        suggestedRerouteAvailable: analysis.safetyStatus !== 'NOMINAL',
        rerouteLabel: 'Apply Safe Bedrock Reroute',
      };
    }

    const segWarnings = analysis.segments
      .filter((s) => s.isHazard)
      .map(
        (s) =>
          `Leg ${s.index + 1} (${s.fromName} → ${s.toName}): ${s.maxSlopeDeg}° max slope, ${s.minThermalInertia} tiu min TI`
      );

    return {
      id: `ai-${Date.now()}`,
      role: 'assistant',
      timestamp: nowUtcLabel(),
      datasetFacts: [
        `Active layers inspected: ${activeLayerNames}.`,
        ...(segWarnings.length > 0
          ? segWarnings
          : [`All ${analysis.segments.length} route segments measure <15° slope across HiRISE DTM.`]),
        ...(analysis.detectedHazards.map(
          (h) => `[${h.datasetId}] ${h.name}: ${h.maxSlopeDeg}° (${h.surfaceType}).`
        )),
      ],
      synthesisNotes:
        analysis.safetyStatus === 'CRITICAL HAZARD'
          ? [
              `CRITICAL EVA ENVELOPE VIOLATION: Route intersects ${criticalHazards
                .map((h) => h.name)
                .join(', ')}. Exceeding 22° on loose regolith elevates PLSS metabolic O2 draw by ~28% and risks unrecoverable ankle/boot shear.`,
              `Use the Safe Bedrock Route option below to divert onto high-TI exposed sandstone.`,
            ]
          : analysis.safetyStatus === 'CAUTION'
          ? [
              `CAUTION: Marginal slope/sand conditions detected. EVA suit traction remains viable at reduced pace (+12% O2 burn), but Curiosity-II Scout lead is advised.`,
            ]
          : [
              `NOMINAL: Zero critical or caution hazard intersections along the planned ${analysis.totalDistanceKm} km traverse.`,
            ],
      suggestedRerouteAvailable: analysis.safetyStatus !== 'NOMINAL',
      rerouteLabel: 'Apply Suggested Reroute',
    };
  }

  // 2. CRISM Mineralogy query
  if (q.includes('crism') || q.includes('mineral') || q.includes('spectral') || q.includes('clay') || q.includes('hematite') || q.includes('sulfate')) {
    const targetMinerals = site.minerals.map(
      (m) => `[${m.datasetId}] ${m.name} (${m.mineralClass}, ${m.formula}): diagnostic ${m.wavelengthNm}.`
    );
    return {
      id: `ai-${Date.now()}`,
      role: 'assistant',
      timestamp: nowUtcLabel(),
      datasetFacts: [
        ...targetMinerals,
        `Curiosity-II Scout (${site.rover.callsign}) Mastcam-Z spectral verification: ${site.rover.mastcamStatus}.`,
      ],
      synthesisNotes: [
        `The stratigraphic sequence at ${site.shortName} captures a major planetary paleoclimate shift: aqueous iron oxidation (hematite) and neutral lake clays transition upward into evaporitic hydrated sulfates.`,
        `Prioritize core sampling along exposed high-TI bedrock ledges where wind scour keeps dust cover below 150 μm, maximizing clean Raman/LIBS signal-to-noise.`,
      ],
    };
  }

  // 3. Scientific interest / site significance query
  if (q.includes('scientific') || q.includes('interesting') || q.includes('why') || q.includes('target')) {
    const focusPoi = selectedPoi || site.pois[0];
    return {
      id: `ai-${Date.now()}`,
      role: 'assistant',
      timestamp: nowUtcLabel(),
      datasetFacts: [
        site.siteScienceSummary,
        ...(focusPoi
          ? [
              `Primary Target [${focusPoi.datasetId} / ${focusPoi.hiRiseId}]: ${focusPoi.name} at ${focusPoi.elevationM} m (${focusPoi.mineralTag}).`,
              `Empirical Context: ${focusPoi.significance}`,
            ]
          : []),
      ],
      synthesisNotes: [
        `Connecting ${waypoints.map((w) => w.name).join(' → ')} creates a continuous stratigraphic transect across ${site.minerals.length} distinct mineralogical units.`,
        analysis.safetyStatus !== 'NOMINAL'
          ? `Note: your current direct path crosses ${analysis.detectedHazards[0]?.name}. Switching to the bedrock spur preserves all science targets with <14.5° max slope.`
          : `Route safety is nominal (${analysis.maxSlopeDeg}° peak), allowing full 45-minute sample extraction windows at each station.`,
      ],
      suggestedRerouteAvailable: analysis.safetyStatus !== 'NOMINAL',
      rerouteLabel: 'Apply Safe Bedrock Reroute',
    };
  }

  // 4. General mission assistant query
  return {
    id: `ai-${Date.now()}`,
    role: 'assistant',
    timestamp: nowUtcLabel(),
    datasetFacts: [
      `Active Site: ${site.name} · ${waypoints.length} waypoints · ${analysis.totalDistanceKm} km total traverse.`,
      `Elevation Envelope: ${site.minElevM} m to ${site.maxElevM} m | Route Gain: +${analysis.totalElevGainM} m | Peak Slope: ${analysis.maxSlopeDeg}°.`,
      `Scout Telemetry (${site.rover.callsign}): ${site.rover.telemetryNote}`,
    ],
    synthesisNotes: [
      `Suit PLSS forecast indicates ${analysis.o2ConsumptionPct}% O2 and ${analysis.batteryConsumptionPct}% battery draw over ${analysis.totalTimeMin} min EVA duration.`,
      analysis.safetyStatus === 'CRITICAL HAZARD'
        ? `Immediate recommendation: apply the AI-Optimized Safe Bedrock Route to clear ${criticalHazards[0]?.name || 'the 22°+ slope hazard'} before initiating Marswalk HUD.`
        : `All telemetry channels nominal. You can drag waypoints on the tactical canvas or switch to MARSWALK HUD to begin traverse simulation.`,
    ],
    suggestedRerouteAvailable: analysis.safetyStatus !== 'NOMINAL',
    rerouteLabel: 'Apply Suggested Reroute',
  };
}
