"use client";

import { FileText, MessageSquare, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { destinations } from "@/components/destinations";
import { Skeleton } from "@/components/skeleton";
import {
  listConversations,
  listDocuments,
  type ConversationSummary,
  type DocumentListItem
} from "@/lib/api";
import { fileTypeLabel, formatNumber, statusLabel } from "@/lib/meridian";

type PaletteItem = {
  id: string;
  group: string;
  title: string;
  detail: string;
  href: string;
};

export function CommandPalette({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let ignore = false;

    void (async () => {
      setLoading(true);
      setError(null);
      const [documentsResult, conversationsResult] = await Promise.allSettled([
        listDocuments(),
        listConversations()
      ]);

      if (ignore) return;

      if (documentsResult.status === "fulfilled") {
        setDocuments(documentsResult.value);
      }

      if (conversationsResult.status === "fulfilled") {
        setConversations(conversationsResult.value.conversations);
      }

      if (
        documentsResult.status === "rejected" &&
        conversationsResult.status === "rejected"
      ) {
        setError("Search could not reach the workspace.");
      }

      setLoading(false);
    })();

    return () => {
      ignore = true;
    };
  }, [open]);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pages: PaletteItem[] = destinations
      .filter((item) => !needle || item.label.toLowerCase().includes(needle))
      .map((item) => ({
        id: `page-${item.href}`,
        group: "Go to",
        title: item.label,
        detail: `Shortcut ${item.shortcut}`,
        href: item.href
      }));
    const threads: PaletteItem[] = conversations
      .filter((item) => !needle || item.title.toLowerCase().includes(needle))
      .slice(0, needle ? 8 : 5)
      .map((item) => ({
        id: `conversation-${item.id}`,
        group: "Threads",
        title: item.title,
        detail: `${formatNumber(item.message_count)} messages`,
        href: `/chat?conversation=${encodeURIComponent(item.id)}`
      }));
    const files: PaletteItem[] = documents
      .filter(
        (item) =>
          !needle ||
          item.filename.toLowerCase().includes(needle) ||
          item.file_type.toLowerCase().includes(needle)
      )
      .slice(0, needle ? 8 : 5)
      .map((item) => ({
        id: `document-${item.document_id}`,
        group: "Library",
        title: item.filename,
        detail: `${fileTypeLabel(item.file_type)} · ${statusLabel(item.status)} · ${formatNumber(item.chunks_count)} chunks`,
        href: `/documents?document=${encodeURIComponent(item.document_id)}`
      }));

    return [...pages, ...threads, ...files];
  }, [conversations, documents, query]);

  const listKey = `${open ? "open" : "closed"}:${query}`;

  function choose(item: PaletteItem | undefined) {
    if (!item) return;
    onClose();
    setQuery("");
    router.push(item.href);
  }

  if (!open) {
    return null;
  }

  const groups = items.reduce<Record<string, PaletteItem[]>>((result, item) => {
    result[item.group] = [...(result[item.group] ?? []), item];
    return result;
  }, {});

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <button
        aria-label="Close search"
        className="absolute inset-0 bg-ink/20"
        onClick={onClose}
        type="button"
      />
      <div
        className="relative flex max-h-[min(640px,72vh)] w-full max-w-xl flex-col overflow-hidden rounded-pane border border-hairline bg-surface shadow-float"
        role="dialog"
        aria-modal="true"
        aria-label="Search the workspace"
      >
        <label className="flex items-center gap-3 border-b border-hairline px-4">
          <Search className="text-muted" size={16} />
          <input
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(items.length - 1, index + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(0, index - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(items[activeIndex]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder="Search threads, documents, and pages"
            ref={inputRef}
            value={query}
          />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto p-2" key={listKey}>
          {loading && !documents.length && !conversations.length ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">
              Nothing in this workspace matches that search.
            </p>
          ) : (
            Object.entries(groups).map(([group, groupItems]) => (
              <div className="mb-2" key={group}>
                <p className="micro px-3 py-2">{group}</p>
                {groupItems.map((item) => {
                  runningIndex += 1;
                  const index = runningIndex;
                  const active = index === activeIndex;
                  const Icon = item.group === "Threads" ? MessageSquare : FileText;

                  return (
                    <button
                      className={`flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left ${
                        active ? "bg-soft" : "hover:bg-soft"
                      }`}
                      key={item.id}
                      onClick={() => choose(item)}
                      onMouseEnter={() => setActiveIndex(index)}
                      type="button"
                    >
                      {item.group === "Go to" ? (
                        <span className="flex size-7 items-center justify-center rounded-full bg-canvas text-[11px] font-semibold">
                          {item.title.slice(0, 1)}
                        </span>
                      ) : (
                        <Icon className="text-muted" size={15} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{item.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {item.detail}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
          {error ? (
            <p className="px-3 pb-3 text-xs text-muted">{error}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
