"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = "http://localhost:8000";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: any[];
  timestamp: Date;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

const proseClasses = `
  prose prose-base dark:prose-invert max-w-none
  [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
  prose-headings:font-semibold prose-headings:text-gray-900 dark:prose-headings:text-gray-100
  prose-h1:text-xl prose-h1:mb-3 prose-h1:mt-6 prose-h1:font-bold prose-h1:border-b prose-h1:border-gray-200 dark:prose-h1:border-gray-700 prose-h1:pb-2
  prose-h2:text-lg prose-h2:mb-2 prose-h2:mt-5 prose-h2:font-semibold
  prose-h3:text-base prose-h3:mb-2 prose-h3:mt-4 prose-h3:font-semibold
  prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-7 prose-p:mb-3
  prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-strong:font-semibold
  prose-em:text-gray-700 dark:prose-em:text-gray-300
  prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-a:font-medium
  prose-ul:my-3 prose-ul:pl-6 prose-ul:list-disc
  prose-ol:my-3 prose-ol:pl-6 prose-ol:list-decimal
  prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-li:mb-1 prose-li:leading-7 marker:text-gray-400
  prose-hr:border-gray-200 dark:prose-hr:border-gray-700 prose-hr:my-6
  prose-code:text-pink-600 dark:prose-code:text-pink-400 prose-code:bg-gray-100 dark:prose-code:bg-gray-800
  prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[0.85em] prose-code:font-medium
  prose-code:before:content-none prose-code:after:content-none
  prose-pre:bg-[#0d1117] prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-xl
  prose-pre:overflow-x-auto prose-pre:my-4 prose-pre:text-[0.85em] prose-pre:leading-relaxed prose-pre:shadow-sm
  prose-blockquote:border-l-4 prose-blockquote:border-blue-300 dark:prose-blockquote:border-blue-700
  prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-gray-600 dark:prose-blockquote:text-gray-400
  prose-blockquote:not-italic prose-blockquote:my-4 prose-blockquote:font-normal
  prose-img:rounded-lg
`;

// --- Typewriter tuning -------------------------------------------------
// Base cadence for the "typing" feel when the queue is roughly caught up
// with the backend. When the backend produces tokens faster than we can
// type them, TYPE speed scales up so the queue never grows unbounded and
// the UI never lags meaningfully behind real content arrival.
const TYPE_INTERVAL_MS = 15;
const BASE_CHARS_PER_TICK = 2;
// Once the queued backlog exceeds this many characters, start typing
// faster (proportionally) so we catch back up instead of drifting.
const BACKLOG_CATCHUP_THRESHOLD = 60;

const markdownComponents = {
  table: ({ children }: any) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm not-prose">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => (
    <thead className="bg-gray-50 dark:bg-gray-800">{children}</thead>
  ),
  tbody: ({ children }: any) => (
    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
      {children}
    </tbody>
  ),
  tr: ({ children }: any) => (
    <tr className="even:bg-gray-50/60 dark:even:bg-gray-800/30 hover:bg-blue-50/60 dark:hover:bg-blue-900/10 transition-colors">
      {children}
    </tr>
  ),
  th: ({ children }: any) => (
    <th className="px-4 py-2.5 text-left font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 align-top">
      {children}
    </td>
  ),
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [displayedContent, setDisplayedContent] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const responseEndRef = useRef<HTMLDivElement>(null);

  // Holds the *complete* response text as it truly arrives from the
  // backend, independent of animation. This is what actually gets saved
  // as the final assistant message — never derived from the animated
  // display state, so nothing is ever lost or delayed by the typewriter.
  const fullContentRef = useRef("");
  // Characters that have arrived but not yet been "typed" onto screen.
  const queueRef = useRef("");
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedContent]);

  // Load the chat list from Postgres on first render.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/chats`);
        const rows = await res.json();
        setChats(
          rows.map((r: any) => ({
            id: r.id,
            title: r.title,
            createdAt: new Date(r.createdAt),
            messages: [], // loaded lazily when a chat is opened
          })),
        );
      } catch (e) {
        console.error("Failed to load chat list:", e);
      }
    })();
  }, []);

  // If the tab goes into the background mid-response, stop pretending to
  // "type" and just flush whatever has arrived straight into the visible
  // state. There's no point animating something nobody can see, and this
  // guarantees that when the user tabs back in, the content is already
  // fully caught up rather than still trickling out of a throttled timer.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        flushQueue();
        stopTypewriter();
      } else if (queueRef.current.length > 0) {
        // Any backlog that built up right at the boundary — catch up fast.
        startTypewriter();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const flushQueue = () => {
    if (queueRef.current.length === 0) return;
    setDisplayedContent((prev) => prev + queueRef.current);
    queueRef.current = "";
  };

  const startTypewriter = () => {
    if (typingTimerRef.current) return;
    setIsTyping(true);
    typingTimerRef.current = setInterval(() => {
      // If the tab is hidden, don't bother ticking — the visibility
      // handler already flushed everything and will restart us later.
      if (document.hidden) return;

      if (queueRef.current.length === 0) {
        stopTypewriter();
        return;
      }

      // Adaptive speed: type faster when we've fallen behind so the
      // animation never drifts far from the real, already-arrived content.
      const backlog = queueRef.current.length;
      const charsThisTick =
        backlog > BACKLOG_CATCHUP_THRESHOLD
          ? Math.ceil(backlog / 10) // fast catch-up
          : BASE_CHARS_PER_TICK;

      const nextChars = queueRef.current.slice(0, charsThisTick);
      queueRef.current = queueRef.current.slice(charsThisTick);
      setDisplayedContent((prev) => prev + nextChars);
    }, TYPE_INTERVAL_MS);
  };

  const stopTypewriter = () => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    setIsTyping(false);
  };

  const waitForQueueToDrain = () =>
    new Promise<void>((resolve) => {
      // If the tab is hidden, don't wait on the (paused) typewriter —
      // just flush immediately and resolve.
      if (document.hidden) {
        flushQueue();
        resolve();
        return;
      }
      const check = setInterval(() => {
        if (queueRef.current.length === 0) {
          clearInterval(check);
          resolve();
        }
      }, 30);
    });

  const createNewChat = () => {
    stopTypewriter();
    // Created client-side only; the backend row is created lazily on the
    // first message sent (see /ask-stream), so an unused "New Chat" never
    // clutters the database.
    const newChat: Chat = {
      id: crypto.randomUUID(),
      title: "New Chat",
      messages: [],
      createdAt: new Date(),
    };
    setChats((prev) => [newChat, ...prev]);
    setCurrentChat(newChat);
    setQuestion("");
    setDisplayedContent("");
    fullContentRef.current = "";
    queueRef.current = "";
  };

  const selectChat = async (chat: Chat) => {
    if (isLoading) return;
    stopTypewriter();
    setDisplayedContent("");
    fullContentRef.current = "";
    queueRef.current = "";
    setCurrentChat(chat);

    // Messages aren't kept in the sidebar list response — fetch them now.
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`${API_BASE}/chats/${chat.id}/messages`);
      const rows = await res.json();
      const messages: Message[] = rows.map((r: any) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        toolCalls: r.toolCalls,
        timestamp: new Date(r.timestamp),
      }));
      setCurrentChat({ ...chat, messages });
    } catch (e) {
      console.error("Failed to load chat messages:", e);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteConfirm === chatId) {
      try {
        await fetch(`${API_BASE}/chats/${chatId}`, { method: "DELETE" });
        setChats((prev) => prev.filter((c) => c.id !== chatId));
        if (currentChat?.id === chatId) {
          setCurrentChat(null);
          setDisplayedContent("");
          fullContentRef.current = "";
          queueRef.current = "";
        }
        setDeleteConfirm(null);
      } catch (e) {
        console.error("Failed to delete chat:", e);
      }
    } else {
      setDeleteConfirm(chatId);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    let activeChat = currentChat;
    if (!activeChat) {
      const newChat: Chat = {
        id: crypto.randomUUID(),
        title: question.slice(0, 30) + (question.length > 30 ? "..." : ""),
        messages: [],
        createdAt: new Date(),
      };
      setChats((prev) => [newChat, ...prev]);
      setCurrentChat(newChat);
      activeChat = newChat;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      timestamp: new Date(),
    };

    const updatedChat = {
      ...activeChat,
      messages: [...activeChat.messages, userMessage],
      title:
        activeChat.messages.length === 0
          ? question.slice(0, 30) + (question.length > 30 ? "..." : "")
          : activeChat.title,
    };

    setCurrentChat(updatedChat);
    setChats((prev) => {
      const exists = prev.some((c) => c.id === updatedChat.id);
      return exists
        ? prev.map((c) => (c.id === updatedChat.id ? updatedChat : c))
        : [updatedChat, ...prev];
    });

    setIsLoading(true);
    fullContentRef.current = "";
    queueRef.current = "";
    setDisplayedContent("");
    setQuestion("");

    const toolCalls: any[] = [];

    // handleEvent is the single source of truth for "what actually
    // arrived". It always updates fullContentRef immediately (this is
    // what gets saved), and separately feeds the queue that drives the
    // visual typing animation — or, if the tab is hidden, writes straight
    // to the visible state so nothing is stuck waiting on a paused timer.
    const handleEvent = (data: any) => {
      if (data.type === "content") {
        fullContentRef.current += data.content;
        if (document.hidden) {
          setDisplayedContent((prev) => prev + data.content);
        } else {
          queueRef.current += data.content;
          startTypewriter();
        }
      } else if (data.type === "tool_call") {
        toolCalls.push(data);
      } else if (data.type === "error") {
        const errText = `\nError: ${data.error}`;
        fullContentRef.current += errText;
        if (document.hidden) {
          setDisplayedContent((prev) => prev + errText);
        } else {
          queueRef.current += errText;
          startTypewriter();
        }
      }
    };

    try {
      const response = await fetch(`${API_BASE}/ask-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // chat_id ties this turn to the right conversation both in
        // Postgres (message history) and in the agent's checkpointer
        // (conversation memory) — same id, every turn.
        body: JSON.stringify({
          question: userMessage.content,
          chat_id: activeChat.id,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              handleEvent(JSON.parse(line.slice(6)));
            } catch (e) {
              console.error("Error parsing SSE data:", e, line);
            }
          }
        }
      }

      sseBuffer += decoder.decode();
      if (sseBuffer.startsWith("data: ")) {
        try {
          handleEvent(JSON.parse(sseBuffer.slice(6)));
        } catch (e) {
          console.error("Error parsing final SSE data:", e, sseBuffer);
        }
      }

      // Let any remaining queued characters finish typing out (or flush
      // instantly if the tab is hidden) before finalizing the message.
      await waitForQueueToDrain();
      stopTypewriter();

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        // Saved from fullContentRef — the real arrived text — never from
        // the animated displayedContent, so the typing effect can never
        // cause truncated or delayed message history.
        content: fullContentRef.current,
        toolCalls,
        timestamp: new Date(),
      };

      const finalChat = {
        ...updatedChat,
        messages: [...updatedChat.messages, assistantMessage],
      };

      setCurrentChat(finalChat);
      setChats((prev) =>
        prev.map((c) => (c.id === finalChat.id ? finalChat : c)),
      );
      setDisplayedContent("");
      fullContentRef.current = "";
    } catch (error) {
      stopTypewriter();
      const errorMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      setDisplayedContent(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex">
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? "w-72" : "w-0"} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out overflow-hidden flex flex-col`}
      >
        <div className="p-4">
          <button
            onClick={createNewChat}
            className="w-full mb-4 px-4 py-3 bg-linear-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-medium flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
          >
            <span className="text-xl">+</span> New Chat
          </button>

          <div className="flex-1 overflow-y-auto">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Recent Chats
            </h3>
            {chats.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-500 text-center py-4">
                No chats yet
              </p>
            ) : (
              <div className="space-y-2">
                {chats.map((chat) => (
                  <div key={chat.id} className="relative group">
                    <button
                      onClick={() => selectChat(chat)}
                      disabled={isLoading}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                        currentChat?.id === chat.id
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 shadow-sm"
                          : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      <div className="text-sm font-medium truncate pr-8">
                        {chat.title}
                      </div>
                    </button>
                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all duration-200 ${
                        deleteConfirm === chat.id
                          ? "bg-red-500 text-white"
                          : "opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                      }`}
                      title={
                        deleteConfirm === chat.id
                          ? "Confirm delete"
                          : "Delete chat"
                      }
                    >
                      {deleteConfirm === chat.id ? (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Toggle sidebar"
            >
              <svg
                className="w-5 h-5 text-gray-600 dark:text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {sidebarOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 5l7 7-7 7M5 5l7 7-7 7"
                  />
                )}
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              Stock Market Analysis AI
            </h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-6">
            {isLoadingMessages && (
              <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-6">
                Loading conversation...
              </div>
            )}

            {!isLoadingMessages &&
              currentChat?.messages.map((message) => (
                <div
                  key={message.id}
                  className={`py-6 rounded-2xl px-4 ${
                    message.role === "user"
                      ? "bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20"
                      : "bg-white dark:bg-gray-800 shadow-sm"
                  }`}
                >
                  <div className="max-w-4xl mx-auto">
                    <div className="flex items-start gap-4">
                      <div
                        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shadow-md ${
                          message.role === "user"
                            ? "bg-linear-to-br from-blue-600 to-blue-700 text-white"
                            : "bg-linear-to-br from-green-600 to-green-700 text-white"
                        }`}
                      >
                        {message.role === "user" ? (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          {message.role === "user" ? "You" : "AI Assistant"}
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className={proseClasses}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                        {message.toolCalls && message.toolCalls.length > 0 && (
                          <div className="mt-4 p-3 bg-linear-to-r from-gray-50 to-gray-100 dark:from-gray-900/50 dark:to-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                              </svg>
                              Tools Used:
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {message.toolCalls.map((call, index) => (
                                <span
                                  key={index}
                                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-linear-to-r from-blue-100 to-blue-200 text-blue-800 dark:from-blue-900/30 dark:to-blue-800/30 dark:text-blue-300 shadow-sm"
                                >
                                  {call.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

            {isLoading && (
              <div className="py-6 rounded-2xl px-4 bg-white dark:bg-gray-800 shadow-sm">
                <div className="max-w-4xl mx-auto">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold bg-linear-to-br from-green-600 to-green-700 text-white shadow-md">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
                        AI Assistant
                      </div>

                      {!displayedContent && (
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex space-x-2">
                            <div
                              className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                              style={{ animationDelay: "0ms" }}
                            ></div>
                            <div
                              className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                              style={{ animationDelay: "150ms" }}
                            ></div>
                            <div
                              className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                              style={{ animationDelay: "300ms" }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            Analyzing market data...
                          </span>
                        </div>
                      )}

                      {displayedContent && (
                        <div className={proseClasses}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {displayedContent}
                          </ReactMarkdown>
                          {isTyping && (
                            <span
                              className="inline-block w-[2px] h-4 bg-gray-500 dark:bg-gray-400 align-middle ml-0.5 animate-pulse"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!currentChat && !isLoading && (
              <div className="text-center py-12">
                <div className="max-w-md mx-auto">
                  <div className="w-16 h-16 mx-auto mb-4 bg-linear-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg">
                    <svg
                      className="w-8 h-8 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Welcome to Stock Market Analysis AI
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Ask me anything about stocks, companies, financial analysis,
                    or market trends. I'll provide you with accurate, up-to-date
                    information.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {[
                      "What's the current price of AAPL?",
                      "Compare Tesla vs Ford",
                      "Latest earnings for Microsoft",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setQuestion(suggestion)}
                        className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={responseEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="px-4 pb-6 border-t border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm"
          >
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3 items-end pt-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about stocks, companies, or financial analysis..."
                    className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm transition-all duration-200"
                    disabled={isLoading}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !question.trim()}
                  className="px-6 py-3 bg-linear-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 transition-all duration-200 font-medium h-12 shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      Send
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
