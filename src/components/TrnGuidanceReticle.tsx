import React from 'react';
import { TrnGuidanceState } from '../types/mission';

interface TrnGuidanceReticleProps {
  guidance: TrnGuidanceState;
  variant: 'visor' | 'console';
}

function polarPoint(cx: number, cy: number, radius: number, angleDegFromTop: number) {
  const rad = ((angleDegFromTop - 90) * Math.PI) / 180;
  return {
    x: cx + Math.cos(rad) * radius,
    y: cy + Math.sin(rad) * radius,
  };
}

export const TrnGuidanceReticle: React.FC<TrnGuidanceReticleProps> = ({
  guidance,
  variant,
}) => {
  const isVisor = variant === 'visor';
  const size = isVisor ? 104 : 188;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = isVisor ? 44 : 78;
  const innerR = isVisor ? 26 : 48;

  const targetAngle = guidance.relativeTargetAngleDeg;
  const targetTip = polarPoint(cx, cy, outerR - 4, targetAngle);
  const targetBase = polarPoint(cx, cy, 13, targetAngle);

  const correctedAngle = guidance.correctedVector?.relativeAngleDeg ?? null;
  const correctedTip =
    correctedAngle !== null ? polarPoint(cx, cy, outerR - 8, correctedAngle) : null;

  const sunPos = polarPoint(cx, cy, outerR + (isVisor ? 5 : 9), guidance.solar.relativeSunAngleDeg);
  const roverPos = guidance.roverRef.active
    ? polarPoint(cx, cy, outerR + (isVisor ? 5 : 9), guidance.roverRef.relativeAngleDeg)
    : null;
  const landmarkPos = guidance.primaryLandmark
    ? polarPoint(cx, cy, outerR - (isVisor ? 11 : 18), guidance.primaryLandmark.relativeAngleDeg)
    : null;

  const confidenceColor =
    guidance.confidenceLevel === 'HIGH'
      ? '#4EDEA3'
      : guidance.confidenceLevel === 'MEDIUM'
      ? '#F59E0B'
      : '#EF4444';

  const targetColor = guidance.isOffCourse
    ? '#F59E0B'
    : guidance.safeBypassRecommended
    ? '#EF4444'
    : '#38BDF8';

  const uncertaintyRatio = Math.max(
    0.16,
    Math.min(0.85, guidance.uncertaintyRadiusM / 75)
  );

  return (
    <div className="relative shrink-0 flex items-center justify-center select-none">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label={`Astronaut-centered navigation guidance: ${guidance.turnCommandLabel}`}
        className="overflow-visible"
      >
        {/* Outer Reference Ring (Astronaut-Relative, NOT magnetic North) */}
        <circle
          cx={cx}
          cy={cy}
          r={outerR}
          fill="#070A10"
          fillOpacity={0.85}
          stroke="#1E293B"
          strokeWidth={1.5}
        />

        {/* Inner Range Ring */}
        <circle
          cx={cx}
          cy={cy}
          r={innerR}
          fill="none"
          stroke="#1E293B"
          strokeDasharray="3 3"
          strokeWidth={1}
        />

        {/* Uncertainty Envelope around Astronaut */}
        <circle
          cx={cx}
          cy={cy}
          r={Math.max(8, innerR * uncertaintyRatio)}
          fill={confidenceColor}
          fillOpacity={0.12}
          stroke={confidenceColor}
          strokeOpacity={0.55}
          strokeWidth={1}
        />

        {/* Forward Facing Cone (Astronaut FOV) */}
        <path
          d={`M ${cx} ${cy} L ${polarPoint(cx, cy, outerR, -22).x} ${
            polarPoint(cx, cy, outerR, -22).y
          } A ${outerR} ${outerR} 0 0 1 ${polarPoint(cx, cy, outerR, 22).x} ${
            polarPoint(cx, cy, outerR, 22).y
          } Z`}
          fill="#4EDEA3"
          fillOpacity={0.07}
        />

        {/* Relative Clock / Facing Ticks */}
        {[0, 90, 180, 270].map((deg) => {
          const p1 = polarPoint(cx, cy, outerR - 4, deg);
          const p2 = polarPoint(cx, cy, outerR, deg);
          return (
            <line
              key={deg}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={deg === 0 ? '#4EDEA3' : '#475569'}
              strokeWidth={deg === 0 ? 2 : 1.2}
            />
          );
        })}

        {!isVisor && (
          <>
            <text
              x={cx}
              y={cy - outerR - 6}
              textAnchor="middle"
              fill="#4EDEA3"
              fontSize="8.5"
              fontWeight="700"
              fontFamily="ui-monospace, monospace"
            >
              AHEAD
            </text>
            <text
              x={cx + outerR + 10}
              y={cy + 3}
              textAnchor="middle"
              fill="#64748B"
              fontSize="8"
              fontFamily="ui-monospace, monospace"
            >
              R
            </text>
            <text
              x={cx - outerR - 10}
              y={cy + 3}
              textAnchor="middle"
              fill="#64748B"
              fontSize="8"
              fontFamily="ui-monospace, monospace"
            >
              L
            </text>
          </>
        )}

        {/* Corrected Navigation Vector (if off-course or obstacle bypass) */}
        {correctedTip && correctedAngle !== null && (
          <g>
            <line
              x1={cx}
              y1={cy}
              x2={correctedTip.x}
              y2={correctedTip.y}
              stroke="#4EDEA3"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
            <circle cx={correctedTip.x} cy={correctedTip.y} r={3.5} fill="#4EDEA3" />
          </g>
        )}

        {/* Primary Destination Directional Vector */}
        <line
          x1={targetBase.x}
          y1={targetBase.y}
          x2={targetTip.x}
          y2={targetTip.y}
          stroke={targetColor}
          strokeWidth={isVisor ? 3 : 3.2}
          strokeLinecap="round"
        />

        {/* Target Arrowhead */}
        <g transform={`translate(${targetTip.x}, ${targetTip.y}) rotate(${targetAngle})`}>
          <polygon
            points="0,-6 -4.5,4 4.5,4"
            fill={targetColor}
          />
        </g>

        {/* Primary Landmark Marker inside ring */}
        {landmarkPos && (
          <g>
            <polygon
              points={`${landmarkPos.x},${landmarkPos.y - 4.5} ${landmarkPos.x + 4},${
                landmarkPos.y + 3
              } ${landmarkPos.x - 4},${landmarkPos.y + 3}`}
              fill="#FBBF24"
              stroke="#0B0E14"
              strokeWidth={1}
            />
          </g>
        )}

        {/* Solar Azimuth Reference Marker */}
        <g>
          <circle
            cx={sunPos.x}
            cy={sunPos.y}
            r={isVisor ? 3.5 : 4.2}
            fill="#F59E0B"
            stroke="#0B0E14"
            strokeWidth={1}
          />
          {!isVisor && (
            <text
              x={sunPos.x}
              y={sunPos.y - 7}
              textAnchor="middle"
              fill="#FCD34D"
              fontSize="7.5"
              fontWeight="700"
              fontFamily="ui-monospace, monospace"
            >
              SUN
            </text>
          )}
        </g>

        {/* Rover Reference Marker */}
        {roverPos && (
          <g>
            <rect
              x={roverPos.x - 3.5}
              y={roverPos.y - 3.5}
              width={7}
              height={7}
              rx={1}
              fill="#10B981"
              stroke="#0B0E14"
              strokeWidth={1}
            />
            {!isVisor && (
              <text
                x={roverPos.x}
                y={roverPos.y + 11}
                textAnchor="middle"
                fill="#6FFBAE"
                fontSize="7.5"
                fontWeight="700"
                fontFamily="ui-monospace, monospace"
              >
                RVR
              </text>
            )}
          </g>
        )}

        {/* Central Astronaut Chevron (Always Facing Up) */}
        <g transform={`translate(${cx}, ${cy})`}>
          <circle r={isVisor ? 9 : 11} fill="#0F172A" stroke={confidenceColor} strokeWidth={1.8} />
          <polygon points="0,-6 -4.5,4.5 0,2 4.5,4.5" fill="#F8FAFC" />
        </g>
      </svg>
    </div>
  );
};
