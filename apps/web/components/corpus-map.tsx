"use client";

import { useState } from "react";

import type { CorpusGroup, CorpusNode } from "@/lib/meridian";
import { formatNumber } from "@/lib/meridian";

export function CorpusMap({
  nodes,
  groups,
  hidden,
  total
}: {
  nodes: CorpusNode[];
  groups: CorpusGroup[];
  hidden: number;
  total: number;
}) {
  const largest = nodes.reduce<CorpusNode | null>(
    (best, node) => (!best || node.chunks > best.chunks ? node : best),
    null
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const activeId = hovered ?? largest?.id ?? null;
  const active = nodes.find((node) => node.id === activeId) ?? null;

  if (!nodes.length) {
    return (
      <div className="flex h-full min-h-56 items-center justify-center px-8 text-center">
        <div>
          <p className="text-sm font-medium">The corpus map is empty</p>
          <p className="mt-1 text-sm text-muted">
            Upload a document and it will appear here, grouped with files of the same type.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-64 flex-1">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-medium">Corpus map</span>{" "}
          <span className="text-muted">
            {formatNumber(nodes.length)} of {formatNumber(total)} shown
          </span>
        </p>
        <p className="text-xs text-muted">Grouped by file type · size is chunks</p>
      </div>
      <svg
        aria-label="Documents grouped by file type. Circle size follows chunk count."
        className="h-full min-h-56 w-full"
        role="img"
        viewBox="0 0 640 300"
      >
        {groups.map((group) => {
          const members = nodes.filter((node) => node.type === group.type);
          const hub = members[0];

          return members.slice(1).map((node) =>
            hub ? (
              <line
                key={`${group.type}-${node.id}`}
                stroke="var(--color-hairline)"
                strokeWidth="1"
                x1={hub.x}
                x2={node.x}
                y1={hub.y}
                y2={node.y}
              />
            ) : null
          );
        })}
        {nodes.map((node) => {
          const selected = node.id === activeId;

          return (
            <g
              key={node.id}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered((current) => (current === node.id ? null : current))}
            >
              <circle
                cx={node.x}
                cy={node.y}
                fill={selected ? "var(--color-accent)" : "var(--color-surface)"}
                r={node.r}
                stroke={selected ? "var(--color-accent)" : "var(--color-hairline)"}
                strokeWidth="1.25"
              />
            </g>
          );
        })}
        {groups.map((group) => (
          <text
            fill="var(--color-muted)"
            fontSize="10"
            fontWeight="600"
            key={group.type}
            letterSpacing="1.1"
            textAnchor="middle"
            x={group.x}
            y={Math.max(16, group.y - 34)}
          >
            {group.type} {group.count}
          </text>
        ))}
      </svg>
      {active ? (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-control border border-hairline bg-surface px-3 py-2 shadow-float"
          style={{
            left: `clamp(8px, ${(active.x / 640) * 100}%, calc(100% - 232px))`,
            top: `clamp(28px, ${(active.y / 300) * 100}%, calc(100% - 72px))`
          }}
        >
          <p className="truncate text-sm font-medium">{active.filename}</p>
          <p className="mt-1 text-xs text-muted">
            {active.type} · {formatNumber(active.chunks)} chunks
          </p>
        </div>
      ) : null}
      {hidden > 0 ? (
        <p className="mt-1 text-xs text-muted">
          {formatNumber(hidden)} smaller documents are left off so the clusters stay readable.
        </p>
      ) : null}
    </div>
  );
}
