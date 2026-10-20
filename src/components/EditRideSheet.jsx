import React, { useEffect, useMemo, useState } from "react";
import { X, Plus, AlertTriangle, MapPin, CalendarDays, Users, CarFront, UserRound, Contact, Lock } from "lucide-react";
import { Button } from "./ui";

/**
 * In-page "Edit ride" bottom sheet for Driver mode.
 * Tab 1: ride details (client, vehicle, driver, route, date, passengers, notes)
 * Tab 2: current day's plan (start, end, planned stops) for package trips
 */
export default function EditRideSheet({ trip, day, api, canAssign = true, initialTab = "ride", onClose, onSaved }) {
  const isBooking = !!trip.is_booking;
  const isCompleted = !isBooking && trip.status === "completed";
  const dayEditable = !isBooking && day && !/^(virtual-|day-|b-day-)/.test(String(day.id));
  const [tab, setTab] = useState(dayEditable ? initialTab : "ride");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState({ clients: [], vehicles: [], drivers: [] });

  const [form, setForm] = useState({
    client_id: trip.client_id || trip.client?.id || "",
    vehicle_id: trip.vehicle_id || trip.vehicle?.id || "",
    driver_id: trip.driver_id || trip.driver?.id || "",
    origin: trip.origin || "",
    destination: trip.destination || "",
    date: String(trip.date || "").slice(0, 10),
    pickup_time: String(trip.pickup_time || "").slice(0, 5),
    passengers: trip.passengers ?? "",
    package_name: trip.package_name || "",
    notes: trip.notes || "",
  });

  const [dayForm, setDayForm] = useState({
    origin: day?.origin || day?.start_place || "",
    destination: day?.destination || day?.end_place || "",
    date: String(day?.date || "").slice(0, 10),
    planned: Array.isArray(day?.planned_destinations) ? day.planned_destinations : [],
    newStop: "",
  });

  useEffect(() => {
    let active = true;
    Promise.all(
      ["clients", "vehicles", "drivers"].map((t) =>
        api.list(t, { limit: 500 }).then((r) => r.rows || []).catch(() => [])
      )
    ).then(([clients, vehicles, drivers]) => active && setOptions({ clients, vehicles, drivers }));
    return () => {
      active = false;
    };
  }, [api]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const missing = useMemo(() => {
    const m = [];
    if (!form.client_id) m.push("client");
    if (!form.vehicle_id) m.push("vehicle");
    if (!isBooking && !form.driver_id) m.push("driver");
    if (!form.origin.trim()) m.push("pickup");
    if (!form.destination.trim()) m.push("destination");
    return m;
  }, [form, isBooking]);

  const addStop = () => {
    const v = dayForm.newStop.trim();
    if (!v) return;
    setDayForm((d) => ({
      ...d,
      planned: d.planned.some((p) => p.toLowerCase() === v.toLowerCase()) ? d.planned : [...d.planned, v],
      newStop: "",
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (tab === "ride") {
        const patch = isCompleted ? { notes: form.notes } : { ...form };
        if (!canAssign) {
          delete patch.client_id;
          delete patch.vehicle_id;
          delete patch.driver_id;
        }
        if (isBooking) delete patch.package_name;
        else delete patch.pickup_time;
        await api.updateRide(trip, patch);
        onSaved?.("Ride details updated");
      } else {
        await api.updateTripDay(day.id, {
          day_number: day.day_number,
          origin: dayForm.origin,
          destination: dayForm.destination,
          date: dayForm.date,
          planned_destinations: dayForm.newStop.trim()
            ? [...dayForm.planned, dayForm.newStop.trim()]
            : dayForm.planned,
        });
        onSaved?.(`Day ${day.day_number} plan updated`);
      }
    } catch (err) {
      setError(err.message || "Could not save changes.");
    } finally {
      setBusy(false);
    }
  };

  const renderSelect = ({ id, icon: Icon, label, field, rows, disabled }) => (
    <label className="edit-field" htmlFor={id}>
      <span>
        <Icon size={13} /> {label}
      </span>
      <select
        id={id}
        value={form[field] || ""}
        disabled={disabled}
        onChange={(e) => set(field, e.target.value)}
        className={!form[field] ? "is-missing" : ""}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.model ? ` · ${r.model}` : ""}
            {r.phone ? ` · ${r.phone}` : ""}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="driver-modal-backdrop" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="driver-bottom-sheet edit-ride-sheet">
        <header className="sheet-header">
          <div>
            <h2>Edit {isBooking ? "booking" : "ride"}</h2>
            <p>
              {trip.name}
              {trip.package_name ? ` · ${trip.package_name}` : ""}
            </p>
          </div>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        {dayEditable && (
          <div className="edit-tabs" role="tablist">
            <button
              type="button"
              id="edit-tab-ride"
              role="tab"
              aria-selected={tab === "ride"}
              className={tab === "ride" ? "active" : ""}
              onClick={() => setTab("ride")}
            >
              Ride details
            </button>
            <button
              type="button"
              id="edit-tab-day"
              role="tab"
              aria-selected={tab === "day"}
              className={tab === "day" ? "active" : ""}
              onClick={() => setTab("day")}
            >
              Day {day.day_number} plan
            </button>
          </div>
        )}

        <form onSubmit={save} className="edit-ride-body">
          {tab === "ride" ? (
            <>
              {isCompleted && (
                <div className="edit-note">
                  <Lock size={14} /> Ride is completed — only notes can be changed.
                </div>
              )}
              {!isCompleted && missing.length > 0 && (
                <div className="edit-warn">
                  <AlertTriangle size={13} /> Add <b>{missing.join(", ")}</b> to start
                </div>
              )}

              {/* Route card */}
              <div className="edit-route-card">
                <span className="edit-route-line" aria-hidden="true" />
                <label className="edit-route-row" htmlFor="edit-origin">
                  <span className="edit-route-dot start" />
                  <input
                    id="edit-origin"
                    value={form.origin}
                    disabled={isCompleted}
                    placeholder="Pickup location"
                    aria-label="Pickup"
                    className={!form.origin.trim() ? "is-missing" : ""}
                    onChange={(e) => set("origin", e.target.value)}
                  />
                </label>
                <label className="edit-route-row" htmlFor="edit-destination">
                  <span className="edit-route-dot end" />
                  <input
                    id="edit-destination"
                    value={form.destination}
                    disabled={isCompleted}
                    placeholder="Destination"
                    aria-label="Destination"
                    className={!form.destination.trim() ? "is-missing" : ""}
                    onChange={(e) => set("destination", e.target.value)}
                  />
                </label>
              </div>

              <div className="edit-grid">
                {renderSelect({ id: "edit-client", icon: Contact, label: "Client", field: "client_id", rows: options.clients, disabled: isCompleted || !canAssign })}
                {renderSelect({ id: "edit-vehicle", icon: CarFront, label: "Vehicle", field: "vehicle_id", rows: options.vehicles, disabled: isCompleted || !canAssign })}
                {!isBooking &&
                  renderSelect({ id: "edit-driver", icon: UserRound, label: "Driver", field: "driver_id", rows: options.drivers, disabled: isCompleted || !canAssign })}
                <label className="edit-field" htmlFor="edit-date">
                  <span>
                    <CalendarDays size={12} /> {isBooking ? "Date" : "Start"}
                  </span>
                  <input id="edit-date" type="date" value={form.date} disabled={isCompleted} onChange={(e) => set("date", e.target.value)} />
                </label>
                {isBooking && (
                  <label className="edit-field" htmlFor="edit-time">
                    <span>Time</span>
                    <input id="edit-time" type="time" value={form.pickup_time} onChange={(e) => set("pickup_time", e.target.value)} />
                  </label>
                )}
                <label className="edit-field" htmlFor="edit-passengers">
                  <span>
                    <Users size={12} /> Pax
                  </span>
                  <input
                    id="edit-passengers"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={form.passengers}
                    disabled={isCompleted}
                    onChange={(e) => set("passengers", e.target.value)}
                  />
                </label>
              </div>

              <details className="edit-more" open={isCompleted || !!trip.notes}>
                <summary>More details{isBooking ? " · notes" : " · package, notes"}</summary>
                <div className="edit-more-body">
                  {!isBooking && (
                    <label className="edit-field" htmlFor="edit-package">
                      <span>Package name</span>
                      <input
                        id="edit-package"
                        value={form.package_name}
                        disabled={isCompleted}
                        placeholder="e.g. 7-Day Kerala Tour"
                        onChange={(e) => set("package_name", e.target.value)}
                      />
                    </label>
                  )}
                  <label className="edit-field" htmlFor="edit-notes">
                    <span>Notes</span>
                    <textarea id="edit-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                  </label>
                </div>
              </details>
            </>
          ) : (
            <>
              <div className="edit-route-card">
                <span className="edit-route-line" aria-hidden="true" />
                <label className="edit-route-row" htmlFor="edit-day-origin">
                  <span className="edit-route-dot start" />
                  <input
                    id="edit-day-origin"
                    value={dayForm.origin}
                    placeholder={`Day ${day.day_number} start`}
                    aria-label="Day start"
                    onChange={(e) => setDayForm((d) => ({ ...d, origin: e.target.value }))}
                  />
                </label>
                <label className="edit-route-row" htmlFor="edit-day-destination">
                  <span className="edit-route-dot end" />
                  <input
                    id="edit-day-destination"
                    value={dayForm.destination}
                    placeholder="Night stay / end"
                    aria-label="Night stay or end"
                    onChange={(e) => setDayForm((d) => ({ ...d, destination: e.target.value }))}
                  />
                </label>
                <label className="edit-route-date" htmlFor="edit-day-date">
                  <CalendarDays size={13} />
                  <input
                    id="edit-day-date"
                    type="date"
                    value={dayForm.date}
                    onChange={(e) => setDayForm((d) => ({ ...d, date: e.target.value }))}
                  />
                </label>
              </div>

              <div className="edit-field">
                <span>Planned stops ({dayForm.planned.length})</span>
                <div className="edit-stops">
                  {dayForm.planned.map((p, i) => (
                    <span key={p + i} className="edit-stop">
                      {p}
                      <button
                        type="button"
                        aria-label={`Remove ${p}`}
                        onClick={() => setDayForm((d) => ({ ...d, planned: d.planned.filter((_, j) => j !== i) }))}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {!dayForm.planned.length && <small className="edit-muted">No stops yet</small>}
                </div>
                <div className="edit-add-stop">
                  <input
                    id="edit-day-new-stop"
                    value={dayForm.newStop}
                    placeholder="Add a stop, e.g. Mattupetty Dam"
                    onChange={(e) => setDayForm((d) => ({ ...d, newStop: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addStop();
                      }
                    }}
                  />
                  <button type="button" className="ride-icon-btn" onClick={addStop} aria-label="Add stop">
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </>
          )}

          {error && <div className="sheet-error">{error}</div>}

          <div className="sheet-actions edit-actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
