import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Pencil, Printer, Receipt, Wallet, ArrowRight, Navigation } from "lucide-react";
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
    [packageDays, setPackageDays] = useState([]),
    [expandedDayId, setExpandedDayId] = useState(null),
    [selectedDayTimeline, setSelectedDayTimeline] = useState(null),
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
    api
      .getTripDays(id)
      .then(setPackageDays)
      .catch(() => setPackageDays([]));
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

      {packageDays.length > 0 && (
        <section className="package-progress-card">
          <div className="package-progress-header">
            <div>
              <h2 className="text-base font-bold text-emerald-950">PACKAGE PROGRESS</h2>
              <p className="text-xs text-muted m-0">
                Multi-day Package Itinerary ({packageDays.filter((d) => d.status === "completed").length} of {packageDays.length} days completed)
              </p>
            </div>
            <Link className="btn secondary" to="/driver">
              <Navigation size={15} /> Open in Driver Mode
            </Link>
          </div>

          <div className="package-days-list">
            {packageDays.map((day) => {
              const isExpanded = expandedDayId === day.id;
              const dist =
                day.opening_km != null && day.closing_km != null
                  ? day.closing_km - day.opening_km
                  : null;
              return (
                <div
                  key={day.id}
                  className="package-day-row"
                  onClick={async () => {
                    if (expandedDayId === day.id) {
                      setExpandedDayId(null);
                      setSelectedDayTimeline(null);
                    } else {
                      setExpandedDayId(day.id);
                      try {
                        const t = await api.getTripDayTimeline(day.id);
                        setSelectedDayTimeline(t);
                      } catch {}
                    }
                  }}
                >
                  <div className="package-day-main">
                    <div className="package-day-left">
                      <span
                        className={`package-day-status-icon ${
                          day.status === "completed"
                            ? "completed"
                            : day.status === "in progress"
                              ? "in-progress"
                              : "pending"
                        }`}
                      >
                        {day.status === "completed"
                          ? "✓"
                          : day.status === "in progress"
                            ? "●"
                            : "○"}
                      </span>
                      <div>
                        <b>
                          Day {day.day_number}: {day.name || `${day.origin} → ${day.destination}`}
                        </b>
                        <small className="block text-muted">
                          {day.origin} → {day.destination}
                        </small>
                      </div>
                    </div>

                    <div className="text-right">
                      <Badge>{day.status}</Badge>
                      <small className="block mt-1 font-semibold text-emerald-800">
                        {dist != null
                          ? `${dist} km`
                          : day.status === "in progress"
                            ? "In progress"
                            : "Upcoming"}
                      </small>
                    </div>
                  </div>

                  {isExpanded && selectedDayTimeline && (
                    <div
                      className="package-day-details-expand"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex gap-4 flex-wrap">
                        <span>
                          <b>Opening:</b> {day.opening_km != null ? `${day.opening_km} km` : "—"}
                        </span>
                        <span>
                          <b>Closing:</b> {day.closing_km != null ? `${day.closing_km} km` : "—"}
                        </span>
                        {dist != null && (
                          <span className="text-emerald-800 font-bold">
                            <b>Today's Distance:</b> {dist} km
                          </span>
                        )}
                      </div>
                      <div className="mt-2">
                        <b>Stops & Timeline:</b>
                        {selectedDayTimeline.length === 0 ? (
                          <div className="text-muted mt-1">No recorded events yet for this day.</div>
                        ) : (
                          <div className="mt-2 space-y-1">
                            {selectedDayTimeline.map((item) => (
                              <div
                                key={item.id}
                                className="flex justify-between items-center py-1 border-b border-gray-100 text-xs"
                              >
                                <span>
                                  {new Date(item.timestamp).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}{" "}
                                  — <b>{item.title}</b>
                                  {item.subtitle && ` (${item.subtitle})`}
                                </span>
                                {item.amount_minor != null && (
                                  <b className="text-amber-800">{money(item.amount_minor)}</b>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

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
