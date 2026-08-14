import type { AgentEvent } from "@agent/core/types";
import type {
  AgentMessage,
  FlightOffer,
  FlightSegment,
  OptimizedRoute,
  RouteLeg,
  TripRequest,
} from "@shared/types";

/**
 * Translates the agent's internal event stream into the `AgentMessage` frames
 * the UI consumes.
 *
 * Two things need reconciling. The agent speaks Atlas dates (`YYYYMMDD`) while
 * every formatter in `app/lib/format.ts` expects ISO (`YYYY-MM-DD`), and the
 * agent has one extra event type (`comparing`) plus narration frames that carry
 * counters rather than fares. Anything that is not a real per-leg quote or the
 * final itinerary is therefore forwarded as `thinking`, which keeps the chat
 * trace readable without the offer parsing in `useAgent` ever seeing a frame it
 * cannot use.
 */

type Send = (message: AgentMessage) => boolean;

// ---------------------------------------------------------------------------
// Shape normalisation
// ---------------------------------------------------------------------------

/** `20261110` or `2026-11-10T00:00:00Z` → `2026-11-10`. */
export function isoDate(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return value;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * Segment times reach us in whatever shape Atlas used: `202611100835`,
 * `2026-11-10 08:35` or already-ISO. `clockTime` only needs an `HH:MM` in
 * there, so anything that already has one is left alone.
 */
function isoStamp(value: string | undefined): string {
  if (!value) return "";
  if (/\d{2}:\d{2}/.test(value)) return value.replace(" ", "T");
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 12) {
    return `${isoDate(digits)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}`;
  }
  return value;
}

function normalizeSegment(segment: FlightSegment): FlightSegment {
  return {
    ...segment,
    depTime: isoStamp(segment.depTime),
    arrTime: isoStamp(segment.arrTime),
  };
}

function normalizeOffer(offer: FlightOffer): FlightOffer {
  return {
    ...offer,
    fromSegments: offer.fromSegments.map(normalizeSegment),
    ...(offer.retSegments
      ? { retSegments: offer.retSegments.map(normalizeSegment) }
      : {}),
  };
}

function normalizeLeg(leg: RouteLeg): RouteLeg {
  return {
    ...leg,
    date: isoDate(leg.date),
    ...(leg.alternativeDate ? { alternativeDate: isoDate(leg.alternativeDate) } : {}),
    offer: normalizeOffer(leg.offer),
  };
}

export function normalizeRoute(route: OptimizedRoute): OptimizedRoute {
  return { ...route, legs: route.legs.map(normalizeLeg) };
}

/** Cities in visiting order — the closing hop home is implied by the UI. */
function orderOf(route: OptimizedRoute): string[] {
  return route.legs.map((leg) => leg.origin);
}

// ---------------------------------------------------------------------------
// Event payload readers (the agent types `data` as `any` by design)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A route-shaped payload, i.e. `comparing` / `complete` / final-answer data. */
function asRoute(data: unknown): OptimizedRoute | null {
  if (!isRecord(data) || !Array.isArray(data.legs)) return null;
  const legs = data.legs.filter(
    (leg): leg is RouteLeg => isRecord(leg) && isRecord(leg.offer),
  );
  if (legs.length === 0) return null;
  return {
    legs,
    totalCost: typeof data.totalCost === "number" ? data.totalCost : 0,
    savings: typeof data.savings === "number" ? data.savings : 0,
    reasoning: typeof data.reasoning === "string" ? data.reasoning : "",
    alternativesConsidered:
      typeof data.alternativesConsidered === "number"
        ? data.alternativesConsidered
        : 0,
  };
}

/** A per-leg quote payload: the fares that came back for one origin/dest/date. */
function asQuote(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) return null;
  if (!Array.isArray(data.offers)) return null;
  if (typeof data.origin !== "string" || typeof data.destination !== "string") {
    return null;
  }
  return data;
}

function asLegRef(
  data: unknown,
): { origin: string; destination: string; date: string } | null {
  if (!isRecord(data)) return null;
  const { origin, destination, date } = data;
  if (typeof origin !== "string" || typeof destination !== "string") return null;
  return { origin, destination, date: isoDate(date) };
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

export class FrontendBridge {
  private completed = false;
  /** Set once the UI has seen an itinerary, which makes later errors advisory. */
  private published = false;
  private lastError: string | null = null;

  constructor(
    private readonly request: TripRequest,
    private readonly send: Send,
  ) {}

  /** Why the run came up empty, if it did — the last error the agent reported. */
  get failure(): string | null {
    return this.lastError;
  }

  handle(event: AgentEvent): void {
    switch (event.type) {
      case "thinking":
        this.forward("thinking", event.content, pickOrder(event.data));
        return;

      case "searching": {
        // Per-leg searches drive the map's active arc; the batch-level
        // "pricing 48 legs" frames have no leg to point at.
        const leg = asLegRef(event.data);
        if (leg) this.forward("searching", event.content, leg);
        else this.forward("thinking", event.content);
        return;
      }

      case "comparing": {
        const route = asRoute(event.data);
        this.forward(
          "thinking",
          event.content,
          route ? { order: orderOf(route) } : undefined,
        );
        if (route) this.published = true;
        return;
      }

      case "result": {
        const quote = asQuote(event.data);
        if (quote) {
          this.forward("result", event.content, {
            ...quote,
            date: isoDate(quote.date),
            offers: (quote.offers as FlightOffer[]).map(normalizeOffer),
          });
          return;
        }
        // Verification notes and search counters: narration, not fares.
        this.forward("thinking", event.content);
        return;
      }

      case "complete": {
        const route = asRoute(event.data);
        if (!route) {
          this.forward("thinking", event.content);
          return;
        }
        this.publishRoute(route, event.content);
        return;
      }

      case "error":
        this.lastError = event.content;
        // A tool or the model failing mid-run is recoverable — the optimizer's
        // route still lands — so it stays in the trace instead of raising the
        // retry banner. `finish` promotes it if no itinerary ever arrives.
        if (this.published) this.forward("thinking", event.content);
        return;
    }
  }

  /**
   * Publishes whatever the run ended with. The agent normally emits its own
   * `complete`, so this only has to cover the paths that end without one.
   * Returns `false` when there is no itinerary to show, leaving it to the caller
   * to decide between falling back and failing the request.
   */
  finish(route: OptimizedRoute | null): boolean {
    if (this.completed) return true;

    if (route && route.legs.length > 0) {
      this.publishRoute(normalizeRoute(route), route.reasoning);
      return true;
    }

    return false;
  }

  private publishRoute(route: OptimizedRoute, fallbackContent: string): void {
    const normalized = normalizeRoute(route);
    this.completed = true;
    this.published = true;

    this.send({
      type: "complete",
      content: normalized.reasoning || fallbackContent,
      data: {
        route: normalized,
        order: orderOf(normalized),
        budget: this.request.budget,
        currency: this.request.currency,
        // What the itinerary was measured against — the UI shows it as the
        // market baseline the optimizer beat.
        baselineCost: Math.round(normalized.totalCost + normalized.savings),
        passengers: this.request.passengers,
      },
      timestamp: Date.now(),
    });
  }

  private forward(
    type: AgentMessage["type"],
    content: string,
    data?: unknown,
  ): void {
    if (content.trim().length === 0) return;
    this.send({ type, content, data, timestamp: Date.now() });
  }
}

/** Only `order` is meaningful to the UI on a thinking frame. */
function pickOrder(data: unknown): { order: string[] } | undefined {
  if (!isRecord(data) || !Array.isArray(data.order)) return undefined;
  const order = data.order.filter((code): code is string => typeof code === "string");
  return order.length > 0 ? { order } : undefined;
}
