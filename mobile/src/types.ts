/**
 * Local copies of the shared BudgetWing types (see ../../shared/types.ts in
 * the parent project). Kept standalone so the mobile app has zero build-time
 * coupling to the Next.js workspace.
 */

export interface FlightSegment {
  carrier: string;
  flightNumber: string;
  depAirport: string;
  arrAirport: string;
  depTime: string;
  arrTime: string;
  duration: number;
  cabinClass: string;
  fareFamily?: string;
  seatCount?: number;
  stopCities?: string[];
}

export interface BaggageElement {
  segmentNo: number;
  passengerType: string;
  baggagePiece: number;
  baggageWeight: number;
  baggageSize?: string;
}

export interface FlightOffer {
  routingIdentifier: string;
  currency: string;
  adultPrice: number;
  adultTax: number;
  transactionFeePerPax: number;
  totalPrice: number;
  fromSegments: FlightSegment[];
  retSegments?: FlightSegment[];
  baggageElements: BaggageElement[];
  refundable: boolean;
  changeable: boolean;
  ancillarySupported: string[];
  refreshTime?: string;
  expireTime?: string;
}

export interface TripRequest {
  budget: number;
  currency: string;
  cities: string[];
  startDate: string;
  endDate: string;
  flexDays: number;
  passengers: number;
  preferences?: {
    maxStops?: number;
    preferDirect?: boolean;
    needBaggage?: boolean;
    preferredAirlines?: string[];
  };
}

export interface RouteLeg {
  origin: string;
  destination: string;
  date: string;
  offer: FlightOffer;
  alternativeDate?: string;
  savings?: number;
}

export interface OptimizedRoute {
  legs: RouteLeg[];
  totalCost: number;
  savings: number;
  reasoning: string;
  alternativesConsidered: number;
}

/** One SSE frame as emitted by POST /api/agent: `data: {...}\n\n`. */
export interface AgentMessage {
  type: "thinking" | "searching" | "result" | "error" | "complete";
  content: string;
  // Payload shape varies per message type (offers, routes, errors, ...).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  timestamp: number;
}

/** A rendered chat row — user utterance or one decoded agent frame. */
export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  kind: "text" | "thinking" | "search" | "offers" | "summary" | "error";
  content: string;
  timestamp: number;
  offers?: FlightOffer[];
  leg?: {
    origin: string;
    destination: string;
    date: string;
    avgPrice?: number;
    cheapestPrice?: number;
    altDate?: string;
    altSavings?: number;
  };
  route?: OptimizedRoute;
}
