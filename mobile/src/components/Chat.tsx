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
            <span className="chat__empty-glyph">✈</span>
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
                  ROUTE LOCKED — check the PLAN tab for the full breakdown
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
          <div className="msg msg--trace msg--thinking">
            <span className="dot-wave"><i /><i /><i /></span>
            {statusLine ?? "planning…"}
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
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M3 11.5L21 3l-8.5 18-2.2-7.3L3 11.5z" fill="currentColor" />
          </svg>
        </button>
      </form>
    </div>
  );
}
