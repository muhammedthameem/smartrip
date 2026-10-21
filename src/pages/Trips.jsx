import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Archive } from "lucide-react";
import { useApp, useList, useDebounce } from "../lib/context";
import {
  PageHeader,
  SearchBox,
  Button,
  Loading,
  ErrorBox,
  Empty,
  Pagination,
} from "../components/ui";
import { TripCard } from "../components/TripCard";
import { useConfirm } from "../components/Confirm";
import NewTripModal from "../components/NewTripModal";

const TRIP_STATUSES = [
  "",
  "in progress",
  "planned",
  "booked",
  "completed",
  "draft",
  "cancelled",
];

const statusLabel = (status) =>
  status ? status.charAt(0).toUpperCase() + status.slice(1) : "All trips";

export default function Trips() {
  const { api, refresh, notify } = useApp();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [showNewModal, setShowNewModal] = useState(false);
  const [busyId, setBusyId] = useState("");
  const railRef = useRef(null);
  const [railEdges, setRailEdges] = useState({ left: false, right: false });
  const { rows, count, loading, error } = useList("trips", {
    page,
    search: useDebounce(search),
    filters: { status },
  });
  const hasFilters = Boolean(search || status);

  const syncRail = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 4;
    const right = max - el.scrollLeft > 4;
    setRailEdges((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right },
    );
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    syncRail();
    el.addEventListener("scroll", syncRail, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncRail);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", syncRail);
      observer?.disconnect();
    };
  }, [syncRail]);

  useEffect(() => {
    const el = railRef.current;
    const active = el?.querySelector(".trip-chip.is-active");
    if (!el || !active) return;
    const railBox = el.getBoundingClientRect();
    const chipBox = active.getBoundingClientRect();
    const delta =
      chipBox.left +
      chipBox.width / 2 -
      (railBox.left + railBox.width / 2);
    if (Math.abs(delta) < 2) return;
    el.scrollTo({ left: el.scrollLeft + delta, behavior: "smooth" });
  }, [status]);

  const resetFilters = () => {
    setSearch("");
    setStatus("");
    setPage(0);
  };

  const archiveTrip = async (trip) => {
    const ok = await confirm({
      title: "Archive this trip?",
      message: "Archive " + trip.name + " and remove it from the active list?",
      detail:
        "Historical links will be preserved. You can restore it from Archived trips at any time.",
      confirmLabel: "Archive trip",
      icon: Archive,
      tone: "warning",
    });
    if (!ok) return;
    setBusyId(trip.id);
    try {
      await api.archive("trips", trip.id);
      notify("Trip archived");
      refresh();
    } catch (e) {
      notify(e.message || "Could not archive trip");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="trips-page">
      <PageHeader
        eyebrow="YOUR JOURNEYS"
        title="Trips"
        subtitle="From the first kilometre to the final stop."
      >
        <Link className="btn secondary" to="/trips/archived">
          <Archive size={17} /> Archived
        </Link>
        <Button onClick={() => setShowNewModal(true)}>
          <Plus size={18} /> New trip
        </Button>
      </PageHeader>
      <NewTripModal isOpen={showNewModal} onClose={() => setShowNewModal(false)} />

      <section className="trips-controls" aria-label="Find trips">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
          placeholder="Search voucher number…"
        />
        <div
          className={
            "trip-chip-rail" +
            (railEdges.left ? " can-left" : "") +
            (railEdges.right ? " can-right" : "")
          }
        >
          <div
            className="trip-filter-chips"
            ref={railRef}
            role="group"
            aria-label="Filter by status"
          >
            {TRIP_STATUSES.map((s) => (
              <button
                key={s || "all"}
                type="button"
                className={"trip-chip" + (status === s ? " is-active" : "")}
                aria-pressed={status === s}
                onClick={() => {
                  setStatus(s);
                  setPage(0);
                }}
              >
                {statusLabel(s)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!loading && !error && (
        <div className="trips-summary" aria-live="polite">
          <span>
            <b>{count}</b> {count === 1 ? "trip" : "trips"}
            {status ? <span className="trips-summary-tag"> · {statusLabel(status)}</span> : null}
            {search ? <span className="trips-summary-tag"> · “{search}”</span> : null}
          </span>
          {hasFilters && (
            <button type="button" className="trips-reset" onClick={resetFilters}>
              Reset filters
            </button>
          )}
        </div>
      )}

      <section className="trips-results">
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} />
        ) : rows.length ? (
          <div className="trip-grid">
            {rows.map((r) => (
              <TripCard
                key={r.id}
                trip={r}
                onArchive={archiveTrip}
                busy={busyId === r.id}
              />
            ))}
          </div>
        ) : (
          <Empty
            title={hasFilters ? "No trips found" : "The road is yours"}
            text={
              hasFilters
                ? "Try a different status or search term."
                : "Create your first trip to start tracking the journey."
            }
          >
            {hasFilters ? (
              <Button variant="secondary" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => setShowNewModal(true)}>
                <Plus size={17} /> Create trip
              </Button>
            )}
          </Empty>
        )}
        {!loading && count > 0 && (
          <Pagination page={page} setPage={setPage} count={count} />
        )}
      </section>
    </div>
  );
}
