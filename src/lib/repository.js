import { createClient } from "@supabase/supabase-js";
import { seed } from "./demo.js";
import { invoiceTotal, paidFor, distance, today } from "./calculations.js";
import { validateRecord } from "./validation.js";
const defaultUrl = "https://vwaczcwuagzmtpqvmjey.supabase.co";
const defaultKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YWN6Y3d1YWd6bXRwcXZtamV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MjM3MDIsImV4cCI6MjEwNzM5OTcwMn0.XFiyFnuzxx6g95ERZ6uvcvG4OUO4vSkSXyHuzd8U0Vc";

const url = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) || (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL) || defaultUrl;
const key = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ANON_KEY) || (typeof process !== "undefined" && process.env?.VITE_SUPABASE_ANON_KEY) || defaultKey;
export const configured = !!(url && key);
export const supabase = configured ? createClient(url, key) : null;
const DEMO_KEY = "smarttrip-demo-v1";
let demoData;
function db() {
  if (!demoData) {
    try {
      demoData = typeof localStorage !== "undefined" ? JSON.parse(localStorage.getItem(DEMO_KEY)) : null;
    } catch {}
    demoData ??= seed();
  }
  if (!demoData.trip_days || !demoData.trip_days.length) {
    demoData.trip_days = seed().trip_days || [];
  }
  if (!demoData.trip_place_events || !demoData.trip_place_events.length) {
    demoData.trip_place_events = seed().trip_place_events || [];
  }
  return demoData;
}
const persist = () => typeof localStorage !== "undefined" && localStorage.setItem(DEMO_KEY, JSON.stringify(demoData));
export function resetDemo() {
  demoData = seed();
  persist();
}
export function repository(demo, org) {
  return {
    async list(
      table,
      { page = 0, search = "", filters = {}, limit = 20 } = {},
    ) {
      if (demo) {
        let rows = db()[table].filter((r) => !r.archived);
        if (search)
          rows = rows.filter((r) =>
            JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
          );
        for (const [k, v] of Object.entries(filters))
          if (v) rows = rows.filter((r) => String(r[k] ?? "") === v);
        return {
          rows: rows.slice(page * limit, (page + 1) * limit),
          count: rows.length,
        };
      }
      let q = supabase
        .from(table)
        .select("*", { count: "exact" })
        .eq("org_id", org)
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (search) q = q.ilike("name", "%" + search + "%");
      for (const [k, v] of Object.entries(filters)) if (v) q = q.eq(k, v);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data, count };
    },
    async get(table, id) {
      if (demo) {
        const row = db()[table].find((r) => r.id === id);
        if (!row) throw new Error("Record not found");
        return row;
      }
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("org_id", org)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    async invoiceBalances(ids) {
      if (!ids.length) return [];
      if (demo)
        return db()
          .invoices.filter((i) => ids.includes(i.id))
          .map((i) => ({
            id: i.id,
            paid_minor: paidFor(i, db().payments),
            balance_minor: i.total_minor - paidFor(i, db().payments),
          }));
      const { data, error } = await supabase.rpc("invoice_balances", {
        invoice_ids: ids,
      });
      if (error) throw error;
      return data;
    },
    async save(table, row) {
      row = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          key.endsWith("_id") && value === "" ? null : value,
        ]),
      );
      if (!row.archived) validateRecord(table, row);
      if (demo) {
        const rows = db()[table],
          old = rows.find((r) => r.id === row.id);
        if (
          !row.id &&
          row.request_key &&
          rows.some((r) => r.request_key === row.request_key)
        )
          throw new Error(
            "This submission is already saved. Refresh the list to view it.",
          );
        let value = {
          ...row,
          id: row.id || crypto.randomUUID(),
          updated_at: new Date().toISOString(),
        };
        if (table === "invoices") {
          if (
            !old &&
            value.trip_id &&
            db().invoices.some(
              (i) => i.trip_id === value.trip_id && i.status !== "cancelled",
            )
          )
            throw new Error("This trip already has an issued invoice.");
          if (
            value.trip_id &&
            db().trips.find((t) => t.id === value.trip_id)?.client_id !==
              value.client_id
          )
            throw new Error("Invoice client must match the linked trip.");
          value.total_minor = invoiceTotal(
            value.items,
            value.discount_minor,
            value.tax_bps,
          ).total;
        }
        if (table === "payments") {
          const inv = db().invoices.find((i) => i.id === value.invoice_id);
          if (!inv || inv.status === "cancelled")
            throw new Error("Choose an issued invoice.");
          const paid = paidFor(
            inv,
            db().payments.filter((p) => p.id !== value.id),
          );
          if (
            value.amount_minor <= 0 ||
            (value.kind === "refund"
              ? value.amount_minor > paid
              : value.amount_minor > inv.total_minor - paid)
          )
            throw new Error(
              "Payment exceeds balance, or refund exceeds amount received.",
            );
        }
        if (table === "trips" && !value.name)
          value.name = "ST-" + String(Date.now()).slice(-8);
        if (table === "invoices" && !value.name)
          value.name = "INV-" + String(Date.now()).slice(-8);
        if (old) rows[rows.indexOf(old)] = { ...old, ...value };
        else rows.unshift(value);
        persist();
        return value;
      }
      const { id, created_at, updated_at, org_id, ...input } = row;
      const q = id
        ? supabase.from(table).update(input).eq("id", id).eq("org_id", org)
        : supabase.from(table).insert({ ...input, org_id: org });
      const { data, error } = await q.select().single();
      if (error) throw error;
      return data;
    },
    async archive(table, id) {
      return this.save(table, { id, archived: true });
    },
    async report(from, to) {
      if (demo) {
        const data = db();
        return Object.fromEntries(
          [
            "trips",
            "expenses",
            "invoices",
            "payments",
            "maintenance",
            "fuel_logs",
          ]
            .map((t) => [
              t,
              data[t].filter(
                (r) => !r.archived && r.date >= from && r.date <= to,
              ),
            ])
            .concat([["all_payments", data.payments]]),
        );
      }
      const { data, error } = await supabase.rpc("report_data", {
        date_from: from,
        date_to: to,
      });
      if (error) throw error;
      return data;
    },
    async convertBooking(booking) {
      if (demo) {
        if (booking.trip_id) return this.get("trips", booking.trip_id);
        const trip = await this.save("trips", {
          date: booking.date,
          client_id: booking.client_id,
          vehicle_id: booking.vehicle_id,
          driver_id: booking.driver_id,
          origin: booking.origin,
          destination: booking.destination,
          passengers: booking.passengers,
          status: "draft",
          places: [],
          pricing: "fixed",
          rate_minor: 0,
          booking_id: booking.id,
        });
        await this.save("bookings", { ...booking, trip_id: trip.id });
        return trip;
      }
      const { data, error } = await supabase.rpc("convert_booking", {
        booking_uuid: booking.id,
      });
      if (error) throw error;
      return data;
    },
    async upload(file, meta) {
      if (demo)
        throw new Error(
          "Private file storage needs Supabase. Demo does not save uploads.",
        );
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a file smaller than 10 MB.");
      if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type))
        throw new Error("Use a JPEG, PNG or PDF.");
      const path =
        org +
        "/" +
        crypto.randomUUID() +
        "/" +
        file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { error } = await supabase.storage
        .from("documents")
        .upload(path, file);
      if (error) throw error;
      try {
        return await this.save("documents", {
          ...meta,
          path,
          name: file.name,
          processing_status: "manual review",
          verified: false,
        });
      } catch (e) {
        await supabase.storage.from("documents").remove([path]);
        throw e;
      }
    },
    async fileUrl(path) {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(path, 60);
      if (error) throw error;
      return data.signedUrl;
    },

    async getAssignedDriverTrip(driverId = null) {
      if (demo) {
        const trips = db().trips.filter((t) => !t.archived && t.status !== "cancelled");
        let trip = null;
        if (driverId) {
          trip =
            trips.find((t) => t.driver_id === driverId && t.status === "in progress") ||
            trips.find((t) => t.driver_id === driverId);
        }
        trip ??=
          trips.find((t) => t.id === "t4") ||
          trips.find((t) => t.status === "in progress") ||
          trips[0];
        if (!trip) return null;
        const client = db().clients.find((c) => c.id === trip.client_id) || null;
        const vehicle = db().vehicles.find((v) => v.id === trip.vehicle_id) || null;
        const driver = db().drivers.find((d) => d.id === trip.driver_id) || null;
        const days = (db().trip_days || [])
          .filter((d) => d.trip_id === trip.id && !d.archived)
          .sort((a, b) => a.day_number - b.day_number);
        return { ...trip, client, vehicle, driver, days };
      }
      let q = supabase
        .from("trips")
        .select("*, client:clients(*), vehicle:vehicles(*), driver:drivers(*)")
        .eq("org_id", org)
        .eq("archived", false)
        .neq("status", "cancelled");
      if (driverId) q = q.eq("driver_id", driverId);
      const { data, error } = await q.order("date", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const days = await this.getTripDays(data.id);
      return { ...data, days };
    },

    async getTripDays(tripId) {
      if (demo) {
        return (db().trip_days || [])
          .filter((d) => d.trip_id === tripId && !d.archived)
          .sort((a, b) => a.day_number - b.day_number);
      }
      const { data, error } = await supabase
        .from("trip_days")
        .select("*")
        .eq("org_id", org)
        .eq("trip_id", tripId)
        .eq("archived", false)
        .order("day_number", { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async getTripDay(tripDayId) {
      if (demo) {
        const day = (db().trip_days || []).find((d) => d.id === tripDayId);
        if (!day) throw new Error("Trip day not found");
        return day;
      }
      const { data, error } = await supabase
        .from("trip_days")
        .select("*")
        .eq("org_id", org)
        .eq("id", tripDayId)
        .single();
      if (error) throw error;
      return data;
    },

    async getTripDayTimeline(tripDayId) {
      if (demo) {
        const day = (db().trip_days || []).find((d) => d.id === tripDayId);
        if (!day) return [];
        const placeEvents = (db().trip_place_events || []).filter(
          (p) => p.trip_day_id === tripDayId && !p.archived
        );
        const dayExpenses = (db().expenses || []).filter(
          (e) => e.trip_id === day.trip_id && (!e.date || e.date === day.date) && !e.archived
        );

        const items = [];
        if (day.started_at && day.opening_km != null) {
          items.push({
            id: `start-${day.id}`,
            kind: "start_day",
            title: "Day Started",
            subtitle: `Opening · ${Number(day.opening_km).toLocaleString()} km`,
            source: day.opening_source,
            timestamp: day.started_at,
          });
        }
        for (const p of placeEvents) {
          items.push({
            id: p.id,
            kind: "place",
            title: p.name,
            subtitle:
              p.notes ||
              (p.location_source?.includes("gps")
                ? "GPS location recorded"
                : "Location recorded"),
            source: p.location_source,
            latitude: p.latitude,
            longitude: p.longitude,
            accuracy: p.accuracy,
            odometer: p.odometer,
            timestamp: p.reached_at || p.created_at,
          });
        }
        for (const e of dayExpenses) {
          items.push({
            id: e.id,
            kind: "expense",
            title: e.category || "Expense",
            subtitle: e.name,
            amount_minor: e.amount_minor,
            timestamp: e.created_at || `${e.date}T12:00:00.000Z`,
          });
        }
        if (day.ended_at && day.closing_km != null) {
          const dist =
            day.opening_km != null ? day.closing_km - day.opening_km : 0;
          items.push({
            id: `end-${day.id}`,
            kind: "end_day",
            title: "Day Completed",
            subtitle: `Closing · ${Number(day.closing_km).toLocaleString()} km (${dist} km)`,
            source: day.closing_source,
            timestamp: day.ended_at,
          });
        }
        return items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      }

      // Supabase
      const { data: day, error: dayError } = await supabase
        .from("trip_days")
        .select("*")
        .eq("org_id", org)
        .eq("id", tripDayId)
        .single();
      if (dayError) throw dayError;

      const [placesRes, expensesRes] = await Promise.all([
        supabase
          .from("trip_place_events")
          .select("*")
          .eq("org_id", org)
          .eq("trip_day_id", tripDayId)
          .eq("archived", false)
          .order("reached_at", { ascending: true }),
        supabase
          .from("expenses")
          .select("*")
          .eq("org_id", org)
          .eq("trip_id", day.trip_id)
          .eq("date", day.date)
          .eq("archived", false)
          .order("created_at", { ascending: true }),
      ]);

      const items = [];
      if (day.started_at && day.opening_km != null) {
        items.push({
          id: `start-${day.id}`,
          kind: "start_day",
          title: "Day Started",
          subtitle: `Opening · ${Number(day.opening_km).toLocaleString()} km`,
          source: day.opening_source,
          timestamp: day.started_at,
        });
      }
      for (const p of placesRes.data || []) {
        items.push({
          id: p.id,
          kind: "place",
          title: p.name,
          subtitle:
            p.notes ||
            (p.location_source?.includes("gps")
              ? "GPS location recorded"
              : "Location recorded"),
          source: p.location_source,
          latitude: p.latitude,
          longitude: p.longitude,
          accuracy: p.accuracy,
          odometer: p.odometer,
          timestamp: p.reached_at,
        });
      }
      for (const e of expensesRes.data || []) {
        items.push({
          id: e.id,
          kind: "expense",
          title: e.category || "Expense",
          subtitle: e.name,
          amount_minor: e.amount_minor,
          timestamp: e.created_at || `${e.date}T12:00:00.000Z`,
        });
      }
      if (day.ended_at && day.closing_km != null) {
        const dist =
          day.opening_km != null ? day.closing_km - day.opening_km : 0;
        items.push({
          id: `end-${day.id}`,
          kind: "end_day",
          title: "Day Completed",
          subtitle: `Closing · ${Number(day.closing_km).toLocaleString()} km (${dist} km)`,
          source: day.closing_source,
          timestamp: day.ended_at,
        });
      }
      return items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    },

    async startTripDay(
      tripDayId,
      { opening_km, opening_source = "manual", started_at = new Date().toISOString() }
    ) {
      const op = Number(opening_km);
      if (!Number.isFinite(op) || op < 0) {
        throw new Error("Opening odometer must be a positive number.");
      }
      if (demo) {
        const day = (db().trip_days || []).find((d) => d.id === tripDayId);
        if (!day) throw new Error("Trip day not found");
        day.opening_km = op;
        day.opening_source = opening_source;
        day.started_at = started_at;
        day.status = "in progress";
        day.updated_at = new Date().toISOString();

        const trip = db().trips.find((t) => t.id === day.trip_id);
        if (trip) {
          if (day.day_number === 1 && trip.opening_km == null) {
            trip.opening_km = op;
          }
          const vehicle = db().vehicles.find((v) => v.id === trip.vehicle_id);
          if (vehicle && op > (vehicle.odometer || 0)) {
            vehicle.odometer = op;
          }
        }
        persist();
        return day;
      }
      const { data, error } = await supabase
        .from("trip_days")
        .update({
          opening_km: op,
          opening_source,
          started_at,
          status: "in progress",
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", org)
        .eq("id", tripDayId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async recordReachedPlace({
      trip_day_id,
      trip_id,
      name,
      latitude = null,
      longitude = null,
      accuracy = null,
      location_source = "manual",
      planned_destination = null,
      odometer = null,
      notes = "",
    }) {
      if (!name || !name.trim()) throw new Error("Place name is required.");
      if (demo) {
        const event = {
          id: crypto.randomUUID(),
          trip_day_id,
          trip_id,
          name: name.trim(),
          latitude: latitude != null ? Number(latitude) : null,
          longitude: longitude != null ? Number(longitude) : null,
          accuracy: accuracy != null ? Number(accuracy) : null,
          location_source,
          planned_destination,
          odometer:
            odometer != null && odometer !== "" ? Number(odometer) : null,
          notes: notes || "",
          reached_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          archived: false,
        };
        db().trip_place_events.push(event);

        if (event.odometer != null) {
          const trip = db().trips.find((t) => t.id === trip_id);
          if (trip) {
            const vehicle = db().vehicles.find((v) => v.id === trip.vehicle_id);
            if (vehicle && event.odometer > (vehicle.odometer || 0)) {
              vehicle.odometer = event.odometer;
            }
          }
        }
        persist();
        return event;
      }
      const { data, error } = await supabase
        .from("trip_place_events")
        .insert({
          org_id: org,
          trip_day_id,
          trip_id,
          name: name.trim(),
          latitude: latitude != null ? Number(latitude) : null,
          longitude: longitude != null ? Number(longitude) : null,
          accuracy: accuracy != null ? Number(accuracy) : null,
          location_source,
          planned_destination,
          odometer:
            odometer != null && odometer !== "" ? Number(odometer) : null,
          notes: notes || "",
          reached_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async recordOdometer({
      trip_day_id,
      trip_id,
      odometer,
      notes = "Odometer reading",
    }) {
      const odo = Number(odometer);
      if (!Number.isFinite(odo) || odo < 0) {
        throw new Error("Enter a valid odometer reading.");
      }
      return this.recordReachedPlace({
        trip_day_id,
        trip_id,
        name: `KM reading: ${odo.toLocaleString()} km`,
        odometer: odo,
        location_source: "manual",
        notes,
      });
    },

    async addDriverExpense({
      trip_id,
      vehicle_id,
      name,
      category,
      amount_minor,
      date = today(),
      notes = "",
    }) {
      return this.save("expenses", {
        trip_id,
        vehicle_id,
        name,
        category,
        amount_minor,
        date,
        notes,
      });
    },

    async endTripDay(
      tripDayId,
      { closing_km, closing_source = "manual", ended_at = new Date().toISOString() }
    ) {
      const cl = Number(closing_km);
      if (!Number.isFinite(cl) || cl < 0) {
        throw new Error("Closing odometer must be a positive number.");
      }
      const day = await this.getTripDay(tripDayId);
      if (day.opening_km != null && cl < day.opening_km) {
        throw new Error("Closing odometer must be at least the opening reading.");
      }

      if (demo) {
        day.closing_km = cl;
        day.closing_source = closing_source;
        day.ended_at = ended_at;
        day.status = "completed";
        day.updated_at = new Date().toISOString();

        const trip = db().trips.find((t) => t.id === day.trip_id);
        if (trip) {
          const vehicle = db().vehicles.find((v) => v.id === trip.vehicle_id);
          if (vehicle && cl > (vehicle.odometer || 0)) {
            vehicle.odometer = cl;
          }
          const remaining = (db().trip_days || []).filter(
            (d) => d.trip_id === trip.id && d.status !== "completed"
          );
          if (!remaining.length) {
            trip.status = "completed";
            trip.closing_km = cl;
          }
        }
        persist();
        return day;
      }

      const { data, error } = await supabase
        .from("trip_days")
        .update({
          closing_km: cl,
          closing_source,
          ended_at,
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", org)
        .eq("id", tripDayId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  };
}
