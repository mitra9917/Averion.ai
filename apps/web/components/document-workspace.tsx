"use client";

import {
  Check,
  FileText,
  LayoutGrid,
  List,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { Skeleton } from "@/components/skeleton";
import { ToastStack, type ToastItem } from "@/components/toast-stack";
import { useWorkspace } from "@/components/workspace-context";
import {
  deleteDocument,
  DocumentListItem,
  getAccountProfile,
  listDocuments,
  uploadDocument
} from "@/lib/api";
import {
  fileTypeLabel,
  formatBytes,
  formatNumber,
  formatPercent,
  formatRelative,
  statusKind,
  statusLabel
} from "@/lib/meridian";

const ACCEPTED_EXTENSIONS = [".pdf", ".txt", ".docx"];
const ACCEPTED_INPUT_TYPES = ".pdf,.txt,.docx";

type Chip =
  | { kind: "all" }
  | { kind: "status"; status: "ready" | "processing" | "failed" }
  | { kind: "type"; type: string };

type SortKey = "recent" | "name" | "chunks" | "updated";

type UploadJob = {
  id: string;
  file: File;
  state: "queued" | "uploading" | "error";
  detail?: string;
};

function isAcceptedFile(file: File) {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function isProcessingStatus(status: string) {
  return status === "uploaded" || status === "processing";
}

function dotClass(status: string) {
  const kind = statusKind(status);

  if (kind === "ready") return "bg-ready";
  if (kind === "failed") return "bg-fail";
  if (kind === "processing") return "bg-warn";
  return "bg-muted";
}

export function DocumentWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingJobs = useRef<UploadJob[]>([]);
  const draining = useRef(false);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    searchParams.get("document")
  );
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("search") ?? "");
  const initialStatus = searchParams.get("status");
  const [chip, setChip] = useState<Chip>(
    initialStatus === "ready" || initialStatus === "processing" || initialStatus === "failed"
      ? { kind: "status", status: initialStatus }
      : { kind: "all" }
  );
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [view, setView] = useState<"list" | "grid">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dragDepth = useRef(0);

  const pushToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 7000);
  }, []);

  const loadDocuments = useCallback(async (quiet = false) => {
    if (quiet) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const result = await listDocuments();
      setDocuments(result);
      setSelectedDocumentId((current) => {
        if (current && result.some((item) => item.document_id === current)) {
          return current;
        }

        return result[0]?.document_id ?? null;
      });
    } catch (loadError) {
      pushToast({
        tone: "error",
        title: "Could not load the library",
        description: loadError instanceof Error ? loadError.message : "Try again in a moment."
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [pushToast]);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      setIsLoading(true);

      try {
        const [result, profile] = await Promise.all([listDocuments(), getAccountProfile()]);

        if (!active) return;

        setDocuments(result);
        setViewerRole(profile.role);
        setSelectedDocumentId((current) => {
          if (current && result.some((item) => item.document_id === current)) {
            return current;
          }

          return result[0]?.document_id ?? null;
        });
      } catch (loadError) {
        if (!active) return;
        pushToast({
          tone: "error",
          title: "Could not load the library",
          description: loadError instanceof Error ? loadError.message : "Try again in a moment."
        });
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadInitialData();

    return () => {
      active = false;
    };
  }, [pushToast]);

  useEffect(() => {
    if (!documents.some((document) => isProcessingStatus(document.status))) {
      return;
    }

    const timer = window.setInterval(() => void loadDocuments(true), 5000);
    return () => window.clearInterval(timer);
  }, [documents, loadDocuments]);

  useEffect(() => {
    if (!menu) return;

    function close() {
      setMenu(null);
    }

    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const selectedDocument =
    documents.find((document) => document.document_id === selectedDocumentId) ?? null;
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const document of documents) {
      const type = fileTypeLabel(document.file_type);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }

    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [documents]);
  const counts = {
    total: documents.length,
    ready: documents.filter((item) => item.status === "ready").length,
    processing: documents.filter((item) => isProcessingStatus(item.status)).length,
    failed: documents.filter((item) => item.status === "failed").length,
    chunks: documents.reduce((total, item) => total + item.chunks_count, 0)
  };
  const maxChunks = Math.max(...documents.map((document) => document.chunks_count), 1);
  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const next = documents.filter((document) => {
      const matchesQuery =
        !normalizedQuery ||
        document.filename.toLowerCase().includes(normalizedQuery) ||
        document.file_type.toLowerCase().includes(normalizedQuery);
      const matchesChip =
        chip.kind === "all" ||
        (chip.kind === "status" &&
          (chip.status === "processing"
            ? isProcessingStatus(document.status)
            : document.status === chip.status)) ||
        (chip.kind === "type" && fileTypeLabel(document.file_type) === chip.type);
      return matchesQuery && matchesChip;
    });

    next.sort((left, right) => {
      if (sortKey === "name") return left.filename.localeCompare(right.filename);
      if (sortKey === "chunks") return right.chunks_count - left.chunks_count;
      if (sortKey === "updated") {
        return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
      }

      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });

    return next;
  }, [chip, documents, query, sortKey]);

  async function drain() {
    if (draining.current) return;
    draining.current = true;

    try {
      while (pendingJobs.current.length) {
        const job = pendingJobs.current[0];
        setJobs((current) =>
          current.map((item) =>
            item.id === job.id ? { ...item, state: "uploading" } : item
          )
        );

        try {
          const result = await uploadDocument(job.file);
          pendingJobs.current.shift();
          setJobs((current) => current.filter((item) => item.id !== job.id));
          await loadDocuments(true);
          setSelectedDocumentId(result.document_id);
        } catch (uploadError) {
          pendingJobs.current.shift();
          const description =
            uploadError instanceof Error ? uploadError.message : "Document upload failed.";
          setJobs((current) =>
            current.map((item) =>
              item.id === job.id ? { ...item, state: "error", detail: description } : item
            )
          );
          pushToast({
            tone: "error",
            title: /password|encrypted|protected/i.test(description)
              ? `${job.file.name} can't be indexed`
              : `${job.file.name} could not be indexed`,
            description
          });
        }
      }
    } finally {
      draining.current = false;
    }
  }

  function enqueue(files: File[]) {
    const accepted: UploadJob[] = [];

    for (const file of files) {
      if (!isAcceptedFile(file)) {
        pushToast({
          tone: "error",
          title: `${file.name} was skipped`,
          description: "Choose a PDF, TXT, or DOCX document."
        });
        continue;
      }

      accepted.push({ id: crypto.randomUUID(), file, state: "queued" });
    }

    if (!accepted.length) return;

    pendingJobs.current.push(...accepted);
    setJobs((current) => [...current, ...accepted]);
    void drain();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    enqueue(Array.from(event.dataTransfer.files));
  }

  async function handleDelete(document: DocumentListItem) {
    if (
      !window.confirm(
        `Delete "${document.filename}"? Its chunks and embeddings will also be removed from chat retrieval.`
      )
    ) {
      return;
    }

    setDeletingId(document.document_id);
    setMenu(null);

    try {
      await deleteDocument(document.document_id);
      setDocuments((current) =>
        current.filter((item) => item.document_id !== document.document_id)
      );
      setSelectedDocumentId((current) =>
        current === document.document_id ? null : current
      );
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(document.document_id);
        return next;
      });
    } catch (deleteError) {
      pushToast({
        tone: "error",
        title: `Could not delete ${document.filename}`,
        description:
          deleteError instanceof Error ? deleteError.message : "Document could not be deleted."
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelected() {
    const ids = [...selectedIds];

    if (!ids.length || viewerRole !== "owner") return;

    if (
      !window.confirm(
        `Delete ${ids.length} document${ids.length === 1 ? "" : "s"}? Their chunks and embeddings will also be removed from chat retrieval.`
      )
    ) {
      return;
    }

    for (const id of ids) {
      const document = documents.find((item) => item.document_id === id);

      if (!document) continue;

      setDeletingId(id);

      try {
        await deleteDocument(id);
        setDocuments((current) => current.filter((item) => item.document_id !== id));
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      } catch (deleteError) {
        pushToast({
          tone: "error",
          title: `Could not delete ${document.filename}`,
          description:
            deleteError instanceof Error ? deleteError.message : "Document could not be deleted."
        });
        break;
      } finally {
        setDeletingId(null);
      }
    }
  }

  function askAboutDocument(document: DocumentListItem) {
    const params = new URLSearchParams({
      document: document.document_id,
      filename: document.filename
    });
    router.push(`/chat?${params.toString()}`);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }

  function toggleAll() {
    const visible = filteredDocuments.map((document) => document.document_id);
    const allSelected = visible.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(visible));
  }

  const menuDocument = documents.find((document) => document.document_id === menu?.id) ?? null;
  const attention = documents
    .filter((document) => statusKind(document.status) !== "ready")
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-3 px-3 pt-1 pb-24 xl:h-[calc(100dvh-3.5rem)]">
      <div className="flex flex-wrap items-end justify-between gap-3 px-2">
        <div>
          <h1 className="display text-[30px]">Library</h1>
          <p className="mt-1 text-sm text-muted">
            {formatNumber(counts.total)} documents · {formatNumber(counts.chunks)} chunks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-hairline bg-surface p-0.5">
            <button
              aria-label="List view"
              aria-pressed={view === "list"}
              className={`flex size-8 items-center justify-center rounded-full ${
                view === "list" ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
              onClick={() => setView("list")}
              type="button"
            >
              <List size={15} />
            </button>
            <button
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={`flex size-8 items-center justify-center rounded-full ${
                view === "grid" ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
              onClick={() => setView("grid")}
              type="button"
            >
              <LayoutGrid size={15} />
            </button>
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-full border border-hairline bg-surface px-3 text-xs font-semibold hover:bg-soft disabled:opacity-50"
            disabled={isLoading || isRefreshing}
            onClick={() => void loadDocuments(true)}
            type="button"
          >
            <RefreshCw className={isRefreshing ? "animate-spin" : ""} size={14} />
            Refresh
          </button>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-3 text-xs font-semibold text-white hover:bg-ink/90"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <Upload size={14} />
            Upload
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-2">
        <ChipButton
          active={chip.kind === "all"}
          count={counts.total}
          label="All"
          onClick={() => setChip({ kind: "all" })}
        />
        <ChipButton
          active={chip.kind === "status" && chip.status === "ready"}
          count={counts.ready}
          label="Ready"
          onClick={() => setChip({ kind: "status", status: "ready" })}
        />
        <ChipButton
          active={chip.kind === "status" && chip.status === "processing"}
          count={counts.processing}
          label="Processing"
          onClick={() => setChip({ kind: "status", status: "processing" })}
        />
        <ChipButton
          active={chip.kind === "status" && chip.status === "failed"}
          count={counts.failed}
          label="Failed"
          onClick={() => setChip({ kind: "status", status: "failed" })}
        />
        {typeCounts.map(([type, count]) => (
          <ChipButton
            active={chip.kind === "type" && chip.type === type}
            count={count}
            key={type}
            label={type}
            onClick={() => setChip({ kind: "type", type })}
          />
        ))}
        <label className="relative ml-auto min-w-40 flex-1 sm:max-w-56">
          <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={14} />
          <input
            className="h-8 w-full rounded-full border border-hairline bg-surface pr-3 pl-8 text-xs outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name"
            value={query}
          />
        </label>
        <label className="relative">
          <select
            aria-label="Sort documents"
            className="h-8 appearance-none rounded-full border border-hairline bg-surface pr-7 pl-3 text-xs outline-none"
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            value={sortKey}
          >
            <option value="recent">Recently added</option>
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
            <option value="chunks">Chunks</option>
          </select>
        </label>
      </div>

      <div
        className={`rounded-pane border border-dashed px-4 py-3 transition ${
          isDragging ? "border-ink bg-surface" : "border-hairline bg-surface/60"
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setIsDragging(true);
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          accept={ACCEPTED_INPUT_TYPES}
          className="hidden"
          multiple
          onChange={(event) => {
            enqueue(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />
        {jobs.length === 0 ? (
          <button
            className="flex w-full items-center justify-center gap-3 py-2 text-sm text-muted hover:text-ink"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            <Upload size={16} />
            Drop PDF, TXT, or DOCX files here
          </button>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <div className="flex items-center gap-3" key={job.id}>
                <FileText className="text-muted" size={16} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{job.file.name}</span>
                    <span className="text-xs text-muted">
                      {formatBytes(job.file.size)} · {job.state === "error" ? "Failed" : job.state === "uploading" ? "Uploading" : "Queued"}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-soft">
                    {job.state === "error" ? (
                      <div className="h-full w-full bg-fail" />
                    ) : (
                      <div className="indeterminate h-full w-1/3 rounded-full bg-ink" />
                    )}
                  </div>
                  {job.detail ? <p className="mt-1 text-xs text-muted">{job.detail}</p> : null}
                </div>
                {job.state === "error" ? (
                  <button
                    aria-label={`Dismiss ${job.file.name}`}
                    className="rounded-full p-1 text-muted hover:bg-soft"
                    onClick={() => setJobs((current) => current.filter((item) => item.id !== job.id))}
                    type="button"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-h-0 overflow-hidden rounded-pane border border-hairline bg-surface">
          {isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
              <FileText className="text-muted" size={22} />
              <p className="mt-3 text-sm font-medium">
                {documents.length ? "No documents match these filters" : "The library is empty"}
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                {documents.length
                  ? "Clear a chip or change the name filter."
                  : "Drop a PDF, TXT, or DOCX file to start the index."}
              </p>
            </div>
          ) : view === "list" ? (
            <div className="h-full overflow-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="sticky top-0 bg-surface text-[11px] tracking-[0.08em] text-muted uppercase">
                  <tr className="border-b border-hairline">
                    <th className="w-10 px-3 py-3">
                      <input
                        aria-label="Select all visible documents"
                        checked={
                          filteredDocuments.length > 0 &&
                          filteredDocuments.every((document) => selectedIds.has(document.document_id))
                        }
                        onChange={toggleAll}
                        type="checkbox"
                      />
                    </th>
                    <th className="px-3 py-3 font-semibold">Name</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Chunks</th>
                    <th className="px-3 py-3 font-semibold">Added</th>
                    <th className="w-12 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map((document) => (
                    <tr
                      className={`border-b border-hairline last:border-0 hover:bg-soft ${
                        selectedDocumentId === document.document_id ? "bg-soft/70" : ""
                      }`}
                      key={document.document_id}
                      onClick={() => setSelectedDocumentId(document.document_id)}
                    >
                      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                        <input
                          aria-label={`Select ${document.filename}`}
                          checked={selectedIds.has(document.document_id)}
                          onChange={() => toggleSelected(document.document_id)}
                          type="checkbox"
                        />
                      </td>
                      <td className="max-w-xs px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-soft px-1.5 py-0.5 font-mono text-[10px]">
                            {fileTypeLabel(document.file_type)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{document.filename}</span>
                            <span className="mt-1 block h-1 w-24 overflow-hidden rounded-full bg-soft">
                              {isProcessingStatus(document.status) ? (
                                <span className="indeterminate block h-full w-1/2 bg-warn" />
                              ) : (
                                <span
                                  className="block h-full bg-ink"
                                  style={{
                                    width: document.chunks_count
                                      ? `${Math.max(6, (document.chunks_count / maxChunks) * 100)}%`
                                      : "0%"
                                  }}
                                />
                              )}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <span className="inline-flex items-center gap-2">
                          <span className={`size-1.5 rounded-full ${dotClass(document.status)}`} />
                          {statusLabel(document.status)}
                        </span>
                      </td>
                      <td className="figure px-3 py-3 text-sm">{formatNumber(document.chunks_count)}</td>
                      <td className="px-3 py-3 text-xs text-muted">{formatRelative(document.created_at)}</td>
                      <td className="px-3 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                        <button
                          aria-label={`Actions for ${document.filename}`}
                          className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink"
                          onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            setMenu({
                              id: document.document_id,
                              top: rect.bottom + 6,
                              left: Math.max(12, rect.right - 196)
                            });
                          }}
                          type="button"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid h-full content-start gap-3 overflow-auto p-3 sm:grid-cols-2">
              {filteredDocuments.map((document) => (
                <article
                  className={`rounded-control border p-3 hover:border-ink ${
                    selectedDocumentId === document.document_id ? "border-ink" : "border-hairline"
                  }`}
                  key={document.document_id}
                  onClick={() => setSelectedDocumentId(document.document_id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-md bg-soft px-1.5 py-0.5 font-mono text-[10px]">
                      {fileTypeLabel(document.file_type)}
                    </span>
                    <input
                      aria-label={`Select ${document.filename}`}
                      checked={selectedIds.has(document.document_id)}
                      onChange={() => toggleSelected(document.document_id)}
                      onClick={(event) => event.stopPropagation()}
                      type="checkbox"
                    />
                  </div>
                  <p className="mt-3 truncate text-sm font-medium">{document.filename}</p>
                  <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted">
                    <span className={`size-1.5 rounded-full ${dotClass(document.status)}`} />
                    {statusLabel(document.status)} · {formatNumber(document.chunks_count)} chunks
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="min-h-0 space-y-3 overflow-auto">
          {selectedDocument ? (
            <section className="rounded-pane border border-hairline bg-surface p-4">
              <p className="micro">Selected</p>
              <p className="mt-2 text-sm font-medium break-words">{selectedDocument.filename}</p>
              <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted">
                <span className={`size-1.5 rounded-full ${dotClass(selectedDocument.status)}`} />
                {statusLabel(selectedDocument.status)} · {formatNumber(selectedDocument.chunks_count)} chunks
              </p>
              <p className="mt-3 text-sm leading-6 text-muted">
                {selectedDocument.status === "ready"
                  ? `${formatNumber(selectedDocument.chunks_count)} indexed chunks are available to this workspace.`
                  : selectedDocument.status === "failed"
                    ? "This document is not available to chat until the indexing error is resolved."
                    : "Indexing is still running. This page checks again every few seconds."}
              </p>
              {selectedDocument.error_message ? (
                <p className="mt-3 rounded-control bg-soft px-3 py-2 text-xs leading-5">
                  {selectedDocument.error_message}
                </p>
              ) : null}
              <button
                className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-ink text-xs font-semibold text-white hover:bg-ink/90 disabled:opacity-40"
                disabled={selectedDocument.status !== "ready"}
                onClick={() => askAboutDocument(selectedDocument)}
                type="button"
              >
                <MessageSquare size={14} />
                Ask about this
              </button>
            </section>
          ) : null}

          <section className="rounded-pane border border-hairline bg-surface p-4">
            <div className="flex items-end justify-between">
              <h2 className="text-sm font-medium">Library health</h2>
              <p className="figure text-[28px] leading-none tracking-[-0.02em]">
                {formatPercent(counts.ready, counts.total, 1)}
              </p>
            </div>
            <p className="mt-1 text-xs text-muted">ready to cite</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-soft">
              <div
                className="h-full bg-ink"
                style={{ width: counts.total ? `${(counts.ready / counts.total) * 100}%` : "0%" }}
              />
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                ["Ready", counts.ready, "bg-ready"],
                ["Processing", counts.processing, "bg-warn"],
                ["Failed", counts.failed, "bg-fail"]
              ].map(([label, value, dot]) => (
                <li className="flex items-center gap-2" key={label}>
                  <span className={`size-1.5 rounded-full ${dot}`} />
                  <span className="flex-1">{label}</span>
                  <span className="figure">{formatNumber(Number(value))}</span>
                  <span className="figure w-12 text-right text-xs text-muted">
                    {formatPercent(Number(value), counts.total)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-hairline pt-4">
              <p className="micro">By type</p>
              <div className="mt-3 space-y-2">
                {typeCounts.length ? (
                  typeCounts.map(([type, count]) => (
                    <div key={type}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span>{type}</span>
                        <span className="figure">{formatNumber(count)}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-soft">
                        <div
                          className="h-full bg-ink"
                          style={{ width: counts.total ? `${(count / counts.total) * 100}%` : "0%" }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted">No files yet.</p>
                )}
              </div>
            </div>
            <div className="mt-5 border-t border-hairline pt-4">
              <p className="micro">Needs attention</p>
              {attention.length ? (
                <ul className="mt-3 space-y-2">
                  {attention.map((document) => (
                    <li key={document.document_id}>
                      <button
                        className="flex w-full items-start gap-2 rounded-control px-1 py-1 text-left hover:bg-soft"
                        onClick={() => setSelectedDocumentId(document.document_id)}
                        type="button"
                      >
                        <span className={`mt-1.5 size-1.5 rounded-full ${dotClass(document.status)}`} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{document.filename}</span>
                          <span className="text-[11px] text-muted">
                            {statusLabel(document.status)}
                            {document.error_message ? ` · ${document.error_message}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs leading-5 text-muted">
                  Nothing is failed or still processing.
                </p>
              )}
              <p className="mt-4 text-[11px] text-muted">
                Latest update{" "}
                {documents[0]
                  ? formatRelative(
                      documents.reduce((latest, document) =>
                        document.updated_at > latest ? document.updated_at : latest
                      , documents[0].updated_at)
                    )
                  : "—"}
                {" · "}
                {workspace.orgName}
              </p>
            </div>
          </section>
        </aside>
      </div>

      {selectedIds.size > 0 ? (
        <div className="fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-hairline bg-surface px-3 py-2 shadow-float">
          <span className="figure px-2 text-sm">{selectedIds.size} selected</span>
          {viewerRole === "owner" ? (
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-semibold text-white"
              onClick={() => void deleteSelected()}
              type="button"
            >
              <Trash2 size={13} />
              Delete
            </button>
          ) : null}
          <button
            className="text-xs font-semibold text-muted"
            onClick={() => setSelectedIds(new Set())}
            type="button"
          >
            Clear
          </button>
        </div>
      ) : null}

      {menu && menuDocument ? (
        <div
          className="fixed z-50 w-48 rounded-pane border border-hairline bg-surface p-1 shadow-float"
          onMouseDown={(event) => event.stopPropagation()}
          style={{ top: menu.top, left: menu.left }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm hover:bg-soft"
            onClick={() => {
              setSelectedDocumentId(menuDocument.document_id);
              setMenu(null);
            }}
            type="button"
          >
            <FileText size={14} />
            Details
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm hover:bg-soft disabled:opacity-40"
            disabled={menuDocument.status !== "ready"}
            onClick={() => askAboutDocument(menuDocument)}
            type="button"
          >
            <MessageSquare size={14} />
            Ask about this
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm hover:bg-soft"
            onClick={() => {
              void navigator.clipboard.writeText(menuDocument.document_id);
              setMenu(null);
              pushToast({ tone: "success", title: "Document id copied" });
            }}
            type="button"
          >
            <Check size={14} />
            Copy id
          </button>
          {viewerRole === "owner" ? (
            <button
              className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm text-fail hover:bg-soft"
              onClick={() => void handleDelete(menuDocument)}
              type="button"
            >
              {deletingId === menuDocument.document_id ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : (
                <Trash2 size={14} />
              )}
              Delete document
            </button>
          ) : null}
        </div>
      ) : null}
      <ToastStack
        onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
        toasts={toasts}
      />
    </div>
  );
}

function ChipButton({
  label,
  count,
  active,
  onClick
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${
        active ? "border-ink bg-ink text-white" : "border-hairline bg-surface hover:bg-soft"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
      <span className={`figure ${active ? "text-white/80" : "text-muted"}`}>{formatNumber(count)}</span>
    </button>
  );
}
