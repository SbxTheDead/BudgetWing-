"use client";

import type { FlightOffer } from "@shared/types";
import { carrierName } from "@/app/lib/carriers";
import { clockTime, duration, money } from "@/app/lib/format";
import { BagIcon, BoltIcon, CheckIcon, ClockIcon } from "./icons";

interface FlightCardProps {
  offer: FlightOffer;
  /** Cheapest fare in its result set — gets the green accent + Best fare tag. */
  cheapest?: boolean;
  /** Market average for the leg, used for the savings line. */
  avgPrice?: number;
  passengers?: number;
}

export default function FlightCard({
  offer,
  cheapest = false,
  avgPrice,
  passengers = 1,
}: FlightCardProps) {
  const segments = offer.fromSegments;
  const first = segments[0];
  const last = segments[segments.length - 1];
  const totalMinutes = segments.reduce((sum, s) => sum + s.duration, 0);
  const stopCities = segments.flatMap((s) => s.stopCities ?? []);
  const stops = stopCities.length + segments.length - 1;

  const bag = offer.baggageElements[0];
  const hasChecked = (bag?.baggagePiece ?? 0) > 0;
  const savings = avgPrice ? avgPrice - offer.totalPrice : 0;

  return (
    <article
      className={`glass-soft group relative overflow-hidden rounded-[18px] px-4 py-3.5 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_14px_36px_rgba(0,0,0,0.42)] ${
        cheapest ? "border-mint/30" : ""
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* carrier code tile */}
          <span className="surface grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-[12px] font-semibold tracking-wide text-white">
            {first.carrier}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-medium leading-tight text-white">
              {carrierName(first.carrier)}
            </span>
            <span className="num block pt-0.5 text-[10.5px] text-white/35">
              {segments.map((s) => s.flightNumber).join(" · ")}
              {first.fareFamily ? ` · ${first.fareFamily}` : ""}
            </span>
          </span>
        </div>

        <div className="shrink-0 text-right">
          <span
            className={`num block text-[20px] font-semibold leading-none tracking-tight ${
              cheapest ? "text-mint" : "text-white"
            }`}
          >
            {money(offer.totalPrice, offer.currency)}
          </span>
          <span className="block pt-1 text-[10px] text-white/35">
            {passengers > 1 ? `× ${passengers} pax` : "per person"}
          </span>
        </div>
      </header>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-left">
          <span className="num block text-[16px] leading-none text-white">
            {clockTime(first.depTime)}
          </span>
          <span className="block pt-1 text-[10.5px] tracking-wide text-white/40">
            {first.depAirport}
          </span>
        </span>

        {/* flight path — hairline with a plane glyph in the middle */}
        <span className="relative flex-1 pt-1">
          <span className="block h-px w-full bg-gradient-to-r from-white/10 via-white/40 to-white/10" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-raised px-1.5 text-white/80 transition-transform duration-500 group-hover:translate-x-[-30%]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M21 12 3.5 19l3-7-3-7L21 12Z" />
            </svg>
          </span>
          {stops > 0 && (
            <span className="absolute left-1/2 top-[11px] -translate-x-1/2 whitespace-nowrap text-[9.5px] text-amber">
              via {stopCities.join(", ") || last.depAirport}
            </span>
          )}
        </span>

        <span className="text-right">
          <span className="num block text-[16px] leading-none text-white">
            {clockTime(last.arrTime)}
          </span>
          <span className="block pt-1 text-[10.5px] tracking-wide text-white/40">
            {last.arrAirport}
          </span>
        </span>
      </div>

      <footer className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-white/8 pt-3 text-[10.5px] text-white/55">
        <span className="num inline-flex items-center gap-1.5">
          <ClockIcon size={12} className="text-white/35" />
          {duration(totalMinutes)}
        </span>
        <span className={stops === 0 ? "text-white" : "text-amber"}>
          {stops === 0 ? "Nonstop" : `${stops} stop`}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 ${
            hasChecked ? "text-white/70" : "text-white/35"
          }`}
          title={
            hasChecked
              ? `${bag.baggagePiece} × ${bag.baggageWeight}kg checked`
              : "Cabin baggage only"
          }
        >
          <BagIcon size={12} />
          {hasChecked ? `${bag.baggageWeight}kg` : "cabin only"}
        </span>
        {offer.refundable && (
          <span className="inline-flex items-center gap-1.5 text-white/55">
            <CheckIcon size={12} />
            Refundable
          </span>
        )}
        {first.seatCount !== undefined && first.seatCount <= 4 && (
          <span className="text-coral/90">{first.seatCount} seats left</span>
        )}
      </footer>

      {(savings > 0 || cheapest) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {cheapest && (
            <span className="rounded-full border border-mint/25 bg-mint/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-mint">
              Best fare
            </span>
          )}
          {savings > 0 && (
            <span className="num inline-flex items-center gap-1.5 text-[11px] text-mint">
              <BoltIcon size={12} />
              {money(savings, offer.currency)} under average
            </span>
          )}
        </div>
      )}
    </article>
  );
}
