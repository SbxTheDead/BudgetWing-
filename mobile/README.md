# BudgetWing Mobile

Standalone Android app for **BudgetWing** — a budget trip-planning agent with a
procedural 3D globe. Built with **Capacitor + React + Vite + three.js**.

The app is a thin client: the planner agent lives in the Next.js backend in the
**parent folder** (`budgetwing/`), streamed over SSE from `POST /api/agent`.

---

## Run as a web app (works everywhere)

```bash
npm install
npm run dev          # http://localhost:5173
```

Type-check and production build:

```bash
npx tsc --noEmit
npm run build        # outputs dist/
```

## Backend — required

The mobile app does nothing without the agent backend. Start it first, from the
parent folder:

```bash
cd ..                # budgetwing/
npm run dev          # Next.js on http://localhost:3000
```

## API base URL

The app reads the backend URL from localStorage (editable in **Settings**).

| Environment | URL to use |
| --- | --- |
| Android emulator | `http://10.0.2.2:3000` (default — emulator alias for your PC) |
| Physical device | Your PC's LAN IP, e.g. `http://192.168.1.20:3000` (same Wi-Fi) |
| Production | Deploy the backend (e.g. Vercel) and paste its public URL |

Use the **Test connection** button in Settings to verify reachability.

## Build the Android APK (requires Android Studio / SDK)

`npx cap add android` is intentionally **not** pre-run here (no Android SDK in
this workspace). On a machine that has Android Studio:

```bash
npm install
npm run build                 # produces dist/
npx cap add android           # creates the android/ native project
npx cap sync                  # copies dist/ into the native shell
```

Then either:

```bash
npx cap open android          # opens in Android Studio → Run
```

or from the command line:

```bash
cd android
./gradlew assembleDebug       # APK at android/app/build/outputs/apk/debug/
```

After every web rebuild, run `npx cap sync` again to refresh the bundle.

### Live-reload during development

Uncomment the `server.url` block in `capacitor.config.ts` and point it at your
PC's LAN IP running `npm run dev` (Vite already listens on all interfaces),
then `npx cap sync` and run the app.

## Project layout

```
mobile/
├── capacitor.config.ts      # appId com.budgetwing.app, webDir dist
├── src/
│   ├── App.tsx              # shell + [Globe][Chat][Plan][Settings] tabs
│   ├── styles.css           # black/white theme, mint accents
│   ├── types.ts             # local copy of shared/types.ts contract
│   ├── hooks/useAgent.ts    # SSE client (fetch + stream reader)
│   ├── lib/
│   │   ├── api.ts           # configurable API base (localStorage)
│   │   ├── cities.ts        # airport lat/lng registry (~57 hubs)
│   │   ├── parse.ts         # natural language → TripRequest
│   │   └── format.ts        # money/date/duration formatters
│   └── components/
│       ├── Globe3D.tsx      # procedural three.js globe (offline-safe)
│       ├── Chat.tsx         # chat bubbles + presets
│       ├── BudgetBar.tsx    # animated budget gauge
│       ├── Itinerary.tsx    # timeline of legs + savings
│       ├── FlightCard.tsx   # compact fare card
│       └── Settings.tsx     # API URL + connection test
```

## Notes & caveats

- The globe is 100% procedural (no texture downloads) so it renders offline.
  "Continents" are a deterministic noise pattern — an aesthetic landmass, not
  real geography.
- Fonts load from Google Fonts when online; offline the app falls back to
  system fonts gracefully.
- The JS bundle is ~650 kB pre-gzip (~180 kB gzip), dominated by three.js —
  normal for a bundled mobile app since it ships inside the APK.
- SSE uses `fetch` + `ReadableStream` (EventSource can't POST), matching the
  web client frame-for-frame: `thinking`, `searching`, `result`, `error`,
  `complete`.
