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
import {
  ArrowIcon,
  BoltIcon,
  CompassIcon,
  RefreshIcon,
  SendIcon,
} from "./icons";

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

/** Log-style row used for the agent's reasoning and search trace. */
function TraceRow({
  item,
  live,
}: {
  item: ChatItem;
  live: boolean;
}) {
  const isSearch = item.kind === "search";
  return (
    <div
      className={`anim-slide-up flex gap-2.5 border-l-2 py-1 pl-3 ${
        live
          ? "border-jet-bright"
          : isSearch
            ? "border-violet/45"
            : "border-white/10"
      }`}
    >
      <span
        className={`mt-[3px] font-data text-[9px] leading-none tracking-[0.1em] ${
          isSearch ? "text-violet" : "text-haze-dim"
        }`}
      >
        {isSearch ? "SRCH" : "THNK"}
      </span>
      <p
        className={`font-data flex-1 text-[10.5px] leading-relaxed tracking-[0.02em] ${
          live ? "text-chalk" : "text-haze"
        }`}
      >
        {item.content}
        {live && (
          <span className="dot-wave ml-2 inline-flex items-center gap-1 align-middle">
            <span />
            <span />
            <span />
          </span>
        )}
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
    <div className="panel grain flex h-full min-h-0 flex-col rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <h2 className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-haze">
          <CompassIcon size={13} className="text-violet" />
          Planning console
        </h2>
        <div className="flex items-center gap-3">
          {isThinking ? (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-jet-bright anim-blink" />
              <span className="font-data text-[9px] uppercase tracking-[0.18em] text-jet-bright">
                agent working
              </span>
            </span>
          ) : (
            <span className="font-data text-[9px] uppercase tracking-[0.18em] text-haze-dim">
              idle
            </span>
          )}
          {items.length > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="font-data text-[9px] uppercase tracking-[0.16em] text-haze-dim transition-colors hover:text-chalk"
            >
              clear
            </button>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {items.length === 0 && (
          <div className="anim-fade-in py-6">
            <p className="font-display text-[13px] font-semibold uppercase tracking-[0.2em] text-chalk">
              Tell me the money, not the route.
            </p>
            <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-haze">
              I permute city orders, slide departures inside your flex window and
              compare fare families across 140+ low-cost carriers — then hand
              back the itinerary that fits your envelope.
            </p>

            <div className="mt-5 space-y-2">
              <span className="font-data text-[9px] uppercase tracking-[0.2em] text-haze-dim">
                try one of these
              </span>
              {PRESETS.map((preset, i) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onSend(preset)}
                  className="anim-slide-up group flex w-full items-center gap-2.5 rounded-xl border border-white/8 bg-ink-850/60 px-3 py-2.5 text-left transition-all hover:border-jet/40 hover:bg-ink-700/50"
                  style={{ animationDelay: `${120 + i * 80}ms` }}
                >
                  <ArrowIcon
                    size={13}
                    className="shrink-0 text-jet-bright transition-transform group-hover:translate-x-0.5"
                  />
                  <span className="text-[11.5px] leading-snug text-haze group-hover:text-chalk">
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
              <div key={item.id} className="anim-slide-up flex justify-end">
                <p className="max-w-[86%] rounded-2xl rounded-br-sm border border-jet/35 bg-gradient-to-br from-jet/28 to-violet/18 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-chalk shadow-[0_10px_30px_-18px_rgba(59,130,246,0.9)]">
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
                className="anim-slide-up rounded-xl border border-coral/35 bg-coral/8 px-3.5 py-3"
              >
                <p className="text-[12px] leading-relaxed text-coral/95">
                  {item.content}
                </p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-coral/35 px-2.5 py-1 font-data text-[10px] uppercase tracking-[0.14em] text-coral transition-colors hover:bg-coral/15"
                >
                  <RefreshIcon size={11} />
                  retry
                </button>
              </div>
            );
          }

          if (item.kind === "offers") {
            const offers = item.offers ?? [];
            return (
              <div key={item.id} className="anim-slide-up space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-chalk">
                    {item.leg?.origin}
                    <span className="px-1.5 text-haze-dim">→</span>
                    {item.leg?.destination}
                  </p>
                  <span className="font-data text-[9px] uppercase tracking-[0.14em] text-haze-dim">
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
                      className="anim-slide-up"
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
                  <p className="flex items-center gap-1.5 pl-0.5 font-data text-[10px] tracking-[0.04em] text-mint">
                    <BoltIcon size={11} />
                    date shift to {stampDate(item.leg.altDate ?? "")} saves{" "}
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
                className="anim-slide-up rounded-2xl rounded-bl-sm border border-mint/30 bg-gradient-to-br from-mint/12 to-jet/8 px-3.5 py-3"
              >
                <p className="flex items-center gap-2 font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-mint">
                  <BoltIcon size={12} />
                  plan locked
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-chalk/90">
                  {item.content}
                </p>
                {item.route && (
                  <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-data text-[10px] uppercase tracking-[0.12em] text-haze">
                    <span className="text-chalk">
                      {money(item.route.totalCost, currency)} total
                    </span>
                    {item.route.savings > 0 && (
                      <span className="text-mint">
                        −{money(item.route.savings, currency)} vs market
                      </span>
                    )}
                    <span>{item.route.legs.length} flights</span>
                    <span className="text-haze-dim">
                      full breakdown in the itinerary panel
                    </span>
                  </p>
                )}
              </div>
            );
          }

          return (
            <p
              key={item.id}
              className="anim-slide-up max-w-[92%] rounded-2xl rounded-bl-sm border border-white/8 bg-ink-850/70 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-haze"
            >
              {item.content}
            </p>
          );
        })}

        {/* live thinking pill — shown when the stream is quiet between frames */}
        {isThinking && (
          <div className="anim-fade-in flex items-center gap-2.5 rounded-xl border border-jet/30 bg-jet/6 px-3 py-2.5 anim-pulse-glow">
            <span className="dot-wave inline-flex items-center gap-1">
              <span />
              <span />
              <span />
            </span>
            <span className="font-data text-[10px] uppercase tracking-[0.14em] text-jet-bright">
              {statusLine ? "reasoning" : "connecting to planner"}
            </span>
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="border-t border-white/8 px-3 py-3"
      >
        <div
          className={`flex items-end gap-2 rounded-xl border bg-ink-950/70 p-2 transition-colors ${
            isThinking ? "border-jet/40" : "border-white/10 focus-within:border-jet/50"
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
            className="no-resize scroll-thin max-h-[150px] min-h-[38px] flex-1 bg-transparent px-2 py-2 text-[12.5px] leading-relaxed text-chalk outline-none placeholder:text-haze-dim/70 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isThinking || draft.trim().length === 0}
            className="group grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-jet to-violet text-white shadow-[0_10px_26px_-12px_rgba(59,130,246,0.9)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:from-ink-600 disabled:to-ink-600 disabled:text-haze-dim disabled:shadow-none"
            aria-label="Send"
          >
            <SendIcon
              size={16}
              className="transition-transform group-enabled:group-hover:translate-x-0.5"
            />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between px-1">
          <span className="font-data text-[9px] uppercase tracking-[0.14em] text-haze-dim">
            budget · cities · dates · flex — enter to send
          </span>
          {error && !isThinking && (
            <button
              type="button"
              onClick={onRetry}
              className="font-data text-[9px] uppercase tracking-[0.14em] text-coral"
            >
              connection issue · retry
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
