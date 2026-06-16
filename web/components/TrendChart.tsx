'use client';

/**
 * TrendChart — dependency-free SVG line chart for the campaign dashboard.
 *
 * Plots two 0..100 series (visibility + share-of-voice) over a run history.
 * No chart library (project convention). Always renders a visually-hidden
 * <table> so screen readers get the exact numbers. Degrades to plotted dots
 * when there is a single point.
 */
import type { WebTrendPoint } from '@/lib/types';

interface TrendChartProps {
  points: WebTrendPoint[];
  visibilityLabel: string;
  sovLabel: string;
  emptyLabel: string;
  /** Accessible caption / chart title. */
  caption: string;
}

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 32 };

function x(i: number, n: number): number {
  if (n <= 1) return PAD.left + (W - PAD.left - PAD.right) / 2;
  return PAD.left + (i * (W - PAD.left - PAD.right)) / (n - 1);
}

function y(value: number): number {
  const v = Math.max(0, Math.min(100, value));
  return PAD.top + ((100 - v) * (H - PAD.top - PAD.bottom)) / 100;
}

function fmtDate(iso: string): string {
  // Stable, locale-agnostic short label (avoids hydration drift).
  return iso.slice(0, 10);
}

export function TrendChart({ points, visibilityLabel, sovLabel, emptyLabel, caption }: TrendChartProps) {
  const n = points.length;

  const accessibleTable = (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">{visibilityLabel}</th>
          <th scope="col">{sovLabel}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.date}>
            <td>{fmtDate(p.date)}</td>
            <td>{p.visibility}</td>
            <td>{p.shareOfVoice}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (n === 0) {
    return (
      <div className="text-sm text-gray-400" role="note">
        {emptyLabel}
      </div>
    );
  }

  const visPath = points.map((p, i) => `${x(i, n)},${y(p.visibility)}`).join(' ');
  const sovPath = points.map((p, i) => `${x(i, n)},${y(p.shareOfVoice)}`).join(' ');

  return (
    <div>
      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-gray-300">
          <span className="inline-block h-2 w-3 rounded-sm bg-brand-400" aria-hidden="true" />
          {visibilityLabel}
        </span>
        <span className="flex items-center gap-1.5 text-gray-300">
          <span className="inline-block h-2 w-3 rounded-sm bg-emerald-400" aria-hidden="true" />
          {sovLabel}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={caption}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Gridlines at 0/25/50/75/100 */}
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(g)}
              y2={y(g)}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
            <text x={4} y={y(g) + 3} fontSize="9" fill="#9ca3af">
              {g}
            </text>
          </g>
        ))}

        {n > 1 && (
          <>
            <polyline points={visPath} fill="none" className="stroke-brand-400" stroke="currentColor" strokeWidth="2" />
            <polyline points={sovPath} fill="none" className="stroke-emerald-400" stroke="currentColor" strokeWidth="2" />
          </>
        )}

        {points.map((p, i) => (
          <g key={p.date}>
            <circle cx={x(i, n)} cy={y(p.visibility)} r="3.5" className="fill-brand-400" />
            <circle cx={x(i, n)} cy={y(p.shareOfVoice)} r="3.5" className="fill-emerald-400" />
            <text
              x={x(i, n)}
              y={H - 8}
              fontSize="9"
              fill="#9ca3af"
              textAnchor="middle"
            >
              {fmtDate(p.date)}
            </text>
          </g>
        ))}
      </svg>

      {n === 1 && (
        <p className="mt-2 text-xs text-gray-400" role="note">
          {emptyLabel}
        </p>
      )}

      {accessibleTable}
    </div>
  );
}
