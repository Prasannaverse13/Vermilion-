"use client";

import { useMemo, useRef, useState } from "react";

/**
 * EquityChart — interactive line chart for the dashboard.
 *
 * Props
 *   values    : number[]   chronological equity points
 *   baseValue : number     starting equity (for "% vs start" labels)
 *   timestamps: number[]?  optional unix-ms timestamps (one per value)
 *
 * Features
 *   - Y-axis $ labels (5 gridlines)
 *   - X-axis day labels (start, mid, end)
 *   - Hover crosshair + tooltip with date / equity / delta
 *   - Animated path reveal (stroke-dashoffset)
 *   - Live pulse dot on the latest value
 *   - Falls back to a subtle ramp if values are too flat
 */
export function EquityChart({
  values,
  baseValue,
  timestamps,
}: {
  values: number[];
  baseValue?: number;
  timestamps?: number[];
}) {
  const W = 720;
  const H = 220;
  const PAD_L = 56;
  const PAD_R = 16;
  const PAD_T = 18;
  const PAD_B = 28;
  const PLOT_W = W - PAD_L - PAD_R;
  const PLOT_H = H - PAD_T - PAD_B;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const safe = useMemo(() => {
    if (!values || values.length < 2) {
      // Flat placeholder so the panel isn't empty.
      const v = baseValue ?? 10000;
      return Array.from({ length: 14 }, (_, i) =>
        v * (0.998 + 0.002 * (i / 13)),
      );
    }
    return values;
  }, [values, baseValue]);

  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min || Math.max(Math.abs(max) * 0.001, 1);
  // Add 5% padding top and bottom so the line isn't flush with the edges
  const paddedMin = min - range * 0.05;
  const paddedMax = max + range * 0.05;
  const paddedRange = paddedMax - paddedMin || 1;

  const stepX = PLOT_W / Math.max(safe.length - 1, 1);
  const points = safe.map((v, i) => {
    const x = PAD_L + i * stepX;
    const y = PAD_T + PLOT_H - ((v - paddedMin) / paddedRange) * PLOT_H;
    return [x, y] as const;
  });
  const pathD =
    "M " + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ");
  const areaD =
    pathD +
    ` L ${points[points.length - 1][0].toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L ${PAD_L.toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;

  // Y-axis ticks (5 of them)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = paddedMin + (paddedRange * i) / 4;
    const y = PAD_T + PLOT_H - (i / 4) * PLOT_H;
    return { v, y };
  });

  // X-axis day labels (start, mid, end)
  const dayLabel = (idx: number) => {
    const ts = timestamps?.[idx];
    if (ts) {
      const d = new Date(ts);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    const days = safe.length;
    const offset = days - 1 - idx;
    if (offset === 0) return "Today";
    if (offset === days - 1) return `${days - 1}d ago`;
    if (offset === Math.floor((days - 1) / 2)) return `${Math.ceil((days - 1) / 2)}d ago`;
    return "";
  };

  const lastIdx = safe.length - 1;
  const lastVal = safe[lastIdx];
  const firstVal = safe[0];
  const totalChange = lastVal - firstVal;
  const totalPct = (totalChange / Math.max(firstVal, 1)) * 100;
  const vsBase = baseValue && baseValue > 0
    ? ((lastVal - baseValue) / baseValue) * 100
    : null;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const relX = (x / rect.width) * W;
    if (relX < PAD_L || relX > PAD_L + PLOT_W) {
      setHover(null);
      return;
    }
    const idx = Math.round((relX - PAD_L) / stepX);
    setHover(Math.max(0, Math.min(safe.length - 1, idx)));
  };

  const hoverPt = hover != null ? points[hover] : null;
  const hoverVal = hover != null ? safe[hover] : null;
  const hoverTs = hover != null ? timestamps?.[hover] : null;

  return (
    <div
      ref={wrapRef}
      className="relative w-full"
      style={{
        position: "relative",
        width: "100%",
        flex: 1,
        minHeight: 280,
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block", overflow: "visible", cursor: "crosshair" }}
      >
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1fe274" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#1fe274" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="equity-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#9fd9b4" />
            <stop offset="100%" stopColor="#1fe274" />
          </linearGradient>
        </defs>

        {/* Y gridlines + labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={t.y}
              y2={t.y}
              stroke="rgba(212, 208, 201, 0.06)"
              strokeWidth="1"
              strokeDasharray={i === 0 || i === 4 ? "0" : "2 4"}
            />
            <text
              x={PAD_L - 8}
              y={t.y + 3}
              textAnchor="end"
              style={{
                fill: "var(--color-ash)",
                fontFamily: "var(--font-replica-mono)",
                fontSize: 9,
                letterSpacing: "0.04em",
              }}
            >
              {formatUsd(t.v)}
            </text>
          </g>
        ))}

        {/* X-axis day labels */}
        {safe.length > 1 &&
          [0, Math.floor((safe.length - 1) / 2), safe.length - 1].map((idx) => {
            const x = points[idx]?.[0] ?? PAD_L;
            return (
              <text
                key={idx}
                x={x}
                y={H - 8}
                textAnchor="middle"
                style={{
                  fill: "var(--color-smoke)",
                  fontFamily: "var(--font-replica-mono)",
                  fontSize: 9,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {dayLabel(idx)}
              </text>
            );
          })}

        {/* Hover crosshair */}
        {hoverPt && (
          <g>
            <line
              x1={hoverPt[0]}
              x2={hoverPt[0]}
              y1={PAD_T}
              y2={PAD_T + PLOT_H}
              stroke="rgba(212, 208, 201, 0.25)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle
              cx={hoverPt[0]}
              cy={hoverPt[1]}
              r="4"
              fill="var(--color-bone)"
              stroke="var(--color-obsidian)"
              strokeWidth="2"
            />
          </g>
        )}

        {/* Area fill */}
        <path d={areaD} fill="url(#equity-fill)" />

        {/* Animated line */}
        <path
          d={pathD}
          fill="none"
          stroke="url(#equity-stroke)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 2000,
            strokeDashoffset: 2000,
            animation: "equity-draw 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards",
          }}
        />

        {/* Live pulse dot on latest value */}
        <g>
          <circle
            cx={points[lastIdx][0]}
            cy={points[lastIdx][1]}
            r="6"
            fill="var(--color-execute)"
            opacity="0.25"
            style={{ animation: "equity-pulse 2.4s ease-in-out infinite" }}
          />
          <circle
            cx={points[lastIdx][0]}
            cy={points[lastIdx][1]}
            r="3.5"
            fill="var(--color-execute)"
          />
        </g>
      </svg>

      {/* Inline styles for animations */}
      <style>{`
        @keyframes equity-draw { to { stroke-dashoffset: 0; } }
        @keyframes equity-pulse { 0%, 100% { r: 6; opacity: 0.25; } 50% { r: 10; opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes equity-draw { to { stroke-dashoffset: 0; } }
        }
      `}</style>

      {/* Header strip — big number + delta */}
      <div
        className="absolute"
        style={{ top: 8, left: PAD_L + 4, pointerEvents: "none" }}
      >
        <div
          style={{
            fontSize: 26,
            lineHeight: 1,
            letterSpacing: "-0.025em",
            color: "var(--color-chalk)",
            fontWeight: 400,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatUsd(hoverVal ?? lastVal)}
        </div>
        <div
          className="flex items-center gap-2 mt-1"
          style={{ fontSize: 11, fontFamily: "var(--font-replica-mono)" }}
        >
          <span
            style={{
              color: totalPct >= 0 ? "var(--color-execute)" : "var(--color-refuse)",
            }}
          >
            {totalPct >= 0 ? "▲" : "▼"} {Math.abs(totalPct).toFixed(2)}%
          </span>
          <span style={{ color: "var(--color-smoke)" }}>
            {hover != null && hoverTs
              ? new Date(hoverTs).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : "14d"}
          </span>
          {vsBase != null && (
            <span style={{ color: "var(--color-smoke)" }}>
              · vs ${Math.round(baseValue!).toLocaleString("en-US")} start
            </span>
          )}
        </div>
      </div>

      {/* Hover tooltip */}
      {hoverPt && hoverVal != null && (
        <div
          className="absolute pointer-events-none rounded-cards"
          style={{
            top: Math.max(0, hoverPt[1] - 64),
            left: Math.min(W - 160, Math.max(0, hoverPt[0] + 12)),
            background: "var(--color-carbon)",
            border: "1px solid var(--color-smoke)",
            padding: "6px 10px",
            minWidth: 140,
            zIndex: 5,
          }}
        >
          <div
            style={{
              color: "var(--color-ash)",
              fontFamily: "var(--font-replica-mono)",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {hoverTs
              ? new Date(hoverTs).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })
              : `${hover} pts ago`}
          </div>
          <div
            style={{
              color: "var(--color-chalk)",
              fontSize: 16,
              letterSpacing: "-0.01em",
              fontVariantNumeric: "tabular-nums",
              fontWeight: 500,
            }}
          >
            {formatUsd(hoverVal)}
          </div>
          <div
            style={{
              color: hoverVal >= firstVal ? "var(--color-execute)" : "var(--color-refuse)",
              fontFamily: "var(--font-replica-mono)",
              fontSize: 10,
              marginTop: 2,
            }}
          >
            {hoverVal >= firstVal ? "+" : ""}
            {(hoverVal - firstVal).toFixed(2)} from start
          </div>
        </div>
      )}
    </div>
  );
}

function formatUsd(v: number) {
  if (Math.abs(v) >= 1000) {
    return `$${(v / 1000).toFixed(1)}k`;
  }
  return `$${v.toFixed(0)}`;
}
