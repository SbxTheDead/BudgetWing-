/**
 * Atlas (ATRIP) API wrapper — search.do / verify.do / order.do.
 *
 * Uses native fetch (Node 18+). All network access to Atlas goes through
 * `atlasRequest`, which applies rate limiting, a 15s timeout and one retry
 * on transient failures.
 *
 * Env: ATLAS_CLIENT_ID, ATLAS_CLIENT_SECRET, ATLAS_BASE_URL
 */

import type {
  BaggageElement,
  FlightOffer,
  FlightSegment,
  PassengerInfo,
  SearchRequest,
  SearchResult,
} from "@shared/types";

const DEFAULT_BASE_URL = "https://sandbox.atriptech.com";
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 2_000;
const LOG_PREFIX = "[Atlas]";

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sliding window limiter: at most `limit` acquisitions in any `windowMs` span.
 * Callers await `acquire()` and are released in roughly arrival order.
 */
export class SlidingWindowRateLimiter {
  private readonly hits: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async acquire(): Promise<void> {
    // Single-threaded event loop: the check-then-push below is atomic, so a
    // woken waiter can never push past the limit.
    for (;;) {
      const now = Date.now();
      while (this.hits.length > 0 && now - this.hits[0] >= this.windowMs) {
        this.hits.shift();
      }
      if (this.hits.length < this.limit) {
        this.hits.push(now);
        return;
      }
      await sleep(this.windowMs - (now - this.hits[0]) + 1);
    }
  }
}

/** search.do — 10 requests per second. */
export class SearchRateLimiter extends SlidingWindowRateLimiter {
  constructor() {
    super(10, 1_000);
  }
}

/** verify.do + order.do — 60 requests per minute (shared budget). */
export class VerifyRateLimiter extends SlidingWindowRateLimiter {
  constructor() {
    super(60, 60_000);
  }
}

const searchLimiter = new SearchRateLimiter();
const verifyLimiter = new VerifyRateLimiter();

// ---------------------------------------------------------------------------
// Config + transport
// ---------------------------------------------------------------------------

interface AtlasConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

class AtlasError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AtlasError";
  }
}

function getConfig(): AtlasConfig {
  const clientId = process.env.ATLAS_CLIENT_ID;
  const clientSecret = process.env.ATLAS_CLIENT_SECRET;
  const baseUrl = (process.env.ATLAS_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");

  if (!clientId || !clientSecret) {
    throw new AtlasError(
      "Missing credentials: set ATLAS_CLIENT_ID and ATLAS_CLIENT_SECRET",
    );
  }
  return { baseUrl, clientId, clientSecret };
}

function isRetryable(error: unknown): boolean {
  // 5xx, plus transport-level failures (timeout, DNS, socket reset).
  if (error instanceof AtlasError) {
    return error.status !== undefined && error.status >= 500;
  }
  return error instanceof Error;
}

async function postOnce(
  path: string,
  body: unknown,
  config: AtlasConfig,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-atlas-client-id": config.clientId,
        "x-atlas-client-secret": config.clientSecret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new AtlasError(
        `${path} failed with HTTP ${response.status}: ${text.slice(0, 300)}`,
        response.status,
      );
    }

    const parsed: unknown = text.length > 0 ? JSON.parse(text) : {};
    if (!isRecord(parsed)) {
      throw new AtlasError(`${path} returned a non-object payload`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AtlasError(`${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Rate-limited POST with a single retry on transient failures. */
async function atlasRequest(
  path: string,
  body: unknown,
  limiter: SlidingWindowRateLimiter,
): Promise<Record<string, unknown>> {
  const config = getConfig();

  await limiter.acquire();
  try {
    return await postOnce(path, body, config);
  } catch (error) {
    if (!isRetryable(error)) throw error;
    console.warn(
      `${LOG_PREFIX} ${path} transient failure, retrying in ${RETRY_DELAY_MS}ms:`,
      describe(error),
    );
    await sleep(RETRY_DELAY_MS);
    await limiter.acquire();
    return postOnce(path, body, config);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Response readers (Atlas payloads are loosely typed, so read defensively)
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** First key that carries a usable value — Atlas spells fields inconsistently. */
function pick(record: JsonRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "y", "yes", "1"].includes(normalized)) return true;
    if (["false", "n", "no", "0"].includes(normalized)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (isRecord(item) ? str(pick(item, "code", "name", "type")) : str(item)))
    .filter((item) => item.length > 0);
}

/** Atlas nests the payload under `data` in most sandbox responses. */
function payload(response: JsonRecord): JsonRecord {
  const data = response["data"];
  return isRecord(data) ? data : response;
}

function errorMessage(response: JsonRecord): string | undefined {
  const code = str(pick(response, "errorCode", "code", "status"));
  const message = str(pick(response, "errorMsg", "errorMessage", "message", "msg"));
  const ok = code === "" || code === "0" || code === "200" || code.toUpperCase() === "SUCCESS";
  if (ok) return undefined;
  return message.length > 0 ? `${code}: ${message}` : code;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function toSegment(raw: JsonRecord): FlightSegment {
  return {
    carrier: str(pick(raw, "carrier", "airline", "marketingCarrier")),
    flightNumber: str(pick(raw, "flightNumber", "flightNo", "flightNum")),
    depAirport: str(pick(raw, "depAirport", "departureAirport", "fromAirport")),
    arrAirport: str(pick(raw, "arrAirport", "arrivalAirport", "toAirport")),
    depTime: str(pick(raw, "depTime", "departureTime")),
    arrTime: str(pick(raw, "arrTime", "arrivalTime")),
    duration: num(pick(raw, "duration", "flyingTime", "journeyTime")),
    cabinClass: str(pick(raw, "cabinClass", "cabin", "bookingClass")),
    fareFamily: optionalStr(pick(raw, "fareFamily", "fareFamilyName", "brandName")),
    seatCount: optionalNum(pick(raw, "seatCount", "availableSeat", "seats")),
    stopCities: stopCities(raw),
  };
}

function stopCities(raw: JsonRecord): string[] | undefined {
  const value = pick(raw, "stopCities", "stopCity", "stopAirports");
  if (typeof value === "string") {
    const list = value.split(/[,/]/).map((city) => city.trim()).filter(Boolean);
    return list.length > 0 ? list : undefined;
  }
  const list = strings(value);
  return list.length > 0 ? list : undefined;
}

function toBaggage(raw: JsonRecord): BaggageElement {
  return {
    segmentNo: num(pick(raw, "segmentNo", "segmentIndex", "segmentNum")),
    passengerType: str(pick(raw, "passengerType", "paxType"), "ADT"),
    baggagePiece: num(pick(raw, "baggagePiece", "piece", "pieces")),
    baggageWeight: num(pick(raw, "baggageWeight", "weight")),
    baggageSize: optionalStr(pick(raw, "baggageSize", "size", "dimension")),
  };
}

function optionalStr(value: unknown): string | undefined {
  const result = str(value);
  return result.length > 0 ? result : undefined;
}

function optionalNum(value: unknown): number | undefined {
  const value_ = num(value, Number.NaN);
  return Number.isFinite(value_) ? value_ : undefined;
}

function priceParts(source: JsonRecord): {
  adultPrice: number;
  adultTax: number;
  transactionFeePerPax: number;
} {
  return {
    adultPrice: num(pick(source, "adultPrice", "adtFare", "adultFare")),
    adultTax: num(pick(source, "adultTax", "adtTax")),
    transactionFeePerPax: num(
      pick(source, "transactionFeePerPax", "transactionFee", "serviceFeePerPax"),
    ),
  };
}

function toOffer(raw: JsonRecord, fallbackCurrency: string): FlightOffer | null {
  const routingIdentifier = str(pick(raw, "routingIdentifier", "routingId", "routingIdentify"));
  if (routingIdentifier.length === 0) return null;

  const rule = isRecord(raw["rule"]) ? raw["rule"] : {};
  const { adultPrice, adultTax, transactionFeePerPax } = priceParts(raw);
  const retSegments = records(pick(raw, "retSegments", "returnSegments")).map(toSegment);

  return {
    routingIdentifier,
    currency: str(pick(raw, "currency"), fallbackCurrency),
    adultPrice,
    adultTax,
    transactionFeePerPax,
    totalPrice: roundMoney(adultPrice + adultTax + transactionFeePerPax),
    fromSegments: records(pick(raw, "fromSegments", "segments", "goSegments")).map(toSegment),
    retSegments: retSegments.length > 0 ? retSegments : undefined,
    baggageElements: records(pick(rule, "baggageElements") ?? pick(raw, "baggageElements")).map(
      toBaggage,
    ),
    refundable: bool(pick(rule, "refundable", "canRefund") ?? pick(raw, "refundable")),
    changeable: bool(pick(rule, "changeable", "canChange") ?? pick(raw, "changeable")),
    ancillarySupported: strings(pick(raw, "ancillarySupported", "ancillaries")),
    refreshTime: optionalStr(pick(raw, "refreshTime")),
    expireTime: optionalStr(pick(raw, "expireTime", "expiredTime")),
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Price cache — lets verifyFare detect drift against the searched price
// ---------------------------------------------------------------------------

const MAX_CACHED_PRICES = 5_000;
const searchedPrices = new Map<string, number>();

function rememberPrice(routingIdentifier: string, totalPrice: number): void {
  if (searchedPrices.size >= MAX_CACHED_PRICES) {
    const oldest = searchedPrices.keys().next();
    if (!oldest.done) searchedPrices.delete(oldest.value);
  }
  searchedPrices.set(routingIdentifier, totalPrice);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function emptyResult(params: SearchRequest): SearchResult {
  return {
    origin: params.fromCity,
    destination: params.toCity,
    date: params.fromDate,
    offers: [],
    searchedAt: Date.now(),
  };
}

/**
 * search.do — returns offers sorted by total price ascending.
 * Never throws: an unreachable API or a route with no flights both yield an
 * empty `offers` array so callers can keep exploring other routes/dates.
 */
export async function searchFlights(params: SearchRequest): Promise<SearchResult> {
  const label = `${params.fromCity}→${params.toCity} ${params.fromDate}`;

  try {
    const response = await atlasRequest("/search.do", params, searchLimiter);

    const failure = errorMessage(response);
    if (failure) {
      console.error(`${LOG_PREFIX} search.do rejected ${label} — ${failure}`);
      return emptyResult(params);
    }

    const routings = records(pick(payload(response), "routings", "routingList", "routing"));
    const offers = routings
      .map((routing) => toOffer(routing, params.currency))
      .filter((offer): offer is FlightOffer => offer !== null)
      .sort((a, b) => a.totalPrice - b.totalPrice);

    for (const offer of offers) rememberPrice(offer.routingIdentifier, offer.totalPrice);

    return {
      origin: params.fromCity,
      destination: params.toCity,
      date: params.fromDate,
      offers,
      searchedAt: Date.now(),
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} search.do failed for ${label}:`, describe(error));
    return emptyResult(params);
  }
}

export interface VerifyResult {
  verified: boolean;
  sessionId?: string;
  priceChanged?: boolean;
  newPrice?: number;
}

/**
 * verify.do — confirms a fare is still bookable and returns the session used
 * by `createOrder`. `expectedPrice` overrides the price cached at search time
 * when comparing for price drift.
 */
export async function verifyFare(
  routingIdentifier: string,
  expectedPrice?: number,
): Promise<VerifyResult> {
  try {
    const response = await atlasRequest(
      "/verify.do",
      { routingIdentifier },
      verifyLimiter,
    );

    const failure = errorMessage(response);
    if (failure) {
      console.error(`${LOG_PREFIX} verify.do rejected ${routingIdentifier} — ${failure}`);
      return { verified: false };
    }

    const data = payload(response);
    const routing = isRecord(pick(data, "routing")) ? (data["routing"] as JsonRecord) : data;
    const sessionId = optionalStr(pick(data, "sessionId", "session", "shoppingKey", "orderSession"));
    const verified = bool(pick(data, "verified", "success", "available"), sessionId !== undefined);

    if (!verified || !sessionId) {
      console.warn(
        `${LOG_PREFIX} verify.do returned no bookable session for ${routingIdentifier}`,
      );
      return { verified: false, sessionId };
    }

    const parts = priceParts(routing);
    const newPrice = roundMoney(
      parts.adultPrice + parts.adultTax + parts.transactionFeePerPax,
    );
    const baseline = expectedPrice ?? searchedPrices.get(routingIdentifier);

    if (newPrice <= 0 || baseline === undefined) {
      return { verified: true, sessionId };
    }

    const priceChanged = Math.abs(newPrice - baseline) >= 0.01;
    if (priceChanged) {
      console.warn(
        `${LOG_PREFIX} price changed for ${routingIdentifier}: ${baseline} → ${newPrice}`,
      );
      rememberPrice(routingIdentifier, newPrice);
    }
    return { verified: true, sessionId, priceChanged, newPrice };
  } catch (error) {
    console.error(`${LOG_PREFIX} verify.do failed for ${routingIdentifier}:`, describe(error));
    return { verified: false };
  }
}

export interface OrderResult {
  orderNo: string;
  status: string;
}

/**
 * order.do — books the verified session. Throws on failure: unlike search,
 * a booking error must reach the caller instead of being swallowed.
 */
export async function createOrder(
  sessionId: string,
  passengers: PassengerInfo[],
): Promise<OrderResult> {
  if (passengers.length === 0) {
    throw new AtlasError("createOrder requires at least one passenger");
  }

  const body = {
    sessionId,
    passengers: passengers.map((passenger) => ({
      firstName: passenger.firstName,
      lastName: passenger.lastName,
      gender: passenger.gender,
      birthday: passenger.birthday,
      nationality: passenger.nationality,
      cardType: passenger.cardType,
      cardNum: passenger.cardNo,
      cardExpired: passenger.cardExpiry,
      passengerType: passenger.passengerType,
    })),
  };

  try {
    const response = await atlasRequest("/order.do", body, verifyLimiter);

    const failure = errorMessage(response);
    if (failure) {
      throw new AtlasError(`order.do rejected session ${sessionId} — ${failure}`);
    }

    const data = payload(response);
    const orderNo = str(pick(data, "orderNo", "orderNum", "orderId"));
    if (orderNo.length === 0) {
      throw new AtlasError(`order.do returned no order number for session ${sessionId}`);
    }
    return {
      orderNo,
      status: str(pick(data, "status", "orderStatus", "state"), "UNKNOWN"),
    };
  } catch (error) {
    console.error(`${LOG_PREFIX} order.do failed for session ${sessionId}:`, describe(error));
    throw error;
  }
}

/**
 * Fan out many searches at once. The 10 QPS limiter throttles the queue, so
 * ~70 searches complete in ~7s. Results keep the input order and include
 * empty results for routes with no flights.
 */
export async function batchSearch(searches: SearchRequest[]): Promise<SearchResult[]> {
  if (searches.length === 0) return [];

  const started = Date.now();
  const results = await Promise.all(searches.map((params) => searchFlights(params)));
  const withOffers = results.filter((result) => result.offers.length > 0).length;

  console.log(
    `${LOG_PREFIX} batchSearch: ${withOffers}/${results.length} routes with offers in ${
      Date.now() - started
    }ms`,
  );
  return results;
}
