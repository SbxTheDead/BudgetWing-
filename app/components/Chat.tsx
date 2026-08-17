"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ChatItem } from "@/app/hooks/useAgent";
import { money, stampDate } from "@/app/lib/format";
import FlightCard from "./FlightCard";
import { ArrowIcon, BoltIcon, RefreshIcon, SendIcon } from "./icons";

interface ChatProps {
  items: ChatItem[];
  isThinking: boolean;
  statusLine: string | null;
  error: string | null;
  passengers: number;
  currency?: string;
  onSend: (text: string) => void;
  onRetry: () => void;
  onReset: () => void;
}

const PRESETS = [
  "I have $850 budget, want to visit Bangkok, Hanoi and Bali, dates Nov 10-22, ±3 days",
  "$1,200 budget, Lisbon, Barcelona, Rome, Mar 5-19, 2 passengers",
  "Budget $600, Kuala Lumpur, Phuket, Singapore, in November, flexible 3 days",
];

/** Quiet row for the agent's reasoning and search trace. */
function TraceRow({ item, live }: { item: ChatItem; live: boolean }) {
  const isSearch = item.kind === "search";
  return (
    <div className="anim-rise flex items-start gap-2.5 pl-1">
      <span
        className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${
          live ? "bg-white anim-pulse" : "bg-white/25"
        }`}
        aria-hidden
      />
      <p
        className={`flex-1 text-[12px] leading-relaxed ${
          live ? "text-white/70" : "text-white/40"
        }`}
      >
        <span className="mr-1.5 text-[10px] uppercase tracking-wider text-white/30">
          {isSearch ? "Search" : "Thinking"}
        </span>
        {item.content}
      </p>
    </div>
  );
}

export default function Chat({
  items,
  isThinking,
  statusLine,
  error,
  passengers,
  currency = "USD",
  onSend,
  onRetry,
  onReset,
}: ChatProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize the composer up to ~6 lines.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(150, el.scrollHeight)}px`;
  }, [draft]);

  // Follow the transcript as it grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items.length, isThinking, statusLine]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || isThinking) return;
    onSend(text);
    setDraft("");
  }, [draft, isThinking, onSend]);

  const lastTraceId = [...items]
    .reverse()
    .find((i) => i.kind === "thinking" || i.kind === "search")?.id;

  return (
    <div className="glass flex h-full min-h-0 flex-col rounded-[24px]">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5">
        <h2 className="text-[13px] font-medium text-white/85">Planning</h2>
        <div className="flex items-center gap-3">
          {isThinking ? (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-white anim-pulse" />
              <span className="text-[11px] text-white/60">Working…</span>
            </span>
          ) : (
            <span className="text-[11px] text-white/35">Idle</span>
          )}
          {items.length > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="link-quiet text-[11px]"
            >
              Clear
            </button>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="scroll-thin flex-1 space-y-4 overflow-y-auto px-5 py-5"
      >
        {items.length === 0 && (
          <div className="anim-fade-in py-8">
            <p className="text-[22px] font-semibold leading-tight tracking-tight text-white">
              Tell me the money,
              <br />
              not the route.
            </p>
            <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-white/55">
              I permute city orders, slide departures inside your flex window
              and compare fare families across 140+ low-cost carriers — then
              hand back the itinerary that fits your envelope.
            </p>

            <div className="mt-8 space-y-2.5">
              <span className="eyebrow">Try one of these</span>
              {PRESETS.map((preset, i) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onSend(preset)}
                  className="anim-rise glass-soft group flex w-full items-center gap-3 rounded-[16px] px-4 py-3 text-left transition-colors hover:bg-white/10"
                  style={{ animationDelay: `${120 + i * 80}ms` }}
                >
                  <ArrowIcon
                    size={14}
                    className="shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5 group-hover:text-white"
                  />
                  <span className="text-[12.5px] leading-snug text-white/65 group-hover:text-white">
                    {preset}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {items.map((item) => {
          if (item.role === "user") {
            return (
              <div key={item.id} className="anim-rise flex justify-end">
                <p className="max-w-[84%] rounded-[18px] rounded-br-[6px] bg-white px-4 py-2.5 text-[13px] leading-relaxed text-neutral-900 shadow-[0_6px_20px_rgba(0,0,0,0.35)]">
                  {item.content}
                </p>
              </div>
            );
          }

          if (item.kind === "thinking" || item.kind === "search") {
            return (
              <TraceRow
                key={item.id}
                item={item}
                live={isThinking && item.id === lastTraceId}
              />
            );
          }

          if (item.kind === "error") {
            return (
              <div
                key={item.id}
                className="anim-rise rounded-[16px] border border-coral/25 bg-coral/10 px-4 py-3"
              >
                <p className="text-[12.5px] leading-relaxed text-coral/95">
                  {item.content}
                </p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-[10px] border border-coral/30 px-3 py-1.5 text-[11px] text-coral transition-colors hover:bg-coral/15"
                >
                  <RefreshIcon size={11} />
                  Retry
                </button>
              </div>
            );
          }

          if (item.kind === "offers") {
            const offers = item.offers ?? [];
            return (
              <div key={item.id} className="anim-rise space-y-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-medium text-white">
                    {item.leg?.origin}
                    <span className="px-1.5 text-white/35">→</span>
                    {item.leg?.destination}
                  </p>
                  <span className="num text-[11px] text-white/35">
                    {item.leg?.date ? stampDate(item.leg.date) : ""}
                    {item.leg?.avgPrice
                      ? ` · avg ${money(item.leg.avgPrice, currency)}`
                      : ""}
                  </span>
                </div>

                <div className="space-y-2">
                  {offers.slice(0, 3).map((offer, i) => (
                    <div
                      key={offer.routingIdentifier}
                      className="anim-rise"
                      style={{ animationDelay: `${i * 90}ms` }}
                    >
                      <FlightCard
                        offer={offer}
                        cheapest={i === 0}
                        avgPrice={item.leg?.avgPrice}
                        passengers={passengers}
                      />
                    </div>
                  ))}
                </div>

                {item.leg?.altSavings ? (
                  <p className="flex items-center gap-1.5 pl-0.5 text-[11.5px] text-mint">
                    <BoltIcon size={12} />
                    Date shift to {stampDate(item.leg.altDate ?? "")} saves{" "}
                    {money(item.leg.altSavings, currency)}
                  </p>
                ) : null}
              </div>
            );
          }

          if (item.kind === "summary") {
            return (
              <div
                key={item.id}
                className="anim-rise rounded-[18px] rounded-bl-[6px] border border-mint/25 bg-mint/10 px-4 py-3.5"
              >
                <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-mint">
                  <BoltIcon size={12} />
                  Plan locked
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-white/85">
                  {item.content}
                </p>
                {item.route && (
                  <p className="num mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/55">
                    <span className="text-white">
                      {money(item.route.totalCost, currency)} total
                    </span>
                    {item.route.savings > 0 && (
                      <span className="text-mint">
                        −{money(item.route.savings, currency)} vs market
                      </span>
                    )}
                    <span>{item.route.legs.length} flights</span>
                    <span className="text-white/35">
                      full breakdown in the itinerary panel
                    </span>
                  </p>
                )}
              </div>
            );
          }

          return (
            <div key={item.id} className="anim-rise flex justify-start">
              <p className="glass-soft max-w-[84%] rounded-[18px] rounded-bl-[6px] px-4 py-2.5 text-[13px] leading-relaxed text-white/75">
                {item.content}
              </p>
            </div>
          );
        })}

        {/* live thinking pill — calm shimmer while the stream is quiet */}
        {isThinking && (
          <div className="anim-fade-in">
            <div className="thinking-pill inline-flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-white/5 px-4 py-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-white/70 anim-pulse" />
              <span className="text-[11.5px] text-white/60">
                {statusLine ? "Reasoning…" : "Connecting to planner…"}
              </span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="border-t border-white/8 px-4 py-4"
      >
        <div
          className={`glass-soft flex items-end gap-2 rounded-[18px] p-2 transition-colors ${
            isThinking ? "border-white/20" : "focus-within:border-white/25"
          }`}
        >
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            disabled={isThinking}
            placeholder="I have $850, want to visit Bangkok, Hanoi and Bali, Nov 10-22, ±3 days"
            aria-label="Describe your trip"
            className="no-resize scroll-thin max-h-[150px] min-h-[38px] flex-1 bg-transparent px-2.5 py-2 text-[13px] leading-relaxed text-white outline-none placeholder:text-white/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isThinking || draft.trim().length === 0}
            className="btn btn-primary h-10 w-10 shrink-0 !rounded-[14px]"
            aria-label="Send"
          >
            <SendIcon size={16} />
          </button>
        </div>

        <div className="mt-2.5 flex items-center justify-between px-1.5">
          <span className="text-[10.5px] text-white/30">
            Budget · cities · dates · flex — Enter to send
          </span>
          {error && !isThinking && (
            <button
              type="button"
              onClick={onRetry}
              className="text-[10.5px] text-coral"
            >
              Connection issue · Retry
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
