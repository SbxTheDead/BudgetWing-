import type {
  FlightOffer,
  FlightSegment,
  OptimizedRoute,
  RouteLeg,
  TripRequest,
} from "@shared/types";
import { CARRIERS } from "@/app/lib/carriers";
import { distanceKm, getCity } from "@/app/lib/cities";

/**
 * Deterministic stand-in for the Atlas-powered agent (Task #6 replaces this).
 * Everything is derived from a seeded PRNG so the same request always produces
 * the same itinerary — essential when re-recording a demo take.
 */

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HUBS = ["SIN", "KUL", "BKK", "HKG", "DOH", "IST", "AMS"];

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function stamp(date: string, minutesFromMidnight: number): string {
  const day = Math.floor(minutesFromMidnight / 1440);
  const rest = minutesFromMidnight % 1440;
  const hh = String(Math.floor(rest / 60)).padStart(2, "0");
  const mm = String(rest % 60).padStart(2, "0");
  return `${addDays(date, day)}T${hh}:${mm}`;
}

function buildOffer(
  origin: string,
  destination: string,
  date: string,
  variant: number,
  random: () => number,
): FlightOffer {
  const km = distanceKm(origin, destination);
  const flightMinutes = Math.round(60 + km / 11.5);

  const carrier = CARRIERS[Math.floor(random() * CARRIERS.length)];
  const stops = variant === 0 ? 0 : random() < 0.42 ? 1 : 0;
  const departMinutes = Math.round(300 + random() * 780); // 05:00–18:00
  const layover = stops ? Math.round(70 + random() * 150) : 0;
  const detour = stops ? Math.round(flightMinutes * 0.35) : 0;
  const totalMinutes = flightMinutes + layover + detour;

  // Distance-driven base fare, nudged by variant so the list has real spread.
  const base = 24 + km * 0.048;
  const variantFactor = [0.86, 1.0, 1.14, 1.31][variant] ?? 1;
  const stopDiscount = stops ? 0.88 : 1;
  const jitter = 0.9 + random() * 0.24;
  const adultPrice = Math.round(base * variantFactor * stopDiscount * jitter);
  const adultTax = Math.round(adultPrice * (0.11 + random() * 0.07));
  const transactionFeePerPax = variant === 0 ? 4 : 6;

  const stopCity =
    stops === 1
      ? HUBS.filter((h) => h !== origin && h !== destination)[
          Math.floor(random() * 4)
        ] ?? "KUL"
      : undefined;

  const baggagePiece = variant === 0 ? 0 : variant === 1 ? 1 : 2;

  const segments: FlightSegment[] = [
    {
      carrier: carrier.code,
      flightNumber: `${carrier.code}${Math.floor(100 + random() * 890)}`,
      depAirport: origin,
      arrAirport: destination,
      depTime: stamp(date, departMinutes),
      arrTime: stamp(date, departMinutes + totalMinutes),
      duration: totalMinutes,
      cabinClass: "Y",
      fareFamily:
        variant === 0 ? "BASIC" : variant === 1 ? "VALUE" : "FLEX",
      seatCount: Math.floor(2 + random() * 8),
      stopCities: stopCity ? [stopCity] : undefined,
    },
  ];

  return {
    routingIdentifier: `${origin}${destination}-${date.replace(/-/g, "")}-${variant}`,
    currency: "USD",
    adultPrice,
    adultTax,
    transactionFeePerPax,
    totalPrice: adultPrice + adultTax + transactionFeePerPax,
    fromSegments: segments,
    baggageElements: [
      {
        segmentNo: 1,
        passengerType: "ADT",
        baggagePiece,
        baggageWeight: baggagePiece === 0 ? 7 : baggagePiece * 20,
        baggageSize: "158cm",
      },
    ],
    refundable: variant >= 2,
    changeable: variant >= 1,
    ancillarySupported: baggagePiece === 0 ? ["BAGGAGE", "SEAT"] : ["SEAT"],
    refreshTime: new Date().toISOString(),
  };
}

export interface LegQuote {
  origin: string;
  destination: string;
  date: string;
  offers: FlightOffer[];
  avgPrice: number;
  cheapestPrice: number;
  /** A shifted date the optimizer found within the flex window. */
  altDate?: string;
  altSavings?: number;
  /** Fares on `altDate`, cheapest first — what the locked route actually buys. */
  altOffers?: FlightOffer[];
}

function offersFor(origin: string, destination: string, date: string) {
  const random = rng(hashSeed(`${origin}${destination}${date}`));
  const offers = [0, 1, 2, 3]
    .map((v) => buildOffer(origin, destination, date, v, random))
    .sort((a, b) => a.totalPrice - b.totalPrice);
  return {
    offers,
    avgPrice: Math.round(
      offers.reduce((sum, o) => sum + o.totalPrice, 0) / offers.length,
    ),
  };
}

/**
 * Quotes one leg on its planned date, then probes the flex window.
 * `bounds` keeps a shifted departure chronologically valid — never before the
 * previous leg lands, never past the end of the trip.
 */
export function quoteLeg(
  origin: string,
  destination: string,
  date: string,
  flexDays: number,
  bounds?: { min?: string; max?: string },
): LegQuote {
  const { offers, avgPrice } = offersFor(origin, destination, date);

  let altDate: string | undefined;
  let altSavings: number | undefined;
  let altOffers: FlightOffer[] | undefined;

  for (let shift = -flexDays; shift <= flexDays; shift++) {
    if (shift === 0) continue;
    const probeDate = addDays(date, shift);
    if (bounds?.min && probeDate < bounds.min) continue;
    if (bounds?.max && probeDate > bounds.max) continue;

    const probe = offersFor(origin, destination, probeDate);
    const saving = offers[0].totalPrice - probe.offers[0].totalPrice;
    if (saving >= 8 && saving > (altSavings ?? 0)) {
      altSavings = saving;
      altDate = probeDate;
      altOffers = probe.offers;
    }
  }

  return {
    origin,
    destination,
    date,
    offers,
    avgPrice,
    cheapestPrice: offers[0].totalPrice,
    altDate,
    altSavings,
    altOffers,
  };
}

/** Cheapest open path that starts at the first city, brute-forced (≤6 cities). */
export function optimizeOrder(cities: string[]): {
  order: string[];
  alternativesConsidered: number;
  /** Cost delta versus the next cheapest ordering, per passenger. */
  nextBestSaving: number;
} {
  if (cities.length <= 2)
    return { order: cities, alternativesConsidered: 1, nextBestSaving: 0 };
  const [home, ...rest] = cities;
  const permutations: string[][] = [];

  const permute = (current: string[], remaining: string[]) => {
    if (remaining.length === 0) {
      permutations.push(current);
      return;
    }
    remaining.forEach((city, i) =>
      permute(
        [...current, city],
        remaining.filter((_, j) => j !== i),
      ),
    );
  };
  permute([], rest.slice(0, 5));

  const cost = (order: string[]) => {
    const full = [home, ...order, home];
    let total = 0;
    for (let i = 0; i < full.length - 1; i++) {
      total += 24 + distanceKm(full[i], full[i + 1]) * 0.048;
    }
    return total;
  };

  const ranked = permutations
    .map((order) => ({ order, cost: cost(order) }))
    .sort((a, b) => a.cost - b.cost);
  const bestCost = ranked[0].cost;
  const nextBest = ranked.find((entry) => entry.cost > bestCost);
  return {
    order: [home, ...ranked[0].order],
    alternativesConsidered: permutations.length,
    nextBestSaving: nextBest ? Math.round(nextBest.cost - bestCost) : 0,
  };
}

/**
 * Spreads the trip window across the legs: first hop on the start date, the
 * return hop on the end date, stays of roughly equal length in between.
 */
export function legDates(req: TripRequest, legCount: number): string[] {
  const start = req.startDate.slice(0, 10);
  const totalDays = Math.max(
    legCount,
    Math.round(
      (new Date(`${req.endDate.slice(0, 10)}T00:00:00Z`).getTime() -
        new Date(`${start}T00:00:00Z`).getTime()) /
        86_400_000,
    ),
  );
  const gaps = Math.max(1, legCount - 1);
  return Array.from({ length: legCount }, (_, i) =>
    addDays(start, Math.round((i * totalDays) / gaps)),
  );
}

export interface TripPlan {
  order: string[];
  quotes: LegQuote[];
  route: OptimizedRoute;
  baselineCost: number;
  alternativesConsidered: number;
}

/** Full mock plan: ordering, per-leg quotes, and the winning itinerary. */
export function planTrip(req: TripRequest): TripPlan {
  const { order, alternativesConsidered, nextBestSaving } = optimizeOrder(req.cities);
  const circuit = [...order, order[0]]; // return to the departure city
  const pairs = circuit
    .slice(0, -1)
    .map((origin, i) => [origin, circuit[i + 1]] as const);
  const dates = legDates(req, pairs.length);
  const endDate = req.endDate.slice(0, 10);

  // Quote in order so each shifted departure stays after the previous arrival
  // and still leaves a night at the stop that follows.
  const quotes: LegQuote[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const [origin, destination] = pairs[i];
    const previous = quotes[i - 1];
    const min = previous
      ? addDays(previous.altDate ?? previous.date, 1)
      : dates[0];
    const max = i === pairs.length - 1 ? endDate : addDays(dates[i + 1], -1);

    quotes.push(
      quoteLeg(origin, destination, dates[i], req.flexDays, { min, max }),
    );
  }

  const legs: RouteLeg[] = quotes.map((q) => ({
    origin: q.origin,
    destination: q.destination,
    date: q.altSavings ? (q.altDate as string) : q.date,
    // A winning date shift buys the fares quoted on that shifted date.
    offer: (q.altSavings ? q.altOffers : q.offers)?.[0] ?? q.offers[0],
    alternativeDate: q.altSavings ? q.date : undefined,
    savings: q.altSavings,
  }));

  const pax = Math.max(1, req.passengers);
  const totalCost = legs.reduce((sum, l) => sum + l.offer.totalPrice, 0) * pax;
  const baselineCost = quotes.reduce((sum, q) => sum + q.avgPrice, 0) * pax;

  const shifted = quotes.filter((q) => q.altSavings);
  const routeFlow = order.map((c) => getCity(c)?.city ?? c).join(" → ");
  const reasoning = [
    `Found your cheapest route: ${routeFlow} for $${Math.round(totalCost / pax)}${pax > 1 ? " per person" : ""}` +
      (nextBestSaving > 0
        ? ` — about $${nextBestSaving} less than the next best option.`
        : "."),
    shifted.length
      ? `I shifted ${shifted.length === 1 ? "one flight" : `${shifted.length} flights`} by a few days to catch lower fares.`
      : "Your dates already had the best fares, so nothing moved.",
    totalCost <= req.budget
      ? `That uses just ${Math.round((totalCost / req.budget) * 100)}% of your $${req.budget} budget, leaving $${Math.round(req.budget - totalCost)} for everything else.`
      : `Even the cheapest plan runs $${Math.round(totalCost - req.budget)} over your $${req.budget} budget — dropping a city or travelling on different dates would help.`,
  ].join(" ");

  return {
    order,
    quotes,
    baselineCost,
    alternativesConsidered,
    route: {
      legs,
      totalCost: Math.round(totalCost),
      savings: Math.round(Math.max(0, baselineCost - totalCost)),
      reasoning,
      alternativesConsidered,
    },
  };
}
