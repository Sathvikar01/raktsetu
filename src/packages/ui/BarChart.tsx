export interface BarDatum {
  label: string;
  count: number;
}

export interface BarChartProps {
  data: BarDatum[];
  ariaLabel: string;
}

const W = 640;
const H = 240;
const PAD_TOP = 26;
const PAD_BOTTOM = 38;
const PAD_X = 8;

function truncate(label: string, max = 10): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export function BarChart({ data, ariaLabel }: BarChartProps) {
  const n = data.length;
  if (n === 0) return null;
  const max = Math.max(...data.map((d) => d.count));
  const innerH = H - PAD_TOP - PAD_BOTTOM;
  const slot = (W - PAD_X * 2) / n;
  const barW = Math.min(slot * 0.55, 72);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      className="h-56 w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {data.map((d, i) => {
        const x = PAD_X + slot * i + (slot - barW) / 2;
        const h = max > 0 ? Math.max((d.count / max) * innerH, d.count > 0 ? 4 : 0) : 0;
        const y = H - PAD_BOTTOM - h;
        const cx = PAD_X + slot * i + slot / 2;
        return (
          <g key={`${d.label}-${i}`}>
            {d.count > 0 ? (
              <>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={5}
                  fill="#1f7a6d"
                  fillOpacity="0.88"
                />
                <text
                  x={cx}
                  y={y - 7}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                  fill="#1f2430"
                >
                  {d.count}
                </text>
              </>
            ) : (
              <rect
                x={x}
                y={H - PAD_BOTTOM - 2}
                width={barW}
                height={2}
                rx={1}
                fill="#9aa3af"
              />
            )}
            <text x={cx} y={H - PAD_BOTTOM + 18} textAnchor="middle" fontSize="11" fill="#4b5563">
              {truncate(d.label)}
            </text>
          </g>
        );
      })}
      <line
        x1={PAD_X}
        y1={H - PAD_BOTTOM}
        x2={W - PAD_X}
        y2={H - PAD_BOTTOM}
        stroke="#d7f0ec"
        strokeWidth="2"
      />
    </svg>
  );
}
