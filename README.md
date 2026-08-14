# ✈️ BudgetWing — AI Budget Flight Optimizer

An autonomous AI agent that finds the cheapest multi-city flight combinations
within your budget.

Tell it the money, not the route: _"I have $850, want to visit Bangkok, Hanoi and
Bali, Nov 10–22, ±3 days"_. It decides the city order, the departure day for each
leg and the fare family — and explains why.

## Features

- Multi-city route optimization (tests all city orderings)
- Date flexibility (±3 days per leg for savings)
- Budget-aware reasoning with trade-off explanations
- Real-time streaming agent reasoning
- Interactive map visualization
- 140+ low-cost carriers via Atlas API
- Runs a scripted demo planner when no API keys are configured, so the UI is
  always explorable

## Quick Start

1. Clone and install:

   ```bash
   npm install
   ```

2. Set up environment variables:

   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys
   ```

3. Run development server:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000

Without keys the app still runs end-to-end on simulated fares. Add the keys to
switch the same endpoint over to the live agent.

## API Keys Required

- **DASHSCOPE_API_KEY**: Get from [Alibaba Cloud Model Studio](https://dashscope.console.aliyun.com/)
- **ATLAS_CLIENT_ID** & **ATLAS_CLIENT_SECRET**: Get from [ATRIP](https://www.atriptech.com/)

## Tech Stack

- Next.js 16 + TypeScript + Tailwind CSS
- Qwen-Max (Alibaba Cloud DashScope)
- Atlas ATRIP API
- React Leaflet for maps

Architecture notes for reviewers live in [docs/architecture.md](docs/architecture.md).

## Scripts

| Command                        | What it does                              |
| ------------------------------ | ----------------------------------------- |
| `npm run dev`                  | Development server                        |
| `npm run build`                | Production build                          |
| `npm run lint`                 | ESLint                                    |
| `node scripts/sse-smoke.mjs`   | Streams a plan from the API and prints it  |

## Built With

- [Qoder](https://qoder.ai) — AI-powered IDE
- [Alibaba Cloud](https://alibabacloud.com) — Model Studio & Function Compute
- [Atlas](https://atlaslovestravel.com) — Flight data API

## License

MIT
