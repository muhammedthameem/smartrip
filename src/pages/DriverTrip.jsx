import React, { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  Lock,
  LocateFixed,
  Pencil,
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
import RidePicker from "../components/RidePicker";
import { useRideTracker, startTrack, clearTrack } from "../lib/useRideTracker";
import EditRideSheet from "../components/EditRideSheet";

const rideMissingFields = (t) => {
  if (!t) return [];
  const m = [];
  if (!t.client_id && !t.client?.id) m.push("client");
  if (!t.vehicle_id && !t.vehicle?.id) m.push("vehicle");
  if (!t.is_booking && !t.driver_id && !t.driver?.id) m.push("driver");
  if (!String(t.origin || "").trim()) m.push("pickup");
  if (!String(t.destination || "").trim()) m.push("destination");
  return m;
};

// Planned stops may be stored as strings (demo) or objects like { name, place, label } (Supabase)
const placeLabel = (p) => {
  if (p == null) return "";
  if (typeof p === "string") return p.trim();
  if (typeof p === "object")
    return String(p.name || p.place || p.label || p.title || p.destination || p.formatted || "").trim();
  return String(p).trim();
};

const normalizeDay = (d) => {
  let planned = d?.planned_destinations;
  if (typeof planned === "string") {
    try {
      planned = JSON.parse(planned);
    } catch {
      planned = planned.split(",");
    }
  }
  return {
    ...d,
    // A day saved as "in progress" but never actually started (no started_at) is really pending
    status: d?.status === "in progress" && !d?.started_at ? "pending" : d?.status,
    start_place: placeLabel(d?.start_place || d?.origin),
    end_place: placeLabel(d?.end_place || d?.destination),
    planned_destinations: (Array.isArray(planned) ? planned : []).map(placeLabel).filter(Boolean),
  };
};

export default function DriverTrip() {
  const { api, demo, profile, notify, version, refresh } = useApp();

  // State
  const [searchParams, setSearchParams] = useSearchParams();
  const tripIdParam = searchParams.get("tripId");
  const [trip, setTrip] = useState(null);
  const [driverItems, setDriverItems] = useState({ trips: [], bookings: [], all: [] });
  const [days, setDays] = useState([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState(null); // 'start_ride' | 'complete_ride' | 'select_ride' | 'start_day' | 'reached_place' | 'expense' | 'odometer' | 'end_day' | 'days_overview'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Start Ride & Complete Ride form state
  const [rideStartOdo, setRideStartOdo] = useState("");
  const [rideCompleteOdo, setRideCompleteOdo] = useState("");
  const [rideCompleteNotes, setRideCompleteNotes] = useState("");


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

  // Ride-level live GPS tracking (covers the whole package while the ride is active)
  const [startGps, setStartGps] = useState({ status: "idle", coords: null, place: "", error: "" });
  const [skipStartGps, setSkipStartGps] = useState(false);
  const rideLive = !!trip && !trip.is_booking && trip.status === "in progress";
  const tracker = useRideTracker({
    tripId: rideLive ? trip.id : null,
    active: rideLive,
    onSync: (km) => api.updateTripGpsKm?.(trip.id, km),
  });

  const requestStartGps = async () => {
    setStartGps({ status: "locating", coords: null, place: "", error: "" });
    try {
      const pos = await getCurrentPosition({ timeout: 15000, maximumAge: 0 });
      setStartGps({ status: "ok", coords: pos, place: "", error: "" });
      reverseGeocode(pos.latitude, pos.longitude)
        .then((geo) =>
          setStartGps((s) =>
            s.status === "ok" ? { ...s, place: geo?.name || geo?.formatted || "" } : s
          )
        )
        .catch(() => {});
    } catch (err) {
      setStartGps({
        status: err.code === 1 ? "denied" : "error",
        coords: null,
        place: "",
        error: err.message,
      });
    }
  };

  // Central item loader: loads both trips & bookings, and retrieves assigned item
  const loadAssignedItem = async (targetId) => {
    setLoading(true);
    setError("");
    try {
      const driverId = profile?.role === "driver" ? profile.id : null;
      // Load both trips and bookings
      const items = await api.getDriverItems(driverId);
      setDriverItems(items);

      const assigned = await api.getAssignedDriverTrip(driverId, targetId);
      if (!assigned) {
        setTrip(null);
        setDays([]);
        setLoading(false);
        return;
      }

      setTrip(assigned);

      // Ensure dayList has at least 1 day
      let dayList = assigned.days && assigned.days.length ? assigned.days : [];
      if (!dayList.length && !assigned.is_booking) {
        dayList = await api.ensureTripDays(assigned.id);
      }
      if (!dayList || !dayList.length) {
        dayList = [
          {
            id: `day-${assigned.id}-1`,
            trip_id: assigned.id,
            day_number: 1,
            date: assigned.date || today(),
            start_place: assigned.origin || "Pickup Point",
            end_place: assigned.destination || "Destination",
            planned_destinations: assigned.destination ? [assigned.destination] : [],
            status: assigned.status === "in progress" ? "in progress" : "pending",
            opening_km: assigned.opening_km || assigned.vehicle?.odometer || null,
            closing_km: assigned.closing_km || null,
          },
        ];
      }
      dayList = dayList.map(normalizeDay);
      setDays(dayList);

      let currentIdx = dayList.findIndex((d) => d.status === "in progress");
      if (currentIdx === -1) {
        currentIdx = dayList.findIndex((d) => d.status === "pending");
      }
      if (currentIdx === -1) currentIdx = 0;
      setSelectedDayIndex(currentIdx);

      // Load timeline if day exists and not a plain booking
      if (dayList[currentIdx] && !assigned.is_booking) {
        const t = await api.getTripDayTimeline(dayList[currentIdx].id).catch(() => []);
        setTimeline(t || []);
      } else {
        setTimeline([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load assigned trip/booking on mount or when tripIdParam changes
  useEffect(() => {
    loadAssignedItem(tripIdParam);
  }, [api, profile, version, tripIdParam]);

  // Reload timeline when active day changes
  useEffect(() => {
    if (!activeDay || trip?.is_booking) return;
    let active = true;
    api
      .getTripDayTimeline(activeDay.id)
      .then((t) => active && setTimeline(t))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, activeDay?.id, version]);

  // Item selector handler
  const handleSelectItem = (item) => {
    setSearchParams({ tripId: item.id });
    setActionModal(null);
    loadAssignedItem(item.id);
  };

  // Start Ride handlers
  const openStartRideModal = () => {
    setError("");
    const missing = rideMissingFields(trip);
    if (missing.length) {
      notify(`Add ${missing.join(", ")} before starting this ride.`);
      setActionModal("edit_ride");
      return;
    }
    const defaultOdo =
      trip.opening_km != null
        ? trip.opening_km
        : trip.vehicle?.odometer != null
          ? trip.vehicle.odometer
          : "";
    setRideStartOdo(defaultOdo ? String(defaultOdo) : "");
    setStartSource("manual");
    setSkipStartGps(false);
    requestStartGps();
    setActionModal("start_ride");
  };

  const handleConfirmStartRide = async (e) => {
    e.preventDefault();
    const km = Number(rideStartOdo);
    if (!km || km < 0) {
      setError("Please enter a valid opening odometer reading.");
      return;
    }
    if (!startGps.coords && !skipStartGps) {
      setError("Turn on GPS to start live tracking, or tap “Start without GPS”.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let started;
      if (trip.is_booking) {
        started = await api.startBookingRide(trip.id, {
          opening_km: km,
          opening_source: startSource,
          started_at: new Date().toISOString(),
        });
      } else {
        started = await api.startTripRide(trip.id, {
          opening_km: km,
          opening_source: startSource,
          started_at: new Date().toISOString(),
        });
      }
      const rideId = started?.id || trip.id;
      const c = startGps.coords;
      startTrack(
        rideId,
        c ? { lat: c.latitude, lng: c.longitude, acc: c.accuracy, t: Date.now() } : null
      );

      // Log the start location on Day 1's journey (best effort)
      const day1 = days[0];
      const realDay =
        day1?.id && !/^(virtual-|day-|b-day-)/.test(String(day1.id)) && !trip.is_booking;
      if (c && realDay) {
        await api
          .recordReachedPlace({
            trip_day_id: day1.id,
            trip_id: rideId,
            name: startGps.place ? `Ride started · ${startGps.place}` : "Ride started",
            latitude: c.latitude,
            longitude: c.longitude,
            accuracy: c.accuracy,
            location_source: startGps.place ? "gps_reverse_geocoded" : "gps",
            odometer: km,
            notes: "Ride start location",
          })
          .catch(() => {});
      }

      notify(
        c
          ? "Ride ACTIVE · live GPS tracking is on. Now tap START DAY."
          : "Ride ACTIVE (no GPS). Now tap START DAY."
      );
      setActionModal(null);
      setSearchParams({ tripId: rideId });
      await loadAssignedItem(rideId);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Complete Ride handlers
  const openCompleteRideModal = () => {
    setError("");
    const minKm =
      trip.opening_km != null
        ? trip.opening_km
        : activeDay?.opening_km != null
          ? activeDay.opening_km
          : "";
    setRideCompleteOdo(minKm ? String(minKm) : "");
    setRideCompleteNotes("");
    setEndSource("manual");
    setActionModal("complete_ride");
  };

  const handleConfirmCompleteRide = async (e) => {
    e.preventDefault();
    const km = Number(rideCompleteOdo);
    if (!km || km < 0) {
      setError("Please enter a valid closing odometer reading.");
      return;
    }
    const minKm = trip.opening_km != null ? trip.opening_km : activeDay?.opening_km || 0;
    if (km < minKm) {
      setError(`Closing reading (${km} km) cannot be less than opening reading (${minKm} km).`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.completeTripRide(trip.id, {
        closing_km: km,
        closing_source: endSource,
        ended_at: new Date().toISOString(),
        notes: rideCompleteNotes,
      });
      const dist = km - minKm;
      if (tracker.distanceKm > 0)
        api.updateTripGpsKm?.(trip.id, tracker.distanceKm).catch(() => {});
      clearTrack(trip.id);
      notify(`Ride COMPLETED! Total distance: ${dist} km logged.`);
      setActionModal(null);
      await loadAssignedItem(trip.id);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Open Start Day Modal
  const openStartDayModal = () => {
    if (!activeDay) return;
    if (!rideLive) {
      notify("Start the ride first — tap START RIDE NOW.");
      return;
    }
    setError("");
    // Find previous day's closing reading
    const prevDay = days[selectedDayIndex - 1];
    if (prevDay && prevDay.closing_km != null) {
      setStartOdo(String(prevDay.closing_km));
      setStartSource("previous_day");
    } else if (selectedDayIndex === 0 && trip?.opening_km != null) {
      setStartOdo(String(trip.opening_km));
      setStartSource("manual");
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

  // Compute filtered items for selector
  const allItems = driverItems.all || [];

  if (!trip) {
    return (
      <div className="driver-shell">
        <header className="driver-topbar">
          <div className="driver-brand">
            <span className="driver-brand-icon">
              <Navigation size={22} fill="currentColor" />
            </span>
            <div>
              <h1>SmartTrip Driver</h1>
              <p>Fleet Rides & Bookings</p>
            </div>
          </div>
          <div className="driver-topbar-actions">
            {demo && <span className="demo-chip">DEMO</span>}
            <Link to="/" className="btn-workspace-link">
              Workspace
            </Link>
          </div>
        </header>

        <div className="driver-empty-card ride-picker-card">
          <div className="ride-picker-head">
            <div>
              <h2>Choose your ride</h2>
              <p>Most urgent rides are shown first</p>
            </div>
            <CarFront size={26} />
          </div>

          <RidePicker variant="page" items={allItems} onSelect={handleSelectItem} />
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

  const isRideActive = !trip.is_booking && trip.status === "in progress";
  const isRideCompleted = !trip.is_booking && trip.status === "completed";
  const isRideNotStarted = trip.is_booking || (!isRideActive && !isRideCompleted);

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
            <p>
              {isRideActive ? "Active Ride Cockpit" : trip.is_booking ? "Booking Details" : "Today's Assigned Ride"}
            </p>
          </div>
        </div>

        <div className="driver-topbar-actions">
          {/* Switch Ride button */}
          <button
            type="button"
            className="driver-switcher-btn"
            onClick={() => setActionModal("select_ride")}
            title="View and switch between all rides and bookings"
          >
            <Layers size={13} />
            <span>Rides & Bookings ({allItems.length})</span>
          </button>

          {demo && <span className="demo-chip">DEMO</span>}
          <Link to="/" className="btn-workspace-link" title="Open full desk workspace">
            Desk <ArrowUpRightIcon />
          </Link>
        </div>
      </header>


      {/* 2. Active / Assigned Trip Card */}
      <section className={`driver-trip-card ${isRideActive ? "active-ride-glow" : ""}`}>
        <div className="driver-card-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {isRideActive && <span className="pulsing-dot" />}
              <span
                className="driver-assigned-label"
                style={{
                  color: isRideActive ? "#059669" : trip.is_booking ? "#2563eb" : "#176851",
                }}
              >
                {isRideActive
                  ? "ACTIVE RIDE IN PROGRESS"
                  : trip.is_booking
                    ? "ADVANCE BOOKING"
                    : isRideCompleted
                      ? "RIDE COMPLETED"
                      : "PLANNED RIDE"}
              </span>
            </div>
            <h2 className="driver-package-title">
              {trip.package_name || trip.name || trip.notes || "Kerala Tour Package"}
            </h2>
            <div className="driver-customer-name">
              Customer: <b>{trip.client?.name || "Private Guest"}</b>
              {trip.client?.phone ? ` · 📞 ${trip.client.phone}` : ""}
            </div>
          </div>
          <div className="driver-card-head-actions">
            <Badge>
              {isRideCompleted
                ? "COMPLETED"
                : isRideActive
                  ? "IN PROGRESS"
                  : trip.is_booking
                    ? "BOOKING"
                    : "UPCOMING"}
            </Badge>
            <button
              type="button"
              id="btn-edit-ride"
              className="edit-ride-btn"
              onClick={() => {
                setError("");
                setActionModal("edit_ride");
              }}
              aria-label="Edit ride"
            >
              <Pencil size={14} />
              <span>Edit</span>
            </button>
          </div>
        </div>

        {/* Route Hero */}
        <div className="driver-day-hero">
          <div className="driver-day-counter">
            {trip.is_booking
              ? `PICKUP DATE: ${trip.date}${trip.pickup_time ? ` AT ${trip.pickup_time}` : ""}`
              : `DAY ${activeDay.day_number} OF ${days.length}`}
          </div>
          <div className="driver-day-route">
            <span>{trip.origin || activeDay.start_place || "Origin"}</span>
            <ArrowRight size={18} className="route-arrow" />
            <span>{trip.destination || activeDay.end_place || "Destination"}</span>
          </div>
          <div className="driver-vehicle-badge">
            <CarFront size={16} />
            <span>
              Vehicle: <b>{trip.vehicle?.name || "Assigned Vehicle"}</b>
              {trip.vehicle?.model ? ` (${trip.vehicle.model})` : ""}
            </span>
          </div>
        </div>

        {/* Live GPS tracking status (whole package) */}
        {isRideActive && (
          <div className={`ride-track-chip status-${tracker.status}`} id="ride-track-status">
            <span className="ride-track-dot" />
            <LocateFixed size={15} />
            <div className="ride-track-text">
              <b>
                {tracker.status === "live"
                  ? "Live GPS tracking"
                  : tracker.status === "weak"
                    ? "Weak GPS signal"
                    : tracker.status === "starting"
                      ? "Finding GPS…"
                      : tracker.status === "denied"
                        ? "Location blocked"
                        : tracker.status === "unsupported"
                          ? "GPS not available"
                          : "GPS paused"}
              </b>
              <small>
                {tracker.status === "denied" || tracker.status === "error"
                  ? tracker.error
                  : `${tracker.distanceKm.toFixed(1)} km tracked${
                      tracker.last?.acc ? ` · ±${tracker.last.acc} m` : ""
                    } · keep this screen open`}
              </small>
            </div>
          </div>
        )}

        {/* Start Ride CTA Banner (If ride not yet started) */}
        {isRideNotStarted && (
          <div className="start-ride-banner">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={18} style={{ color: "#059669" }} />
              <b style={{ color: "#065f46", fontSize: "0.95rem" }}>
                {trip.is_booking ? "Advance Booking Ready to Start" : "Package Ready for Departure"}
              </b>
            </div>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#374151" }}>
              Start the ride to activate the whole package. GPS will be switched on to track the
              journey, then you can START DAY 1.
            </p>
            {rideMissingFields(trip).length > 0 && (
              <button
                type="button"
                id="btn-fix-ride-details"
                className="ride-missing-hint"
                onClick={() => setActionModal("edit_ride")}
              >
                <AlertCircle size={14} />
                <span>
                  Missing <b>{rideMissingFields(trip).join(", ")}</b> — tap to fix
                </span>
                <Pencil size={13} />
              </button>
            )}
            <button
              type="button"
              className="btn-start-ride-action"
              onClick={openStartRideModal}
            >
              <Navigation size={18} />
              <span>{trip.is_booking ? "START RIDE (ACTIVATE BOOKING)" : "START RIDE NOW"}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* Completed Ride Summary Card */}
        {isRideCompleted && (
          <div
            style={{
              background: "#f8fafc",
              border: "1.5px solid #cbd5e1",
              borderRadius: "14px",
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle2 size={20} style={{ color: "#059669" }} />
              <b style={{ fontSize: "0.95rem", color: "#0f172a" }}>Ride Completed & Logged</b>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                marginTop: "10px",
                fontSize: "0.85rem",
                color: "#334155",
              }}
            >
              <div>
                Opening: <b>{trip.opening_km != null ? `${trip.opening_km.toLocaleString()} km` : "—"}</b>
              </div>
              <div>
                Closing: <b>{trip.closing_km != null ? `${trip.closing_km.toLocaleString()} km` : "—"}</b>
              </div>
              <div>
                Total Distance:{" "}
                <b style={{ color: "#059669" }}>
                  {trip.opening_km != null && trip.closing_km != null
                    ? `${trip.closing_km - trip.opening_km} km`
                    : "—"}
                </b>
              </div>
              <div>
                Expenses: <b>{money(totalExpenseMinor)}</b>
              </div>
            </div>
            <button
              type="button"
              className="btn secondary"
              style={{ marginTop: "12px", width: "100%", justifyContent: "center" }}
              onClick={() => setActionModal("select_ride")}
            >
              Switch to Next Ride or Booking
            </button>
          </div>
        )}

        {/* Visual Day Progress Indicator (Only for multi-day trips) */}
        {!trip.is_booking && days.length > 1 && (
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
                  title={`Day ${d.day_number}: ${d.name || ""}`}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 3. Context-Aware Primary Action Button */}
      {!trip.is_booking && (
        <section className="driver-primary-action-container">
          {isRideNotStarted ? (
            <button
              type="button"
              id="btn-start-day-locked"
              className="driver-primary-btn start-btn is-locked"
              disabled
              aria-disabled="true"
              title="Start the ride first"
            >
              <div className="btn-content">
                <span className="btn-title">START DAY {activeDay.day_number}</span>
                <span className="btn-subtitle">Locked · tap START RIDE NOW above first</span>
              </div>
              <Lock size={20} className="btn-icon" />
            </button>
          ) : activeDay.status === "pending" ? (
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
                  {activeDay.origin || "Journey"} → {activeDay.destination || "Destination"} · Logged {todayDistance} km
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
      )}

      {/* 4. Quick Actions (When ride active and Day In Progress) */}
      {isRideActive && activeDay.status === "in progress" && (
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

          <button
            type="button"
            className="quick-action-card action-complete-ride"
            onClick={openCompleteRideModal}
            style={{
              background: "#0f172a",
              color: "#ffffff",
              border: "1px solid #334155",
            }}
          >
            <div
              className="action-icon-circle"
              style={{ background: "#1e293b", color: "#10b981" }}
            >
              <CheckCircle2 size={22} />
            </div>
            <div>
              <b style={{ color: "#ffffff" }}>COMPLETE RIDE</b>
              <small style={{ color: "#94a3b8" }}>Finish journey</small>
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
          {!trip.is_booking && activeDay && !/^(virtual-|day-|b-day-)/.test(String(activeDay.id)) && (
            <button
              type="button"
              id="btn-edit-day-plan"
              className="edit-inline-link"
              onClick={() => setActionModal("edit_day")}
            >
              <Pencil size={12} /> Edit plan
            </button>
          )}
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

      {/* 7. Ride Level Completion Button when Active */}
      {isRideActive && (
        <section style={{ marginTop: "0.85rem" }}>
          <button
            type="button"
            className="btn-complete-ride-action"
            style={{ width: "100%" }}
            onClick={openCompleteRideModal}
          >
            <CheckCircle2 size={18} />
            <span>END RIDE / COMPLETE RIDE</span>
          </button>
        </section>
      )}

      {/* ============================================================ */}
      {/* MODAL: EDIT RIDE / DAY PLAN (in place)                       */}
      {/* ============================================================ */}
      {(actionModal === "edit_ride" || actionModal === "edit_day") && (
        <EditRideSheet
          trip={trip}
          day={activeDay}
          api={api}
          canAssign={profile?.role !== "driver"}
          initialTab={actionModal === "edit_day" ? "day" : "ride"}
          onClose={() => setActionModal(null)}
          onSaved={async (msg) => {
            notify(msg);
            setActionModal(null);
            await loadAssignedItem(trip.id);
            refresh();
          }}
        />
      )}

      {/* ============================================================ */}
      {/* MODAL: START RIDE BOTTOM SHEET                               */}
      {/* ============================================================ */}
      {actionModal === "start_ride" && (
        <div className="driver-modal-backdrop" role="dialog" aria-modal="true">
          <div className="driver-bottom-sheet">
            <header className="sheet-header">
              <div>
                <h2>{trip.is_booking ? "Start Booking Ride" : "Start Trip Ride"}</h2>
                <p>
                  {trip.name} · {trip.origin} → {trip.destination}
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

            <form onSubmit={handleConfirmStartRide} className="sheet-content">
              {/* Step 1: GPS */}
              <div className={`ride-gps-step status-${startGps.status}`} id="start-ride-gps">
                <div className="ride-gps-icon">
                  {startGps.status === "locating" ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : startGps.status === "ok" ? (
                    <CheckCircle2 size={18} />
                  ) : startGps.status === "denied" || startGps.status === "error" ? (
                    <AlertCircle size={18} />
                  ) : (
                    <LocateFixed size={18} />
                  )}
                </div>
                <div className="ride-gps-body">
                  <b>
                    {startGps.status === "locating"
                      ? "Turning on GPS…"
                      : startGps.status === "ok"
                        ? "GPS is ON · tracking will start"
                        : startGps.status === "denied"
                          ? "Location permission needed"
                          : startGps.status === "error"
                            ? "Could not get your location"
                            : "Turn on GPS"}
                  </b>
                  <small>
                    {startGps.status === "ok"
                      ? `${startGps.place || "Current location found"} · ±${startGps.coords.accuracy} m`
                      : startGps.status === "denied"
                        ? "Allow location for this site (tap the 🔒 icon in the address bar), turn on device location, then retry."
                        : startGps.status === "error"
                          ? startGps.error
                          : "Allow location when your phone asks."}
                  </small>
                  {(startGps.status === "denied" || startGps.status === "error" || startGps.status === "idle") && (
                    <div className="ride-gps-actions">
                      <button type="button" className="ride-gps-retry" onClick={requestStartGps}>
                        <LocateFixed size={14} /> {startGps.status === "idle" ? "Turn on GPS" : "Retry GPS"}
                      </button>
                      <label className="ride-gps-skip">
                        <input
                          type="checkbox"
                          checked={skipStartGps}
                          onChange={(e) => setSkipStartGps(e.target.checked)}
                        />
                        Start without GPS
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="field">
                <span>Opening Odometer Reading (KM)</span>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="e.g. 26357"
                  value={rideStartOdo}
                  onChange={(e) => {
                    setRideStartOdo(e.target.value);
                    setStartSource("manual");
                  }}
                  className="driver-large-input"
                />
              </div>

              {/* Photo capture for OCR */}
              <div className="photo-capture-box">
                <label className="btn-camera-trigger">
                  <Camera size={18} />
                  <span>Take Odometer Photo (OCR Scan)</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      handleOdometerPhoto(e, "start");
                    }}
                  />
                </label>
                {odoOcrBusy && (
                  <div className="ocr-busy-tag">
                    <RefreshCw size={14} className="animate-spin" /> Scanning reading…
                  </div>
                )}
                {detectedOdo && (
                  <div className="ocr-detected-box">
                    <span>
                      Odometer detected: <b>{detectedOdo} km</b>
                    </span>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        setRideStartOdo(String(detectedOdo));
                        setDetectedOdo(null);
                      }}
                    >
                      Use this reading
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
                <Button
                  type="submit"
                  disabled={busy || !rideStartOdo || (!startGps.coords && !skipStartGps)}
                  className="btn-start-ride-action"
                >
                  {busy
                    ? "Starting…"
                    : startGps.status === "locating" && !skipStartGps
                      ? "Waiting for GPS…"
                      : "Start Ride & Track"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: COMPLETE RIDE BOTTOM SHEET                            */}
      {/* ============================================================ */}
      {actionModal === "complete_ride" && (
        <div className="driver-modal-backdrop" role="dialog" aria-modal="true">
          <div className="driver-bottom-sheet">
            <header className="sheet-header">
              <div>
                <h2>Complete & End Ride</h2>
                <p>
                  {trip.name} · {trip.origin} → {trip.destination}
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

            <form onSubmit={handleConfirmCompleteRide} className="sheet-content">
              <div className="field">
                <span>Closing Odometer Reading (KM)</span>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="e.g. 26520"
                  value={rideCompleteOdo}
                  onChange={(e) => {
                    setRideCompleteOdo(e.target.value);
                    setEndSource("manual");
                  }}
                  className="driver-large-input"
                />
              </div>

              {/* Ride Summary Review Card */}
              {trip.opening_km != null && rideCompleteOdo && Number(rideCompleteOdo) >= trip.opening_km && (
                <div className="end-day-summary-card">
                  <h4>Ride Completion Summary</h4>
                  <div className="summary-row">
                    <span>Opening Odometer</span>
                    <b>{trip.opening_km.toLocaleString()} km</b>
                  </div>
                  <div className="summary-row">
                    <span>Closing Odometer</span>
                    <b>{Number(rideCompleteOdo).toLocaleString()} km</b>
                  </div>
                  <div className="summary-row highlight">
                    <span>Total Distance Travelled</span>
                    <b>{(Number(rideCompleteOdo) - trip.opening_km).toFixed(1)} km</b>
                  </div>
                  <div className="summary-row">
                    <span>Stops Recorded</span>
                    <b>{dayPlaces.length}</b>
                  </div>
                  <div className="summary-row">
                    <span>Trip Expenses</span>
                    <b>{money(totalExpenseMinor)}</b>
                  </div>
                </div>
              )}

              <div className="field">
                <span>Closing Notes (Optional)</span>
                <input
                  type="text"
                  placeholder="e.g. Safe trip, dropped at hotel, client satisfied"
                  value={rideCompleteNotes}
                  onChange={(e) => setRideCompleteNotes(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                  }}
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
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !rideCompleteOdo ||
                    (trip.opening_km != null && Number(rideCompleteOdo) < trip.opening_km)
                  }
                  className="btn-complete-ride-action"
                >
                  {busy ? "Completing…" : "Confirm & Complete Ride"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: SELECT RIDE OR BOOKING DRAWER                         */}
      {/* ============================================================ */}
      {actionModal === "select_ride" && (
        <div className="driver-modal-backdrop" role="dialog" aria-modal="true">
          <div className="driver-bottom-sheet ride-picker-sheet">
            <header className="sheet-header">
              <div>
                <h2>Switch ride</h2>
                <p>{allItems.length} rides & bookings · most urgent first</p>
              </div>
              <button
                type="button"
                className="sheet-close"
                onClick={() => setActionModal(null)}
              >
                <X size={20} />
              </button>
            </header>

            <div className="sheet-content ride-sheet-body">
              <RidePicker
                variant="sheet"
                items={allItems}
                currentId={trip?.id}
                onSelect={handleSelectItem}
              />
            </div>
          </div>
        </div>
      )}

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
