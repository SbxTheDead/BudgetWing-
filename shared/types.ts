// Flight search types
export interface SearchRequest {
  tripType: "1" | "2";
  adultNum: number;
  childNum: number;
  infantNum: number;
  fromCity: string;
  toCity: string;
  fromDate: string; // YYYYMMDD
  retDate?: string;
  currency: string;
  includeMultipleFareFamily?: boolean;
}

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
  totalPrice: number; // calculated: adultPrice + adultTax + transactionFeePerPax
  fromSegments: FlightSegment[];
  retSegments?: FlightSegment[];
  baggageElements: BaggageElement[];
  refundable: boolean;
  changeable: boolean;
  ancillarySupported: string[];
  refreshTime?: string;
  expireTime?: string;
}

export interface SearchResult {
  origin: string;
  destination: string;
  date: string;
  offers: FlightOffer[];
  searchedAt: number;
}

// Booking types
export interface PassengerInfo {
  firstName: string;
  lastName: string;
  gender: "M" | "F";
  birthday: string; // YYYYMMDD
  nationality: string; // 2-letter country code
  cardType: "PP"; // passport
  cardNo: string;
  cardExpiry: string; // YYYYMMDD
  passengerType: "ADT" | "CHD" | "INF";
}

// Agent types
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

export interface OptimizedRoute {
  legs: RouteLeg[];
  totalCost: number;
  savings: number;
  reasoning: string;
  alternativesConsidered: number;
}

export interface RouteLeg {
  origin: string;
  destination: string;
  date: string;
  offer: FlightOffer;
  alternativeDate?: string;
  savings?: number;
}

// Agent message types for streaming
export interface AgentMessage {
  type: "thinking" | "searching" | "result" | "error" | "complete";
  content: string;
  // Payload shape varies per message type (offers, routes, errors, ...).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  timestamp: number;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  data?: OptimizedRoute | SearchResult[];
  timestamp: number;
}
