import React, { useState } from 'react';
import { ProfileSample, RouteAnalysis } from '../types/mission';

interface ElevationProfileChartProps {
  analysis: RouteAnalysis;
  marswalkProgress?: number | null; // 0..1 when in Marswalk mode
}

export const ElevationProfileChart: React.FC<ElevationProfileChartProps> = ({
  analysis,
  marswalkProgress,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const points = analysis.profile;

  const width = 880;
  const height = 112;
  const padL = 48;
  const padR = 16;
  const padT = 14;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  if (points.length < 2) {
    return (
      <div className="h-[146px] bg-[#121721] border border-[#1E293B] rounded px-4 py-3 flex items-center justify-center text-xs font-mono-tabular text-[#86948A]">
        Add at least 2 waypoints to compute the MOLA/HiRISE Elevation &amp; Slope Profile.
      </div>
    );
  }

  const maxDist = Math.max(0.05, points[points.length - 1].distKm);
  const elevs = points.map((p) => p.elevationM);
  const minElev = Math.min(...elevs) - 12;
  const maxElev = Math.max(...elevs) + 12;
  const elevRange = Math.max(10, maxElev - minElev);

  const toX = (distKm: number) => padL + (distKm / maxDist) * plotW;
  const toY = (elevM: number) => padT + plotH - ((elevM - minElev) / elevRange) * plotH;

  const areaPath =
    `M ${toX(points[0].distKm)} ${padT + plotH} ` +
    points.map((p) => `L ${toX(p.distKm).toFixed(1)} ${toY(p.elevationM).toFixed(1)}`).join(' ') +
    ` L ${toX(points[points.length - 1].distKm)} ${padT + plotH} Z`;

  const hoverPoint: ProfileSample | null =
    hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : null;

  return (
    <div className="h-[154px] bg-[#121721] border border-[#1E293B] rounded px-3 py-2 flex flex-col justify-between shrink-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#DEE2F1]">
            Elevation &amp; Slope Profile (HiRISE DTM)
          </h3>
          <span className="text-[11px] font-mono-tabular text-[#86948A]">
            Gain +{analysis.totalElevGainM}m / Loss -{analysis.totalElevLossM}m
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px] font-mono-tabular">
          {hoverPoint ? (
            <span className="text-[#7BD0FF]">
              KM {hoverPoint.distKm.toFixed(2)} · ELEV {hoverPoint.elevationM}m ·{' '}
              <span
                className={
                  hoverPoint.slopeDeg >= 22
                    ? 'text-[#EF4444] font-semibold'
                    : hoverPoint.slopeDeg >= 15
                    ? 'text-[#F59E0B] font-semibold'
                    : 'text-[#4EDEA3]'
                }
              >
                SLOPE {hoverPoint.slopeDeg.toFixed(1)}°
              </span>{' '}
              · TI {hoverPoint.thermalInertia} tiu
            </span>
          ) : (
            <span className="text-[#86948A]">
              Peak Gradient:{' '}
              <strong
                className={
                  analysis.maxSlopeDeg >= 22
                    ? 'text-[#EF4444]'
                    : analysis.maxSlopeDeg >= 15
                    ? 'text-[#F59E0B]'
                    : 'text-[#4EDEA3]'
                }
              >
                {analysis.maxSlopeDeg.toFixed(1)}°
              </strong>
            </span>
          )}
        </div>
      </div>

      <div className="relative w-full h-[112px]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible"
          onMouseLeave={() => setHoverIdx(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * width;
            const targetDist = Math.max(0, Math.min(maxDist, ((relX - padL) / plotW) * maxDist));
            let bestIdx = 0;
            let bestDiff = Infinity;
            points.forEach((p, idx) => {
              const d = Math.abs(p.distKm - targetDist);
              if (d < bestDiff) {
                bestDiff = d;
                bestIdx = idx;
              }
            });
            setHoverIdx(bestIdx);
          }}
        >
          <defs>
            <linearGradient id="elevFillGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Horizontal reference grid */}
          {[0, 0.5, 1].map((t) => {
            const y = padT + plotH * (1 - t);
            const elevLabel = Math.round(minElev + elevRange * t);
            return (
              <g key={t}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="#1E293B"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#86948A"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {elevLabel}m
                </text>
              </g>
            );
          })}

          {/* Area under elevation curve */}
          <path d={areaPath} fill="url(#elevFillGrad)" />

          {/* Hazard shaded background bands & colored slope segments */}
          {points.slice(0, -1).map((p, idx) => {
            const next = points[idx + 1];
            const x1 = toX(p.distKm);
            const y1 = toY(p.elevationM);
            const x2 = toX(next.distKm);
            const y2 = toY(next.elevationM);
            const sev =
              p.hazardSeverity === 'critical' || next.hazardSeverity === 'critical'
                ? 'critical'
                : p.hazardSeverity === 'caution' || next.hazardSeverity === 'caution'
                ? 'caution'
                : 'nominal';

            const strokeCol =
              sev === 'critical' ? '#EF4444' : sev === 'caution' ? '#F59E0B' : '#38BDF8';

            return (
              <g key={idx}>
                {sev === 'critical' && (
                  <rect
                    x={x1}
                    y={padT}
                    width={Math.max(1.5, x2 - x1)}
                    height={plotH}
                    fill="rgba(239, 68, 68, 0.16)"
                  />
                )}
                {sev === 'caution' && (
                  <rect
                    x={x1}
                    y={padT}
                    width={Math.max(1.5, x2 - x1)}
                    height={plotH}
                    fill="rgba(245, 158, 11, 0.1)"
                  />
                )}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={strokeCol}
                  strokeWidth={sev === 'critical' ? 2.6 : 2}
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* Waypoint markers */}
          {points.map((p, idx) => {
            if (!p.waypointName) return null;
            const x = toX(p.distKm);
            const y = toY(p.elevationM);
            return (
              <g key={`wp-${idx}`}>
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={padT + plotH}
                  stroke="rgba(222, 226, 241, 0.25)"
                  strokeWidth="1"
                />
                <circle cx={x} cy={y} r="3.2" fill="#0B0E14" stroke="#4EDEA3" strokeWidth="1.8" />
                <text
                  x={x}
                  y={height - 5}
                  textAnchor={idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle'}
                  fill="#BBCABF"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {p.waypointName} ({p.distKm.toFixed(1)}km)
                </text>
              </g>
            );
          })}

          {/* Marswalk playhead */}
          {marswalkProgress !== null && marswalkProgress !== undefined && (
            <line
              x1={padL + marswalkProgress * plotW}
              y1={padT}
              x2={padL + marswalkProgress * plotW}
              y2={padT + plotH}
              stroke="#4EDEA3"
              strokeWidth="2"
            />
          )}

          {/* Hover crosshair */}
          {hoverPoint && (
            <g>
              <line
                x1={toX(hoverPoint.distKm)}
                y1={padT}
                x2={toX(hoverPoint.distKm)}
                y2={padT + plotH}
                stroke="#7BD0FF"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={toX(hoverPoint.distKm)}
                cy={toY(hoverPoint.elevationM)}
                r="4"
                fill="#7BD0FF"
                stroke="#0B0E14"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
