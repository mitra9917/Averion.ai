"use client";

import { FormEvent, useState } from "react";
import { ThumbsDown, ThumbsUp, X } from "lucide-react";

import {
  FeedbackRating,
  submitFeedback as submitFeedbackRequest
} from "@/lib/api";

type FeedbackControlsProps = {
  messageId: string;
};

export function FeedbackControls({ messageId }: FeedbackControlsProps) {
  const [rating, setRating] = useState<FeedbackRating | null>(null);
  const [correction, setCorrection] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "submitted" | "error">("idle");

  async function submit(nextRating: FeedbackRating, correctionText = "") {
    setState("submitting");

    try {
      await submitFeedbackRequest({
        message_id: messageId,
        rating: nextRating,
        correction_text: correctionText.trim() || null
      });
      setState("submitted");
    } catch {
      setState("error");
    }
  }

  function chooseRating(nextRating: FeedbackRating) {
    setRating(nextRating);
    setState("idle");

    if (nextRating === "up") {
      void submit("up");
    }
  }

  function handleCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit("down", correction);
  }

  return (
    <div className="relative flex items-center gap-1">
      <button
        aria-label="Mark answer helpful"
        aria-pressed={rating === "up"}
        className={`rounded-full p-2 ${
          rating === "up" ? "bg-soft text-ready" : "text-muted hover:bg-soft hover:text-ink"
        }`}
        disabled={state === "submitting"}
        onClick={() => chooseRating("up")}
        type="button"
      >
        <ThumbsUp size={15} />
      </button>
      <button
        aria-label="Mark answer incorrect"
        aria-pressed={rating === "down"}
        className={`rounded-full p-2 ${
          rating === "down" ? "bg-soft text-fail" : "text-muted hover:bg-soft hover:text-ink"
        }`}
        disabled={state === "submitting"}
        onClick={() => chooseRating("down")}
        type="button"
      >
        <ThumbsDown size={15} />
      </button>

      {rating === "down" && state !== "submitted" ? (
        <form
          className="absolute bottom-11 left-0 z-20 w-72 rounded-pane border border-hairline bg-surface p-3 shadow-float"
          onSubmit={handleCorrection}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">How should this answer improve?</p>
            <button
              aria-label="Close feedback"
              className="text-muted hover:text-ink"
              onClick={() => setRating(null)}
              type="button"
            >
              <X size={14} />
            </button>
          </div>
          <textarea
            className="mt-3 min-h-20 w-full resize-none rounded-control border border-hairline bg-canvas p-2 text-xs outline-none"
            onChange={(event) => setCorrection(event.target.value)}
            placeholder="Describe the problem"
            value={correction}
          />
          <button
            className="mt-2 h-8 w-full rounded-full bg-ink text-xs font-semibold text-white hover:bg-ink/90 disabled:opacity-50"
            disabled={state === "submitting"}
            type="submit"
          >
            {state === "submitting" ? "Sending…" : "Send feedback"}
          </button>
          {state === "error" ? (
            <p className="mt-2 text-xs text-fail">Feedback could not be sent.</p>
          ) : null}
        </form>
      ) : null}
      {state === "submitted" ? (
        <span className="ml-1 text-[11px] font-medium text-muted">Feedback saved</span>
      ) : null}
    </div>
  );
}
