import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Pencil, Printer, Receipt, Wallet, ArrowRight } from "lucide-react";
import { useApp, useList } from "../lib/context";
import { distance, hours, money } from "../lib/calculations";
import {
  PageHeader,
  Loading,
  ErrorBox,
  Badge,
  Button,
  Modal,
  RecordName,
} from "../components/ui";
import PrintDocument from "../components/PrintDocument";
export default function TripDetail() {
  const { id } = useParams(),
    { api, version } = useApp(),
    [trip, setTrip] = useState(null),
    [error, setError] = useState(""),
    [print, setPrint] = useState(false);
  const { rows: expenses, count } = useList("expenses", {
    filters: { trip_id: id },
    limit: 100,
  });
  useEffect(() => {
    api
      .get("trips", id)
      .then(setTrip)
      .catch((e) => setError(e.message));
  }, [id, api, version]);
  if (error) return <ErrorBox message={error} />;
  if (!trip) return <Loading />;
  return (
    <>
      <PageHeader title={trip.name} subtitle={"Journey on " + trip.date}>
        <Link className="btn secondary" to={"/trips/" + id + "/edit"}>
          <Pencil size={16} /> Edit trip
        </Link>
        <Button onClick={() => setPrint(true)}>
          <Printer size={16} /> Voucher
        </Button>
      </PageHeader>
      <section className="panel detail-hero">
        <Badge>{trip.status}</Badge>
        <div className="big-route">
          <h2>{trip.origin || "Origin"}</h2>
          <ArrowRight />
          <h2>{trip.destination || "Destination"}</h2>
        </div>
        <dl className="detail-grid">
          {[
            ["Client", <RecordName table="clients" id={trip.client_id} />],
            ["Vehicle", <RecordName table="vehicles" id={trip.vehicle_id} />],
            ["Driver", <RecordName table="drivers" id={trip.driver_id} />],
            ["Passengers", trip.passengers || "—"],
            ["Opening km", trip.opening_km ?? "—"],
            ["Closing km", trip.closing_km ?? "—"],
            [
              "Distance",
              distance(trip.opening_km, trip.closing_km) == null
                ? "Not completed"
                : distance(trip.opening_km, trip.closing_km) + " km",
            ],
            [
              "Duration",
              hours(trip.start_time, trip.end_time) == null
                ? "Not completed"
                : hours(trip.start_time, trip.end_time).toFixed(2) + " hours",
            ],
            ["Pricing", trip.pricing + " · " + money(trip.rate_minor)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p>{trip.notes}</p>
      </section>
      <div className="two-cols">
        <section className="panel padded">
          <h2>Trip expenses</h2>
          {expenses.length ? (
            expenses.map((e) => (
              <div className="list-row" key={e.id}>
                <span>
                  {e.name}
                  <small>{e.category}</small>
                </span>
                <b>{money(e.amount_minor)}</b>
              </div>
            ))
          ) : (
            <p className="muted">No expenses recorded for this trip.</p>
          )}
          {count > 100 && (
            <p>Showing first 100 expenses. Use Reports for totals.</p>
          )}
          <Link className="btn secondary" to="/expenses">
            <Wallet size={16} /> Manage expenses
          </Link>
        </section>
        <section className="panel padded">
          <h2>Ready to bill?</h2>
          <p>
            Create an itemised invoice from this trip’s rate and actual
            readings. Payments are recorded against invoices.
          </p>
          <Link className="btn" to={"/invoices?trip=" + id}>
            <Receipt size={16} /> Go to invoicing
          </Link>
        </section>
      </div>
      {print && (
        <Modal title="Trip voucher" onClose={() => setPrint(false)}>
          <PrintDocument kind="voucher" record={trip} />
        </Modal>
      )}
    </>
  );
}
