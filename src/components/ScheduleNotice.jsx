import React from "react";
import { useList } from "../lib/context";
export default function ScheduleNotice({ record }) {
  const trips = useList("trips", {
      filters: { date: record.date },
      limit: 100,
    }),
    bookings = useList("bookings", {
      filters: { date: record.date },
      limit: 100,
    });
  if (!record.vehicle_id && !record.driver_id)
    return (
      <p className="notice">
        Select a vehicle and driver to check same-day assignments.
      </p>
    );
  const conflicts = [...trips.rows, ...bookings.rows].filter(
    (r) =>
      r.id !== record.id &&
      r.id !== record.booking_id &&
      r.trip_id !== record.id &&
      !["cancelled", "completed", "draft"].includes(r.status) &&
      ((record.vehicle_id && r.vehicle_id === record.vehicle_id) ||
        (record.driver_id && r.driver_id === record.driver_id)),
  );
  return (
    <p className="notice">
      {trips.error || bookings.error
        ? "Availability check unavailable. Review the schedule before confirming."
        : trips.loading || bookings.loading
          ? "Checking same-day assignments…"
          : conflicts.length
            ? `Possible conflict: ${conflicts.map((r) => r.name).join(", ")} uses this vehicle or driver on the same date. Confirm the times before saving.`
            : "No same-day conflicts found in the checked records. This is a warning check, not a reservation guarantee."}
      {trips.count > 100 || bookings.count > 100
        ? " Only the latest 100 records per category were checked."
        : ""}
    </p>
  );
}
