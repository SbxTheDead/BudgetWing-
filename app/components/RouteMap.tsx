"use client";

import { useId, useMemo, useState } from "react";
import type { OptimizedRoute } from "@shared/types";
import { getCity } from "@/app/lib/cities";
import {
  costTier,
  money,
  stampDate,
  TIER_HEX,
} from "@/app/lib/format";

interface RouteMapProps {
  route: OptimizedRoute;
  currency?: string;
}

const W = 640;
const H = 300;
const PAD = 44;

interface Pt {
  x: number;
  y: number;
}

interface Node {
  code: string;
  city: string;
  index: number;
  x: number;
  y: number;
}

interface Arc {
  d: string;
  mid: Pt;
  from: Node;
  to: Node;
  /** Index into route.legs — keeps hover/chips aligned even if a code is unmapped. */
  legIndex: number;
}

/** Equirectangular fit with latitude correction, contain-fit into the box. */
function makeProjector(lats: number[], lons: number[]) {
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.max(0.25, Math.cos((midLat * Math.PI) / 180));

  const xs = lons.map((lon) => lon * k);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);

  // Degenerate spans (two airports nearly on top of each other) still
  // need a sane scale.
  const spanX = Math.max(maxX - minX, 0.4);
  const spanY = Math.max(maxY - minY, 0.4);

  const availW = W - PAD * 2;
  const availH = H - PAD * 2;
  const s = Math.min(availW / spanX, availH / spanY);
  const ox = (W - spanX * s) / 2;
  const oy = (H - spanY * s) / 2;

  return (lat: number, lon: number): Pt => ({
    x: ox + (lon * k - minX) * s,
    y: oy + (maxY - lat) * s,
  });
}

/** Quadratic bezier bowed perpendicular to the chord, preferring an upward bow. */
function arcBetween(a: Pt, b: Pt): { d: string; mid: Pt } {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const span = Math.hypot(dx, dy) || 1;

  const lift = Math.min(0.22, 30 / span) * span;
  let nx = -dy / span;
  let ny = dx / span;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }

  const cx = mx + nx * lift;
  const cy = my + ny * lift;

  return {
    d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
    mid: {
      x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x,
      y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y,
    },
  };
}

/**
 * Dependency-free route visualization for the chat transcript. Projects the
 * locked circuit's airport coordinates into a small SVG — no second Leaflet
 * instance needed inside the conversation.
 */
export default function RouteMap({ route, currency = "USD" }: RouteMapProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const legs = route.legs;

  const model = useMemo(() => {
    const stops = [legs[0]?.origin, ...legs.map((l) => l.destination)].filter(
      (c): c is string => Boolean(c),
    );

    const coords = stops
      .map((code) => getCity(code))
      .filter((c) => c !== undefined);
    if (coords.length < 2) return null;

    const project = makeProjector(
      coords.map((c) => c.lat),
      coords.map((c) => c.lon),
    );

    // Number each airport by first appearance in the circuit.
    const nodes = new Map<string, Node>();
    let ordinal = 0;
    for (const code of stops) {
      if (nodes.has(code)) continue;
      const city = getCity(code);
      if (!city) continue;
      const { x, y } = project(city.lat, city.lon);
      nodes.set(code, {
        code,
        city: city.city,
        index: ordinal,
        x,
        y,
      });
      ordinal += 1;
    }

    const arcs: Arc[] = [];
    legs.forEach((leg, legIndex) => {
      const from = nodes.get(leg.origin);
      const to = nodes.get(leg.destination);
      if (!from || !to) return;
      const { d, mid } = arcBetween(from, to);
      arcs.push({ d, mid, from, to, legIndex });
    });

    return {
      nodes: [...nodes.values()],
      arcs,
      closesCircuit: stops[stops.length - 1] === stops[0],
    };
  }, [legs]);

  if (!model || legs.length === 0) return null;

  const prices = legs.map((l) => l.offer.totalPrice);

  return (
    <figure className="anim-rise overflow-hidden rounded-[16px] border border-white/10 bg-[#0a0a0c]">
      {/* header strip */}
      <figcaption className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2.5">
        <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-mint" aria-hidden />
          Locked route
        </span>
        <span className="num text-[10.5px] text-white/35">
          {model.nodes.length} airports · {legs.length} flights
        </span>
      </figcaption>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Route map: ${model.nodes.map((n) => n.code).join(" → ")}`}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <radialGradient id={`bg-${uid}`} cx="50%" cy="18%" r="90%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
              <stop offset="60%" stopColor="rgba(255,255,255,0.012)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.25)" />
            </radialGradient>
          </defs>

          {/* atmosphere + quiet graticule */}
          <rect width={W} height={H} fill={`url(#bg-${uid})`} />
          <g className="route-graticule" aria-hidden>
            {[60, 120, 180, 240].map((y) => (
              <line key={`h${y}`} x1="0" y1={y} x2={W} y2={y} />
            ))}
            {[110, 220, 330, 440, 550].map((x) => (
              <line key={`v${x}`} x1={x} y1="0" x2={x} y2={H} />
            ))}
          </g>

          {/* glow underlays */}
          {model.arcs.map((arc) => {
            const tier = costTier(legs[arc.legIndex].offer.totalPrice, prices);
            return (
              <path
                key={`glow-${arc.legIndex}`}
                d={arc.d}
                pathLength={1}
                className="route-arc-glow"
                stroke={TIER_HEX[tier]}
                strokeWidth={6}
                opacity={0.3}
                style={{ animationDelay: `${arc.legIndex * 160}ms` }}
                aria-hidden
              />
            );
          })}

          {/* crisp arcs */}
          {model.arcs.map((arc) => {
            const tier = costTier(legs[arc.legIndex].offer.totalPrice, prices);
            const active = hover === arc.legIndex;
            return (
              <path
                key={`arc-${arc.legIndex}`}
                d={arc.d}
                pathLength={1}
                className="route-arc"
                stroke={TIER_HEX[tier]}
                strokeWidth={active ? 2.8 : 1.8}
                opacity={hover === null || active ? 1 : 0.32}
                style={{
                  animationDelay: `${arc.legIndex * 160}ms`,
                  transition: "opacity 240ms ease, stroke-width 240ms ease",
                }}
              />
            );
          })}

          {/* invisible fat hit-paths for hover */}
          {model.arcs.map((arc) => (
            <path
              key={`hit-${arc.legIndex}`}
              d={arc.d}
              fill="none"
              stroke="transparent"
              strokeWidth={18}
              onMouseEnter={() => setHover(arc.legIndex)}
              style={{ cursor: "default" }}
            />
          ))}

          {/* fare chip at each arc apex */}
          {model.arcs.map((arc) => (
            <text
              key={`chip-${arc.legIndex}`}
              x={arc.mid.x}
              y={arc.mid.y - 4}
              textAnchor="middle"
              className="num route-node"
              style={{
                animationDelay: `${500 + arc.legIndex * 160}ms`,
                fontSize: hover === arc.legIndex ? 11 : 10,
                fontWeight: 600,
                fill: TIER_HEX[costTier(legs[arc.legIndex].offer.totalPrice, prices)],
                stroke: "rgba(8,8,10,0.9)",
                strokeWidth: 3.5,
                paintOrder: "stroke",
                transition: "font-size 200ms ease",
              }}
            >
              {money(legs[arc.legIndex].offer.totalPrice, currency)}
            </text>
          ))}

          {/* city markers */}
          {model.nodes.map((node) => {
            const isHome =
              model.closesCircuit && node.index === 0;
            const labelLeft = node.x > W - 96;
            return (
              <g
                key={node.code}
                className="route-node"
                style={{ animationDelay: `${300 + node.index * 130}ms` }}
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={9}
                  fill="none"
                  stroke={isHome ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.35)"}
                  strokeWidth={1}
                  className="node-halo"
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={5.5}
                  fill="rgba(9,9,9,0.95)"
                  stroke={isHome ? "#10b981" : "rgba(255,255,255,0.85)"}
                  strokeWidth={1.4}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={1.8}
                  fill={isHome ? "#10b981" : "#ffffff"}
                />
                <text
                  x={labelLeft ? node.x - 12 : node.x + 12}
                  y={node.y + 3.5}
                  textAnchor={labelLeft ? "end" : "start"}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    fill: "rgba(255,255,255,0.92)",
                    stroke: "rgba(8,8,10,0.9)",
                    strokeWidth: 3,
                    paintOrder: "stroke",
                  }}
                >
                  {String(node.index + 1).padStart(2, "0")} · {node.code}
                </text>
              </g>
            );
          })}
        </svg>

        {/* hovered-leg readout */}
        <div
          className={`pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/12 bg-black/70 px-3.5 py-1.5 backdrop-blur-md transition-opacity duration-200 ${
            hover !== null ? "opacity-100" : "opacity-0"
          }`}
        >
          {hover !== null && (
            <span className="num text-[10.5px] text-white/85">
              {legs[hover].origin} → {legs[hover].destination} ·{" "}
              {stampDate(legs[hover].date)} ·{" "}
              <span style={{ color: TIER_HEX[costTier(legs[hover].offer.totalPrice, prices)] }}>
                {money(legs[hover].offer.totalPrice, currency)}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* compact leg strip — the itinerary distilled into the conversation */}
      <ol className="border-t border-white/8">
        {legs.map((leg, i) => {
          const tier = costTier(leg.offer.totalPrice, prices);
          const seg = leg.offer.fromSegments[0];
          const active = hover === i;
          return (
            <li key={`${leg.origin}-${leg.destination}-${i}`}>
              <button
                type="button"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onBlur={() => setHover(null)}
                className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 px-4 py-2 text-left transition-colors duration-200 ${
                  active ? "bg-white/7" : "hover:bg-white/4"
                } ${i > 0 ? "border-t border-white/6" : ""}`}
              >
                <span className="num w-[72px] text-[10.5px] text-white/40">
                  {stampDate(leg.date)}
                </span>
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="num text-[12px] font-medium text-white/90">
                    {leg.origin}
                    <span className="px-1.5 text-white/30">→</span>
                    {leg.destination}
                  </span>
                  <span className="hidden truncate text-[10px] text-white/35 sm:inline">
                    {seg?.carrier} {seg?.flightNumber}
                    {(leg.offer.fromSegments.length > 1 ||
                      (seg?.stopCities?.length ?? 0) > 0) &&
                      " · via"}
                  </span>
                </span>
                <span
                  className="num text-[12px] font-medium"
                  style={{ color: TIER_HEX[tier] }}
                >
                  {money(leg.offer.totalPrice, currency)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
