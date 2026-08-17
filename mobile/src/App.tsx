import { useEffect, useMemo, useState } from "react";
import Globe3D, { type GlobeArc } from "./components/Globe3D";
import Chat from "./components/Chat";
import BudgetBar from "./components/BudgetBar";
import Itinerary from "./components/Itinerary";
import Settings from "./components/Settings";
import { useAgent } from "./hooks/useAgent";
import { cityLabel } from "./lib/cities";
import { money } from "./lib/format";

type Tab = "globe" | "chat" | "plan" | "settings";

const TAB_ICONS: Record<Tab, string> = {
  globe:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.9 9h-3.4a15.7 15.7 0 0 0-1.2-5.3A8 8 0 0 1 19.9 11zM12 4c.9 1.2 1.9 3.4 2.4 7H9.6c.5-3.6 1.5-5.8 2.4-7zM8.7 5.7A15.7 15.7 0 0 0 7.5 11H4.1a8 8 0 0 1 4.6-5.3zM4.1 13h3.4c.1 2 .6 3.8 1.2 5.3A8 8 0 0 1 4.1 13zM12 20c-.9-1.2-1.9-3.4-2.4-7h4.8c-.5 3.6-1.5 5.8-2.4 7zm3.3-1.7c.6-1.5 1.1-3.3 1.2-5.3h3.4a8 8 0 0 1-4.6 5.3z",
  chat: "M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z",
  plan:
    "M7 3v4M17 3v4M5 9h14M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm3 8l2.2 2.2L15.5 11",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.9 6.7l-1.8.3a7 7 0 0 1-.6 1.5l1 1.6-1.8 1.8-1.6-1a7 7 0 0 1-1.5.6l-.3 1.8h-2.6l-.3-1.8a7 7 0 0 1-1.5-.6l-1.6 1-1.8-1.8 1-1.6a7 7 0 0 1-.6-1.5l-1.8-.3v-2.6l1.8-.3c.1-.5.3-1 .6-1.5l-1-1.6 1.8-1.8 1.6 1c.5-.3 1-.5 1.5-.6l.3-1.8h2.6l.3 1.8c.5.1 1 .3 1.5.6l1.6-1 1.8 1.8-1 1.6c.3.5.5 1 .6 1.5l1.8.3z",
};

const TAB_LABELS: Record<Tab, string> = {
  globe: "Globe",
  chat: "Chat",
  plan: "Plan",
  settings: "Settings",
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

  const planBadge = trip.route ? "●" : null;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M2 13l7 1 4 7 2-1-1-6 6-4c1.1-.7 1.4-2 .7-2.9-.6-.8-1.8-1-2.7-.4l-6 4-5-3-2 1 4 5z"
              fill="currentColor"
            />
          </svg>
          <span>
            BUDGET<b>WING</b>
          </span>
        </div>
        <div className="topbar__status">
          {agent.isThinking ? (
            <span className="topbar__live">
              <i /> SCANNING
            </span>
          ) : trip.route ? (
            <span className="topbar__locked">ROUTE LOCKED</span>
          ) : (
            <span className="topbar__idle">STANDBY</span>
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
                      {cityLabel(c).toUpperCase()}
                      {i < trip.order.length - 1 && <em>→</em>}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="globe-hud__empty">
                  SPIN THE GLOBE · PICK A ROUTE IN CHAT
                </div>
              )}

              {trip.activeLeg && (
                <div className="globe-hud__active">
                  PRICING {trip.activeLeg.origin} ✈ {trip.activeLeg.destination}
                </div>
              )}

              {trip.budget > 0 && (
                <BudgetBar budget={trip.budget} spent={agent.spent} currency={trip.currency} />
              )}

              {trip.route && (
                <div className="globe-hud__totals">
                  <span>TOTAL {money(trip.route.totalCost, trip.currency)}</span>
                  {trip.route.savings > 0 && (
                    <span className="globe-hud__save">
                      SAVED {money(trip.route.savings, trip.currency)}
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
                <span>◌</span>
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
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            className={`tabbar__item${tab === t ? " tabbar__item--active" : ""}`}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                d={TAB_ICONS[t]}
                fill={t === "plan" && planBadge ? "none" : "currentColor"}
                stroke="currentColor"
                strokeWidth={t === "plan" ? 1.6 : 0}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{TAB_LABELS[t]}</span>
            {t === "plan" && planBadge && <i className="tabbar__ping" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
