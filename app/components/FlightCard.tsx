"use client";

import type { FlightOffer } from "@shared/types";
import { carrierName } from "@/app/lib/carriers";
import { clockTime, duration, money } from "@/app/lib/format";
import { BagIcon, BoltIcon, CheckIcon, ClockIcon } from "./icons";

interface FlightCardProps {
  offer: FlightOffer;
  /** Cheapest fare in its result set - gets the mint rail and BEST FARE tag. */
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
      className={`flight-card group relative overflow-hidden rounded-xl border bg-ink-850/70 px-3 py-3 backdrop-blur-sm ${
        cheapest
          ? "border-mint/35 shadow-[0_0_0_1px_rgba(16,185,129,0.12)]"
          : "border-white/8"
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-[3px] ${
          cheapest
            ? "bg-gradient-to-b from-mint to-mint/20"
            : "bg-gradient-to-b from-white/12 to-transparent"
        }`}
      />

      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Airline logo placeholder: carrier code tile */}
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/12 to-white/2 font-display text-[11px] font-bold tracking-wider text-chalk">
            {first.carrier}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold leading-tight text-chalk">
              {carrierName(first.carrier)}
            </span>
            <span className="font-data block text-[10px] uppercase tracking-[0.14em] text-haze-dim">
              {segments.map((s) => s.flightNumber).join(" · ")}
              {first.fareFamily ? ` · ${first.fareFamily}` : ""}
            </span>
          </span>
        </div>

        <div className="card-price shrink-0 text-right">
          <span
            className={`font-data block text-[19px] font-semibold leading-none ${
              cheapest ? "text-mint" : "text-chalk"
            }`}
          >
            {money(offer.totalPrice, offer.currency)}
          </span>
          <span className="font-data block pt-1 text-[9px] uppercase tracking-[0.16em] text-haze-dim">
            {passengers > 1 ? `× ${passengers} pax` : "per person"}
          </span>
        </div>
      </header>

      <div className="mt-3 flex items-center gap-3">
        <span className="text-right">
          <span className="font-data block text-[15px] leading-none text-chalk">
            {clockTime(first.depTime)}
          </span>
          <span className="font-display block pt-0.5 text-[10px] tracking-[0.18em] text-haze-dim">
            {first.depAirport}
          </span>
        </span>

        {/* Flight path: hairline rail with a plane glyph riding the middle */}
        <span className="relative flex-1 pt-1">
          <span className="block h-[1px] w-full bg-gradient-to-r from-jet/10 via-jet/55 to-jet/10" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-ink-850 px-1 text-jet-bright transition-transform duration-500 group-hover:translate-x-[-30%]">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M21 12 3.5 19l3-7-3-7L21 12Z" />
            </svg>
          </span>
          {stops > 0 && (
            <span className="absolute left-1/2 top-[10px] -translate-x-1/2 whitespace-nowrap font-data text-[9px] uppercase tracking-[0.14em] text-amber">
              via {stopCities.join(", ") || last.depAirport}
            </span>
          )}
        </span>

        <span>
          <span className="font-data block text-[15px] leading-none text-chalk">
            {clockTime(last.arrTime)}
          </span>
          <span className="font-display block pt-0.5 text-[10px] tracking-[0.18em] text-haze-dim">
            {last.arrAirport}
          </span>
        </span>
      </div>

      <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/6 pt-2.5 text-[10px] text-haze">
        <span className="inline-flex items-center gap-1 font-data uppercase tracking-[0.1em]">
          <ClockIcon size={12} className="text-haze-dim" />
          {duration(totalMinutes)}
        </span>
        <span
          className={`font-data uppercase tracking-[0.1em] ${
            stops === 0 ? "text-jet-bright" : "text-amber"
          }`}
        >
          {stops === 0 ? "nonstop" : `${stops} stop`}
        </span>
        <span
          className={`inline-flex items-center gap-1 font-data uppercase tracking-[0.1em] ${
            hasChecked ? "text-chalk" : "text-haze-dim"
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
          <span className="inline-flex items-center gap-1 font-data uppercase tracking-[0.1em] text-violet">
            <CheckIcon size={11} />
            refundable
          </span>
        )}
        {first.seatCount !== undefined && first.seatCount <= 4 && (
          <span className="font-data uppercase tracking-[0.1em] text-coral/90">
            {first.seatCount} seats left
          </span>
        )}
      </footer>

      {savings > 0 && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-mint/25 bg-mint/10 px-2 py-1">
          <BoltIcon size={11} className="text-mint" />
          <span className="font-data text-[10px] font-medium tracking-[0.06em] text-mint">
            {money(savings, offer.currency)} cheaper than average
          </span>
        </div>
      )}

      {cheapest && (
        <span className="pointer-events-none absolute right-3 top-[46px] font-display text-[9px] font-semibold uppercase tracking-[0.22em] text-mint/70">
          best fare
        </span>
      )}
    </article>
  );
}
