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
    <section className="glass overflow-hidden rounded-[24px]">
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-3.5">
        <h2 className="text-[13px] font-medium text-white/85">Itinerary</h2>
        <span className="num text-[11px] text-white/35">
          {legs.length} flights · {route.alternativesConsidered} routes tested
        </span>
      </header>

      <ol className="px-5 py-5">
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
              className="anim-rise relative pl-7"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {/* node */}
              <span
                className="absolute left-0 top-1.5 grid h-3 w-3 place-items-center rounded-full border bg-base"
                style={{
                  borderColor: isReturnHome
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(255,255,255,0.35)",
                }}
              >
                <span
                  className="h-1 w-1 rounded-full"
                  style={{
                    background: isReturnHome
                      ? "#ffffff"
                      : "rgba(255,255,255,0.5)",
                  }}
                />
              </span>

              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="flex items-baseline gap-2">
                  <span className="text-[16px] font-semibold tracking-tight text-white">
                    {code}
                  </span>
                  <span className="text-[12px] text-white/55">
                    {city?.city ?? code}
                    {city ? `, ${city.country}` : ""}
                  </span>
                </p>
                <p className="num text-[10.5px] text-white/35">
                  {arrivalLeg ? shortDate(arrivalLeg.date) : shortDate(legs[0].date)}
                  {nights > 0 ? ` · ${nights} night${nights > 1 ? "s" : ""}` : ""}
                  {isReturnHome ? " · trip ends" : ""}
                </p>
              </div>

              {/* connector + flight detail */}
              {leg && (
                <div className="relative mb-5 mt-2.5">
                  <span
                    aria-hidden
                    className="spine absolute -left-[22px] top-0 h-full w-px"
                  />
                  <span
                    aria-hidden
                    className="absolute -left-[27px] top-1/2 -translate-y-1/2 rounded-full bg-base py-1 text-white/70"
                  >
                    <PlaneIcon size={11} className="rotate-90" />
                  </span>

                  <div className="glass-soft rounded-[14px] px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="flex items-center gap-2.5">
                        <span className="surface grid h-6 w-6 place-items-center rounded-[8px] text-[9px] font-semibold tracking-wide text-white">
                          {segment?.carrier}
                        </span>
                        <span className="num text-[12px] text-white">
                          {clockTime(segment?.depTime ?? "")}
                          <span className="px-1.5 text-white/30">→</span>
                          {clockTime(lastSegment?.arrTime ?? "")}
                        </span>
                        <span className="num text-[10.5px] text-white/35">
                          {duration(
                            leg.offer.fromSegments.reduce(
                              (sum, s) => sum + s.duration,
                              0,
                            ),
                          )}
                        </span>
                      </span>

                      <span
                        className="num text-[13.5px] font-medium"
                        style={{ color: TIER_HEX[tier] }}
                      >
                        {money(leg.offer.totalPrice * passengers, currency)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/35">
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
      <p className="mx-5 mb-5 border-l-2 border-white/15 bg-white/4 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-white/55">
        {route.reasoning}
      </p>

      {/* total */}
      <div className="border-t border-white/8 bg-white/3 px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-white/35">
              Total trip cost{passengers > 1 ? ` · ${passengers} pax` : ""}
            </span>
            <span className="num block pt-1 text-[30px] font-semibold leading-none tracking-tight text-white">
              {money(route.totalCost, currency)}
            </span>
          </div>

          <div className="flex flex-col items-end gap-2">
            {route.savings > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-mint/25 bg-mint/10 px-3 py-1">
                <BoltIcon size={11} className="text-mint" />
                <span className="num text-[11px] text-mint">
                  Saved {money(route.savings, currency)} vs market
                </span>
              </span>
            )}
            <span
              className={`num text-[10.5px] ${
                underBudget ? "text-white/35" : "text-coral"
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
          className="btn btn-primary mt-5 w-full py-3 text-[13px]"
        >
          <PlaneIcon size={14} />
          Book this trip
          <span className="text-[10px] opacity-50">(demo)</span>
        </button>
      </div>
    </section>
  );
}
