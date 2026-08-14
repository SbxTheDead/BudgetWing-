// Smoke-test the SSE planner endpoint from the command line.
const body = {
  budget: 850,
  currency: "USD",
  cities: ["SIN", "BKK", "HAN", "DPS"],
  startDate: "2026-11-10",
  endDate: "2026-11-22",
  flexDays: 3,
  passengers: 1,
};

const res = await fetch("http://localhost:3000/api/agent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

console.log("status", res.status, res.headers.get("content-type"));

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let count = 0;
const seen = {};

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  let i = buffer.indexOf("\n\n");
  while (i !== -1) {
    const raw = buffer.slice(0, i);
    buffer = buffer.slice(i + 2);
    i = buffer.indexOf("\n\n");
    const payload = raw
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    if (!payload) continue;
    const msg = JSON.parse(payload);
    count++;
    seen[msg.type] = (seen[msg.type] ?? 0) + 1;
    if (msg.type === "complete") {
      console.log("COMPLETE:", msg.content);
      console.log(
        "route:",
        msg.data.route.legs.map(
          (l) => `${l.origin}>${l.destination} ${l.date} $${l.offer.totalPrice}`,
        ),
      );
      console.log(
        "total",
        msg.data.route.totalCost,
        "savings",
        msg.data.route.savings,
        "budget",
        msg.data.budget,
      );
    } else if (msg.type === "result") {
      console.log(
        `RESULT ${msg.data.origin}>${msg.data.destination} offers=${msg.data.offers.length} cheapest=${msg.data.cheapestPrice} avg=${msg.data.avgPrice} alt=${msg.data.altDate ?? "-"}/${msg.data.altSavings ?? 0}`,
      );
    } else {
      console.log(msg.type.toUpperCase(), "-", msg.content.slice(0, 110));
    }
  }
}
console.log("frames:", count, seen);
