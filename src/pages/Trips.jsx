import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ArrowUpRight, MapPin, ArrowRight, Route, Navigation, Luggage } from "lucide-react";
import { useList, useDebounce } from "../lib/context";
import {
  PageHeader,
  SearchBox,
  Badge,
  Button,
  Loading,
  ErrorBox,
  Empty,
  Pagination,
  RecordName,
} from "../components/ui";
import NewTripModal from "../components/NewTripModal";

export function TripCard({ trip }) {
  const navigate = useNavigate();
  const openDriverMode = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigate("/driver?tripId=" + trip.id);
  };
  return (
    <Link className="trip-card" to={"/trips/" + trip.id}>
      <div className="trip-card-head">
        <span>{trip.name}</span>
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
          {trip.package_name && (
            <span className="package-badge-tag" title={trip.package_name}>
              <Luggage size={11} /> Package
            </span>
          )}
          {trip.status === "in progress" && (
            <span
              role="link"
              tabIndex={0}
              className="badge"
              style={{
                background: "#ecfdf5",
                color: "#065f46",
                borderColor: "#a7f3d0",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                textDecoration: "none",
                fontSize: "0.72rem",
                fontWeight: 700,
                padding: "2px 6px",
                cursor: "pointer",
              }}
              onClick={openDriverMode}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openDriverMode(e)}
            >
              <Navigation size={11} fill="currentColor" /> Driver mode
            </span>
          )}
          <Badge>{trip.status}</Badge>
        </div>
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
    [page, setPage] = useState(0),
    [showNewModal, setShowNewModal] = useState(false);
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
        <Button onClick={() => setShowNewModal(true)}>
          <Plus size={18} /> New trip
        </Button>
      </PageHeader>
      <NewTripModal isOpen={showNewModal} onClose={() => setShowNewModal(false)} />
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
