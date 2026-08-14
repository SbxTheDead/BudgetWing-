# BudgetWing Architecture

## Overview

BudgetWing is an autonomous AI agent that optimizes multi-city flight itineraries
within a budget. You give it money, a set of cities and a rough date window; it
decides which order to fly them in, which day to fly each leg, and which fare
family to take — then explains the trade-offs it made.

Everything the agent does is streamed to the browser as it happens, so a judge
watches the reasoning, the searches and the price comparisons land in real time
rather than staring at a spinner.

## Tech Stack

- **LLM**: Qwen-Max via Alibaba Cloud Model Studio (DashScope), OpenAI-compatible
  endpoint with function calling and streaming
- **Flight Data**: Atlas ATRIP Sandbox API (140+ low-cost carriers)
- **Framework**: Next.js 16 (App Router) with TypeScript strict mode
- **UI**: Tailwind CSS v4, React Leaflet for the route map, SSE for live updates
- **Deployment**: Alibaba Cloud Function Compute
- **Development**: Built with Qoder

## Repository Layout

```
agent/
  core/       orchestration loop, prompts, shared agent types
  providers/  Qwen/DashScope client (chat, streamChat, AGENT_TOOLS)
  tools/      atlas API wrapper, route optimizer, budget tracker, airports
app/
  api/agent/  SSE endpoint + event bridge + scripted fallback planner
  components/ Chat, TripMap, BudgetBar, FlightCard, Itinerary
  hooks/      useAgent — SSE consumer and UI state machine
  lib/        request parsing, formatting, map-facing airport registry
shared/       interfaces shared by the agent and the UI
```

## How It Works

1. User inputs budget, cities and a date range (free text is parsed client-side
   into a `TripRequest`).
2. Agent resolves cities to IATA codes, with alias and typo tolerance, and knows
   which airports substitute for each other (BKK↔DMK, ICN↔GMP, LHR↔STN…).
3. Optimizer generates a search plan: every city permutation × every date variant
   inside the flex window, deduplicated to unique origin/destination/date triples.
4. Batch searches Atlas, respecting the 10 QPS search limit with a sliding-window
   rate limiter and retry/backoff on transient failures.
5. Qwen reasons about the results through function calling — it decides when to
   widen dates, swap an airport, or stop searching and settle.
6. Optimizer finds the cheapest valid route with dynamic programming over the
   searched dates, keeping legs chronologically consistent.
7. Agent verifies the winning fares against Atlas (prices on low-cost carriers go
   stale fast) and presents the itinerary with its reasoning.

## Streaming Contract

The agent emits `AgentEvent`s (`thinking | searching | comparing | result |
error | complete`). `app/api/agent/bridge.ts` translates those into the
`AgentMessage` frames the UI speaks and writes them as SSE:

```
data: {"type":"result","content":"…","data":{…},"timestamp":1770000000000}
```

The bridge is also where the two halves of the system are reconciled:

- Atlas dates (`YYYYMMDD`) are normalized to ISO (`YYYY-MM-DD`) for the
  formatters and the map.
- Narration frames that carry counters rather than fares are downgraded to
  `thinking`, so the UI's offer parsing only ever sees real quotes.
- Mid-run tool failures stay in the trace instead of raising a retry banner —
  they only become a hard error if the run ends with no itinerary.

If `DASHSCOPE_API_KEY` and the Atlas credentials are absent, the same endpoint
serves a deterministic scripted planner (`app/api/agent/mock.ts`) over the exact
same SSE contract, so the app still demos on a clean checkout.

## Key Innovation

Multi-city budget optimization through:

- Route permutation testing (all city orderings)
- Date flexibility (±3 days per leg)
- Budget-aware scoring with convenience penalties — a red-eye or a 9-hour
  layover has to be meaningfully cheaper to win
- Nearby-airport substitution where it saves real money
- LLM reasoning for trade-off explanations, so the number comes with a "why"
