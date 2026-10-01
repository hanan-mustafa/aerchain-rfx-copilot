"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMarkdown } from "./ChatMarkdown";

interface Msg {
  role: "user" | "assistant";
  content: string;
  isError?: boolean; // shown as plain text, and never sent back as history
}

const SUGGESTED = [
  "Who's cheapest on the USB-C docking stations?",
  "What if we split it — cheapest per line, but only among vendors who cleared the questionnaire?",
  "Which lines need a human to look at before we award this?",
  "What's Global IT's real effective price after the rebate?",
];

// Shown one after another while the analyst works. Deliberately generic:
// they describe what the agent typically does, not live tool-call status.
const PROGRESS_MESSAGES = [
  "Reading your question…",
  "Checking the comparison store…",
  "Looking up vendor prices…",
  "Running the numbers in code…",
  "Checking flags and caveats…",
  "Cross-checking questionnaire results…",
  "Drafting the answer…",
];
const PROGRESS_INTERVAL_MS = 2200;

function ProgressIndicator() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % PROGRESS_MESSAGES.length), PROGRESS_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="chat-progress" role="status" aria-live="polite">
      <span className="chat-progress-dot" />
      {/* key restarts the fade-in on every change */}
      <span key={step} className="chat-progress-text">
        {PROGRESS_MESSAGES[step]}
      </span>
    </div>
  );
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll only the message list, not the window: scrollIntoView on mount
    // used to yank the whole page down past the header on first load.
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    // Error bubbles are UI only; the API expects real user/assistant turns.
    const history = next.filter((m) => !m.isError).map(({ role, content }) => ({ role, content }));
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: `Error: ${data.error}`, isError: true }]);
      }
    } catch (err: any) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${err.message}`, isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        border: "1px solid var(--line)",
        borderRadius: "4px",
        background: "var(--paper-raised)",
      }}
    >
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
        <h3 style={{ fontSize: "15px" }}>Ask the analyst</h3>
        <div style={{ fontSize: "11px", color: "var(--ink-dim)" }}>
          Reasons over the normalized comparison store only — never a raw document.
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ fontSize: "12px", color: "var(--ink-dim)" }}>Try asking:</div>
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  fontSize: "12.5px",
                  border: "1px solid var(--line)",
                  borderRadius: "4px",
                  background: "var(--paper)",
                  color: "var(--ink)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: m.role === "user" ? "85%" : "100%",
              minWidth: 0,
              background: m.isError ? "var(--fail-dim)" : m.role === "user" ? "var(--accent-dim)" : "var(--paper)",
              color: m.isError ? "var(--fail)" : undefined,
              border: "1px solid var(--line)",
              borderRadius: "6px",
              padding: "8px 10px",
              fontSize: "13px",
            }}
          >
            {m.role === "assistant" && !m.isError ? (
              <ChatMarkdown text={m.content} />
            ) : (
              <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
            )}
          </div>
        ))}
        {loading && <ProgressIndicator />}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{ display: "flex", borderTop: "1px solid var(--line)", padding: "10px" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about a line, a vendor, or a scenario…"
          style={{
            flex: 1,
            border: "1px solid var(--line)",
            borderRadius: "4px",
            padding: "8px 10px",
            fontSize: "13px",
            fontFamily: "var(--font-body)",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            marginLeft: "8px",
            padding: "8px 14px",
            border: "none",
            borderRadius: "4px",
            background: "var(--accent)",
            color: "white",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
