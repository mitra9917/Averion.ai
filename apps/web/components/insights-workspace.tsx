"use client";

import { Download, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Skeleton } from "@/components/skeleton";
import { useWorkspace } from "@/components/workspace-context";
import {
  listConversations,
  listDocuments,
  type ConversationSummary,
  type DocumentListItem
} from "@/lib/api";
import {
  buildChunkSeries,
  chunksAddedBetween,
  chunksInWeek,
  csvEscape,
  fileTypeLabel,
  flowDelta,
  formatNumber,
  formatPercent,
  formatSignedPercent,
  seriesTotal,
  statusKind,
  statusLabel,
  weekColumns
} from "@/lib/meridian";

type InsightRange = "30d" | "12m" | "all";

const rangeCopy: Record<InsightRange, { label: string; days: number | null }> = {
  "30d": { label: "30 days", days: 30 },
  "12m": { label: "12 months", days: 365 },
  all: { label: "all time", days: null }
};

export function InsightsWorkspace() {
  const workspace = useWorkspace();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<InsightRange>("12m");
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    title: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      const [documentsResult, conversationsResult] = await Promise.allSettled([
        listDocuments(),
        listConversations()
      ]);

      if (ignore) return;

      setDocuments(documentsResult.status === "fulfilled" ? documentsResult.value : []);
      setConversations(
        conversationsResult.status === "fulfilled"
          ? conversationsResult.value.conversations
          : []
      );

      if (
        documentsResult.status === "rejected" &&
        conversationsResult.status === "rejected"
      ) {
        setError("Insights could not be loaded. Confirm the API is running.");
      } else if (
        documentsResult.status === "rejected" ||
        conversationsResult.status === "rejected"
      ) {
        setError("Some insight figures are temporarily unavailable.");
      }

      setIsLoading(false);
    }

    void load();

    return () => {
      ignore = true;
    };
  }, []);

  const now = useMemo(() => new Date(), []);
  const columns = useMemo(
    () => weekColumns(range, documents, now),
    [documents, now, range]
  );
  const windowStart = columns[0]?.start ?? now;
  const windowEnd = new Date(now.getTime());
  const inWindow = documents.filter((document) => {
    const created = new Date(document.created_at);
    return !Number.isNaN(created.getTime()) && created >= windowStart && created < windowEnd;
  });
  const rows = [...inWindow].sort(
    (left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  ).slice(0, 12);
  const maxCell = Math.max(
    1,
    ...rows.flatMap((document) => columns.map((column) => chunksInWeek(document, column.start)))
  );
  const ready = documents.filter((document) => statusKind(document.status) === "ready").length;
  const failed = documents.filter((document) => statusKind(document.status) === "failed").length;
  const processing = documents.filter(
    (document) => statusKind(document.status) === "processing"
  ).length;
  const other = documents.length - ready - failed - processing;
  const chunks = documents.reduce((sum, document) => sum + document.chunks_count, 0);
  const addedThisWeek = documents.filter((document) => {
    const created = new Date(document.created_at);
    return now.getTime() - created.getTime() < 7 * 86_400_000;
  }).length;
  const rangeDays = rangeCopy[range].days;
  const delta = rangeDays ? flowDelta(documents, rangeDays, now) : null;
  const volume = buildChunkSeries(documents, "14d", now);
  const volumeMax = Math.max(...volume.map((point) => point.total), 1);
  const chunkSpark = columns.map((column) =>
    chunksAddedBetween(documents, column.start, new Date(column.start.getTime() + 7 * 86_400_000))
  );
  const documentSpark = columns.map((column) =>
    documents.filter((document) => chunksInWeek(document, column.start) > 0 || createdInWeek(document, column.start)).length
  );
  const conversationSpark = columns.map((column) => {
    const end = new Date(column.start.getTime() + 7 * 86_400_000);
    return conversations.filter((conversation) => {
      const created = new Date(conversation.created_at);
      return created >= column.start && created < end;
    }).length;
  });
  const updatedThisMonth = documents.filter((document) => {
    const updated = new Date(document.updated_at);
    return updated.getMonth() === now.getMonth() && updated.getFullYear() === now.getFullYear();
  }).length;
  const averageChunks = documents.length ? chunks / documents.length : 0;
  const segments = [
    { key: "ready", label: "Ready", count: ready, color: "var(--color-ink)" },
    { key: "processing", label: "Processing", count: processing, color: "var(--color-accent)" },
    { key: "failed", label: "Failed", count: failed, color: "var(--color-fail)" },
    ...(other
      ? [{ key: "other", label: "Other", count: other, color: "var(--color-chart-2)" }]
      : [])
  ].filter((segment) => segment.count > 0);

  function exportLibrary() {
    const header = [
      "filename",
      "file_type",
      "status",
      "chunks_count",
      "created_at",
      "updated_at",
      "error_message"
    ];
    const lines = [
      header.join(","),
      ...documents.map((document) =>
        [
          document.filename,
          document.file_type,
          document.status,
          String(document.chunks_count),
          document.created_at,
          document.updated_at,
          document.error_message ?? ""
        ]
          .map(csvEscape)
          .join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "averion-library.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-6 px-5 pt-2 pb-28">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] px-5 pt-2 pb-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-[30px]">Corpus insights</h1>
          <p className="mt-2 text-sm text-muted">
            {workspace.orgName} · {rangeCopy[range].label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-hairline bg-surface p-0.5">
            {(Object.keys(rangeCopy) as InsightRange[]).map((item) => (
              <button
                className={`h-8 rounded-full px-3 text-xs font-semibold ${
                  item === range ? "bg-ink text-white" : "text-muted hover:text-ink"
                }`}
                key={item}
                onClick={() => setRange(item)}
                type="button"
              >
                {item === "all" ? "All time" : item}
              </button>
            ))}
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline bg-surface px-3 text-xs font-semibold hover:bg-soft disabled:opacity-40"
            disabled={!documents.length}
            onClick={exportLibrary}
            type="button"
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-center justify-between rounded-pane border border-hairline bg-surface px-4 py-3 text-sm">
          <span>{error}</span>
          <button
            className="inline-flex items-center gap-1.5 text-xs font-semibold"
            onClick={() => window.location.reload()}
            type="button"
          >
            <RefreshCw size={13} />
            Retry
          </button>
        </div>
      ) : null}

      <section className="mt-8 grid gap-6 border-y border-hairline py-6 md:grid-cols-3">
        <Figure
          detail={`${formatNumber(addedThisWeek)} this week · ${formatPercent(ready, documents.length)} ready`}
          label="Documents indexed"
          spark={documentSpark}
          value={formatNumber(ready)}
          suffix={`of ${formatNumber(documents.length)}`}
        />
        <Figure
          detail={
            delta?.percent !== null && delta
              ? `${formatSignedPercent(delta.percent)} chunks added vs the previous ${rangeCopy[range].label}`
              : range === "all"
                ? "All chunks currently stored"
                : delta && delta.current > 0
                  ? `${formatNumber(delta.current)} chunks added in this range`
                  : "No chunks added in this range"
          }
          label="Chunks indexed"
          spark={chunkSpark}
          value={formatNumber(chunks)}
        />
        <Figure
          detail="Saved threads in this workspace"
          label="Conversations"
          spark={conversationSpark}
          value={formatNumber(conversations.length)}
        />
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Coverage by document</h2>
            <p className="mt-1 text-xs text-muted">
              {formatNumber(rows.length)} documents × {formatNumber(columns.length)} weeks. A cell marks the week a file was added. Darker cells hold more chunks.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span>less</span>
            <span className="flex gap-0.5">
              {[0.15, 0.35, 0.55, 0.75, 1].map((strength) => (
                <span
                  className="size-3 rounded-[3px]"
                  key={strength}
                  style={{ background: heatColor(strength, 1) }}
                />
              ))}
            </span>
            <span>more</span>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="mt-6 rounded-pane border border-dashed border-hairline px-4 py-10 text-center text-sm text-muted">
            No documents were added in this range.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <div
              className="grid min-w-[720px] items-center gap-y-1"
              style={{
                gridTemplateColumns: `minmax(160px, 220px) repeat(${columns.length}, minmax(12px, 1fr))`
              }}
            >
              <span />
              {columns.map((column) => (
                <span
                  className="figure text-center text-[9px] tracking-[0.08em] text-muted"
                  key={column.start.toISOString()}
                >
                  {column.label}
                </span>
              ))}
              {rows.map((document) => (
                <HeatRow
                  columns={columns}
                  document={document}
                  key={document.document_id}
                  maxCell={maxCell}
                  onLeave={() => setTip(null)}
                  onShow={setTip}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="mt-10 border-t border-hairline pt-8">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-sm font-medium">Status composition</h2>
          <p className="figure text-xs text-muted">{formatNumber(documents.length)} docs</p>
        </div>
        {documents.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Upload a document to see how the library breaks down.</p>
        ) : (
          <>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-soft">
              {segments.map((segment) => (
                <div
                  key={segment.key}
                  style={{
                    width: `${(segment.count / documents.length) * 100}%`,
                    background: segment.color
                  }}
                  title={`${segment.label} ${segment.count}`}
                />
              ))}
            </div>
            <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
              <ul className="space-y-3">
                {segments.map((segment) => (
                  <li className="flex items-center gap-3 text-sm" key={segment.key}>
                    <span className="size-2.5 rounded-[3px]" style={{ background: segment.color }} />
                    <span className="flex-1">{segment.label}</span>
                    <span className="figure">{formatNumber(segment.count)}</span>
                    <span className="figure w-14 text-right text-muted">
                      {formatPercent(segment.count, documents.length)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-hairline pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
                <dl className="grid grid-cols-2 gap-4">
                  <Stat label="Updated this month" value={formatNumber(updatedThisMonth)} />
                  <Stat label="Avg chunks / document" value={averageChunks.toFixed(1)} />
                </dl>
                <p className="micro mt-5">Index volume · 14 days</p>
                <div className="mt-3 flex h-16 items-end gap-1">
                  {volume.map((point) => (
                    <div
                      className="flex-1 rounded-sm bg-chart-3"
                      key={point.start.toISOString()}
                      style={{
                        height: point.total ? `${Math.max(8, (point.total / volumeMax) * 100)}%` : "2px",
                        background: point.total ? "var(--color-chart-3)" : "var(--color-hairline)"
                      }}
                      title={`${point.tooltipLabel}: ${point.total} chunks`}
                    />
                  ))}
                </div>
                {seriesTotal(volume) === 0 ? (
                  <p className="mt-2 text-xs text-muted">No chunks indexed in the last 14 days.</p>
                ) : null}
              </div>
            </div>
          </>
        )}
      </section>
      {tip ? (
        <div
          className="pointer-events-none fixed z-50 w-56 rounded-control border border-hairline bg-surface px-3 py-2 shadow-float"
          style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 10px))" }}
        >
          <p className="micro">{tip.title}</p>
          <p className="mt-1 text-sm">{tip.body}</p>
        </div>
      ) : null}
    </div>
  );
}

function Figure({
  label,
  value,
  suffix,
  detail,
  spark
}: {
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  spark: number[];
}) {
  return (
    <article className="md:px-6 md:first:pl-0 md:last:pr-0">
      <p className="micro">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="figure text-[32px] leading-none tracking-[-0.02em]">
          {value}{" "}
          {suffix ? <span className="text-base font-normal text-muted">{suffix}</span> : null}
        </p>
        <Sparkline values={spark} />
      </div>
      <p className="mt-3 max-w-xs text-xs leading-5 text-muted">{detail}</p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="figure mt-1 text-lg">{value}</dd>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const width = 96;
  const height = 28;
  const path = values
    .map((value, index) => {
      const x = values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / max) * (height - 4) - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg aria-hidden="true" className="h-7 w-24" viewBox={`0 0 ${width} ${height}`}>
      <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
    </svg>
  );
}

function HeatRow({
  document,
  columns,
  maxCell,
  onShow,
  onLeave
}: {
  document: DocumentListItem;
  columns: { start: Date; tooltip: string }[];
  maxCell: number;
  onShow: (tip: { x: number; y: number; title: string; body: string }) => void;
  onLeave: () => void;
}) {
  return (
    <>
      <p className="truncate pr-3 text-xs" title={document.filename}>
        {document.filename}
      </p>
      {columns.map((column) => {
        const chunks = chunksInWeek(document, column.start);

        return (
          <button
            aria-label={`${document.filename}, ${column.tooltip}, ${chunks} chunks`}
            className="mx-auto size-3.5 rounded-[3px] border border-transparent hover:border-ink"
            key={column.start.toISOString()}
            onBlur={onLeave}
            onFocus={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onShow({
                x: rect.left + rect.width / 2,
                y: rect.top,
                title: document.filename,
                body: heatBody(document, column.tooltip, chunks)
              });
            }}
            onMouseEnter={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onShow({
                x: rect.left + rect.width / 2,
                y: rect.top,
                title: document.filename,
                body: heatBody(document, column.tooltip, chunks)
              });
            }}
            onMouseLeave={onLeave}
            style={{ background: chunks ? heatColor(chunks, maxCell) : "var(--color-soft)" }}
            type="button"
          />
        );
      })}
    </>
  );
}

function heatBody(document: DocumentListItem, week: string, chunks: number) {
  if (!chunks) {
    return `${week}. Not added this week.`;
  }

  return `${week} · ${formatNumber(chunks)} chunks · ${statusLabel(document.status)} · ${fileTypeLabel(document.file_type)}`;
}

function heatColor(value: number, max: number) {
  const strength = Math.max(0.18, Math.min(1, value / max));
  return `color-mix(in srgb, var(--color-accent) ${Math.round(strength * 100)}%, white)`;
}

function createdInWeek(document: DocumentListItem, weekStart: Date) {
  const created = new Date(document.created_at);
  const end = new Date(weekStart.getTime() + 7 * 86_400_000);
  return created >= weekStart && created < end;
}
