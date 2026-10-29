"use client";

import { X } from "lucide-react";
import Link from "next/link";

export type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone?: "error" | "success";
  href?: string;
  actionLabel?: string;
};

export function ToastStack({
  toasts,
  onDismiss
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-50 flex w-[min(100%-2rem,360px)] flex-col gap-2">
      {toasts.map((toast) => (
        <article
          className="pointer-events-auto rounded-pane border border-hairline bg-surface p-4 shadow-float"
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-1.5 size-2 shrink-0 rounded-full ${
                toast.tone === "error" ? "bg-fail" : "bg-ready"
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{toast.title}</p>
              {toast.description ? (
                <p className="mt-1 text-sm leading-5 text-muted">
                  {toast.description}
                </p>
              ) : null}
              <div className="mt-3 flex items-center gap-3">
                {toast.href && toast.actionLabel ? (
                  <Link
                    className="text-xs font-semibold text-ink underline decoration-hairline underline-offset-4"
                    href={toast.href}
                  >
                    {toast.actionLabel}
                  </Link>
                ) : null}
                <button
                  className="text-xs font-semibold text-muted hover:text-ink"
                  onClick={() => onDismiss(toast.id)}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button
              aria-label="Dismiss notification"
              className="rounded-full p-1 text-muted hover:bg-soft hover:text-ink"
              onClick={() => onDismiss(toast.id)}
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
