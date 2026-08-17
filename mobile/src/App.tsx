import { useEffect, useMemo, useState, type ReactNode } from "react";
import Globe3D, { type GlobeArc } from "./components/Globe3D";
import Chat from "./components/Chat";
import BudgetBar from "./components/BudgetBar";
import Itinerary from "./components/Itinerary";
import Settings from "./components/Settings";
import { useAgent } from "./hooks/useAgent";
import { cityLabel } from "./lib/cities";
import { money } from "./lib/format";

type Tab = "globe" | "chat" | "plan" | "settings";

const TAB_ORDER: Tab[] = ["globe", "chat", "plan", "settings"];

const TAB_LABELS: Record<Tab, string> = {
  globe: "Globe",
  chat: "Chat",
  plan: "Plan",
  settings: "Settings",
};

/* Quiet Lucide-style line icons. */
const TAB_ICONS: Record<Tab, ReactNode> = {
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </>
  ),
  chat: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
  plan: (
    <>
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </>
  ),
  settings: (
    <>
      <line x1="21" x2="14" y1="4" y2="4" />
      <line x1="10" x2="3" y1="4" y2="4" />
      <line x1="21" x2="12" y1="12" y2="12" />
      <line x1="8" x2="3" y1="12" y2="12" />
      <line x1="21" x2="16" y1="20" y2="20" />
      <line x1="12" x2="3" y1="20" y2="20" />
      <line x1="14" x2="14" y1="2" y2="6" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <line x1="16" x2="16" y1="18" y2="22" />
    </>
  ),
};

export default function App() {
  const agent = useAgent();
  const [tab, setTab] = useState<Tab>("chat");
  const { trip } = agent;

  // The globe is the show — jump to it the moment a trip takes shape.
  useEffect(() => {
    if (trip.cities.length >= 2) setTab("globe");
  }, [trip.cities.length]);

  // Arcs for the globe: locked route wins, otherwise legs searched so far.
  const arcs = useMemo<GlobeArc[]>(() => {
    if (trip.route) {
      const prices = trip.route.legs.map((l) => l.offer.totalPrice);
      const min = Math.min(...prices);
      return trip.route.legs.map((leg) => ({
        origin: leg.origin,
        destination: leg.destination,
        state: "locked" as const,
        cheapest: leg.offer.totalPrice === min && trip.route!.legs.length > 1,
      }));
    }
    return trip.legs.map((leg) => ({
      origin: leg.origin,
      destination: leg.destination,
      state: leg.status === "searching" ? ("searching" as const) : ("quoted" as const),
    }));
  }, [trip.route, trip.legs]);

  const tabIndex = TAB_ORDER.indexOf(tab);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
            <path
              d="M2 13l7 1 4 7 2-1-1-6 6-4c1.1-.7 1.4-2 .7-2.9-.6-.8-1.8-1-2.7-.4l-6 4-5-3-2 1 4 5z"
              fill="currentColor"
            />
          </svg>
          <span>BudgetWing</span>
        </div>
        <div className="topbar__status">
          {agent.isThinking ? (
            <span className="topbar__live">
              <i /> Searching
            </span>
          ) : trip.route ? (
            <span className="topbar__locked">Route locked</span>
          ) : (
            <span className="topbar__idle">Standby</span>
          )}
        </div>
      </header>

      <main className="stage">
        {tab === "globe" && (
          <div className="globe-screen">
            <Globe3D cityCodes={trip.order} arcs={arcs} activeLeg={trip.activeLeg} />

            <div className="globe-hud">
              {trip.order.length > 0 ? (
                <div className="globe-hud__route">
                  {trip.order.map((c, i) => (
                    <span key={`${c}-${i}`}>
                      {cityLabel(c)}
                      {i < trip.order.length - 1 && <em>→</em>}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="globe-hud__empty">
                  Spin the globe · pick a route in Chat
                </div>
              )}

              {trip.activeLeg && (
                <div className="globe-hud__active">
                  <i />
                  Pricing {trip.activeLeg.origin} → {trip.activeLeg.destination}
                </div>
              )}

              {trip.budget > 0 && (
                <BudgetBar budget={trip.budget} spent={agent.spent} currency={trip.currency} />
              )}

              {trip.route && (
                <div className="globe-hud__totals">
                  <span>
                    Total <strong>{money(trip.route.totalCost, trip.currency)}</strong>
                  </span>
                  {trip.route.savings > 0 && (
                    <span className="globe-hud__save">
                      Saved {money(trip.route.savings, trip.currency)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "chat" && (
          <Chat
            messages={agent.messages}
            isThinking={agent.isThinking}
            statusLine={agent.statusLine}
            onSend={agent.sendMessage}
          />
        )}

        {tab === "plan" && (
          <div className="plan-screen">
            {trip.route ? (
              <>
                <BudgetBar budget={trip.budget} spent={agent.spent} currency={trip.currency} />
                <Itinerary
                  route={trip.route}
                  budget={trip.budget}
                  currency={trip.currency}
                  baselineCost={trip.baselineCost}
                />
              </>
            ) : (
              <div className="plan-screen__empty">
                <span className="plan-screen__glyph">
                  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="6" cy="19" r="3" />
                    <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
                    <circle cx="18" cy="5" r="3" />
                  </svg>
                </span>
                <p>No flight plan yet.</p>
                <button className="btn btn--solid" onClick={() => setTab("chat")}>
                  Start planning
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "settings" && <Settings />}
      </main>

      <nav className="tabbar" aria-label="Primary">
        <span
          className="tabbar__thumb"
          aria-hidden="true"
          style={{ transform: `translateX(${tabIndex * 100}%)` }}
        />
        {TAB_ORDER.map((t) => (
          <button
            key={t}
            className={`tabbar__item${tab === t ? " tabbar__item--active" : ""}`}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {TAB_ICONS[t]}
            </svg>
            <span>{TAB_LABELS[t]}</span>
            {t === "plan" && trip.route && <i className="tabbar__ping" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
