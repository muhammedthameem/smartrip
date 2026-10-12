export function minor(value) {
  const s = String(value ?? "0").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw new Error("Enter a positive amount with at most two decimal places.");
  const [whole, fraction = ""] = s.split(".");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > 99999999999)
    throw new Error("Amount is too large.");
  return n;
}
export const money = (v = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(v / 100);
export function distance(open, close) {
  const hasOpen = open != null && open !== "",
    hasClose = close != null && close !== "";
  if (hasClose && !hasOpen)
    throw new Error("Enter the opening odometer first.");
  if (hasOpen && (!Number.isFinite(Number(open)) || Number(open) < 0))
    throw new Error("Opening odometer must be a positive number.");
  if (!hasClose) return null;
  const a = Number(open),
    b = Number(close);
  if (!Number.isFinite(b) || b < a)
    throw new Error("Closing odometer must be at least the opening reading.");
  return Math.round((b - a) * 100) / 100;
}
export function hours(start, end) {
  if (!start || !end) return null;
  const n = (new Date(end) - new Date(start)) / 3600000;
  if (!Number.isFinite(n) || n < 0)
    throw new Error("End date and time must be after the start.");
  return n;
}
export function invoiceTotal(items, discount = 0, taxBps = 0) {
  if (!items.length || items.length > 100)
    throw new Error("Add between 1 and 100 line items.");
  const subtotal = items.reduce((s, i) => {
    const quantity = minor(i.quantity);
    if (
      quantity <= 0 ||
      !Number.isSafeInteger(Number(i.unit_minor)) ||
      Number(i.unit_minor) < 0
    )
      throw new Error("Check line item quantities and prices.");
    return s + Number((BigInt(quantity) * BigInt(i.unit_minor) + 50n) / 100n);
  }, 0);
  if (
    !Number.isSafeInteger(subtotal) ||
    subtotal > 99999999999 ||
    !Number.isSafeInteger(discount) ||
    discount < 0 ||
    discount > subtotal ||
    !Number.isSafeInteger(taxBps) ||
    taxBps < 0 ||
    taxBps > 10000
  )
    throw new Error("Check line items, discount and tax.");
  const tax = Number(
    (BigInt(subtotal - discount) * BigInt(taxBps) + 5000n) / 10000n,
  );
  return { subtotal, tax, total: subtotal - discount + tax };
}
export const paidFor = (invoice, payments) =>
  payments
    .filter((p) => p.invoice_id === invoice.id)
    .reduce(
      (n, p) => n + (p.kind === "refund" ? -p.amount_minor : p.amount_minor),
      0,
    );
export const balanceFor = (invoice, payments) =>
  invoice.total_minor - paidFor(invoice, payments);
export const invoiceStatus = (invoice, payments) =>
  invoice.status === "cancelled"
    ? "cancelled"
    : balanceFor(invoice, payments) === 0
      ? "paid"
      : paidFor(invoice, payments) > 0
        ? "partially paid"
        : invoice.due_date < today()
          ? "overdue"
          : "issued";
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function csv(rows) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const escape = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return [
    keys.map(escape).join(","),
    ...rows.map((r) =>
      keys
        .map((k) =>
          escape(typeof r[k] === "object" ? JSON.stringify(r[k]) : r[k]),
        )
        .join(","),
    ),
  ].join("\r\n");
}
export function downloadCsv(rows, name) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
