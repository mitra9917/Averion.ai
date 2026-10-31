"use client";

import {
  ArrowUp,
  Check,
  Clipboard,
  Copy,
  FileText,
  LoaderCircle,
  MessageSquarePlus,
  Mic,
  PanelRight,
  Search,
  Square,
  Trash2,
  X
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type CSSProperties,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { FeedbackControls } from "@/components/feedback-controls";
import { Skeleton } from "@/components/skeleton";
import { useWorkspace } from "@/components/workspace-context";
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
import {
  annotateAnswer,
  CONVERSATION_GROUPS,
  dayBucket,
  formatNumber,
  formatRelative,
  quoteParts,
  unmatchedCitationIndexes
} from "@/lib/meridian";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
};

type Selection = {
  messageId: string;
  key: string;
};

function citationKey(citation: ChatCitation, index: number) {
  return citation.chunk_id || `${citation.document_id}-${citation.chunk_index}-${index}`;
}

function scoreLabel(score: number | null) {
  if (score === null || Number.isNaN(score)) return null;
  const percentage = score <= 1 ? score * 100 : score;
  return `${Math.round(percentage)}% match`;
}

export function ChatWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspace = useWorkspace();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("New conversation");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [languageReady, setLanguageReady] = useState(false);
  const [userLanguage, setUserLanguage] = useState("en");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [quoteCopied, setQuoteCopied] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(340);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const loadedFromUrl = useRef<string | null>(null);
  const submitRef = useRef<(value: string) => Promise<void>>(async () => undefined);

  const microphoneAvailable =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const scopedFilename = searchParams.get("filename");
  const filenamePrompt = scopedFilename
    ? `What should I know about ${scopedFilename}?`
    : "";

  const visibleConversations = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    return [...conversations]
      .sort(
        (left, right) =>
          new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
      )
      .filter(
        (conversation) => !query || conversation.title.toLowerCase().includes(query)
      );
  }, [conversations, historyQuery]);

  const groupedConversations = useMemo(() => {
    return visibleConversations.reduce<Record<string, ConversationSummary[]>>(
      (groups, conversation) => {
        const label = dayBucket(conversation.updated_at);
        groups[label] = [...(groups[label] ?? []), conversation];
        return groups;
      },
      {}
    );
  }, [visibleConversations]);

  const selectedMessage = messages.find((message) => message.id === selection?.messageId);
  const selectedCitations = selectedMessage?.citations ?? [];
  const selectedCitation =
    selectedCitations.find(
      (citation, index) => citationKey(citation, index) === selection?.key
    ) ?? null;
  const selectedIndex = selectedCitation
    ? selectedCitations.findIndex(
        (citation, index) => citationKey(citation, index) === selection?.key
      )
    : -1;
  const citedDocuments = new Set(
    messages.flatMap((message) => message.citations?.map((citation) => citation.document_id) ?? [])
  );

  const setTrail = workspace.setTrail;

  useEffect(() => {
    setTrail(conversationTitle === "New conversation" ? null : conversationTitle);
    return () => setTrail(null);
  }, [conversationTitle, setTrail]);

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
          error instanceof Error ? error.message : "Could not load chat workspace."
        );
      } finally {
        if (active) {
          setIsHistoryLoading(false);
          setLanguageReady(true);
        }
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

  function selectCitation(messageId: string, citation: ChatCitation, index: number) {
    setSelection({ messageId, key: citationKey(citation, index) });
    setInspectorOpen(true);
  }

  async function openConversation(id: string) {
    setIsLoadingConversation(true);
    setErrorMessage(null);
    setFailedQuestion(null);

    try {
      const response = await getConversation(id);
      const nextMessages: ChatMessage[] = response.conversation.messages.map((message) => ({
        id: message.id,
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
        citations: message.role === "assistant" ? message.citations : undefined
      }));
      setConversationId(response.conversation.id);
      setConversationTitle(response.conversation.title);
      setMessages(nextMessages);
      const lastAnswer = [...nextMessages]
        .reverse()
        .find((message) => message.role === "assistant" && message.citations?.length);
      const firstCitation = lastAnswer?.citations?.[0];
      setSelection(
        lastAnswer && firstCitation
          ? { messageId: lastAnswer.id, key: citationKey(firstCitation, 0) }
          : null
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load conversation."
      );
    } finally {
      setIsLoadingConversation(false);
    }
  }

  useEffect(() => {
    const id = searchParams.get("conversation");

    if (!id || loadedFromUrl.current === id) return;

    loadedFromUrl.current = id;
    void openConversation(id);
  }, [searchParams]);

  async function submitQuestion(trimmedQuestion: string) {
    if (!trimmedQuestion || isSending) return;

    const optimisticId = `local-${crypto.randomUUID()}`;
    setMessages((current) => [
      ...current,
      { id: optimisticId, role: "user", content: trimmedQuestion }
    ]);
    setQuestion("");
    setIsSending(true);
    setErrorMessage(null);
    setFailedQuestion(null);

    try {
      const response = await sendChatMessage({
        conversation_id: conversationId,
        question: trimmedQuestion,
        language: userLanguage
      });
      setConversationId(response.conversation_id);
      setConversationTitle((current) =>
        current === "New conversation" ? trimmedQuestion.slice(0, 64) : current
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

      if (response.citations[0]) {
        setSelection({
          messageId: response.message_id,
          key: citationKey(response.citations[0], 0)
        });
        setInspectorOpen(true);
      }

      await refreshConversations();
    } catch (error) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setQuestion((current) => current || trimmedQuestion);
      setFailedQuestion(trimmedQuestion);
      setErrorMessage(error instanceof Error ? error.message : "Chat request failed.");
    } finally {
      setIsSending(false);
    }
  }

  useEffect(() => {
    submitRef.current = submitQuestion;
  });

  useEffect(() => {
    if (!languageReady) return;

    const query = searchParams.get("q")?.trim();
    const stamp = searchParams.get("t");

    if (!query || !stamp) return;

    const key = `averion-ask:${stamp}`;

    if (sessionStorage.getItem(key) === "1") return;

    sessionStorage.setItem(key, "1");
    void submitRef.current(query);
  }, [languageReady, searchParams]);

  function handleNewChat() {
    loadedFromUrl.current = null;
    setConversationId(null);
    setConversationTitle("New conversation");
    setMessages([]);
    setQuestion(filenamePrompt);
    setSelection(null);
    setErrorMessage(null);
    setFailedQuestion(null);
    router.replace("/chat");
  }

  function handleSelectConversation(summary: ConversationSummary) {
    if (summary.id === conversationId) return;
    loadedFromUrl.current = summary.id;
    router.replace(`/chat?conversation=${encodeURIComponent(summary.id)}`);
    setThreadsOpen(false);
    void openConversation(summary.id);
  }

  async function handleDeleteConversation(summary: ConversationSummary) {
    if (!window.confirm(`Delete "${summary.title}"?`)) return;

    try {
      await deleteConversation(summary.id);
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== summary.id)
      );

      if (summary.id === conversationId) {
        handleNewChat();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete conversation."
      );
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion(question.trim());
  }

  async function handleMicrophone() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      setErrorMessage(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        setIsTranscribing(true);

        try {
          const audio = new Blob(audioChunksRef.current, { type: mimeType ?? "audio/webm" });

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
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(null), 1600);
    } catch {
      setErrorMessage("Could not copy that answer.");
    }
  }

  async function copyQuote(citation: ChatCitation) {
    try {
      await navigator.clipboard.writeText(citation.snippet);
      setQuoteCopied(true);
      window.setTimeout(() => setQuoteCopied(false), 1600);
    } catch {
      setErrorMessage("Could not copy that quote.");
    }
  }

  async function shareConversation() {
    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title: conversationTitle, url });
      } else {
        await navigator.clipboard.writeText(url);
        setErrorMessage("Conversation link copied to your clipboard.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorMessage("Could not share this conversation.");
    }
  }

  function askAboutCitation(citation: ChatCitation) {
    setQuestion(`Tell me more about the passage in ${citation.filename}.`);
    composerRef.current?.focus();
  }

  const threadList = (
    <>
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-sm font-medium">
          Conversations{" "}
          <span className="figure text-muted">{formatNumber(conversations.length)}</span>
        </h2>
        <button
          aria-label="New thread"
          className="rounded-full p-2 text-muted hover:bg-soft hover:text-ink"
          onClick={handleNewChat}
          type="button"
        >
          <MessageSquarePlus size={16} />
        </button>
      </div>
      <label className="relative mx-3 mt-3 block">
        <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={14} />
        <input
          className="h-9 w-full rounded-control border border-hairline bg-canvas pr-3 pl-9 text-xs outline-none"
          onChange={(event) => setHistoryQuery(event.target.value)}
          placeholder="Search threads"
          value={historyQuery}
        />
      </label>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {isHistoryLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : visibleConversations.length === 0 ? (
          <p className="px-3 py-6 text-sm leading-6 text-muted">
            {conversations.length
              ? "No threads match this search."
              : "No threads yet. Ask something about a ready document."}
          </p>
        ) : (
          CONVERSATION_GROUPS.map((label) =>
            groupedConversations[label]?.length ? (
              <div className="mt-3" key={label}>
                <p className="micro px-2 py-1">{label}</p>
                {groupedConversations[label].map((conversation) => {
                  const active = conversation.id === conversationId;

                  return (
                    <div
                      className={`group flex items-center rounded-control ${
                        active ? "bg-soft" : "hover:bg-soft"
                      }`}
                      key={conversation.id}
                    >
                      <button
                        className="min-w-0 flex-1 px-2 py-2.5 text-left"
                        onClick={() => handleSelectConversation(conversation)}
                        type="button"
                      >
                        <span className="block truncate text-sm">{conversation.title}</span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {formatRelative(conversation.updated_at)} · {conversation.message_count} messages
                        </span>
                      </button>
                      <button
                        aria-label={`Delete ${conversation.title}`}
                        className="mr-1 rounded-full p-1.5 text-muted opacity-0 hover:text-fail group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => void handleDeleteConversation(conversation)}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null
          )
        )}
      </div>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 gap-3 px-3 pt-1 pb-24">
      <aside className="hidden w-[280px] shrink-0 flex-col overflow-hidden rounded-pane border border-hairline bg-surface lg:flex">
        {threadList}
      </aside>
      {threadsOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close threads"
            className="absolute inset-0 bg-ink/20"
            onClick={() => setThreadsOpen(false)}
            type="button"
          />
          <aside className="absolute top-16 bottom-24 left-3 flex w-[min(100%-1.5rem,320px)] flex-col overflow-hidden rounded-pane border border-hairline bg-surface shadow-float">
            {threadList}
          </aside>
        </div>
      ) : null}

      <div
        className="flex min-w-0 flex-1 overflow-hidden rounded-pane border border-hairline bg-surface"
        style={{ "--inspector-width": `${inspectorWidth}px` } as CSSProperties}
      >
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <button
                  className="rounded-full border border-hairline px-2 py-1 text-[11px] font-semibold lg:hidden"
                  onClick={() => setThreadsOpen(true)}
                  type="button"
                >
                  Threads
                </button>
                <h1 className="truncate text-[15px] font-medium">
                  {conversationTitle === "New conversation" ? "Ask" : conversationTitle}
                </h1>
              </div>
              <p className="mt-1 text-xs text-muted">
                {citedDocuments.size
                  ? `${formatNumber(citedDocuments.size)} document${citedDocuments.size === 1 ? "" : "s"} cited in this thread`
                  : "Answers cite ready documents in this workspace"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-2 text-xs text-muted hover:bg-soft hover:text-ink"
                onClick={() => setInspectorOpen((open) => !open)}
                type="button"
              >
                <PanelRight size={14} />
                Split view
              </button>
              <button
                aria-label="Share conversation"
                className="rounded-full p-2 text-muted hover:bg-soft hover:text-ink"
                onClick={() => void shareConversation()}
                type="button"
              >
                <Copy size={15} />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8">
            <div className="mx-auto max-w-[68ch]">
              {isLoadingConversation ? (
                <div className="space-y-4">
                  <Skeleton className="ml-auto h-12 w-2/3" />
                  <Skeleton className="h-28" />
                </div>
              ) : messages.length === 0 ? (
                <div className="py-16">
                  <p className="micro">New thread</p>
                  <h2 className="display mt-3 text-[30px]">Ask the library.</h2>
                  <p className="mt-3 max-w-md text-sm leading-6 text-muted">
                    Answers use ready documents in {workspace.orgName}. Open a citation to read the passage it came from.
                  </p>
                </div>
              ) : (
                <div className="space-y-8">
                  {messages.map((message, messageIndex) =>
                    message.role === "user" ? (
                      <div className="flex justify-end" key={message.id}>
                        <p className="max-w-[46ch] rounded-[18px] bg-soft px-4 py-2.5 text-[15px] leading-6">
                          {message.content}
                        </p>
                      </div>
                    ) : message.content.trim() === "Sorry, I'm temporarily unavailable. Please try again in a moment." && !message.citations?.length ? (
                      <article className="rounded-control border border-hairline bg-soft p-4" key={message.id}>
                        <p className="micro">Earlier request failed</p>
                        <p className="mt-2 text-sm text-muted">This saved reply did not contain an answer. Retry the question to generate a fresh response.</p>
                        <button
                          className="mt-3 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-canvas disabled:opacity-40"
                          disabled={isSending || isLoadingConversation}
                          onClick={() => {
                            const previous = messages.slice(0, messageIndex).reverse().find((entry) => entry.role === "user");
                            if (previous) void submitQuestion(previous.content);
                          }}
                          type="button"
                        >
                          Retry question
                        </button>
                      </article>
                    ) : (
                      <article className="group relative" key={message.id}>
                        <div className="mb-3 flex items-center justify-between">
                          <p className="micro">Answer</p>
                          <div className="flex items-center gap-1 rounded-full border border-hairline bg-surface px-1 opacity-0 shadow-float transition group-hover:opacity-100 focus-within:opacity-100">
                            <button
                              className="rounded-full px-2 py-1 text-[11px] font-semibold hover:bg-soft"
                              onClick={() => {
                                const citation = message.citations?.[0];
                                if (citation) askAboutCitation(citation);
                                else composerRef.current?.focus();
                              }}
                              type="button"
                            >
                              Ask about this
                            </button>
                            <button
                              className="rounded-full px-2 py-1 text-[11px] font-semibold hover:bg-soft"
                              onClick={() => void copyMessage(message)}
                              type="button"
                            >
                              {copiedMessageId === message.id ? "Copied" : "Copy"}
                            </button>
                            {message.citations?.[0] ? (
                              <button
                                className="rounded-full px-2 py-1 text-[11px] font-semibold hover:bg-soft"
                                onClick={() => selectCitation(message.id, message.citations![0], 0)}
                                type="button"
                              >
                                Cite
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <AnswerBody
                          message={message}
                          onSelect={(citation, index) => selectCitation(message.id, citation, index)}
                          selectedKey={selection?.messageId === message.id ? selection.key : null}
                        />
                        <div className="mt-4 flex items-center justify-between">
                          <FeedbackControls messageId={message.id} />
                          <button
                            aria-label="Copy answer"
                            className="rounded-full p-2 text-muted hover:bg-soft hover:text-ink"
                            onClick={() => void copyMessage(message)}
                            type="button"
                          >
                            {copiedMessageId === message.id ? <Check size={15} /> : <Clipboard size={15} />}
                          </button>
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
              {isSending ? (
                <p className="mt-8 text-sm text-muted">
                  <LoaderCircle className="mr-2 inline animate-spin" size={14} />
                  {scopedFilename ? `Reading ${scopedFilename}…` : "Searching ready documents…"}
                </p>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {errorMessage ? (
            <div role="alert" className="mx-5 mb-3 flex items-start gap-3 rounded-control border border-hairline bg-soft px-3 py-2 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fail" />
              <span className="flex-1">{errorMessage}</span>
              {failedQuestion ? (
                <button className="shrink-0 font-semibold underline disabled:opacity-40" disabled={isSending} onClick={() => void submitQuestion(failedQuestion)} type="button">
                  Retry
                </button>
              ) : null}
              <button aria-label="Dismiss message" onClick={() => setErrorMessage(null)} type="button">
                <X size={14} />
              </button>
            </div>
          ) : null}

          <form className="border-t border-hairline px-4 py-3" onSubmit={handleSubmit}>
            <div className="mx-auto flex max-w-[68ch] items-end gap-2 rounded-pane border border-hairline bg-canvas px-2 py-2 focus-within:border-ink">
              {microphoneAvailable ? (
                <button
                  aria-label={isRecording ? "Stop recording" : "Start voice input"}
                  className={`mb-0.5 rounded-full p-2 ${
                    isRecording ? "bg-soft text-fail" : "text-muted hover:bg-soft hover:text-ink"
                  }`}
                  disabled={isSending || isTranscribing}
                  onClick={() => void handleMicrophone()}
                  type="button"
                >
                  {isRecording ? <Square size={16} /> : <Mic size={16} />}
                </button>
              ) : (
                <span className="w-2" />
              )}
              <textarea
                className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-6 outline-none"
                disabled={isRecording || isTranscribing}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && question.trim() && !isSending) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={
                  messages.length
                    ? "Ask a follow-up, or press ⌘K to search the corpus"
                    : "Ask anything about your organization’s documents"
                }
                ref={composerRef}
                value={question || (messages.length === 0 ? filenamePrompt : "")}
                onChange={(event) => setQuestion(event.target.value)}
              />
              <button
                aria-label="Send message"
                className="mb-0.5 flex size-9 items-center justify-center rounded-full bg-ink text-white hover:bg-ink/90 disabled:opacity-40"
                disabled={!question.trim() || isSending}
                type="submit"
              >
                {isSending ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowUp size={16} />}
              </button>
            </div>
            <div className="mx-auto mt-2 flex max-w-[68ch] items-center justify-between px-1 text-[11px] text-muted">
              <span>
                {isRecording ? "Recording" : isTranscribing ? "Transcribing" : "Citations stay attached to the answer"}
              </span>
              <span className="figure">{question.trim().length ? `${question.trim().length}` : ""}</span>
            </div>
          </form>
        </section>

        {inspectorOpen ? (
          <>
            <div
              aria-orientation="vertical"
              aria-valuenow={inspectorWidth}
              className="group relative hidden w-2 shrink-0 cursor-col-resize xl:block"
              onPointerDown={(event) => {
                const startX = event.clientX;
                const startW = inspectorWidth;

                function move(moveEvent: PointerEvent) {
                  setInspectorWidth(Math.min(520, Math.max(280, startW - (moveEvent.clientX - startX))));
                }

                function up() {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                }

                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
              role="separator"
              aria-label="Resize citation inspector"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  setInspectorWidth((width) => Math.min(520, width + 16));
                }
                if (event.key === "ArrowRight") {
                  setInspectorWidth((width) => Math.max(280, width - 16));
                }
              }}
            >
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline group-hover:w-0.5 group-hover:bg-ink" />
            </div>
            <aside className="fixed top-16 right-3 bottom-24 z-30 flex w-[min(100%-1.5rem,380px)] min-h-0 shrink-0 flex-col rounded-pane border border-hairline bg-surface shadow-float xl:static xl:inset-auto xl:z-auto xl:w-[var(--inspector-width)] xl:rounded-none xl:border-0 xl:shadow-none">
              <Inspector
                citation={selectedCitation}
                citations={selectedCitations}
                copied={quoteCopied}
                index={selectedIndex}
                onClose={() => setInspectorOpen(false)}
                onCopy={(citation) => void copyQuote(citation)}
                onSelect={(citation, index) => {
                  if (!selectedMessage) return;
                  selectCitation(selectedMessage.id, citation, index);
                }}
              />
            </aside>
          </>
        ) : null}
      </div>
    </div>
  );
}

function AnswerBody({
  message,
  selectedKey,
  onSelect
}: {
  message: ChatMessage;
  selectedKey: string | null;
  onSelect: (citation: ChatCitation, index: number) => void;
}) {
  const citations = message.citations ?? [];
  const pieces = annotateAnswer(message.content, citations.map((citation) => citation.snippet));
  const unmatched = unmatchedCitationIndexes(
    message.content,
    citations.map((citation) => citation.snippet)
  );

  return (
    <div className="text-[15px] leading-7 whitespace-pre-wrap">
      {pieces.map((piece, pieceIndex) =>
        piece.kind === "text" ? (
          <span key={pieceIndex}>{piece.text}</span>
        ) : (
          <span key={pieceIndex}>
            <mark
              className={`rounded-sm px-0.5 ${
                piece.indexes.some((index) => citationKey(citations[index], index) === selectedKey)
                  ? "bg-citation"
                  : "bg-citation/70"
              }`}
            >
              {piece.text}
            </mark>
            {piece.indexes.map((index) => (
              <CitationMark
                active={citationKey(citations[index], index) === selectedKey}
                index={index}
                key={index}
                onClick={() => onSelect(citations[index], index)}
              />
            ))}
          </span>
        )
      )}
      {unmatched.map((index) => (
        <CitationMark
          active={citationKey(citations[index], index) === selectedKey}
          index={index}
          key={`unmatched-${index}`}
          onClick={() => onSelect(citations[index], index)}
        />
      ))}
    </div>
  );
}

function CitationMark({
  index,
  active,
  onClick
}: {
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 align-super text-[10px] font-semibold ${
        active ? "bg-accent text-white" : "bg-citation text-accent"
      }`}
      onClick={onClick}
      type="button"
    >
      {index + 1}
    </button>
  );
}

function Inspector({
  citations,
  citation,
  index,
  copied,
  onSelect,
  onCopy,
  onClose
}: {
  citations: ChatCitation[];
  citation: ChatCitation | null;
  index: number;
  copied: boolean;
  onSelect: (citation: ChatCitation, index: number) => void;
  onCopy: (citation: ChatCitation) => void;
  onClose: () => void;
}) {
  const parts = quoteParts(citation?.snippet ?? "");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-4">
        <h2 className="text-sm font-medium">
          {citation ? `Citation ${index + 1} of ${citations.length}` : "Citation"}
        </h2>
        <button
          aria-label="Close citation inspector"
          className="rounded-full p-1 text-muted hover:bg-soft hover:text-ink"
          onClick={onClose}
          type="button"
        >
          <X size={15} />
        </button>
      </div>
      {!citation ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <FileText className="text-muted" size={22} />
          <p className="mt-3 text-sm font-medium">No passage selected</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Choose a citation in the answer to read the passage it came from.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-wrap gap-1.5">
            {citations.map((item, itemIndex) => (
              <button
                className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] ${
                  itemIndex === index
                    ? "border-ink bg-ink text-white"
                    : "border-hairline hover:bg-soft"
                }`}
                key={citationKey(item, itemIndex)}
                onClick={() => onSelect(item, itemIndex)}
                type="button"
              >
                {item.filename}
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm font-medium">{citation.filename}</p>
          <p className="mt-1 text-xs text-muted">
            {citation.page_number ? `Page ${citation.page_number}` : "Page not recorded"}
            {scoreLabel(citation.score) ? ` · ${scoreLabel(citation.score)}` : ""}
          </p>
          <div className="mt-4 text-sm leading-6">
            {parts.lead || parts.rest ? (
              <>
                <mark className="rounded-sm bg-citation px-0.5">{parts.lead}</mark>
                {parts.rest}
              </>
            ) : (
              <p className="text-muted">No snippet was returned for this citation.</p>
            )}
          </div>
          <div className="mt-5 flex items-center gap-2">
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline px-3 text-xs font-semibold hover:bg-soft disabled:opacity-40"
              disabled={!citation.snippet}
              onClick={() => onCopy(citation)}
              type="button"
            >
              <Clipboard size={13} />
              {copied ? "Copied" : "Copy quote"}
            </button>
            <a
              className="inline-flex h-8 items-center rounded-full border border-hairline px-3 text-xs font-semibold hover:bg-soft"
              href={`/documents?document=${encodeURIComponent(citation.document_id)}`}
            >
              Open
            </a>
          </div>
          <p className="mt-6 text-[11px] text-muted">
            Chunk {citation.chunk_index}
            {citation.page_number ? ` · page ${citation.page_number}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
