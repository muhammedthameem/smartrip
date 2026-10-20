import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Pencil,
  Printer,
  Receipt,
  Wallet,
  Navigation,
  ChevronDown,
  Gauge,
  Clock3,
  Users,
  CalendarDays,
  StickyNote,
} from "lucide-react";
import { useApp, useList } from "../lib/context";
import { distance, hours, money } from "../lib/calculations";
import {
  Loading,
  ErrorBox,
  Badge,
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

  const dist = distance(trip.opening_km, trip.closing_km);
  const dur = hours(trip.start_time, trip.end_time);
  const expenseTotal = expenses.reduce((s, e) => s + (e.amount_minor || 0), 0);
  const doneDays = packageDays.filter((d) => d.status === "completed").length;
  const progressPct = packageDays.length
    ? Math.round((doneDays / packageDays.length) * 100)
    : 0;

  const toggleDay = async (day) => {
    if (expandedDayId === day.id) {
      setExpandedDayId(null);
      setSelectedDayTimeline(null);
      return;
    }
    setExpandedDayId(day.id);
    setSelectedDayTimeline(null);
    try {
      const t = await api.getTripDayTimeline(day.id);
      setSelectedDayTimeline(t);
    } catch {
      setSelectedDayTimeline([]);
    }
  };

  const kpis = [
    { icon: Gauge, label: "Distance", value: dist == null ? "—" : `${dist} km`, hint: dist == null ? "Not completed" : "Odometer" },
    { icon: Clock3, label: "Duration", value: dur == null ? "—" : `${dur.toFixed(1)} h`, hint: dur == null ? "Not completed" : "Start → end" },
    { icon: Wallet, label: "Expenses", value: money(expenseTotal), hint: `${expenses.length} item${expenses.length === 1 ? "" : "s"}` },
    { icon: Users, label: "Passengers", value: trip.passengers || "—", hint: "On board" },
  ];

  const details = [
    ["Client", <RecordName table="clients" id={trip.client_id} />],
    ["Vehicle", <RecordName table="vehicles" id={trip.vehicle_id} />],
    ["Driver", <RecordName table="drivers" id={trip.driver_id} />],
    ["Pricing", `${trip.pricing || "—"} · ${money(trip.rate_minor)}`],
    ["Opening km", trip.opening_km ?? "—"],
    ["Closing km", trip.closing_km ?? "—"],
  ];

  return (
    <div className="td-page">
      {/* HERO */}
      <section className="td-hero">
        <div className="td-hero-top">
          <Badge>{trip.status}</Badge>
          <span className="td-date">
            <CalendarDays size={13} /> {trip.date || "No date"}
          </span>
        </div>
        <h1 className="td-title">{trip.name}</h1>

        <div className="td-route">
          <div className="td-route-row">
            <span className="td-dot from" />
            <div>
              <small>From</small>
              <b>{trip.origin || "Origin not set"}</b>
            </div>
          </div>
          <span className="td-route-line" />
          <div className="td-route-row">
            <span className="td-dot to" />
            <div>
              <small>To</small>
              <b>{trip.destination || "Destination not set"}</b>
            </div>
          </div>
        </div>

        <div className="td-actions">
          <Link className="td-action primary" to={"/driver?tripId=" + id}>
            <Navigation size={17} />
            <span>Driver mode</span>
          </Link>
          <Link className="td-action" to={"/trips/" + id + "/edit"}>
            <Pencil size={17} />
            <span>Edit</span>
          </Link>
          <button type="button" className="td-action" onClick={() => setPrint(true)}>
            <Printer size={17} />
            <span>Voucher</span>
          </button>
        </div>
      </section>

      {/* KPIs */}
      <section className="td-kpis">
        {kpis.map(({ icon: Icon, label, value, hint }) => (
          <div className="td-kpi" key={label}>
            <span className="td-kpi-icon">
              <Icon size={16} />
            </span>
            <div>
              <small>{label}</small>
              <b>{value}</b>
              <em>{hint}</em>
            </div>
          </div>
        ))}
      </section>

      {/* DETAILS */}
      <section className="td-card">
        <h2 className="td-card-title">Trip details</h2>
        <dl className="td-details">
          {details.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {trip.notes && (
          <div className="td-notes">
            <StickyNote size={15} />
            <p>{trip.notes}</p>
          </div>
        )}
      </section>

      {/* PACKAGE PROGRESS */}
      {packageDays.length > 0 ? (
        <section className="td-card">
          <div className="td-card-head">
            <div>
              <h2 className="td-card-title">Package progress</h2>
              <p className="td-sub">
                {doneDays} of {packageDays.length} days completed
              </p>
            </div>
            <span className="td-pct">{progressPct}%</span>
          </div>
          <div className="td-progress">
            <span style={{ width: `${progressPct}%` }} />
          </div>

          <div className="td-days">
            {packageDays.map((day) => {
              const isExpanded = expandedDayId === day.id;
              const dayDist =
                day.opening_km != null && day.closing_km != null
                  ? day.closing_km - day.opening_km
                  : null;
              const st =
                day.status === "completed"
                  ? "completed"
                  : day.status === "in progress"
                    ? "in-progress"
                    : "pending";
              return (
                <div key={day.id} className={`td-day ${st} ${isExpanded ? "open" : ""}`}>
                  <button
                    type="button"
                    className="td-day-main"
                    onClick={() => toggleDay(day)}
                    aria-expanded={isExpanded}
                  >
                    <span className={`td-day-num ${st}`}>
                      {st === "completed" ? "✓" : day.day_number}
                    </span>
                    <div className="td-day-info">
                      <b>{day.name || `Day ${day.day_number}`}</b>
                      <small>
                        {day.origin || "—"} → {day.destination || "—"}
                      </small>
                    </div>
                    <div className="td-day-meta">
                      <span className="td-day-km">
                        {dayDist != null
                          ? `${dayDist} km`
                          : st === "in-progress"
                            ? "Live"
                            : "Upcoming"}
                      </span>
                      <ChevronDown size={16} className="td-chev" />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="td-day-body">
                      <div className="td-day-odo">
                        <div>
                          <small>Opening</small>
                          <b>{day.opening_km != null ? `${day.opening_km} km` : "—"}</b>
                        </div>
                        <div>
                          <small>Closing</small>
                          <b>{day.closing_km != null ? `${day.closing_km} km` : "—"}</b>
                        </div>
                        <div>
                          <small>Distance</small>
                          <b className="accent">{dayDist != null ? `${dayDist} km` : "—"}</b>
                        </div>
                      </div>

                      {selectedDayTimeline == null ? (
                        <p className="td-muted">Loading timeline…</p>
                      ) : selectedDayTimeline.length === 0 ? (
                        <p className="td-muted">No recorded events yet for this day.</p>
                      ) : (
                        <ol className="td-timeline">
                          {selectedDayTimeline.map((item) => (
                            <li key={item.id}>
                              <time>
                                {new Date(item.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </time>
                              <div>
                                <b>{item.title}</b>
                                {item.subtitle && <small>{item.subtitle}</small>}
                              </div>
                              {item.amount_minor != null && (
                                <span className="td-amt">{money(item.amount_minor)}</span>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : trip.status !== "cancelled" ? (
        <Link className="td-card td-driver-cta" to={"/driver?tripId=" + id}>
          <span className="td-kpi-icon big">
            <Navigation size={20} />
          </span>
          <div>
            <b>Run this trip in Driver Mode</b>
            <small>Live GPS stops, fuel expenses and odometer logging.</small>
          </div>
        </Link>
      ) : null}

      {/* EXPENSES + BILLING */}
      <div className="td-two">
        <section className="td-card">
          <div className="td-card-head">
            <h2 className="td-card-title">Trip expenses</h2>
            <b className="td-total">{money(expenseTotal)}</b>
          </div>
          {expenses.length ? (
            <div className="td-expenses">
              {expenses.map((e) => (
                <div className="td-expense" key={e.id}>
                  <div>
                    <b>{e.name}</b>
                    <small>{e.category}</small>
                  </div>
                  <span>{money(e.amount_minor)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="td-muted">No expenses recorded for this trip.</p>
          )}
          {count > 100 && (
            <p className="td-muted">Showing first 100 expenses. Use Reports for totals.</p>
          )}
          <Link className="td-btn" to="/expenses">
            <Wallet size={16} /> Manage expenses
          </Link>
        </section>

        <section className="td-card td-bill">
          <h2 className="td-card-title">Ready to bill?</h2>
          <p className="td-sub">
            Create an itemised invoice from this trip’s rate and actual readings.
            Payments are recorded against invoices.
          </p>
          <Link className="td-btn primary" to={"/invoices?trip=" + id}>
            <Receipt size={16} /> Go to invoicing
          </Link>
        </section>
      </div>

      {print && (
        <Modal title="Trip voucher" onClose={() => setPrint(false)}>
          <PrintDocument kind="voucher" record={trip} />
        </Modal>
      )}
    </div>
  );
}
