"use client";

import { ArrowUp, FileText, RefreshCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { CorpusMap } from "@/components/corpus-map";
import { IndexingChart } from "@/components/indexing-chart";
import { Skeleton } from "@/components/skeleton";
import { useWorkspace } from "@/components/workspace-context";
import {
  getConversation,
  listConversations,
  listDocuments,
  type ConversationSummary,
  type DocumentListItem
} from "@/lib/api";
import {
  activityFeed,
  attentionItems,
  buildChunkSeries,
  buildCorpusMap,
  collapseSeries,
  CONVERSATION_GROUPS,
  firstName,
  flowDelta,
  formatLongDate,
  formatNumber,
  formatRelative,
  formatSignedPercent,
  greetingFor,
  seriesTotal,
  sortByUpdated,
  statusKind,
  type RangeKey
} from "@/lib/meridian";

type OverviewRange = Extract<RangeKey, "24h" | "14d" | "90d">;

const ranges: { id: OverviewRange; label: string; days: number }[] = [
  { id: "24h", label: "24h", days: 1 },
  { id: "14d", label: "14d", days: 14 },
  { id: "90d", label: "90d", days: 90 }
];

export function DashboardOverview() {
  const router = useRouter();
  const workspace = useWorkspace();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [range, setRange] = useState<OverviewRange>("14d");
  const [brushOverride, setBrushOverride] = useState<[number, number] | null>(null);
  const [resume, setResume] = useState<{
    id: string;
    title: string;
    quote: string;
    page: number | null;
    updatedAt: string;
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

      const nextDocuments =
        documentsResult.status === "fulfilled" ? documentsResult.value : [];
      const nextConversations =
        conversationsResult.status === "fulfilled"
          ? conversationsResult.value.conversations
          : [];

      setDocuments(nextDocuments);
      setConversations(sortByUpdated(nextConversations));

      if (
        documentsResult.status === "rejected" &&
        conversationsResult.status === "rejected"
      ) {
        setError("Overview could not be loaded. Confirm the API is running.");
      } else if (
        documentsResult.status === "rejected" ||
        conversationsResult.status === "rejected"
      ) {
        setError("Some overview data is temporarily unavailable.");
      }

      setIsLoading(false);
    }

    void load();

    return () => {
      ignore = true;
    };
  }, []);

  const latest = conversations[0];

  useEffect(() => {
    if (!latest) {
      return;
    }

    let ignore = false;

    getConversation(latest.id)
      .then((response) => {
        if (ignore) return;
        const messages = response.conversation.messages;
        const lastUser = [...messages].reverse().find((message) => message.role === "user");
        const lastAssistant = [...messages]
          .reverse()
          .find((message) => message.role === "assistant");
        const page =
          lastAssistant?.citations.find((citation) => citation.page_number)?.page_number ??
          null;

        setResume({
          id: response.conversation.id,
          title: response.conversation.title,
          quote: lastUser?.content || response.conversation.title,
          page,
          updatedAt: response.conversation.updated_at
        });
      })
      .catch(() => {
        if (ignore) return;
        setResume({
          id: latest.id,
          title: latest.title,
          quote: latest.title,
          page: null,
          updatedAt: latest.updated_at
        });
      });

    return () => {
      ignore = true;
    };
  }, [latest]);

  const series = useMemo(
    () => collapseSeries(buildChunkSeries(documents, range)),
    [documents, range]
  );

  const defaultBrush = useMemo<[number, number]>(
    () => [0, Math.max(0, series.points.length - 1)],
    [range, series.points.length]
  );
  const brush = brushOverride ?? defaultBrush;

  const ready = documents.filter((document) => statusKind(document.status) === "ready").length;
  const failed = documents.filter((document) => statusKind(document.status) === "failed").length;
  const processing = documents.filter(
    (document) => statusKind(document.status) === "processing"
  ).length;
  const chunks = documents.reduce((sum, document) => sum + document.chunks_count, 0);
  const needsLook = failed + processing;
  const totalChunks = seriesTotal(series.points);
  const documentsInRange = series.points.reduce((sum, point) => sum + point.documents, 0);
  const activeRange = ranges.find((item) => item.id === range) ?? ranges[1];
  const delta = flowDelta(documents, activeRange.days);
  const average = range === "24h" ? totalChunks / 24 : totalChunks / activeRange.days;
  const brushPoints = series.points.slice(brush[0], brush[1] + 1);
  const brushTotal = seriesTotal(brushPoints);
  const brushNarrowed = brush[1] - brush[0] < series.points.length - 1;
  const attention = attentionItems(documents);
  const activity = activityFeed(documents, conversations);
  const recent = conversations.slice(0, 3);
  const suggestions = documents
    .filter((document) => statusKind(document.status) === "ready")
    .slice(0, 2);
  const map = buildCorpusMap(documents);
  const now = new Date();
  const name = firstName(workspace.userName);
  const greeting = name ? `${greetingFor(now)}, ${name}` : greetingFor(now);

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();

    if (!trimmed) return;

    const params = new URLSearchParams({ q: trimmed, t: crypto.randomUUID() });
    router.push(`/chat?${params.toString()}`);
  }

  function askAbout(filename: string) {
    const params = new URLSearchParams({
      q: `What should I know about ${filename}?`,
      t: crypto.randomUUID()
    });
    router.push(`/chat?${params.toString()}`);
  }

  if (isLoading) {
    return (
      <div className="grid gap-3 px-3 pt-1 pb-24 xl:h-[calc(100dvh-3.5rem)] xl:grid-cols-[360px_minmax(0,1fr)_300px]">
        <Skeleton className="min-h-80 rounded-pane" />
        <Skeleton className="min-h-80 rounded-pane" />
        <Skeleton className="min-h-80 rounded-pane" />
      </div>
    );
  }

  return (
    <div className="flex h-auto flex-col gap-3 px-3 pt-1 pb-24 xl:h-[calc(100dvh-3.5rem)]">
      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-pane border border-hairline bg-surface px-4 py-3 text-sm">
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
      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[360px_minmax(0,1fr)_300px]">
        <section className="flex min-h-[680px] flex-col overflow-hidden rounded-pane border border-hairline bg-surface xl:min-h-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
            <p className="micro">Today</p>
            <h1 className="display mt-4">{greeting}</h1>
            <p className="mt-2 text-sm text-muted">
              {formatLongDate(now)}
              {" · "}
              {documents.length === 0
                ? "No documents in this workspace yet"
                : needsLook === 0
                  ? "Everything indexed is ready to cite"
                  : `${formatNumber(needsLook)} document${needsLook === 1 ? "" : "s"} need a look`}
            </p>
            <form
              className="mt-5 flex items-center gap-2 rounded-control border border-hairline bg-surface px-2.5 focus-within:border-ink"
              onSubmit={ask}
            >
              <Sparkles aria-hidden="true" className="text-muted" size={15} />
              <input
                aria-label="Ask across the workspace"
                className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={
                  documents.length
                    ? `Ask across ${formatNumber(documents.length)} documents…`
                    : "Ask a question…"
                }
                value={question}
              />
              <button
                aria-label="Ask"
                className="flex size-8 items-center justify-center rounded-full bg-ink text-white hover:bg-ink/90 disabled:opacity-40"
                disabled={!question.trim()}
                type="submit"
              >
                <ArrowUp size={15} />
              </button>
            </form>
            <p className="mt-2 flex items-center justify-between text-xs text-muted">
              <span className="truncate">Grounded in {workspace.orgName}</span>
              <span>Enter to ask</span>
            </p>

            <div className="mt-6">
              <p className="micro">Continue where you left off</p>
              {latest && resume ? (
                <Link
                  className="mt-3 block rounded-control border border-hairline p-3 transition hover:bg-soft"
                  href={`/chat?conversation=${encodeURIComponent(resume.id)}`}
                >
                  <span className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-soft text-[10px] font-semibold">
                      <FileText size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{resume.title}</span>
                      <span className="mt-1 line-clamp-2 block text-sm leading-5 text-muted">
                        “{resume.quote}”
                      </span>
                      <span className="mt-2 flex items-center justify-between text-xs text-muted">
                        <span>
                          {resume.page ? `Page ${resume.page} · ` : ""}
                          {formatRelative(resume.updatedAt)}
                        </span>
                        <span className="font-semibold text-ink">Resume</span>
                      </span>
                    </span>
                  </span>
                </Link>
              ) : (
                <p className="mt-3 rounded-control border border-dashed border-hairline px-3 py-4 text-sm text-muted">
                  No threads yet. Ask something once a document is ready.
                </p>
              )}
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between">
                <p className="micro">Recent conversations</p>
                <span className="figure text-xs text-muted">
                  {formatNumber(conversations.length)} total
                </span>
              </div>
              <div className="mt-2">
                {recent.length ? (
                  recent.map((conversation) => (
                    <Link
                      className="flex items-center gap-3 rounded-control px-2 py-2.5 hover:bg-soft"
                      href={`/chat?conversation=${encodeURIComponent(conversation.id)}`}
                      key={conversation.id}
                    >
                      <span className="size-1.5 rounded-full bg-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{conversation.title}</span>
                        <span className="text-xs text-muted">
                          {formatRelative(conversation.updated_at)} · {conversation.message_count} messages
                        </span>
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="px-2 py-3 text-sm text-muted">Recent threads will show up here.</p>
                )}
              </div>
            </div>

            {suggestions.length ? (
              <div className="mt-5">
                <p className="micro">Suggested</p>
                <div className="mt-2 space-y-1">
                  {suggestions.map((document) => (
                    <button
                      className="flex w-full items-center justify-between gap-3 rounded-control px-2 py-2 text-left text-sm hover:bg-soft"
                      key={document.document_id}
                      onClick={() => askAbout(document.filename)}
                      type="button"
                    >
                      <span className="truncate">What should I know about {document.filename}?</span>
                      <span className="text-muted">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-auto pt-6">
              <div className="flex items-center justify-between text-sm">
                <span>Index health</span>
                <span className="figure text-muted">
                  {formatNumber(ready)} / {formatNumber(documents.length)} ready
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft">
                <div
                  className="h-full rounded-full bg-ink"
                  style={{
                    width: documents.length ? `${(ready / documents.length) * 100}%` : "0%"
                  }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span className="figure">
                  {formatNumber(chunks)} chunks
                  <span className="mx-1.5 inline-block size-1.5 rounded-full bg-fail align-middle" />
                  {formatNumber(failed)} failed
                </span>
                <Link
                  className="font-semibold text-ink"
                  href={failed ? "/documents?status=failed" : "/documents"}
                >
                  Review
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-[720px] flex-col overflow-hidden rounded-pane border border-hairline bg-surface xl:min-h-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-medium">Indexing throughput</h2>
                  <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-muted">
                    {activeRange.label}
                  </span>
                </div>
                <p className="figure mt-3 text-[32px] leading-none tracking-[-0.02em]">
                  {formatNumber(totalChunks)}
                </p>
                <p className="mt-2 text-xs text-muted">
                  chunks indexed
                  {delta.percent !== null
                    ? ` · ${formatSignedPercent(delta.percent)} vs the previous ${activeRange.label}`
                    : delta.current > 0
                      ? " · no earlier window to compare"
                      : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="figure text-xs text-muted">
                  avg {formatNumber(Math.round(average))} / {range === "24h" ? "hour" : "day"}
                </p>
                <div className="mt-3 flex justify-end gap-1">
                  {ranges.map((item) => (
                    <button
                      className={`h-7 rounded-full px-2.5 text-[11px] font-semibold ${
                        item.id === range
                          ? "bg-ink text-white"
                          : "text-muted hover:bg-soft hover:text-ink"
                      }`}
                      key={item.id}
                      onClick={() => {
                        setRange(item.id);
                        setBrushOverride(null);
                      }}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {series.types.length ? (
                  <div className="mt-3 flex flex-wrap justify-end gap-x-3 gap-y-1">
                    {series.types.map((type, index) => (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted" key={type}>
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            background: ["var(--color-accent)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)"][index] ?? "var(--color-muted)"
                          }}
                        />
                        {type}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {totalChunks === 0 ? (
              <div className="mt-6 flex h-52 items-center justify-center rounded-control border border-dashed border-hairline text-center">
                <div>
                  <p className="text-sm font-medium">No chunks indexed in this range</p>
                  <p className="mt-1 max-w-sm text-sm text-muted">
                    {documentsInRange
                      ? "Documents were added here, but they do not have chunks yet."
                      : "This chart is built from each document’s created date and chunk count."}
                  </p>
                </div>
              </div>
            ) : (
              <IndexingChart
                brush={brush}
                onBrush={setBrushOverride}
                points={series.points}
                types={series.types}
              />
            )}
            {brushNarrowed && totalChunks > 0 ? (
              <p className="mt-2 text-xs text-muted">
                Window {series.points[brush[0]]?.tooltipLabel} – {series.points[brush[1]]?.tooltipLabel}
                {" · "}
                <span className="figure">{formatNumber(brushTotal)}</span> chunks
              </p>
            ) : null}

            <div className="mt-6 border-t border-hairline pt-5">
              <CorpusMap
                groups={map.groups}
                hidden={map.hidden}
                nodes={map.nodes}
                total={map.total}
              />
            </div>
          </div>
        </section>

        <section className="flex min-h-[640px] flex-col overflow-hidden rounded-pane border border-hairline bg-surface xl:min-h-0">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-medium">Attention</h2>
              <span className="figure text-xs text-muted">{formatNumber(attention.length)}</span>
            </div>
            <div className="mt-3 space-y-2">
              {attention.length ? (
                attention.map((item) => (
                  <article className="rounded-control border border-hairline p-3" key={item.id}>
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                          item.tone === "fail"
                            ? "bg-fail"
                            : item.tone === "warn"
                              ? "bg-warn"
                              : "bg-ready"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-[11px] text-muted">{item.meta}</span>
                          <Link
                            className="rounded-full border border-hairline px-2.5 py-1 text-[11px] font-semibold hover:bg-soft"
                            href={item.href}
                          >
                            {item.action}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-control border border-dashed border-hairline px-3 py-4 text-sm text-muted">
                  Nothing needs a look. Failed files, files still processing, and ready files untouched for 90 days show up here.
                </p>
              )}
            </div>

            <div className="mt-6 border-t border-hairline px-1 pt-5">
              <div className="flex items-center justify-between">
                <h2 className="micro">Activity</h2>
                <Link className="text-xs font-semibold" href="/insights">
                  Insights
                </Link>
              </div>
              {activity.length ? (
                CONVERSATION_GROUPS.map((group) => {
                  const items = activity.filter((item) => item.group === group);

                  if (!items.length) return null;

                  return (
                    <div className="mt-4" key={group}>
                      <p className="micro">{group}</p>
                      <div className="mt-2 space-y-3">
                        {items.map((item) => (
                          <div className="flex gap-2.5" key={item.id}>
                            <span
                              className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                                item.tone === "fail"
                                  ? "bg-fail"
                                  : item.tone === "warn"
                                    ? "bg-warn"
                                    : "bg-ready"
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="text-sm leading-5">{item.title}</p>
                              <p className="text-[11px] text-muted">{item.meta}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="mt-4 text-sm text-muted">
                  Uploads and threads will collect here.
                </p>
              )}
            </div>

            <p className="mt-auto px-1 pt-6 text-[11px] text-muted">
              {workspace.orgName}
              {workspace.role ? ` · ${workspace.role}` : ""}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
