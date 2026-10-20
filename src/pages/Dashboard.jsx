import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  Route,
  Wallet,
  Receipt,
  ArrowRight,
  CalendarDays,
  CarFront,
  Users,
} from "lucide-react";
import { useApp, useList } from "../lib/context";
import { today, money, balanceFor } from "../lib/calculations";
import {
  PageHeader,
  Stat,
  Loading,
  ErrorBox,
  Empty,
  Button,
  Badge,
} from "../components/ui";
import { TripCard } from "./Trips";
import NewTripModal from "../components/NewTripModal";
export default function Dashboard() {
  const { api, version } = useApp(),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [period, setPeriod] = useState("month"),
    [showNewModal, setShowNewModal] = useState(false);
  const end = today(),
    start = period === "today" ? end : end.slice(0, 8) + "01";
  const { rows: trips } = useList("trips", { limit: 3 }),
    { count: vehicleCount } = useList("vehicles", { limit: 1 });
  useEffect(() => {
    setError("");
    api
      .report(start, end)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [api, version, start, end]);
  if (error) return <ErrorBox message={error} />;
  const invoices = data?.invoices.filter((i) => i.status !== "cancelled") || [],
    revenue = invoices.reduce((s, i) => s + i.total_minor, 0),
    expense = data?.expenses.reduce((s, e) => s + e.amount_minor, 0) || 0,
    maintenance =
      data?.maintenance.reduce((s, e) => s + e.amount_minor, 0) || 0,
    due = invoices.reduce(
      (s, i) => s + balanceFor(i, data.all_payments || []),
      0,
    ),
    categories = Object.entries(
      (data?.expenses || []).reduce(
        (s, e) => ({
          ...s,
          [e.category]: (s[e.category] || 0) + e.amount_minor,
        }),
        {},
      ),
    );
  return (
    <>
      <PageHeader
        eyebrow="A CLEARER VIEW OF YOUR BUSINESS"
        title="Let’s keep things moving."
        subtitle="Every trip, every detail. Right where you need it."
      >
        <select
          aria-label="Dashboard period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="month">This month</option>
          <option value="today">Today</option>
        </select>
        <Button onClick={() => setShowNewModal(true)}>
          <Plus size={18} /> New trip
        </Button>
      </PageHeader>
      <NewTripModal isOpen={showNewModal} onClose={() => setShowNewModal(false)} />
      <section className="welcome-banner">
        <div>
          <Badge>YOUR OPERATIONS, CONNECTED</Badge>
          <h2>
            Less admin.
            <br />
            More open road.
          </h2>
          <p>A smoother day starts with a little clarity.</p>
          <Link to="/trips">
            View your trips <ArrowRight size={17} />
          </Link>
        </div>
        <div className="route-illustration" aria-hidden="true">
          <span className="map-label start">START</span>
          <svg viewBox="0 0 500 210">
            <path
              className="map-grid"
              d="M0 40H500M0 100H500M0 160H500M70 0V210M170 0V210M270 0V210M370 0V210M470 0V210"
            />
            <path
              className="map-road"
              d="M40 155H160Q190 155 190 125V70Q190 40 220 40H310Q340 40 340 70V125Q340 155 370 155H465"
            />
            <circle cx="40" cy="155" r="10" />
            <circle cx="465" cy="155" r="10" />
          </svg>
          <span className="map-label end">WHAT’S NEXT</span>
          <div className="map-car">
            <CarFront size={25} />
          </div>
        </div>
      </section>
      {!data ? (
        <Loading />
      ) : (
        <div className="stats-grid">
          <Stat
            label="Trips this period"
            value={data.trips.filter((t) => t.status !== "cancelled").length}
            foot={
              data.trips.filter((t) => t.status === "in progress").length +
              " currently on the road"
            }
            icon={Route}
          />
          <Stat
            label="Invoiced revenue"
            value={money(revenue)}
            foot="Issued invoices · before collections"
            icon={Receipt}
          />
          <Stat
            label="Operating costs"
            value={money(expense + maintenance)}
            foot="Expenses + maintenance"
            icon={Wallet}
          />
          <Stat
            label="Balance to collect"
            value={money(due)}
            foot="For invoices in this period"
            icon={ArrowUpRight}
          />
        </div>
      )}
      <div className="section-heading">
        <div>
          <h2>Your latest journeys</h2>
          <p>A quick look at what’s on the road.</p>
        </div>
        <Link to="/trips">
          All trips <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="trip-grid">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} />
        ))}
        {!trips.length && <Empty title="Your first journey awaits" />}
      </div>
      <div className="dashboard-bottom">
        <section className="panel padded">
          <div className="section-heading compact">
            <h2>Where the money goes</h2>
            <span className="muted">This period</span>
          </div>
          {categories.length ? (
            categories.map(([name, value], i) => (
              <div className="expense-bar" key={name}>
                <div>
                  <span>
                    <i
                      style={{
                        background: [
                          "#176851",
                          "#99b18a",
                          "#dfa366",
                          "#9cadbd",
                        ][i % 4],
                      }}
                    />
                    {name}
                  </span>
                  <b>{money(value)}</b>
                </div>
                <div className="bar-track">
                  <div
                    style={{
                      width: (value / expense) * 100 + "%",
                      background: ["#176851", "#99b18a", "#dfa366", "#9cadbd"][
                        i % 4
                      ],
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="muted">
              Expense categories will appear as you record costs.
            </p>
          )}
          <Link className="text-link" to="/reports">
            Explore reports <ArrowRight size={16} />
          </Link>
        </section>
        <section className="panel padded quick-panel">
          <span className="eyebrow">ONE LESS THING TO REMEMBER</span>
          <h2>A place for every detail.</h2>
          <div className="quick-links">
            <Link to="/bookings">
              <CalendarDays size={19} />
              <span>Plan a booking</span>
              <ArrowUpRight size={16} />
            </Link>
            <Link to="/vehicles">
              <CarFront size={19} />
              <span>
                Your fleet <small>{vehicleCount} active vehicles</small>
              </span>
              <ArrowUpRight size={16} />
            </Link>
            <Link to="/clients">
              <Users size={19} />
              <span>Client directory</span>
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
