"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { LegState } from "@/app/hooks/useAgent";
import { getCity } from "@/app/lib/cities";
import {
  costTier,
  money,
  stampDate,
  TIER_HEX,
  TIER_LABEL,
  type CostTier,
} from "@/app/lib/format";

interface TripMapProps {
  /** City codes in planned circuit order. */
  cities: string[];
  legs: LegState[];
  activeLeg: { origin: string; destination: string } | null;
  statusLine?: string | null;
  currency?: string;
}

type LatLng = [number, number];

/**
 * Quadratic bezier between two airports, bowed perpendicular to the path so
 * legs read as flight arcs instead of straight rhumb lines.
 */
function arcPoints(from: LatLng, to: LatLng, steps = 56): LatLng[] {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  const midLat = (lat1 + lat2) / 2;
  const midLon = (lon1 + lon2) / 2;
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const span = Math.hypot(dLat, dLon) || 1;

  // Bow height tapers on very long legs so arcs never balloon off-screen.
  const lift = Math.min(0.26, 0.9 / Math.sqrt(span + 2)) * span;
  const ctrl: LatLng = [
    midLat + (-dLon / span) * lift * 0.85,
    midLon + (dLat / span) * lift * 0.85,
  ];

  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [
      u * u * lat1 + 2 * u * t * ctrl[0] + t * t * lat2,
      u * u * lon1 + 2 * u * t * ctrl[1] + t * t * lon2,
    ] as LatLng;
  });
}

type ArcState = "idle" | "searching" | "priced";

interface Arc {
  key: string;
  origin: string;
  destination: string;
  points: LatLng[];
  state: ArcState;
  tier: CostTier;
  price?: number;
  date?: string;
  color: string;
}

/** Keeps every plotted airport inside the viewport. */
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const signature = points.map((p) => p.join()).join("|");

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.flyTo(points[0], 5, { duration: 1.2 });
      return;
    }
    map.flyToBounds(L.latLngBounds(points).pad(0.26), {
      duration: 1.5,
      easeLinearity: 0.22,
      maxZoom: 7,
    });
    // Bounds only need recomputing when the plotted set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);

  return null;
}

/** Leaflet needs a nudge whenever the panel is resized by the layout. */
function ResizeGuard() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/** A plane glyph flying the arc that is currently being searched. */
function FlyingPlane({ arcKey, points }: { arcKey: string; points: LatLng[] }) {
  const map = useMap();
  const pointsRef = useRef(points);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    const path = pointsRef.current;
    if (path.length < 2) return;

    const marker = L.marker(path[0], {
      interactive: false,
      keyboard: false,
      zIndexOffset: 900,
      icon: L.divIcon({
        className: "",
        html: '<span class="plane-mark">\u2708</span>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    }).addTo(map);

    const DURATION = 2400;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = ((now - start) % DURATION) / DURATION;
      const scaled = t * (path.length - 1);
      const i = Math.min(path.length - 2, Math.floor(scaled));
      const f = scaled - i;
      const [aLat, aLon] = path[i];
      const [bLat, bLon] = path[i + 1];

      marker.setLatLng([aLat + (bLat - aLat) * f, aLon + (bLon - aLon) * f]);

      const glyph = marker.getElement()?.firstElementChild as HTMLElement | null;
      if (glyph) {
        const angle = (Math.atan2(bLat - aLat, bLon - aLon) * 180) / Math.PI;
        glyph.style.transform = `rotate(${-angle}deg)`;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      marker.remove();
    };
  }, [map, arcKey]);

  return null;
}

function pinIcon(
  code: string,
  index: number,
  state: "idle" | "active" | "visited",
) {
  const modifier =
    state === "active" ? "pin-active" : state === "visited" ? "pin-visited" : "";
  return L.divIcon({
    className: "",
    html: `<div class="pin ${modifier}">
      <div class="pin-ring"></div>
      <div class="pin-core"></div>
      <div class="pin-label">${String(index + 1).padStart(2, "0")} · ${code}</div>
    </div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function TripMap({
  cities,
  legs,
  activeLeg,
  statusLine,
  currency = "USD",
}: TripMapProps) {
  const plotted = useMemo(
    () => cities.map((code) => getCity(code)).filter(Boolean).map((c) => c!),
    [cities],
  );

  const points = useMemo<LatLng[]>(
    () => plotted.map((c) => [c.lat, c.lon] as LatLng),
    [plotted],
  );

  const prices = useMemo(
    () => legs.map((l) => l.price ?? 0).filter((p) => p > 0),
    [legs],
  );

  const arcs = useMemo<Arc[]>(() => {
    // Planned circuit: every hop plus the return to the departure city.
    const circuit =
      plotted.length > 1 ? [...plotted, plotted[0]] : [];
    const planned = circuit.slice(0, -1).map((from, i) => ({
      from,
      to: circuit[i + 1],
    }));

    // Any leg the agent reported that isn't part of the planned circuit
    // (e.g. after it re-orders cities) still deserves an arc.
    const extras = legs
      .filter(
        (leg) =>
          !planned.some(
            (p) => p.from.code === leg.origin && p.to.code === leg.destination,
          ),
      )
      .map((leg) => ({ from: getCity(leg.origin), to: getCity(leg.destination) }))
      .filter((p) => p.from && p.to)
      .map((p) => ({ from: p.from!, to: p.to! }));

    return [...planned, ...extras].map(({ from, to }) => {
      const leg = legs.find(
        (l) => l.origin === from.code && l.destination === to.code,
      );
      const isActive =
        activeLeg?.origin === from.code && activeLeg?.destination === to.code;

      const state: ArcState = isActive
        ? "searching"
        : leg?.price
          ? "priced"
          : "idle";
      const tier = costTier(leg?.price ?? 0, prices.length ? prices : [1]);

      return {
        key: `${from.code}-${to.code}-${state}-${leg?.price ?? 0}`,
        origin: from.code,
        destination: to.code,
        points: arcPoints([from.lat, from.lon], [to.lat, to.lon]),
        state,
        tier,
        price: leg?.price,
        date: leg?.date,
        color:
          state === "priced"
            ? TIER_HEX[tier]
            : state === "searching"
              ? "#ffffff"
              : "#7a7a7a",
      };
    });
  }, [plotted, legs, activeLeg, prices]);

  const searchingArc = arcs.find((a) => a.state === "searching");
  const visited = new Set(
    legs.flatMap((l) => (l.price ? [l.origin, l.destination] : [])),
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapContainer
        center={[12, 104]}
        zoom={4}
        zoomControl
        scrollWheelZoom
        worldCopyJump
        attributionControl
        className="h-full w-full"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
          subdomains="abcd"
          maxZoom={19}
          detectRetina
        />
        {/* labels on their own layer stay crisp above the route arcs */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap &copy; CARTO'
          subdomains="abcd"
          maxZoom={19}
          detectRetina
        />

        <ResizeGuard />
        <FitBounds points={points} />

        {arcs.map((arc) => (
          <Polyline
            key={arc.key}
            positions={arc.points}
            pathOptions={{
              className:
                arc.state === "searching"
                  ? "arc-probe"
                  : arc.state === "priced"
                    ? "arc"
                    : "arc-idle",
              color: arc.color,
              weight: arc.state === "priced" ? 2.4 : 1.5,
              opacity: arc.state === "idle" ? 0.32 : 0.95,
              dashArray: arc.state === "idle" ? "3 8" : undefined,
            }}
          >
            {arc.price ? (
              <Tooltip direction="top" opacity={1} sticky>
                <span className="num text-[10.5px] tracking-wide">
                  {arc.origin} → {arc.destination} · {money(arc.price, currency)}
                  {arc.date ? ` · ${stampDate(arc.date)}` : ""} ·{" "}
                  {TIER_LABEL[arc.tier]}
                </span>
              </Tooltip>
            ) : null}
          </Polyline>
        ))}

        {/* soft glow underlay for priced legs */}
        {arcs
          .filter((a) => a.state === "priced")
          .map((arc) => (
            <Polyline
              key={`glow-${arc.key}`}
              positions={arc.points}
              interactive={false}
              pathOptions={{
                className: "arc-glow",
                color: arc.color,
                weight: 7,
              }}
            />
          ))}

        {searchingArc && (
          <FlyingPlane arcKey={searchingArc.key} points={searchingArc.points} />
        )}

        {plotted.map((city, i) => {
          const isActive =
            activeLeg?.origin === city.code ||
            activeLeg?.destination === city.code;
          return (
            <Marker
              key={city.code}
              position={[city.lat, city.lon]}
              icon={pinIcon(
                city.code,
                i,
                isActive ? "active" : visited.has(city.code) ? "visited" : "idle",
              )}
            >
              <Tooltip direction="bottom" offset={[0, 10]} opacity={1}>
                <span className="num text-[10.5px] tracking-wide">
                  {city.city}, {city.country}
                </span>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      {/* depth shading above tiles, below overlays */}
      <div className="map-shade pointer-events-none absolute inset-0 z-[450]" />

      {/* ---- floating overlays ---- */}
      <div className="pointer-events-none absolute inset-0 z-[500]">
        <div className="glass-soft absolute left-4 top-4 flex items-center gap-2 rounded-full px-3 py-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              legs.some((l) => !l.price) && legs.length > 0
                ? "bg-white anim-pulse"
                : "bg-mint"
            }`}
          />
          <span className="text-[11px] font-medium text-white/70">
            Route map
          </span>
        </div>

        <div className="glass-soft absolute right-4 top-4 rounded-full px-3 py-1.5 text-right">
          <span className="num text-[10.5px] text-white/55">
            {plotted.length} airports · {legs.filter((l) => l.price).length}/
            {arcs.length} legs priced
          </span>
        </div>

        {/* quiet legend — swatches only until hovered */}
        <div className="glass-soft group absolute bottom-4 left-4 flex items-center gap-3.5 rounded-full px-3.5 py-2 opacity-75 transition-opacity duration-300 hover:opacity-100">
          {(["cheap", "mid", "pricey"] as CostTier[]).map((tier) => (
            <span key={tier} className="flex items-center gap-1.5">
              <span
                className="h-[2px] w-4 rounded-full"
                style={{ background: TIER_HEX[tier] }}
              />
              <span className="text-[9.5px] uppercase tracking-wider text-white/0 transition-colors duration-300 group-hover:text-white/45">
                {tier}
              </span>
            </span>
          ))}
        </div>

        {statusLine && (
          <div className="anim-rise glass-soft absolute bottom-4 left-1/2 max-w-[76%] -translate-x-1/2 rounded-[14px] px-4 py-2">
            <span className="text-[11px] leading-relaxed text-white/80">
              {statusLine}
            </span>
          </div>
        )}

        {plotted.length === 0 && (
          <div className="absolute inset-0 grid place-items-center bg-base/40 backdrop-blur-[2px]">
            <div className="anim-fade-in text-center">
              <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-full border border-dashed border-white/15">
                <span
                  className="absolute inset-0 rounded-full border border-white/10 anim-pulse"
                  aria-hidden
                />
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(255,255,255,0.55)"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M15.2 8.8l-2 4.4-4.4 2 2-4.4 4.4-2Z" />
                </svg>
              </span>
              <p className="mt-4 text-[14px] font-medium text-white/85">
                Awaiting flight plan
              </p>
              <p className="mx-auto mt-2 max-w-[260px] text-[12px] leading-relaxed text-white/45">
                Name your budget and cities in the chat — arcs are drawn as
                fares come back.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
