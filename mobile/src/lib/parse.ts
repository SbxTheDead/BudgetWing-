import type { TripRequest } from "../types";
import { CITIES, getCity } from "./cities";

/**
 * Free-text → TripRequest. Adapted from the web app (app/lib/parse.ts).
 * Built for phrasing like
 * "I have $850, want to visit Bangkok, Hanoi and Bali, Nov 10-22, ±3 days"
 * but tolerant of missing pieces: whatever is absent comes back in `missing`.
 */
export interface ParsedRequest {
  request: TripRequest;
  missing: ("budget" | "cities" | "dates")[];
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_ALT = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Builds a date in the near future: this year if still ahead, else next year. */
function futureDate(month: number, day: number): string {
  const now = new Date();
  let year = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month, day));
  if (candidate.getTime() < now.getTime() - 86_400_000) year += 1;
  return toIso(new Date(Date.UTC(year, month, day)));
}

function parseBudget(text: string): number | null {
  const dollar = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(k\b)?/i);
  if (dollar) {
    const raw = Number(dollar[1].replace(/,/g, ""));
    return dollar[2] ? raw * 1000 : raw;
  }
  const worded = text.match(
    /(?:budget(?:\s+of|\s+is)?|have|spend|under|max)\s*([\d,]+)\s*(k\b|usd|dollars?)?/i,
  );
  if (worded) {
    const raw = Number(worded[1].replace(/,/g, ""));
    return worded[2]?.toLowerCase() === "k" ? raw * 1000 : raw;
  }
  return null;
}

/** Cities in the order the user mentioned them; deduped. */
function parseCities(text: string): string[] {
  const hits: { index: number; code: string }[] = [];

  // Longest names first so "Ho Chi Minh City" wins over "Ho Chi Minh".
  const named = CITIES.flatMap((c) => [
    { code: c.code, term: c.city },
    ...(c.aliases ?? []).map((a) => ({ code: c.code, term: a })),
  ]).sort((a, b) => b.term.length - a.term.length);

  const claimed: [number, number][] = [];
  const overlaps = (start: number, end: number) =>
    claimed.some(([s, e]) => start < e && end > s);

  for (const { code, term } of named) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const end = m.index + m[0].length;
      if (overlaps(m.index, end)) continue;
      claimed.push([m.index, end]);
      hits.push({ index: m.index, code });
    }
  }

  // Bare IATA codes, uppercase only to avoid swallowing ordinary words.
  const codeRe = /\b[A-Z]{3}\b/g;
  let cm: RegExpExecArray | null;
  while ((cm = codeRe.exec(text)) !== null) {
    const end = cm.index + cm[0].length;
    if (overlaps(cm.index, end)) continue;
    if (!getCity(cm[0])) continue;
    claimed.push([cm.index, end]);
    hits.push({ index: cm.index, code: cm[0] });
  }

  hits.sort((a, b) => a.index - b.index);
  return [...new Set(hits.map((h) => h.code))];
}

function parseDates(text: string): { start: string; end: string } | null {
  // 2026-11-10 to 2026-11-22
  const iso = text.match(
    /(\d{4}-\d{2}-\d{2})\s*(?:to|through|until|–|—|-|>)\s*(\d{4}-\d{2}-\d{2})/,
  );
  if (iso) return { start: iso[1], end: iso[2] };

  // Nov 10 - Dec 2
  const twoMonths = new RegExp(
    `\\b(${MONTH_ALT})\\.?\\s*(\\d{1,2})\\s*(?:to|through|until|–|—|-|>)\\s*(${MONTH_ALT})\\.?\\s*(\\d{1,2})`,
    "i",
  ).exec(text);
  if (twoMonths) {
    const start = futureDate(MONTHS[twoMonths[1].toLowerCase()], Number(twoMonths[2]));
    let end = futureDate(MONTHS[twoMonths[3].toLowerCase()], Number(twoMonths[4]));
    if (end < start) end = addDays(end, 365);
    return { start, end };
  }

  // Nov 10-22  /  10-22 Nov
  const oneMonth = new RegExp(
    `\\b(${MONTH_ALT})\\.?\\s*(\\d{1,2})\\s*(?:to|through|until|–|—|-|>)\\s*(\\d{1,2})\\b`,
    "i",
  ).exec(text);
  if (oneMonth) {
    const month = MONTHS[oneMonth[1].toLowerCase()];
    const start = futureDate(month, Number(oneMonth[2]));
    let end = futureDate(month, Number(oneMonth[3]));
    if (end < start) end = addDays(start, Number(oneMonth[3]));
    return { start, end };
  }

  const dayFirst = new RegExp(
    `\\b(\\d{1,2})\\s*(?:to|through|until|–|—|-|>)\\s*(\\d{1,2})\\s*(${MONTH_ALT})\\b`,
    "i",
  ).exec(text);
  if (dayFirst) {
    const month = MONTHS[dayFirst[3].toLowerCase()];
    return {
      start: futureDate(month, Number(dayFirst[1])),
      end: futureDate(month, Number(dayFirst[2])),
    };
  }

  // "in November" / "for 12 days in March"
  const loneMonth = new RegExp(`\\b(?:in|during)\\s+(${MONTH_ALT})\\b`, "i").exec(text);
  if (loneMonth) {
    const start = futureDate(MONTHS[loneMonth[1].toLowerCase()], 8);
    return { start, end: addDays(start, 14) };
  }

  return null;
}

function parseFlex(text: string): number {
  const explicit = text.match(
    /(?:±|\+\/-|plus or minus|flex(?:ible)?(?:\s*(?:by|of|dates?))?)\s*(\d)/i,
  );
  if (explicit) return Math.min(7, Number(explicit[1]));
  const trailing = text.match(/(\d)\s*days?\s*(?:of\s*)?flex/i);
  if (trailing) return Math.min(7, Number(trailing[1]));
  return 3;
}

function parsePassengers(text: string): number {
  const explicit = text.match(
    /(\d+)\s*(?:adults?|passengers?|people|persons?|travel+ers?|pax)/i,
  );
  if (explicit) return Math.max(1, Math.min(9, Number(explicit[1])));
  if (/\b(?:two of us|my partner|couple|we are 2)\b/i.test(text)) return 2;
  return 1;
}

export function parseTripRequest(text: string): ParsedRequest {
  const budget = parseBudget(text);
  const cities = parseCities(text);
  const dates = parseDates(text);

  const missing: ParsedRequest["missing"] = [];
  if (budget === null) missing.push("budget");
  if (cities.length < 2) missing.push("cities");
  if (!dates) missing.push("dates");

  const fallbackStart = addDays(toIso(new Date()), 45);

  return {
    request: {
      budget: budget ?? 1000,
      currency: "USD",
      cities,
      startDate: dates?.start ?? fallbackStart,
      endDate: dates?.end ?? addDays(dates?.start ?? fallbackStart, 14),
      flexDays: parseFlex(text),
      passengers: parsePassengers(text),
      preferences: {
        needBaggage: /baggage|luggage|suitcase|checked bag/i.test(text),
        preferDirect: /direct|non-?stop/i.test(text),
        maxStops: /direct|non-?stop/i.test(text) ? 0 : 1,
      },
    },
    missing,
  };
}
