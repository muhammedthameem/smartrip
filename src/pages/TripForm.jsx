import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  Save,
  Luggage,
  Route,
  Sparkles,
  CalendarDays,
  MapPin,
  Clock,
} from "lucide-react";
import { useApp } from "../lib/context";
import { today, distance, hours, minor, money } from "../lib/calculations";
import {
  PageHeader,
  Button,
  Field,
  Lookup,
  Loading,
  Badge,
} from "../components/ui";
import ScheduleNotice from "../components/ScheduleNotice";
import { useConfirm } from "../components/Confirm";

export const PACKAGE_PRESETS = [
  {
    id: "kerala-7",
    name: "7-Day Kerala Tour Package",
    days: 7,
    origin: "Kochi Airport (COK)",
    destination: "Thiruvananthapuram",
    night_halts: 6,
    pricing: "package/day",
    suggested_rate: 5500,
    itinerary: [
      {
        day_number: 1,
        name: "Day 1: Kochi Arrival → Munnar",
        origin: "Kochi",
        destination: "Munnar",
        planned_destinations: ["Cheeyappara Waterfalls", "Valara Falls", "Karadipara View Point"],
      },
      {
        day_number: 2,
        name: "Day 2: Munnar Sightseeing",
        origin: "Munnar",
        destination: "Munnar",
        planned_destinations: ["Eravikulam National Park", "Mattupetty Dam", "Echo Point", "Tea Museum"],
      },
      {
        day_number: 3,
        name: "Day 3: Munnar → Thekkady",
        origin: "Munnar",
        destination: "Thekkady",
        planned_destinations: ["Periyar Tiger Reserve", "Spice Plantation Tour", "Kathakali Centre"],
      },
      {
        day_number: 4,
        name: "Day 4: Thekkady → Alappuzha",
        origin: "Thekkady",
        destination: "Alappuzha",
        planned_destinations: ["Vembanad Lake", "Alappuzha Backwaters Cruise", "Marari Beach"],
      },
      {
        day_number: 5,
        name: "Day 5: Alappuzha → Kovalam",
        origin: "Alappuzha",
        destination: "Kovalam",
        planned_destinations: ["Jatayu Earth Center", "Kovalam Lighthouse Beach", "Hawa Beach"],
      },
      {
        day_number: 6,
        name: "Day 6: Kanyakumari Excursion",
        origin: "Kovalam",
        destination: "Kanyakumari",
        planned_destinations: ["Vivekananda Rock Memorial", "Thiruvalluvar Statue", "Sunset View Point"],
      },
      {
        day_number: 7,
        name: "Day 7: Trivandrum Sightseeing & Drop",
        origin: "Kovalam",
        destination: "Thiruvananthapuram Airport",
        planned_destinations: ["Padmanabhaswamy Temple", "Napier Museum", "TRV Airport Drop"],
      },
    ],
  },
  {
    id: "ooty-3",
    name: "3-Day Ooty & Coonoor Tour",
    days: 3,
    origin: "Coimbatore",
    destination: "Ooty",
    night_halts: 2,
    pricing: "package/day",
    suggested_rate: 4500,
    itinerary: [
      {
        day_number: 1,
        name: "Day 1: Coimbatore → Ooty",
        origin: "Coimbatore",
        destination: "Ooty",
        planned_destinations: ["Ooty Lake", "Botanical Gardens", "Doddabetta Peak"],
      },
      {
        day_number: 2,
        name: "Day 2: Coonoor Sightseeing",
        origin: "Ooty",
        destination: "Coonoor",
        planned_destinations: ["Sim's Park", "Dolphin's Nose", "Tea Estates"],
      },
      {
        day_number: 3,
        name: "Day 3: Pykara & Drop",
        origin: "Ooty",
        destination: "Coimbatore Airport",
        planned_destinations: ["Pykara Falls & Lake", "Pine Forest", "Return Drop"],
      },
    ],
  },
  {
    id: "golden-triangle-5",
    name: "5-Day Golden Triangle (Delhi-Agra-Jaipur)",
    days: 5,
    origin: "New Delhi",
    destination: "New Delhi",
    night_halts: 4,
    pricing: "package/day",
    suggested_rate: 6500,
    itinerary: [
      {
        day_number: 1,
        name: "Day 1: Delhi Heritage Tour",
        origin: "Delhi",
        destination: "Delhi",
        planned_destinations: ["India Gate", "Qutub Minar", "Red Fort"],
      },
      {
        day_number: 2,
        name: "Day 2: Delhi → Agra",
        origin: "Delhi",
        destination: "Agra",
        planned_destinations: ["Taj Mahal", "Agra Fort", "Mehtab Bagh"],
      },
      {
        day_number: 3,
        name: "Day 3: Agra → Fatehpur Sikri → Jaipur",
        origin: "Agra",
        destination: "Jaipur",
        planned_destinations: ["Fatehpur Sikri", "Buland Darwaza", "Abhaneri Stepwell"],
      },
      {
        day_number: 4,
        name: "Day 4: Jaipur Sightseeing",
        origin: "Jaipur",
        destination: "Jaipur",
        planned_destinations: ["Amber Fort", "Hawa Mahal", "City Palace", "Jantar Mantar"],
      },
      {
        day_number: 5,
        name: "Day 5: Jaipur → Delhi Drop",
        origin: "Jaipur",
        destination: "Delhi Airport (DEL)",
        planned_destinations: ["Jal Mahal", "Highway Express Drop"],
      },
    ],
  },
  {
    id: "coorg-3",
    name: "3-Day Mysore & Coorg Escape",
    days: 3,
    origin: "Bengaluru",
    destination: "Bengaluru",
    night_halts: 2,
    pricing: "package/day",
    suggested_rate: 4800,
    itinerary: [
      {
        day_number: 1,
        name: "Day 1: Bengaluru → Mysore",
        origin: "Bengaluru",
        destination: "Mysuru",
        planned_destinations: ["Srirangapatna", "Mysore Palace", "Chamundi Hill"],
      },
      {
        day_number: 2,
        name: "Day 2: Mysore → Coorg (Madikeri)",
        origin: "Mysuru",
        destination: "Madikeri",
        planned_destinations: ["Dubare Elephant Camp", "Golden Temple Bylakuppe", "Abbey Falls"],
      },
      {
        day_number: 3,
        name: "Day 3: Coorg → Bengaluru Drop",
        origin: "Madikeri",
        destination: "Bengaluru Drop",
        planned_destinations: ["Raja's Seat", "Coffee Plantation Tour", "Return Trip"],
      },
    ],
  },
];

function generateDefaultDays(count, origin, destination, tripDate) {
  const result = [];
  const baseDate = tripDate ? new Date(tripDate) : new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + (i - 1));
    const dateStr = d.toISOString().slice(0, 10);
    const startP = i === 1 ? origin || "Pickup Point" : `Waypoint ${i - 1}`;
    const endP = i === count ? destination || "Final Destination" : `Waypoint ${i}`;
    result.push({
      day_number: i,
      date: dateStr,
      name: `Day ${i}: ${startP} → ${endP}`,
      origin: startP,
      destination: endP,
      planned_destinations: [`Local Sightseeing · Day ${i}`],
      status: i === 1 ? "in progress" : "pending",
      opening_km: null,
      closing_km: null,
      notes: "",
    });
  }
  return result;
}

const steps = [
  "Client & Type",
  "Assignment",
  "Route & Schedule",
  "Readings",
  "Pricing",
  "Review",
];

export default function TripForm() {
  const confirm = useConfirm();
  const { id } = useParams(),
    [searchParams, setSearchParams] = useSearchParams(),
    navigate = useNavigate(),
    { api, refresh, notify } = useApp(),
    [step, setStep] = useState(0),
    typeFromQuery = searchParams.get("type"),
    initialType = typeFromQuery === "package" ? "package" : "custom";

  const [form, setForm] = useState({
    request_key: crypto.randomUUID(),
    date: today(),
    status: "draft",
    trip_type: initialType,
    package_name: initialType === "package" ? "7-Day Kerala Tour Package" : "",
    package_days_count: initialType === "package" ? 7 : 3,
    itinerary_days:
      initialType === "package"
        ? PACKAGE_PRESETS[0].itinerary.map((d) => ({ ...d, date: today() }))
        : [],
    client_id: null,
    vehicle_id: null,
    driver_id: null,
    origin: initialType === "package" ? PACKAGE_PRESETS[0].origin : "",
    destination: initialType === "package" ? PACKAGE_PRESETS[0].destination : "",
    passengers: 1,
    places: [],
    opening_km: "",
    closing_km: "",
    start_time: "",
    end_time: "",
    pricing: initialType === "package" ? "package/day" : "fixed",
    rate: initialType === "package" ? String(PACKAGE_PRESETS[0].suggested_rate) : "",
    notes: initialType === "package" ? "Multi-day tour package" : "",
    ac: "AC",
    night_halts: initialType === "package" ? 6 : 0,
  });

  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!!id),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (id) {
      api
        .get("trips", id)
        .then(async (r) => {
          let days = [];
          try {
            days = await api.getTripDays(id);
          } catch {}
          const isPkg = !!(r.package_name || r.pricing === "package/day" || days.length > 0);
          setForm({
            ...r,
            trip_type: isPkg ? "package" : "custom",
            package_name: r.package_name || (isPkg ? "Tour Package" : ""),
            package_days_count: days.length || 3,
            itinerary_days: days.length > 0 ? days : [],
            rate: String((r.rate_minor || 0) / 100),
            start_time: r.start_time
              ? new Date(
                  new Date(r.start_time).getTime() -
                    new Date(r.start_time).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : "",
            end_time: r.end_time
              ? new Date(
                  new Date(r.end_time).getTime() -
                    new Date(r.end_time).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : "",
          });
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [id, api]);

  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  function handleSwitchType(type) {
    if (type === form.trip_type) return;
    if (type === "package") {
      const preset = PACKAGE_PRESETS[0];
      setForm((f) => ({
        ...f,
        trip_type: "package",
        package_name: f.package_name || preset.name,
        package_days_count: preset.days,
        origin: f.origin || preset.origin,
        destination: f.destination || preset.destination,
        night_halts: preset.night_halts,
        pricing: f.pricing === "per km" ? "package/day" : f.pricing,
        rate: f.rate || String(preset.suggested_rate),
        itinerary_days:
          f.itinerary_days.length > 0
            ? f.itinerary_days
            : preset.itinerary.map((d) => ({ ...d, date: f.date || today() })),
      }));
      setSearchParams({ type: "package" });
    } else {
      setForm((f) => ({
        ...f,
        trip_type: "custom",
        pricing: f.pricing === "package/day" ? "fixed" : f.pricing,
      }));
      setSearchParams({ type: "custom" });
    }
    setDirty(true);
  }

  function applyPreset(preset) {
    setForm((f) => ({
      ...f,
      package_name: preset.name,
      package_days_count: preset.days,
      origin: preset.origin,
      destination: preset.destination,
      night_halts: preset.night_halts,
      pricing: preset.pricing || "package/day",
      rate: String(preset.suggested_rate || f.rate),
      itinerary_days: preset.itinerary.map((d, idx) => {
        const dObj = new Date(f.date || today());
        dObj.setDate(dObj.getDate() + idx);
        return {
          ...d,
          date: dObj.toISOString().slice(0, 10),
        };
      }),
    }));
    setDirty(true);
  }

  function handleDaysCountChange(newCount) {
    if (newCount === "" || newCount === null) {
      setForm((f) => ({ ...f, package_days_count: "" }));
      return;
    }
    const count = Math.max(1, Math.min(60, Number(newCount) || 1));
    setForm((f) => {
      let days = [...(f.itinerary_days || [])];
      if (days.length < count) {
        const toAdd = count - days.length;
        const lastDay = days[days.length - 1];
        const baseDate = lastDay?.date ? new Date(lastDay.date) : new Date(f.date || today());
        for (let i = 1; i <= toAdd; i++) {
          const dObj = new Date(baseDate);
          dObj.setDate(dObj.getDate() + i);
          days.push({
            day_number: days.length + 1,
            date: dObj.toISOString().slice(0, 10),
            name: `Day ${days.length + 1}: Sightseeing Tour`,
            origin: lastDay?.destination || f.origin || "Pickup",
            destination: f.destination || "Destination",
            planned_destinations: [`Sightseeing Tour ${days.length + 1}`],
            status: "pending",
            opening_km: null,
            closing_km: null,
          });
        }
      } else if (days.length > count) {
        days = days.slice(0, count);
      }
      return {
        ...f,
        package_days_count: count,
        night_halts: Math.max(0, count - 1),
        itinerary_days: days,
      };
    });
    setDirty(true);
  }

  function validate(final = false) {
    if (step === 0 || final) {
      if (!form.date) throw new Error("Choose a trip date.");
      if (form.trip_type === "package" && !form.package_name?.trim()) {
        throw new Error("Enter a package name or select a preset.");
      }
    }
    if (
      final &&
      form.status !== "draft" &&
      (!form.client_id ||
        !form.vehicle_id ||
        !form.driver_id ||
        !form.origin ||
        !form.destination)
    )
      throw new Error(
        "Client, vehicle, driver and route are required for an active trip.",
      );
    distance(form.opening_km, form.closing_km);
    hours(form.start_time, form.end_time);
    if (
      final &&
      form.status === "completed" &&
      (form.opening_km == null ||
        form.opening_km === "" ||
        form.closing_km == null ||
        form.closing_km === "" ||
        !form.start_time ||
        !form.end_time)
    )
      throw new Error(
        "A completed trip needs opening/closing readings and actual start/end times.",
      );

    let previous = null;
    for (const p of form.places) {
      distance(p.opening_km, p.closing_km);
      if (
        previous != null &&
        p.opening_km !== "" &&
        Number(p.opening_km) < previous
      )
        throw new Error("Place odometer ranges overlap.");
      if (p.closing_km !== "") previous = Number(p.closing_km);
    }
  }

  async function save(draft = false) {
    setError("");
    setBusy(true);
    try {
      if (!draft) validate(true);
      else {
        distance(form.opening_km, form.closing_km);
        hours(form.start_time, form.end_time);
      }

      const { rate, trip_type, package_days_count, itinerary_days, ...row } = form;
      row.status = draft ? "draft" : row.status;
      row.rate_minor = minor(rate || 0);

      if (trip_type === "package") {
        row.package_name = form.package_name || "Tour Package";
        if (!row.notes) row.notes = `${row.package_name} (${package_days_count} Days)`;
      }

      for (const k of ["opening_km", "closing_km", "passengers", "night_halts"])
        row[k] = row[k] === "" || row[k] == null ? null : Number(row[k]);
      for (const k of ["start_time", "end_time"])
        row[k] = row[k] ? new Date(row[k]).toISOString() : null;

      const saved = await api.save("trips", row);

      // Save multi-day itinerary if package trip
      if (trip_type === "package" && itinerary_days && itinerary_days.length > 0) {
        try {
          const savedDays = await api.saveTripDays(saved.id, itinerary_days);
          if (!savedDays || !savedDays.length)
            notify("Trip saved, but the day-wise itinerary could not be saved. It will be rebuilt automatically in Driver mode.");
        } catch (err) {
          console.warn("Could not save trip days:", err);
          notify("Trip saved, but the day-wise itinerary could not be saved: " + err.message);
        }
      }

      setDirty(false);
      refresh();
      notify(draft ? "Draft saved" : "Trip saved");
      navigate("/trips/" + saved.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function next(e) {
    e.preventDefault();
    try {
      validate();
      setError("");
      setStep(step + 1);
    } catch (e) {
      setError(e.message);
    }
  }

  const input = (k, label, type = "text", required = false) => (
    <Field label={label}>
      <input
        type={type}
        required={required}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        inputMode={type === "number" ? "decimal" : undefined}
        value={form[k] ?? ""}
        onInput={(e) => set(k, e.currentTarget.value)}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  );

  if (loading) return <Loading />;

  const isPackage = form.trip_type === "package";

  return (
    <>
      <PageHeader
        title={
          id
            ? isPackage
              ? "Edit Package Trip"
              : "Edit Custom Trip"
            : isPackage
            ? "Plan a Package Trip (Option 1)"
            : "Plan a Custom Trip (Option 2)"
        }
        subtitle={
          isPackage
            ? "Multi-day tour package with daily itinerary, sightseeing stops & package rates."
            : "On-demand point-to-point trip with flexible waypoints and pricing."
        }
      >
        <Button variant="secondary" disabled={busy} onClick={() => save(true)}>
          <Save size={17} /> Save draft
        </Button>
      </PageHeader>

      <div className="wizard-layout">
        <aside className="wizard-steps">
          {steps.map((s, i) => (
            <div
              key={s}
              className={step === i ? "current" : step > i ? "done" : ""}
            >
              <span>{step > i ? <Check size={17} /> : i + 1}</span>
              <b>{s}</b>
            </div>
          ))}
        </aside>

        <section className="panel wizard-panel">
          {/* Trip Type Segmented Bar */}
          <div className="trip-type-segmented-bar">
            <div className="trip-type-bar-label">CHOOSE TRIP TYPE</div>
            <div className="trip-type-pill-group">
              <button
                type="button"
                className={`trip-type-pill ${isPackage ? "active" : ""}`}
                onClick={() => handleSwitchType("package")}
              >
                <Luggage size={16} />
                <span>Option 1: Package Trip</span>
                {isPackage && <span className="pill-dot" />}
              </button>
              <button
                type="button"
                className={`trip-type-pill ${!isPackage ? "active" : ""}`}
                onClick={() => handleSwitchType("custom")}
              >
                <Route size={16} />
                <span>Option 2: Custom Trip</span>
                {!isPackage && <span className="pill-dot" />}
              </button>
            </div>
          </div>

          <div className="eyebrow">
            STEP {step + 1} OF {steps.length} · {isPackage ? "PACKAGE TRIP" : "CUSTOM TRIP"}
          </div>

          <h2>
            {
              [
                isPackage ? "Configure Tour Package & Client" : "Who’s travelling?",
                "Choose your team",
                isPackage ? "Multi-Day Tour Itinerary" : "Map out the journey",
                "Capture odometer & readings",
                isPackage ? "Package Pricing & Rates" : "Agree on a price",
                "Review & confirm journey",
              ][step]
            }
          </h2>

          <form
            onSubmit={
              step === 5
                ? (e) => {
                    e.preventDefault();
                    save();
                  }
                : next
            }
          >
            <div className="form-grid">
              {/* STEP 0: CLIENT & SCOPE */}
              {step === 0 && (
                <>
                  {input("date", "Start / Trip date", "date", true)}

                  <Field label="Client">
                    <Lookup
                      table="clients"
                      value={form.client_id}
                      onChange={(v) => set("client_id", v)}
                      allowCreate
                    />
                  </Field>

                  {isPackage && (
                    <div className="full package-preset-container">
                      <span className="package-preset-label">
                        <Sparkles size={14} style={{ display: "inline", verticalAlign: "-2px", color: "#165b49" }} /> Popular Package Templates
                      </span>
                      <div className="package-presets-chips">
                        {PACKAGE_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={`package-preset-chip ${form.package_name === preset.name ? "active" : ""}`}
                            onClick={() => applyPreset(preset)}
                          >
                            {preset.name} ({preset.days}D)
                          </button>
                        ))}
                        <button
                          type="button"
                          className={`package-preset-chip ${
                            !PACKAGE_PRESETS.some((p) => p.name === form.package_name) ? "active" : ""
                          }`}
                          onClick={() => {
                            set("package_name", "Custom Tour Package");
                          }}
                        >
                          + Custom Package
                        </button>
                      </div>
                    </div>
                  )}

                  {isPackage && (
                    <>
                      {input("package_name", "Package Name", "text", true)}
                      <Field label="Package Duration (Days)">
                        <div className="duration-stepper-container">
                          <button
                            type="button"
                            className="duration-step-btn"
                            disabled={Number(form.package_days_count) <= 1}
                            onClick={() =>
                              handleDaysCountChange(
                                Math.max(1, (Number(form.package_days_count) || 1) - 1),
                              )
                            }
                            aria-label="Decrease days"
                          >
                            −
                          </button>
                          <div className="duration-input-inner">
                            <input
                              type="number"
                              min={1}
                              max={60}
                              value={form.package_days_count ?? ""}
                              onChange={(e) => handleDaysCountChange(e.target.value)}
                              placeholder="e.g. 7"
                              required
                            />
                            <span className="duration-days-badge">Days</span>
                          </div>
                          <button
                            type="button"
                            className="duration-step-btn"
                            disabled={Number(form.package_days_count) >= 60}
                            onClick={() =>
                              handleDaysCountChange(
                                Math.min(60, (Number(form.package_days_count) || 1) + 1),
                              )
                            }
                            aria-label="Increase days"
                          >
                            +
                          </button>
                        </div>
                        <div className="duration-quick-row" aria-label="Popular days presets">
                          <span className="duration-quick-label">Presets:</span>
                          {[2, 3, 5, 7, 10, 14].map((d) => (
                            <button
                              key={d}
                              type="button"
                              className={`duration-quick-chip ${
                                Number(form.package_days_count) === d ? "active" : ""
                              }`}
                              onClick={() => handleDaysCountChange(d)}
                            >
                              {d}D
                            </button>
                          ))}
                        </div>
                      </Field>
                    </>
                  )}

                  {input("passengers", "Passengers", "number")}

                  <Field label="Trip Status">
                    <select
                      value={form.status}
                      onChange={(e) => set("status", e.target.value)}
                    >
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
                  </Field>
                </>
              )}

              {/* STEP 1: ASSIGNMENT */}
              {step === 1 && (
                <>
                  <Field label="Vehicle">
                    <Lookup
                      table="vehicles"
                      value={form.vehicle_id}
                      onChange={(v) => set("vehicle_id", v)}
                    />
                  </Field>
                  <Field label="Driver">
                    <Lookup
                      table="drivers"
                      value={form.driver_id}
                      onChange={(v) => set("driver_id", v)}
                      allowCreate
                    />
                  </Field>
                  <Field label="Air conditioning">
                    <select
                      value={form.ac}
                      onChange={(e) => set("ac", e.target.value)}
                    >
                      <option>AC</option>
                      <option>Non-AC</option>
                    </select>
                  </Field>
                  <ScheduleNotice record={form} />
                </>
              )}

              {/* STEP 2: ROUTE & ITINERARY */}
              {step === 2 && (
                <>
                  {input("origin", isPackage ? "Pickup / Tour Starting City" : "From", "text", true)}
                  {input("destination", isPackage ? "Final Drop / Destination" : "To", "text", true)}
                  {input("night_halts", "Night halts", "number")}

                  <Field label="Trip Notes">
                    <textarea
                      placeholder="Add any instructions, hotel details, or guest requirements..."
                      value={form.notes || ""}
                      onChange={(e) => set("notes", e.target.value)}
                    />
                  </Field>

                  {/* PACKAGE MULTI-DAY ITINERARY BUILDER */}
                  {isPackage ? (
                    <div className="full">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <h3>Package Itinerary ({form.itinerary_days.length} Days)</h3>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            const newDays = generateDefaultDays(
                              form.package_days_count,
                              form.origin,
                              form.destination,
                              form.date,
                            );
                            set("itinerary_days", newDays);
                          }}
                        >
                          <Sparkles size={14} /> Auto-fill from Route
                        </Button>
                      </div>

                      <p className="muted" style={{ fontSize: "12.5px", marginBottom: "12px" }}>
                        Each day will be tracked in the Driver Daily Trip workflow and admin Package Progress card.
                      </p>

                      <div className="itinerary-days-container">
                        {form.itinerary_days.map((day, idx) => (
                          <div key={day.day_number || idx} className="itinerary-day-card">
                            <div className="itinerary-day-head">
                              <span className="itinerary-day-badge">Day {idx + 1}</span>
                              <input
                                style={{ flex: 1, margin: "0 10px", fontWeight: "600", fontSize: "13.5px" }}
                                value={day.name}
                                placeholder={`Day ${idx + 1} Title`}
                                onChange={(e) => {
                                  const updated = form.itinerary_days.map((d, j) =>
                                    j === idx ? { ...d, name: e.target.value } : d,
                                  );
                                  set("itinerary_days", updated);
                                }}
                              />
                              {form.itinerary_days.length > 1 && (
                                <Button
                                  type="button"
                                  variant="icon secondary"
                                  aria-label={`Remove Day ${idx + 1}`}
                                  onClick={() => {
                                    const filtered = form.itinerary_days
                                      .filter((_, j) => j !== idx)
                                      .map((d, j) => ({ ...d, day_number: j + 1 }));
                                    set("itinerary_days", filtered);
                                    set("package_days_count", filtered.length);
                                  }}
                                >
                                  <Trash2 size={15} />
                                </Button>
                              )}
                            </div>

                            <div className="itinerary-day-grid">
                              <Field label="From">
                                <input
                                  value={day.origin || ""}
                                  placeholder="Start point"
                                  onChange={(e) => {
                                    const updated = form.itinerary_days.map((d, j) =>
                                      j === idx ? { ...d, origin: e.target.value } : d,
                                    );
                                    set("itinerary_days", updated);
                                  }}
                                />
                              </Field>

                              <Field label="To">
                                <input
                                  value={day.destination || ""}
                                  placeholder="End point"
                                  onChange={(e) => {
                                    const updated = form.itinerary_days.map((d, j) =>
                                      j === idx ? { ...d, destination: e.target.value } : d,
                                    );
                                    set("itinerary_days", updated);
                                  }}
                                />
                              </Field>
                            </div>

                            <Field label="Planned Sightseeing & Stops (comma-separated)">
                              <input
                                value={
                                  Array.isArray(day.planned_destinations)
                                    ? day.planned_destinations.join(", ")
                                    : ""
                                }
                                placeholder="e.g. Waterfalls, Tea Gardens, Lake View"
                                onChange={(e) => {
                                  const list = e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean);
                                  const updated = form.itinerary_days.map((d, j) =>
                                    j === idx ? { ...d, planned_destinations: list } : d,
                                  );
                                  set("itinerary_days", updated);
                                }}
                              />
                            </Field>
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            const newCount = form.itinerary_days.length + 1;
                            handleDaysCountChange(newCount);
                          }}
                        >
                          <Plus size={16} /> Add Day {form.itinerary_days.length + 1}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* CUSTOM ROUTE WAYPOINTS */
                    <div className="full">
                      <h3>Places covered</h3>
                      {form.places.map((p, i) => (
                        <div className="place-row" key={i}>
                          {[
                            ["date", "Date", "date"],
                            ["name", "Place", "text"],
                            ["opening_km", "Opening km", "number"],
                            ["closing_km", "Closing km", "number"],
                          ].map(([k, label, type]) => (
                            <Field key={k} label={label}>
                              <input
                                aria-label={label + " " + (i + 1)}
                                type={type}
                                min={type === "number" ? 0 : undefined}
                                value={p[k] ?? ""}
                                onChange={(e) =>
                                  set(
                                    "places",
                                    form.places.map((r, j) =>
                                      j === i ? { ...r, [k]: e.target.value } : r,
                                    ),
                                  )
                                }
                              />
                            </Field>
                          ))}
                          <Button
                            type="button"
                            variant="icon secondary"
                            aria-label={"Remove place " + (i + 1)}
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Remove this stop?",
                                message:
                                  "Remove place " + (i + 1) + " from the itinerary?",
                                confirmLabel: "Remove",
                                tone: "warning",
                              });
                              if (ok)
                                set(
                                  "places",
                                  form.places.filter((_, j) => j !== i),
                                );
                            }}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          set("places", [
                            ...form.places,
                            {
                              date: form.date,
                              name: "",
                              opening_km: "",
                              closing_km: "",
                            },
                          ])
                        }
                      >
                        <Plus size={16} /> Add place
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* STEP 3: READINGS */}
              {step === 3 && (
                <>
                  {input("opening_km", "Opening odometer (km)", "number")}
                  {input("closing_km", "Closing odometer (km)", "number")}
                  {input("start_time", "Actual start date & time", "datetime-local")}
                  {input("end_time", "Actual end date & time", "datetime-local")}
                  <p className="notice full">
                    {isPackage
                      ? "For multi-day packages, the driver can also record opening/closing odometers and GPS stops daily from Driver Mode."
                      : "Use the full date for trips ending after midnight. GPS is not connected and never changes these readings."}
                  </p>
                </>
              )}

              {/* STEP 4: PRICING */}
              {step === 4 && (
                <>
                  <Field label="Pricing method">
                    <select
                      value={form.pricing}
                      onChange={(e) => set("pricing", e.target.value)}
                    >
                      {isPackage
                        ? ["package/day", "fixed", "custom"].map((s) => (
                            <option key={s}>{s}</option>
                          ))
                        : ["fixed", "per km", "per hour", "package/day", "custom"].map(
                            (s) => <option key={s}>{s}</option>,
                          )}
                    </select>
                  </Field>

                  {input(
                    "rate",
                    form.pricing === "package/day"
                      ? "Rate per Day (INR)"
                      : "Rate (INR)",
                    "number",
                  )}

                  {isPackage && form.pricing === "package/day" && form.rate && (
                    <div className="full pricing-calc-box">
                      <span>
                        Estimated Total: ₹{Number(form.rate).toLocaleString("en-IN")}/day ×{" "}
                        {form.package_days_count} days =
                      </span>
                      <strong style={{ fontSize: "16px" }}>
                        ₹{(Number(form.rate) * Number(form.package_days_count)).toLocaleString("en-IN")}
                      </strong>
                    </div>
                  )}

                  <p className="notice full">
                    After saving, add expenses and generate an itemised invoice from the trip.
                  </p>
                </>
              )}

              {/* STEP 5: REVIEW */}
              {step === 5 && (
                <div className="full review">
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                    <Badge>{form.status}</Badge>
                    <span
                      className="badge"
                      style={
                        isPackage
                          ? { background: "#ecfdf5", color: "#065f46", borderColor: "#a7f3d0" }
                          : { background: "#f1f5f9", color: "#334155", borderColor: "#cbd5e1" }
                      }
                    >
                      {isPackage ? "Option 1: Package Trip" : "Option 2: Custom Trip"}
                    </span>
                  </div>

                  {isPackage && form.package_name && (
                    <h3 style={{ fontSize: "17px", color: "#165b49", margin: "4px 0 10px" }}>
                      {form.package_name} ({form.package_days_count} Days)
                    </h3>
                  )}

                  <h2>
                    {form.origin || "Origin"} → {form.destination || "Destination"}
                  </h2>

                  <p>
                    {form.date} · {form.passengers} passengers · {form.ac}
                  </p>

                  <p>
                    Pricing: {form.pricing} · ₹{form.rate || "0"}{" "}
                    {isPackage && form.pricing === "package/day" && form.rate && (
                      <span className="muted">
                        (Est. total: ₹
                        {(Number(form.rate) * Number(form.package_days_count)).toLocaleString(
                          "en-IN",
                        )}
                        )
                      </span>
                    )}
                  </p>

                  {isPackage ? (
                    <p>{form.itinerary_days.length} itinerary days planned</p>
                  ) : (
                    <p>{form.places.length} places recorded</p>
                  )}

                  <p className="muted">
                    Review earlier steps before saving. You can also view and advance this trip in Driver Mode.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}

            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={!step || busy}
                onClick={() => {
                  setStep(step - 1);
                  setError("");
                }}
              >
                <ArrowLeft size={16} /> Back
              </Button>

              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : step === 5 ? "Save trip" : "Continue"}
                {step === 5 ? <Check size={17} /> : <ArrowRight size={17} />}
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
