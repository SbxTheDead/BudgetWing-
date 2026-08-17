import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import FlightCard from "./FlightCard";

const PRESETS = [
  "$850, Bangkok → Hanoi → Bali, Nov 10–22, ±3 days",
  "$600, Singapore, KL and Penang in March, 2 pax",
  "$1,400, Tokyo → Seoul → Taipei, 12 days in April",
];

interface ChatProps {
  messages: ChatMessage[];
  isThinking: boolean;
  statusLine: string | null;
  onSend: (text: string) => void;
}

export default function Chat({ messages, isThinking, statusLine, onSend }: ChatProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isThinking, statusLine]);

  const submit = (text: string) => {
    if (!text.trim() || isThinking) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="chat">
      <div className="chat__scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat__empty">
            <span className="chat__empty-glyph">
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                <path
                  d="M2 13l7 1 4 7 2-1-1-6 6-4c1.1-.7 1.4-2 .7-2.9-.6-.8-1.8-1-2.7-.4l-6 4-5-3-2 1 4 5z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <h2>Where to?</h2>
            <p>
              Tell me a budget and a few cities — I'll fly the globe looking
              for the cheapest way around.
            </p>
            <div className="chat__presets">
              {PRESETS.map((p) => (
                <button key={p} className="chip" onClick={() => submit(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          if (m.kind === "thinking") {
            return (
              <div key={m.id} className="msg msg--trace">
                <span className="msg__cursor" /> {m.content}
              </div>
            );
          }
          if (m.kind === "search") {
            return (
              <div key={m.id} className="msg msg--trace msg--search">
                <span className="msg__radar" /> {m.content}
              </div>
            );
          }
          if (m.kind === "error") {
            return (
              <div key={m.id} className="msg msg--agent msg--error">
                {m.content}
              </div>
            );
          }
          if (m.kind === "offers") {
            const best = m.offers?.[0];
            return (
              <div key={m.id} className="msg msg--agent msg--offers">
                <div className="msg__bubble">{m.content}</div>
                {best && <FlightCard offer={best} avgPrice={m.leg?.avgPrice} compact />}
                {m.leg?.altDate && typeof m.leg.altSavings === "number" && m.leg.altSavings > 0 && (
                  <div className="msg__alt-note">
                    shift to {m.leg.altDate} and save ${m.leg.altSavings}
                  </div>
                )}
              </div>
            );
          }
          if (m.kind === "summary") {
            return (
              <div key={m.id} className="msg msg--agent msg--summary">
                <div className="msg__bubble msg__bubble--mint">{m.content}</div>
                <div className="msg__summary-tag">
                  Route locked — see the Plan tab for the full breakdown
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`msg ${m.role === "user" ? "msg--user" : "msg--agent"}`}>
              <div className="msg__bubble">{m.content}</div>
            </div>
          );
        })}

        {isThinking && (
          <div className="msg msg--agent msg--thinking">
            <div className="msg__bubble">
              <span className="dot-wave"><i /><i /><i /></span>
              {statusLine ?? "Planning…"}
            </div>
          </div>
        )}
      </div>

      {messages.length > 0 && (
        <div className="chat__presets chat__presets--inline">
          {PRESETS.slice(0, 1).map((p) => (
            <button key={p} className="chip chip--ghost" onClick={() => submit(p)} disabled={isThinking}>
              {p}
            </button>
          ))}
        </div>
      )}

      <form
        className="chat__composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder='$800 · Bangkok, Hanoi, Bali · Nov 10–22'
          aria-label="Message the planner"
          enterKeyHint="send"
        />
        <button type="submit" className="chat__send" disabled={isThinking || !draft.trim()}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
        </button>
      </form>
    </div>
  );
}
