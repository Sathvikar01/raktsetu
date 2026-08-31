"use client";

import { useId } from "react";

export interface BarDatum {
  label: string;
  count: number;
}
export interface BarChartProps {
  data: BarDatum[];
  ariaLabel: string;
}

const W = 640;
const H = 260;
const PAD = { top: 24, right: 16, bottom: 42, left: 40 };

export function BarChart({ data, ariaLabel }: BarChartProps) {
  const clipId = useId();
  const n = data.length;
  if (n === 0) return null;

  const max = Math.max(...data.map((d) => d.count));
  const niceMax = niceCeiling(max);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / n;
  const barW = Math.min(slot * 0.55, 72);
  const gridLines = 4; // 0..niceMax in 4 steps

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      className="h-64 w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
        </clipPath>
      </defs>

      {/* gridlines + y-axis labels */}
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const y = PAD.top + innerH - (i / gridLines) * innerH;
        return (
          <g key={i}>
            <line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke="rgb(31 36 48 / 0.06)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill="rgb(154 163 175)"
            >
              {Math.round((i / gridLines) * niceMax)}
            </text>
          </g>
        );
      })}

      {/* bars */}
      {data.map((d, i) => {
        const h =
          niceMax > 0 ? Math.max((d.count / niceMax) * innerH, d.count > 0 ? 4 : 0) : 0;
        const x = PAD.left + slot * i + (slot - barW) / 2;
        const y = PAD.top + innerH - h;
        const cx = PAD.left + slot * i + slot / 2;
        return (
          <g key={`${d.label}-${i}`} clipPath={`url(#${clipId})`}>
            {d.count > 0 ? (
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={6}
                fill="var(--chart-bar, #1f7a6d)"
                fillOpacity="0.88"
              >
                <title>{`${d.label}: ${d.count}`}</title>
              </rect>
            ) : (
              <rect x={x} y={PAD.top + innerH - 2} width={barW} height={2} rx={1} fill="rgb(154 163 175)" />
            )}
            {d.count > 0 ? (
              <text
                x={cx}
                y={y - 7}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill="rgb(31 36 48)"
              >
                {d.count}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* x-axis labels (no truncation — full label, centered) */}
      {data.map((d, i) => {
        const cx = PAD.left + slot * i + slot / 2;
        return (
          <text
            key={`${d.label}-label-${i}`}
            x={cx}
            y={H - PAD.bottom + 18}
            textAnchor="middle"
            fontSize="11"
            fill="rgb(75 85 99)"
          >
            {d.label}
          </text>
        );
      })}

      {/* baseline */}
      <line
        x1={PAD.left}
        y1={PAD.top + innerH}
        x2={W - PAD.right}
        y2={PAD.top + innerH}
        stroke="rgb(31 36 48 / 0.15)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function niceCeiling(max: number): number {
  if (max <= 5) return Math.max(max, 5);
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const scaled = max / pow;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return nice * pow;
}
