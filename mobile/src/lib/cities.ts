/**
 * Airport registry used by the 3D globe and by free-text request parsing.
 * Coordinates are the airport itself, so arcs land on the runway, not downtown.
 * Copied from the web app (app/lib/cities.ts) — keep in sync.
 */
export interface CityInfo {
  code: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  /** Alternate spellings the parser accepts. */
  aliases?: string[];
}

export const CITIES: CityInfo[] = [
  // Southeast Asia — the default demo playground
  { code: "SIN", city: "Singapore", country: "Singapore", lat: 1.3644, lon: 103.9915 },
  { code: "BKK", city: "Bangkok", country: "Thailand", lat: 13.69, lon: 100.7501 },
  { code: "DMK", city: "Bangkok Don Mueang", country: "Thailand", lat: 13.9126, lon: 100.6068, aliases: ["don mueang"] },
  { code: "HAN", city: "Hanoi", country: "Vietnam", lat: 21.2212, lon: 105.8072 },
  { code: "SGN", city: "Ho Chi Minh City", country: "Vietnam", lat: 10.8189, lon: 106.6519, aliases: ["saigon", "ho chi minh"] },
  { code: "KUL", city: "Kuala Lumpur", country: "Malaysia", lat: 2.7456, lon: 101.7099 },
  { code: "JHB", city: "Johor Bahru", country: "Malaysia", lat: 1.6411, lon: 103.6698, aliases: ["senai"] },
  { code: "PEN", city: "Penang", country: "Malaysia", lat: 5.2971, lon: 100.2769, aliases: ["george town"] },
  { code: "DPS", city: "Bali", country: "Indonesia", lat: -8.7482, lon: 115.1672, aliases: ["denpasar", "kuta"] },
  { code: "CGK", city: "Jakarta", country: "Indonesia", lat: -6.1256, lon: 106.6559 },
  { code: "HLP", city: "Jakarta Halim", country: "Indonesia", lat: -6.2666, lon: 106.8907, aliases: ["halim"] },
  { code: "MNL", city: "Manila", country: "Philippines", lat: 14.5086, lon: 121.0198 },
  { code: "PNH", city: "Phnom Penh", country: "Cambodia", lat: 11.5466, lon: 104.8441 },
  { code: "REP", city: "Siem Reap", country: "Cambodia", lat: 13.4107, lon: 103.8129, aliases: ["angkor"] },
  { code: "RGN", city: "Yangon", country: "Myanmar", lat: 16.9073, lon: 96.1332 },
  { code: "HKT", city: "Phuket", country: "Thailand", lat: 8.1132, lon: 98.3169 },
  { code: "CNX", city: "Chiang Mai", country: "Thailand", lat: 18.7669, lon: 98.9626 },
  { code: "VTE", city: "Vientiane", country: "Laos", lat: 17.9883, lon: 102.5633 },

  // East Asia
  { code: "HKG", city: "Hong Kong", country: "China", lat: 22.308, lon: 113.9185 },
  { code: "MFM", city: "Macau", country: "China", lat: 22.1496, lon: 113.5915, aliases: ["macao"] },
  { code: "TPE", city: "Taipei", country: "Taiwan", lat: 25.0777, lon: 121.2328 },
  { code: "TSA", city: "Taipei Songshan", country: "Taiwan", lat: 25.0697, lon: 121.5525, aliases: ["songshan"] },
  { code: "NRT", city: "Tokyo", country: "Japan", lat: 35.772, lon: 140.3929 },
  { code: "HND", city: "Tokyo Haneda", country: "Japan", lat: 35.5494, lon: 139.7798, aliases: ["haneda"] },
  { code: "KIX", city: "Osaka", country: "Japan", lat: 34.4273, lon: 135.2444 },
  { code: "ICN", city: "Seoul", country: "South Korea", lat: 37.4602, lon: 126.4407 },
  { code: "GMP", city: "Seoul Gimpo", country: "South Korea", lat: 37.5583, lon: 126.7906, aliases: ["gimpo"] },
  { code: "PVG", city: "Shanghai", country: "China", lat: 31.1443, lon: 121.8083 },
  { code: "PEK", city: "Beijing", country: "China", lat: 40.0799, lon: 116.6031 },

  // South Asia / Middle East
  { code: "DEL", city: "Delhi", country: "India", lat: 28.5562, lon: 77.1 },
  { code: "BOM", city: "Mumbai", country: "India", lat: 19.0896, lon: 72.8656 },
  { code: "CMB", city: "Colombo", country: "Sri Lanka", lat: 7.1808, lon: 79.8841 },
  { code: "KTM", city: "Kathmandu", country: "Nepal", lat: 27.6966, lon: 85.3591 },
  { code: "DXB", city: "Dubai", country: "UAE", lat: 25.2532, lon: 55.3657 },
  { code: "DOH", city: "Doha", country: "Qatar", lat: 25.2731, lon: 51.6081 },
  { code: "IST", city: "Istanbul", country: "Turkey", lat: 41.2753, lon: 28.7519 },

  // Europe
  { code: "LHR", city: "London", country: "UK", lat: 51.47, lon: -0.4543, aliases: ["london heathrow"] },
  { code: "STN", city: "London Stansted", country: "UK", lat: 51.885, lon: 0.235, aliases: ["stansted"] },
  { code: "CDG", city: "Paris", country: "France", lat: 49.0097, lon: 2.5479 },
  { code: "BCN", city: "Barcelona", country: "Spain", lat: 41.2974, lon: 2.0833 },
  { code: "MAD", city: "Madrid", country: "Spain", lat: 40.4936, lon: -3.5668 },
  { code: "FCO", city: "Rome", country: "Italy", lat: 41.8003, lon: 12.2389 },
  { code: "MXP", city: "Milan", country: "Italy", lat: 45.6306, lon: 8.7281 },
  { code: "BER", city: "Berlin", country: "Germany", lat: 52.3667, lon: 13.5033 },
  { code: "AMS", city: "Amsterdam", country: "Netherlands", lat: 52.3105, lon: 4.7683 },
  { code: "LIS", city: "Lisbon", country: "Portugal", lat: 38.7742, lon: -9.1342 },
  { code: "ATH", city: "Athens", country: "Greece", lat: 37.9364, lon: 23.9445 },
  { code: "VIE", city: "Vienna", country: "Austria", lat: 48.1103, lon: 16.5697 },
  { code: "PRG", city: "Prague", country: "Czechia", lat: 50.1008, lon: 14.26 },
  { code: "CPH", city: "Copenhagen", country: "Denmark", lat: 55.618, lon: 12.6508 },

  // Americas / Oceania
  { code: "JFK", city: "New York", country: "USA", lat: 40.6413, lon: -73.7781, aliases: ["nyc"] },
  { code: "LAX", city: "Los Angeles", country: "USA", lat: 33.9416, lon: -118.4085 },
  { code: "SFO", city: "San Francisco", country: "USA", lat: 37.6213, lon: -122.379 },
  { code: "MEX", city: "Mexico City", country: "Mexico", lat: 19.4361, lon: -99.0719 },
  { code: "GRU", city: "São Paulo", country: "Brazil", lat: -23.4356, lon: -46.4731, aliases: ["sao paulo"] },
  { code: "SYD", city: "Sydney", country: "Australia", lat: -33.9399, lon: 151.1753 },
  { code: "MEL", city: "Melbourne", country: "Australia", lat: -37.669, lon: 144.841 },
  { code: "AKL", city: "Auckland", country: "New Zealand", lat: -37.0082, lon: 174.7917 },
];

const BY_CODE = new Map(CITIES.map((c) => [c.code, c]));

const BY_NAME = new Map<string, CityInfo>();
for (const c of CITIES) {
  BY_NAME.set(c.city.toLowerCase(), c);
  for (const alias of c.aliases ?? []) BY_NAME.set(alias.toLowerCase(), c);
}

export function getCity(codeOrName: string): CityInfo | undefined {
  const key = codeOrName.trim();
  return BY_CODE.get(key.toUpperCase()) ?? BY_NAME.get(key.toLowerCase());
}

/** Display label: "BKK · Bangkok" style pieces without forcing a format. */
export function cityLabel(code: string): string {
  return getCity(code)?.city ?? code;
}

export function cityCountry(code: string): string {
  return getCity(code)?.country ?? "";
}

export function coordsOf(code: string): [number, number] | null {
  const c = getCity(code);
  return c ? [c.lat, c.lon] : null;
}
