import type { FlightOffer } from "../types";
import { clockTime, duration, money } from "../lib/format";

/** Carrier codes the planner draws from — display names for the card. */
const CARRIER_NAMES: Record<string, string> = {
  AK: "AirAsia",
  TR: "Scoot",
  VJ: "VietJet Air",
  FD: "Thai AirAsia",
  "5J": "Cebu Pacific",
  JT: "Lion Air",
  QZ: "Indonesia AirAsia",
  OD: "Batik Air",
  SL: "Thai Lion Air",
  PG: "Bangkok Airways",
  MH: "Malaysia Airlines",
  VN: "Vietnam Airlines",
  FR: "Ryanair",
  W6: "Wizz Air",
  U2: "easyJet",
  VY: "Vueling",
};

interface FlightCardProps {
  offer: FlightOffer;
  /** Market average for this leg — used for the savings badge. */
  avgPrice?: number;
  compact?: boolean;
}

export default function FlightCard({ offer, avgPrice, compact }: FlightCardProps) {
  const segs = offer.fromSegments ?? [];
  const first = segs[0];
  const last = segs[segs.length - 1];
  if (!first || !last) return null;

  const totalMin = segs.reduce((sum, s) => sum + (s.duration || 0), 0);
  const stops = segs.length - 1;
  const carrier = CARRIER_NAMES[first.carrier] ?? first.carrier;
  const savings =
    typeof avgPrice === "number" && avgPrice > offer.totalPrice
      ? avgPrice - offer.totalPrice
      : 0;

  return (
    <article className={`flight-card${compact ? " flight-card--compact" : ""}`}>
      <div className="flight-card__top">
        <span className="flight-card__carrier">
          <span className="flight-card__carrier-code">{first.carrier}</span>
          {carrier}
        </span>
        <span className="flight-card__flight-no">
          {first.flightNumber}
          {stops > 0 ? ` · ${stops} stop${stops > 1 ? "s" : ""}` : " · direct"}
        </span>
      </div>

      <div className="flight-card__times">
        <div className="flight-card__endpoint">
          <strong>{clockTime(first.depTime)}</strong>
          <span>{first.depAirport}</span>
        </div>
        <div className="flight-card__path">
          <span className="flight-card__duration">{duration(totalMin)}</span>
          <span className="flight-card__line" aria-hidden="true">
            <i />
            <i className="flight-card__wing" />
            <i />
          </span>
        </div>
        <div className="flight-card__endpoint flight-card__endpoint--arr">
          <strong>{clockTime(last.arrTime)}</strong>
          <span>{last.arrAirport}</span>
        </div>
      </div>

      <div className="flight-card__bottom">
        <span className="flight-card__price">{money(offer.totalPrice, offer.currency)}</span>
        {savings > 0 && (
          <span className="flight-card__savings">−{money(savings, offer.currency)} vs avg</span>
        )}
      </div>
    </article>
  );
}
