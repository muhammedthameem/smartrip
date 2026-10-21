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

// Refresh an expired login token once (shared by parallel requests) and retry the request
let refreshing = null;
async function authFetch(input, init = {}) {
  const res = await fetch(input, init);
  if (res.status !== 401 || !supabase) return res;
  const reqUrl = typeof input === "string" ? input : input?.url || String(input);
  if (reqUrl.includes("/auth/v1/")) return res; // never loop on auth endpoints
  let body = "";
  try {
    body = await res.clone().text();
  } catch {}
  if (!/jwt expired|PGRST301|PGRST303|token is expired/i.test(body)) return res;

  refreshing ??= supabase.auth.refreshSession().finally(() => {
    refreshing = null;
  });
  const { data, error } = await refreshing.catch((e) => ({ error: e }));
  const token = data?.session?.access_token;
  if (error || !token) return res;

  const headers = new Headers(
    init.headers || (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined)
  );
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export const supabase = configured
  ? createClient(url, key, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
      global: { fetch: authFetch },
    })
  : null;

// Browsers pause timers in background tabs; restart token refresh when the tab comes back
if (supabase && typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      supabase.auth.startAutoRefresh();
      supabase.auth.getSession().catch(() => {});
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
const DEMO_KEY = "smarttrip-demo-v1";

// Work out how many days a package trip should have, from whatever the trip tells us
export function inferPackageDays(trip) {
  if (!trip) return 1;
  const isPackage = !!(trip.package_name || trip.pricing === "package/day");
  const text = `${trip.package_name || ""} ${trip.notes || ""}`;
  const m = text.match(/(\d{1,2})\s*-?\s*days?\b/i);
  let n = m ? Number(m[1]) : 0;
  if (!isPackage && !n) return 1;
  if (!n && trip.start_time && trip.end_time) {
    const s = new Date(trip.start_time);
    const e = new Date(trip.end_time);
    s.setHours(0, 0, 0, 0);
    e.setHours(0, 0, 0, 0);
    const diff = Math.round((e - s) / 86400000) + 1;
    if (diff > 1) n = diff;
  }
  if (!n && isPackage && Number(trip.night_halts) > 0) n = Number(trip.night_halts) + 1;
  return Math.min(Math.max(n || 1, 1), 60);
}

const placeText = (p) =>
  typeof p === "string" ? p : String(p?.name || p?.place || p?.label || p?.destination || "");

function buildDayRow(trip, dayNumber, total) {
  const base = trip.date ? new Date(`${trip.date}T00:00:00`) : new Date();
  base.setDate(base.getDate() + (dayNumber - 1));
  const date = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  const origin = dayNumber === 1 ? trip.origin || "Pickup Point" : `Day ${dayNumber} start`;
  const destination = dayNumber === total ? trip.destination || "Destination" : `Day ${dayNumber} stay`;
  const places = (Array.isArray(trip.places) ? trip.places : []).map(placeText).filter(Boolean);
  return {
    trip_id: trip.id,
    day_number: dayNumber,
    date,
    name: `Day ${dayNumber}: ${origin} → ${destination}`,
    origin,
    destination,
    planned_destinations:
      total === 1
        ? places.length
          ? places
          : [trip.destination || "Destination"]
        : dayNumber === total && trip.destination
          ? [trip.destination]
          : [],
    status: dayNumber === 1 && trip.status === "in progress" ? "in progress" : "pending",
    opening_km: dayNumber === 1 ? trip.opening_km ?? null : null,
    opening_source: dayNumber === 1 && trip.opening_km != null ? "manual" : null,
    started_at:
      dayNumber === 1 && trip.status === "in progress"
        ? trip.start_time || new Date().toISOString()
        : null,
  };
}
let demoData;
function db() {
  if (!demoData) {
    try {
      demoData = typeof localStorage !== "undefined" ? JSON.parse(localStorage.getItem(DEMO_KEY)) : null;
    } catch {}
    demoData ??= seed();
  }
  const seeded = seed();
  // Ensure newly added seed trips exist in existing localStorage demoData
  if (!demoData.trips || !demoData.trips.length) {
    demoData.trips = seeded.trips;
  } else {
    for (const st of seeded.trips) {
      if (!demoData.trips.some((t) => t.id === st.id)) {
        demoData.trips.unshift(st);
      }
    }
  }
  // Ensure newly added seed vehicles exist in existing localStorage demoData
  if (!demoData.vehicles || !demoData.vehicles.length) {
    demoData.vehicles = seeded.vehicles;
  } else {
    for (const sv of seeded.vehicles) {
      if (!demoData.vehicles.some((v) => v.id === sv.id)) {
        demoData.vehicles.push(sv);
      }
    }
  }
  if (!demoData.trip_days || !demoData.trip_days.length) {
    demoData.trip_days = seeded.trip_days || [];
  } else {
    for (const sd of seeded.trip_days || []) {
      if (!demoData.trip_days.some((d) => d.id === sd.id)) {
        demoData.trip_days.push(sd);
      }
    }
  }
  if (!demoData.trip_place_events || !demoData.trip_place_events.length) {
    demoData.trip_place_events = seeded.trip_place_events || [];
  }
  return demoData;
}
const persist = () => typeof localStorage !== "undefined" && localStorage.setItem(DEMO_KEY, JSON.stringify(demoData));
export function resetDemo() {
  demoData = seed();
  persist();
}

export function enrichTripRecord(table, r) {
  if (!r || table !== "trips") return r;
  if (!r.package_name && r.notes) {
    const match =
      r.notes.match(/^\[Package:\s*(.*?)\]/) ||
      r.notes.match(/^Package:\s*(.*?)(\n|$)/);
    if (match) {
      r.package_name = match[1].trim();
    } else if (r.pricing === "package/day") {
      r.package_name = r.notes.split("(")[0].trim() || "Tour Package";
    }
  }
  return r;
}

export function repository(demo, org) {
  return {
    async list(
      table,
      {
        page = 0,
        search = "",
        filters = {},
        limit = 20,
        archivedOnly = false,
      } = {},
    ) {
      if (demo) {
        let rows = db()[table].filter(
          (r) => Boolean(r.archived) === archivedOnly,
        );
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
        .eq("archived", archivedOnly)
        .order("created_at", { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);
      if (search) q = q.ilike("name", "%" + search + "%");
      for (const [k, v] of Object.entries(filters)) if (v) q = q.eq(k, v);
      const { data, error, count } = await q;
      if (error) throw error;
      if (data && table === "trips") {
        data.forEach((r) => enrichTripRecord("trips", r));
      }
      return { rows: data, count };
    },
    async get(table, id) {
      if (demo) {
        const row = db()[table].find((r) => r.id === id);
        if (!row) throw new Error("Record not found");
        return enrichTripRecord(table, row);
      }
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("org_id", org)
        .eq("id", id)
        .single();
      if (error) throw error;
      return enrichTripRecord(table, data);
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
        return enrichTripRecord(table, value);
      }
      const { id, created_at, updated_at, org_id, package_name, ...input } = row;
      if (table === "trips" && package_name) {
        const pkgHeader = `[Package: ${package_name}]`;
        if (!input.notes) {
          input.notes = pkgHeader;
        } else if (!input.notes.includes(pkgHeader)) {
          input.notes = `${pkgHeader} ${input.notes}`;
        }
      }
      const q = id
        ? supabase.from(table).update(input).eq("id", id).eq("org_id", org)
        : supabase.from(table).insert({ ...input, org_id: org });
      const { data, error } = await q.select().single();
      if (error) throw error;
      if (data && package_name) data.package_name = package_name;
      return enrichTripRecord(table, data);
    },
    async archive(table, id) {
      return this.save(table, { id, archived: true });
    },
    async unarchive(table, id) {
      if (demo) {
        const rows = db()[table],
          old = rows.find((r) => r.id === id);
        if (!old) throw new Error("Record not found");
        old.archived = false;
        old.updated_at = new Date().toISOString();
        persist();
        return enrichTripRecord(table, old);
      }
      const { data, error } = await supabase
        .from(table)
        .update({ archived: false })
        .eq("id", id)
        .eq("org_id", org)
        .select()
        .single();
      if (error) throw error;
      return enrichTripRecord(table, data);
    },
    async remove(table, id) {
      if (demo) {
        const data = db(),
          rows = data[table],
          index = rows.findIndex((r) => r.id === id);
        if (index < 0) throw new Error("Record not found");
        const refs = [],
          countRefs = (list, field, label) => {
            const n = (list || []).filter((r) => r[field] === id).length;
            if (n) refs.push(n + " " + label + (n === 1 ? "" : "s"));
          };
        if (table === "clients") {
          countRefs(data.trips, "client_id", "trip");
          countRefs(data.bookings, "client_id", "booking");
          countRefs(data.invoices, "client_id", "invoice");
        } else if (table === "drivers") {
          countRefs(data.trips, "driver_id", "trip");
          countRefs(data.bookings, "driver_id", "booking");
        } else if (table === "vehicles") {
          countRefs(data.trips, "vehicle_id", "trip");
          countRefs(data.bookings, "vehicle_id", "booking");
          countRefs(data.expenses, "vehicle_id", "expense");
          countRefs(data.maintenance, "vehicle_id", "maintenance record");
          countRefs(data.fuel_logs, "vehicle_id", "fuel log");
        }
        if (refs.length)
          throw new Error(
            "This " +
              (table === "clients" ? "client" : table === "drivers" ? "driver" : "record") +
              " is still linked to " +
              refs.join(", ") +
              ". Archive it instead to keep the history.",
          );
        rows.splice(index, 1);
        persist();
        return { id };
      }
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", id)
        .eq("org_id", org);
      if (error) {
        if (error.code === "23503")
          throw new Error(
            "This record is still linked to other data. Archive it instead to keep the history.",
          );
        throw error;
      }
      return { id };
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

    async getDriverItems(driverId = null) {
      if (demo) {
        const trips = (db().trips || [])
          .filter((t) => !t.archived && t.status !== "cancelled")
          .filter((t) => !driverId || t.driver_id === driverId)
          .map((t) => {
            const client = (db().clients || []).find((c) => c.id === t.client_id) || null;
            const vehicle = (db().vehicles || []).find((v) => v.id === t.vehicle_id) || null;
            const driver = (db().drivers || []).find((d) => d.id === t.driver_id) || null;
            return {
              ...enrichTripRecord("trips", t),
              item_type: "trip",
              client,
              vehicle,
              driver,
            };
          });

        const bookings = (db().bookings || [])
          .filter((b) => !b.archived && b.status !== "cancelled")
          .filter((b) => !driverId || !b.driver_id || b.driver_id === driverId)
          .map((b) => {
            const client = (db().clients || []).find((c) => c.id === b.client_id) || null;
            const vehicle = (db().vehicles || []).find((v) => v.id === b.vehicle_id) || null;
            const driver = (db().drivers || []).find((d) => d.id === b.driver_id) || null;
            return {
              ...b,
              item_type: "booking",
              client,
              vehicle,
              driver,
            };
          });

        return { trips, bookings, all: [...trips, ...bookings] };
      }

      let tripsQ = supabase
        .from("trips")
        .select("*, client:clients(*), vehicle:vehicles(*), driver:drivers(*)")
        .eq("org_id", org)
        .eq("archived", false)
        .neq("status", "cancelled");
      if (driverId) tripsQ = tripsQ.eq("driver_id", driverId);

      let bookingsQ = supabase
        .from("bookings")
        .select("*, client:clients(*), vehicle:vehicles(*), driver:drivers(*)")
        .eq("org_id", org)
        .eq("archived", false)
        .neq("status", "cancelled");
      if (driverId) bookingsQ = bookingsQ.or(`driver_id.eq.${driverId},driver_id.is.null`);

      const [{ data: tripsData, error: tripsErr }, { data: bookingsData, error: bookErr }] =
        await Promise.all([
          tripsQ.order("date", { ascending: false }),
          bookingsQ.order("date", { ascending: false }),
        ]);

      if (tripsErr) throw tripsErr;
      const trips = (tripsData || []).map((t) => ({
        ...enrichTripRecord("trips", t),
        item_type: "trip",
      }));
      const bookings = (bookingsData || []).map((b) => ({
        ...b,
        item_type: "booking",
      }));

      return { trips, bookings, all: [...trips, ...bookings] };
    },

    async getActiveDriverTrips(driverId = null) {
      if (demo) {
        const trips = db().trips.filter((t) => !t.archived && t.status !== "cancelled");
        if (driverId) {
          const dt = trips.filter((t) => t.driver_id === driverId);
          if (dt.length) return dt;
        }
        return trips;
      }
      let q = supabase
        .from("trips")
        .select("id, name, notes, origin, destination, status, date, driver_id")
        .eq("org_id", org)
        .eq("archived", false)
        .neq("status", "cancelled");
      if (driverId) q = q.eq("driver_id", driverId);
      const { data, error } = await q.order("date", { ascending: false });
      if (error) throw error;
      return (data || []).map((t) => enrichTripRecord("trips", t));
    },

    async ensureTripDays(tripId) {
      if (demo) {
        let days = (db().trip_days || [])
          .filter((d) => d.trip_id === tripId && !d.archived)
          .sort((a, b) => a.day_number - b.day_number);
        if (days.length > 0) return days;
        const trip = db().trips.find((t) => t.id === tripId);
        if (!trip) return [];
        const newDay = {
          id: `td-${trip.id}-1`,
          org_id: org || "00000000-0000-0000-0000-000000000001",
          trip_id: trip.id,
          day_number: 1,
          date: trip.date || today(),
          start_place: trip.origin || "Pickup Point",
          end_place: trip.destination || "Destination",
          planned_destinations:
            Array.isArray(trip.places) && trip.places.length
              ? trip.places
              : trip.destination
              ? [trip.destination]
              : ["Destination"],
          status: trip.status === "in progress" ? "in progress" : "pending",
          opening_km: trip.opening_km || null,
          opening_source: trip.opening_km ? "manual" : null,
          closing_km: trip.closing_km || null,
          started_at: trip.status === "in progress" ? (trip.date ? `${trip.date}T08:00:00.000Z` : new Date().toISOString()) : null,
          ended_at: null,
          created_at: new Date().toISOString(),
        };
        db().trip_days = db().trip_days || [];
        db().trip_days.push(newDay);
        persist();
        return [newDay];
      }
      let days = await this.getTripDays(tripId);
      const trip = await this.get("trips", tripId).catch(() => null);
      if (!trip) return days || [];
      const total = Math.max(inferPackageDays(trip), days?.length || 0);
      if (days && days.length >= total) return days;

      // Create only the missing day numbers (keeps any days that already exist untouched)
      const have = new Set((days || []).map((d) => d.day_number));
      const rows = [];
      for (let n = 1; n <= total; n++) {
        if (!have.has(n)) rows.push({ org_id: org, ...buildDayRow(trip, n, total) });
      }
      try {
        const { data, error } = await supabase
          .from("trip_days")
          .upsert(rows, { onConflict: "org_id,trip_id,day_number", ignoreDuplicates: true })
          .select("*");
        if (error) console.warn("Could not create trip days:", error);
        if (!error) {
          const fresh = await this.getTripDays(tripId);
          if (fresh.length) return fresh;
          if (data?.length) return data;
        }
      } catch (err) {
        console.warn("Could not create trip days:", err);
      }
      if (days && days.length) return days;

      // Fallback: ALWAYS return at least 1 day so DriverTrip never gets empty days
      return [
        {
          id: `virtual-${trip.id}-1`,
          trip_id: trip.id,
          day_number: 1,
          date: trip.date || today(),
          start_place: trip.origin || "Pickup Point",
          end_place: trip.destination || "Destination",
          planned_destinations:
            Array.isArray(trip.places) && trip.places.length
              ? trip.places
              : trip.destination
              ? [trip.destination]
              : ["Destination"],
          status: trip.status === "in progress" ? "in progress" : "pending",
          opening_km: trip.opening_km || null,
          opening_source: trip.opening_km ? "manual" : null,
          closing_km: trip.closing_km || null,
          started_at: trip.status === "in progress" ? new Date().toISOString() : null,
        },
      ];
    },

    async getAssignedDriverTrip(driverId = null, tripId = null) {
      if (demo) {
        const trips = db().trips.filter((t) => !t.archived && t.status !== "cancelled");
        const bookings = db().bookings || [];
        let trip = null;
        if (tripId) {
          trip = trips.find((t) => t.id === tripId);
          if (!trip) {
            const booking = bookings.find((b) => b.id === tripId);
            if (booking) {
              const client = db().clients.find((c) => c.id === booking.client_id) || null;
              const vehicle = db().vehicles.find((v) => v.id === booking.vehicle_id) || null;
              const driver = db().drivers.find((d) => d.id === booking.driver_id) || null;
              return {
                is_booking: true,
                ...booking,
                client,
                vehicle,
                driver,
                days: [
                  {
                    id: `b-day-${booking.id}`,
                    trip_id: booking.id,
                    day_number: 1,
                    date: booking.date || today(),
                    start_place: booking.origin || "Pickup Point",
                    end_place: booking.destination || "Drop-off Location",
                    planned_destinations: booking.destination ? [booking.destination] : [],
                    status: "pending",
                    opening_km: vehicle?.odometer || 0,
                    closing_km: null,
                  },
                ],
              };
            }
          }
        }
        if (!trip && driverId) {
          // Prioritize in progress trips with itinerary, then any in progress for this driver
          trip =
            trips.find(
              (t) =>
                t.driver_id === driverId &&
                t.status === "in progress" &&
                (t.id === "t4" || (db().trip_days || []).some((d) => d.trip_id === t.id))
            ) ||
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
        const days = await this.ensureTripDays(trip.id);
        return { ...enrichTripRecord("trips", trip), client, vehicle, driver, days };
      }

      if (tripId) {
        const { data: tripData } = await supabase
          .from("trips")
          .select("*, client:clients(*), vehicle:vehicles(*), driver:drivers(*)")
          .eq("org_id", org)
          .eq("id", tripId)
          .maybeSingle();

        if (tripData) {
          const days = await this.ensureTripDays(tripData.id);
          return { ...enrichTripRecord("trips", tripData), days };
        }

        const { data: bookData } = await supabase
          .from("bookings")
          .select("*, client:clients(*), vehicle:vehicles(*), driver:drivers(*)")
          .eq("org_id", org)
          .eq("id", tripId)
          .maybeSingle();

        if (bookData) {
          return {
            is_booking: true,
            ...bookData,
            days: [
              {
                id: `b-day-${bookData.id}`,
                trip_id: bookData.id,
                day_number: 1,
                date: bookData.date || today(),
                start_place: bookData.origin || "Pickup Point",
                end_place: bookData.destination || "Drop-off Location",
                planned_destinations: bookData.destination ? [bookData.destination] : [],
                status: "pending",
                opening_km: bookData.vehicle?.odometer || 0,
                closing_km: null,
              },
            ],
          };
        }
      }

      let q = supabase
        .from("trips")
        .select("*, client:clients(*), vehicle:vehicles(*), driver:drivers(*)")
        .eq("org_id", org)
        .eq("archived", false)
        .neq("status", "cancelled");
      if (driverId) {
        q = q.eq("driver_id", driverId);
      }
      const { data, error } = await q.order("date", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const days = await this.ensureTripDays(data.id);
      return { ...enrichTripRecord("trips", data), days };
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
      if (error) {
        if (error.code === "PGRST205" || error.code === "42P01")
          throw new Error(
            "Driver mode is not set up in this workspace yet. Run supabase/migrations/003_driver_trip_days.sql in the Supabase SQL editor."
          );
        throw error;
      }
      return (data || []).map((d) => ({
        ...d,
        start_place: d.start_place || d.origin,
        end_place: d.end_place || d.destination,
      }));
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

    async saveTripDays(tripId, days) {
      if (!Array.isArray(days) || !days.length) return [];
      if (demo) {
        db().trip_days = db().trip_days || [];
        db().trip_days = db().trip_days.filter((d) => d.trip_id !== tripId);
        const created = days.map((d, idx) => ({
          id: d.id || `td-${tripId}-${idx + 1}`,
          org_id: org || "00000000-0000-0000-0000-000000000001",
          trip_id: tripId,
          day_number: d.day_number || idx + 1,
          date: d.date || today(),
          name: d.name || `Day ${idx + 1}: ${d.origin || "Pickup"} → ${d.destination || "Destination"}`,
          origin: d.origin || d.start_place || "",
          destination: d.destination || d.end_place || "",
          planned_destinations: Array.isArray(d.planned_destinations) ? d.planned_destinations : [],
          status: d.status || (idx === 0 ? "in progress" : "pending"),
          opening_km: d.opening_km ? Number(d.opening_km) : null,
          closing_km: d.closing_km ? Number(d.closing_km) : null,
          opening_source: d.opening_km ? "manual" : null,
          closing_source: d.closing_km ? "manual" : null,
          notes: d.notes || "",
          archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        db().trip_days.push(...created);
        persist();
        return created;
      }
      const rows = days.map((d, idx) => ({
        org_id: org,
        trip_id: tripId,
        day_number: d.day_number || idx + 1,
        date: d.date || today(),
        name: d.name || `Day ${idx + 1}: ${d.origin || "Pickup"} → ${d.destination || "Destination"}`,
        origin: d.origin || d.start_place || "",
        destination: d.destination || d.end_place || "",
        planned_destinations: Array.isArray(d.planned_destinations) ? d.planned_destinations : [],
        status: d.status || (idx === 0 ? "in progress" : "pending"),
        opening_km: d.opening_km ? Number(d.opening_km) : null,
        closing_km: d.closing_km ? Number(d.closing_km) : null,
        opening_source: d.opening_km ? "manual" : null,
        closing_source: d.closing_km ? "manual" : null,
        notes: d.notes || "",
      }));
      const { data, error } = await supabase
        .from("trip_days")
        .upsert(rows, { onConflict: "org_id,trip_id,day_number" })
        .select("*");
      if (error) {
        console.warn("Could not upsert trip_days:", error);
      }
      return data || [];
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
      // DB only accepts these sources
      location_source = ["gps", "gps_reverse_geocoded", "search", "manual"].includes(location_source)
        ? location_source
        : latitude != null
          ? "gps"
          : "manual";
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

    async startTripRide(
      tripId,
      { opening_km, opening_source = "manual", started_at = new Date().toISOString() } = {}
    ) {
      const op = Number(opening_km);
      if (!Number.isFinite(op) || op < 0) {
        throw new Error("Opening odometer must be a positive number.");
      }
      if (demo) {
        const trip = db().trips.find((t) => t.id === tripId);
        if (!trip) throw new Error("Trip not found");
        trip.status = "in progress";
        trip.opening_km = op;
        trip.start_time = started_at;
        trip.updated_at = new Date().toISOString();

        // Update vehicle odometer if higher
        const vehicle = db().vehicles.find((v) => v.id === trip.vehicle_id);
        if (vehicle && op > (vehicle.odometer || 0)) {
          vehicle.odometer = op;
        }

        // Day 1 is NOT auto-started: the driver starts it with START DAY once the ride is active
        await this.ensureTripDays(tripId);
        persist();
        return trip;
      }

      // Supabase
      const current = await this.get("trips", tripId);
      if (!current) throw new Error("Trip not found");
      const missing = [
        [!current.client_id, "client"],
        [!current.vehicle_id, "vehicle"],
        [!current.driver_id, "driver"],
        [!String(current.origin || "").trim(), "pickup / origin"],
        [!String(current.destination || "").trim(), "destination"],
      ]
        .filter(([isMissing]) => isMissing)
        .map(([, label]) => label);
      if (missing.length) {
        throw new Error(
          `Cannot start this ride yet. Please edit the trip and add: ${missing.join(", ")}.`
        );
      }

      const { data: trip, error } = await supabase
        .from("trips")
        .update({
          status: "in progress",
          opening_km: op,
          start_time: current.start_time || started_at,
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", org)
        .eq("id", tripId)
        .select()
        .single();
      if (error) throw error;

      // Make sure the package days exist; Day 1 is started by the driver via START DAY
      await this.ensureTripDays(tripId).catch(() => {});
      return trip;
    },

    async updateRide(item, patch = {}) {
      const isBooking = !!item?.is_booking;
      const table = isBooking ? "bookings" : "trips";
      const allowed = isBooking
        ? ["client_id", "vehicle_id", "driver_id", "date", "pickup_time", "origin", "destination", "passengers", "notes"]
        : ["client_id", "vehicle_id", "driver_id", "date", "origin", "destination", "passengers", "notes", "package_name"];
      const row = {};
      for (const k of allowed) {
        if (!(k in patch)) continue;
        let v = patch[k];
        if (typeof v === "string") v = v.trim();
        if (k.endsWith("_id") && !v) v = null;
        if (k === "passengers") v = v === "" || v == null ? null : Number(v);
        if (k === "pickup_time" && !v) v = null;
        row[k] = v;
      }
      const merged = { ...item, ...row };
      if (!merged.date) throw new Error("Date is required.");
      if (row.passengers != null && !(row.passengers > 0)) throw new Error("Passengers must be at least 1.");
      const needsFull = isBooking || !["draft", "cancelled"].includes(merged.status);
      if (needsFull) {
        const missing = [
          [!merged.client_id, "client"],
          [!merged.vehicle_id, "vehicle"],
          [!isBooking && !merged.driver_id, "driver"],
          [!String(merged.origin || "").trim(), "pickup"],
          [!String(merged.destination || "").trim(), "destination"],
        ]
          .filter(([m]) => m)
          .map(([, l]) => l);
        if (missing.length) throw new Error(`Please fill: ${missing.join(", ")}.`);
      }

      if (demo) {
        const rec = (db()[table] || []).find((r) => r.id === item.id);
        if (!rec) throw new Error("Ride not found");
        Object.assign(rec, row, { updated_at: new Date().toISOString() });
        persist();
        return rec;
      }
      const { data, error } = await supabase
        .from(table)
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("org_id", org)
        .eq("id", item.id)
        .select()
        .single();
      if (error) {
        if (/row-level security|permission denied/i.test(error.message))
          throw new Error("You don't have permission to edit this ride. Ask the office to update it.");
        throw error;
      }
      return data;
    },

    async updateTripDay(dayId, patch = {}) {
      if (!dayId || /^(virtual-|day-|b-day-)/.test(String(dayId)))
        throw new Error("This day isn't saved yet. Reload the ride and try again.");
      const row = {};
      if ("origin" in patch) row.origin = String(patch.origin || "").trim();
      if ("destination" in patch) row.destination = String(patch.destination || "").trim();
      if ("date" in patch && patch.date) row.date = patch.date;
      if ("notes" in patch) row.notes = patch.notes || "";
      if ("planned_destinations" in patch)
        row.planned_destinations = (patch.planned_destinations || [])
          .map((p) => String(p).trim())
          .filter(Boolean);
      if ("day_number" in patch || "origin" in row || "destination" in row) {
        const n = patch.day_number;
        row.name = `Day ${n || ""}: ${row.origin || "Start"} \u2192 ${row.destination || "Stay"}`.replace("Day : ", "Day: ");
      }
      if (demo) {
        const d = (db().trip_days || []).find((x) => x.id === dayId);
        if (!d) throw new Error("Trip day not found");
        Object.assign(d, row, { updated_at: new Date().toISOString() });
        persist();
        return d;
      }
      const { data, error } = await supabase
        .from("trip_days")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("org_id", org)
        .eq("id", dayId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async updateTripGpsKm(tripId, km) {
      const value = Math.round(Number(km) * 100) / 100;
      if (!Number.isFinite(value) || value < 0) return null;
      if (demo) {
        const trip = db().trips.find((t) => t.id === tripId);
        if (trip) {
          trip.gps_estimated_km = value;
          persist();
        }
        return trip;
      }
      const { error } = await supabase
        .from("trips")
        .update({ gps_estimated_km: value })
        .eq("org_id", org)
        .eq("id", tripId);
      if (error) throw error;
      return true;
    },

    async completeTripRide(
      tripId,
      { closing_km, closing_source = "manual", ended_at = new Date().toISOString(), notes = "" } = {}
    ) {
      const cl = Number(closing_km);
      if (!Number.isFinite(cl) || cl < 0) {
        throw new Error("Closing odometer must be a positive number.");
      }
      if (demo) {
        const trip = db().trips.find((t) => t.id === tripId);
        if (!trip) throw new Error("Trip not found");
        if (trip.opening_km != null && cl < trip.opening_km) {
          throw new Error(
            `Closing odometer must be at least the opening reading (${trip.opening_km} km).`
          );
        }
        trip.status = "completed";
        trip.closing_km = cl;
        trip.end_time = ended_at;
        if (notes) {
          trip.notes = trip.notes ? `${trip.notes}\nEnd Ride: ${notes}` : `End Ride: ${notes}`;
        }
        trip.updated_at = new Date().toISOString();

        // Update vehicle odometer if higher
        const vehicle = db().vehicles.find((v) => v.id === trip.vehicle_id);
        if (vehicle && cl > (vehicle.odometer || 0)) {
          vehicle.odometer = cl;
        }

        // Complete any active days
        const days = (db().trip_days || []).filter((d) => d.trip_id === tripId);
        for (const day of days) {
          if (day.status !== "completed") {
            day.status = "completed";
            day.closing_km = cl;
            day.closing_source = closing_source;
            day.ended_at = ended_at;
          }
        }
        persist();
        return trip;
      }

      // Supabase
      const trip = await this.get("trips", tripId);
      if (!trip) throw new Error("Trip not found");
      if (trip.opening_km != null && cl < trip.opening_km) {
        throw new Error(
          `Closing odometer must be at least the opening reading (${trip.opening_km} km).`
        );
      }

      const { data, error } = await supabase
        .from("trips")
        .update({
          status: "completed",
          opening_km: trip.opening_km != null ? trip.opening_km : cl,
          closing_km: cl,
          start_time: trip.start_time || ended_at,
          end_time: ended_at,
          notes: notes
            ? trip.notes
              ? `${trip.notes}\nEnd Ride: ${notes}`
              : `End Ride: ${notes}`
            : trip.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("org_id", org)
        .eq("id", tripId)
        .select()
        .single();
      if (error) throw error;

      // Update days
      const days = await this.getTripDays(tripId);
      for (const d of days) {
        if (d.status !== "completed") {
          await this.endTripDay(d.id, {
            closing_km: cl,
            closing_source,
            ended_at,
          }).catch(() => {});
        }
      }
      return data;
    },

    async startBookingRide(
      bookingId,
      { opening_km, opening_source = "manual", started_at = new Date().toISOString() } = {}
    ) {
      if (demo) {
        const booking = (db().bookings || []).find((b) => b.id === bookingId);
        if (!booking) throw new Error("Booking not found");
        const trip = await this.convertBooking(booking);
        return this.startTripRide(trip.id, { opening_km, opening_source, started_at });
      }
      const booking = await this.get("bookings", bookingId);
      if (!booking) throw new Error("Booking not found");
      const trip = await this.convertBooking(booking);
      return this.startTripRide(trip.id, { opening_km, opening_source, started_at });
    },
  };
}
