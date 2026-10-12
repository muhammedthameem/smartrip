import { money, paidFor } from "./calculations.js";

export const expenseCategories = [
  "Fuel",
  "Toll",
  "Parking",
  "Food",
  "Driver allowance",
  "Repair",
  "Other",
];
const categoryRules = [
  ["Fuel", /diesel|petrol|fuel|charging|cng|refuel|filling station|\bhp\b|indian oil|bpcl/i],
  ["Toll", /toll|fastag|nhai|plaza/i],
  ["Parking", /parking|parked/i],
  ["Food", /meal|lunch|dinner|breakfast|food|snack|tea|coffee|restaurant|hotel bill/i],
  ["Driver allowance", /allowance|batta|bata|night halt|driver pay/i],
  ["Repair", /repair|service|tyre|tire|puncture|mechanic|workshop|oil change|brake|battery|wash/i],
];
export function suggestCategory(text) {
  return categoryRules.find(([, rule]) => rule.test(text || ""))?.[0] || "Other";
}

const sum = (rows, key) => rows.reduce((n, r) => n + Number(r[key] || 0), 0);
const median = (values) => {
  const v = [...values].sort((a, b) => a - b),
    m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/** Expenses more than three times the median of ≥3 same-category peers. */
export function unusualCosts(expenses) {
  return expenses.flatMap((r) => {
    const peers = expenses
      .filter((p) => p.id !== r.id && p.category === r.category)
      .map((p) => Number(p.amount_minor));
    if (peers.length < 3) return [];
    const typical = median(peers);
    return typical > 0 && r.amount_minor > typical * 3
      ? [
          {
            id: r.id,
            name: r.name,
            date: r.date,
            category: r.category,
            amount: r.amount_minor,
            median: typical,
          },
        ]
      : [];
  });
}

/** Expenses whose stored category differs from a confident keyword match. */
export function categoryFixes(expenses) {
  return expenses.flatMap((e) => {
    const suggested = suggestCategory(e.name + " " + (e.notes || ""));
    const current = e.category || "Other";
    return suggested !== "Other" && current === "Other"
      ? [{ id: e.id, name: e.name, date: e.date, current, suggested }]
      : [];
  });
}

export function insights(data) {
  const expenses = data.expenses || [],
    maintenance = data.maintenance || [],
    trips = data.trips || [];
  const invoices = (data.invoices || []).filter((i) => i.status !== "cancelled");
  const costs = [...expenses, ...maintenance];
  const vehicles = [...new Set(costs.map((r) => r.vehicle_id).filter(Boolean))]
    .map((id) => {
      const rows = costs.filter((r) => r.vehicle_id === id);
      return {
        id,
        cost: sum(rows, "amount_minor"),
        expenses: sum(
          expenses.filter((r) => r.vehicle_id === id),
          "amount_minor",
        ),
        maintenance: sum(
          maintenance.filter((r) => r.vehicle_id === id),
          "amount_minor",
        ),
      };
    })
    .sort((a, b) => b.cost - a.cost);
  const categories = expenseCategories
    .map((c) => ({
      category: c,
      cost: sum(
        expenses.filter((e) => (e.category || "Other") === c),
        "amount_minor",
      ),
    }))
    .filter((c) => c.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const revenue = sum(invoices, "total_minor"),
    cost = sum(costs, "amount_minor");
  return {
    revenue,
    cost,
    contribution: revenue - cost,
    unlinkedCost: sum(
      costs.filter((r) => !r.vehicle_id),
      "amount_minor",
    ),
    vehicles,
    categories,
    warnings: unusualCosts(expenses),
    trips: trips
      .filter((t) => t.status !== "cancelled")
      .map((t) => {
        const tripRevenue = sum(
            invoices.filter((i) => i.trip_id === t.id),
            "total_minor",
          ),
          tripCost = sum(
            expenses.filter((e) => e.trip_id === t.id),
            "amount_minor",
          );
        return {
          id: t.id,
          name: t.name,
          route: [t.origin, t.destination].filter(Boolean).join(" → "),
          invoiced: invoices.some((i) => i.trip_id === t.id),
          revenue: tripRevenue,
          cost: tripCost,
          contribution: tripRevenue - tripCost,
        };
      })
      .sort((a, b) => b.contribution - a.contribution),
  };
}

/** Outstanding balances per client for invoices dated in the report period. */
export function outstanding(report, clients = []) {
  const payments = report.all_payments || report.payments || [];
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const byClient = new Map();
  for (const inv of report.invoices || []) {
    if (inv.status === "cancelled") continue;
    const balance = inv.total_minor - paidFor(inv, payments);
    if (balance <= 0) continue;
    const row = byClient.get(inv.client_id) || {
      id: inv.client_id,
      name: names.get(inv.client_id) || "Unnamed client",
      balance: 0,
      invoices: [],
    };
    row.balance += balance;
    row.invoices.push({ name: inv.name, due: inv.due_date, balance });
    byClient.set(inv.client_id, row);
  }
  return [...byClient.values()].sort((a, b) => b.balance - a.balance);
}

/**
 * Answers common business questions from calculated data on the device.
 * It is deterministic: no model is involved, so it only covers known intents.
 */
export function answerLocally(question, report, { clients = [], vehicles = [], from, to } = {}) {
  const q = (question || "").toLowerCase();
  const period = `Period: ${from} to ${to}.`;
  const s = insights(report);
  const vehicleName = (id) => vehicles.find((v) => v.id === id)?.name || "Vehicle";
  const lines = [];
  if (/\b(owe|owes|owed|owing|outstanding|due|unpaid|pending|balances?|receivables?|collect)\b/.test(q)) {
    const rows = outstanding(report, clients);
    if (!rows.length) lines.push("No client has an unpaid balance on invoices dated in this period.");
    else {
      lines.push(`${rows.length} client${rows.length > 1 ? "s" : ""} still owe ${money(sum(rows, "balance"))}:`);
      for (const r of rows)
        lines.push(
          `• ${r.name}: ${money(r.balance)} — ` +
            r.invoices.map((i) => `${i.name} (due ${i.due || "—"}) ${money(i.balance)}`).join("; "),
        );
    }
    lines.push("Only invoices dated in this period are included; widen the dates for older invoices.");
  } else if (/unusual|anomal|suspicious|high cost|spike|odd/.test(q)) {
    if (!s.warnings.length) lines.push("No unusual costs found, or fewer than four expenses per category to compare.");
    else
      for (const w of s.warnings)
        lines.push(`• ${w.name} (${w.date}, ${w.category}): ${money(w.amount)} vs typical ${money(w.median)}`);
  } else if (/vehicle|car|fleet|bus|van/.test(q)) {
    if (!s.vehicles.length) lines.push("No costs are linked to vehicles in this period.");
    for (const v of s.vehicles)
      lines.push(
        `• ${vehicleName(v.id)}: ${money(v.cost)} (expenses ${money(v.expenses)} + maintenance ${money(v.maintenance)})`,
      );
    if (s.unlinkedCost) lines.push(`Costs without a vehicle: ${money(s.unlinkedCost)}.`);
  } else if (/profit|contribution|margin|best|worst|loss|earn/.test(q)) {
    const trips = s.trips.filter((t) => t.invoiced || t.cost);
    if (!trips.length) lines.push("No invoiced or costed trips in this period.");
    for (const t of trips.slice(0, 10))
      lines.push(
        `• ${t.name}${t.route ? " " + t.route : ""}: ${money(t.revenue)} − ${money(t.cost)} = ${money(t.contribution)}${t.invoiced ? "" : " (not invoiced)"}`,
      );
    lines.push("Contribution = linked invoices − linked expenses. It excludes maintenance and overheads.");
  } else if (/categor|spent|spend|expense|cost/.test(q)) {
    if (!s.categories.length) lines.push("No expenses in this period.");
    for (const c of s.categories) lines.push(`• ${c.category}: ${money(c.cost)}`);
    lines.push(`Maintenance: ${money(sum(report.maintenance || [], "amount_minor"))}. Total costs: ${money(s.cost)}.`);
  } else {
    lines.push(
      `Invoiced revenue ${money(s.revenue)} − recorded costs ${money(s.cost)} = ${money(s.contribution)}.`,
      `${(report.trips || []).length} trips, ${(report.invoices || []).length} invoices, ${(report.expenses || []).length} expenses.`,
      "Try asking about: clients who owe money, vehicle costs, trip profit, spending by category, or unusual costs.",
    );
  }
  return [period, ...lines].join("\n");
}

const months = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const pad = (n) => String(n).padStart(2, "0");
function shiftDay(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function findDate(text, todayIso) {
  if (/day before yesterday/i.test(text)) return shiftDay(todayIso, -2);
  if (/yesterday/i.test(text)) return shiftDay(todayIso, -1);
  if (/tomorrow/i.test(text)) return shiftDay(todayIso, 1);
  let m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return m[0];
  m = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
  if (m) return `${todayIso.slice(0, 4)}-${pad(months.indexOf(m[2].toLowerCase()) + 1)}-${pad(m[1])}`;
  if (/today|this morning|tonight/i.test(text)) return todayIso;
  return null;
}
const num = (s) => Number(String(s).replace(/,/g, ""));
const matchRecord = (text, rows, normalise = (s) => s.toLowerCase()) => {
  const t = normalise(text);
  return (
    rows
      .filter((r) => r.name && r.name.length > 2 && t.includes(normalise(r.name)))
      .sort((a, b) => b.name.length - a.name.length)[0]?.id || null
  );
};

/**
 * Turns a dictated or typed sentence into a reviewable draft without AI.
 * Missing or uncertain fields stay null and are listed in warnings.
 */
export function parseEntry(text, todayIso, { clients = [], vehicles = [] } = {}) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const warnings = [];
  const amountMatch =
    t.match(/(?:₹|rs\.?|inr|rupees?)\s*(\d[\d,]*(?:\.\d{1,2})?)/i) ||
    t.match(/(\d[\d,]*(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr|rupees?|\/-)/i) ||
    t.match(/\b(?:paid|spent|cost|costs|for|bill(?: of)?|amount(?: of)?)\s+(\d[\d,]*(?:\.\d{1,2})?)\b(?!\s*(?:km|kms|kilomet|litre|liter|l\b))/i);
  const opening = t.match(/(?:opening|start(?:ing)?|begin(?:ning)?)\s*(?:odometer|reading|km|kms)?\s*(?:was|of|at|is|:)?\s*(\d[\d,]*(?:\.\d+)?)/i);
  const closing = t.match(/(?:closing|end(?:ing)?|final)\s*(?:odometer|reading|km|kms)?\s*(?:was|of|at|is|:)?\s*(\d[\d,]*(?:\.\d+)?)/i);
  const route = t.match(
    /\bfrom\s+([a-z][a-z .'-]*?)\s+to\s+([a-z][a-z .'-]*?)(?=\s*(?:[,.;]|$)|\s+(?:for|with|on|today|yesterday|tomorrow|opening|closing|start|end|odometer|by|via|and|at|in)\b|\s+\d)/i,
  );
  const tripWords = /\b(trip|drive|drove|ride|drop|pickup|pick up|journey|tour|airport transfer)\b/i.test(t);
  const isTrip = !amountMatch && (route || opening || closing || tripWords);
  const date = findDate(t, todayIso);
  if (!date) warnings.push("No date recognised — check the date.");
  const client_id = matchRecord(t, clients),
    vehicle_id = matchRecord(t, vehicles, (s) => s.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (isTrip) {
    const draft = {
      kind: "trip",
      name: null,
      date,
      amount: null,
      category: null,
      origin: route ? route[1].trim() : null,
      destination: route ? route[2].trim() : null,
      opening_km: opening ? num(opening[1]) : null,
      closing_km: closing ? num(closing[1]) : null,
      notes: t,
      warnings,
      client_id,
      vehicle_id,
    };
    if (!route) warnings.push("Route not recognised — say “from … to …”.");
    if (draft.opening_km != null && draft.closing_km != null && draft.closing_km < draft.opening_km)
      warnings.push("Closing reading is lower than opening — check both readings.");
    if (!client_id) warnings.push("Choose the client.");
    return draft;
  }
  const amount = amountMatch ? String(num(amountMatch[1])) : null;
  if (!amount) warnings.push("No amount recognised — enter the amount.");
  const category = suggestCategory(t);
  const name =
    t
      .replace(/^(i |we )?(paid|spent|gave)\s+/i, "")
      .replace(/(?:₹|rs\.?|inr)\s*\d[\d,]*(?:\.\d{1,2})?|\d[\d,]*(?:\.\d{1,2})?\s*(?:rupees?|rs\.?|\/-)/gi, "")
      .replace(/\b(today|yesterday|day before yesterday|this morning|tonight)\b/gi, "")
      .replace(/^\s*(for|on)\s+/i, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
      .slice(0, 80) || category;
  return {
    kind: "expense",
    name: name.charAt(0).toUpperCase() + name.slice(1),
    date,
    amount,
    category,
    origin: null,
    destination: null,
    opening_km: null,
    closing_km: null,
    notes: t,
    warnings,
    client_id: null,
    vehicle_id,
  };
}
