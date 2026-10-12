import { createClient } from "@supabase/supabase-js";
import { seed } from "./demo";
import { invoiceTotal, paidFor } from "./calculations";
import { validateRecord } from "./validation";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = !!(url && key);
export const supabase = configured ? createClient(url, key) : null;
const DEMO_KEY = "smarttrip-demo-v1";
let demoData;
function db() {
  if (!demoData) {
    try {
      demoData = JSON.parse(localStorage.getItem(DEMO_KEY));
    } catch {}
    demoData ??= seed();
  }
  return demoData;
}
const persist = () => localStorage.setItem(DEMO_KEY, JSON.stringify(demoData));
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
  };
}
