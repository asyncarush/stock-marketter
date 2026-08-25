"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

// Shared markdown styling used for both finished messages and the
// in-progress streaming bubble. Tuned for chat context: smaller headings,
// tighter spacing, cleaner code blocks (like Claude / ChatGPT responses)
// instead of "document" sized prose.
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
// Table rendering is handled by custom components (markdownComponents below)
// instead of prose-table-* utilities, for a real boxed/bordered grid look.

// How fast the "typing" reveal runs. Lower interval / higher chars-per-tick
// = faster typing. Tuned to feel similar to Claude/ChatGPT's pace.
const TYPE_INTERVAL_MS = 15;
const CHARS_PER_TICK = 2;

/**
 * Best-effort safety net: if any tab/space-aligned pseudo-table slips
 * through despite the backend now emitting real markdown tables, convert
 * it into real GFM pipe syntax so it still renders as a table instead of
 * collapsing into a wall of text. Leaves real markdown and normal prose
 * untouched.
 */
function normalizeTables(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  const splitRow = (line: string): string[] =>
    line
      .split(/\t+|\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|/.test(line) || /^\s*#/.test(line) || line.trim() === "") {
      output.push(line);
      i++;
      continue;
    }

    const cols = splitRow(line);
    if (cols.length >= 2) {
      const blockRows: string[][] = [cols];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        if (nextLine.trim() === "" || /^\s*#/.test(nextLine)) break;
        const nextCols = splitRow(nextLine);
        if (nextCols.length < 2 || Math.abs(nextCols.length - cols.length) > 1)
          break;
        blockRows.push(nextCols);
        j++;
      }
      if (blockRows.length >= 2) {
        const colCount = Math.max(...blockRows.map((r) => r.length));
        const pad = (row: string[]) => {
          const r = [...row];
          while (r.length < colCount) r.push("");
          return r;
        };
        const header = pad(blockRows[0]);
        output.push(`| ${header.join(" | ")} |`);
        output.push(`|${header.map(() => " --- ").join("|")}|`);
        for (let k = 1; k < blockRows.length; k++) {
          output.push(`| ${pad(blockRows[k]).join(" | ")} |`);
        }
        i = j;
        continue;
      }
    }
    output.push(line);
    i++;
  }
  return output.join("\n");
}

// Custom renderers -> real bordered/boxed grid instead of relying on
// Tailwind typography's table styles.
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
  const [displayedContent, setDisplayedContent] = useState("");
  const responseEndRef = useRef<HTMLDivElement>(null);

  const fullContentRef = useRef("");
  const queueRef = useRef("");
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedContent]);

  const startTypewriter = () => {
    if (typingTimerRef.current) return;
    setIsTyping(true);
    typingTimerRef.current = setInterval(() => {
      if (queueRef.current.length === 0) return;
      const nextChars = queueRef.current.slice(0, CHARS_PER_TICK);
      queueRef.current = queueRef.current.slice(CHARS_PER_TICK);
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
      const check = setInterval(() => {
        if (queueRef.current.length === 0) {
          clearInterval(check);
          resolve();
        }
      }, 30);
    });

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

  const selectChat = (chat: Chat) => {
    if (isLoading) return;
    stopTypewriter();
    setCurrentChat(chat);
    setDisplayedContent("");
    fullContentRef.current = "";
    queueRef.current = "";
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
    setChats((prev) =>
      prev.map((c) => (c.id === updatedChat.id ? updatedChat : c)),
    );

    setIsLoading(true);
    fullContentRef.current = "";
    queueRef.current = "";
    setDisplayedContent("");
    setQuestion("");

    const toolCalls: any[] = [];

    const handleEvent = (data: any) => {
      if (data.type === "content") {
        fullContentRef.current += data.content;
        queueRef.current += data.content;
        startTypewriter();
      } else if (data.type === "tool_call") {
        toolCalls.push(data);
      } else if (data.type === "error") {
        const errText = `\nError: ${data.error}`;
        fullContentRef.current += errText;
        queueRef.current += errText;
        startTypewriter();
      }
    };

    try {
      const response = await fetch("http://localhost:8000/ask-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage.content }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      // Carries any bytes/text that couldn't be decoded or wasn't a full
      // line yet, across successive reader.read() calls.
      let sseBuffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // `{ stream: true }` is essential here: without it, a multi-byte
          // UTF-8 character (e.g. "₹", 3 bytes) that's split across two
          // network chunks gets corrupted into "�" on each half instead of
          // being reassembled correctly by the decoder's internal state.
          sseBuffer += decoder.decode(value, { stream: true });

          // An SSE "data: {...}" line can also be split across chunk
          // boundaries. Only process fully-received lines; keep whatever
          // trailing partial line remains in the buffer for next time,
          // instead of trying to JSON.parse an incomplete fragment (which
          // silently drops content on parse failure).
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

      // Flush any bytes still held by the decoder plus a final leftover
      // line once the stream has ended.
      sseBuffer += decoder.decode();
      if (sseBuffer.startsWith("data: ")) {
        try {
          handleEvent(JSON.parse(sseBuffer.slice(6)));
        } catch (e) {
          console.error("Error parsing final SSE data:", e, sseBuffer);
        }
      }

      await waitForQueueToDrain();
      stopTypewriter();

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 flex flex-col">
        <button
          onClick={createNewChat}
          className="w-full mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
        >
          <span className="text-xl">+</span> New Chat
        </button>

        <div className="flex-1 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">
            Recent Chats
          </h3>
          {chats.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-500">
              No chats yet
            </p>
          ) : (
            <div className="space-y-2">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => selectChat(chat)}
                  disabled={isLoading}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    currentChat?.id === chat.id
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <div className="text-sm font-medium truncate">
                    {chat.title}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    {chat.messages.length} messages
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Stock Market Analysis AI
            </h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-6">
            {currentChat?.messages.map((message) => (
              <div
                key={message.id}
                className={`py-6 rounded-2xl px-4 ${
                  message.role === "user"
                    ? "bg-blue-50 dark:bg-blue-900/20"
                    : "bg-white dark:bg-gray-800"
                }`}
              >
                <div className="max-w-4xl mx-auto">
                  <div className="flex items-start gap-4">
                    <div
                      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                        message.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-green-600 text-white"
                      }`}
                    >
                      {message.role === "user" ? "U" : "AI"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold mb-2 text-gray-900 dark:text-gray-100">
                        {message.role === "user" ? "You" : "AI Assistant"}
                      </div>
                      <div className={proseClasses}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {normalizeTables(message.content)}
                        </ReactMarkdown>
                      </div>
                      {message.toolCalls && message.toolCalls.length > 0 && (
                        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Tools Used:
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {message.toolCalls.map((call, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
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
              <div className="py-6 rounded-2xl px-4 bg-white dark:bg-gray-800">
                <div className="max-w-4xl mx-auto">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-green-600 text-white">
                      AI
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
                            Thinking...
                          </span>
                        </div>
                      )}

                      {displayedContent && (
                        <div className={proseClasses}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {normalizeTables(displayedContent)}
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

            <div ref={responseEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="px-4 pb-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3 items-end pt-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask about stocks, companies, or financial analysis..."
                    className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isLoading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !question.trim()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors font-medium h-12"
                >
                  {isLoading ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
