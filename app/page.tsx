"use client";

import dynamic from "next/dynamic";
import BudgetBar from "./components/BudgetBar";
import Chat from "./components/Chat";
import Itinerary from "./components/Itinerary";
import { useAgent } from "./hooks/useAgent";

/**
 * react-leaflet touches `window` at module scope, so the map has to stay off
 * the server render entirely. Show a calm skeleton while it hydrates.
 */
const TripMap = dynamic(() => import("./components/TripMap"), {
  ssr: false,
  loading: () => (
    <div className="relative grid h-full w-full place-items-center overflow-hidden">
      {/* skeleton that mimics the finished map: drifting arcs + pins */}
      <svg
        viewBox="0 0 640 320"
        className="w-full max-w-[480px] px-10"
        aria-hidden
      >
        <path d="M80 232 Q 210 88 340 208" className="skeleton-arc" strokeWidth="1.6" />
        <path d="M340 208 Q 440 128 560 176" className="skeleton-arc" strokeWidth="1.6" />
        {[{ x: 80, y: 232 }, { x: 340, y: 208 }, { x: 560, y: 176 }].map((p) => (
          <circle
            key={`${p.x}-${p.y}`}
            cx={p.x}
            cy={p.y}
            r="5"
            fill="none"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="1.2"
          />
        ))}
      </svg>
      <span className="absolute bottom-5 text-[11px] tracking-wide text-white/35">
        Loading map…
      </span>
    </div>
  ),
});

function WingMark() {
  return (
    <span className="glass-soft grid h-9 w-9 place-items-center rounded-[12px]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 16.5 21 5l-4.5 9.5-4.8.9L9 20.5l-1.9-4.6L3 16.5Z"
          stroke="rgba(255,255,255,0.92)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
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
    <div className="relative z-10 flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      {/* ---------- masthead ---------- */}
      <header className="shrink-0">
        <div className="flex items-center justify-between px-6 pb-1 pt-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <WingMark />
            <div className="leading-tight">
              <h1 className="text-[17px] font-semibold tracking-tight text-white">
                BudgetWing
              </h1>
              <p className="text-[11px] text-white/40">
                Agentic budget flight optimizer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isThinking ? "bg-white anim-pulse" : "bg-mint"
              }`}
              aria-hidden
            />
            <span className="text-[11px] text-white/40">
              {isThinking ? "Searching fares" : "Ready"}
            </span>
          </div>
        </div>
      </header>

      {/* ---------- console — full-bleed, columns fill the viewport ---------- */}
      <main className="grid min-h-0 w-full flex-1 gap-5 p-5 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:overflow-hidden lg:px-8 lg:pb-7 lg:pt-5 xl:gap-7 xl:px-10">
        {/* chat — primary surface */}
        <section className="h-[76vh] min-h-0 lg:h-full">
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

        {/* map + budget + itinerary */}
        <section className="scroll-thin flex min-h-0 flex-col gap-5 lg:overflow-y-auto lg:pr-1.5">
          <div className="glass card-lift relative h-[340px] shrink-0 overflow-hidden rounded-[26px] sm:h-[400px] lg:h-[48vh] lg:min-h-[400px]">
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
            <div className="anim-rise">
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
