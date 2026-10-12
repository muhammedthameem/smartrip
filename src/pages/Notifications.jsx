import React from "react";
import { Link } from "react-router-dom";
import { useList } from "../lib/context";
import { today } from "../lib/calculations";
import { PageHeader, Empty, Loading, ErrorBox } from "../components/ui";
export default function Notifications() {
  const vehicles = useList("vehicles", { limit: 100 }),
    drivers = useList("drivers", { limit: 100 }),
    maintenance = useList("maintenance", { limit: 100 });
  const date = today(),
    items = [
      ...vehicles.rows
        .filter((r) => r.expiry_date && r.expiry_date <= date)
        .map((r) => ({
          title: r.name + " · vehicle document expired",
          path: "/vehicles",
        })),
      ...drivers.rows
        .filter((r) => r.expiry_date && r.expiry_date <= date)
        .map((r) => ({
          title: r.name + " · driver licence expired",
          path: "/drivers",
        })),
      ...maintenance.rows
        .filter((r) => r.next_date && r.next_date <= date)
        .map((r) => ({
          title: r.name + " · service date due",
          path: "/maintenance",
        })),
    ];
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Simple, rule-based reminders for your workspace."
      />
      <div className="notice">
        Checks the most recent 100 records in each category. External delivery
        is not configured.
      </div>
      <section className="panel padded">
        {[vehicles, drivers, maintenance].some((r) => r.loading) ? (
          <Loading />
        ) : [vehicles, drivers, maintenance].some((r) => r.error) ? (
          <ErrorBox message="Could not load reminders" />
        ) : items.length ? (
          items.map((i, n) => (
            <Link className="list-row" key={n} to={i.path}>
              {i.title}
              <span>Review →</span>
            </Link>
          ))
        ) : (
          <Empty
            title="Nothing needs your attention"
            text="No overdue documents or service dates in the records checked."
          />
        )}
      </section>
    </>
  );
}
