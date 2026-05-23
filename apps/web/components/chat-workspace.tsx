"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { CitationSourcePanel } from "@/components/citation-source-panel";
import { FeedbackControls } from "@/components/feedback-controls";
import { ChatCitation, sendChatMessage } from "@/lib/api";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
};

export function ChatWorkspace() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  const canSend = useMemo(() => question.trim().length > 0 && !isSending, [question, isSending]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setSpeechSupported(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        console.log("Speech recognition started");
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        console.log("Speech recognition result:", event);
        const transcript = event.results[0][0].transcript;
        console.log("Transcript:", transcript);
        setQuestion(transcript);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        
        // Don't show errors for common expected cases
        if (event.error === "no-speech" || event.error === "aborted") {
          return;
        }
        
        // Only log to console in development
        if (process.env.NODE_ENV === "development") {
          console.log("Speech recognition error:", event.error);
        }
        
        let errorMsg = "Voice input failed";
        switch (event.error) {
          case "network":
            errorMsg = "Network error. Speech recognition requires internet connection.";
            break;
          case "not-allowed":
            errorMsg = "Microphone access denied. Please allow microphone permissions.";
            break;
          case "audio-capture":
            errorMsg = "No microphone found. Please check your device.";
            break;
          default:
            errorMsg = `Voice input error: ${event.error}`;
        }
        setErrorMessage(errorMsg);
      };

      recognition.onend = () => {
        console.log("Speech recognition ended");
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          console.error("Error aborting recognition:", e);
        }
      }
    };
  }, []);

  async function handleMicClick() {
    if (!recognitionRef.current || isListening) return;

    try {
      setErrorMessage(null);
      
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      
      setIsListening(true);
      recognitionRef.current.start();
      console.log("Starting speech recognition...");
    } catch (error: any) {
      console.error("Failed to start speech recognition:", error);
      setIsListening(false);
      
      if (error.name === "NotAllowedError") {
        setErrorMessage("Microphone access denied. Please allow microphone permissions in your browser.");
      } else if (error.name === "NotFoundError") {
        setErrorMessage("No microphone found. Please check your device.");
      } else {
        setErrorMessage("Failed to start voice input. Please try again.");
      }
    }
  }

  function handleStopListening() {
    if (recognitionRef.current && isListening) {
      try {
        recognitionRef.current.stop();
      } catch (error) {
        console.error("Error stopping recognition:", error);
        setIsListening(false);
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: trimmedQuestion
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setIsSending(true);
    setErrorMessage(null);

    try {
      const response = await sendChatMessage({
        conversation_id: conversationId,
        question: trimmedQuestion
      });

      setConversationId(response.conversation_id);
      setMessages((current) => [
        ...current,
        {
          id: response.message_id,
          role: "assistant",
          content: response.answer,
          citations: response.citations
        }
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Chat request failed.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-[560px] flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">Conversation</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ask about uploaded documents and review the returned sources.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-800">No messages yet</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Ask a question after uploading a document. Answers will appear here with
                sources and feedback controls.
              </p>
              <p className="mt-3 text-sm font-medium text-slate-700">
                Try: What does the uploaded document say?
              </p>
            </div>
          ) : null}

          {messages.map((message) => (
            <article
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              key={message.id}
            >
              <div
                className={`max-w-2xl rounded-lg px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "bg-blue-600 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-800"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>

                {message.role === "assistant" ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                      Sources
                    </p>
                    <CitationSourcePanel citations={message.citations ?? []} />
                  </div>
                ) : null}

                {message.role === "assistant" ? (
                  <FeedbackControls messageId={message.id} />
                ) : null}
              </div>
            </article>
          ))}

          {isSending ? (
            <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4" aria-live="polite">
              <p className="text-sm font-medium text-slate-700">Generating answer...</p>
              <div className="space-y-2">
                <div className="h-4 w-3/4 rounded bg-slate-200" />
                <div className="h-4 w-1/2 rounded bg-slate-200" />
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate-500">
                  Sources
                </p>
                <CitationSourcePanel citations={[]} isLoading />
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4" role="alert">
              <p className="text-sm font-semibold text-red-800">Chat request failed</p>
              <p className="mt-1 text-sm leading-6 text-red-700">{errorMessage}</p>
              <button
                className="mt-3 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
                onClick={() => setErrorMessage(null)}
                type="button"
              >
                Dismiss
              </button>
            </div>
          ) : null}
        </div>

        <form className="border-t border-slate-200 p-4" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="chat-question">
            Ask a question
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <textarea
                className="min-h-24 w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 pr-12 text-sm leading-6 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                id="chat-question"
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask a question about your uploaded documents..."
                value={question}
                disabled={isListening}
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={isListening ? handleStopListening : handleMicClick}
                  disabled={isSending}
                  className={`absolute bottom-2 right-2 rounded-md p-2 transition ${
                    isListening
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                  title={isListening ? "Stop listening" : "Start voice input"}
                >
                  {isListening ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </button>
              )}
              {isListening && (
                <div className="absolute left-3 top-2 flex items-center gap-2">
                  <span className="flex h-2 w-2">
                    <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                  </span>
                  <span className="text-xs font-medium text-red-600">Listening...</span>
                </div>
              )}
            </div>
            <button
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSend}
              type="submit"
            >
              {isSending ? "Sending..." : "Send"}
            </button>
          </div>
          {!speechSupported && (
            <p className="mt-2 text-xs text-slate-500">
              Voice input not supported in this browser
            </p>
          )}
        </form>
      </div>

      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">Session</h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="font-medium text-slate-700">Conversation ID</dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-500">
              {conversationId ?? "New conversation"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Messages</dt>
            <dd className="mt-1 text-slate-600">{messages.length}</dd>
          </div>
        </dl>
      </aside>
    </section>
  );
}
