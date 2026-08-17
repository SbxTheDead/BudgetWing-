/**
 * Multi-city route optimizer.
 *
 * The agent hands this module a pile of one-way search results and it answers
 * two questions: which city ordering is cheapest, and which departure date to
 * take for each leg. Ordering is brute-forced (≤6 permutable cities) and the
 * date choice inside an ordering is a small DP over the searched dates, so a
 * chosen leg is always at least `MIN_STAY_DAYS` after the previous one.
 */

import type {
  FlightOffer,
  OptimizedRoute,
  RouteLeg,
  SearchRequest,
  SearchResult,
  TripRequest,
} from "@shared/types";
import { getAirport, resolveCity } from "./airports";

/** Plain city name for user-facing prose; falls back to the IATA code. */
function cityName(iata: string): string {
  return getAirport(iata)?.city ?? iata;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Nights the traveller must get in each city before flying on. */
export const MIN_STAY_DAYS = 2;
/** Above this, permuting is pointless (720 orderings already) — see below. */
export const MAX_PERMUTATION_CITIES = 6;
/** Ceiling on searches emitted by `generateSearchPlan` (10 QPS ⇒ ~12s). */
export const MAX_SEARCH_PLAN_SIZE = 120;
/** Cheapest N offers per searched date are enough to find the optimum. */
const OFFERS_PER_DATE = 3;
/** Options per leg fed to the DP, cheapest-first. */
const OPTIONS_PER_LEG = 24;

const LAYOVER_FREE_HOURS = 4;
const LAYOVER_PENALTY_PER_HOUR = 10;
const RED_EYE_PENALTY = 15;
const STOP_PENALTY = 20;
const DIRECT_BONUS = 10;

// ---------------------------------------------------------------------------
// Date utilities (Atlas speaks YYYYMMDD, TripRequest speaks YYYY-MM-DD)
// ---------------------------------------------------------------------------

/** Accepts `YYYYMMDD`, `YYYY-MM-DD` or an ISO timestamp → `YYYYMMDD`. */
export function normalizeDate(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.slice(0, 8);
}

export function parseDate(yyyymmdd: string): Date {
  const compact = normalizeDate(yyyymmdd);
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function addDays(yyyymmdd: string, days: number): string {
  const date = parseDate(yyyymmdd);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

/** Signed whole days from `date1` to `date2`. */
export function daysBetween(date1: string, date2: string): number {
  return Math.round(
    (parseDate(date2).getTime() - parseDate(date1).getTime()) / 86_400_000,
  );
}

/**
 * Minimum days to spend in each city. Two is the floor; a long list of cities
 * never squeezes a stay below that, it just needs a longer trip window.
 */
export function calculateMinStay(cities: number): number {
  return cities <= 1 ? 0 : MIN_STAY_DAYS;
}

// ---------------------------------------------------------------------------
// Permutations, date variants and the search plan
// ---------------------------------------------------------------------------

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Every ordering of `cities`. With `startCity` the departure point is pinned
 * and only the rest are permuted (3 cities → 6, 4 → 24, 5 → 120). Beyond
 * `MAX_PERMUTATION_CITIES` the overflow keeps the requested order instead of
 * exploding the factorial.
 */
export function generatePermutations(
  cities: string[],
  startCity?: string,
): string[][] {
  const unique = dedupe(cities).filter((city) => city !== startCity);
  const permutable = unique.slice(0, MAX_PERMUTATION_CITIES);
  const overflow = unique.slice(MAX_PERMUTATION_CITIES);
  const prefix = startCity ? [startCity] : [];
  const orders: string[][] = [];

  const walk = (chosen: string[], remaining: string[]): void => {
    if (remaining.length === 0) {
      orders.push([...prefix, ...chosen, ...overflow]);
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      walk(
        [...chosen, remaining[i]],
        [...remaining.slice(0, i), ...remaining.slice(i + 1)],
      );
    }
  };
  walk([], permutable);

  return orders;
}

/** `baseDate` ± `flexDays`, ascending, as YYYYMMDD strings. */
export function generateDateVariants(
  baseDate: string,
  flexDays: number,
): string[] {
  const flex = Math.max(0, Math.min(7, Math.floor(flexDays)));
  const base = normalizeDate(baseDate);
  const variants: string[] = [];
  for (let offset = -flex; offset <= flex; offset++) {
    variants.push(addDays(base, offset));
  }
  return variants;
}

/** Resolve free-text city names to IATA codes, dropping unknowns. */
export function resolveTripCities(cities: string[]): string[] {
  return dedupe(
    cities
      .map((city) => resolveCity(city))
      .filter((code): code is string => code !== undefined),
  );
}

/** Legs of a closed circuit: A→B, B→C, C→A. */
export function buildCircuit(order: string[]): Array<[string, string]> {
  if (order.length < 2) return [];
  return order.map((origin, i) => [origin, order[(i + 1) % order.length]]);
}

/** Nominal departure date per leg: the trip window spread evenly across legs. */
export function nominalLegDates(
  tripRequest: TripRequest,
  legCount: number,
): string[] {
  const start = normalizeDate(tripRequest.startDate);
  const end = normalizeDate(tripRequest.endDate);
  const minStay = calculateMinStay(legCount);
  const window = Math.max(legCount * minStay, daysBetween(start, end));

  return Array.from({ length: legCount }, (_, i) =>
    addDays(start, Math.round((i * window) / legCount)),
  );
}

function toSearchRequest(
  tripRequest: TripRequest,
  origin: string,
  destination: string,
  date: string,
): SearchRequest {
  return {
    tripType: "1",
    adultNum: Math.max(1, tripRequest.passengers),
    childNum: 0,
    infantNum: 0,
    fromCity: origin,
    toCity: destination,
    fromDate: date,
    currency: tripRequest.currency,
    includeMultipleFareFamily: true,
  };
}

/**
 * Every search needed to price all city orderings within the flex window.
 * Legs shared between orderings are searched once, and dates that would break
 * the minimum stay (or fall outside the trip window) are pruned before the
 * list is capped at `MAX_SEARCH_PLAN_SIZE`, nearest-to-nominal first.
 */
export function generateSearchPlan(tripRequest: TripRequest): SearchRequest[] {
  const cities = resolveTripCities(tripRequest.cities);
  if (cities.length < 2) return [];

  const orders = generatePermutations(cities.slice(1), cities[0]);
  const legCount = cities.length;
  const nominal = nominalLegDates(tripRequest, legCount);
  const minStay = calculateMinStay(legCount);
  const start = normalizeDate(tripRequest.startDate);
  const end = normalizeDate(tripRequest.endDate);

  // Nearest-to-nominal wins when the same leg/date shows up in several orders.
  const wanted = new Map<string, { search: SearchRequest; rank: number }>();

  for (const order of orders) {
    buildCircuit(order).forEach(([origin, destination], i) => {
      const earliest = addDays(start, i * minStay);
      const latest = addDays(end, -(legCount - 1 - i) * minStay);

      for (const date of generateDateVariants(nominal[i], tripRequest.flexDays)) {
        if (date < earliest || date > latest) continue;

        const key = `${origin}-${destination}-${date}`;
        const rank = Math.abs(daysBetween(nominal[i], date));
        const existing = wanted.get(key);
        if (existing && existing.rank <= rank) continue;
        wanted.set(key, {
          search: toSearchRequest(tripRequest, origin, destination, date),
          rank,
        });
      }
    });
  }

  return [...wanted.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_SEARCH_PLAN_SIZE)
    .map((entry) => entry.search);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Segment times arrive as ISO-ish or compact digits; both become epoch ms. */
function toTimestamp(value: string | undefined): number | null {
  if (!value) return null;

  const digits = value.replace(/\D/g, "");
  if (digits.length >= 12) {
    const iso =
      `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` +
      `T${digits.slice(8, 10)}:${digits.slice(10, 12)}:00Z`;
    const compact = Date.parse(iso);
    if (!Number.isNaN(compact)) return compact;
  }

  const parsed = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

function departureHour(offer: FlightOffer): number | null {
  const timestamp = toTimestamp(offer.fromSegments[0]?.depTime);
  return timestamp === null ? null : new Date(timestamp).getUTCHours();
}

function countStops(offer: FlightOffer): number {
  const connections = Math.max(0, offer.fromSegments.length - 1);
  const technical = offer.fromSegments.reduce(
    (sum, segment) => sum + (segment.stopCities?.length ?? 0),
    0,
  );
  return connections + technical;
}

/** Total layover hours between consecutive segments of one leg. */
function layoverHours(offer: FlightOffer): number {
  let hours = 0;
  for (let i = 0; i < offer.fromSegments.length - 1; i++) {
    const arrival = toTimestamp(offer.fromSegments[i].arrTime);
    const departure = toTimestamp(offer.fromSegments[i + 1].depTime);
    if (arrival === null || departure === null || departure <= arrival) continue;
    hours += (departure - arrival) / 3_600_000;
  }
  return hours;
}

interface LegScore {
  cost: number;
  /** Signed adjustment added to cost — penalties positive, bonuses negative. */
  adjustment: number;
  notes: string[];
}

/** Comfort-adjusted cost of a single leg. */
function scoreLeg(leg: RouteLeg): LegScore {
  const offer = leg.offer;
  const label = `${leg.origin}→${leg.destination}`;
  const notes: string[] = [];
  let adjustment = 0;

  const stops = countStops(offer);
  if (stops > 0) {
    adjustment += stops * STOP_PENALTY;
    notes.push(`${label}: ${stops} stop${stops > 1 ? "s" : ""} (+$${stops * STOP_PENALTY})`);
  } else {
    adjustment -= DIRECT_BONUS;
    notes.push(`${label}: direct (-$${DIRECT_BONUS})`);
  }

  const excessLayover = layoverHours(offer) - LAYOVER_FREE_HOURS;
  if (excessLayover > 0) {
    const penalty = Math.round(excessLayover * LAYOVER_PENALTY_PER_HOUR);
    adjustment += penalty;
    notes.push(
      `${label}: ${excessLayover.toFixed(1)}h of layover over ${LAYOVER_FREE_HOURS}h (+$${penalty})`,
    );
  }

  const hour = departureHour(offer);
  if (hour !== null && (hour >= 23 || hour < 5)) {
    adjustment += RED_EYE_PENALTY;
    notes.push(`${label}: red-eye departure (+$${RED_EYE_PENALTY})`);
  }

  return { cost: offer.totalPrice, adjustment, notes };
}

/**
 * Rank a full itinerary. `totalCost` is what the traveller pays per passenger;
 * `score` folds in comfort penalties so a $5 saving never buys a 9h layover.
 */
export function scoreRoute(legs: RouteLeg[]): {
  totalCost: number;
  score: number;
  penalties: string[];
} {
  let totalCost = 0;
  let score = 0;
  const penalties: string[] = [];

  for (const leg of legs) {
    const legScore = scoreLeg(leg);
    totalCost += legScore.cost;
    score += legScore.cost + legScore.adjustment;
    penalties.push(...legScore.notes);
  }

  return {
    totalCost: Math.round(totalCost * 100) / 100,
    score: Math.round(score * 100) / 100,
    penalties,
  };
}

// ---------------------------------------------------------------------------
// Route construction
// ---------------------------------------------------------------------------

interface LegOption {
  origin: string;
  destination: string;
  date: string;
  offer: FlightOffer;
  cost: number;
  score: number;
}

interface RouteCandidate {
  order: string[];
  legs: RouteLeg[];
  totalCost: number;
  score: number;
  penalties: string[];
}

function pairKey(origin: string, destination: string): string {
  return `${origin}-${destination}`;
}

function withinPreferences(
  offer: FlightOffer,
  tripRequest: TripRequest,
): boolean {
  const maxStops = tripRequest.preferences?.maxStops;
  if (maxStops !== undefined && countStops(offer) > maxStops) return false;
  if (tripRequest.preferences?.needBaggage) {
    const hasBaggage = offer.baggageElements.some(
      (element) => element.baggagePiece > 0 || element.baggageWeight > 0,
    );
    const canAddBaggage = offer.ancillarySupported.some((code) =>
      code.toUpperCase().includes("BAG"),
    );
    if (!hasBaggage && !canAddBaggage) return false;
  }
  return true;
}

/** Group search results into per-pair options, cheapest-first. */
function indexOptions(
  searchResults: SearchResult[],
  tripRequest: TripRequest,
): Map<string, LegOption[]> {
  const byPair = new Map<string, LegOption[]>();

  for (const result of searchResults) {
    if (result.offers.length === 0) continue;

    const preferred = result.offers.filter((offer) =>
      withinPreferences(offer, tripRequest),
    );
    // Preferences are a nudge, not a wall: if they empty a leg the traveller
    // would have no route at all, so fall back to the raw offers.
    const usable = (preferred.length > 0 ? preferred : result.offers)
      .slice()
      .sort((a, b) => a.totalPrice - b.totalPrice)
      .slice(0, OFFERS_PER_DATE);

    const key = pairKey(result.origin, result.destination);
    const options = byPair.get(key) ?? [];
    for (const offer of usable) {
      const leg: RouteLeg = {
        origin: result.origin,
        destination: result.destination,
        date: normalizeDate(result.date),
        offer,
      };
      const { cost, adjustment } = scoreLeg(leg);
      options.push({
        origin: leg.origin,
        destination: leg.destination,
        date: leg.date,
        offer,
        cost,
        score: cost + adjustment,
      });
    }
    byPair.set(key, options);
  }

  for (const [key, options] of byPair) {
    byPair.set(
      key,
      options
        .sort((a, b) => a.score - b.score)
        .slice(0, OPTIONS_PER_LEG)
        .sort((a, b) => a.date.localeCompare(b.date)),
    );
  }
  return byPair;
}

interface OrderEvaluation {
  candidate: RouteCandidate | null;
  /** Partial itineraries examined — the "alternatives considered" counter. */
  combinations: number;
}

/**
 * Cheapest dated itinerary for one city ordering. DP over searched dates: a
 * leg may only follow a leg that departed at least `minStay` days earlier.
 */
function evaluateOrder(
  order: string[],
  optionsByPair: Map<string, LegOption[]>,
  minStay: number,
): OrderEvaluation {
  const circuit = buildCircuit(order);
  const legOptions = circuit.map(
    ([origin, destination]) => optionsByPair.get(pairKey(origin, destination)) ?? [],
  );
  if (legOptions.length === 0 || legOptions.some((options) => options.length === 0)) {
    return { candidate: null, combinations: 0 };
  }

  let combinations = 0;
  // best[i][j] — cheapest score reaching option j of leg i, plus its backlink.
  const best: Array<Array<{ score: number; from: number }>> = [];

  legOptions.forEach((options, legIndex) => {
    best.push(
      options.map((option) => {
        if (legIndex === 0) {
          combinations++;
          return { score: option.score, from: -1 };
        }
        let bestScore = Number.POSITIVE_INFINITY;
        let bestFrom = -1;
        legOptions[legIndex - 1].forEach((previous, previousIndex) => {
          const previousState = best[legIndex - 1][previousIndex];
          if (!Number.isFinite(previousState.score)) return;
          if (daysBetween(previous.date, option.date) < minStay) return;
          combinations++;
          const score = previousState.score + option.score;
          if (score < bestScore) {
            bestScore = score;
            bestFrom = previousIndex;
          }
        });
        return { score: bestScore, from: bestFrom };
      }),
    );
  });

  const lastLeg = best[best.length - 1];
  let endIndex = -1;
  let endScore = Number.POSITIVE_INFINITY;
  lastLeg.forEach((state, index) => {
    if (state.score < endScore) {
      endScore = state.score;
      endIndex = index;
    }
  });
  if (endIndex < 0 || !Number.isFinite(endScore)) {
    return { candidate: null, combinations };
  }

  const chosen: LegOption[] = [];
  let cursor = endIndex;
  for (let legIndex = best.length - 1; legIndex >= 0; legIndex--) {
    chosen.unshift(legOptions[legIndex][cursor]);
    cursor = best[legIndex][cursor].from;
    if (cursor < 0 && legIndex > 0) return { candidate: null, combinations };
  }

  const legs: RouteLeg[] = chosen.map((option) => ({
    origin: option.origin,
    destination: option.destination,
    date: option.date,
    offer: option.offer,
  }));
  const scored = scoreRoute(legs);

  return {
    candidate: {
      order,
      legs,
      totalCost: scored.totalCost,
      score: scored.score,
      penalties: scored.penalties,
    },
    combinations,
  };
}

function cheapestOnDate(
  optionsByPair: Map<string, LegOption[]>,
  origin: string,
  destination: string,
  date: string,
): LegOption | undefined {
  return (optionsByPair.get(pairKey(origin, destination)) ?? [])
    .filter((option) => option.date === date)
    .sort((a, b) => a.cost - b.cost)[0];
}

function emptyRoute(reasoning: string, alternativesConsidered = 0): OptimizedRoute {
  return { legs: [], totalCost: 0, savings: 0, reasoning, alternativesConsidered };
}

/**
 * Best itinerary the search results can support: cheapest ordering that fits
 * the budget, dated inside the flex window, with the reasoning that explains
 * why it beat the alternatives.
 */
export function findOptimalRoute(
  searchResults: SearchResult[],
  tripRequest: TripRequest,
): OptimizedRoute {
  const cities = resolveTripCities(tripRequest.cities);
  if (cities.length < 2) {
    return emptyRoute("Need at least two recognised cities to build a route.");
  }

  const optionsByPair = indexOptions(searchResults, tripRequest);
  if (optionsByPair.size === 0) {
    return emptyRoute("No priced offers came back for any leg of this trip.");
  }

  const legCount = cities.length;
  const minStay = calculateMinStay(legCount);
  const passengers = Math.max(1, tripRequest.passengers);
  const orders = generatePermutations(cities.slice(1), cities[0]);

  let combinations = 0;
  const candidates: RouteCandidate[] = [];
  for (const order of orders) {
    const evaluation = evaluateOrder(order, optionsByPair, minStay);
    combinations += evaluation.combinations;
    if (evaluation.candidate) candidates.push(evaluation.candidate);
  }

  if (candidates.length === 0) {
    return emptyRoute(
      "I couldn't price a complete trip — every route I checked is missing at least " +
        "one flight. Trying different dates or fewer cities might help.",
      combinations,
    );
  }

  const byScore = [...candidates].sort((a, b) => a.score - b.score);
  const affordable = byScore.filter(
    (candidate) => candidate.totalCost * passengers <= tripRequest.budget,
  );
  const best =
    affordable[0] ?? [...candidates].sort((a, b) => a.totalCost - b.totalCost)[0];

  // Baseline for the savings figure: the cities in the order the traveller
  // listed them, flying on the nominal dates (no flex, no reordering).
  const nominal = nominalLegDates(tripRequest, legCount);
  const baselineLegs = buildCircuit(cities)
    .map(([origin, destination], i) =>
      cheapestOnDate(optionsByPair, origin, destination, nominal[i]),
    )
    .filter((option): option is LegOption => option !== undefined);
  const baselineCost =
    baselineLegs.length === legCount
      ? baselineLegs.reduce((sum, option) => sum + option.cost, 0)
      : byScore.reduce((sum, candidate) => sum + candidate.totalCost, 0) /
        byScore.length;

  const legs: RouteLeg[] = best.legs.map((leg, i) => {
    const nominalOption = cheapestOnDate(
      optionsByPair,
      leg.origin,
      leg.destination,
      nominal[i],
    );
    const shifted = nominalOption !== undefined && nominalOption.date !== leg.date;
    const savedByShift = shifted
      ? Math.round((nominalOption.cost - leg.offer.totalPrice) * 100) / 100
      : 0;
    return {
      ...leg,
      ...(shifted ? { alternativeDate: nominal[i] } : {}),
      ...(savedByShift > 0 ? { savings: savedByShift } : {}),
    };
  });

  const totalCost = Math.round(best.totalCost * passengers * 100) / 100;
  const savings = Math.max(
    0,
    Math.round((baselineCost * passengers - totalCost) * 100) / 100,
  );

  return {
    legs,
    totalCost,
    savings,
    reasoning: explainRoute({
      best,
      legs,
      candidates: byScore,
      combinations,
      totalCost,
      savings,
      tripRequest,
      withinBudget: affordable.length > 0,
    }),
    alternativesConsidered: combinations,
  };
}

/**
 * Friendly, user-facing summary of the winning itinerary: route + price, how
 * much it beats the next option by, any date shifts, directness and how much
 * of the budget it uses. Exact numbers stay in the route's data fields; the
 * prose rounds to whole dollars.
 */
function explainRoute(input: {
  best: RouteCandidate;
  legs: RouteLeg[];
  candidates: RouteCandidate[];
  combinations: number;
  totalCost: number;
  savings: number;
  tripRequest: TripRequest;
  withinBudget: boolean;
}): string {
  const { best, legs, candidates, totalCost, savings, tripRequest } = input;
  const money = (value: number) =>
    `${tripRequest.currency === "USD" ? "$" : `${tripRequest.currency} `}${Math.round(value)}`;
  const perPerson = tripRequest.passengers > 1 ? " per person" : "";
  const sentences: string[] = [];

  const routeFlow = best.order.map((city) => cityName(city)).join(" → ");
  const runnerUp = candidates.find(
    (candidate) => candidate !== best && candidate.totalCost > best.totalCost,
  );
  sentences.push(
    `Found your cheapest route: ${routeFlow} for ${money(best.totalCost)}${perPerson}` +
      (runnerUp
        ? ` — ${money(runnerUp.totalCost - best.totalCost)} less than the next best option.`
        : "."),
  );

  const shifted = legs.filter((leg) => leg.alternativeDate);
  sentences.push(
    shifted.length > 0
      ? `I shifted ${shifted.length === 1 ? "one flight" : `${shifted.length} flights`} by a few days to catch lower fares.`
      : "Your dates already had the best fares, so nothing moved.",
  );

  const directLegs = best.penalties.filter((note) => note.includes("direct")).length;
  if (directLegs === legs.length && legs.length > 1) {
    sentences.push(`Every flight is direct.`);
  } else if (directLegs > 0) {
    sentences.push(
      `I kept ${directLegs} of ${legs.length} legs direct — connections only where they clearly save you money.`,
    );
  }

  if (savings > 0 && runnerUp) {
    sentences.push(
      `That's ${money(savings)} cheaper than flying your original plan.`,
    );
  }

  const pct = Math.round((totalCost / tripRequest.budget) * 100);
  sentences.push(
    input.withinBudget
      ? `That uses just ${pct}% of your ${money(tripRequest.budget)} budget, leaving ${money(tripRequest.budget - totalCost)} for everything else.`
      : `Even the cheapest plan runs ${money(totalCost - tripRequest.budget)} over your ${money(tripRequest.budget)} budget — dropping a city or travelling on different dates would help.`,
  );

  return sentences.join(" ");
}
