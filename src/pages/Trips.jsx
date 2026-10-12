import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ArrowUpRight, MapPin, ArrowRight, Route } from "lucide-react";
import { useList, useDebounce } from "../lib/context";
import {
  PageHeader,
  SearchBox,
  Badge,
  Loading,
  ErrorBox,
  Empty,
  Pagination,
  RecordName,
} from "../components/ui";
export function TripCard({ trip }) {
  return (
    <Link className="trip-card" to={"/trips/" + trip.id}>
      <div className="trip-card-head">
        <span>{trip.name}</span>
        <Badge>{trip.status}</Badge>
      </div>
      <div className="trip-route">
        <h3>{trip.origin || "Route to be added"}</h3>
        <ArrowRight size={18} />
        <h3>{trip.destination || "Destination"}</h3>
      </div>
      <div className="trip-meta">
        <span>
          <RecordName table="clients" id={trip.client_id} />
        </span>
        <span>{trip.date}</span>
      </div>
      <div className="trip-bottom">
        <span>
          <RecordName table="vehicles" id={trip.vehicle_id} />
        </span>
        <ArrowUpRight size={17} />
      </div>
    </Link>
  );
}
export default function Trips() {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(0);
  const { rows, count, loading, error } = useList("trips", {
    page,
    search: useDebounce(search),
    filters: { status },
  });
  return (
    <>
      <PageHeader
        title="Trips"
        subtitle="From the first kilometre to the final stop."
      >
        <Link to="/trips/new" className="btn">
          <Plus size={18} /> New trip
        </Link>
      </PageHeader>
      <section className="panel">
        <div className="toolbar">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(0);
            }}
            placeholder="Search voucher number…"
          />
          <select
            aria-label="Trip status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All statuses</option>
            {[
              "draft",
              "booked",
              "planned",
              "in progress",
              "completed",
              "cancelled",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} />
        ) : rows.length ? (
          <div className="trip-grid">
            {rows.map((r) => (
              <TripCard key={r.id} trip={r} />
            ))}
          </div>
        ) : (
          <Empty
            title="The road is yours"
            text="Create your first trip to start tracking the journey."
          />
        )}
        <Pagination page={page} setPage={setPage} count={count} />
      </section>
    </>
  );
}
