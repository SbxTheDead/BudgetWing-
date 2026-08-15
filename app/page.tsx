"use client";

import dynamic from "next/dynamic";
import BudgetBar from "./components/BudgetBar";
import Chat from "./components/Chat";
import Itinerary from "./components/Itinerary";
import { LayersIcon } from "./components/icons";
import { useAgent } from "./hooks/useAgent";

/**
 * react-leaflet touches `window` at module scope, so the map has to stay off
 * the server render entirely.
 */
const TripMap = dynamic(() => import("./components/TripMap"), {
  ssr: false,
  loading: () => (
    <div className="hud-grid grid h-full w-full place-items-center bg-ink-950">
      <span className="font-data text-[10px] uppercase tracking-[0.24em] text-haze-dim anim-blink">
        booting map tiles…
      </span>
    </div>
  ),
});

function WingMark() {
  return (
    <span className="relative grid h-10 w-10 place-items-center rounded-xl border border-jet/30 bg-gradient-to-br from-jet/25 via-violet/20 to-transparent">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <defs>
          <linearGradient id="wing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#d9d9d9" />
            <stop offset="100%" stopColor="#8a8a8a" />
          </linearGradient>
        </defs>
        <path
          d="M2.5 15.5 21 4.5l-5 9.5-4.5.8L9 20l-2-4.8-4.5.3Z"
          fill="url(#wing)"
        />
        <path
          d="M11.5 14.8 21 4.5"
          stroke="#000000"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>
      <span className="absolute -inset-px rounded-xl border border-white/5" />
    </span>
  );
}

export default function Home() {
  const {
    items,
    trip,
    spent,
    isThinking,
    statusLine,
    error,
    sendMessage,
    retry,
    reset,
  } = useAgent();

  return (
    <div className="flex flex-1 flex-col lg:h-screen lg:overflow-hidden">
      {/* ---------- masthead ---------- */}
      <header className="hud-grid relative shrink-0 border-b border-white/8">
        <div className="rail-sheen absolute inset-x-0 top-0 h-px" />
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <WingMark />
            <div>
              <h1 className="font-display text-[19px] font-bold leading-none tracking-[0.02em]">
                <span className="text-chalk">Budget</span>
                <span className="text-gradient">Wing</span>
              </h1>
              <p className="font-data pt-1 text-[9px] uppercase tracking-[0.2em] text-haze-dim">
                agentic budget flight optimizer
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/8 bg-ink-850/70 px-2.5 py-1">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isThinking ? "bg-jet-bright anim-blink" : "bg-mint"
                }`}
              />
              <span className="font-data text-[9px] uppercase tracking-[0.16em] text-haze">
                {isThinking ? "searching fares" : "agent ready"}
              </span>
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-white/8 bg-ink-850/70 px-2.5 py-1 sm:inline-flex">
              <LayersIcon size={11} className="text-violet" />
              <span className="font-data text-[9px] uppercase tracking-[0.16em] text-haze">
                atlas api · sandbox
              </span>
            </span>
            <span className="hidden font-data text-[9px] uppercase tracking-[0.16em] text-haze-dim md:inline">
              model studio · qoder
            </span>
          </div>
        </div>
      </header>

      {/* ---------- console ---------- */}
      <main className="grid min-h-0 flex-1 gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* chat — 60% */}
        <section className="h-[74vh] min-h-0 lg:h-full">
          <Chat
            items={items}
            isThinking={isThinking}
            statusLine={statusLine}
            error={error}
            passengers={trip.passengers}
            currency={trip.currency}
            onSend={sendMessage}
            onRetry={retry}
            onReset={reset}
          />
        </section>

        {/* map + budget + itinerary — 40% */}
        <section className="scroll-thin flex min-h-0 flex-col gap-3 sm:gap-4 lg:overflow-y-auto lg:pr-1">
          <div className="panel relative h-[340px] shrink-0 overflow-hidden rounded-2xl sm:h-[400px] lg:h-[46vh]">
            <TripMap
              cities={trip.order}
              legs={trip.legs}
              activeLeg={trip.activeLeg}
              statusLine={statusLine}
              currency={trip.currency}
            />
          </div>

          <BudgetBar
            budget={trip.budget}
            spent={spent}
            currency={trip.currency}
            legs={trip.legs}
            passengers={trip.passengers}
            savings={trip.route?.savings ?? 0}
            live={isThinking}
          />

          {trip.route && (
            <div className="anim-slide-up">
              <Itinerary
                route={trip.route}
                budget={trip.budget}
                currency={trip.currency}
                passengers={trip.passengers}
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
