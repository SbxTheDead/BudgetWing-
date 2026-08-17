import type { OptimizedRoute } from "../types";
import { cityLabel } from "../lib/cities";
import { clockTime, duration, money, shortDate, stampDate } from "../lib/format";

interface ItineraryProps {
  route: OptimizedRoute;
  budget: number;
  currency?: string;
  /** Market baseline the optimizer beat, if the backend reported it. */
  baselineCost?: number;
}

export default function Itinerary({ route, budget, currency = "USD", baselineCost }: ItineraryProps) {
  const prices = route.legs.map((l) => l.offer.totalPrice);
  const minPrice = Math.min(...prices);
  const savings = route.savings || (baselineCost ? baselineCost - route.totalCost : 0);
  const withinBudget = route.totalCost <= budget;

  return (
    <section className="itin">
      <header className="itin__head">
        <div>
          <span className="itin__kicker">FLIGHT PLAN</span>
          <h2 className="itin__title">
            {route.legs.length} leg{route.legs.length > 1 ? "s" : ""} ·{" "}
            {route.legs.map((l) => cityLabel(l.origin)).join(" → ")} →{" "}
            {cityLabel(route.legs[route.legs.length - 1]?.destination ?? "")}
          </h2>
        </div>
        {savings > 0 && (
          <span className="itin__savings-badge">
            SAVE {money(savings, currency)}
          </span>
        )}
      </header>

      <ol className="itin__timeline">
        {route.legs.map((leg, i) => {
          const seg = leg.offer.fromSegments[0];
          const lastSeg = leg.offer.fromSegments[leg.offer.fromSegments.length - 1];
          const stops = leg.offer.fromSegments.length - 1;
          const cheapest = leg.offer.totalPrice === minPrice && prices.length > 1;

          return (
            <li className="itin__leg" key={`${leg.origin}-${leg.destination}-${i}`} style={{ animationDelay: `${i * 90}ms` }}>
              <div className="itin__rail" aria-hidden="true">
                <span className={`itin__node${cheapest ? " itin__node--mint" : ""}`} />
                {i < route.legs.length - 1 && <span className="itin__stem" />}
              </div>

              <div className="itin__card">
                <div className="itin__leg-head">
                  <span className="itin__date">{stampDate(leg.date)}</span>
                  <span className="itin__route">
                    <b>{leg.origin}</b>
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <path d="M2 13l7 1 4 7 2-1-1-6 6-4c1.1-.7 1.4-2 .7-2.9-.6-.8-1.8-1-2.7-.4l-6 4-5-3-2 1 4 5z" fill="currentColor" />
                    </svg>
                    <b>{leg.destination}</b>
                  </span>
                  <span className={`itin__leg-price${cheapest ? " itin__leg-price--mint" : ""}`}>
                    {money(leg.offer.totalPrice, leg.offer.currency || currency)}
                  </span>
                </div>

                <div className="itin__leg-meta">
                  {seg && lastSeg && (
                    <span>
                      {clockTime(seg.depTime)}–{clockTime(lastSeg.arrTime)}
                    </span>
                  )}
                  <span>
                    {duration(leg.offer.fromSegments.reduce((s, x) => s + (x.duration || 0), 0))}
                  </span>
                  <span>{stops === 0 ? "direct" : `${stops} stop${stops > 1 ? "s" : ""}`}</span>
                  {seg && <span className="itin__carrier">{seg.carrier}</span>}
                </div>

                {leg.alternativeDate && typeof leg.savings === "number" && leg.savings > 0 && (
                  <div className="itin__alt">
                    fly {shortDate(leg.alternativeDate)} → save {money(leg.savings, currency)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <footer className="itin__footer">
        <div className="itin__total">
          <span>TOTAL</span>
          <strong className={withinBudget ? "" : "itin__total--over"}>
            {money(route.totalCost, currency)}
          </strong>
          <span className={`itin__verdict${withinBudget ? "" : " itin__verdict--bad"}`}>
            {withinBudget
              ? `${money(budget - route.totalCost, currency)} under budget`
              : `${money(route.totalCost - budget, currency)} over budget`}
          </span>
        </div>
        {route.alternativesConsidered > 0 && (
          <div className="itin__alts-note">
            {route.alternativesConsidered} routings compared
          </div>
        )}
      </footer>
    </section>
  );
}
