"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChatMarkdown } from "./ChatMarkdown";
import { ChatChart } from "./ChatChart";
import type { Artifact } from "@/lib/agent/tools";
import { ComparisonStore } from "@/lib/schema";
import { downloadXlsx } from "@/lib/downloads";

interface Msg {
  role: "user" | "assistant";
  content: string;
  isError?: boolean; // shown as plain text, and never sent back as history
  artifacts?: Artifact[];
}

// Shown one after another while the analyst works. Deliberately generic:
// they describe what the analyst typically does, not live tool-call status.
const PROGRESS_MESSAGES = [
  "Reading your question…",
  "Checking the comparison…",
  "Looking up vendor prices…",
  "Running the numbers…",
  "Checking flags and caveats…",
  "Cross-checking qualification results…",
  "Drafting the answer…",
];
const PROGRESS_INTERVAL_MS = 2200;

function suggestedQuestions(store: ComparisonStore): string[] {
  const qs = [
    "Which vendor is cheapest overall, and is that a fair comparison?",
    "What if we split it — cheapest per line, but only among vendors who cleared the questionnaire?",
    "Which lines need a human to look at before we award this?",
  ];
  if (store.normalized_lines.some((l) => l.alternate_basis)) qs.push("What's the real effective price after early-payment rebates?");
  qs.push("Chart each vendor's total and export the comparison to Excel.");
  return qs;
}

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

// Small, stable string hash (FNV-1a) for cache keys.
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the conversation still works for this session.
  }
}

/**
 * The analyst chat for one RFx. The comparison is sent with each question,
 * the conversation is kept per RFx, and an identical question over identical
 * data is answered from a local cache instead of a new API call.
 */
export function ChatPanel({ store }: { store: ComparisonStore }) {
  const historyKey = `rfx-copilot.chat.${store.rfx_id}`;
  const cacheKey = `rfx-copilot.chat-cache.${store.rfx_id}`;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Fingerprint of the data the answers depend on (prices, qualification, terms).
  const dataFingerprint = useMemo(
    () => hash(JSON.stringify([store.normalized_lines, store.questionnaire_verdicts, store.vendor_terms])),
    [store]
  );

  useEffect(() => {
    setMessages(readJson<Msg[]>(historyKey, []));
  }, [historyKey]);

  useEffect(() => {
    // Scroll only the message list, not the window.
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function commit(next: Msg[]) {
    setMessages(next);
    writeJson(historyKey, next);
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    // Error bubbles are UI only; the API expects real user/assistant turns.
    const history = next.filter((m) => !m.isError).map(({ role, content }) => ({ role, content }));
    commit(next);
    setInput("");

    const key = hash(dataFingerprint + JSON.stringify(history));
    const cache = readJson<Record<string, { reply: string; artifacts: Artifact[] }>>(cacheKey, {});
    if (cache[key]) {
      commit([...next, { role: "assistant", content: cache[key].reply, artifacts: cache[key].artifacts }]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store, history }),
      });
      const data = await res.json();
      if (data.ok) {
        commit([...next, { role: "assistant", content: data.reply, artifacts: data.artifacts ?? [] }]);
        writeJson(cacheKey, { ...cache, [key]: { reply: data.reply, artifacts: data.artifacts ?? [] } });
      } else {
        commit([...next, { role: "assistant", content: friendlyError(data.error), isError: true }]);
      }
    } catch {
      commit([...next, { role: "assistant", content: "Couldn't reach the analyst. Check your connection and try again.", isError: true }]);
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
        borderRadius: "8px",
        background: "var(--paper-raised)",
      }}
    >
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <h3 style={{ fontSize: "15px" }}>Ask the analyst</h3>
          <div style={{ fontSize: "11.5px", color: "var(--ink-dim)" }}>
            Answers, tables, charts and exports from this comparison. Every figure traces back to a vendor document.
          </div>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => commit([])} disabled={loading}>
            Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ fontSize: "12px", color: "var(--ink-dim)" }}>Try asking</div>
            {suggestedQuestions(store).map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  fontSize: "12.5px",
                  border: "1px solid var(--line)",
                  borderRadius: "6px",
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
              width: m.role === "assistant" ? "100%" : undefined,
            }}
          >
            <div
              style={{
                background: m.isError ? "var(--fail-dim)" : m.role === "user" ? "var(--accent-dim)" : "var(--paper)",
                color: m.isError ? "var(--fail)" : undefined,
                border: "1px solid var(--line)",
                borderRadius: "8px",
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
            {m.artifacts?.map((a, j) =>
              a.type === "chart" ? (
                <ChatChart key={j} chart={a} />
              ) : (
                <div key={j} className="card" style={{ marginTop: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.title}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      Excel · {a.sheets.reduce((n, s) => n + Math.max(0, s.rows.length - 1), 0)} rows
                    </div>
                  </div>
                  <button className="btn btn-sm" onClick={() => downloadXlsx(a.filename, a.sheets)}>
                    Download
                  </button>
                </div>
              )
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
        style={{ display: "flex", borderTop: "1px solid var(--line)", padding: "10px", gap: 8 }}
      >
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about prices, vendors, terms or award options…"
          aria-label="Ask the analyst"
        />
        <button type="submit" disabled={loading || !input.trim()} className="btn btn-primary">
          Send
        </button>
      </form>
    </div>
  );
}

function friendlyError(error: string | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  if (/credit balance/i.test(error)) return "The analyst is unavailable: the AI account is out of credits. Add credits in the Anthropic console and try again.";
  if (/api key|authentication/i.test(error)) return "The analyst is unavailable: the AI service isn't configured for this workspace.";
  return `Something went wrong: ${error}`;
}
