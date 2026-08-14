/** Carrier codes the mock planner draws from, plus display names for the UI. */
export const CARRIERS: { code: string; name: string }[] = [
  { code: "AK", name: "AirAsia" },
  { code: "TR", name: "Scoot" },
  { code: "VJ", name: "VietJet Air" },
  { code: "FD", name: "Thai AirAsia" },
  { code: "5J", name: "Cebu Pacific" },
  { code: "JT", name: "Lion Air" },
  { code: "QZ", name: "Indonesia AirAsia" },
  { code: "OD", name: "Batik Air" },
  { code: "SL", name: "Thai Lion Air" },
  { code: "PG", name: "Bangkok Airways" },
  { code: "MH", name: "Malaysia Airlines" },
  { code: "VN", name: "Vietnam Airlines" },
  { code: "FR", name: "Ryanair" },
  { code: "W6", name: "Wizz Air" },
  { code: "U2", name: "easyJet" },
  { code: "VY", name: "Vueling" },
];

const NAMES: Record<string, string> = Object.fromEntries(
  CARRIERS.map((c) => [c.code, c.name]),
);

export function carrierName(code: string): string {
  return NAMES[code] ?? code;
}
