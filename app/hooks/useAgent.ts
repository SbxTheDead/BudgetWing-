"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentMessage,
  FlightOffer,
  OptimizedRoute,
  TripRequest,
} from "@shared/types";
import { getCity } from "@/app/lib/cities";
import { parseTripRequest } from "@/app/lib/parse";

export interface ChatItem {
  id: string;
  role: "user" | "agent";
  kind: "text" | "thinking" | "search" | "offers" | "summary" | "error";
  content: string;
  timestamp: number;
  offers?: FlightOffer[];
  leg?: {
    origin: string;
    destination: string;
    date: string;
    avgPrice?: number;
    cheapestPrice?: number;
    altDate?: string;
    altSavings?: number;
  };
  route?: OptimizedRoute;
}

export type LegStatus = "searching" | "quoted" | "locked";

export interface LegState {
  origin: string;
  destination: string;
  date: string;
  status: LegStatus;
  price?: number;
  avgPrice?: number;
  altDate?: string;
  altSavings?: number;
}

export interface TripState {
  budget: number;
  currency: string;
  passengers: number;
  cities: string[];
  order: string[];
  legs: LegState[];
  activeLeg: { origin: string; destination: string } | null;
  route: OptimizedRoute | null;
  baselineCost: number;
}

const EMPTY_TRIP: TripState = {
  budget: 0,
  currency: "USD",
  passengers: 1,
  cities: [],
  order: [],
  legs: [],
  activeLeg: null,
  route: null,
  baselineCost: 0,
};

const MAX_ATTEMPTS = 2;

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Legs are keyed by city pair and merged in place. The real agent prices a leg
 * before it knows which circuit wins, so a quote can arrive without a preceding
 * "searching" frame — and a re-compare can requote a pair it already reported.
 */
function upsertLeg(legs: LegState[], next: LegState): LegState[] {
  const index = legs.findIndex(
    (l) => l.origin === next.origin && l.destination === next.destination,
  );
  if (index === -1) return [...legs, next];
  const merged = [...legs];
  merged[index] = { ...merged[index], ...next };
  return merged;
}

/** Splits an SSE byte stream into `AgentMessage` frames. */
async function* readEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AgentMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      const payload = raw
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (!payload) continue;
      try {
        yield JSON.parse(payload) as AgentMessage;
      } catch {
        // Ignore malformed frames rather than killing the whole stream.
      }
    }
  }
}

export function useAgent() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [trip, setTrip] = useState<TripState>(EMPTY_TRIP);
  const [isThinking, setIsThinking] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<TripRequest | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const push = useCallback((item: Omit<ChatItem, "id" | "timestamp">) => {
    setItems((prev) => [
      ...prev,
      { ...item, id: nextId(item.kind), timestamp: Date.now() },
    ]);
  }, []);

  const apply = useCallback((message: AgentMessage) => {
    const data = message.data ?? {};

    switch (message.type) {
      case "thinking": {
        setStatusLine(message.content);
        push({ role: "agent", kind: "thinking", content: message.content });
        if (Array.isArray(data.order)) {
          setTrip((prev) => ({ ...prev, order: data.order }));
        }
        break;
      }

      case "searching": {
        setStatusLine(message.content);
        push({
          role: "agent",
          kind: "search",
          content: message.content,
          leg: {
            origin: data.origin,
            destination: data.destination,
            date: data.date,
          },
        });
        if (!data.origin || !data.destination) break;
        setTrip((prev) => ({
          ...prev,
          activeLeg: { origin: data.origin, destination: data.destination },
          legs: upsertLeg(prev.legs, {
            origin: data.origin,
            destination: data.destination,
            date: data.date,
            status: "searching",
          }),
        }));
        break;
      }

      case "result": {
        const offers = (data.offers ?? []) as FlightOffer[];
        push({
          role: "agent",
          kind: "offers",
          content: message.content,
          offers,
          leg: {
            origin: data.origin,
            destination: data.destination,
            date: data.date,
            avgPrice: data.avgPrice,
            cheapestPrice: data.cheapestPrice,
            altDate: data.altDate,
            altSavings: data.altSavings,
          },
        });
        if (!data.origin || !data.destination) break;
        setTrip((prev) => ({
          ...prev,
          activeLeg: null,
          legs: upsertLeg(prev.legs, {
            origin: data.origin,
            destination: data.destination,
            date: data.date,
            status: "quoted",
            price: data.cheapestPrice,
            avgPrice: data.avgPrice,
            altDate: data.altDate,
            altSavings: data.altSavings,
          }),
        }));
        break;
      }

      case "complete": {
        const route = data.route as OptimizedRoute | undefined;
        setStatusLine(null);
        if (!route) break;
        // Getting here means the run recovered from anything it reported
        // along the way, so the retry banner comes down.
        setError(null);
        push({
          role: "agent",
          kind: "summary",
          content: message.content,
          route,
        });
        setTrip((prev) => ({
          ...prev,
          activeLeg: null,
          order: data.order ?? prev.order,
          baselineCost: data.baselineCost ?? prev.baselineCost,
          route,
          // The locked route is the source of truth: legs the agent priced
          // while exploring but did not buy drop off the board here.
          legs: route.legs.map((leg) => ({
            origin: leg.origin,
            destination: leg.destination,
            date: leg.date,
            status: "locked" as LegStatus,
            price: leg.offer.totalPrice,
            avgPrice:
              prev.legs.find(
                (l) =>
                  l.origin === leg.origin && l.destination === leg.destination,
              )?.avgPrice,
            altDate: leg.alternativeDate,
            altSavings: leg.savings,
          })),
        }));
        break;
      }

      case "error": {
        setError(message.content);
        setStatusLine(null);
        push({ role: "agent", kind: "error", content: message.content });
        break;
      }
    }
  }, [push]);

  const run = useCallback(
    async (request: TripRequest): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsThinking(true);
      setError(null);

      try {
        // One silent reconnect covers a cold start or a dropped socket.
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const response = await fetch("/api/agent", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request),
              signal: controller.signal,
            });

            if (!response.ok || !response.body) {
              throw new Error(`Planner responded ${response.status}`);
            }

            for await (const message of readEvents(response.body)) {
              if (controller.signal.aborted) return;
              apply(message);
            }
            return;
          } catch (err) {
            if (controller.signal.aborted) return;

            if (attempt < MAX_ATTEMPTS) {
              setStatusLine("Connection dropped — reconnecting to the planner…");
              await new Promise((resolve) => setTimeout(resolve, 1200));
              continue;
            }

            const reason =
              err instanceof Error ? err.message : "Unknown transport error";
            setError(reason);
            push({
              role: "agent",
              kind: "error",
              content: `Lost the connection to the planner (${reason}). Hit retry and I'll pick this up again.`,
            });
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsThinking(false);
          setStatusLine(null);
        }
      }
    },
    [apply, push],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isThinking) return;

      push({ role: "user", kind: "text", content: trimmed });

      const { request, missing } = parseTripRequest(trimmed);

      if (missing.includes("cities")) {
        push({
          role: "agent",
          kind: "error",
          content:
            "I caught the vibe but not the map. Name at least two cities — e.g. “$850, Bangkok, Hanoi and Bali, Nov 10-22, ±3 days”.",
        });
        return;
      }

      const assumptions: string[] = [];
      if (missing.includes("budget")) {
        assumptions.push(`no budget given, so I'm working to $${request.budget}`);
      }
      if (missing.includes("dates")) {
        assumptions.push(
          `no dates given, so I'm scouting ${request.startDate} → ${request.endDate}`,
        );
      }
      if (assumptions.length) {
        push({
          role: "agent",
          kind: "text",
          content: `Heads up — ${assumptions.join(" and ")}. Say the word and I'll re-plan.`,
        });
      }

      lastRequestRef.current = request;
      setTrip({
        ...EMPTY_TRIP,
        budget: request.budget,
        currency: request.currency,
        passengers: request.passengers,
        cities: request.cities,
        order: request.cities,
      });

      await run(request);
    },
    [isThinking, push, run],
  );

  const retry = useCallback(async () => {
    if (!lastRequestRef.current || isThinking) return;
    setItems((prev) => prev.filter((item) => item.kind !== "error"));
    await run(lastRequestRef.current);
  }, [isThinking, run]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setItems([]);
    setTrip(EMPTY_TRIP);
    setIsThinking(false);
    setStatusLine(null);
    setError(null);
  }, []);

  // Money committed so far: locked route if we have one, otherwise the
  // cheapest fare found per leg searched to date.
  const spent = trip.route
    ? trip.route.totalCost
    : trip.legs.reduce((sum, leg) => sum + (leg.price ?? 0), 0) *
      Math.max(1, trip.passengers);

  const searchedPairs = trip.legs.length;
  const plannedCities = trip.order.length
    ? trip.order
    : trip.cities.filter((c) => getCity(c));

  return {
    items,
    trip: { ...trip, order: plannedCities },
    spent,
    searchedPairs,
    isThinking,
    statusLine,
    error,
    sendMessage,
    retry,
    reset,
  };
}
