import test from "node:test";
import assert from "node:assert/strict";
import {
  parseEntry,
  answerLocally,
  categoryFixes,
  outstanding,
  insights,
} from "../src/lib/intelligence.js";

const clients = [
  { id: "c1", name: "Ananya Rao" },
  { id: "c2", name: "Northstar Technologies" },
];
const vehicles = [{ id: "v1", name: "KA 03 MN 4821" }];
const T = "2026-10-12";

test("voice expense: amount, category, date and vehicle are extracted", () => {
  const d = parseEntry("Paid 850 rupees for diesel today for ka03mn4821", T, { clients, vehicles });
  assert.equal(d.kind, "expense");
  assert.equal(d.amount, "850");
  assert.equal(d.category, "Fuel");
  assert.equal(d.date, T);
  assert.equal(d.vehicle_id, "v1");
  assert.equal(d.warnings.length, 0);
});

test("voice expense: ₹ prefix, decimals, yesterday and thousands separators", () => {
  const d = parseEntry("FASTag toll ₹1,250.50 yesterday", T);
  assert.equal(d.amount, "1250.5");
  assert.equal(d.category, "Toll");
  assert.equal(d.date, "2026-10-11");
});

test("voice trip: route, readings and client become a trip draft", () => {
  const d = parseEntry(
    "Trip for Ananya Rao from Bengaluru to Mysuru on 12/10/2026, opening 26357 closing 26,520",
    T,
    { clients, vehicles },
  );
  assert.equal(d.kind, "trip");
  assert.equal(d.origin, "Bengaluru");
  assert.equal(d.destination, "Mysuru");
  assert.equal(d.opening_km, 26357);
  assert.equal(d.closing_km, 26520);
  assert.equal(d.date, T);
  assert.equal(d.client_id, "c1");
});

test("missing fields stay null and are flagged, never invented", () => {
  const d = parseEntry("bought some snacks", T);
  assert.equal(d.amount, null);
  assert.equal(d.date, null);
  assert.ok(d.warnings.some((w) => /amount/i.test(w)));
  assert.ok(d.warnings.some((w) => /date/i.test(w)));
  const t = parseEntry("trip opening 500 closing 400", T);
  assert.ok(t.warnings.some((w) => /lower than opening/i.test(w)));
});

const report = {
  invoices: [
    { id: "i1", name: "INV-1", client_id: "c1", total_minor: 100000, due_date: T, trip_id: "t1" },
    { id: "i2", name: "INV-2", client_id: "c2", total_minor: 50000, due_date: T },
    { id: "i3", name: "INV-3", client_id: "c2", total_minor: 90000, status: "cancelled" },
  ],
  all_payments: [
    { invoice_id: "i1", amount_minor: 40000, kind: "payment" },
    { invoice_id: "i2", amount_minor: 50000, kind: "payment" },
    { invoice_id: "i2", amount_minor: 10000, kind: "refund" },
  ],
  expenses: [
    { id: "e1", name: "Diesel", category: "Fuel", amount_minor: 20000, vehicle_id: "v1", trip_id: "t1" },
    { id: "e2", name: "Parking at airport", category: "Other", amount_minor: 5000 },
  ],
  maintenance: [{ id: "m1", vehicle_id: "v1", amount_minor: 30000 }],
  trips: [{ id: "t1", name: "ST-1", origin: "A", destination: "B" }],
};

test("outstanding balances honour refunds and skip cancelled invoices", () => {
  const rows = outstanding(report, clients);
  assert.deepEqual(rows.map((r) => [r.id, r.balance]), [["c1", 60000], ["c2", 10000]]);
});

test("local assistant answers the owe-money question with names and period", () => {
  const a = answerLocally("Which clients still owe money?", report, { clients, vehicles, from: "2026-10-01", to: T });
  assert.match(a, /Period: 2026-10-01 to 2026-10-12/);
  assert.match(a, /Ananya Rao/);
  assert.match(a, /Northstar Technologies/);
  assert.match(a, /2 clients still owe/);
});

test("local assistant reports vehicle costs by registration", () => {
  const a = answerLocally("What did each vehicle cost?", report, { clients, vehicles, from: "x", to: "y" });
  assert.match(a, /KA 03 MN 4821/);
  assert.match(a, /maintenance/);
});

test("category fixes only touch 'Other' expenses with a confident match", () => {
  assert.deepEqual(categoryFixes(report.expenses).map((f) => [f.id, f.suggested]), [["e2", "Parking"]]);
});

test("insights sort trips by contribution and split vehicle costs", () => {
  const s = insights(report);
  assert.equal(s.contribution, 100000 + 50000 - 55000);
  assert.equal(s.vehicles[0].expenses, 20000);
  assert.equal(s.vehicles[0].maintenance, 30000);
  assert.equal(s.trips[0].contribution, 80000);
  assert.equal(s.unlinkedCost, 5000);
});
