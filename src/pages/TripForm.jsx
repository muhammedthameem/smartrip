import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Save } from "lucide-react";
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
const steps = [
  "Client",
  "Assignment",
  "Route",
  "Readings",
  "Pricing",
  "Review",
];
export default function TripForm() {
  const { id } = useParams(),
    navigate = useNavigate(),
    { api, refresh, notify } = useApp(),
    [step, setStep] = useState(0),
    [form, setForm] = useState({
      request_key: crypto.randomUUID(),
      date: today(),
      status: "draft",
      client_id: null,
      vehicle_id: null,
      driver_id: null,
      origin: "",
      destination: "",
      passengers: 1,
      places: [],
      opening_km: "",
      closing_km: "",
      start_time: "",
      end_time: "",
      pricing: "fixed",
      rate: "",
      notes: "",
      ac: "AC",
      night_halts: 0,
    }),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!!id),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (id)
      api
        .get("trips", id)
        .then((r) =>
          setForm({
            ...r,
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
          }),
        )
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
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
  function validate(final = false) {
    if (step === 0 || final)
      if (!form.date) throw new Error("Choose a trip date.");
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
      const { rate, ...row } = form;
      row.status = draft ? "draft" : row.status;
      row.rate_minor = minor(rate || 0);
      for (const k of ["opening_km", "closing_km", "passengers", "night_halts"])
        row[k] = row[k] === "" || row[k] == null ? null : Number(row[k]);
      for (const k of ["start_time", "end_time"])
        row[k] = row[k] ? new Date(row[k]).toISOString() : null;
      const saved = await api.save("trips", row);
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
  return (
    <>
      <PageHeader
        title={id ? "Edit trip" : "Let’s plan a journey"}
        subtitle="A few simple steps. Everything in the right place."
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
          <div className="eyebrow">
            STEP {step + 1} OF {steps.length}
          </div>
          <h2>
            {
              [
                "Who’s travelling?",
                "Choose your team",
                "Map out the journey",
                "Capture the actual journey",
                "Agree on a price",
                "Ready for the road",
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
              {step === 0 && (
                <>
                  {input("date", "Trip date", "date", true)}
                  <Field label="Client">
                    <Lookup
                      table="clients"
                      value={form.client_id}
                      onChange={(v) => set("client_id", v)}
                    />
                  </Field>
                  {input("passengers", "Passengers", "number")}
                  <Field label="Status">
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
              {step === 2 && (
                <>
                  {input("origin", "From")}
                  {input("destination", "To")}
                  {input("night_halts", "Night halts", "number")}
                  <Field label="Notes">
                    <textarea
                      value={form.notes || ""}
                      onChange={(e) => set("notes", e.target.value)}
                    />
                  </Field>
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
                          onClick={() => {
                            if (confirm("Remove this place?"))
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
                </>
              )}
              {step === 3 && (
                <>
                  {input("opening_km", "Opening odometer (km)", "number")}
                  {input("closing_km", "Closing odometer (km)", "number")}
                  {input(
                    "start_time",
                    "Actual start date & time",
                    "datetime-local",
                  )}
                  {input(
                    "end_time",
                    "Actual end date & time",
                    "datetime-local",
                  )}
                  <p className="notice full">
                    Use the full date for trips ending after midnight. GPS is
                    not connected and never changes these readings.
                  </p>
                </>
              )}
              {step === 4 && (
                <>
                  <Field label="Pricing method">
                    <select
                      value={form.pricing}
                      onChange={(e) => set("pricing", e.target.value)}
                    >
                      {[
                        "fixed",
                        "per km",
                        "per hour",
                        "package/day",
                        "custom",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  {input("rate", "Rate (INR)", "number")}
                  <p className="notice full">
                    After saving, add expenses and generate an itemised invoice
                    from the trip. No tax is assumed.
                  </p>
                </>
              )}
              {step === 5 && (
                <div className="full review">
                  <Badge>{form.status}</Badge>
                  <h2>
                    {form.origin || "Origin"} →{" "}
                    {form.destination || "Destination"}
                  </h2>
                  <p>
                    {form.date} · {form.passengers} passengers · {form.ac}
                  </p>
                  <p>
                    Pricing: {form.pricing} · ₹{form.rate || "0"}
                  </p>
                  <p>{form.places.length} places recorded</p>
                  <p className="muted">
                    Review the earlier steps before saving. Expenses and
                    payments are recorded separately to avoid double-counting.
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
