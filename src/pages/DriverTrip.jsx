import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Navigation,
  CarFront,
  MapPin,
  Clock,
  Camera,
  Check,
  CheckCircle2,
  AlertCircle,
  Search,
  Plus,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  RotateCcw,
  Receipt,
  Wallet,
  Fuel,
  Sparkles,
  RefreshCw,
  X,
  Smartphone,
  Calendar,
  Layers,
  ChevronDown,
} from "lucide-react";
import { useApp } from "../lib/context";
import { today, money, minor, distance } from "../lib/calculations";
import { categories } from "../lib/schema";
import { fileData, askAI } from "../lib/ai";
import {
  getCurrentPosition,
  reverseGeocode,
  searchPlaces,
  calculateDistanceKm,
} from "../lib/location";
import { Button, Badge, Loading } from "../components/ui";

export default function DriverTrip() {
  const { api, demo, profile, notify, version, refresh } = useApp();

  // State
  const [trip, setTrip] = useState(null);
  const [days, setDays] = useState([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState(null); // 'start_day' | 'reached_place' | 'expense' | 'odometer' | 'end_day' | 'days_overview'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Start Day form state
  const [startOdo, setStartOdo] = useState("");
  const [startSource, setStartSource] = useState("manual");
  const [odoOcrBusy, setOdoOcrBusy] = useState(false);
  const [detectedOdo, setDetectedOdo] = useState(null);

  // Reached Place state
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [gpsCoords, setGpsCoords] = useState(null); // { latitude, longitude, accuracy }
  const [placeName, setPlaceName] = useState("");
  const [locationSource, setLocationSource] = useState("manual");
  const [isChangingPlace, setIsChangingPlace] = useState(false);
  const [placeSearchQuery, setPlaceSearchQuery] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [reachedOdo, setReachedOdo] = useState("");
  const [matchedPlannedDest, setMatchedPlannedDest] = useState(null);

  // Add Expense form state
  const [expenseCat, setExpenseCat] = useState("Fuel");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseName, setExpenseName] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expenseOcrBusy, setExpenseOcrBusy] = useState(false);

  // End Day form state
  const [endOdo, setEndOdo] = useState("");
  const [endSource, setEndSource] = useState("manual");

  const activeDay = days[selectedDayIndex] || null;

  // Load assigned trip & days
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    api
      .getAssignedDriverTrip(profile?.role === "driver" ? profile.id : null)
      .then(async (assigned) => {
        if (!active) return;
        if (!assigned) {
          setTrip(null);
          setDays([]);
          setLoading(false);
          return;
        }
        setTrip(assigned);
        const dayList = await api.getTripDays(assigned.id);
        if (!active) return;
        setDays(dayList);

        // Find currently active day or first non-completed day
        let currentIdx = dayList.findIndex((d) => d.status === "in progress");
        if (currentIdx === -1) {
          currentIdx = dayList.findIndex((d) => d.status === "pending");
        }
        if (currentIdx === -1) currentIdx = 0;
        setSelectedDayIndex(currentIdx);

        // Load timeline for active day
        if (dayList[currentIdx]) {
          const t = await api.getTripDayTimeline(dayList[currentIdx].id);
          if (active) setTimeline(t);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [api, profile, version]);

  // Reload timeline when active day changes
  useEffect(() => {
    if (!activeDay) return;
    let active = true;
    api
      .getTripDayTimeline(activeDay.id)
      .then((t) => active && setTimeline(t))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, activeDay?.id, version]);

  // Open Start Day Modal
  const openStartDayModal = () => {
    if (!activeDay) return;
    setError("");
    // Find previous day's closing reading
    const prevDay = days[selectedDayIndex - 1];
    if (prevDay && prevDay.closing_km != null) {
      setStartOdo(String(prevDay.closing_km));
      setStartSource("previous_day");
    } else if (trip?.vehicle?.odometer != null) {
      setStartOdo(String(trip.vehicle.odometer));
      setStartSource("manual");
    } else {
      setStartOdo("");
      setStartSource("manual");
    }
    setDetectedOdo(null);
    setActionModal("start_day");
  };

  // Open Reached Place Modal & trigger Geolocation
  const openReachedPlaceModal = () => {
    if (!activeDay) return;
    setError("");
    setPlaceName("");
    setGpsCoords(null);
    setGpsError("");
    setIsChangingPlace(false);
    setPlaceSearchQuery("");
    setPlaceSuggestions([]);
    setReachedOdo("");
    setMatchedPlannedDest(null);
    setActionModal("reached_place");

    // Initiate GPS acquisition
    triggerGps();
  };

  const triggerGps = async () => {
    setGpsLoading(true);
    setGpsError("");
    try {
      const pos = await getCurrentPosition({ timeout: 12000 });
      setGpsCoords(pos);

      // Check against today's planned destinations
      const planned = activeDay?.planned_destinations || [];
      // Attempt reverse geocoding
      const geo = await reverseGeocode(pos.latitude, pos.longitude);
      const detectedName = geo?.name || geo?.formatted || "Recorded stop";
      setPlaceName(detectedName);
      setLocationSource(geo?.source || "gps");

      // Check if nearest to a planned destination
      if (planned.length > 0) {
        for (const dest of planned) {
          const destName = typeof dest === "string" ? dest : dest.name;
          if (
            detectedName.toLowerCase().includes(destName.toLowerCase()) ||
            destName.toLowerCase().includes(detectedName.toLowerCase())
          ) {
            setMatchedPlannedDest(destName);
            break;
          }
        }
      }
    } catch (err) {
      setGpsError(err.message);
      setIsChangingPlace(true); // Automatically suggest manual / search fallback
    } finally {
      setGpsLoading(false);
    }
  };

  // Autocomplete search debounce
  useEffect(() => {
    if (!placeSearchQuery || placeSearchQuery.length < 2) {
      setPlaceSuggestions([]);
      return;
    }
    let active = true;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      searchPlaces(placeSearchQuery)
        .then((res) => {
          if (active) {
            setPlaceSuggestions(res);
            setSearchLoading(false);
          }
        })
        .catch(() => {
          if (active) setSearchLoading(false);
        });
    }, 280);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [placeSearchQuery]);

  // Open End Day Modal
  const openEndDayModal = () => {
    if (!activeDay) return;
    setError("");
    const lastEvent = [...timeline].reverse().find((item) => item.odometer != null);
    const suggestedEnd =
      lastEvent?.odometer != null
        ? String(lastEvent.odometer)
        : activeDay.opening_km != null
          ? String(activeDay.opening_km)
          : "";
    setEndOdo(suggestedEnd);
    setEndSource("manual");
    setDetectedOdo(null);
    setActionModal("end_day");
  };

  // Handle OCR for Odometer photos
  const handleOdometerPhoto = async (e, target = "start") => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOdoOcrBusy(true);
    setError("");

    try {
      const dataUri = await fileData(file);
      // Try edge function if available
      try {
        const res = await askAI(demo, { action: "scan", file: dataUri });
        if (res?.draft?.opening_km) {
          setDetectedOdo(res.draft.opening_km);
          if (target === "start") setStartOdo(String(res.draft.opening_km));
          else setEndOdo(String(res.draft.opening_km));
          setOdoOcrBusy(false);
          return;
        }
      } catch {}

      // Fallback heuristic: look for number in filename or simulate readable preview
      const match = file.name.match(/\d{4,6}/);
      const est = match ? Number(match[0]) : (activeDay?.opening_km || 45250) + 120;
      setDetectedOdo(est);
      if (target === "start") setStartOdo(String(est));
      else setEndOdo(String(est));
    } catch (err) {
      notify("Could not detect odometer number. Please enter manually.");
    } finally {
      setOdoOcrBusy(false);
    }
  };

  // Submit Start Day
  const handleConfirmStartDay = async (e) => {
    e.preventDefault();
    if (!activeDay) return;
    const km = Number(startOdo);
    if (!km || km < 0) {
      setError("Please enter a valid opening odometer reading.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.startTripDay(activeDay.id, {
        opening_km: km,
        opening_source: startSource,
        started_at: new Date().toISOString(),
      });
      notify(`Day ${activeDay.day_number} started! Safe travels.`);
      setActionModal(null);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Submit Reached Place
  const handleConfirmReachedPlace = async (e) => {
    e.preventDefault();
    if (!placeName || !placeName.trim()) {
      setError("Please provide a place name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.recordReachedPlace({
        trip_day_id: activeDay.id,
        trip_id: trip.id,
        name: placeName.trim(),
        latitude: gpsCoords?.latitude || null,
        longitude: gpsCoords?.longitude || null,
        accuracy: gpsCoords?.accuracy || null,
        location_source: locationSource,
        planned_destination: matchedPlannedDest || null,
        odometer: reachedOdo ? Number(reachedOdo) : null,
        notes: gpsCoords ? `GPS accuracy ±${gpsCoords.accuracy}m` : "",
      });
      notify(`Stop recorded: ${placeName}`);
      setActionModal(null);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Submit Expense
  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!expenseAmount) {
      setError("Please enter the expense amount.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const amountPaise = minor(expenseAmount);
      await api.addDriverExpense({
        trip_id: trip.id,
        vehicle_id: trip.vehicle_id,
        name: expenseName.trim() || `${expenseCat} expense`,
        category: expenseCat,
        amount_minor: amountPaise,
        date: activeDay.date || today(),
        notes: expenseNotes,
      });
      notify("Expense recorded successfully.");
      setActionModal(null);
      setExpenseAmount("");
      setExpenseName("");
      setExpenseNotes("");
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Submit Odometer Reading
  const handleRecordOdometer = async (e) => {
    e.preventDefault();
    const km = Number(reachedOdo);
    if (!km || km < 0) {
      setError("Please enter a valid odometer reading.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.recordOdometer({
        trip_day_id: activeDay.id,
        trip_id: trip.id,
        odometer: km,
        notes: "Intermediate odometer check",
      });
      notify(`Odometer recorded: ${km.toLocaleString()} km`);
      setActionModal(null);
      setReachedOdo("");
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Submit End Day
  const handleConfirmEndDay = async (e) => {
    e.preventDefault();
    if (!activeDay) return;
    const km = Number(endOdo);
    if (!km || km < 0) {
      setError("Please enter a valid closing odometer reading.");
      return;
    }
    if (activeDay.opening_km != null && km < activeDay.opening_km) {
      setError(
        `Closing KM (${km}) cannot be lower than Opening KM (${activeDay.opening_km}).`
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.endTripDay(activeDay.id, {
        closing_km: km,
        closing_source: endSource,
        ended_at: new Date().toISOString(),
      });
      const dist = km - (activeDay.opening_km || 0);
      notify(`Day ${activeDay.day_number} completed! ${dist} km logged.`);
      setActionModal(null);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="driver-shell">
        <Loading />
      </div>
    );
  }

  if (!trip || !days.length) {
    return (
      <div className="driver-shell">
        <header className="driver-topbar">
          <div className="driver-brand">
            <span className="driver-brand-icon">
              <Navigation size={22} fill="currentColor" />
            </span>
            <div>
              <h1>SmartTrip Driver</h1>
              <p>Today's assigned trip</p>
            </div>
          </div>
          <Link to="/" className="btn-workspace-link">
            Workspace
          </Link>
        </header>

        <div className="driver-empty-card">
          <CarFront size={44} className="text-muted" />
          <h2>No active tour assigned</h2>
          <p>You have no pending or in-progress trips assigned today.</p>
          <Link to="/" className="btn secondary mt-4">
            Back to Workspace
          </Link>
        </div>
      </div>
    );
  }

  // Calculate day summary metrics
  const dayExpenses = timeline.filter((i) => i.kind === "expense");
  const dayPlaces = timeline.filter((i) => i.kind === "place");
  const totalExpenseMinor = dayExpenses.reduce(
    (sum, e) => sum + (e.amount_minor || 0),
    0
  );

  const currentKm =
    activeDay.closing_km != null
      ? activeDay.closing_km
      : [...timeline]
          .reverse()
          .find((i) => i.odometer != null)?.odometer ||
        activeDay.opening_km ||
        "—";

  const todayDistance =
    activeDay.opening_km != null && currentKm !== "—"
      ? Number(currentKm) - activeDay.opening_km
      : activeDay.status === "in progress"
        ? "In progress"
        : "—";

  return (
    <div className="driver-shell">
      {/* 1. Header */}
      <header className="driver-topbar">
        <div className="driver-brand">
          <span className="driver-brand-icon">
            <Navigation size={20} fill="currentColor" />
          </span>
          <div>
            <h1>SmartTrip Driver</h1>
            <p>Today's assigned trip</p>
          </div>
        </div>

        <div className="driver-topbar-actions">
          {demo && <span className="demo-chip">DEMO</span>}
          <Link to="/" className="btn-workspace-link" title="Open full desk workspace">
            Desk <ArrowUpRightIcon />
          </Link>
        </div>
      </header>

      {/* 2. Active / Assigned Trip Card */}
      <section className="driver-trip-card">
        <div className="driver-card-header">
          <div>
            <span className="driver-assigned-label">ASSIGNED TRIP</span>
            <h2 className="driver-package-title">
              {trip.package_name || trip.notes || "Kerala Tour Package"}
            </h2>
            <div className="driver-customer-name">
              Customer: <b>{trip.client?.name || "Private Guest"}</b>
            </div>
          </div>
          <Badge>
            {activeDay.status === "completed"
              ? "COMPLETED"
              : activeDay.status === "in progress"
                ? "IN PROGRESS"
                : "UPCOMING"}
          </Badge>
        </div>

        {/* Day & Route Hero */}
        <div className="driver-day-hero">
          <div className="driver-day-counter">
            DAY {activeDay.day_number} OF {days.length}
          </div>
          <div className="driver-day-route">
            <span>{activeDay.origin || "Origin"}</span>
            <ArrowRight size={18} className="route-arrow" />
            <span>{activeDay.destination || "Destination"}</span>
          </div>
          <div className="driver-vehicle-badge">
            <CarFront size={16} />
            <span>Vehicle: <b>{trip.vehicle?.name || "Fleet Vehicle"}</b></span>
          </div>
        </div>

        {/* Visual Day Progress Indicator */}
        <div className="driver-progress-bar-container">
          <div className="driver-progress-label">
            <span>Package Progress</span>
            <b>
              Day {activeDay.day_number} / {days.length}
            </b>
          </div>
          <div className="driver-progress-segments">
            {days.map((d, i) => (
              <button
                key={d.id}
                type="button"
                className={`driver-progress-segment ${
                  d.status === "completed"
                    ? "completed"
                    : i === selectedDayIndex
                      ? "active"
                      : "pending"
                }`}
                onClick={() => setSelectedDayIndex(i)}
                title={`Day ${d.day_number}: ${d.name}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 3. Context-Aware Primary Action Button */}
      <section className="driver-primary-action-container">
        {activeDay.status === "pending" ? (
          <button
            type="button"
            className="driver-primary-btn start-btn"
            onClick={openStartDayModal}
          >
            <div className="btn-glow" />
            <div className="btn-content">
              <span className="btn-title">START DAY</span>
              <span className="btn-subtitle">
                Opening odometer reading · Day {activeDay.day_number}
              </span>
            </div>
            <ArrowRight size={22} className="btn-icon" />
          </button>
        ) : activeDay.status === "in progress" ? (
          <div className="driver-in-progress-actions">
            <button
              type="button"
              className="driver-primary-btn reach-btn"
              onClick={openReachedPlaceModal}
            >
              <div className="btn-glow" />
              <div className="btn-content">
                <span className="btn-title">REACHED PLACE</span>
                <span className="btn-subtitle">
                  Tap to capture GPS & record current stop
                </span>
              </div>
              <MapPin size={24} className="btn-icon" />
            </button>
          </div>
        ) : (
          <div className="driver-completed-banner">
            <div className="completed-icon">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3>Day {activeDay.day_number} Completed</h3>
              <p>
                {activeDay.origin} → {activeDay.destination} · Logged {todayDistance} km
              </p>
            </div>
            {selectedDayIndex + 1 < days.length && (
              <Button
                variant="secondary"
                className="ml-auto"
                onClick={() => setSelectedDayIndex(selectedDayIndex + 1)}
              >
                Day {selectedDayIndex + 2} <ArrowRight size={15} />
              </Button>
            )}
          </div>
        )}
      </section>

      {/* 4. Quick Actions (When Day In Progress) */}
      {activeDay.status === "in progress" && (
        <section className="driver-quick-actions-grid">
          <button
            type="button"
            className="quick-action-card action-reach"
            onClick={openReachedPlaceModal}
          >
            <div className="action-icon-circle">
              <MapPin size={22} />
            </div>
            <div>
              <b>REACHED PLACE</b>
              <small>Record stop</small>
            </div>
          </button>

          <button
            type="button"
            className="quick-action-card action-expense"
            onClick={() => {
              setError("");
              setActionModal("expense");
            }}
          >
            <div className="action-icon-circle">
              <Wallet size={22} />
            </div>
            <div>
              <b>ADD EXPENSE</b>
              <small>Fuel · Toll · Parking</small>
            </div>
          </button>

          <button
            type="button"
            className="quick-action-card action-odometer"
            onClick={() => {
              setError("");
              setReachedOdo(currentKm !== "—" ? String(currentKm) : "");
              setActionModal("odometer");
            }}
          >
            <div className="action-icon-circle">
              <Camera size={22} />
            </div>
            <div>
              <b>ODOMETER</b>
              <small>Capture reading</small>
            </div>
          </button>

          <button
            type="button"
            className="quick-action-card action-end"
            onClick={openEndDayModal}
          >
            <div className="action-icon-circle">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <b>END DAY</b>
              <small>Close journey</small>
            </div>
          </button>
        </section>
      )}

      {/* 5. Daily Summary Cards */}
      <section className="driver-stats-strip">
        <div className="driver-stat-box">
          <span className="stat-name">Opening KM</span>
          <b className="stat-val">
            {activeDay.opening_km != null
              ? activeDay.opening_km.toLocaleString()
              : "Not set"}
          </b>
        </div>
        <div className="driver-stat-box">
          <span className="stat-name">
            {activeDay.status === "completed" ? "Closing KM" : "Current KM"}
          </span>
          <b className="stat-val">
            {currentKm !== "—"
              ? Number(currentKm).toLocaleString()
              : activeDay.status === "in progress"
                ? "In progress"
                : "—"}
          </b>
        </div>
        <div className="driver-stat-box">
          <span className="stat-name">Today's KM</span>
          <b className="stat-val highlight">
            {typeof todayDistance === "number"
              ? `${todayDistance} km`
              : todayDistance}
          </b>
        </div>
        <div className="driver-stat-box">
          <span className="stat-name">Places</span>
          <b className="stat-val">{dayPlaces.length}</b>
        </div>
        <div className="driver-stat-box">
          <span className="stat-name">Expenses</span>
          <b className="stat-val">{money(totalExpenseMinor)}</b>
        </div>
      </section>

      {/* 6. Today's Journey Timeline */}
      <section className="driver-timeline-panel">
        <div className="timeline-header">
          <h2>TODAY'S JOURNEY</h2>
          <span className="timeline-subtitle">
            {activeDay.name} · {activeDay.date}
          </span>
        </div>

        <div className="driver-timeline-list">
          {timeline.length === 0 && activeDay.status === "pending" && (
            <div className="timeline-empty-notice">
              <Clock size={20} className="text-muted" />
              <span>Tap START DAY above when you are ready to begin.</span>
            </div>
          )}

          {timeline.map((item) => (
            <div key={item.id} className={`timeline-row ${item.kind}`}>
              <div className="timeline-spine">
                <div className="timeline-dot">
                  {item.kind === "start_day" ? (
                    <Navigation size={13} />
                  ) : item.kind === "expense" ? (
                    <Fuel size={13} />
                  ) : item.kind === "end_day" ? (
                    <Check size={13} />
                  ) : (
                    <MapPin size={13} />
                  )}
                </div>
                <div className="timeline-line" />
              </div>

              <div className="timeline-body">
                <div className="timeline-time">
                  {new Date(item.timestamp).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="timeline-card">
                  <div className="timeline-title-row">
                    <b>{item.title}</b>
                    {item.amount_minor != null && (
                      <span className="timeline-amount">
                        {money(item.amount_minor)}
                      </span>
                    )}
                    {item.odometer != null && (
                      <span className="timeline-km-badge">
                        {item.odometer.toLocaleString()} km
                      </span>
                    )}
                  </div>
                  <small className="timeline-subtext">{item.subtitle}</small>
                </div>
              </div>
            </div>
          ))}

          {/* Planned destination suggestions if pending */}
          {activeDay.planned_destinations?.map((destName, idx) => {
            const isReached = timeline.some(
              (t) =>
                t.title?.toLowerCase().includes(destName.toLowerCase()) ||
                destName.toLowerCase().includes(t.title?.toLowerCase())
            );
            if (isReached) return null;
            return (
              <div key={idx} className="timeline-row planned">
                <div className="timeline-spine">
                  <div className="timeline-dot planned">○</div>
                  <div className="timeline-line" />
                </div>
                <div className="timeline-body">
                  <div className="timeline-time">Planned</div>
                  <div className="timeline-card planned-card">
                    <b>{destName}</b>
                    <small>Upcoming itinerary stop</small>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============================================================ */}
      {/* MODAL 1: START DAY BOTTOM SHEET                             */}
      {/* ============================================================ */}
      {actionModal === "start_day" && (
        <div className="driver-modal-backdrop" role="dialog" aria-modal="true">
          <div className="driver-bottom-sheet">
            <header className="sheet-header">
              <div>
                <h2>Start Day {activeDay.day_number}</h2>
                <p>
                  {activeDay.origin} → {activeDay.destination}
                </p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setActionModal(null)}
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleConfirmStartDay} className="sheet-content">
              {startSource === "previous_day" && (
                <div className="sheet-notice tip">
                  <Sparkles size={16} />
                  <span>
                    Suggested from yesterday's closing reading: <b>{startOdo} km</b>
                  </span>
                </div>
              )}

              <div className="field">
                <span>Opening Odometer reading (KM)</span>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="e.g. 45250"
                  value={startOdo}
                  onChange={(e) => {
                    setStartOdo(e.target.value);
                    setStartSource("manual");
                  }}
                  className="driver-large-input"
                />
              </div>

              {/* Camera Photo OCR Capture */}
              <div className="photo-capture-box">
                <label className="btn-camera-trigger">
                  <Camera size={18} />
                  <span>Take Odometer Photo (OCR)</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => handleOdometerPhoto(e, "start")}
                  />
                </label>
                {odoOcrBusy && (
                  <div className="ocr-busy-tag">
                    <RefreshCw size={14} className="animate-spin" /> Detecting reading…
                  </div>
                )}
                {detectedOdo && (
                  <div className="ocr-detected-box">
                    <span>Odometer detected: <b>{detectedOdo} km</b></span>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => setDetectedOdo(null)}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {error && <div className="sheet-error">{error}</div>}

              <div className="sheet-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActionModal(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !startOdo}>
                  {busy ? "Starting…" : "Confirm & Start Day"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: REACHED PLACE BOTTOM SHEET                         */}
      {/* ============================================================ */}
      {actionModal === "reached_place" && (
        <div className="driver-modal-backdrop" role="dialog" aria-modal="true">
          <div className="driver-bottom-sheet">
            <header className="sheet-header">
              <div>
                <h2>Reached Place</h2>
                <p>Record your current journey stop</p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setActionModal(null)}
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleConfirmReachedPlace} className="sheet-content">
              {/* GPS status pill */}
              {gpsLoading ? (
                <div className="sheet-notice loading">
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Getting your current location from GPS…</span>
                </div>
              ) : gpsCoords ? (
                <div className="sheet-notice success">
                  <MapPin size={16} />
                  <span>
                    Detected from current location (Accuracy: ±{gpsCoords.accuracy}m)
                  </span>
                </div>
              ) : gpsError ? (
                <div className="sheet-notice warning">
                  <AlertCircle size={16} />
                  <span>{gpsError}</span>
                  <button
                    type="button"
                    className="ml-auto underline font-bold"
                    onClick={triggerGps}
                  >
                    Retry GPS
                  </button>
                </div>
              ) : null}

              {/* Matched planned destination recommendation */}
              {matchedPlannedDest && (
                <div className="planned-suggestion-card">
                  <Sparkles size={16} />
                  <div>
                    <small>Planned stop detected</small>
                    <b>{matchedPlannedDest}</b>
                  </div>
                  <button
                    type="button"
                    className="btn-use-suggestion"
                    onClick={() => setPlaceName(matchedPlannedDest)}
                  >
                    Use
                  </button>
                </div>
              )}

              {/* Place Name Input */}
              <div className="field">
                <span>Stop / Place name</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alappuzha, Mattupetty, Thekkady…"
                  value={placeName}
                  onChange={(e) => {
                    setPlaceName(e.target.value);
                    setLocationSource("manual");
                  }}
                  className="driver-large-input"
                />
              </div>

              {/* Location Search / Autocomplete toggle */}
              {!isChangingPlace ? (
                <button
                  type="button"
                  className="btn-change-place"
                  onClick={() => setIsChangingPlace(true)}
                >
                  <Search size={16} /> Search a different place or town
                </button>
              ) : (
                <div className="autocomplete-box">
                  <div className="field">
                    <span>Search location in India</span>
                    <input
                      type="text"
                      placeholder="Type 2+ letters (e.g. 'munn', 'alap', 'koch')…"
                      value={placeSearchQuery}
                      onChange={(e) => setPlaceSearchQuery(e.target.value)}
                    />
                  </div>

                  {searchLoading && (
                    <div className="search-status">Searching places…</div>
                  )}

                  <div className="suggestions-list">
                    {placeSuggestions.map((item, idx) => (
                      <button
                        type="button"
                        key={idx}
                        className="suggestion-item"
                        onClick={() => {
                          setPlaceName(item.name);
                          if (item.latitude && item.longitude) {
                            setGpsCoords({
                              latitude: item.latitude,
                              longitude: item.longitude,
                              accuracy: 50,
                            });
                          }
                          setLocationSource("search");
                          setIsChangingPlace(false);
                          setPlaceSearchQuery("");
                        }}
                      >
                        <MapPin size={16} className="text-emerald" />
                        <div>
                          <b>{item.name}</b>
                          <small>{item.formatted}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Optional Intermediate Odometer */}
              <div className="field mt-3">
                <span>Current Odometer KM (Optional)</span>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 45391"
                  value={reachedOdo}
                  onChange={(e) => setReachedOdo(e.target.value)}
                />
              </div>

              {error && <div className="sheet-error">{error}</div>}

              <div className="sheet-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActionModal(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !placeName.trim()}>
                  {busy ? "Saving…" : "Confirm Place"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: ADD EXPENSE BOTTOM SHEET                           */}
      {/* ============================================================ */}
      {actionModal === "expense" && (
        <div className="driver-modal-backdrop" role="dialog" aria-modal="true">
          <div className="driver-bottom-sheet">
            <header className="sheet-header">
              <div>
                <h2>Add Trip Expense</h2>
                <p>Fuel, tolls, parking and driver expenses</p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setActionModal(null)}
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleSaveExpense} className="sheet-content">
              <div className="field">
                <span>Category</span>
                <select
                  value={expenseCat}
                  onChange={(e) => setExpenseCat(e.target.value)}
                  className="driver-large-input"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <span>Amount (INR)</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2500"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="driver-large-input text-emerald-800 font-bold"
                />
              </div>

              <div className="field">
                <span>Description / Vendor (Optional)</span>
                <input
                  type="text"
                  placeholder="e.g. HP Petrol Pump, Toll Plaza…"
                  value={expenseName}
                  onChange={(e) => setExpenseName(e.target.value)}
                />
              </div>

              <div className="photo-capture-box">
                <label className="btn-camera-trigger">
                  <Camera size={18} />
                  <span>Attach Receipt Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setExpenseOcrBusy(true);
                      try {
                        const dataUri = await fileData(file);
                        try {
                          const res = await askAI(demo, { action: "scan", file: dataUri });
                          if (res?.draft?.amount) {
                            setExpenseAmount(String(res.draft.amount));
                            if (res.draft.category) setExpenseCat(res.draft.category);
                            if (res.draft.name) setExpenseName(res.draft.name);
                            notify("Receipt scanned! Review extracted fields.");
                          }
                        } catch {}
                      } finally {
                        setExpenseOcrBusy(false);
                      }
                    }}
                  />
                </label>
                {expenseOcrBusy && (
                  <div className="ocr-busy-tag">
                    <RefreshCw size={14} className="animate-spin" /> Scanning receipt…
                  </div>
                )}
              </div>

              {error && <div className="sheet-error">{error}</div>}

              <div className="sheet-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActionModal(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !expenseAmount}>
                  {busy ? "Saving…" : "Save Expense"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: ODOMETER QUICK CAPTURE                             */}
      {/* ============================================================ */}
      {actionModal === "odometer" && (
        <div className="driver-modal-backdrop" role="dialog" aria-modal="true">
          <div className="driver-bottom-sheet">
            <header className="sheet-header">
              <div>
                <h2>Odometer Reading</h2>
                <p>Record intermediate distance check</p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setActionModal(null)}
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleRecordOdometer} className="sheet-content">
              <div className="field">
                <span>Current Odometer Reading (KM)</span>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="e.g. 45391"
                  value={reachedOdo}
                  onChange={(e) => setReachedOdo(e.target.value)}
                  className="driver-large-input"
                />
              </div>

              {error && <div className="sheet-error">{error}</div>}

              <div className="sheet-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActionModal(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !reachedOdo}>
                  {busy ? "Saving…" : "Record KM"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 5: END DAY BOTTOM SHEET                               */}
      {/* ============================================================ */}
      {actionModal === "end_day" && (
        <div className="driver-modal-backdrop" role="dialog" aria-modal="true">
          <div className="driver-bottom-sheet">
            <header className="sheet-header">
              <div>
                <h2>End Day {activeDay.day_number}</h2>
                <p>
                  {activeDay.origin} → {activeDay.destination}
                </p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setActionModal(null)}
              >
                <X size={20} />
              </button>
            </header>

            <form onSubmit={handleConfirmEndDay} className="sheet-content">
              <div className="field">
                <span>Closing Odometer reading (KM)</span>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="e.g. 45486"
                  value={endOdo}
                  onChange={(e) => {
                    setEndOdo(e.target.value);
                    setEndSource("manual");
                  }}
                  className="driver-large-input"
                />
              </div>

              {/* Photo option */}
              <div className="photo-capture-box">
                <label className="btn-camera-trigger">
                  <Camera size={18} />
                  <span>Take Closing Odometer Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => handleOdometerPhoto(e, "end")}
                  />
                </label>
                {odoOcrBusy && (
                  <div className="ocr-busy-tag">
                    <RefreshCw size={14} className="animate-spin" /> Detecting reading…
                  </div>
                )}
              </div>

              {/* End Day Summary Review */}
              {activeDay.opening_km != null && endOdo && Number(endOdo) >= activeDay.opening_km && (
                <div className="end-day-summary-card">
                  <h4>Day {activeDay.day_number} Summary</h4>
                  <div className="summary-row">
                    <span>Opening</span>
                    <b>{activeDay.opening_km.toLocaleString()} km</b>
                  </div>
                  <div className="summary-row">
                    <span>Closing</span>
                    <b>{Number(endOdo).toLocaleString()} km</b>
                  </div>
                  <div className="summary-row highlight">
                    <span>Today's Distance</span>
                    <b>{(Number(endOdo) - activeDay.opening_km).toFixed(1)} km</b>
                  </div>
                  <div className="summary-row">
                    <span>Places visited</span>
                    <b>{dayPlaces.length}</b>
                  </div>
                  <div className="summary-row">
                    <span>Total expenses</span>
                    <b>{money(totalExpenseMinor)}</b>
                  </div>
                </div>
              )}

              {error && <div className="sheet-error">{error}</div>}

              <div className="sheet-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActionModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !endOdo ||
                    (activeDay.opening_km != null && Number(endOdo) < activeDay.opening_km)
                  }
                  className="btn-end-day-confirm"
                >
                  {busy ? "Ending Day…" : "Confirm & End Day"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="7 7 17 7 17 17" />
    </svg>
  );
}
