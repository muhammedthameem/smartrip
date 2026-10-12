import { distance, hours, invoiceTotal } from "./calculations";
export function validateRecord(table, row) {
  if (
    [
      "clients",
      "vehicles",
      "drivers",
      "bookings",
      "expenses",
      "maintenance",
      "fuel_logs",
    ].includes(table) &&
    !row.name?.trim()
  )
    throw new Error("A name or description is required.");
  for (const k of ["amount_minor", "rate_minor"])
    if (
      row[k] != null &&
      (!Number.isSafeInteger(row[k]) || row[k] < 0 || row[k] > 99999999999)
    )
      throw new Error("Enter a valid amount.");
  if (
    ["expenses", "payments", "fuel_logs"].includes(table) &&
    !(row.amount_minor > 0)
  )
    throw new Error("Amount must be greater than zero.");
  for (const k of ["seats", "passengers"])
    if (
      row[k] != null &&
      (!Number.isInteger(Number(row[k])) || Number(row[k]) <= 0)
    )
      throw new Error("Seats and passengers must be positive whole numbers.");
  if (table === "trips") {
    distance(row.opening_km, row.closing_km);
    hours(row.start_time, row.end_time);
    if (!row.date) throw new Error("Choose a trip date.");
    if (
      !["draft", "cancelled"].includes(row.status) &&
      (!row.client_id ||
        !row.vehicle_id ||
        !row.driver_id ||
        !row.origin?.trim() ||
        !row.destination?.trim())
    )
      throw new Error("Client, vehicle, driver and route are required.");
    if (
      row.status === "completed" &&
      (row.opening_km == null ||
        row.closing_km == null ||
        !row.start_time ||
        !row.end_time)
    )
      throw new Error("Complete readings and actual start/end time first.");
    let previous = null;
    for (const p of row.places || []) {
      distance(p.opening_km, p.closing_km);
      if (
        p.opening_km !== "" &&
        p.opening_km != null &&
        ((previous != null && Number(p.opening_km) < previous) ||
          (row.opening_km != null && Number(p.opening_km) < row.opening_km))
      )
        throw new Error(
          "Place odometer ranges overlap or begin before the trip.",
        );
      if (p.closing_km !== "" && p.closing_km != null) {
        previous = Number(p.closing_km);
        if (row.closing_km != null && previous > row.closing_km)
          throw new Error("Place readings exceed the closing odometer.");
      }
    }
  }
  if (table === "invoices")
    invoiceTotal(row.items, row.discount_minor, row.tax_bps);
  if (table === "settings")
    for (const k of ["voucher_prefix", "invoice_prefix"])
      if (!/^[A-Za-z0-9-]{1,10}$/.test(row[k]))
        throw new Error(
          "Number prefixes need 1–10 letters, digits or hyphens.",
        );
}
