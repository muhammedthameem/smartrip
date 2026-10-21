import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Archive, ArchiveRestore } from "lucide-react";
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

export default function Archived() {
  const { api, refresh, notify } = useApp();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState("");
  const { rows, count, loading, error } = useList("trips", {
    page,
    search: useDebounce(search),
    archivedOnly: true,
  });

  const restoreTrip = async (trip) => {
    const ok = await confirm({
      title: "Restore this trip?",
      message: "Move " + trip.name + " back to active trips?",
      detail: "Its history, days and expenses stay exactly as they are.",
      confirmLabel: "Restore trip",
      icon: ArchiveRestore,
      tone: "default",
    });
    if (!ok) return;
    setBusyId(trip.id);
    try {
      await api.unarchive("trips", trip.id);
      notify("Trip restored");
      refresh();
    } catch (e) {
      notify(e.message || "Could not restore trip");
    } finally {
      setBusyId("");
    }
  };

  const clearSearch = () => {
    setSearch("");
    setPage(0);
  };

  return (
    <div className="trips-page archived-page">
      <PageHeader
        eyebrow="RECORDS"
        title="Archived trips"
        subtitle="Trips kept out of the way, preserved for the record."
      >
        <Link className="btn secondary archived-back" to="/trips">
          <ArrowLeft size={17} /> Active trips
        </Link>
      </PageHeader>

      <section className="trips-controls" aria-label="Find archived trips">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
          placeholder="Search archived vouchers…"
        />
      </section>

      {!loading && !error && (
        <div className="trips-summary" aria-live="polite">
          <span>
            <b>{count}</b> archived {count === 1 ? "trip" : "trips"}
            {search ? <span className="trips-summary-tag"> · “{search}”</span> : null}
          </span>
          {search && (
            <button type="button" className="trips-reset" onClick={clearSearch}>
              Clear search
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
                archived
                onUnarchive={restoreTrip}
                busy={busyId === r.id}
              />
            ))}
          </div>
        ) : (
          <Empty
            title={search ? "No archived trips found" : "Nothing archived"}
            text={
              search
                ? "Try a different voucher number."
                : "Archived trips will wait here until you restore them."
            }
          >
            {search ? (
              <Button variant="secondary" onClick={clearSearch}>
                Clear search
              </Button>
            ) : (
              <Link className="btn" to="/trips">
                <ArchiveRestore size={17} /> Back to active trips
              </Link>
            )}
          </Empty>
        )}
        {!loading && count > 0 && (
          <Pagination page={page} setPage={setPage} count={count} />
        )}
      </section>

      {!loading && !error && count > 0 && (
        <p className="archived-hint">
          <Archive size={14} /> Archived trips keep their history and can be
          restored at any time.
        </p>
      )}
    </div>
  );
}
