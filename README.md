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

## Chat Bots

BudgetWing also runs as Telegram and Discord bots: send a trip request in plain
language and get the full plan back — itinerary text, a route-map image and a
boarding-pass style itinerary card.

```
You:  I have $850, want to visit Bangkok, Hanoi and Bali, Nov 10-22, ±3 days
Bot:  🧠 Planning your trip…
      🔎 Pricing 12 legs on Atlas…
      🗺️ [route map image]
      🎫 [itinerary card image]
      ✈️ Your optimized itinerary: …
```

### 1. Create a Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`, choose a display name and a username ending in `bot`.
3. Copy the **HTTP API token** BotFather returns.
4. Put it in `.env.local` as `TELEGRAM_BOT_TOKEN`.

The Telegram bot uses raw long-polling — no extra service or webhook host needed.
Just DM your bot a trip request.

### 2. Create a Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   and click **New Application**.
2. Under **Bot**, click **Reset Token** and copy the token into `.env.local`
   as `DISCORD_BOT_TOKEN`.
3. Still under **Bot**, enable **Privileged Gateway Intents → MESSAGE CONTENT
   INTENT** (required to read trip requests).
4. Under **OAuth2 → URL Generator**, select the `bot` scope with `Send Messages`,
   `Read Message History` permissions, open the generated URL and invite the bot
   to your server.

In servers the bot answers DMs, messages that @mention it, messages starting
with `!trip`, and messages opening with a `$` budget (e.g. `$850 for Bangkok and
Bali, Nov 10-22`).

### 3. Run the bots

```bash
npm run bots
```

Whichever tokens are configured start; with none it prints setup instructions.

### Example commands

- `I have $850, want to visit Bangkok, Hanoi and Bali, Nov 10-22, ±3 days`
- `!trip $1200 Singapore, Tokyo and Seoul in December, 2 passengers`
- `$600 Kuala Lumpur and Bali, Jan 5-15, direct flights`

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
| `npm run bots`                 | Telegram + Discord chat bots              |
| `node scripts/sse-smoke.mjs`   | Streams a plan from the API and prints it  |

## Built With

- [Qoder](https://qoder.ai) — AI-powered IDE
- [Alibaba Cloud](https://alibabacloud.com) — Model Studio & Function Compute
- [Atlas](https://atlaslovestravel.com) — Flight data API

## License

MIT
