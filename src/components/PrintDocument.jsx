import React from "react";
import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { useList } from "../lib/context";
import {
  money,
  distance,
  hours,
  invoiceTotal,
  balanceFor,
  paidFor,
  invoiceStatus,
} from "../lib/calculations";
import { Button, RecordName } from "./ui";
export default function PrintDocument({ kind, record: r, payments = [] }) {
  const { rows } = useList("settings", { limit: 1 }),
    business = rows[0];
  const trip = kind === "voucher";
  let km = null;
  try {
    km = distance(r.opening_km, r.closing_km);
  } catch {}
  return (
    <>
      <div className="print-actions">
        <Button onClick={() => window.print()}>
          <Printer size={16} /> Print / Save PDF
        </Button>
        {kind === "invoice" &&
          r.status !== "cancelled" &&
          balanceFor(r, payments) > 0 && (
            <Link className="btn secondary" to={"/payments?invoice=" + r.id}>
              Record payment
            </Link>
          )}
        <p>Choose “Save as PDF” in your browser’s print dialog.</p>
      </div>
      <article className="print-sheet">
        <header>
          <div>
            <h2>{business?.name || "SmartTrip"}</h2>
            <p>{business?.address}</p>
            <p>{business?.phone}</p>
          </div>
          <div>
            <h3>
              {kind === "voucher"
                ? "TRIP VOUCHER"
                : kind === "invoice"
                  ? "INVOICE"
                  : "PAYMENT RECEIPT"}
            </h3>
            <b>{r.name}</b>
            <p>{r.date}</p>
          </div>
        </header>
        {r.client_id && (
          <p>
            <b>Client:</b> <RecordName table="clients" id={r.client_id} />
          </p>
        )}
        {trip ? (
          <>
            <h2>
              {r.origin} → {r.destination}
            </h2>
            <dl className="detail-grid">
              <div>
                <dt>Vehicle</dt>
                <dd>
                  <RecordName table="vehicles" id={r.vehicle_id} />
                </dd>
              </div>
              <div>
                <dt>Driver</dt>
                <dd>
                  <RecordName table="drivers" id={r.driver_id} />
                </dd>
              </div>
              <div>
                <dt>Passengers / AC</dt>
                <dd>
                  {r.passengers} / {r.ac}
                </dd>
              </div>
              <div>
                <dt>Opening / closing km</dt>
                <dd>
                  {r.opening_km ?? "—"} / {r.closing_km ?? "—"}
                </dd>
              </div>
              <div>
                <dt>Total km</dt>
                <dd>{km ?? "Not completed"}</dd>
              </div>
              <div>
                <dt>Night halts</dt>
                <dd>{r.night_halts || 0}</dd>
              </div>
              <div>
                <dt>Start time</dt>
                <dd>
                  {r.start_time
                    ? new Date(r.start_time).toLocaleString("en-IN")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>End time</dt>
                <dd>
                  {r.end_time
                    ? new Date(r.end_time).toLocaleString("en-IN")
                    : "—"}
                </dd>
              </div>
            </dl>
            {r.places?.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Place</th>
                    <th>Start km</th>
                    <th>End km</th>
                  </tr>
                </thead>
                <tbody>
                  {r.places.map((p, i) => (
                    <tr key={i}>
                      <td data-label="Date">{p.date}</td>
                      <td data-label="Place">{p.name}</td>
                      <td data-label="Start km">{p.opening_km}</td>
                      <td data-label="End km">{p.closing_km}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="signatures">
              <span>Driver signature: __________________</span>
              <span>Guest signature: __________________</span>
            </div>
          </>
        ) : kind === "invoice" ? (
          <>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((i, n) => (
                  <tr key={n}>
                    <td data-label="Description">{i.description}</td>
                    <td data-label="Quantity">{i.quantity}</td>
                    <td data-label="Rate">{money(i.unit_minor)}</td>
                    <td data-label="Amount">{money(invoiceTotal([i]).subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="totals">
              <div>
                <dt>Subtotal</dt>
                <dd>
                  {money(
                    invoiceTotal(r.items, r.discount_minor, r.tax_bps).subtotal,
                  )}
                </dd>
              </div>
              <div>
                <dt>Discount</dt>
                <dd>{money(r.discount_minor)}</dd>
              </div>
              <div>
                <dt>Tax ({r.tax_bps / 100}%)</dt>
                <dd>
                  {money(
                    invoiceTotal(r.items, r.discount_minor, r.tax_bps).tax,
                  )}
                </dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{money(r.total_minor)}</dd>
              </div>
              <div>
                <dt>Received (net of refunds)</dt>
                <dd>{money(paidFor(r, payments))}</dd>
              </div>
              <div>
                <dt>Balance due</dt>
                <dd>{money(balanceFor(r, payments))}</dd>
              </div>
            </dl>
            <p>
              Due: {r.due_date} · Status: {invoiceStatus(r, payments)}
            </p>
          </>
        ) : (
          <>
            <p>
              Invoice: <RecordName table="invoices" id={r.invoice_id} />
            </p>
            <h2>{money(r.amount_minor)}</h2>
            <p>
              {r.kind} · {r.method}
            </p>
            <p>Reference: {r.reference || "—"}</p>
          </>
        )}
        <p>{r.notes}</p>
        <footer>
          Generated by SmartTrip · Please retain for your records.
        </footer>
      </article>
    </>
  );
}
