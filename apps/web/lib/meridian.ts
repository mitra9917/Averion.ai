import type {
  ConversationSummary,
  DocumentListItem
} from "@/lib/api";

export const CONVERSATION_GROUPS = [
  "Today",
  "Yesterday",
  "Earlier this week",
  "Earlier"
] as const;

export type ConversationGroup = (typeof CONVERSATION_GROUPS)[number];

export type StatusKind = "ready" | "processing" | "failed" | "other";

export type RangeKey = "24h" | "14d" | "30d" | "90d" | "12m" | "all";

export type SeriesPoint = {
  start: Date;
  end: Date;
  axisLabel: string;
  tooltipLabel: string;
  byType: Record<string, number>;
  total: number;
  documents: number;
};

export type AttentionTone = "fail" | "warn" | "ready";

export type AttentionItem = {
  id: string;
  tone: AttentionTone;
  title: string;
  detail: string;
  meta: string;
  action: string;
  href: string;
};

export type ActivityItem = {
  id: string;
  title: string;
  meta: string;
  timestamp: string;
  group: ConversationGroup;
  tone: AttentionTone;
};

export type CorpusNode = {
  id: string;
  filename: string;
  type: string;
  chunks: number;
  x: number;
  y: number;
  r: number;
};

export type CorpusGroup = {
  type: string;
  count: number;
  x: number;
  y: number;
};

export type AnswerPiece =
  | { kind: "text"; text: string }
  | { kind: "cite"; text: string; indexes: number[] };

const DAY_MS = 86_400_000;

export function initials(value: string | null | undefined, fallback = "A") {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (!parts.length) {
    return fallback;
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function firstName(value: string | null | undefined) {
  const part = value?.trim().split(/\s+/).filter(Boolean)[0];
  return part || null;
}

export function greetingFor(date: Date) {
  const hour = date.getHours();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(date);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

export function formatPercent(part: number, total: number, digits = 1) {
  if (!total) return "0%";
  const value = (part / total) * 100;
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number) {
  const rounded = Math.round(value * 10) / 10;
  const text = `${Math.abs(rounded).toFixed(1)}%`;

  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `−${text}`;
  return "0%";
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatRelative(dateValue: string, now = Date.now()) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const minutes = Math.round((now - date.getTime()) / 60_000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) {
    return new Intl.DateTimeFormat("en", { weekday: "short" }).format(date);
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short"
  }).format(date);
}

export function formatClock(dateValue: string) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function dayBucket(dateValue: string, now = new Date()): ConversationGroup {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Earlier";
  }

  const start = startOfDay(now);
  const yesterday = addDays(start, -1);
  const week = addDays(start, -7);

  if (date >= start) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= week) return "Earlier this week";
  return "Earlier";
}

export function fileTypeLabel(value: string | null | undefined) {
  const cleaned = value?.trim().toLowerCase().replace(/^\./, "") ?? "";
  return cleaned ? cleaned.toUpperCase() : "FILE";
}

export function statusKind(status: string): StatusKind {
  const value = status.toLowerCase();

  if (value === "ready") return "ready";
  if (value === "failed") return "failed";
  if (
    value === "uploaded" ||
    value === "processing" ||
    value === "pending" ||
    value === "queued" ||
    value === "indexing"
  ) {
    return "processing";
  }

  return "other";
}

export function statusLabel(status: string) {
  const kind = statusKind(status);

  if (kind === "ready") return "Ready";
  if (kind === "failed") return "Failed";
  if (kind === "processing") {
    return status.toLowerCase() === "uploaded" ? "Uploaded" : "Processing";
  }

  return status || "Unknown";
}

export function isPasswordIssue(message: string | null | undefined) {
  return Boolean(message && /password|encrypted|protected/i.test(message));
}

export function sortByUpdated<T extends { updated_at: string }>(items: T[]) {
  return [...items].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  );
}

/**
 * The documents API does not return a throughput time series. Each point
 * sums chunks_count for documents whose created_at falls in that bucket,
 * stacked by file type. Buckets with no uploads stay at zero.
 */
export function buildChunkSeries(
  documents: DocumentListItem[],
  range: RangeKey,
  now = new Date()
): SeriesPoint[] {
  const buckets = bucketsForRange(range, documents, now);

  return buckets.map((bucket) => {
    const byType: Record<string, number> = {};
    let documentsInBucket = 0;

    for (const document of documents) {
      const created = new Date(document.created_at);

      if (Number.isNaN(created.getTime())) {
        continue;
      }

      if (created < bucket.start || created >= bucket.end) {
        continue;
      }

      const type = fileTypeLabel(document.file_type);
      byType[type] = (byType[type] ?? 0) + document.chunks_count;
      documentsInBucket += 1;
    }

    const total = Object.values(byType).reduce((sum, value) => sum + value, 0);

    return {
      start: bucket.start,
      end: bucket.end,
      axisLabel: bucket.axisLabel,
      tooltipLabel: bucket.tooltipLabel,
      byType,
      total,
      documents: documentsInBucket
    };
  });
}

export function collapseSeries(points: SeriesPoint[], maxTypes = 3) {
  const totals = new Map<string, number>();

  for (const point of points) {
    for (const [type, value] of Object.entries(point.byType)) {
      totals.set(type, (totals.get(type) ?? 0) + value);
    }
  }

  const ranked = [...totals.entries()].sort((left, right) => right[1] - left[1]);
  const keep = ranked.slice(0, maxTypes).map(([type]) => type);
  const rest = ranked.slice(maxTypes).map(([type]) => type);

  if (!rest.length) {
    return { points, types: keep };
  }

  const collapsed = points.map((point) => {
    const byType: Record<string, number> = {};

    for (const type of keep) {
      byType[type] = point.byType[type] ?? 0;
    }

    byType.Other = rest.reduce(
      (sum, type) => sum + (point.byType[type] ?? 0),
      0
    );

    return { ...point, byType };
  });

  return { points: collapsed, types: [...keep, "Other"] };
}

export function seriesTotal(points: SeriesPoint[]) {
  return points.reduce((sum, point) => sum + point.total, 0);
}

export function chunksAddedBetween(
  documents: DocumentListItem[],
  start: Date,
  end: Date
) {
  return documents.reduce((sum, document) => {
    const created = new Date(document.created_at);

    if (Number.isNaN(created.getTime()) || created < start || created >= end) {
      return sum;
    }

    return sum + document.chunks_count;
  }, 0);
}

export function flowDelta(
  documents: DocumentListItem[],
  days: number,
  now = new Date()
) {
  const end = new Date(now.getTime());
  const start = addDays(end, -days);
  const previousStart = addDays(start, -days);
  const current = chunksAddedBetween(documents, start, end);
  const previous = chunksAddedBetween(documents, previousStart, start);

  if (previous === 0) {
    return { current, previous, percent: null as number | null };
  }

  return {
    current,
    previous,
    percent: ((current - previous) / previous) * 100
  };
}

export type WeekColumn = {
  start: Date;
  label: string;
  tooltip: string;
};

export function weekColumns(
  range: "30d" | "12m" | "all",
  documents: DocumentListItem[],
  now = new Date()
): WeekColumn[] {
  const end = startOfDay(now);
  let days = range === "30d" ? 28 : 364;

  if (range === "all") {
    const stamps = documents
      .map((document) => new Date(document.created_at).getTime())
      .filter((value) => !Number.isNaN(value));
    const earliest = stamps.length ? Math.min(...stamps) : end.getTime();
    const span = Math.ceil((end.getTime() - earliest) / DAY_MS) + 7;
    days = Math.min(364, Math.max(28, span));
  }

  const weeks = Math.ceil(days / 7);
  const first = addDays(end, -(weeks * 7 - 1));
  const columns: WeekColumn[] = [];
  let lastMonth = -1;

  for (let index = 0; index < weeks; index += 1) {
    const start = addDays(first, index * 7);
    const month = start.getMonth();
    const showMonth = month !== lastMonth;
    lastMonth = month;
    columns.push({
      start,
      label: showMonth
        ? new Intl.DateTimeFormat("en", { month: "short" })
            .format(start)
            .toUpperCase()
        : "",
      tooltip: `Week of ${new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short"
      }).format(start)}`
    });
  }

  return columns;
}

export function chunksInWeek(document: DocumentListItem, weekStart: Date) {
  const created = new Date(document.created_at);
  const weekEnd = addDays(weekStart, 7);

  if (Number.isNaN(created.getTime()) || created < weekStart || created >= weekEnd) {
    return 0;
  }

  return document.chunks_count;
}

export function attentionItems(
  documents: DocumentListItem[],
  now = Date.now()
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const ranked = sortByUpdated(documents);

  for (const document of ranked) {
    const kind = statusKind(document.status);

    if (kind === "failed") {
      const password = isPasswordIssue(document.error_message);
      items.push({
        id: document.document_id,
        tone: "fail",
        title: password
          ? `${document.filename} won't open`
          : `${document.filename} failed to index`,
        detail:
          document.error_message ||
          "Indexing failed. Open the file in the library and upload it again if it is still needed.",
        meta: `Failed ${formatRelative(document.updated_at, now)}`,
        action: "Review",
        href: `/documents?document=${encodeURIComponent(document.document_id)}`
      });
    } else if (kind === "processing") {
      items.push({
        id: document.document_id,
        tone: "warn",
        title: `${document.filename} is still processing`,
        detail:
          "Indexing is still running. The library keeps polling until the file is ready or fails.",
        meta: `Updated ${formatRelative(document.updated_at, now)}`,
        action: "View",
        href: `/documents?document=${encodeURIComponent(document.document_id)}`
      });
    }
  }

  const stale = ranked.filter((document) => {
    if (statusKind(document.status) !== "ready") {
      return false;
    }

    return now - new Date(document.updated_at).getTime() > 90 * DAY_MS;
  });

  if (stale.length) {
    const first = stale[0];
    items.push({
      id: "stale-ready",
      tone: "ready",
      title:
        stale.length === 1
          ? `${first.filename} has not changed in 90 days`
          : `${stale.length} ready documents have not changed in 90 days`,
      detail:
        "They are still available to cite. This is based on updated_at, not a citation-freshness feed.",
      meta: "Ready",
      action: "Review",
      href: "/documents"
    });
  }

  return items.slice(0, 4);
}

export function activityFeed(
  documents: DocumentListItem[],
  conversations: ConversationSummary[],
  now = new Date()
): ActivityItem[] {
  const documentItems: ActivityItem[] = documents.map((document) => {
    const kind = statusKind(document.status);
    const tone: AttentionTone =
      kind === "failed" ? "fail" : kind === "processing" ? "warn" : "ready";
    const title =
      kind === "failed"
        ? `${document.filename} failed indexing`
        : kind === "processing"
          ? `${document.filename} is indexing`
          : `${document.filename} is ready to cite`;

    return {
      id: `document-${document.document_id}`,
      title,
      meta: `Library · ${formatClock(document.updated_at)}`,
      timestamp: document.updated_at,
      group: dayBucket(document.updated_at, now),
      tone
    };
  });

  const conversationItems: ActivityItem[] = conversations.map((conversation) => ({
    id: `conversation-${conversation.id}`,
    title: conversation.title,
    meta: `Ask · ${formatClock(conversation.updated_at)}`,
    timestamp: conversation.updated_at,
    group: dayBucket(conversation.updated_at, now),
    tone: "ready"
  }));

  return [...documentItems, ...conversationItems]
    .sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
    )
    .slice(0, 8);
}

export function buildCorpusMap(documents: DocumentListItem[], limit = 36) {
  const ranked = [...documents].sort(
    (left, right) =>
      right.chunks_count - left.chunks_count ||
      left.filename.localeCompare(right.filename)
  );
  const shown = ranked.slice(0, limit);
  const groups = new Map<string, DocumentListItem[]>();

  for (const document of shown) {
    const type = fileTypeLabel(document.file_type);
    groups.set(type, [...(groups.get(type) ?? []), document]);
  }

  const names = [...groups.keys()];
  const maxChunks = Math.max(...shown.map((document) => document.chunks_count), 1);
  const nodes: CorpusNode[] = [];
  const groupMarks: CorpusGroup[] = [];

  names.forEach((type, groupIndex) => {
    const docs = groups.get(type) ?? [];
    const angle = (groupIndex / Math.max(names.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const spread = names.length === 1 ? 0 : 1;
    const cx = 320 + Math.cos(angle) * 150 * spread;
    const cy = 148 + Math.sin(angle) * 78 * spread;
    groupMarks.push({ type, count: docs.length, x: cx, y: cy });

    docs.forEach((document, index) => {
      const ring = Math.floor(index / 6);
      const position = index % 6;
      const onRing = Math.min(6, docs.length - ring * 6);
      const nodeAngle = (position / onRing) * Math.PI * 2 - Math.PI / 2;
      const radius = docs.length === 1 ? 0 : 20 + ring * 16;
      nodes.push({
        id: document.document_id,
        filename: document.filename,
        type,
        chunks: document.chunks_count,
        x: clamp(cx + Math.cos(nodeAngle) * radius, 28, 612),
        y: clamp(cy + Math.sin(nodeAngle) * radius * 0.82, 36, 268),
        r: 4.5 + (document.chunks_count / maxChunks) * 8.5
      });
    });
  });

  return {
    nodes,
    groups: groupMarks,
    hidden: Math.max(0, documents.length - shown.length),
    total: documents.length
  };
}

export function annotateAnswer(answer: string, snippets: string[]): AnswerPiece[] {
  const ranges: { start: number; end: number; index: number }[] = [];

  snippets.forEach((snippet, index) => {
    const found = findSnippetRange(answer, snippet);

    if (found) {
      ranges.push({ start: found[0], end: found[1], index });
    }
  });

  if (!ranges.length) {
    return answer ? [{ kind: "text", text: answer }] : [];
  }

  ranges.sort((left, right) => left.start - right.start || right.end - left.end);

  const pieces: AnswerPiece[] = [];
  let cursor = 0;
  let current: { start: number; end: number; indexes: number[] } | null = null;

  for (const range of ranges) {
    if (range.end <= cursor) {
      continue;
    }

    if (!current) {
      current = {
        start: Math.max(range.start, cursor),
        end: range.end,
        indexes: [range.index]
      };
      continue;
    }

    if (range.start <= current.end) {
      current.end = Math.max(current.end, range.end);
      if (!current.indexes.includes(range.index)) {
        current.indexes.push(range.index);
      }
      continue;
    }

    pushCite(pieces, answer, cursor, current);
    cursor = current.end;
    current = { start: range.start, end: range.end, indexes: [range.index] };
  }

  if (current) {
    pushCite(pieces, answer, cursor, current);
    cursor = current.end;
  }

  if (cursor < answer.length) {
    pieces.push({ kind: "text", text: answer.slice(cursor) });
  }

  return pieces;
}

export function unmatchedCitationIndexes(answer: string, snippets: string[]) {
  return snippets.flatMap((snippet, index) =>
    findSnippetRange(answer, snippet) ? [] : [index]
  );
}

export function quoteParts(snippet: string) {
  const text = snippet.trim();

  if (!text) {
    return { lead: "", rest: "" };
  }

  if (text.length <= 280) {
    return { lead: text, rest: "" };
  }

  const match = text.match(/^[\s\S]{24,}?[.!?]/);

  if (!match) {
    return { lead: text.slice(0, 220), rest: text.slice(220) };
  }

  return { lead: match[0], rest: text.slice(match[0].length) };
}

export function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function pushCite(
  pieces: AnswerPiece[],
  answer: string,
  cursor: number,
  range: { start: number; end: number; indexes: number[] }
) {
  if (range.start > cursor) {
    pieces.push({ kind: "text", text: answer.slice(cursor, range.start) });
  }

  pieces.push({
    kind: "cite",
    text: answer.slice(range.start, range.end),
    indexes: range.indexes
  });
}

function findSnippetRange(answer: string, snippet: string): [number, number] | null {
  const haystack = normalizeWithMap(answer);
  const needles = candidateNeedles(snippet);

  for (const needle of needles) {
    const at = haystack.text.indexOf(needle);

    if (at < 0) {
      continue;
    }

    const start = haystack.map[at];
    const end = haystack.map[at + needle.length - 1];

    if (start === undefined || end === undefined) {
      continue;
    }

    return [start, end + 1];
  }

  return null;
}

function candidateNeedles(snippet: string) {
  const clean = snippet.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 500);
  const needles: string[] = [];

  if (clean.length >= 8) {
    needles.push(clean);
  }

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.length >= 12)
    .sort((left, right) => right.length - left.length);
  needles.push(...sentences);

  const words = clean.split(" ").filter(Boolean);

  for (let size = Math.min(8, words.length); size >= 4; size -= 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      needles.push(words.slice(index, index + size).join(" "));

      if (needles.length > 28) {
        return dedupe(needles);
      }
    }
  }

  return dedupe(needles);
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}

function normalizeWithMap(value: string) {
  let text = "";
  const map: number[] = [];
  let lastSpace = true;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";

    if (/\s/.test(char)) {
      if (!lastSpace) {
        text += " ";
        map.push(index);
        lastSpace = true;
      }
      continue;
    }

    text += char.toLowerCase();
    map.push(index);
    lastSpace = false;
  }

  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    map.pop();
  }

  return { text, map };
}

function bucketsForRange(
  range: RangeKey,
  documents: DocumentListItem[],
  now: Date
) {
  if (range === "24h") {
    const endHour = startOfHour(now);
    const first = addHours(endHour, -23);

    return Array.from({ length: 24 }, (_, index) => {
      const start = addHours(first, index);
      return {
        start,
        end: addHours(start, 1),
        axisLabel: new Intl.DateTimeFormat("en", { hour: "numeric" }).format(start),
        tooltipLabel: new Intl.DateTimeFormat("en", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit"
        }).format(start)
      };
    });
  }

  const days =
    range === "14d" ? 14 : range === "30d" ? 30 : range === "90d" ? 90 : range === "12m" ? 364 : allTimeDays(documents, now);
  const today = startOfDay(now);
  const first = addDays(today, -(days - 1));

  return Array.from({ length: days }, (_, index) => {
    const start = addDays(first, index);
    return {
      start,
      end: addDays(start, 1),
      axisLabel: String(start.getDate()),
      tooltipLabel: new Intl.DateTimeFormat("en", {
        weekday: "short",
        day: "numeric",
        month: "short"
      }).format(start)
    };
  });
}

function allTimeDays(documents: DocumentListItem[], now: Date) {
  const stamps = documents
    .map((document) => new Date(document.created_at).getTime())
    .filter((value) => !Number.isNaN(value));

  if (!stamps.length) {
    return 14;
  }

  const earliest = startOfDay(new Date(Math.min(...stamps)));
  const span = Math.ceil((startOfDay(now).getTime() - earliest.getTime()) / DAY_MS) + 1;
  return Math.min(120, Math.max(14, span));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfHour(date: Date) {
  const next = new Date(date.getTime());
  next.setMinutes(0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3_600_000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
