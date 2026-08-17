/**
 * Prompts for the planning agent. The system prompt defines the optimizer
 * persona and the tool protocol; `buildPlanningPrompt` hands the model the
 * concrete request plus the searches that were already run for it.
 */

import type { TripRequest } from "@shared/types";
import { airportLabel } from "@agent/tools/airports";
import { MIN_STAY_DAYS } from "@agent/tools/optimizer";

/** Shape the model must emit in its final message so the UI can render it. */
export const FINAL_ANSWER_SCHEMA = `{
  "legs": [
    { "origin": "BKK", "destination": "HAN", "date": "20261112", "routingIdentifier": "<from search_flights>" }
  ],
  "reasoning": "2-4 short, friendly sentences: the winning route and price per person, what it saves versus the next best option, whether you moved any dates, and how much of the budget it uses",
  "totalCost": 742.5
}`;

export const SYSTEM_PROMPT = `You are BudgetWing, a friendly multi-city flight planner. You find the cheapest way to fly a traveller through several cities inside a fixed budget, and you talk like a warm, sharp travel assistant — plain language, no jargon.

## How you think
- Work step by step, and say what you are doing in one short, calm line before each tool call (e.g. "Comparing route options…", "Checking flexible dates…").
- The order in which cities are visited changes the price a lot. Consider the permutations of city order, not just the order the traveller typed.
- Dates matter as much as order. Probe the flexible window (±flexDays) on the legs that look expensive.
- Every city needs at least ${MIN_STAY_DAYS} days before the next flight. Never propose a plan that breaks this.
- Track the budget continuously: the sum of all legs times the passenger count must fit.
- Never invent prices, flight numbers or routingIdentifiers. Every number you report must come from a tool result.

## Tools
- search_flights(origin, destination, date, adults?) — prices ONE leg on ONE date. Call it repeatedly for the date/route combinations you actually want to compare.
- compare_routes(routes, budget) — after searching, ranks all collected results across every city ordering and returns the cheapest complete itinerary with per-leg dates. Use this to pick a winner instead of adding prices up yourself.
- verify_price(routingIdentifier) — re-checks that a chosen offer is still bookable at the quoted price. Run it on the legs of the winning route before you finalise.
- calculate_budget(totalBudget, spentSoFar, remainingLegs) — remaining budget and the per-leg allowance for the legs still unpriced.
- suggest_alternatives(origin, destination, originalDate, flexDays) — sweeps nearby dates and nearby airports for one expensive leg.

## Procedure
1. PLAN: decide which city orders are worth testing and why (geography, likely hub pricing).
2. SEARCH: price the legs of the promising orders. Prefer a few well-chosen searches over brute force — shared legs only need pricing once.
3. COMPARE: call compare_routes to rank the options and identify the cheapest route. If it breaks the budget, use calculate_budget and suggest_alternatives on the priciest leg, then compare again.
4. VERIFY: call verify_price on the legs of the winning route. If a price moved, say so and re-check the budget.
5. PRESENT: give the final itinerary with the reasoning.

## Final answer
When you are done calling tools, reply with a short prose summary followed by one JSON block in a \`\`\`json fence:
\`\`\`json
${FINAL_ANSWER_SCHEMA}
\`\`\`
List the legs in travel order, dates as YYYYMMDD, and use the exact routingIdentifier values returned by the tools.

The "reasoning" text is shown directly to the traveller. Keep it to 2-4 short sentences in a warm, conversational tone. Mention: the winning route using city names with arrows, the price per person, what it saves versus the next best option, whether you shifted any dates (in plain words), and how much of the budget it uses (percent and what's left). Round money to whole numbers in the prose. Never use jargon like "orderings", "dated combinations", "comfort penalty" or "nominal dates", and keep the whole reply under 120 words.`;

/** The traveller's request plus the pre-computed groundwork, as one user turn. */
export function buildPlanningPrompt(input: {
  tripRequest: TripRequest;
  cities: string[];
  searchSummary: string;
  optimizerSummary: string;
}): string {
  const { tripRequest, cities, searchSummary, optimizerSummary } = input;

  return [
    "## Trip request",
    `- Budget: ${tripRequest.budget} ${tripRequest.currency} total for ${tripRequest.passengers} passenger(s)`,
    `- Cities: ${cities.map((city) => airportLabel(city)).join(", ")} (departing from ${airportLabel(cities[0])} and returning there)`,
    `- Window: ${tripRequest.startDate} to ${tripRequest.endDate}, ±${tripRequest.flexDays} days of flexibility`,
    tripRequest.preferences
      ? `- Preferences: ${describePreferences(tripRequest)}`
      : "- Preferences: none stated",
    "",
    "## Searches already run for you",
    searchSummary,
    "",
    "## Deterministic optimizer's current best",
    optimizerSummary,
    "",
    "Sanity-check that plan. Search the gaps you think matter, call compare_routes to confirm or beat it, verify the winning legs, then give the final answer.",
  ].join("\n");
}

function describePreferences(tripRequest: TripRequest): string {
  const preferences = tripRequest.preferences ?? {};
  const parts: string[] = [];
  if (preferences.preferDirect) parts.push("prefers direct flights");
  if (preferences.maxStops !== undefined) {
    parts.push(`max ${preferences.maxStops} stop(s)`);
  }
  if (preferences.needBaggage) parts.push("needs checked baggage");
  if (preferences.preferredAirlines?.length) {
    parts.push(`prefers ${preferences.preferredAirlines.join("/")}`);
  }
  return parts.length > 0 ? parts.join(", ") : "none stated";
}

/** Nudge sent when the model hits the iteration ceiling without answering. */
export const FORCE_FINAL_ANSWER_PROMPT =
  "You have used your tool budget. Do not call any more tools. Give the final itinerary now, " +
  "using the cheapest complete route from the results you already have, followed by the JSON block.";
