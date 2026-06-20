"use client";

import {
  Bot,
  Check,
  Clipboard,
  FileText,
  Info,
  LoaderCircle,
  MessageSquarePlus,
  Mic,
  Search,
  Send,
  Share2,
  Square,
  Trash2,
  X
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  FormEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { FeedbackControls } from "@/components/feedback-controls";
import {
  ChatCitation,
  ConversationSummary,
  deleteConversation,
  getAccountProfile,
  getConversation,
  listConversations,
  sendChatMessage,
  transcribeAudio
} from "@/lib/api";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
};

function groupLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

function scoreLabel(score: number | null) {
  if (score === null) return null;
  const percentage = score <= 1 ? score * 100 : score;
  return `${Math.round(percentage)}% match`;
}

export function ChatWorkspace() {
  const searchParams = useSearchParams();
  const documentName = searchParams.get("filename");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("New conversation");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [question, setQuestion] = useState(
    documentName ? `What should I know about ${documentName}?` : ""
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedCitation, setSelectedCitation] =
    useState<ChatCitation | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [userLanguage, setUserLanguage] = useState("en");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const microphoneAvailable =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const visibleConversations = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    return conversations.filter(
      (conversation) =>
        !query || conversation.title.toLowerCase().includes(query)
    );
  }, [conversations, historyQuery]);

  const groupedConversations = useMemo(() => {
    return visibleConversations.reduce<Record<string, ConversationSummary[]>>(
      (groups, conversation) => {
        const label = groupLabel(conversation.updated_at);
        groups[label] = [...(groups[label] ?? []), conversation];
        return groups;
      },
      {}
    );
  }, [visibleConversations]);

  const latestCitations = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "assistant" && message.citations?.length) {
        return message.citations;
      }
    }
    return [];
  }, [messages]);

  async function refreshConversations() {
    try {
      const response = await listConversations();
      setConversations(response.conversations);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load chat history."
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      try {
        const [conversationResponse, profile] = await Promise.all([
          listConversations(),
          getAccountProfile()
        ]);
        if (!active) return;
        setConversations(conversationResponse.conversations);
        setUserLanguage(profile.language_preference ?? "en");
      } catch (error) {
        if (!active) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not load chat workspace."
        );
      } finally {
        if (active) setIsHistoryLoading(false);
      }
    }

    void loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const activeCitation = useMemo(() => {
    if (
      selectedCitation &&
      latestCitations.some(
        (citation) =>
          citation.chunk_id === selectedCitation.chunk_id &&
          citation.document_id === selectedCitation.document_id
      )
    ) {
      return selectedCitation;
    }
    return latestCitations[0] ?? null;
  }, [latestCitations, selectedCitation]);

  function handleNewChat() {
    setConversationId(null);
    setConversationTitle("New conversation");
    setMessages([]);
    setQuestion(documentName ? `What should I know about ${documentName}?` : "");
    setSelectedCitation(null);
    setErrorMessage(null);
  }

  async function handleSelectConversation(summary: ConversationSummary) {
    if (summary.id === conversationId) return;
    setIsLoadingConversation(true);
    setErrorMessage(null);
    try {
      const response = await getConversation(summary.id);
      setConversationId(response.conversation.id);
      setConversationTitle(response.conversation.title);
      setMessages(
        response.conversation.messages.map((message) => ({
          id: message.id,
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
          citations:
            message.role === "assistant" ? message.citations : undefined
        }))
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load conversation."
      );
    } finally {
      setIsLoadingConversation(false);
    }
  }

  async function handleDeleteConversation(
    summary: ConversationSummary,
    event: MouseEvent<HTMLElement>
  ) {
    event.stopPropagation();
    if (!window.confirm(`Delete "${summary.title}"?`)) return;
    try {
      await deleteConversation(summary.id);
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== summary.id)
      );
      if (summary.id === conversationId) handleNewChat();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not delete conversation."
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isSending) return;

    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content: trimmedQuestion
      }
    ]);
    setQuestion("");
    setIsSending(true);
    setErrorMessage(null);
    try {
      const response = await sendChatMessage({
        conversation_id: conversationId,
        question: trimmedQuestion,
        language: userLanguage
      });
      setConversationId(response.conversation_id);
      setConversationTitle((current) =>
        current === "New conversation"
          ? trimmedQuestion.slice(0, 64)
          : current
      );
      setMessages((current) => [
        ...current,
        {
          id: response.message_id,
          role: "assistant",
          content: response.answer,
          citations: response.citations
        }
      ]);
      await refreshConversations();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Chat request failed."
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleMicrophone() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        setIsTranscribing(true);
        try {
          const audio = new Blob(audioChunksRef.current, {
            type: "audio/webm"
          });
          if (!audio.size) throw new Error("The recording was empty.");
          const response = await transcribeAudio(audio, userLanguage);
          setQuestion(response.transcript);
        } catch (error) {
          setErrorMessage(
            error instanceof Error ? error.message : "Transcription failed."
          );
        } finally {
          setIsTranscribing(false);
        }
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        setErrorMessage("Recording failed. Please try again.");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setErrorMessage(
        name === "NotAllowedError"
          ? "Microphone access was denied."
          : "Could not start voice recording."
      );
    }
  }

  async function copyMessage(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId(null), 1600);
  }

  async function shareConversation() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: conversationTitle, url });
    } else {
      await navigator.clipboard.writeText(url);
      setErrorMessage("Conversation link copied to your clipboard.");
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[620px] bg-[#101010] md:h-screen">
      <aside className="hidden w-[270px] shrink-0 flex-col border-r border-white/[0.08] bg-[#171717] lg:flex">
        <div className="flex h-16 items-center justify-between border-b border-white/[0.08] px-4">
          <h2 className="text-xs font-semibold uppercase text-zinc-400">
            Chat history
          </h2>
          <button
            aria-label="New chat"
            className="rounded-md p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white"
            onClick={handleNewChat}
            type="button"
          >
            <MessageSquarePlus size={17} />
          </button>
        </div>
        <div className="p-3">
          <label className="relative block">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
              size={14}
            />
            <input
              className="h-9 w-full rounded-md border border-white/10 bg-[#0d0d0d] pl-9 pr-3 text-xs text-white outline-none focus:border-blue-500/60"
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Search history..."
              value={historyQuery}
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {isHistoryLoading ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((item) => (
                <div
                  className="h-12 animate-pulse rounded-md bg-zinc-800"
                  key={item}
                />
              ))}
            </div>
          ) : visibleConversations.length === 0 ? (
            <p className="p-4 text-sm leading-6 text-zinc-600">
              No conversations match this search.
            </p>
          ) : (
            ["Today", "Yesterday", "Earlier"].map((label) =>
              groupedConversations[label]?.length ? (
                <div className="mt-3" key={label}>
                  <p className="px-3 py-2 text-[10px] font-semibold uppercase text-zinc-600">
                    {label}
                  </p>
                  <div className="space-y-1">
                    {groupedConversations[label].map((conversation) => (
                      <div
                        className={`group flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left transition ${
                          conversation.id === conversationId
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                        }`}
                        key={conversation.id}
                        onClick={() =>
                          void handleSelectConversation(conversation)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void handleSelectConversation(conversation);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {conversation.title}
                          </span>
                          <span className="mt-1 block text-[10px] text-zinc-600">
                            {conversation.message_count} messages
                          </span>
                        </span>
                        <button
                          aria-label={`Delete ${conversation.title}`}
                          className="rounded-md p-1.5 text-zinc-600 opacity-0 hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                          onClick={(event) =>
                            void handleDeleteConversation(conversation, event)
                          }
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] px-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-white">
                {conversationTitle}
              </h1>
              <Info className="shrink-0 text-zinc-600" size={15} />
            </div>
            <p className="mt-1 flex items-center gap-2 text-[10px] font-semibold uppercase text-zinc-600">
              Organization workspace
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400">Model ready</span>
            </p>
          </div>
          <button
            aria-label="Share conversation"
            className="rounded-md border border-white/10 p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
            onClick={() => void shareConversation()}
            type="button"
          >
            <Share2 size={17} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-7 sm:px-8">
          <div className="mx-auto max-w-3xl space-y-7">
            {isLoadingConversation ? (
              <div className="flex justify-center py-20 text-sm text-zinc-500">
                <LoaderCircle className="mr-2 animate-spin" size={18} />
                Loading conversation
              </div>
            ) : messages.length === 0 ? (
              <div className="flex min-h-[430px] flex-col items-center justify-center text-center">
                <span className="flex size-12 items-center justify-center rounded-md border border-blue-500/20 bg-blue-500/10 text-blue-400">
                  <Bot size={25} />
                </span>
                <h2 className="mt-5 text-xl font-semibold text-white">
                  Ask your organization&apos;s knowledge
                </h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                  Answers use only ready documents in your current organization
                  and include the matching source chunks.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                  key={message.id}
                >
                  {message.role === "user" ? (
                    <div className="max-w-[88%] rounded-md bg-blue-500 px-5 py-3.5 text-sm leading-6 text-white sm:max-w-[70%]">
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  ) : (
                    <div className="w-full max-w-2xl rounded-md border border-white/10 bg-[#1a1a1a] px-5 py-5">
                      <div className="mb-4 flex items-center gap-2 text-[10px] font-semibold uppercase text-blue-400">
                        <Bot size={17} />
                        Averion Copilot
                        <Check className="text-emerald-400" size={13} />
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                        {message.content}
                      </p>
                      {message.citations?.length ? (
                        <div className="mt-5 flex flex-wrap gap-2">
                          {message.citations.map((citation, index) => (
                            <button
                              className="rounded-md border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-400 hover:bg-blue-500/15"
                              key={
                                citation.chunk_id ||
                                `${citation.document_id}-${index}`
                              }
                              onClick={() => setSelectedCitation(citation)}
                              type="button"
                            >
                              [{index + 1}] {citation.filename}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-5 flex items-end justify-between border-t border-white/[0.08] pt-4">
                        <FeedbackControls messageId={message.id} />
                        <button
                          aria-label="Copy answer"
                          className="rounded-md p-2 text-zinc-600 hover:bg-zinc-800 hover:text-white"
                          onClick={() => void copyMessage(message)}
                          type="button"
                        >
                          {copiedMessageId === message.id ? (
                            <Check size={16} />
                          ) : (
                            <Clipboard size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))
            )}
            {isSending && (
              <div className="flex justify-start">
                <div className="rounded-md border border-white/10 bg-[#1a1a1a] px-5 py-4 text-sm text-zinc-400">
                  <LoaderCircle
                    className="mr-2 inline animate-spin text-blue-400"
                    size={17}
                  />
                  Searching organization knowledge...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {errorMessage && (
          <div className="mx-4 mb-3 flex items-start gap-3 rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200 sm:mx-6">
            <span className="flex-1">{errorMessage}</span>
            <button
              aria-label="Dismiss message"
              onClick={() => setErrorMessage(null)}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <form
          className="border-t border-white/[0.08] bg-[#111111] p-4 sm:p-5"
          onSubmit={handleSubmit}
        >
          <div className="mx-auto max-w-3xl rounded-md border border-white/10 bg-[#0d0d0d] p-2 focus-within:border-blue-500/60">
            <textarea
              className="min-h-16 max-h-40 w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-zinc-700"
              disabled={isRecording || isTranscribing}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  question.trim() &&
                  !isSending
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Ask anything about your organization's documents..."
              value={question}
            />
            <div className="flex items-center justify-between px-1 pb-1">
              <div className="flex items-center gap-2">
                {microphoneAvailable && (
                  <button
                    aria-label={isRecording ? "Stop recording" : "Start voice input"}
                    className={`rounded-md p-2 transition ${
                      isRecording
                        ? "bg-red-500/15 text-red-400"
                        : "text-zinc-600 hover:bg-zinc-800 hover:text-white"
                    }`}
                    disabled={isSending || isTranscribing}
                    onClick={() => void handleMicrophone()}
                    type="button"
                  >
                    {isRecording ? <Square size={18} /> : <Mic size={18} />}
                  </button>
                )}
                {(isRecording || isTranscribing) && (
                  <span className="text-[10px] font-semibold uppercase text-zinc-500">
                    {isRecording ? "Recording" : "Transcribing"}
                  </span>
                )}
              </div>
              <button
                aria-label="Send message"
                className="flex size-10 items-center justify-center rounded-md bg-blue-500 text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!question.trim() || isSending}
                type="submit"
              >
                {isSending ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          </div>
        </form>
      </main>

      <aside className="hidden w-[330px] shrink-0 flex-col border-l border-white/[0.08] bg-[#141414] xl:flex">
        <div className="flex h-16 items-center justify-between border-b border-white/[0.08] px-5">
          <h2 className="text-xs font-semibold uppercase text-zinc-300">
            Source details
          </h2>
          {activeCitation && (
            <button
              aria-label="Close source details"
              className="text-zinc-600 hover:text-white"
              onClick={() => setSelectedCitation(null)}
              type="button"
            >
              <X size={17} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!latestCitations.length ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <FileText className="text-zinc-700" size={32} />
              <p className="mt-3 text-sm font-semibold text-zinc-400">
                No source selected
              </p>
              <p className="mt-1 text-xs leading-5 text-zinc-600">
                Ask a question to see the exact document chunks used in the answer.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {latestCitations.map((citation, index) => {
                const active =
                  activeCitation?.chunk_id === citation.chunk_id &&
                  activeCitation?.document_id === citation.document_id;
                return (
                  <button
                    className={`w-full rounded-md border p-4 text-left transition ${
                      active
                        ? "border-emerald-500/40 bg-zinc-800"
                        : "border-white/[0.08] bg-[#1a1a1a] hover:border-white/15"
                    }`}
                    key={
                      citation.chunk_id ||
                      `${citation.document_id}-${citation.chunk_index}-${index}`
                    }
                    onClick={() => setSelectedCitation(citation)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate text-xs font-semibold text-zinc-200">
                        <span className="mr-2 text-blue-400">
                          {String(index + 1).padStart(2, "0")}.
                        </span>
                        {citation.filename}
                      </p>
                      {scoreLabel(citation.score) && (
                        <span className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-1 text-[9px] font-semibold uppercase text-emerald-400">
                          {scoreLabel(citation.score)}
                        </span>
                      )}
                    </div>
                    {active && (
                      <div className="mt-4">
                        <p className="text-[10px] font-semibold uppercase text-zinc-600">
                          {citation.page_number
                            ? `Page ${citation.page_number} · `
                            : ""}
                          Chunk {citation.chunk_index}
                        </p>
                        <p className="mt-3 whitespace-pre-wrap rounded-md border border-white/[0.08] bg-[#0d0d0d] p-3 text-xs leading-6 text-zinc-400">
                          {citation.snippet || "No snippet was returned."}
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {activeCitation && (
          <div className="border-t border-white/[0.08] p-4">
            <a
              className="flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-zinc-900 text-xs font-semibold text-zinc-200 hover:border-blue-500/40"
              href={`/documents?document=${encodeURIComponent(
                activeCitation.document_id
              )}`}
            >
              <FileText size={16} />
              View in Documents
            </a>
          </div>
        )}
      </aside>
    </div>
  );
}
