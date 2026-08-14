"use client";

import type { OptimizedRoute } from "@shared/types";
import { carrierName } from "@/app/lib/carriers";
import { getCity } from "@/app/lib/cities";
import {
  clockTime,
  costTier,
  duration,
  money,
  nightsBetween,
  shortDate,
  TIER_HEX,
} from "@/app/lib/format";
import { BagIcon, BoltIcon, PlaneIcon } from "./icons";

interface ItineraryProps {
  route: OptimizedRoute;
  budget: number;
  currency?: string;
  passengers?: number;
}

export default function Itinerary({
  route,
  budget,
  currency = "USD",
  passengers = 1,
}: ItineraryProps) {
  const legs = route.legs;
  if (legs.length === 0) return null;

  const prices = legs.map((l) => l.offer.totalPrice);
  const stops = [legs[0].origin, ...legs.map((l) => l.destination)];
  const underBudget = route.totalCost <= budget;

  return (
    <section className="panel grain overflow-hidden rounded-2xl">
      <header className="rail-sheen flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-haze">
          Locked itinerary
        </h2>
        <span className="font-data text-[10px] uppercase tracking-[0.14em] text-haze-dim">
          {legs.length} flights · {route.alternativesConsidered} routes tested
        </span>
      </header>

      <ol className="px-4 py-4">
        {stops.map((code, i) => {
          const city = getCity(code);
          const leg = legs[i];
          const arrivalLeg = i > 0 ? legs[i - 1] : null;
          const nights =
            arrivalLeg && leg ? nightsBetween(arrivalLeg.date, leg.date) : 0;
          const tier = leg ? costTier(leg.offer.totalPrice, prices) : "cheap";
          const segment = leg?.offer.fromSegments[0];
          const lastSegment =
            leg?.offer.fromSegments[leg.offer.fromSegments.length - 1];
          const bag = leg?.offer.baggageElements[0];
          const isReturnHome = i === stops.length - 1;

          return (
            <li
              key={`${code}-${i}`}
              className="anim-slide-up relative pl-7"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {/* node */}
              <span
                className="absolute left-0 top-1.5 grid h-3.5 w-3.5 place-items-center rounded-full border"
                style={{
                  borderColor: isReturnHome ? "#8b5cf6" : "#60a5fa",
                  background: "#05080f",
                  boxShadow: `0 0 10px ${isReturnHome ? "#8b5cf6" : "#60a5fa"}66`,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: isReturnHome ? "#8b5cf6" : "#60a5fa" }}
                />
              </span>

              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-[15px] font-semibold tracking-[0.06em] text-chalk">
                    {code}
                  </span>
                  <span className="text-[12px] text-haze">
                    {city?.city ?? code}
                    {city ? `, ${city.country}` : ""}
                  </span>
                </p>
                <p className="font-data text-[10px] uppercase tracking-[0.12em] text-haze-dim">
                  {arrivalLeg ? shortDate(arrivalLeg.date) : shortDate(legs[0].date)}
                  {nights > 0 ? ` · ${nights} night${nights > 1 ? "s" : ""}` : ""}
                  {isReturnHome ? " · trip ends" : ""}
                </p>
              </div>

              {/* connector + flight detail */}
              {leg && (
                <div className="relative mb-4 mt-2">
                  <span
                    aria-hidden
                    className="spine absolute -left-[22px] top-0 h-full w-px"
                  />
                  <span
                    aria-hidden
                    className="absolute -left-[27px] top-1/2 -translate-y-1/2 rounded bg-ink-900 py-1 text-jet-bright"
                  >
                    <PlaneIcon size={11} className="rotate-90" />
                  </span>

                  <div className="rounded-lg border border-white/8 bg-ink-850/60 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded border border-white/10 bg-white/6 font-display text-[9px] font-bold tracking-wider text-chalk">
                          {segment?.carrier}
                        </span>
                        <span className="font-data text-[11px] tracking-[0.06em] text-chalk">
                          {clockTime(segment?.depTime ?? "")}
                          <span className="px-1 text-haze-dim">→</span>
                          {clockTime(lastSegment?.arrTime ?? "")}
                        </span>
                        <span className="font-data text-[10px] text-haze-dim">
                          {duration(
                            leg.offer.fromSegments.reduce(
                              (sum, s) => sum + s.duration,
                              0,
                            ),
                          )}
                        </span>
                      </span>

                      <span
                        className="font-data text-[13px]"
                        style={{ color: TIER_HEX[tier] }}
                      >
                        {money(leg.offer.totalPrice * passengers, currency)}
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-data text-[9px] uppercase tracking-[0.12em] text-haze-dim">
                      <span>
                        {carrierName(segment?.carrier ?? "")} ·{" "}
                        {segment?.flightNumber}
                      </span>
                      <span>
                        {segment?.stopCities?.length
                          ? `via ${segment.stopCities.join(", ")}`
                          : "nonstop"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <BagIcon size={10} />
                        {(bag?.baggagePiece ?? 0) > 0
                          ? `${bag?.baggageWeight}kg`
                          : "cabin only"}
                      </span>
                      {leg.savings ? (
                        <span className="inline-flex items-center gap-1 text-mint">
                          <BoltIcon size={10} />
                          shifted from {shortDate(leg.alternativeDate ?? "")} ·
                          saves {money(leg.savings, currency)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* reasoning */}
      <p className="mx-4 mb-4 border-l-2 border-violet/50 bg-violet/6 px-3 py-2 text-[11px] leading-relaxed text-haze">
        {route.reasoning}
      </p>

      {/* total — boarding-pass stub */}
      <div className="ticket-edge border-t border-dashed border-white/12 bg-ink-950/60 px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="font-data block text-[9px] uppercase tracking-[0.22em] text-haze-dim">
              total trip cost{passengers > 1 ? ` · ${passengers} pax` : ""}
            </span>
            <span className="font-display block pt-1 text-[28px] font-bold leading-none text-gradient">
              {money(route.totalCost, currency)}
            </span>
          </div>

          <div className="flex flex-col items-end gap-2">
            {route.savings > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint/10 px-2.5 py-1">
                <BoltIcon size={11} className="text-mint" />
                <span className="font-data text-[10px] tracking-[0.06em] text-mint">
                  saved {money(route.savings, currency)} vs market
                </span>
              </span>
            )}
            <span
              className={`font-data text-[10px] uppercase tracking-[0.14em] ${
                underBudget ? "text-haze-dim" : "text-coral"
              }`}
            >
              {underBudget
                ? `${money(budget - route.totalCost, currency)} left of ${money(budget, currency)}`
                : `${money(route.totalCost - budget, currency)} over budget`}
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled
          title="Booking is out of scope for this demo"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-jet/25 bg-gradient-to-r from-jet/25 via-violet/20 to-jet/25 px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-chalk/60 disabled:cursor-not-allowed"
        >
          <PlaneIcon size={13} />
          Book this trip
          <span className="font-data text-[9px] tracking-[0.14em] text-haze-dim">
            (demo)
          </span>
        </button>
      </div>
    </section>
  );
}
