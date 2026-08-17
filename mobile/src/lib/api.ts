/**
 * Configurable backend base URL.
 *
 * Defaults to http://10.0.2.2:3000 — the Android emulator's alias for the
 * host machine's loopback, so an emulator build reaches a `npm run dev`
 * Next.js server running on the same PC. On a physical device, point it at
 * the PC's LAN IP (e.g. http://192.168.1.20:3000) or a deployed backend.
 * The value is editable in Settings and persisted to localStorage.
 */

const STORAGE_KEY = "budgetwing.apiBase";

export const DEFAULT_API_BASE = "http://10.0.2.2:3000";

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getApiBase(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? normalize(stored) : DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

export function setApiBase(url: string): string {
  const value = normalize(url);
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private mode / storage full — the value still applies for this session.
  }
  return value;
}

/** Full endpoint for the SSE planner stream. */
export function agentEndpoint(): string {
  return `${getApiBase()}/api/agent`;
}
