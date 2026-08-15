/**
 * Shared bot pipeline: free text → TripRequest → agent run → formatted summary
 * plus the two PNG cards. Both the Telegram and Discord bots drive this, so
 * the planning behaviour stays identical across channels.
 */

import type { OptimizedRoute, TripRequest } from "../../shared/types";
import { parseTripRequest } from "../../app/lib/parse";
import { runAgent } from "../core/agent";
import type { AgentEvent } from "../core/types";
import { airportLabel } from "../tools/airports";
import { formatCurrency } from "../tools/budget";
import { renderItineraryCardPNG, renderRouteMapPNG } from "./render";

export interface BotReply {
  text: string;
  /** [0] route map, [1] itinerary card — may be empty if rendering failed. */
  images: Buffer[];
}

const USAGE = [
  "I plan multi-city trips around a budget. Tell me the money, the cities and rough dates, e.g.:",
  "",
  `"I have $850, want to visit Bangkok, Hanoi and Bali, Nov 10-22, ±3 days"`,
  "",
  "I need at least: a budget, two or more cities, and a date range.",
].join("\n");

/** Strip channel noise (prefix commands, bot mentions) before parsing. */
function cleanInput(text: string): string {
  return text
    .replace(/^\s*\/start\s*/i, "")
    .replace(/^\s*!trip\s*/i, "")
    .replace(/^\s*\/trip\s*/i, "")
    .replace(/@\w+/g, " ")
    .trim();
}

function describeMissing(missing: ("budget" | "cities" | "dates")[]): string {
  const labels: Record<(typeof missing)[number], string> = {
    budget: "a budget (e.g. $850)",
    cities: "at least two cities",
    dates: "a date range (e.g. Nov 10-22)",
  };
  return `I could not work out ${missing.map((m) => labels[m]).join(" or ")} from that.`;
}

/** Map agent events to the short progress lines the bots publish. */
function progressFor(event: AgentEvent): string | null {
  switch (event.type) {
    case "searching":
      return `🔎 ${event.content}`;
    case "comparing":
      return "⚖️ Comparing route combinations…";
    case "result":
      return `✅ ${event.content}`;
    case "error":
      return `⚠️ ${event.content}`;
    case "thinking":
      // The model's running commentary is too chatty for chat channels.
      return null;
    default:
      return null;
  }
}

function formatSummary(route: OptimizedRoute, request: TripRequest): string {
  const currency = request.currency;
  const lines: string[] = [];

  lines.push("✈️ Your optimized itinerary:");
  lines.push("");
  route.legs.forEach((leg, i) => {
    const carrier = leg.offer.fromSegments[0];
    const stops = Math.max(0, leg.offer.fromSegments.length - 1);
    lines.push(
      `${i + 1}. ${airportLabel(leg.origin)} → ${airportLabel(leg.destination)} · ${leg.date}` +
        ` · ${formatCurrency(leg.offer.totalPrice, currency)}` +
        (carrier ? ` · ${carrier.carrier}${carrier.flightNumber}` : "") +
        (stops > 0 ? ` · ${stops} stop${stops > 1 ? "s" : ""}` : " · nonstop") +
        (leg.alternativeDate ? ` (shifted from ${leg.alternativeDate})` : ""),
    );
  });

  lines.push("");
  lines.push(
    `💰 Total: ${formatCurrency(route.totalCost, currency)} of your ${formatCurrency(request.budget, currency)} budget`,
  );
  if (route.savings > 0) {
    lines.push(`💚 Savings: ${formatCurrency(route.savings, currency)} below the baseline fares`);
  }
  lines.push(`🧮 ${route.alternativesConsidered} route combinations evaluated`);
  if (route.reasoning) {
    const reasoning = route.reasoning.replace(/\s+/g, " ").trim();
    lines.push("");
    lines.push(
      reasoning.length > 500 ? `Why: ${reasoning.slice(0, 500)}…` : `Why: ${reasoning}`,
    );
  }
  return lines.join("\n");
}

/**
 * Full pipeline for one chat message. `onProgress` receives intermediate
 * status lines; the bots decide how (and how often) to publish them.
 */
export async function handleTripRequest(
  text: string,
  onProgress: (message: string) => void,
): Promise<BotReply> {
  const input = cleanInput(text);
  if (input.length === 0) {
    return { text: USAGE, images: [] };
  }

  const parsed = parseTripRequest(input);
  if (parsed.missing.length > 0) {
    return {
      text: `${describeMissing(parsed.missing)}\n\n${USAGE}`,
      images: [],
    };
  }

  const request = parsed.request;
  onProgress(
    `🗺️ Planning for ${request.cities.join(" → ")} · ${request.startDate} to ${request.endDate} · budget ${formatCurrency(request.budget, request.currency)}`,
  );

  let route: OptimizedRoute;
  try {
    route = await runAgent(request, (event) => {
      const progress = progressFor(event);
      if (progress) onProgress(progress);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      text: `⚠️ Planning failed: ${message}\n\n${USAGE}`,
      images: [],
    };
  }

  if (route.legs.length === 0) {
    return {
      text: `⚠️ ${route.reasoning || "No route could be found for that request."}\n\nTry different cities or dates.\n\n${USAGE}`,
      images: [],
    };
  }

  const images: Buffer[] = [];
  try {
    images.push(await renderRouteMapPNG(route, request));
    images.push(await renderItineraryCardPNG(route, request));
  } catch (error) {
    // A rendering hiccup should not swallow a perfectly good plan.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Bots] image rendering failed:", message);
  }

  return { text: formatSummary(route, request), images };
}
