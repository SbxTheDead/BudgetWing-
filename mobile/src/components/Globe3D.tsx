import { useEffect, useRef } from "react";
import * as THREE from "three";
import { coordsOf, getCity } from "../lib/cities";

/**
 * The centerpiece: a fully procedural 3D globe in raw three.js.
 * No textures, no network — everything (ocean sphere, dotted continents,
 * stars, glows) is generated at runtime so it works offline on-device.
 */

export type ArcState = "searching" | "quoted" | "locked";

export interface GlobeArc {
  origin: string;
  destination: string;
  state: ArcState;
  /** Cheapest leg of the itinerary — drawn in mint instead of white. */
  cheapest?: boolean;
}

interface Globe3DProps {
  /** Itinerary cities in visiting order (IATA codes). */
  cityCodes: string[];
  arcs: GlobeArc[];
  /** Leg currently being priced — its endpoints pulse. */
  activeLeg: { origin: string; destination: string } | null;
}

const R = 1; // globe radius
const MINT = 0x10b981;
const WHITE = 0xf2f2f2;
const AMBER = 0xfbbf24;

/** lat/lng → point on a sphere of radius `r` (matches web map orientation). */
function latLngToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

/** Deterministic value-noise used to fake continent landmasses. */
function landNoise(lat: number, lon: number): number {
  const x = (lon * Math.PI) / 180;
  const y = (lat * Math.PI) / 180;
  return (
    Math.sin(x * 2.1 + 1.3) * Math.cos(y * 2.7 - 0.6) * 0.45 +
    Math.sin(x * 4.7 - 2.1) * Math.sin(y * 3.9 + 1.1) * 0.3 +
    Math.cos(x * 8.3 + y * 6.1) * 0.18 +
    Math.sin(x * 13.7 + 4.2) * Math.cos(y * 11.3 + 2.2) * 0.12
  );
}

/** Radial-gradient sprite texture for glowing dots — drawn on a canvas. */
function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.6, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Disposes an object tree's geometries/materials/textures. */
function deepDispose(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as THREE.Mesh).material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else if (material) material.dispose();
  });
}

export default function Globe3D({ cityCodes, arcs, activeLeg }: Globe3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    content: THREE.Group;
  } | null>(null);
  // Live values read inside the RAF loop without re-creating the scene.
  const pulseRef = useRef<Set<string>>(new Set());
  const markersRef = useRef<Map<string, THREE.Object3D>>(new Map());

  // ------------------------------------------------------------------
  // One-time scene construction
  // ------------------------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.35, 3.1);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1);
    mount.appendChild(renderer.domElement);

    const glowTexture = makeGlowTexture();

    // --- globe group: everything that rotates together ------------------
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    // Ocean sphere — near-black with a faint rim.
    const ocean = new THREE.Mesh(
      new THREE.SphereGeometry(R, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x050505 }),
    );
    globeGroup.add(ocean);

    // Atmosphere halo — slightly larger additive shell.
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.015, 48, 48),
      new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.03,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    globeGroup.add(halo);

    // Latitude / longitude graticule — subtle instrument lines.
    const gratPts: number[] = [];
    for (let lat = -75; lat <= 75; lat += 15) {
      const r = R * 1.001 * Math.cos((lat * Math.PI) / 180);
      const y = R * 1.001 * Math.sin((lat * Math.PI) / 180);
      const steps = 96;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const b = ((i + 1) / steps) * Math.PI * 2;
        gratPts.push(Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(b) * r, y, Math.sin(b) * r);
      }
    }
    for (let lng = 0; lng < 180; lng += 15) {
      const rad = (lng * Math.PI) / 180;
      const steps = 96;
      for (let i = 0; i < steps; i++) {
        const a = -Math.PI / 2 + (i / steps) * Math.PI;
        const b = -Math.PI / 2 + ((i + 1) / steps) * Math.PI;
        const rr = R * 1.001;
        const pa = new THREE.Vector3(Math.cos(a) * rr * Math.cos(rad), Math.sin(a) * rr, Math.cos(a) * rr * Math.sin(rad));
        const pb = new THREE.Vector3(Math.cos(b) * rr * Math.cos(rad), Math.sin(b) * rr, Math.cos(b) * rr * Math.sin(rad));
        gratPts.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
      }
    }
    const gratGeo = new THREE.BufferGeometry();
    gratGeo.setAttribute("position", new THREE.Float32BufferAttribute(gratPts, 3));
    const graticule = new THREE.LineSegments(
      gratGeo,
      new THREE.LineBasicMaterial({ color: 0x1c1c1c, transparent: true, opacity: 0.8 }),
    );
    globeGroup.add(graticule);

    // Dotted "continents" — procedural noise threshold, evenly sampled.
    const dotPts: number[] = [];
    for (let lat = -80; lat <= 80; lat += 2.6) {
      const rowR = Math.cos((lat * Math.PI) / 180);
      const step = 2.6 / Math.max(rowR, 0.12);
      for (let lon = -180; lon < 180; lon += step) {
        if (landNoise(lat, lon) > 0.32) {
          const p = latLngToVec3(lat, lon, R * 1.002);
          dotPts.push(p.x, p.y, p.z);
        }
      }
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dotPts, 3));
    const dots = new THREE.Points(
      dotGeo,
      new THREE.PointsMaterial({
        color: 0x3f3f3f,
        size: 0.012,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
      }),
    );
    globeGroup.add(dots);

    // Content group — itinerary markers + arcs, rebuilt on prop changes.
    const content = new THREE.Group();
    globeGroup.add(content);
    sceneRef.current = { scene, content };

    // --- starfield -------------------------------------------------------
    const starPts: number[] = [];
    for (let i = 0; i < 900; i++) {
      const v = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize();
      v.multiplyScalar(28 + Math.random() * 30);
      starPts.push(v.x, v.y, v.z);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPts, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.09,
        transparent: true,
        opacity: 0.7,
        map: glowTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(stars);

    // --- interaction: drag to rotate, pinch to zoom ----------------------
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist: number | null = null;
    let userHoldUntil = 0; // auto-rotate pauses briefly after interaction
    const rotation = { x: 0.22, y: -1.9 }; // start over Southeast Asia
    let zoom = 3.1;

    const el = renderer.domElement;
    el.style.touchAction = "none";

    const onPointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };

      if (pointers.size === 1) {
        rotation.y += (cur.x - prev.x) * 0.005;
        rotation.x = Math.max(-1.2, Math.min(1.2, rotation.x + (cur.y - prev.y) * 0.005));
        userHoldUntil = performance.now() + 2500;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist !== null) {
          zoom = Math.max(1.7, Math.min(5.5, zoom * (pinchDist / dist)));
          userHoldUntil = performance.now() + 2500;
        }
        pinchDist = dist;
      }
      pointers.set(e.pointerId, cur);
    };
    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = null;
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);

    // --- sizing ----------------------------------------------------------
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // --- animation loop ----------------------------------------------------
    let raf = 0;
    const planeBeacons: { mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; speed: number; t: number }[] = [];
    // Filled by the content-rebuild effect each time arcs change.
    (scene as unknown as { __planes?: typeof planeBeacons }).__planes = planeBeacons;

    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      // Slow auto-rotation unless the user recently grabbed the globe.
      if (performance.now() > userHoldUntil) rotation.y += 0.0012;
      globeGroup.rotation.x += (rotation.x - globeGroup.rotation.x) * 0.12;
      globeGroup.rotation.y += (rotation.y - globeGroup.rotation.y) * 0.12;
      camera.position.z += (zoom - camera.position.z) * 0.12;

      // Plane dots riding each arc.
      for (const p of planeBeacons) {
        p.t = (p.t + p.speed * dt * 6) % 1;
        const pos = p.curve.getPoint(p.t);
        p.mesh.position.copy(pos);
      }

      // Pulse markers whose leg is being searched.
      markersRef.current.forEach((marker, code) => {
        const hot = pulseRef.current.has(code);
        const glow = marker.children[0] as THREE.Sprite | undefined;
        const core = marker.children[1] as THREE.Mesh | undefined;
        if (glow && core) {
          const k = hot ? 1 + 0.5 * Math.sin(t * 6) : 1;
          glow.scale.setScalar(hot ? 0.16 * k : 0.1);
          (glow.material as THREE.SpriteMaterial).opacity = hot ? 0.95 : 0.65;
          (core.material as THREE.MeshBasicMaterial).color.setHex(hot ? AMBER : MINT);
        }
      });

      stars.rotation.y = t * 0.004;
      renderer.render(scene, camera);
    };
    animate();

    // --- teardown ----------------------------------------------------------
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      deepDispose(scene);
      glowTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, []);

  // ------------------------------------------------------------------
  // Rebuild itinerary content (markers + arcs) when trip state changes
  // ------------------------------------------------------------------
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;
    const { content } = ref;

    // Clear previous content.
    while (content.children.length) {
      const child = content.children[0];
      content.remove(child);
      deepDispose(child);
    }
    markersRef.current.clear();
    const planeList = (ref.scene as unknown as { __planes?: unknown[] }).__planes;
    if (planeList) planeList.length = 0;

    const glowTexture = makeGlowTexture();
    const known = cityCodes.filter((c) => coordsOf(c));

    // City markers — glowing mint pins with additive halos.
    for (const code of known) {
      const c = getCity(code)!;
      const marker = new THREE.Group();
      marker.position.copy(latLngToVec3(c.lat, c.lon, R * 1.004));

      const haloSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: MINT,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      haloSprite.scale.setScalar(0.1);
      marker.add(haloSprite);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.016, 12, 12),
        new THREE.MeshBasicMaterial({ color: MINT }),
      );
      marker.add(core);

      content.add(marker);
      markersRef.current.set(code, marker);
    }

    // Flight arcs — lifted quadratic beziers with a travelling plane dot.
    arcs.forEach((arc, i) => {
      const co = coordsOf(arc.origin);
      const cd = coordsOf(arc.destination);
      if (!co || !cd) return;

      const a = latLngToVec3(co[0], co[1], R * 1.004);
      const b = latLngToVec3(cd[0], cd[1], R * 1.004);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const angular = a.angleTo(b);
      const lift = R * (0.12 + angular * 0.38);
      mid.normalize().multiplyScalar(R + lift);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);

      const color =
        arc.state === "searching"
          ? AMBER
          : arc.cheapest || arcs.length === 1
            ? MINT
            : WHITE;

      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, 0.0045, 6, false),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: arc.state === "searching" ? 0.95 : 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      content.add(tube);

      // Departure/arrival endcaps.
      for (const end of [a, b]) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.02, 0.032, 24),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        ring.position.copy(end);
        ring.lookAt(end.clone().multiplyScalar(2));
        content.add(ring);
      }

      // Plane dot riding this arc.
      const plane = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      const planeGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      planeGlow.scale.setScalar(0.08);
      plane.add(planeGlow);
      content.add(plane);

      const planes = (ref.scene as unknown as {
        __planes?: { mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; speed: number; t: number }[];
      }).__planes;
      planes?.push({ mesh: plane, curve, speed: 0.08 + i * 0.012, t: (i * 0.37) % 1 });
    });

    return () => glowTexture.dispose();
  }, [cityCodes, arcs]);

  // Live pulse targets for the leg currently being priced.
  useEffect(() => {
    pulseRef.current = activeLeg
      ? new Set([activeLeg.origin, activeLeg.destination])
      : new Set();
  }, [activeLeg]);

  return <div ref={mountRef} className="globe-mount" aria-label="3D route globe" />;
}
