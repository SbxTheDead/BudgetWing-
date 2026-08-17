import { getCity } from "./cities";

/** "$1,284" — no cents, prices in this demo are whole units. */
export function money(value: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : "";
  return `${symbol}${Math.round(value).toLocaleString("en-US")}${
    symbol ? "" : ` ${currency}`
  }`;
}

/** 445 -> "7h 25m" */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Accepts "2026-11-10T08:35" or "2026-11-10 08:35" -> "08:35". */
export function clockTime(stamp: string): string {
  const match = stamp.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : stamp;
}

/** "2026-11-10" -> "Tue 10 Nov" */
export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "2026-11-10" -> "10 NOV" */
export function stampDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    })
    .toUpperCase();
}

export type CostTier = "cheap" | "mid" | "pricey";

/**
 * Relative price banding across the legs of one trip: mint for the cheapest
 * third, gray for the middle, white for the top third.
 */
export function costTier(price: number, allPrices: number[]): CostTier {
  if (allPrices.length < 2) return "cheap";
  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  if (max === min) return "cheap";
  const t = (price - min) / (max - min);
  if (t <= 0.34) return "cheap";
  if (t <= 0.67) return "mid";
  return "pricey";
}

export const TIER_HEX: Record<CostTier, string> = {
  cheap: "#10b981",
  mid: "#8a8a8a",
  pricey: "#f5f5f5",
};

/** "BKK → HAN" with city names for tooltips and chat copy. */
export function legLabel(origin: string, destination: string): string {
  const a = getCity(origin);
  const b = getCity(destination);
  return `${a?.city ?? origin} → ${b?.city ?? destination}`;
}
