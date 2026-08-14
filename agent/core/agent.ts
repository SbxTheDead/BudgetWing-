/**
 * The BudgetWing orchestration loop.
 *
 * A run has two halves. First a deterministic pass: resolve the cities, build a
 * search plan across every city ordering, fan the searches out to Atlas and let
 * the optimizer pick a winner. That result alone is a complete answer, which is
 * what makes the second half safe — Qwen then reasons over the same data with
 * tools to challenge or improve the plan, and any failure there falls back to
 * the deterministic route instead of breaking the run.
 */

import type {
  FlightOffer,
  OptimizedRoute,
  RouteLeg,
  SearchRequest,
  SearchResult,
  TripRequest,
} from "@shared/types";
import {
  AGENT_TOOLS,
  QwenProvider,
  type ParsedToolCall,
  type QwenMessage,
  type QwenToolCall,
} from "@agent/providers/qwen";
import { batchSearch, searchFlights, verifyFare } from "@agent/tools/atlas";
import {
  airportLabel,
  getAlternatives,
  resolveCity,
} from "@agent/tools/airports";
import { BudgetTracker, formatCurrency } from "@agent/tools/budget";
import {
  calculateMinStay,
  daysBetween,
  findOptimalRoute,
  generateDateVariants,
  generatePermutations,
  generateSearchPlan,
  normalizeDate,
  resolveTripCities,
  scoreRoute,
} from "@agent/tools/optimizer";
import {
  FORCE_FINAL_ANSWER_PROMPT,
  SYSTEM_PROMPT,
  buildPlanningPrompt,
} from "./prompt";
import {
  searchKey,
  type AgentEvent,
  type AgentEventCallback,
  type AgentState,
} from "./types";

const DEFAULT_MAX_ITERATIONS = 10;
/** Hard ceiling on Atlas searches per run, across the plan and all tool calls. */
const MAX_ATLAS_SEARCHES = 220;
/** Searches a single tool call may trigger. */
const MAX_SEARCHES_PER_TOOL_CALL = 16;
const OFFERS_IN_TOOL_RESULT = 3;
/** Fares published per leg when a route is announced to the consumer. */
const OFFERS_IN_LEG_QUOTE = 3;

interface RunContext {
  state: AgentState;
  budget: BudgetTracker;
  /** Departure city first, then the rest in the order requested. */
  cities: string[];
  /** routingIdentifier → the offer it belongs to, for verify and final parsing. */
  offers: Map<string, { offer: FlightOffer; result: SearchResult }>;
  searchesUsed: number;
  /** Leg quotes already emitted, so re-comparing does not repeat itself. */
  quoted: Set<string>;
}

export class BudgetWingAgent {
  private readonly provider: QwenProvider;

  constructor(
    private readonly onEvent: AgentEventCallback,
    private readonly maxIterations = DEFAULT_MAX_ITERATIONS,
    provider?: QwenProvider,
  ) {
    this.provider = provider ?? new QwenProvider();
  }

  async run(tripRequest: TripRequest): Promise<OptimizedRoute> {
    const cities = resolveTripCities(tripRequest.cities);
    const context = this.createContext(tripRequest, cities);

    this.emit("thinking", `Reading the request: ${describeRequest(tripRequest, cities)}`);

    if (cities.length < 2) {
      context.state.status = "error";
      const route = emptyRoute(
        "I could only recognise " +
          (cities.length === 1 ? `${airportLabel(cities[0])}` : "no cities") +
          " in that request — name at least two cities I can fly between.",
      );
      this.emit("error", route.reasoning);
      return route;
    }

    try {
      const route = await this.plan(context, tripRequest);
      context.state.bestRoute = route;
      context.state.status = route.legs.length > 0 ? "complete" : "error";

      if (route.legs.length === 0) {
        this.emit("error", route.reasoning, route);
        return route;
      }

      this.emit(
        "complete",
        `Locked ${route.legs.length} legs for ${formatCurrency(route.totalCost, tripRequest.currency)}` +
          (route.savings > 0
            ? `, ${formatCurrency(route.savings, tripRequest.currency)} under the baseline.`
            : "."),
        route,
      );
      return route;
    } catch (error) {
      // Anything unexpected still yields whatever the optimizer had found.
      context.state.status = "error";
      const fallback = context.state.bestRoute;
      const message = describeError(error);
      this.emit("error", `Planning failed: ${message}`, { message });
      return (
        fallback ??
        emptyRoute(`Planning failed before a route was found: ${message}`)
      );
    }
  }

  // -------------------------------------------------------------------------
  // Phases
  // -------------------------------------------------------------------------

  private createContext(tripRequest: TripRequest, cities: string[]): RunContext {
    const legCount = Math.max(1, cities.length);
    return {
      state: {
        tripRequest,
        searchResults: new Map<string, SearchResult>(),
        bestRoute: null,
        budgetRemaining: tripRequest.budget,
        iterationCount: 0,
        maxIterations: this.maxIterations,
        status: "planning",
      },
      budget: new BudgetTracker(tripRequest.budget, tripRequest.currency, legCount),
      cities,
      offers: new Map(),
      searchesUsed: 0,
      quoted: new Set(),
    };
  }

  private async plan(
    context: RunContext,
    tripRequest: TripRequest,
  ): Promise<OptimizedRoute> {
    const orderings = generatePermutations(
      context.cities.slice(1),
      context.cities[0],
    ).length;
    const plan = generateSearchPlan(tripRequest);

    this.emit(
      "thinking",
      `${orderings} city ordering${orderings > 1 ? "s" : ""} to test. ` +
        `That needs ${plan.length} priced legs once shared legs are deduplicated.`,
      { orderings, searches: plan.length },
    );

    context.state.status = "searching";
    this.emit("searching", `Pricing ${plan.length} legs on Atlas…`, {
      searches: plan.length,
    });

    const results = await this.runSearches(context, plan);
    const priced = results.filter((result) => result.offers.length > 0).length;
    this.emit(
      "result",
      `${priced} of ${results.length} searches came back with fares.`,
      { searched: results.length, priced },
    );

    context.state.status = "optimizing";
    const seed = findOptimalRoute(this.allResults(context), tripRequest);
    context.state.bestRoute = seed;
    this.syncBudget(context, seed);

    if (seed.legs.length === 0) return seed;

    this.emit("comparing", seed.reasoning, seed);
    this.emitLegQuotes(context, seed);

    const refined = await this.reason(context, tripRequest, seed);
    return refined ?? seed;
  }

  /** Qwen reasons over the collected data with tools; failures fall through. */
  private async reason(
    context: RunContext,
    tripRequest: TripRequest,
    seed: OptimizedRoute,
  ): Promise<OptimizedRoute | null> {
    const messages: QwenMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: buildPlanningPrompt({
          tripRequest,
          cities: context.cities,
          searchSummary: this.summarizeSearches(context),
          optimizerSummary: summarizeRoute(seed, tripRequest),
        }),
      },
    ];

    try {
      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        context.state.iterationCount = iteration + 1;
        const last = iteration === this.maxIterations - 1;

        const turn = await this.streamTurn(messages, true);
        messages.push(assistantMessage(turn.content, turn.toolCalls));

        if (turn.toolCalls.length === 0) {
          return this.parseFinalAnswer(context, tripRequest, seed, turn.content);
        }

        for (const call of turn.toolCalls) {
          const result = await this.executeTool(context, tripRequest, call);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }

        if (last) {
          // Out of tool budget: one last toolless turn so the run always ends
          // with an itinerary rather than a dangling tool call.
          messages.push({ role: "user", content: FORCE_FINAL_ANSWER_PROMPT });
          const closing = await this.streamTurn(messages, false);
          return this.parseFinalAnswer(context, tripRequest, seed, closing.content);
        }
      }
      return null;
    } catch (error) {
      this.emit(
        "error",
        `Model reasoning stopped (${describeError(error)}). Keeping the optimizer's route.`,
      );
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // LLM turn
  // -------------------------------------------------------------------------

  private async streamTurn(
    messages: QwenMessage[],
    withTools: boolean,
  ): Promise<{ content: string; toolCalls: ParsedToolCall[] }> {
    let content = "";
    let buffer = "";
    const announced = new Set<number>();

    const flush = (force: boolean) => {
      // Emit on sentence boundaries so the UI gets readable lines, not tokens.
      const boundary = Math.max(buffer.lastIndexOf(". "), buffer.lastIndexOf("\n"));
      if (!force && boundary < 24) return;
      const chunk = force ? buffer : buffer.slice(0, boundary + 1);
      buffer = force ? "" : buffer.slice(boundary + 1);
      const trimmed = chunk.trim();
      if (trimmed.length > 0) this.emit("thinking", trimmed);
    };

    const stream = this.provider.streamChat(
      messages,
      withTools ? AGENT_TOOLS : undefined,
      { temperature: 0.2 },
    );

    for await (const event of stream) {
      if (event.type === "content") {
        content += event.delta;
        buffer += event.delta;
        flush(false);
      } else if (event.type === "tool_call_delta") {
        if (event.name && !announced.has(event.index)) {
          announced.add(event.index);
          flush(true);
          this.emit("thinking", `Calling ${event.name}…`, { tool: event.name });
        }
      } else {
        flush(true);
        return { content, toolCalls: event.toolCalls };
      }
    }

    flush(true);
    return { content, toolCalls: [] };
  }

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------

  private async executeTool(
    context: RunContext,
    tripRequest: TripRequest,
    call: ParsedToolCall,
  ): Promise<unknown> {
    try {
      switch (call.name) {
        case "search_flights":
          return await this.toolSearchFlights(context, tripRequest, call.arguments);
        case "compare_routes":
          return await this.toolCompareRoutes(context, tripRequest, call.arguments);
        case "verify_price":
          return await this.toolVerifyPrice(context, call.arguments);
        case "calculate_budget":
          return this.toolCalculateBudget(context, call.arguments);
        case "suggest_alternatives":
          return await this.toolSuggestAlternatives(context, tripRequest, call.arguments);
        default:
          return { error: `Unknown tool "${call.name}".` };
      }
    } catch (error) {
      const message = describeError(error);
      this.emit("error", `${call.name} failed: ${message}`, { tool: call.name });
      return { error: message };
    }
  }

  private async toolSearchFlights(
    context: RunContext,
    tripRequest: TripRequest,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const origin = readAirport(args.origin);
    const destination = readAirport(args.destination);
    const date = normalizeDate(readString(args.date));
    if (!origin || !destination || date.length !== 8) {
      return { error: "search_flights needs origin, destination and a YYYYMMDD date." };
    }

    const cached = context.state.searchResults.get(searchKey(origin, destination, date));
    if (cached) return this.describeSearchResult(cached, true);

    if (context.searchesUsed >= MAX_ATLAS_SEARCHES) {
      return { error: "Search budget for this run is exhausted; decide with the data you have." };
    }

    this.emit("searching", `Pricing ${origin}→${destination} on ${date}…`, {
      origin,
      destination,
      date,
    });

    const result = await searchFlights({
      tripType: "1",
      adultNum: readAdults(args.adults, tripRequest.passengers),
      childNum: 0,
      infantNum: 0,
      fromCity: origin,
      toCity: destination,
      fromDate: date,
      currency: tripRequest.currency,
      includeMultipleFareFamily: true,
    });
    context.searchesUsed++;
    this.record(context, [result]);

    return this.describeSearchResult(result, false);
  }

  private async toolCompareRoutes(
    context: RunContext,
    tripRequest: TripRequest,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    // Price anything in the comparison we have not searched yet.
    const missing: SearchRequest[] = [];
    for (const entry of readArray(args.routes)) {
      const origin = readAirport(entry.origin);
      const destination = readAirport(entry.destination);
      const date = normalizeDate(readString(entry.date));
      if (!origin || !destination || date.length !== 8) continue;
      if (context.state.searchResults.has(searchKey(origin, destination, date))) continue;
      missing.push({
        tripType: "1",
        adultNum: Math.max(1, tripRequest.passengers),
        childNum: 0,
        infantNum: 0,
        fromCity: origin,
        toCity: destination,
        fromDate: date,
        currency: tripRequest.currency,
        includeMultipleFareFamily: true,
      });
    }
    if (missing.length > 0) {
      this.emit("searching", `Pricing ${missing.length} legs before comparing…`, {
        searches: missing.length,
      });
      await this.runSearches(context, missing.slice(0, MAX_SEARCHES_PER_TOOL_CALL));
    }

    context.state.status = "optimizing";
    const route = findOptimalRoute(this.allResults(context), tripRequest);
    if (route.legs.length === 0) {
      return { error: route.reasoning };
    }

    const previous = context.state.bestRoute;
    const improved =
      previous === null ||
      previous.legs.length === 0 ||
      route.totalCost < previous.totalCost;
    if (improved) {
      context.state.bestRoute = route;
      this.syncBudget(context, route);
    }

    this.emit("comparing", route.reasoning, route);
    if (improved) this.emitLegQuotes(context, route);

    const budget = readNumber(args.budget) ?? tripRequest.budget;
    return {
      order: [...route.legs.map((leg) => leg.origin), route.legs[0].origin],
      legs: route.legs.map((leg) => ({
        origin: leg.origin,
        destination: leg.destination,
        date: leg.date,
        price: leg.offer.totalPrice,
        routingIdentifier: leg.offer.routingIdentifier,
        stops: Math.max(0, leg.offer.fromSegments.length - 1),
        ...(leg.alternativeDate ? { insteadOf: leg.alternativeDate } : {}),
      })),
      totalCost: route.totalCost,
      currency: tripRequest.currency,
      passengers: Math.max(1, tripRequest.passengers),
      budget,
      withinBudget: route.totalCost <= budget,
      savingsVsBaseline: route.savings,
      combinationsEvaluated: route.alternativesConsidered,
      reasoning: route.reasoning,
    };
  }

  private async toolVerifyPrice(
    context: RunContext,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const routingIdentifier = readString(args.routingIdentifier);
    if (routingIdentifier.length === 0) {
      return { error: "verify_price needs a routingIdentifier from a search result." };
    }

    context.state.status = "verifying";
    const known = context.offers.get(routingIdentifier);
    this.emit(
      "thinking",
      known
        ? `Verifying ${known.result.origin}→${known.result.destination} on ${known.result.date} is still bookable…`
        : `Verifying ${routingIdentifier}…`,
      { routingIdentifier },
    );

    const verification = await verifyFare(routingIdentifier, known?.offer.totalPrice);
    if (verification.priceChanged && verification.newPrice !== undefined && known) {
      const delta = verification.newPrice - known.offer.totalPrice;
      this.emit(
        "result",
        `Price moved ${delta > 0 ? "up" : "down"} by ${formatCurrency(
          Math.abs(delta),
          known.offer.currency,
        )} on ${known.result.origin}→${known.result.destination}.`,
        verification,
      );
    }

    return {
      routingIdentifier,
      ...verification,
      quotedPrice: known?.offer.totalPrice,
    };
  }

  private toolCalculateBudget(
    context: RunContext,
    args: Record<string, unknown>,
  ): unknown {
    const total = readNumber(args.totalBudget) ?? context.budget.totalBudget;
    const spent = Math.max(0, readNumber(args.spentSoFar) ?? context.budget.getSpent());
    const remainingLegs = Math.max(0, Math.round(readNumber(args.remainingLegs) ?? 0));
    const remaining = Math.round((total - spent) * 100) / 100;
    const perLeg =
      remainingLegs > 0 ? Math.round((remaining / remainingLegs) * 100) / 100 : remaining;

    context.state.budgetRemaining = remaining;

    return {
      currency: context.budget.currency,
      totalBudget: total,
      spentSoFar: spent,
      remaining,
      remainingLegs,
      perLegAllowance: perLeg,
      withinBudget: remaining >= 0,
      currentPlan: context.budget.getSummary(),
    };
  }

  private async toolSuggestAlternatives(
    context: RunContext,
    tripRequest: TripRequest,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const origin = readAirport(args.origin);
    const destination = readAirport(args.destination);
    const originalDate = normalizeDate(readString(args.originalDate));
    if (!origin || !destination || originalDate.length !== 8) {
      return {
        error: "suggest_alternatives needs origin, destination and a YYYYMMDD originalDate.",
      };
    }
    const flexDays = Math.max(
      1,
      Math.min(7, Math.round(readNumber(args.flexDays) ?? tripRequest.flexDays)),
    );

    // Nearby dates on the same pair, plus the same date from/to nearby airports.
    const pairs: Array<{ origin: string; destination: string; date: string }> = [
      ...generateDateVariants(originalDate, flexDays).map((date) => ({
        origin,
        destination,
        date,
      })),
      ...getAlternatives(origin)
        .slice(0, 1)
        .map((airport) => ({ origin: airport.iata, destination, date: originalDate })),
      ...getAlternatives(destination)
        .slice(0, 1)
        .map((airport) => ({ origin, destination: airport.iata, date: originalDate })),
    ];

    const searches = pairs
      .filter(
        (pair) =>
          !context.state.searchResults.has(
            searchKey(pair.origin, pair.destination, pair.date),
          ),
      )
      .slice(0, MAX_SEARCHES_PER_TOOL_CALL)
      .map((pair) => ({
        tripType: "1" as const,
        adultNum: Math.max(1, tripRequest.passengers),
        childNum: 0,
        infantNum: 0,
        fromCity: pair.origin,
        toCity: pair.destination,
        fromDate: pair.date,
        currency: tripRequest.currency,
        includeMultipleFareFamily: true,
      }));

    if (searches.length > 0) {
      this.emit(
        "searching",
        `Sweeping ${searches.length} alternatives for ${origin}→${destination}…`,
        { origin, destination, searches: searches.length },
      );
      await this.runSearches(context, searches);
    }

    const baseline = context.state.searchResults.get(
      searchKey(origin, destination, originalDate),
    );
    const baselinePrice = baseline?.offers[0]?.totalPrice;

    const options = pairs
      .map((pair) =>
        context.state.searchResults.get(
          searchKey(pair.origin, pair.destination, pair.date),
        ),
      )
      .filter((result): result is SearchResult => result !== undefined && result.offers.length > 0)
      .map((result) => {
        const cheapest = result.offers[0];
        return {
          origin: result.origin,
          destination: result.destination,
          date: result.date,
          price: cheapest.totalPrice,
          routingIdentifier: cheapest.routingIdentifier,
          stops: Math.max(0, cheapest.fromSegments.length - 1),
          differentAirport: result.origin !== origin || result.destination !== destination,
          savingsVsOriginal:
            baselinePrice === undefined
              ? undefined
              : Math.round((baselinePrice - cheapest.totalPrice) * 100) / 100,
        };
      })
      .sort((a, b) => a.price - b.price)
      .slice(0, 8);

    return {
      leg: `${origin}→${destination}`,
      originalDate,
      originalPrice: baselinePrice,
      flexDays,
      options,
      note:
        options.length === 0
          ? "No alternative date or nearby airport returned fares for this leg."
          : `Cheapest alternative is ${options[0].date} at ${options[0].price} ${tripRequest.currency}.`,
    };
  }

  // -------------------------------------------------------------------------
  // Final answer
  // -------------------------------------------------------------------------

  /**
   * Turn the model's closing message into an OptimizedRoute. The itinerary is
   * only accepted when every leg maps back to a real searched offer and the
   * minimum stay holds — otherwise the optimizer's route stands and only the
   * model's prose is kept.
   */
  private parseFinalAnswer(
    context: RunContext,
    tripRequest: TripRequest,
    seed: OptimizedRoute,
    content: string,
  ): OptimizedRoute {
    const best = context.state.bestRoute ?? seed;
    const parsed = extractJsonObject(content);
    const prose = stripJsonBlocks(content);

    const legs: RouteLeg[] = [];
    for (const entry of readArray(parsed?.legs)) {
      const routingIdentifier = readString(entry.routingIdentifier);
      const known = context.offers.get(routingIdentifier);
      if (!known) break;
      legs.push({
        origin: known.result.origin,
        destination: known.result.destination,
        date: normalizeDate(known.result.date),
        offer: known.offer,
      });
    }

    const minStay = calculateMinStay(context.cities.length);
    const validLength = legs.length === context.cities.length;
    const validOrder = legs.every(
      (leg, i) => i === 0 || daysBetween(legs[i - 1].date, leg.date) >= minStay,
    );
    const connected = legs.every(
      (leg, i) => i === 0 || legs[i - 1].destination === leg.origin,
    );

    if (!validLength || !validOrder || !connected) {
      if (parsed?.legs !== undefined) {
        this.emit(
          "thinking",
          "The model's itinerary did not map back to verified offers, so the optimizer's route stands.",
        );
      }
      return prose.length > 0 ? { ...best, reasoning: prose } : best;
    }

    const passengers = Math.max(1, tripRequest.passengers);
    const scored = scoreRoute(legs);
    const totalCost = Math.round(scored.totalCost * passengers * 100) / 100;
    // best.totalCost + best.savings is the baseline the optimizer measured against.
    const baseline = best.totalCost + best.savings;
    const reasoning = readString(parsed?.reasoning) || prose || best.reasoning;

    const route: OptimizedRoute = {
      legs: legs.map((leg, i) => ({
        ...leg,
        ...pickShiftMetadata(best.legs[i], leg),
      })),
      totalCost,
      savings: Math.max(0, Math.round((baseline - totalCost) * 100) / 100),
      reasoning,
      alternativesConsidered: best.alternativesConsidered,
    };

    context.state.bestRoute = route;
    this.syncBudget(context, route);
    this.emit("result", `Final itinerary agreed: ${describeLegs(route.legs)}`, route);
    this.emitLegQuotes(context, route);
    return route;
  }

  // -------------------------------------------------------------------------
  // Shared helpers
  // -------------------------------------------------------------------------

  /** Run searches under the per-run cap and file the results into state. */
  private async runSearches(
    context: RunContext,
    searches: SearchRequest[],
  ): Promise<SearchResult[]> {
    const pending = searches
      .filter(
        (search) =>
          !context.state.searchResults.has(
            searchKey(search.fromCity, search.toCity, search.fromDate),
          ),
      )
      .slice(0, Math.max(0, MAX_ATLAS_SEARCHES - context.searchesUsed));
    if (pending.length === 0) return [];

    const results = await batchSearch(pending);
    context.searchesUsed += pending.length;
    this.record(context, results);
    return results;
  }

  private record(context: RunContext, results: SearchResult[]): void {
    for (const result of results) {
      context.state.searchResults.set(
        searchKey(result.origin, result.destination, normalizeDate(result.date)),
        result,
      );
      for (const offer of result.offers) {
        context.offers.set(offer.routingIdentifier, { offer, result });
      }
    }
  }

  private allResults(context: RunContext): SearchResult[] {
    return [...context.state.searchResults.values()];
  }

  /**
   * Publish the fares behind a chosen route, one event per leg: the offers that
   * actually came back on the date the optimizer picked, cheapest-first with the
   * chosen fare leading. This is what lets a consumer show the shortlist it was
   * choosing between rather than just the winner.
   */
  private emitLegQuotes(context: RunContext, route: OptimizedRoute): void {
    for (const leg of route.legs) {
      const date = normalizeDate(leg.date);
      const signature = `${leg.origin}-${leg.destination}-${date}-${leg.offer.totalPrice}`;
      if (context.quoted.has(signature)) continue;
      context.quoted.add(signature);

      const searched =
        context.state.searchResults.get(searchKey(leg.origin, leg.destination, date))
          ?.offers ?? [];
      // Chosen fare first — the optimizer may pay a little over the cheapest to
      // avoid a long layover or a red-eye.
      const offers = [
        leg.offer,
        ...searched.filter(
          (offer) => offer.routingIdentifier !== leg.offer.routingIdentifier,
        ),
      ].slice(0, OFFERS_IN_LEG_QUOTE);
      const avgPrice =
        searched.length > 0
          ? Math.round(
              (searched.reduce((sum, offer) => sum + offer.totalPrice, 0) /
                searched.length) *
                100,
            ) / 100
          : undefined;

      const currency = leg.offer.currency;
      const detail = [
        `${searched.length || offers.length} fares on ${leg.origin}→${leg.destination} for ${date}`,
        `taking ${formatCurrency(leg.offer.totalPrice, currency)}`,
        avgPrice !== undefined
          ? `against a ${formatCurrency(avgPrice, currency)} average`
          : null,
        leg.savings
          ? `after shifting off ${leg.alternativeDate} for ${formatCurrency(leg.savings, currency)}`
          : null,
      ]
        .filter((part): part is string => part !== null)
        .join(", ");

      this.emit("result", `${detail}.`, {
        origin: leg.origin,
        destination: leg.destination,
        date,
        offers,
        cheapestPrice: leg.offer.totalPrice,
        avgPrice,
      });
    }
  }

  /** Mirror a route into the budget tracker so calculate_budget stays honest. */
  private syncBudget(context: RunContext, route: OptimizedRoute): void {
    context.budget.reset();
    context.budget.setPlannedLegs(Math.max(1, route.legs.length));
    const passengers = Math.max(1, context.state.tripRequest.passengers);

    for (const leg of route.legs) {
      const amount = leg.offer.totalPrice * passengers;
      const label = `${leg.origin}→${leg.destination} ${leg.date}`;
      if (!context.budget.spend(amount, label)) {
        this.emit(
          "thinking",
          `${label} at ${formatCurrency(amount, context.budget.currency)} does not fit the remaining ` +
            `${formatCurrency(context.budget.getRemaining(), context.budget.currency)}.`,
        );
        break;
      }
    }
    context.state.budgetRemaining = context.budget.getRemaining();
  }

  private describeSearchResult(result: SearchResult, cached: boolean): unknown {
    return {
      origin: result.origin,
      destination: result.destination,
      date: normalizeDate(result.date),
      cached,
      offerCount: result.offers.length,
      offers: result.offers.slice(0, OFFERS_IN_TOOL_RESULT).map((offer) => ({
        routingIdentifier: offer.routingIdentifier,
        totalPrice: offer.totalPrice,
        currency: offer.currency,
        carrier: offer.fromSegments[0]?.carrier ?? "",
        flightNumbers: offer.fromSegments.map(
          (segment) => `${segment.carrier}${segment.flightNumber}`,
        ),
        depTime: offer.fromSegments[0]?.depTime ?? "",
        arrTime: offer.fromSegments[offer.fromSegments.length - 1]?.arrTime ?? "",
        stops: Math.max(0, offer.fromSegments.length - 1),
        checkedBaggage: offer.baggageElements.some(
          (element) => element.baggagePiece > 0 || element.baggageWeight > 0,
        ),
        refundable: offer.refundable,
      })),
      ...(result.offers.length === 0
        ? { note: "No fares on this date — try another date or a nearby airport." }
        : {}),
    };
  }

  /** Compact per-pair price table handed to the model in the opening prompt. */
  private summarizeSearches(context: RunContext): string {
    const byPair = new Map<string, Array<{ date: string; price: number; id: string }>>();
    for (const result of this.allResults(context)) {
      const cheapest = result.offers[0];
      if (!cheapest) continue;
      const key = `${result.origin}→${result.destination}`;
      const rows = byPair.get(key) ?? [];
      rows.push({
        date: normalizeDate(result.date),
        price: cheapest.totalPrice,
        id: cheapest.routingIdentifier,
      });
      byPair.set(key, rows);
    }
    if (byPair.size === 0) return "No priced legs came back from Atlas.";

    const lines = [...byPair.entries()].map(([pair, rows]) => {
      const cheapest = Math.min(...rows.map((row) => row.price));
      const dates = rows
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(
          (row) =>
            `${row.date} ${row.price}${row.price === cheapest ? "*" : ""} [${row.id}]`,
        )
        .join(", ");
      return `- ${pair}: ${dates}`;
    });
    return [
      `Cheapest fare per date, per leg (* = cheapest date for that leg, [] = routingIdentifier):`,
      ...lines,
    ].join("\n");
  }

  private emit(type: AgentEvent["type"], content: string, data?: unknown): void {
    try {
      this.onEvent({ type, content, data, timestamp: Date.now() });
    } catch (error) {
      // A broken consumer must not take the planning run down with it.
      console.error("[Agent] event callback threw:", describeError(error));
    }
  }
}

/** Convenience wrapper for the API route. */
export async function runAgent(
  tripRequest: TripRequest,
  onEvent: AgentEventCallback,
): Promise<OptimizedRoute> {
  return new BudgetWingAgent(onEvent).run(tripRequest);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function emptyRoute(reasoning: string): OptimizedRoute {
  return { legs: [], totalCost: 0, savings: 0, reasoning, alternativesConsidered: 0 };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeRequest(tripRequest: TripRequest, cities: string[]): string {
  const names = cities.map((city) => airportLabel(city)).join(" → ");
  return (
    `${formatCurrency(tripRequest.budget, tripRequest.currency)} for ` +
    `${tripRequest.passengers} pax, ${names || "no recognised cities"}, ` +
    `${tripRequest.startDate} to ${tripRequest.endDate} ±${tripRequest.flexDays}d`
  );
}

function describeLegs(legs: RouteLeg[]): string {
  return legs
    .map((leg) => `${leg.origin}→${leg.destination} ${leg.date}`)
    .join(", ");
}

function summarizeRoute(route: OptimizedRoute, tripRequest: TripRequest): string {
  if (route.legs.length === 0) return route.reasoning;
  const lines = route.legs.map(
    (leg) =>
      `- ${leg.origin}→${leg.destination} on ${leg.date}: ${leg.offer.totalPrice} ` +
      `${leg.offer.currency} [${leg.offer.routingIdentifier}]` +
      (leg.alternativeDate ? ` (shifted from ${leg.alternativeDate})` : ""),
  );
  return [
    ...lines,
    `Total ${route.totalCost} ${tripRequest.currency} for ${tripRequest.passengers} pax ` +
      `(${route.alternativesConsidered} combinations evaluated, ${route.savings} below baseline).`,
    `Reasoning: ${route.reasoning}`,
  ].join("\n");
}

/** Carry the optimizer's date-shift annotation onto a matching model leg. */
function pickShiftMetadata(
  reference: RouteLeg | undefined,
  leg: RouteLeg,
): Partial<RouteLeg> {
  if (
    !reference ||
    reference.origin !== leg.origin ||
    reference.destination !== leg.destination ||
    reference.date !== leg.date
  ) {
    return {};
  }
  return {
    ...(reference.alternativeDate ? { alternativeDate: reference.alternativeDate } : {}),
    ...(reference.savings ? { savings: reference.savings } : {}),
  };
}

function assistantMessage(
  content: string,
  toolCalls: ParsedToolCall[],
): QwenMessage {
  const calls: QwenToolCall[] = toolCalls.map((call) => ({
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: call.rawArguments },
  }));
  return {
    role: "assistant",
    content,
    ...(calls.length > 0 ? { tool_calls: calls } : {}),
  };
}

// --- loose value readers (tool arguments and model JSON are untrusted) ------

function readString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

function readAdults(value: unknown, fallback: number): number {
  const adults = readNumber(value) ?? fallback;
  return Math.max(1, Math.min(9, Math.round(adults)));
}

/** Model may pass a city name where an IATA code belongs. */
function readAirport(value: unknown): string | undefined {
  const raw = readString(value);
  return raw.length === 0 ? undefined : resolveCity(raw) ?? raw.toUpperCase();
}

/** Last balanced JSON object in the text, preferring a ```json fence. */
function extractJsonObject(content: string): Record<string, unknown> | null {
  const fenced = [...content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
    .map((match) => match[1].trim())
    .filter((block) => block.startsWith("{"));

  for (const candidate of [...fenced.reverse(), ...balancedObjects(content).reverse()]) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function balancedObjects(content: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (content[i] === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) objects.push(content.slice(start, i + 1));
    }
  }
  return objects;
}

function stripJsonBlocks(content: string): string {
  return content
    .replace(/```(?:json)?[\s\S]*?```/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
