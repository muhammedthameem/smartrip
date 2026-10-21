import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Navigation,
  Luggage,
  CalendarDays,
  UserRound,
  CarFront,
  Gauge,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { distance, money } from "../lib/calculations";
import { Badge, RecordName } from "./ui";

function formatTripDate(value) {
  if (!value) return "No date";
  const raw = String(value);
  const date = new Date(raw.length === 10 ? raw + "T00:00:00" : raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function rateSuffix(pricing) {
  if (pricing === "per km") return "per km";
  if (pricing === "package/day") return "per day";
  if (pricing === "fixed") return "fixed";
  return "";
}

export function TripCard({
  trip,
  archived = false,
  onArchive,
  onUnarchive,
  busy = false,
}) {
  const isLive = !archived && trip.status === "in progress";
  let km = null;
  try {
    km = distance(trip.opening_km, trip.closing_km);
  } catch {
    km = null;
  }

  return (
    <article
      className={
        "trip-card trip-card--" +
        String(trip.status || "draft").replaceAll(" ", "-") +
        (archived ? " is-archived" : "")
      }
    >
      <Link
        className="trip-card-hit"
        to={"/trips/" + trip.id}
        aria-label={"Open trip " + trip.name}
      />
      <div className="trip-card-top">
        <div className="trip-card-tags">
          {isLive && <span className="trip-live-dot" aria-hidden="true" />}
          <Badge>{trip.status}</Badge>
          {trip.package_name && (
            <span
              className="package-badge-tag"
              title={trip.package_name}
              aria-label={"Package: " + trip.package_name}
            >
              <Luggage size={11} /> Package
            </span>
          )}
          {archived && (
            <span className="trip-archived-tag">
              <Archive size={11} /> Archived
            </span>
          )}
        </div>
        <span className="trip-card-date">
          <CalendarDays size={13} /> {formatTripDate(trip.date)}
        </span>
      </div>

      <div className="trip-card-heading">
        <h3 className="trip-card-name">{trip.name}</h3>
        {trip.rate_minor != null && (
          <div className="trip-card-rate">
            <b>{money(trip.rate_minor)}</b>
            {rateSuffix(trip.pricing) && (
              <small>{rateSuffix(trip.pricing)}</small>
            )}
          </div>
        )}
      </div>

      <div className="trip-route-viz">
        <div className="trip-route-stop">
          <span className="trip-route-dot from" />
          <div>
            <small>Pickup</small>
            <b>{trip.origin || "Origin not set"}</b>
          </div>
        </div>
        <span className="trip-route-line" />
        <div className="trip-route-stop">
          <span className="trip-route-dot to" />
          <div>
            <small>Drop-off</small>
            <b>{trip.destination || "Destination not set"}</b>
          </div>
        </div>
      </div>

      <div className="trip-card-facts">
        <span className="trip-fact">
          <UserRound size={14} />
          <span className="trip-fact-text">
            <RecordName table="clients" id={trip.client_id} />
          </span>
        </span>
        <span className="trip-fact">
          <CarFront size={14} />
          <span className="trip-fact-text">
            <RecordName table="vehicles" id={trip.vehicle_id} />
          </span>
        </span>
        {trip.passengers ? (
          <span className="trip-fact">
            <UserRound size={14} />
            {trip.passengers} pax
          </span>
        ) : null}
        {km != null && (
          <span className="trip-fact">
            <Gauge size={14} />
            {km} km
          </span>
        )}
      </div>

      <div className="trip-card-foot">
        <span className="trip-card-open">
          View trip <ArrowRight size={15} />
        </span>
        <div className="trip-card-actions">
          {isLive && (
            <Link
              className="trip-driver-cta"
              to={"/driver?tripId=" + trip.id}
              aria-label={"Open driver mode for " + trip.name}
            >
              <Navigation size={14} fill="currentColor" /> Driver mode
            </Link>
          )}
          {!archived && onArchive && (
            <button
              type="button"
              className="trip-icon-btn"
              aria-label={"Archive " + trip.name}
              title="Archive trip"
              disabled={busy}
              onClick={() => onArchive(trip)}
            >
              <Archive size={15} />
            </button>
          )}
          {archived && onUnarchive && (
            <button
              type="button"
              className="trip-restore-cta"
              disabled={busy}
              onClick={() => onUnarchive(trip)}
            >
              <ArchiveRestore size={14} />
              {busy ? "Restoring…" : "Restore"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
