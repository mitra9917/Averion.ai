"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { SeriesPoint } from "@/lib/meridian";
import { formatNumber } from "@/lib/meridian";

const SERIES_COLORS = [
  "var(--color-accent)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)"
];

const PLOT_WIDTH = 640;
const PLOT_HEIGHT = 188;

export function IndexingChart({
  points,
  types,
  brush,
  onBrush
}: {
  points: SeriesPoint[];
  types: string[];
  brush: [number, number];
  onBrush: (next: [number, number]) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const maximum = niceMax(Math.max(...points.map((point) => point.total), 0));
  const ticks = [maximum, maximum / 2, 0];
  const areas = stackedAreas(points, types, maximum);
  const totalLine = smoothPath(
    points.map((point, index) => ({
      x: xAt(index, points.length),
      y: yAt(point.total, maximum)
    }))
  );
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  function hoverAt(clientX: number, bounds: DOMRect) {
    if (points.length <= 1) return 0;
    const ratio = (clientX - bounds.left) / bounds.width;
    return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
  }

  const active = hover === null ? null : points[hover];

  return (
    <div className="mt-4">
      <div className="flex gap-3">
        <div className="flex h-48 w-8 shrink-0 flex-col justify-between pb-1 text-right text-[10px] text-muted">
          {ticks.map((tick) => (
            <span className="figure" key={tick}>
              {formatNumber(Math.round(tick))}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg
            aria-label="Chunks indexed over the selected range, stacked by file type"
            className="h-48 w-full"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(event) =>
              setHover(hoverAt(event.clientX, event.currentTarget.getBoundingClientRect()))
            }
            role="img"
            viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
          >
            {ticks.map((tick) => (
              <line
                key={tick}
                stroke="var(--color-hairline)"
                strokeWidth="1"
                x1="0"
                x2={PLOT_WIDTH}
                y1={yAt(tick, maximum)}
                y2={yAt(tick, maximum)}
              />
            ))}
            {areas.map((area, index) => (
              <path
                d={area.d}
                fill={SERIES_COLORS[index % SERIES_COLORS.length]}
                fillOpacity={index === 0 ? 0.9 : 0.85}
                key={area.type}
              />
            ))}
            {totalLine ? (
              <path
                d={totalLine}
                fill="none"
                stroke="var(--color-ink)"
                strokeOpacity="0.35"
                strokeWidth="1.5"
              />
            ) : null}
            {hover !== null ? (
              <line
                stroke="var(--color-ink)"
                strokeDasharray="3 3"
                strokeOpacity="0.45"
                x1={xAt(hover, points.length)}
                x2={xAt(hover, points.length)}
                y1="0"
                y2={PLOT_HEIGHT}
              />
            ) : null}
          </svg>
          {active ? (
            <div
              className="pointer-events-none absolute top-2 z-10 w-44 rounded-control border border-hairline bg-surface px-3 py-2 shadow-float"
              style={{
                left: `${(hover! / Math.max(points.length - 1, 1)) * 100}%`,
                transform: hover! > points.length / 2 ? "translateX(-110%)" : "translateX(8px)"
              }}
            >
              <p className="micro">{active.tooltipLabel}</p>
              <dl className="mt-2 space-y-1">
                {types.map((type, index) => (
                  <div className="flex items-center justify-between gap-3 text-xs" key={type}>
                    <dt className="flex items-center gap-1.5 text-muted">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }}
                      />
                      {type}
                    </dt>
                    <dd className="figure">{formatNumber(active.byType[type] ?? 0)}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 border-t border-hairline pt-1 text-xs">
                  <dt>Total</dt>
                  <dd className="figure">{formatNumber(active.total)}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-2 ml-11 flex justify-between text-[10px] text-muted">
        {points.map((point, index) => (
          <span className="figure" key={point.start.toISOString()}>
            {index % labelStep === 0 || index === points.length - 1 ? point.axisLabel : ""}
          </span>
        ))}
      </div>
      {points.length > 1 ? (
        <Brush count={points.length} onChange={onBrush} value={brush} />
      ) : null}
      <table className="sr-only">
        <caption>Chunks indexed by file type</caption>
        <thead>
          <tr>
            <th>When</th>
            {types.map((type) => (
              <th key={type}>{type}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.start.toISOString()}>
              <td>{point.tooltipLabel}</td>
              {types.map((type) => (
                <td key={type}>{point.byType[type] ?? 0}</td>
              ))}
              <td>{point.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Brush({
  count,
  value,
  onChange
}: {
  count: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | {
        mode: "move" | "start" | "end";
        origin: number;
        value: [number, number];
      }
    | null
  >(null);
  const [start, end] = value;
  const left = (start / Math.max(count - 1, 1)) * 100;
  const width = ((end - start) / Math.max(count - 1, 1)) * 100;

  function indexFromClient(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();

    if (!rect) return 0;

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * (count - 1));
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;

    const index = indexFromClient(event.clientX);
    const delta = index - drag.current.origin;
    const [originStart, originEnd] = drag.current.value;

    if (drag.current.mode === "move") {
      const span = originEnd - originStart;
      const nextStart = Math.max(0, Math.min(count - 1 - span, originStart + delta));
      onChange([nextStart, nextStart + span]);
      return;
    }

    if (drag.current.mode === "start") {
      onChange([Math.max(0, Math.min(originEnd, originStart + delta)), originEnd]);
      return;
    }

    onChange([originStart, Math.min(count - 1, Math.max(originStart, originEnd + delta))]);
  }

  return (
    <div className="mt-3 ml-11">
      <div
        aria-label="Drag to focus a window of the chart"
        className="relative h-7 rounded-control bg-soft"
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerMove={move}
        onPointerUp={() => {
          drag.current = null;
        }}
        ref={trackRef}
        role="slider"
        aria-valuemax={count - 1}
        aria-valuemin={0}
        aria-valuenow={end}
        aria-valuetext={`${start + 1} to ${end + 1}`}
      >
        <div
          className="absolute top-1 bottom-1 cursor-grab rounded-md border border-accent/40 bg-citation"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              mode: "move",
              origin: indexFromClient(event.clientX),
              value
            };
          }}
          style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
        >
          <span
            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
            onPointerDown={(event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                mode: "start",
                origin: indexFromClient(event.clientX),
                value
              };
            }}
          />
          <span
            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
            onPointerDown={(event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                mode: "end",
                origin: indexFromClient(event.clientX),
                value
              };
            }}
          />
        </div>
      </div>
    </div>
  );
}

function stackedAreas(points: SeriesPoint[], types: string[], maximum: number) {
  let cumulative = points.map(() => 0);

  return types.map((type) => {
    const next = points.map(
      (point, index) => cumulative[index] + (point.byType[type] ?? 0)
    );
    const top = next.map((value, index) => ({
      x: xAt(index, points.length),
      y: yAt(value, maximum)
    }));
    const bottom = cumulative.map((value, index) => ({
      x: xAt(index, points.length),
      y: yAt(value, maximum)
    }));
    cumulative = next;
    const forward = smoothPath(top);
    const back = smoothPath([...bottom].reverse()).replace(/^M/, "L");
    return { type, d: `${forward} ${back} Z` };
  });
}

function smoothPath(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const mid = (current.x + next.x) / 2;
    path += ` C ${mid} ${current.y}, ${mid} ${next.y}, ${next.x} ${next.y}`;
  }

  return path;
}

function xAt(index: number, count: number) {
  if (count <= 1) return PLOT_WIDTH / 2;
  return (index / (count - 1)) * PLOT_WIDTH;
}

function yAt(value: number, maximum: number) {
  if (maximum <= 0) return PLOT_HEIGHT;
  return PLOT_HEIGHT - (value / maximum) * (PLOT_HEIGHT - 8) - 2;
}

function niceMax(value: number) {
  if (value <= 0) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const fraction = value / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}
