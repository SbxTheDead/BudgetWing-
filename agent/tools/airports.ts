/**
 * Airport registry for the agent: IATA lookup, nearby-airport substitution,
 * great-circle distance and fuzzy city→IATA resolution.
 *
 * Coverage mirrors `app/lib/cities.ts`, the UI-facing registry — anything the
 * request parser accepts has to resolve here or the agent would reject a city
 * the UI just offered. This registry is what the agent reasons over, so it also
 * knows which airports substitute for each other.
 */

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  /** Nearby airports serving the same city/region, cheapest-first. */
  alternatives?: string[];
}

export const AIRPORTS: Record<string, Airport> = {
  // --- Southeast Asia -------------------------------------------------------
  SIN: {
    iata: "SIN",
    name: "Changi",
    city: "Singapore",
    country: "Singapore",
    lat: 1.3644,
    lng: 103.9915,
    alternatives: ["JHB"],
  },
  KUL: {
    iata: "KUL",
    name: "Kuala Lumpur International",
    city: "Kuala Lumpur",
    country: "Malaysia",
    lat: 2.7456,
    lng: 101.7099,
  },
  JHB: {
    iata: "JHB",
    name: "Senai",
    city: "Johor Bahru",
    country: "Malaysia",
    lat: 1.6411,
    lng: 103.6698,
    alternatives: ["SIN"],
  },
  PEN: {
    iata: "PEN",
    name: "Penang International",
    city: "Penang",
    country: "Malaysia",
    lat: 5.2971,
    lng: 100.2769,
  },
  BKK: {
    iata: "BKK",
    name: "Suvarnabhumi",
    city: "Bangkok",
    country: "Thailand",
    lat: 13.69,
    lng: 100.7501,
    alternatives: ["DMK"],
  },
  DMK: {
    iata: "DMK",
    name: "Don Mueang",
    city: "Bangkok",
    country: "Thailand",
    lat: 13.9126,
    lng: 100.6068,
    alternatives: ["BKK"],
  },
  HKT: {
    iata: "HKT",
    name: "Phuket International",
    city: "Phuket",
    country: "Thailand",
    lat: 8.1132,
    lng: 98.3169,
  },
  CNX: {
    iata: "CNX",
    name: "Chiang Mai International",
    city: "Chiang Mai",
    country: "Thailand",
    lat: 18.7669,
    lng: 98.9626,
  },
  SGN: {
    iata: "SGN",
    name: "Tan Son Nhat",
    city: "Ho Chi Minh City",
    country: "Vietnam",
    lat: 10.8189,
    lng: 106.6519,
  },
  HAN: {
    iata: "HAN",
    name: "Noi Bai",
    city: "Hanoi",
    country: "Vietnam",
    lat: 21.2212,
    lng: 105.8072,
  },
  DPS: {
    iata: "DPS",
    name: "Ngurah Rai",
    city: "Bali",
    country: "Indonesia",
    lat: -8.7482,
    lng: 115.1672,
  },
  CGK: {
    iata: "CGK",
    name: "Soekarno-Hatta",
    city: "Jakarta",
    country: "Indonesia",
    lat: -6.1256,
    lng: 106.6559,
    alternatives: ["HLP"],
  },
  HLP: {
    iata: "HLP",
    name: "Halim Perdanakusuma",
    city: "Jakarta",
    country: "Indonesia",
    lat: -6.2666,
    lng: 106.8907,
    alternatives: ["CGK"],
  },
  MNL: {
    iata: "MNL",
    name: "Ninoy Aquino",
    city: "Manila",
    country: "Philippines",
    lat: 14.5086,
    lng: 121.0198,
  },
  PNH: {
    iata: "PNH",
    name: "Phnom Penh International",
    city: "Phnom Penh",
    country: "Cambodia",
    lat: 11.5466,
    lng: 104.8441,
  },
  REP: {
    iata: "REP",
    name: "Siem Reap Angkor",
    city: "Siem Reap",
    country: "Cambodia",
    lat: 13.4107,
    lng: 103.8129,
  },
  RGN: {
    iata: "RGN",
    name: "Yangon International",
    city: "Yangon",
    country: "Myanmar",
    lat: 16.9073,
    lng: 96.1332,
  },
  VTE: {
    iata: "VTE",
    name: "Wattay",
    city: "Vientiane",
    country: "Laos",
    lat: 17.9883,
    lng: 102.5633,
  },

  // --- East Asia ------------------------------------------------------------
  HND: {
    iata: "HND",
    name: "Haneda",
    city: "Tokyo",
    country: "Japan",
    lat: 35.5494,
    lng: 139.7798,
    alternatives: ["NRT"],
  },
  NRT: {
    iata: "NRT",
    name: "Narita",
    city: "Tokyo",
    country: "Japan",
    lat: 35.772,
    lng: 140.3929,
    alternatives: ["HND"],
  },
  KIX: {
    iata: "KIX",
    name: "Kansai",
    city: "Osaka",
    country: "Japan",
    lat: 34.4273,
    lng: 135.2444,
  },
  ICN: {
    iata: "ICN",
    name: "Incheon",
    city: "Seoul",
    country: "South Korea",
    lat: 37.4602,
    lng: 126.4407,
    alternatives: ["GMP"],
  },
  GMP: {
    iata: "GMP",
    name: "Gimpo",
    city: "Seoul",
    country: "South Korea",
    lat: 37.5583,
    lng: 126.7906,
    alternatives: ["ICN"],
  },
  HKG: {
    iata: "HKG",
    name: "Hong Kong International",
    city: "Hong Kong",
    country: "China",
    lat: 22.308,
    lng: 113.9185,
    alternatives: ["MFM"],
  },
  MFM: {
    iata: "MFM",
    name: "Macau International",
    city: "Macau",
    country: "China",
    lat: 22.1496,
    lng: 113.5915,
    alternatives: ["HKG"],
  },
  TPE: {
    iata: "TPE",
    name: "Taoyuan",
    city: "Taipei",
    country: "Taiwan",
    lat: 25.0777,
    lng: 121.2328,
    alternatives: ["TSA"],
  },
  TSA: {
    iata: "TSA",
    name: "Songshan",
    city: "Taipei",
    country: "Taiwan",
    lat: 25.0697,
    lng: 121.5525,
    alternatives: ["TPE"],
  },
  PVG: {
    iata: "PVG",
    name: "Pudong",
    city: "Shanghai",
    country: "China",
    lat: 31.1443,
    lng: 121.8083,
  },
  PEK: {
    iata: "PEK",
    name: "Beijing Capital",
    city: "Beijing",
    country: "China",
    lat: 40.0799,
    lng: 116.6031,
  },

  // --- South Asia / Middle East ---------------------------------------------
  DEL: {
    iata: "DEL",
    name: "Indira Gandhi",
    city: "Delhi",
    country: "India",
    lat: 28.5562,
    lng: 77.1,
  },
  BOM: {
    iata: "BOM",
    name: "Chhatrapati Shivaji",
    city: "Mumbai",
    country: "India",
    lat: 19.0896,
    lng: 72.8656,
  },
  CMB: {
    iata: "CMB",
    name: "Bandaranaike",
    city: "Colombo",
    country: "Sri Lanka",
    lat: 7.1808,
    lng: 79.8841,
  },
  KTM: {
    iata: "KTM",
    name: "Tribhuvan",
    city: "Kathmandu",
    country: "Nepal",
    lat: 27.6966,
    lng: 85.3591,
  },
  DXB: {
    iata: "DXB",
    name: "Dubai International",
    city: "Dubai",
    country: "UAE",
    lat: 25.2532,
    lng: 55.3657,
  },
  DOH: {
    iata: "DOH",
    name: "Hamad International",
    city: "Doha",
    country: "Qatar",
    lat: 25.2731,
    lng: 51.6081,
  },
  IST: {
    iata: "IST",
    name: "Istanbul Airport",
    city: "Istanbul",
    country: "Turkey",
    lat: 41.2753,
    lng: 28.7519,
  },

  // --- Europe ---------------------------------------------------------------
  LHR: {
    iata: "LHR",
    name: "Heathrow",
    city: "London",
    country: "UK",
    lat: 51.47,
    lng: -0.4543,
    alternatives: ["STN"],
  },
  STN: {
    iata: "STN",
    name: "Stansted",
    city: "London",
    country: "UK",
    lat: 51.885,
    lng: 0.235,
    alternatives: ["LHR"],
  },
  CDG: {
    iata: "CDG",
    name: "Charles de Gaulle",
    city: "Paris",
    country: "France",
    lat: 49.0097,
    lng: 2.5479,
  },
  BCN: {
    iata: "BCN",
    name: "El Prat",
    city: "Barcelona",
    country: "Spain",
    lat: 41.2974,
    lng: 2.0833,
  },
  MAD: {
    iata: "MAD",
    name: "Barajas",
    city: "Madrid",
    country: "Spain",
    lat: 40.4936,
    lng: -3.5668,
  },
  FCO: {
    iata: "FCO",
    name: "Fiumicino",
    city: "Rome",
    country: "Italy",
    lat: 41.8003,
    lng: 12.2389,
  },
  MXP: {
    iata: "MXP",
    name: "Malpensa",
    city: "Milan",
    country: "Italy",
    lat: 45.6306,
    lng: 8.7281,
  },
  BER: {
    iata: "BER",
    name: "Brandenburg",
    city: "Berlin",
    country: "Germany",
    lat: 52.3667,
    lng: 13.5033,
  },
  AMS: {
    iata: "AMS",
    name: "Schiphol",
    city: "Amsterdam",
    country: "Netherlands",
    lat: 52.3105,
    lng: 4.7683,
  },
  LIS: {
    iata: "LIS",
    name: "Humberto Delgado",
    city: "Lisbon",
    country: "Portugal",
    lat: 38.7742,
    lng: -9.1342,
  },
  ATH: {
    iata: "ATH",
    name: "Eleftherios Venizelos",
    city: "Athens",
    country: "Greece",
    lat: 37.9364,
    lng: 23.9445,
  },
  VIE: {
    iata: "VIE",
    name: "Schwechat",
    city: "Vienna",
    country: "Austria",
    lat: 48.1103,
    lng: 16.5697,
  },
  PRG: {
    iata: "PRG",
    name: "Vaclav Havel",
    city: "Prague",
    country: "Czechia",
    lat: 50.1008,
    lng: 14.26,
  },
  CPH: {
    iata: "CPH",
    name: "Kastrup",
    city: "Copenhagen",
    country: "Denmark",
    lat: 55.618,
    lng: 12.6508,
  },

  // --- Americas / Oceania ---------------------------------------------------
  JFK: {
    iata: "JFK",
    name: "John F Kennedy",
    city: "New York",
    country: "USA",
    lat: 40.6413,
    lng: -73.7781,
  },
  LAX: {
    iata: "LAX",
    name: "Los Angeles International",
    city: "Los Angeles",
    country: "USA",
    lat: 33.9416,
    lng: -118.4085,
  },
  SFO: {
    iata: "SFO",
    name: "San Francisco International",
    city: "San Francisco",
    country: "USA",
    lat: 37.6213,
    lng: -122.379,
  },
  MEX: {
    iata: "MEX",
    name: "Benito Juarez",
    city: "Mexico City",
    country: "Mexico",
    lat: 19.4361,
    lng: -99.0719,
  },
  GRU: {
    iata: "GRU",
    name: "Guarulhos",
    city: "Sao Paulo",
    country: "Brazil",
    lat: -23.4356,
    lng: -46.4731,
  },
  SYD: {
    iata: "SYD",
    name: "Kingsford Smith",
    city: "Sydney",
    country: "Australia",
    lat: -33.9399,
    lng: 151.1753,
  },
  MEL: {
    iata: "MEL",
    name: "Tullamarine",
    city: "Melbourne",
    country: "Australia",
    lat: -37.669,
    lng: 144.841,
  },
  AKL: {
    iata: "AKL",
    name: "Auckland International",
    city: "Auckland",
    country: "New Zealand",
    lat: -37.0082,
    lng: 174.7917,
  },
};

/** Extra spellings the resolver accepts, mapped to their IATA code. */
const ALIASES: Record<string, string> = {
  sg: "SIN",
  changi: "SIN",
  kl: "KUL",
  "kuala lumpar": "KUL",
  "george town": "PEN",
  pinang: "PEN",
  krungthep: "BKK",
  "don mueang": "DMK",
  "suvarnabhumi": "BKK",
  saigon: "SGN",
  "ho chi minh": "SGN",
  hcmc: "SGN",
  "ha noi": "HAN",
  denpasar: "DPS",
  kuta: "DPS",
  ubud: "DPS",
  seminyak: "DPS",
  jakarta: "CGK",
  halim: "HLP",
  angkor: "REP",
  narita: "NRT",
  haneda: "HND",
  tokyo: "HND",
  osaka: "KIX",
  kansai: "KIX",
  incheon: "ICN",
  gimpo: "GMP",
  hk: "HKG",
  hongkong: "HKG",
  macao: "MFM",
  taoyuan: "TPE",
  songshan: "TSA",
  shanghai: "PVG",
  pudong: "PVG",
  peking: "PEK",
  "new delhi": "DEL",
  bombay: "BOM",
  "sri lanka": "CMB",
  london: "LHR",
  heathrow: "LHR",
  stansted: "STN",
  nyc: "JFK",
  "new york city": "JFK",
  "sao paulo": "GRU",
  lisboa: "LIS",
  roma: "FCO",
  milano: "MXP",
  wien: "VIE",
  praha: "PRG",
  kobenhavn: "CPH",
};

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

/** Lowercase, accent-free, single-spaced — the shape every lookup key takes. */
function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BY_NAME = new Map<string, string>();
for (const airport of Object.values(AIRPORTS)) {
  // First writer wins, so BKK beats DMK for "bangkok" and HND beats NRT for
  // "tokyo" — the primary airport of a city is the safer default.
  const city = normalize(airport.city);
  if (!BY_NAME.has(city)) BY_NAME.set(city, airport.iata);
  const name = normalize(airport.name);
  if (!BY_NAME.has(name)) BY_NAME.set(name, airport.iata);
}
for (const [alias, iata] of Object.entries(ALIASES)) {
  BY_NAME.set(normalize(alias), iata);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAirport(iata: string): Airport | undefined {
  return AIRPORTS[iata.trim().toUpperCase()];
}

/** Nearby airports that can be swapped in for `iata`, as full records. */
export function getAlternatives(iata: string): Airport[] {
  const airport = getAirport(iata);
  if (!airport) return [];
  return (airport.alternatives ?? [])
    .map((code) => AIRPORTS[code])
    .filter((alternative): alternative is Airport => alternative !== undefined);
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km; 0 when either airport is unknown. */
export function getDistance(from: string, to: string): number {
  const a = getAirport(from);
  const b = getAirport(to);
  if (!a || !b) return 0;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Levenshtein distance, bailing out once it exceeds `limit`. */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * City name or code → IATA. Handles exact codes, city/airport names, aliases,
 * partial input ("chiang" → CNX) and small typos ("Bangkokk" → BKK).
 */
export function resolveCity(input: string): string | undefined {
  const raw = input.trim();
  if (raw.length === 0) return undefined;

  const upper = raw.toUpperCase();
  if (AIRPORTS[upper]) return upper;

  const key = normalize(raw);
  if (key.length === 0) return undefined;

  const exact = BY_NAME.get(key);
  if (exact) return exact;

  // Prefix match first — "chiang" should not tie with "chiang mai" via typos.
  const prefixed = [...BY_NAME.entries()].filter(
    ([name]) => name.startsWith(key) || key.startsWith(name),
  );
  if (prefixed.length > 0) {
    prefixed.sort(([a], [b]) => a.length - b.length);
    return prefixed[0][1];
  }

  const contained = [...BY_NAME.entries()].filter(
    ([name]) => key.length >= 4 && (name.includes(key) || key.includes(name)),
  );
  if (contained.length > 0) {
    contained.sort(([a], [b]) => a.length - b.length);
    return contained[0][1];
  }

  // Typo tolerance scales with word length: 1 edit for short names, 2 for long.
  const limit = key.length <= 5 ? 1 : 2;
  let best: { iata: string; distance: number } | undefined;
  for (const [name, iata] of BY_NAME) {
    const distance = editDistance(key, name, limit);
    if (distance <= limit && (!best || distance < best.distance)) {
      best = { iata, distance };
    }
  }
  return best?.iata;
}

/** "Bangkok (BKK)" — used in prompts and event copy. */
export function airportLabel(iata: string): string {
  const airport = getAirport(iata);
  return airport ? `${airport.city} (${airport.iata})` : iata;
}
