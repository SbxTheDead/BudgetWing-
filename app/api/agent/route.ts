import type { AgentMessage, OptimizedRoute, TripRequest } from "@shared/types";
import { runAgent } from "@agent/core/agent";
import { getCity } from "@/app/lib/cities";
import { FrontendBridge } from "./bridge";
import { planTrip } from "./mock";

/**
 * SSE endpoint for the planning agent.
 *
 * With credentials present the real tool-calling agent runs and its events are
 * bridged onto the `AgentMessage` contract the UI speaks. Without them the
 * scripted planner in `./mock` takes over, so the app still demos end-to-end on
 * a clean checkout.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function frame(message: AgentMessage): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(message)}\n\n`);
}

function msg(
  type: AgentMessage["type"],
  content: string,
  data?: unknown,
): AgentMessage {
  return { type, content, data, timestamp: Date.now() };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The agent needs a model to reason with and Atlas to price against. */
function hasCredentials(): boolean {
  return Boolean(
    process.env.DASHSCOPE_API_KEY &&
      process.env.ATLAS_CLIENT_ID &&
      process.env.ATLAS_CLIENT_SECRET,
  );
}

function normalize(body: Partial<TripRequest>): TripRequest {
  const today = new Date().toISOString().slice(0, 10);
  return {
    budget: Number(body.budget) > 0 ? Number(body.budget) : 1000,
    currency: body.currency ?? "USD",
    cities: (body.cities ?? [])
      .map((c) => String(c).trim().toUpperCase())
      .filter((c) => getCity(c)),
    startDate: (body.startDate ?? today).slice(0, 10),
    endDate: (body.endDate ?? today).slice(0, 10),
    flexDays: Math.min(7, Math.max(0, Number(body.flexDays ?? 3))),
    passengers: Math.min(9, Math.max(1, Number(body.passengers ?? 1))),
    preferences: body.preferences,
  };
}

type Send = (message: AgentMessage) => boolean;

// ---------------------------------------------------------------------------
// Real agent
// ---------------------------------------------------------------------------

/**
 * Runs the tool-calling agent. Resolves to the reason it produced nothing, or
 * `null` when an itinerary was streamed to the client.
 */
async function runRealAgent(
  req: TripRequest,
  send: Send,
): Promise<string | null> {
  const bridge = new FrontendBridge(req, send);
  let route: OptimizedRoute | null = null;

  try {
    route = await runAgent(req, (event) => {
      bridge.handle(event);
    });
  } catch (error) {
    // `runAgent` swallows most failures and returns whatever it had; anything
    // that does escape is reported the same way.
    console.error("[Agent API] agent threw:", error);
  }

  if (bridge.finish(route)) return null;
  return bridge.failure ?? "The planner finished without an itinerary.";
}

// ---------------------------------------------------------------------------
// Scripted fallback (no credentials, or live fares unavailable)
// ---------------------------------------------------------------------------

async function runMockAgent(
  req: TripRequest,
  send: Send,
  notice: string,
): Promise<void> {
  const cityNames = req.cities.map((c) => getCity(c)?.city ?? c);

  send(msg("thinking", notice, { phase: "mode", mode: "mock" }));
  await wait(400);

  send(
    msg("thinking", "Reading your brief and resolving airports…", {
      phase: "parse",
      cities: req.cities,
    }),
  );
  await wait(600);

  send(
    msg(
      "thinking",
      `Locked ${req.cities.length} cities — ${cityNames.join(", ")} — on ${req.budget} ${req.currency} with ±${req.flexDays} days of slack.`,
      { phase: "brief" },
    ),
  );
  await wait(700);

  const plan = planTrip(req);

  send(
    msg(
      "thinking",
      `Permuting the city order: ${plan.alternativesConsidered} circuits on the table. Best so far is ${plan.order
        .map((c) => getCity(c)?.city ?? c)
        .join(" → ")} → home.`,
      {
        phase: "order",
        order: plan.order,
        alternativesConsidered: plan.alternativesConsidered,
      },
    ),
  );
  await wait(850);

  for (let i = 0; i < plan.quotes.length; i++) {
    const quote = plan.quotes[i];
    if (
      !send(
        msg(
          "searching",
          `Searching ${quote.origin} → ${quote.destination} on ${quote.date}${
            req.flexDays ? ` (±${req.flexDays}d)` : ""
          }…`,
          {
            origin: quote.origin,
            destination: quote.destination,
            date: quote.date,
            index: i,
            total: plan.quotes.length,
          },
        ),
      )
    ) {
      return;
    }
    await wait(1100);

    if (
      !send(
        msg(
          "result",
          `${quote.offers.length} fares back for ${quote.origin} → ${quote.destination}. Cheapest ${quote.cheapestPrice} ${req.currency}, market average ${quote.avgPrice}.`,
          {
            origin: quote.origin,
            destination: quote.destination,
            date: quote.date,
            offers: quote.offers,
            avgPrice: quote.avgPrice,
            cheapestPrice: quote.cheapestPrice,
            altDate: quote.altDate,
            altSavings: quote.altSavings,
            index: i,
            total: plan.quotes.length,
          },
        ),
      )
    ) {
      return;
    }
    await wait(450);

    if (quote.altSavings) {
      send(
        msg(
          "thinking",
          `Shifting ${quote.origin} → ${quote.destination} to ${quote.altDate} saves ${quote.altSavings} ${req.currency}. Taking it.`,
          { phase: "shift", origin: quote.origin, destination: quote.destination },
        ),
      );
      await wait(520);
    }
  }

  send(
    msg("thinking", "Re-costing the full circuit against your budget…", {
      phase: "settle",
    }),
  );
  await wait(800);

  send(
    msg("complete", plan.route.reasoning, {
      route: plan.route,
      order: plan.order,
      budget: req.budget,
      currency: req.currency,
      baselineCost: Math.round(plan.baselineCost),
      passengers: req.passengers,
    }),
  );
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let body: Partial<TripRequest>;
  try {
    body = (await request.json()) as Partial<TripRequest>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const req = normalize(body);
  const live = hasCredentials();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send: Send = (message) => {
        if (closed || request.signal.aborted) return false;
        try {
          controller.enqueue(frame(message));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };

      try {
        if (req.cities.length < 2) {
          send(
            msg(
              "error",
              "I need at least two cities to build a route. Try: “I have $850, want to visit Bangkok, Hanoi and Bali, Nov 10-22”.",
            ),
          );
          return;
        }

        console.log(
          `[Agent API] planning ${req.cities.join("→")} on $${req.budget} ` +
            `(${live ? "live agent" : "scripted mock"})`,
        );

        if (!live) {
          await runMockAgent(
            req,
            send,
            "No model or Atlas credentials configured — running the scripted demo planner on simulated fares.",
          );
          return;
        }

        const failure = await runRealAgent(req, send);
        if (!failure) return;

        // Live data can be down or the sandbox account inactive. Rather than
        // dead-ending the demo, hand the same request to the scripted planner —
        // clearly labelled, so nobody mistakes simulated fares for real ones.
        console.warn(`[Agent API] live run produced nothing: ${failure}`);
        await runMockAgent(
          req,
          send,
          `${failure} Falling back to the scripted planner on simulated fares so you still get a full itinerary.`,
        );
      } catch (error) {
        console.error("[Agent API] run failed:", error);
        send(
          msg(
            "error",
            error instanceof Error
              ? error.message
              : "The planner hit an unexpected error.",
          ),
        );
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by an aborted client
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
