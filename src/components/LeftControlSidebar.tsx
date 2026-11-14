import React from 'react';
import {
  GitCompare,
  Layers,
  MapPinPlus,
  RotateCcw,
  Route,
  Trash2,
} from 'lucide-react';
import {
  LayerConfig,
  LayerId,
  RouteAnalysis,
  SiteDataset,
  Waypoint,
} from '../types/mission';
import { sampleTerrainAt } from '../utils/terrainEngine';

interface LeftControlSidebarProps {
  site: SiteDataset;
  layers: LayerConfig[];
  waypoints: Waypoint[];
  analysis: RouteAnalysis;
  showSafeComparison: boolean;
  isAddingWaypoint: boolean;
  onToggleLayer: (id: LayerId) => void;
  onChangeLayerOpacity: (id: LayerId, opacity: number) => void;
  onDeleteWaypoint: (id: string) => void;
  onToggleAddWaypoint: () => void;
  onResetDemoRoute: () => void;
  onToggleSafeComparison: () => void;
  onApplySafeRoute: () => void;
}

export const LeftControlSidebar: React.FC<LeftControlSidebarProps> = ({
  site,
  layers,
  waypoints,
  analysis,
  showSafeComparison,
  isAddingWaypoint,
  onToggleLayer,
  onChangeLayerOpacity,
  onDeleteWaypoint,
  onToggleAddWaypoint,
  onResetDemoRoute,
  onToggleSafeComparison,
  onApplySafeRoute,
}) => {
  const statusDisplay =
    analysis.safetyStatus === 'CRITICAL HAZARD'
      ? {
          glyph: '✖',
          text: 'CRITICAL HAZARD',
          cls: 'text-[#EF4444] border-[#EF4444]/60 bg-[#EF4444]/10',
        }
      : analysis.safetyStatus === 'CAUTION'
      ? {
          glyph: '▲',
          text: 'CAUTION',
          cls: 'text-[#F59E0B] border-[#F59E0B]/60 bg-[#F59E0B]/10',
        }
      : {
          glyph: '●',
          text: 'NOMINAL',
          cls: 'text-[#10B981] border-[#10B981]/60 bg-[#10B981]/10',
        };

  return (
    <aside className="w-full lg:w-[308px] shrink-0 bg-[#121721] border border-[#1E293B] rounded flex flex-col overflow-hidden">
      <div className="overflow-y-auto flex-1 divide-y divide-[#1E293B]">
        {/* Section 1: EVA Route Budget & Safety */}
        <section className="p-3">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#BBCABF]">
              EVA Traverse Budget
            </span>
            <span
              className={`px-2 py-0.5 text-[10px] font-mono-tabular font-bold border rounded whitespace-nowrap shrink-0 ${statusDisplay.cls}`}
            >
              {statusDisplay.glyph} {statusDisplay.text}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0B0E14] border border-[#1E293B] rounded px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-[#86948A]">Distance</div>
              <div className="text-lg font-mono-tabular font-bold text-[#DEE2F1] mt-0.5">
                {analysis.totalDistanceKm.toFixed(2)}
                <span className="text-[11px] font-normal text-[#86948A] ml-1">km</span>
              </div>
            </div>
            <div className="bg-[#0B0E14] border border-[#1E293B] rounded px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-[#86948A]">Est. Time</div>
              <div className="text-lg font-mono-tabular font-bold text-[#DEE2F1] mt-0.5">
                {analysis.totalTimeMin}
                <span className="text-[11px] font-normal text-[#86948A] ml-1">min</span>
              </div>
            </div>
            <div className="bg-[#0B0E14] border border-[#1E293B] rounded px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-[#86948A]">Suit O2 Draw</div>
              <div
                className={`text-lg font-mono-tabular font-bold mt-0.5 ${
                  analysis.o2ConsumptionPct > 65 ? 'text-[#F59E0B]' : 'text-[#4EDEA3]'
                }`}
              >
                {analysis.o2ConsumptionPct.toFixed(1)}
                <span className="text-[11px] font-normal text-[#86948A] ml-0.5">%</span>
              </div>
            </div>
            <div className="bg-[#0B0E14] border border-[#1E293B] rounded px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wider text-[#86948A]">Suit Battery</div>
              <div
                className={`text-lg font-mono-tabular font-bold mt-0.5 ${
                  analysis.batteryConsumptionPct > 65 ? 'text-[#F59E0B]' : 'text-[#7BD0FF]'
                }`}
              >
                {analysis.batteryConsumptionPct.toFixed(1)}
                <span className="text-[11px] font-normal text-[#86948A] ml-0.5">%</span>
              </div>
            </div>
          </div>

          {/* Compare & Apply Safe Route */}
          <div className="mt-2.5 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={onToggleSafeComparison}
              className={`w-full px-3 py-1.5 rounded text-[11px] font-medium border flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                showSafeComparison
                  ? 'bg-[#10B981]/15 border-[#10B981] text-[#6FFBAE]'
                  : 'bg-[#1A2230] border-[#232B3A] text-[#DEE2F1] hover:border-[#38BDF8]'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>
                {showSafeComparison ? 'Hide Safe Bedrock Overlay' : 'Compare Safe Bedrock Route'}
              </span>
            </button>

            {analysis.safetyStatus !== 'NOMINAL' && (
              <button
                type="button"
                onClick={onApplySafeRoute}
                className="w-full px-3 py-1.5 rounded text-[11px] font-semibold uppercase tracking-wide bg-[#10B981] text-[#0B0E14] hover:bg-[#4EDEA3] flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <Route className="w-3.5 h-3.5" />
                <span>Apply AI Safe Route</span>
              </button>
            )}
          </div>
        </section>

        {/* Section 2: Orbital & Tactical Data Layers */}
        <section className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#7BD0FF]" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#BBCABF]">
                Orbital Data Layers
              </span>
            </div>
            <span className="text-[10px] font-mono-tabular text-[#86948A]">
              {layers.filter((l) => l.enabled).length}/{layers.length} ACTIVE
            </span>
          </div>

          <div className="space-y-2">
            {layers.map((layer) => (
              <div
                key={layer.id}
                className="bg-[#0B0E14] border border-[#1E293B] rounded px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={layer.enabled}
                      onChange={() => onToggleLayer(layer.id)}
                      className="accent-[#10B981] w-3.5 h-3.5 rounded-xs cursor-pointer shrink-0"
                    />
                    <span className="text-xs font-medium text-[#DEE2F1] truncate">
                      {layer.label}
                    </span>
                  </label>
                  <span className="text-[10px] font-mono-tabular text-[#86948A] shrink-0">
                    {layer.enabled ? `${layer.opacity}%` : 'OFF'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <span className="text-[10px] font-mono-tabular text-[#86948A] truncate">
                    {layer.source}
                  </span>
                  {layer.enabled && (
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={layer.opacity}
                      onChange={(e) => onChangeLayerOpacity(layer.id, Number(e.target.value))}
                      aria-label={`${layer.label} opacity`}
                      className="tactical-slider w-24 shrink-0"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Waypoint Sequence */}
        <section className="p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#BBCABF]">
              Waypoints ({waypoints.length})
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onToggleAddWaypoint}
                className={`px-2 py-1 rounded text-[10px] font-medium border flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                  isAddingWaypoint
                    ? 'bg-[#10B981]/20 border-[#10B981] text-[#6FFBAE]'
                    : 'bg-[#1A2230] border-[#232B3A] text-[#DEE2F1] hover:border-[#38BDF8]'
                }`}
              >
                <MapPinPlus className="w-3 h-3" />
                <span>{isAddingWaypoint ? 'Click Map' : 'Add'}</span>
              </button>
              <button
                type="button"
                onClick={onResetDemoRoute}
                title="Reset to default site route"
                className="p-1 rounded bg-[#1A2230] border border-[#232B3A] text-[#BBCABF] hover:text-white hover:border-[#38BDF8] transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {waypoints.map((wp, idx) => {
              const terrain = sampleTerrainAt(site, wp.x, wp.y);
              return (
                <div
                  key={wp.id}
                  className="bg-[#0B0E14] border border-[#1E293B] rounded px-2.5 py-1.5 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-5 h-5 rounded-xs text-[10px] font-mono-tabular font-bold flex items-center justify-center shrink-0 ${
                        idx === 0
                          ? 'bg-[#10B981] text-[#0B0E14]'
                          : 'bg-[#1A2230] text-[#7BD0FF] border border-[#38BDF8]/40'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#DEE2F1] truncate">{wp.name}</div>
                      <div className="text-[10px] font-mono-tabular text-[#86948A]">
                        {terrain.elevationM}m · {terrain.slopeDeg}° slope
                      </div>
                    </div>
                  </div>
                  {waypoints.length > 2 && (
                    <button
                      type="button"
                      onClick={() => onDeleteWaypoint(wp.id)}
                      aria-label={`Remove ${wp.name}`}
                      className="p-1 text-[#86948A] hover:text-[#EF4444] transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] font-mono-tabular text-[#86948A]">
            Drag markers directly on the map to adjust path geometry.
          </p>
        </section>
      </div>
    </aside>
  );
};
