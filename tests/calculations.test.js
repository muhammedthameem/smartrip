import test from "node:test";
import assert from "node:assert/strict";
import {
  distance,
  hours,
  minor,
  invoiceTotal,
  balanceFor,
  paidFor,
  invoiceStatus,
  csv,
} from "../src/lib/calculations.js";
test("odometer example gives exactly 163 km", () =>
  assert.equal(distance(26357, 26520), 163));
test("invalid or negative odometer readings are rejected", () => {
  assert.throws(() => distance(200, 100));
  assert.throws(() => distance(-1, 1));
  assert.throws(() => distance("", 100));
  assert.equal(distance(100, ""), null);
  assert.equal(distance(0, 0), 0);
});
test("midnight duration uses full timestamps", () =>
  assert.equal(
    hours("2026-10-12T23:00:00+05:30", "2026-10-13T02:30:00+05:30"),
    3.5,
  ));
test("negative duration is rejected", () =>
  assert.throws(() => hours("2026-10-13T02:00Z", "2026-10-12T23:00Z")));
test("money parsing never uses floating multiplication", () => {
  assert.equal(minor("0.29"), 29);
  assert.equal(minor("12345.67"), 1234567);
  assert.throws(() => minor("12.345"));
  assert.throws(() => minor("-1"));
  assert.throws(() => minor("Infinity"));
});
test("discount before tax and explicit rounding", () =>
  assert.deepEqual(
    invoiceTotal([{ quantity: 163, unit_minor: 1800 }], 10000, 1800),
    { subtotal: 293400, tax: 51012, total: 334412 },
  ));
test("discount cannot exceed subtotal", () =>
  assert.throws(() =>
    invoiceTotal([{ quantity: 1, unit_minor: 100 }], 101, 0),
  ));
test("partial, full, and refunded payments derive balances", () => {
  const inv = {
    id: "i",
    total_minor: 580000,
    status: "issued",
    due_date: "2099-01-01",
  };
  const partial = [{ invoice_id: "i", amount_minor: 200000, kind: "payment" }];
  assert.equal(balanceFor(inv, partial), 380000);
  assert.equal(invoiceStatus(inv, partial), "partially paid");
  const full = [
    ...partial,
    { invoice_id: "i", amount_minor: 380000, kind: "payment" },
  ];
  assert.equal(balanceFor(inv, full), 0);
  assert.equal(invoiceStatus(inv, full), "paid");
  assert.equal(
    balanceFor(inv, [
      ...full,
      { invoice_id: "i", amount_minor: 10000, kind: "refund" },
    ]),
    10000,
  );
  assert.equal(
    paidFor(inv, [
      ...partial,
      { invoice_id: "other", amount_minor: 990000, kind: "payment" },
    ]),
    200000,
  );
});
test("cancelled invoices retain cancelled status", () =>
  assert.equal(
    invoiceStatus({ id: "i", status: "cancelled", total_minor: 100 }, []),
    "cancelled",
  ));
test("CSV quotes and protects spreadsheet formulas", () => {
  const value = csv([{ name: "=SUM(A1)", note: 'a,"b"\nc' }]);
  assert.match(value, /'=SUM/);
  assert.match(value, /"a,""b""\nc"/);
});
