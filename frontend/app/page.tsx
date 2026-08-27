"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

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

/* ==========================================================================
   MARKDOWN STYLING
   ========================================================================== */

const proseClasses = `
  prose prose-base dark:prose-invert max-w-none

  [&>*:first-child]:mt-0
  [&>*:last-child]:mb-0

  prose-headings:font-semibold
  prose-headings:text-gray-900
  dark:prose-headings:text-gray-100

  prose-h1:text-2xl
  prose-h1:font-bold
  prose-h1:mt-6
  prose-h1:mb-4
  prose-h1:pb-2
  prose-h1:border-b
  prose-h1:border-gray-200
  dark:prose-h1:border-gray-700

  prose-h2:text-xl
  prose-h2:font-semibold
  prose-h2:mt-6
  prose-h2:mb-3

  prose-h3:text-lg
  prose-h3:font-semibold
  prose-h3:mt-5
  prose-h3:mb-2

  prose-h4:text-base
  prose-h4:font-semibold
  prose-h4:mt-4
  prose-h4:mb-2

  prose-p:text-gray-700
  dark:prose-p:text-gray-300
  prose-p:leading-7
  prose-p:mb-4

  prose-strong:text-gray-900
  dark:prose-strong:text-gray-100
  prose-strong:font-semibold

  prose-em:text-gray-700
  dark:prose-em:text-gray-300

  prose-ul:my-4
  prose-ul:pl-6
  prose-ul:list-disc
  prose-ul:space-y-1

  prose-ol:my-4
  prose-ol:pl-6
  prose-ol:list-decimal
  prose-ol:space-y-1

  prose-li:text-gray-700
  dark:prose-li:text-gray-300
  prose-li:leading-7

  prose-hr:border-gray-200
  dark:prose-hr:border-gray-700
  prose-hr:my-6

  prose-blockquote:border-l-4
  prose-blockquote:border-blue-300
  dark:prose-blockquote:border-blue-700
  prose-blockquote:pl-4
  prose-blockquote:italic
  prose-blockquote:text-gray-600
  dark:prose-blockquote:text-gray-400
  prose-blockquote:my-4

  prose-code:text-pink-600
  dark:prose-code:text-pink-400
  prose-code:bg-gray-100
  dark:prose-code:bg-gray-800
  prose-code:px-1.5
  prose-code:py-0.5
  prose-code:rounded-md
  prose-code:text-[0.85em]
  prose-code:font-medium

  prose-code:before:content-none
  prose-code:after:content-none

  prose-pre:bg-transparent
  prose-pre:p-0
  prose-pre:m-0
`;

/* ==========================================================================
   ICONS
   ========================================================================== */

function CopyIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
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
  );
}

function DownloadIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"
      />
    </svg>
  );
}

/* ==========================================================================
   CODE BLOCK
   ========================================================================== */

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  return (
    <div className="not-prose my-5 overflow-hidden rounded-xl border border-gray-800 shadow-sm">
      <div className="flex items-center justify-between bg-[#161b22] px-4 py-2 text-xs text-gray-400">
        <span className="font-mono">{language || "text"}</span>

        <button
          type="button"
          onClick={handleCopy}
          className="
            flex
            items-center
            gap-1.5
            rounded-md
            px-2
            py-1
            hover:bg-white/10
            hover:text-gray-200
            transition-colors
          "
        >
          {copied ? <CheckIcon /> : <CopyIcon />}

          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre
        className="
          overflow-x-auto
          bg-[#0d1117]
          p-4
          text-sm
          leading-relaxed
          text-gray-100
        "
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

/* ==========================================================================
   DOWNLOADABLE FILES
   ========================================================================== */

const DOWNLOADABLE_EXT = /\.(pdf|csv|xlsx?|docx?|pptx?|zip|png|jpe?g|json)$/i;

/* ==========================================================================
   STREAMING MARKDOWN HELPERS
   ========================================================================== */

/*
 * During streaming, a fenced code block might temporarily look like:
 *
 * ```python
 * print("hello")
 *
 * because the closing ``` has not arrived yet.
 *
 * We temporarily add the closing fence ONLY for rendering.
 * The actual backend response is never modified.
 */
function prepareStreamingMarkdown(content: string) {
  const fenceMatches = content.match(/^```/gm);

  const fenceCount = fenceMatches?.length ?? 0;

  if (fenceCount % 2 !== 0) {
    return `${content}\n\`\`\``;
  }

  return content;
}

function normalizeStreamingMarkdown(content: string) {
  return content.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n");
}

/* ==========================================================================
   MARKDOWN COMPONENTS
   ========================================================================== */

const markdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
      {children}
    </h1>
  ),

  h2: ({ children }: any) => (
    <h2 className="text-xl font-semibold mt-6 mb-3 text-gray-900 dark:text-gray-100">
      {children}
    </h2>
  ),

  h3: ({ children }: any) => (
    <h3 className="text-lg font-semibold mt-5 mb-2 text-gray-900 dark:text-gray-100">
      {children}
    </h3>
  ),

  h4: ({ children }: any) => (
    <h4 className="text-base font-semibold mt-4 mb-2 text-gray-900 dark:text-gray-100">
      {children}
    </h4>
  ),

  p: ({ children }: any) => (
    <p className="mb-4 leading-7 text-gray-700 dark:text-gray-300">
      {children}
    </p>
  ),

  strong: ({ children }: any) => (
    <strong className="font-semibold text-gray-900 dark:text-gray-100">
      {children}
    </strong>
  ),

  ul: ({ children }: any) => (
    <ul className="my-4 ml-6 list-disc space-y-1">{children}</ul>
  ),

  ol: ({ children }: any) => (
    <ol className="my-4 ml-6 list-decimal space-y-1">{children}</ol>
  ),

  li: ({ children }: any) => (
    <li className="leading-7 text-gray-700 dark:text-gray-300">{children}</li>
  ),

  blockquote: ({ children }: any) => (
    <blockquote className="my-4 border-l-4 border-blue-300 dark:border-blue-700 pl-4 italic text-gray-600 dark:text-gray-400">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-6 border-gray-200 dark:border-gray-700" />,

  code: ({ inline, className, children }: any) => {
    const language = className?.replace("language-", "") || "";

    const code = String(children ?? "").replace(/\n$/, "");

    if (!inline) {
      return <CodeBlock language={language} code={code} />;
    }

    return (
      <code
        className="
          rounded-md
          bg-gray-100
          dark:bg-gray-800
          px-1.5
          py-0.5
          text-[0.85em]
          font-medium
          text-pink-600
          dark:text-pink-400
        "
      >
        {children}
      </code>
    );
  },

  pre: ({ children }: any) => {
    return <>{children}</>;
  },

  a: ({ href, children }: any) => {
    const text = String(children ?? "");

    const isDownload =
      DOWNLOADABLE_EXT.test(href || "") || /download/i.test(text);

    if (isDownload) {
      return (
        <a
          href={href}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="
            not-prose
            inline-flex
            items-center
            gap-2
            my-1
            rounded-lg
            border
            border-emerald-200
            dark:border-emerald-800
            bg-emerald-50
            dark:bg-emerald-900/20
            px-3
            py-1.5
            text-sm
            font-medium
            text-emerald-700
            dark:text-emerald-400
            no-underline
            transition-colors
            hover:bg-emerald-100
            dark:hover:bg-emerald-900/30
          "
        >
          <DownloadIcon />

          {text || "Download"}
        </a>
      );
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="
          font-medium
          text-blue-600
          dark:text-blue-400
          underline
          underline-offset-2
          hover:text-blue-700
          dark:hover:text-blue-300
        "
      >
        {children}
      </a>
    );
  },

  table: ({ children }: any) => (
    <div className="not-prose my-5 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
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
    <tr className="even:bg-gray-50/60 dark:even:bg-gray-800/30">{children}</tr>
  ),

  th: ({ children }: any) => (
    <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
      {children}
    </th>
  ),

  td: ({ children }: any) => (
    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 align-top">
      {children}
    </td>
  ),
};

/* ==========================================================================
   MARKDOWN RENDERER
   ========================================================================== */

function MarkdownRenderer({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  if (!content) {
    return null;
  }

  let markdown = normalizeStreamingMarkdown(content);

  if (streaming) {
    markdown = prepareStreamingMarkdown(markdown);
  }

  return (
    <div className={proseClasses}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={markdownComponents}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

/* ==========================================================================
   MAIN
   ========================================================================== */

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

  /* ------------------------------------------------------------------------
     Streaming state

     fullContentRef:
       Complete response received from backend.

     queueRef:
       Text received from backend but not yet displayed.

     typingTimerRef:
       setTimeout based natural typing timer.
  ------------------------------------------------------------------------ */

  const fullContentRef = useRef("");

  const queueRef = useRef("");

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ==========================================================================
     AUTO SCROLL
     ========================================================================== */

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [displayedContent]);

  /* ==========================================================================
     LOAD CHATS
     ========================================================================== */

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/chats`);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const rows = await res.json();

        setChats(
          rows.map((r: any) => ({
            id: r.id,
            title: r.title,
            createdAt: new Date(r.createdAt),
            messages: [],
          })),
        );
      } catch (error) {
        console.error("Failed to load chat list:", error);
      }
    })();
  }, []);

  /* ==========================================================================
     NATURAL TYPEWRITER
     ========================================================================== */

  const flushQueue = () => {
    if (!queueRef.current.length) {
      return;
    }

    setDisplayedContent((prev) => prev + queueRef.current);

    queueRef.current = "";
  };

  const stopTypewriter = () => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);

      typingTimerRef.current = null;
    }

    setIsTyping(false);
  };

  /*
   * Calculate a human-like delay.
   *
   * Normal character:
   *   25 - 55ms
   *
   * Comma / colon:
   *   slightly longer
   *
   * Sentence ending:
   *   noticeably longer
   *
   * New line:
   *   small pause
   */
  const getTypingDelay = (character: string) => {
    let delay = 30 + Math.random() * 30;

    if (character === "." || character === "!" || character === "?") {
      delay += 100 + Math.random() * 100;
    } else if (character === "," || character === ":" || character === ";") {
      delay += 40 + Math.random() * 60;
    } else if (character === "\n") {
      delay += 60 + Math.random() * 80;
    }

    return delay;
  };

  /*
   * Natural character-by-character typing.
   *
   * IMPORTANT:
   *
   * There is deliberately NO aggressive catch-up logic here.
   *
   * If backend produces text faster than the UI,
   * the queue grows temporarily.
   *
   * That's okay because the user gets a consistent
   * natural typing speed.
   */
  const startTypewriter = () => {
    if (typingTimerRef.current) {
      return;
    }

    setIsTyping(true);

    const typeNextCharacter = () => {
      if (document.hidden) {
        typingTimerRef.current = null;
        return;
      }

      if (!queueRef.current.length) {
        typingTimerRef.current = null;
        setIsTyping(false);
        return;
      }

      const nextCharacter = queueRef.current.charAt(0);

      queueRef.current = queueRef.current.slice(1);

      setDisplayedContent((prev) => prev + nextCharacter);

      const delay = getTypingDelay(nextCharacter);

      typingTimerRef.current = setTimeout(typeNextCharacter, delay);
    };

    typeNextCharacter();
  };

  const waitForQueueToDrain = () =>
    new Promise<void>((resolve) => {
      if (document.hidden) {
        flushQueue();
        resolve();
        return;
      }

      if (!queueRef.current.length) {
        resolve();
        return;
      }

      const check = setInterval(() => {
        if (!queueRef.current.length) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

  /* ==========================================================================
     VISIBILITY
     ========================================================================== */

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        /*
         * If the user changes tabs, don't make them
         * wait for the typewriter when they return.
         */
        flushQueue();
        stopTypewriter();
      } else if (queueRef.current.length) {
        startTypewriter();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  /* ==========================================================================
     CLEANUP
     ========================================================================== */

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  /* ==========================================================================
     NEW CHAT
     ========================================================================== */

  const createNewChat = () => {
    stopTypewriter();

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

  /* ==========================================================================
     SELECT CHAT
     ========================================================================== */

  const selectChat = async (chat: Chat) => {
    if (isLoading) {
      return;
    }

    stopTypewriter();

    setDisplayedContent("");

    fullContentRef.current = "";

    queueRef.current = "";

    setCurrentChat(chat);

    setIsLoadingMessages(true);

    try {
      const res = await fetch(`${API_BASE}/chats/${chat.id}/messages`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const rows = await res.json();

      const messages: Message[] = rows.map((r: any) => ({
        id: r.id,
        role: r.role,
        content: r.content,
        toolCalls: r.toolCalls,
        timestamp: new Date(r.timestamp),
      }));

      setCurrentChat({
        ...chat,
        messages,
      });
    } catch (error) {
      console.error("Failed to load chat messages:", error);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  /* ==========================================================================
     DELETE CHAT
     ========================================================================== */

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (deleteConfirm === chatId) {
      try {
        await fetch(`${API_BASE}/chats/${chatId}`, {
          method: "DELETE",
        });

        setChats((prev) => prev.filter((c) => c.id !== chatId));

        if (currentChat?.id === chatId) {
          setCurrentChat(null);

          setDisplayedContent("");

          fullContentRef.current = "";

          queueRef.current = "";
        }

        setDeleteConfirm(null);
      } catch (error) {
        console.error("Failed to delete chat:", error);
      }
    } else {
      setDeleteConfirm(chatId);

      setTimeout(() => {
        setDeleteConfirm(null);
      }, 3000);
    }
  };

  /* ==========================================================================
     SUBMIT
     ========================================================================== */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!question.trim() || isLoading) {
      return;
    }

    let activeChat = currentChat;

    /* ----------------------------------------------------------------------
       Create chat
    ---------------------------------------------------------------------- */

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

    /* ----------------------------------------------------------------------
       User message
    ---------------------------------------------------------------------- */

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

      if (exists) {
        return prev.map((c) => (c.id === updatedChat.id ? updatedChat : c));
      }

      return [updatedChat, ...prev];
    });

    /* ----------------------------------------------------------------------
       Reset streaming state
    ---------------------------------------------------------------------- */

    setIsLoading(true);

    stopTypewriter();

    fullContentRef.current = "";

    queueRef.current = "";

    setDisplayedContent("");

    setQuestion("");

    const toolCalls: any[] = [];

    /* ----------------------------------------------------------------------
       SSE event handler
    ---------------------------------------------------------------------- */

    const handleEvent = (data: any) => {
      if (data.type === "content") {
        const content = String(data.content ?? "");

        if (!content) {
          return;
        }

        /*
         * Store complete backend response.
         */
        fullContentRef.current += content;

        /*
         * Add to visual queue.
         */
        if (document.hidden) {
          setDisplayedContent((prev) => prev + content);
        } else {
          queueRef.current += content;

          startTypewriter();
        }
      } else if (data.type === "tool_call") {
        toolCalls.push(data);
      } else if (data.type === "error") {
        const errorText = `\n\n**Error:** ${data.error}`;

        fullContentRef.current += errorText;

        if (document.hidden) {
          setDisplayedContent((prev) => prev + errorText);
        } else {
          queueRef.current += errorText;

          startTypewriter();
        }
      }
    };

    /* ----------------------------------------------------------------------
       Request
    ---------------------------------------------------------------------- */

    try {
      const response = await fetch(`${API_BASE}/ask-stream`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          question: userMessage.content,

          chat_id: activeChat.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("Response body is empty");
      }

      const reader = response.body.getReader();

      const decoder = new TextDecoder();

      let sseBuffer = "";

      /* ------------------------------------------------------------------
         Read stream
      ------------------------------------------------------------------ */

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        sseBuffer += decoder.decode(value, {
          stream: true,
        });

        const lines = sseBuffer.split("\n");

        /*
         * Keep incomplete line.
         */
        sseBuffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trimEnd();

          if (!line.startsWith("data:")) {
            continue;
          }

          const payload = line.slice(5).trim();

          if (!payload) {
            continue;
          }

          if (payload === "[DONE]") {
            continue;
          }

          try {
            const data = JSON.parse(payload);

            handleEvent(data);
          } catch (error) {
            console.error("Error parsing SSE data:", error, line);
          }
        }
      }

      /* ------------------------------------------------------------------
         Flush final decoder buffer
      ------------------------------------------------------------------ */

      sseBuffer += decoder.decode();

      const remaining = sseBuffer.trim();

      if (remaining.startsWith("data:")) {
        const payload = remaining.slice(5).trim();

        if (payload && payload !== "[DONE]") {
          try {
            handleEvent(JSON.parse(payload));
          } catch (error) {
            console.error("Error parsing final SSE data:", error, remaining);
          }
        }
      }

      /* ------------------------------------------------------------------
         Wait for typewriter
      ------------------------------------------------------------------ */

      await waitForQueueToDrain();

      stopTypewriter();

      /* ------------------------------------------------------------------
         Save assistant message
      ------------------------------------------------------------------ */

      const assistantMessage: Message = {
        id: crypto.randomUUID(),

        role: "assistant",

        /*
         * NEVER save displayedContent.
         *
         * Save the complete response received
         * from backend.
         */
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

      const errorMessage = `**Error:** ${
        error instanceof Error ? error.message : "Unknown error"
      }`;

      setDisplayedContent(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  /* ==========================================================================
     UI
     ========================================================================== */

  return (
    <div
      className="
        min-h-screen
        bg-linear-to-br
        from-gray-50
        to-gray-100
        dark:from-gray-900
        dark:to-gray-800
        flex
      "
    >
      {/* ====================================================================
          SIDEBAR
          ==================================================================== */}

      <div
        className={`
          ${sidebarOpen ? "w-72" : "w-0"}

          bg-white
          dark:bg-gray-800

          border-r
          border-gray-200
          dark:border-gray-700

          transition-all
          duration-300

          overflow-hidden
          flex
          flex-col
        `}
      >
        <div className="p-4">
          <button
            onClick={createNewChat}
            className="
              w-full
              mb-4
              px-4
              py-3

              bg-linear-to-r
              from-blue-600
              to-blue-700

              text-white
              rounded-xl

              hover:from-blue-700
              hover:to-blue-800

              transition-all

              font-medium

              flex
              items-center
              justify-center
              gap-2

              shadow-md
            "
          >
            <span className="text-xl">+</span>
            New Chat
          </button>

          <div className="flex-1 overflow-y-auto">
            <h3
              className="
                text-sm
                font-semibold
                text-gray-600
                dark:text-gray-400
                mb-3

                flex
                items-center
                gap-2
              "
            >
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
              <p
                className="
                  text-sm
                  text-gray-500
                  text-center
                  py-4
                "
              >
                No chats yet
              </p>
            ) : (
              <div className="space-y-2">
                {chats.map((chat) => (
                  <div key={chat.id} className="relative group">
                    <button
                      onClick={() => selectChat(chat)}
                      disabled={isLoading}
                      className={`
                          w-full
                          text-left
                          px-3
                          py-2.5
                          rounded-lg

                          transition-all

                          disabled:opacity-50
                          disabled:cursor-not-allowed

                          ${
                            currentChat?.id === chat.id
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                              : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                          }
                        `}
                    >
                      <div className="text-sm font-medium truncate pr-8">
                        {chat.title}
                      </div>
                    </button>

                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      className={`
                          absolute
                          right-2
                          top-1/2
                          -translate-y-1/2
                          p-1.5
                          rounded-md
                          transition-all

                          ${
                            deleteConfirm === chat.id
                              ? "bg-red-500 text-white"
                              : "opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600"
                          }
                        `}
                      title={
                        deleteConfirm === chat.id
                          ? "Confirm delete"
                          : "Delete chat"
                      }
                    >
                      {deleteConfirm === chat.id ? (
                        <CheckIcon />
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

      {/* ====================================================================
          MAIN
          ==================================================================== */}

      <div className="flex-1 flex flex-col">
        {/* Header */}

        <div
          className="
            border-b
            border-gray-200
            dark:border-gray-700

            bg-white/80
            dark:bg-gray-800/80

            backdrop-blur-sm

            px-6
            py-4
          "
        >
          <div
            className="
              max-w-4xl
              mx-auto
              flex
              items-center
              gap-4
            "
          >
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="
                p-2
                rounded-lg
                hover:bg-gray-100
                dark:hover:bg-gray-700
              "
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

            <h1
              className="
                text-2xl
                font-bold
                text-gray-900
                dark:text-white

                flex
                items-center
                gap-2
              "
            >
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

        {/* ==================================================================
            CHAT AREA
            ================================================================== */}

        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
          <div
            className="
              flex-1
              overflow-y-auto
              space-y-6
              px-4
              py-6
            "
          >
            {isLoadingMessages && (
              <div
                className="
                  text-center
                  text-sm
                  text-gray-500
                  dark:text-gray-400
                  py-6
                "
              >
                Loading conversation...
              </div>
            )}

            {/* ==============================================================
                EXISTING MESSAGES
                ============================================================== */}

            {!isLoadingMessages &&
              currentChat?.messages.map((message) => (
                <div
                  key={message.id}
                  className={`
                      py-6
                      rounded-2xl
                      px-4

                      ${
                        message.role === "user"
                          ? "bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20"
                          : "bg-white dark:bg-gray-800 shadow-sm"
                      }
                    `}
                >
                  <div className="max-w-4xl mx-auto">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}

                      <div
                        className={`
                            shrink-0
                            w-10
                            h-10
                            rounded-full

                            flex
                            items-center
                            justify-center

                            shadow-md

                            ${
                              message.role === "user"
                                ? "bg-blue-600 text-white"
                                : "bg-green-600 text-white"
                            }
                          `}
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
                              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2v10a2 2 0 002 2z"
                            />
                          </svg>
                        )}
                      </div>

                      {/* Message */}

                      <div className="flex-1 min-w-0">
                        <div
                          className="
                              text-sm
                              font-semibold
                              mb-3
                              text-gray-900
                              dark:text-gray-100

                              flex
                              items-center
                              gap-2
                            "
                        >
                          {message.role === "user" ? "You" : "AI Assistant"}

                          <span
                            className="
                                text-xs
                                text-gray-500
                                dark:text-gray-400
                                font-normal
                              "
                          >
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </span>
                        </div>

                        {message.role === "user" ? (
                          <div
                            className="
                                whitespace-pre-wrap
                                text-gray-800
                                dark:text-gray-200
                                leading-7
                              "
                          >
                            {message.content}
                          </div>
                        ) : (
                          <MarkdownRenderer content={message.content} />
                        )}

                        {/* Tool calls */}

                        {message.toolCalls && message.toolCalls.length > 0 && (
                          <div
                            className="
                                  mt-5
                                  p-3

                                  bg-gray-50
                                  dark:bg-gray-900/50

                                  rounded-lg

                                  border
                                  border-gray-200
                                  dark:border-gray-700
                                "
                          >
                            <h4
                              className="
                                    text-xs
                                    font-semibold
                                    text-gray-700
                                    dark:text-gray-300
                                    mb-2
                                  "
                            >
                              Tools Used:
                            </h4>

                            <div className="flex flex-wrap gap-2">
                              {message.toolCalls.map((call, index) => (
                                <span
                                  key={index}
                                  className="
                                          inline-flex
                                          items-center
                                          px-2.5
                                          py-1
                                          rounded-full

                                          text-xs
                                          font-medium

                                          bg-blue-100
                                          dark:bg-blue-900/30

                                          text-blue-800
                                          dark:text-blue-300
                                        "
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

            {/* ==============================================================
                STREAMING MESSAGE
                ============================================================== */}

            {isLoading && (
              <div
                className="
                  py-6
                  rounded-2xl
                  px-4

                  bg-white
                  dark:bg-gray-800

                  shadow-sm
                "
              >
                <div className="max-w-4xl mx-auto">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}

                    <div
                      className="
                        shrink-0
                        w-10
                        h-10
                        rounded-full

                        flex
                        items-center
                        justify-center

                        bg-green-600
                        text-white
                        shadow-md
                      "
                    >
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
                          d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2v10a2 2 0 002 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </div>

                    {/* Content */}

                    <div className="flex-1 min-w-0">
                      <div
                        className="
                          text-sm
                          font-semibold
                          mb-3
                          text-gray-900
                          dark:text-gray-100
                        "
                      >
                        AI Assistant
                      </div>

                      {!displayedContent && (
                        <div className="flex items-center gap-3">
                          <div className="flex space-x-2">
                            <div
                              className="
                                w-2
                                h-2
                                bg-blue-600
                                rounded-full
                                animate-bounce
                              "
                            />

                            <div
                              className="
                                w-2
                                h-2
                                bg-blue-600
                                rounded-full
                                animate-bounce
                              "
                              style={{
                                animationDelay: "150ms",
                              }}
                            />

                            <div
                              className="
                                w-2
                                h-2
                                bg-blue-600
                                rounded-full
                                animate-bounce
                              "
                              style={{
                                animationDelay: "300ms",
                              }}
                            />
                          </div>

                          <span
                            className="
                              text-sm
                              text-gray-600
                              dark:text-gray-400
                            "
                          >
                            Analyzing market data...
                          </span>
                        </div>
                      )}

                      {displayedContent && (
                        <div>
                          <MarkdownRenderer
                            content={displayedContent}
                            streaming
                          />

                          {isTyping && (
                            <span
                              className="
                                inline-block
                                w-[2px]
                                h-4

                                bg-gray-500
                                dark:bg-gray-400

                                align-middle
                                ml-1

                                animate-pulse
                              "
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==============================================================
                WELCOME
                ============================================================== */}

            {!currentChat && !isLoading && (
              <div className="text-center py-12">
                <div className="max-w-md mx-auto">
                  <div
                    className="
                        w-16
                        h-16
                        mx-auto
                        mb-4

                        bg-blue-600

                        rounded-2xl

                        flex
                        items-center
                        justify-center

                        shadow-lg
                      "
                  >
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

                  <h2
                    className="
                        text-xl
                        font-semibold
                        text-gray-900
                        dark:text-white
                        mb-2
                      "
                  >
                    Welcome to Stock Market Analysis AI
                  </h2>

                  <p
                    className="
                        text-gray-600
                        dark:text-gray-400
                        mb-6
                      "
                  >
                    Ask me anything about stocks, companies, financial analysis,
                    or market trends.
                  </p>

                  <div
                    className="
                        flex
                        flex-wrap
                        gap-2
                        justify-center
                      "
                  >
                    {[
                      "What's the current price of AAPL?",
                      "Compare Tesla vs Ford",
                      "Latest earnings for Microsoft",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setQuestion(suggestion)}
                        className="
                              px-3
                              py-1.5
                              text-sm

                              bg-white
                              dark:bg-gray-800

                              border
                              border-gray-200
                              dark:border-gray-700

                              rounded-lg

                              hover:bg-gray-50
                              dark:hover:bg-gray-700

                              text-gray-700
                              dark:text-gray-300
                            "
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

          {/* ================================================================
              INPUT
              ================================================================ */}

          <form
            onSubmit={handleSubmit}
            className="
              px-4
              pb-6

              border-t
              border-gray-200
              dark:border-gray-700

              bg-white/80
              dark:bg-gray-800/80

              backdrop-blur-sm
            "
          >
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3 items-end pt-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about stocks, companies, or financial analysis..."
                    className="
                      w-full

                      px-4
                      py-3
                      pr-12

                      rounded-xl

                      border
                      border-gray-300
                      dark:border-gray-600

                      bg-white
                      dark:bg-gray-800

                      text-gray-800
                      dark:text-white

                      focus:outline-none
                      focus:ring-2
                      focus:ring-blue-500

                      shadow-sm
                    "
                    disabled={isLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !question.trim()}
                  className="
                    px-6
                    py-3

                    bg-blue-600
                    hover:bg-blue-700

                    disabled:bg-gray-400

                    text-white

                    rounded-xl

                    font-medium

                    h-12

                    shadow-md

                    flex
                    items-center
                    gap-2

                    transition-colors
                  "
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
                        />

                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.343 5.824 3 7.938l3-2.647z"
                        />
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
