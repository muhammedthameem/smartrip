import React, { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { useApp } from "../lib/context";
import {
  today,
  money,
  downloadCsv,
  balanceFor,
  distance,
} from "../lib/calculations";
import {
  PageHeader,
  Button,
  Field,
  Loading,
  ErrorBox,
  Stat,
  Empty,
} from "../components/ui";
export default function Reports() {
  const { api, version } = useApp(),
    [from, setFrom] = useState(today().slice(0, 8) + "01"),
    [to, setTo] = useState(today()),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [type, setType] = useState("invoices");
  useEffect(() => {
    let active = true;
    setError("");
    setData(null);
    if (from > to) {
      setError("Start date must be before end date.");
      return;
    }
    api
      .report(from, to)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [api, version, from, to]);
  const invoices = data?.invoices.filter((i) => i.status !== "cancelled") || [],
    revenue = invoices.reduce((s, i) => s + i.total_minor, 0),
    cost =
      (data?.expenses || []).reduce((s, i) => s + i.amount_minor, 0) +
      (data?.maintenance || []).reduce((s, i) => s + i.amount_minor, 0);
  const rows = data
    ? type === "outstanding"
      ? invoices.map((i) => ({
          number: i.name,
          date: i.date,
          total: money(i.total_minor),
          balance: money(balanceFor(i, data.all_payments)),
        }))
      : type === "trips"
        ? data.trips
            .filter((t) => t.status !== "cancelled")
            .map((t) => ({
              number: t.name,
              date: t.date,
              route: t.origin + " → " + t.destination,
              status: t.status,
              km: distance(t.opening_km, t.closing_km) ?? "",
            }))
        : (data[type] || []).map((r) => ({
            name: r.name,
            date: r.date,
            status: r.status || r.kind || r.category || "",
            amount: money(r.total_minor ?? r.amount_minor ?? 0),
          }))
    : [];
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="A clearer picture, grounded in your records."
      >
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={17} /> Print
        </Button>
        <Button
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(rows, "smarttrip-" + type + "-" + from + "-" + to)
          }
        >
          <Download size={17} /> Export CSV
        </Button>
      </PageHeader>
      <section className="panel padded">
        <div className="form-grid three">
          <Field label="From">
            <input
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field label="Report">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {[
                "trips",
                "invoices",
                "payments",
                "outstanding",
                "expenses",
                "fuel_logs",
                "maintenance",
              ].map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>
      {error ? (
        <ErrorBox message={error} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="stats-grid mt-5">
            <Stat
              label="Invoiced revenue"
              value={money(revenue)}
              foot="Excludes cancelled invoices"
            />
            <Stat
              label="Operating costs"
              value={money(cost)}
              foot="Expenses + maintenance, by record date"
            />
            <Stat
              label="Operating contribution"
              value={money(revenue - cost)}
              foot="Not net profit; excludes unrecorded costs"
            />
            <Stat
              label="Net collections"
              value={money(
                data.payments.reduce(
                  (s, p) => s + (p.kind === "refund" ? -1 : 1) * p.amount_minor,
                  0,
                ),
              )}
              foot="Payments minus refunds in period"
            />
          </div>
          <section className="panel padded">
            <h2>
              {type.replace("_", " ")} · {from} to {to}
            </h2>
            {rows.length ? (
              <div className="report-table">
                <table>
                  <thead>
                    <tr>
                      {Object.keys(rows[0]).map((k) => (
                        <th key={k}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        {Object.values(r).map((v, j) => (
                          <td key={j}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No records in this period" />
            )}
          </section>
        </>
      )}
      <p className="report-note">
        Date ranges use Asia/Kolkata business dates. Revenue is invoiced
        revenue, not cash received. Outstanding uses all recorded payments for
        the selected invoices. Fuel logs are informational and excluded from
        costs to avoid duplication. Cancelled trips and invoices are excluded
        where relevant. Reports are limited to 2,000 records per category;
        narrow the period if prompted.
      </p>
    </>
  );
}
