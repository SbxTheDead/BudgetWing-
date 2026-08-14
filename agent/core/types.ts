/**
 * Internal agent types — the run-time state of one planning session and the
 * event stream the UI subscribes to.
 */
import type {
  OptimizedRoute,
  SearchResult,
  TripRequest,
} from "@shared/types";

export type AgentStatus =
  | "planning"
  | "searching"
  | "optimizing"
  | "verifying"
  | "complete"
  | "error";

export interface AgentState {
  tripRequest: TripRequest;
  /** Every search performed this run, keyed by `ORIGIN-DEST-DATE`. */
  searchResults: Map<string, SearchResult>;
  bestRoute: OptimizedRoute | null;
  budgetRemaining: number;
  iterationCount: number;
  maxIterations: number;
  status: AgentStatus;
}

export interface AgentEvent {
  type: "thinking" | "searching" | "comparing" | "result" | "error" | "complete";
  content: string;
  // Payload shape varies per event type (search plans, routes, tool results...).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  timestamp: number;
}

export type AgentEventCallback = (event: AgentEvent) => void;

/** Key used by `AgentState.searchResults`. */
export function searchKey(
  origin: string,
  destination: string,
  date: string,
): string {
  return `${origin}-${destination}-${date}`;
}
