/**
 * Share-card rendering for the chat bots: an OptimizedRoute becomes two PNGs —
 * a wide route map (social-preview ratio) and a portrait boarding-pass style
 * itinerary card. Both are built as SVG and rasterised with resvg, so they
 * render identically everywhere the bots post them.
 *
 * Aesthetic: night-flight operations deck — jet black, radar green, mono
 * flight-data typography, white route ink.
 */

import { Resvg } from "@resvg/resvg-js";
import type { OptimizedRoute, RouteLeg, TripRequest } from "../../shared/types";
import { getAirport } from "../tools/airports";
import { formatCurrency } from "../tools/budget";

const MAP_W = 1200;
const MAP_H = 630;
const CARD_W = 1080;
const CARD_H = 1350;

/** Radar green — the BudgetWing accent for savings and winning fares. */
const GREEN = "#3ce08f";
const INK = "#f2f5f7";
const DIM = "rgba(242,245,247,0.55)";
const FAINT = "rgba(242,245,247,0.28)";
const BG = "#05070a";

const SANS = "Segoe UI, Helvetica Neue, Arial, sans-serif";
const MONO = "Cascadia Mono, Consolas, Courier New, monospace";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rasterize(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: BG,
  });
  return Buffer.from(resvg.render().asPng());
}

/** "20261110" → "10 NOV" — boarding-pass style date stamp. */
function stampDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const month = months[Number(yyyymmdd.slice(4, 6)) - 1] ?? "";
  return `${Number(yyyymmdd.slice(6, 8))} ${month}`;
}

function legCarrier(leg: RouteLeg): string {
  const first = leg.offer.fromSegments[0];
  if (!first) return "—";
  const flight = `${first.carrier}${first.flightNumber}`;
  const stops = Math.max(0, leg.offer.fromSegments.length - 1);
  return `${flight} · ${stops === 0 ? "nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`}`;
}

/** Deterministic pseudo-random sequence so the barcode is stable per route. */
function barcodeBars(seedText: string): number[] {
  let seed = 0;
  for (const char of seedText) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const bars: number[] = [];
  for (let i = 0; i < 46; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    bars.push(2 + (seed % 7));
  }
  return bars;
}

interface Stop {
  iata: string;
  city: string;
  lat: number;
  lng: number;
}

/** Ordered stops along the route: each leg origin, then the final destination. */
function routeStops(route: OptimizedRoute): Stop[] {
  const stops: Stop[] = [];
  const push = (iata: string) => {
    const airport = getAirport(iata);
    if (!airport) return;
    if (stops.some((s) => s.iata === airport.iata)) return;
    stops.push({ iata: airport.iata, city: airport.city, lat: airport.lat, lng: airport.lng });
  };
  for (const leg of route.legs) {
    push(leg.origin);
    push(leg.destination);
  }
  return stops;
}

function routeChain(route: OptimizedRoute): string {
  if (route.legs.length === 0) return "";
  return [
    ...route.legs.map((leg) => leg.origin),
    route.legs[route.legs.length - 1].destination,
  ].join(" → ");
}

// ---------------------------------------------------------------------------
// 1. Route map — 1200×630 night-ops chart
// ---------------------------------------------------------------------------

/**
 * Equirectangular chart of the winning route: subtle graticule, white city
 * dots, bezier arcs (green for the cheapest leg), title + total cost.
 */
export async function renderRouteMapPNG(
  route: OptimizedRoute,
  tripRequest?: TripRequest,
): Promise<Buffer> {
  const stops = routeStops(route);
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_W}" height="${MAP_H}" viewBox="0 0 ${MAP_W} ${MAP_H}">`,
    `<defs>`,
    `<radialGradient id="vignette" cx="50%" cy="42%" r="75%">`,
    `<stop offset="0%" stop-color="#0c1117"/>`,
    `<stop offset="100%" stop-color="#04060a"/>`,
    `</radialGradient>`,
    `</defs>`,
    `<rect width="${MAP_W}" height="${MAP_H}" fill="url(#vignette)"/>`,
  );

  // --- projection: equirectangular, zoom-fit to the route's bounding box ---
  const padLon = 6;
  const padLat = 5;
  let minLat = Math.min(...stops.map((s) => s.lat)) - padLat;
  let maxLat = Math.max(...stops.map((s) => s.lat)) + padLat;
  let minLng = Math.min(...stops.map((s) => s.lng)) - padLon;
  let maxLng = Math.max(...stops.map((s) => s.lng)) + padLon;
  // Never degenerate on a single-airport round trip.
  if (maxLat - minLat < 12) {
    const mid = (maxLat + minLat) / 2;
    minLat = mid - 6;
    maxLat = mid + 6;
  }
  if (maxLng - minLng < 14) {
    const mid = (maxLng + minLng) / 2;
    minLng = mid - 7;
    maxLng = mid + 7;
  }

  // Chart area leaves room for the title band and the footer strip.
  const left = 72;
  const right = MAP_W - 72;
  const top = 148;
  const bottom = MAP_H - 96;
  const project = (lat: number, lng: number): [number, number] => [
    left + ((lng + 180 - (minLng + 180)) / (maxLng - minLng)) * (right - left),
    top + ((maxLat - lat) / (maxLat - minLat)) * (bottom - top),
  ];

  // --- graticule -------------------------------------------------------------
  const span = Math.max(maxLng - minLng, maxLat - minLat);
  const step = span > 60 ? 15 : span > 24 ? 10 : 5;
  parts.push(`<g stroke="rgba(242,245,247,0.07)" stroke-width="1">`);
  for (let lng = Math.ceil(minLng / step) * step; lng <= maxLng; lng += step) {
    const [x] = project((minLat + maxLat) / 2, lng);
    parts.push(`<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${bottom}"/>`);
  }
  for (let lat = Math.ceil(minLat / step) * step; lat <= maxLat; lat += step) {
    const [, y] = project(lat, (minLng + maxLng) / 2);
    parts.push(`<line x1="${left}" y1="${y.toFixed(1)}" x2="${right}" y2="${y.toFixed(1)}"/>`);
  }
  parts.push(`</g>`);
  // Chart frame
  parts.push(
    `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="none" stroke="rgba(242,245,247,0.12)" stroke-width="1"/>`,
  );

  // --- arcs ------------------------------------------------------------------
  const cheapestIndex = route.legs.reduce(
    (best, leg, i) =>
      leg.offer.totalPrice < route.legs[best].offer.totalPrice ? i : best,
    0,
  );
  route.legs.forEach((leg, i) => {
    const from = getAirport(leg.origin);
    const to = getAirport(leg.destination);
    if (!from || !to) return;
    const [x1, y1] = project(from.lat, from.lng);
    const [x2, y2] = project(to.lat, to.lng);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    // Perpendicular bulge, always arcing upward like a plotted flight plan.
    let nx = -dy / dist;
    let ny = dx / dist;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const lift = Math.min(90, dist * 0.22);
    const cx = (x1 + x2) / 2 + nx * lift;
    const cy = (y1 + y2) / 2 + ny * lift;
    const isCheapest = i === cheapestIndex && route.legs.length > 1;
    const stroke = isCheapest ? GREEN : INK;
    const opacity = isCheapest ? 0.95 : 0.5;
    parts.push(
      `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 9"/>`,
      `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${stroke}" stroke-opacity="${(opacity * 0.35).toFixed(2)}" stroke-width="7"/>`,
      // Leg number pinned to the arc apex
      `<g font-family="${MONO}" font-size="15" text-anchor="middle">`,
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="15" fill="${BG}" stroke="${stroke}" stroke-opacity="0.8" stroke-width="1.5"/>`,
      `<text x="${cx.toFixed(1)}" y="${(cy + 5).toFixed(1)}" fill="${stroke}">${String(i + 1).padStart(2, "0")}</text>`,
      `</g>`,
    );
  });

  // --- city dots + labels -----------------------------------------------------
  const placed: Array<[number, number]> = [];
  for (const stop of stops) {
    const [x, y] = project(stop.lat, stop.lng);
    parts.push(
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="none" stroke="${GREEN}" stroke-opacity="0.35" stroke-width="1.5"/>`,
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5" fill="${INK}"/>`,
    );
    // Nudge the label until it clears earlier labels.
    let ly = y - 36;
    let anchor = "middle";
    while (placed.some(([px, py]) => Math.abs(px - x) < 92 && Math.abs(py - ly) < 30)) {
      ly += 40;
    }
    if (ly < top + 30) ly = y + 44;
    if (x < left + 90) anchor = "start";
    if (x > right - 90) anchor = "end";
    placed.push([x, ly]);
    parts.push(
      `<g text-anchor="${anchor}" font-family="${MONO}">`,
      `<text x="${x.toFixed(1)}" y="${ly.toFixed(1)}" font-size="20" font-weight="700" fill="${INK}">${escapeXml(stop.iata)}</text>`,
      `<text x="${x.toFixed(1)}" y="${(ly + 18).toFixed(1)}" font-size="13" fill="${DIM}" letter-spacing="1">${escapeXml(stop.city.toUpperCase())}</text>`,
      `</g>`,
    );
  }

  // --- title band --------------------------------------------------------------
  const currency = route.legs[0]?.offer.currency ?? tripRequest?.currency ?? "USD";
  parts.push(
    `<g font-family="${SANS}">`,
    `<text x="56" y="66" font-size="30" font-weight="800" letter-spacing="8" fill="${INK}">BUDGETWING</text>`,
    `<text x="56" y="94" font-size="13" letter-spacing="5" fill="${DIM}" font-family="${MONO}">OPTIMIZED ROUTE · NIGHT OPS CHART</text>`,
    `<text x="${MAP_W - 56}" y="66" font-size="38" font-weight="800" fill="${GREEN}" text-anchor="end">${escapeXml(formatCurrency(route.totalCost, currency))}</text>`,
    `<text x="${MAP_W - 56}" y="94" font-size="12" letter-spacing="4" fill="${DIM}" text-anchor="end" font-family="${MONO}">TOTAL · ${escapeXml(currency.toUpperCase())}${tripRequest ? ` · ${tripRequest.passengers} PAX` : ""}</text>`,
    `</g>`,
  );

  // --- footer strip --------------------------------------------------------------
  parts.push(
    `<line x1="56" y1="${MAP_H - 64}" x2="${MAP_W - 56}" y2="${MAP_H - 64}" stroke="rgba(242,245,247,0.14)" stroke-width="1"/>`,
    `<text x="56" y="${MAP_H - 36}" font-family="${MONO}" font-size="16" fill="${DIM}" letter-spacing="2">${escapeXml(routeChain(route))}</text>`,
    `<text x="${MAP_W - 56}" y="${MAP_H - 36}" font-family="${MONO}" font-size="14" fill="${route.savings > 0 ? GREEN : DIM}" text-anchor="end" letter-spacing="1">` +
      (route.savings > 0
        ? `SAVED ${escapeXml(formatCurrency(route.savings, currency))} · ${route.alternativesConsidered} ROUTES TESTED`
        : `${route.alternativesConsidered} ROUTES TESTED`) +
      `</text>`,
  );

  parts.push(`</svg>`);
  return rasterize(parts.join(""), MAP_W);
}

// ---------------------------------------------------------------------------
// 2. Itinerary card — 1080×1350 boarding pass
// ---------------------------------------------------------------------------

/**
 * Black boarding-pass card: header, one row per leg (route, date, airline,
 * price), perforated stub with total, savings badge and budget usage bar.
 */
export async function renderItineraryCardPNG(
  route: OptimizedRoute,
  tripRequest?: TripRequest,
): Promise<Buffer> {
  const parts: string[] = [];
  const currency = route.legs[0]?.offer.currency ?? tripRequest?.currency ?? "USD";

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">`,
    `<defs>`,
    `<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0%" stop-color="#0b0f14"/>`,
    `<stop offset="100%" stop-color="#04060a"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="${CARD_W}" height="${CARD_H}" fill="${BG}"/>`,
    `<rect x="24" y="24" width="${CARD_W - 48}" height="${CARD_H - 48}" rx="28" fill="url(#sheen)" stroke="rgba(242,245,247,0.16)" stroke-width="2"/>`,
    // Corner ticks — ticket punch marks
    `<g stroke="${GREEN}" stroke-width="3" stroke-linecap="round">`,
    `<path d="M 60 52 h 26 M 60 52 v 26" fill="none"/>`,
    `<path d="M ${CARD_W - 60} ${CARD_H - 52} h -26 M ${CARD_W - 60} ${CARD_H - 52} v -26" fill="none"/>`,
    `</g>`,
  );

  // --- header -------------------------------------------------------------------
  const firstDate = route.legs[0]?.date ?? "";
  const lastDate = route.legs[route.legs.length - 1]?.date ?? "";
  parts.push(
    `<g font-family="${SANS}">`,
    `<text x="72" y="106" font-size="42" font-weight="800" letter-spacing="10" fill="${INK}">BUDGETWING</text>`,
    `<text x="${CARD_W - 72}" y="92" font-size="17" font-family="${MONO}" letter-spacing="4" fill="${GREEN}" text-anchor="end">BOARDING PASS</text>`,
    `<text x="${CARD_W - 72}" y="114" font-size="13" font-family="${MONO}" letter-spacing="2" fill="${DIM}" text-anchor="end">MULTI-CITY · ${route.legs.length} LEG${route.legs.length === 1 ? "" : "S"}</text>`,
    `<text x="72" y="140" font-size="15" font-family="${MONO}" letter-spacing="2" fill="${DIM}">${escapeXml(stampDate(firstDate))}${lastDate && lastDate !== firstDate ? ` — ${escapeXml(stampDate(lastDate))}` : ""}</text>`,
    `</g>`,
    `<rect x="72" y="162" width="${CARD_W - 144}" height="3" fill="${GREEN}" fill-opacity="0.85"/>`,
  );

  // --- legs ---------------------------------------------------------------------
  let y = 232;
  const rowHeight = route.legs.length > 4 ? 132 : 152;
  route.legs.forEach((leg, i) => {
    parts.push(
      `<g font-family="${MONO}">`,
      `<text x="72" y="${y}" font-size="14" letter-spacing="3" fill="${GREEN}">LEG ${String(i + 1).padStart(2, "0")}</text>`,
      `<text x="72" y="${y + 44}" font-size="44" font-weight="700" font-family="${SANS}" fill="${INK}">${escapeXml(leg.origin)} <tspan fill="${GREEN}">→</tspan> ${escapeXml(leg.destination)}</text>`,
      `<text x="72" y="${y + 76}" font-size="17" fill="${DIM}" letter-spacing="1">${escapeXml(stampDate(leg.date))}${leg.alternativeDate ? `  ·  SHIFTED FROM ${escapeXml(stampDate(leg.alternativeDate))}` : ""}  ·  ${escapeXml(legCarrier(leg))}</text>`,
      `<text x="${CARD_W - 72}" y="${y + 40}" font-size="36" font-weight="700" font-family="${SANS}" fill="${INK}" text-anchor="end">${escapeXml(formatCurrency(leg.offer.totalPrice, currency))}</text>`,
      leg.savings
        ? `<text x="${CARD_W - 72}" y="${y + 70}" font-size="14" fill="${GREEN}" text-anchor="end" letter-spacing="1">-${escapeXml(formatCurrency(leg.savings, currency))}</text>`
        : "",
      `</g>`,
    );
    y += rowHeight;
    if (i < route.legs.length - 1) {
      parts.push(
        `<line x1="72" y1="${y - 36}" x2="${CARD_W - 72}" y2="${y - 36}" stroke="rgba(242,245,247,0.10)" stroke-width="1"/>`,
      );
    }
  });

  // --- perforation ----------------------------------------------------------------
  const stubY = Math.max(y + 8, CARD_H - 380);
  parts.push(
    `<circle cx="24" cy="${stubY}" r="22" fill="${BG}"/>`,
    `<circle cx="${CARD_W - 24}" cy="${stubY}" r="22" fill="${BG}"/>`,
    `<line x1="60" y1="${stubY}" x2="${CARD_W - 60}" y2="${stubY}" stroke="rgba(242,245,247,0.30)" stroke-width="2" stroke-dasharray="4 12"/>`,
  );

  // --- stub: total, savings badge, budget usage ------------------------------------
  const sy = stubY + 66;
  parts.push(
    `<g font-family="${SANS}">`,
    `<text x="72" y="${sy}" font-size="14" font-family="${MONO}" letter-spacing="4" fill="${DIM}">TOTAL FARE</text>`,
    `<text x="72" y="${sy + 62}" font-size="64" font-weight="800" fill="${GREEN}">${escapeXml(formatCurrency(route.totalCost, currency))}</text>`,
    `</g>`,
  );

  if (route.savings > 0) {
    const badgeText = `SAVED ${formatCurrency(route.savings, currency)}`;
    const badgeW = badgeText.length * 13 + 56;
    parts.push(
      `<g font-family="${MONO}">`,
      `<rect x="${CARD_W - 72 - badgeW}" y="${sy + 12}" width="${badgeW}" height="52" rx="26" fill="${GREEN}"/>`,
      `<text x="${CARD_W - 72 - badgeW / 2}" y="${sy + 45}" font-size="20" font-weight="700" letter-spacing="1" fill="#04120b" text-anchor="middle">↓ ${escapeXml(badgeText)}</text>`,
      `</g>`,
    );
  }

  // Budget usage bar
  const budget = tripRequest?.budget;
  if (budget !== undefined && budget > 0) {
    const usage = Math.min(1, route.totalCost / budget);
    const barX = 72;
    const barW = CARD_W - 144 - 220;
    const barY = sy + 108;
    const over = route.totalCost > budget;
    parts.push(
      `<g font-family="${MONO}">`,
      `<text x="72" y="${barY - 12}" font-size="13" letter-spacing="3" fill="${DIM}">BUDGET USED · ${Math.round(usage * 100)}% OF ${escapeXml(formatCurrency(budget, currency))}</text>`,
      `<rect x="${barX}" y="${barY}" width="${barW}" height="14" rx="7" fill="rgba(242,245,247,0.10)"/>`,
      `<rect x="${barX}" y="${barY}" width="${Math.max(14, barW * usage)}" height="14" rx="7" fill="${over ? "#ff5d5d" : GREEN}"/>`,
      `<text x="${CARD_W - 72}" y="${barY + 13}" font-size="14" fill="${over ? "#ff5d5d" : INK}" text-anchor="end" letter-spacing="1">${over ? "OVER BUDGET" : `${escapeXml(formatCurrency(Math.max(0, budget - route.totalCost), currency))} LEFT`}</text>`,
      `</g>`,
    );
  }

  // Barcode — deterministic per route, anchored above the footnote.
  // Long itineraries push the stub down; drop the barcode before it collides.
  if (stubY <= CARD_H - 380) {
    const bars = barcodeBars(`${routeChain(route)}|${route.totalCost}`);
    let bx = 72;
    const by = CARD_H - 160;
    parts.push(`<g fill="rgba(242,245,247,0.8)">`);
    for (const width of bars) {
      parts.push(`<rect x="${bx}" y="${by}" width="${width}" height="52"/>`);
      bx += width + 6;
    }
    parts.push(`</g>`);
    parts.push(
      `<text x="${CARD_W - 72}" y="${by + 34}" font-family="${MONO}" font-size="16" letter-spacing="3" fill="${DIM}" text-anchor="end">BW-${escapeXml(routeChain(route).replace(/[^A-Z]/g, "").slice(0, 12) || "TRIP")}</text>`,
    );
  }

  // Reasoning footnote (two lines max)
  const reasoning = route.reasoning.replace(/\s+/g, " ").trim();
  const line1 = reasoning.slice(0, 84);
  const line2 = reasoning.slice(84, 168);
  parts.push(
    `<g font-family="${MONO}" font-size="13" fill="${FAINT}">`,
    `<text x="72" y="${CARD_H - 92}">${escapeXml(line1)}${reasoning.length > 84 ? "…" : ""}</text>`,
    line2 ? `<text x="72" y="${CARD_H - 70}">${escapeXml(line2)}${reasoning.length > 168 ? "…" : ""}</text>` : "",
    `<text x="${CARD_W - 72}" y="${CARD_H - 70}" text-anchor="end" fill="${FAINT}" letter-spacing="2">${route.alternativesConsidered} ROUTES EVALUATED</text>`,
    `</g>`,
  );

  parts.push(`</svg>`);
  return rasterize(parts.join(""), CARD_W);
}
