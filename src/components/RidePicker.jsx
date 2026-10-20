import React, { useMemo, useState } from "react";
import { Search, X, ChevronRight, ChevronDown, AlertTriangle, Sparkles, CarFront } from "lucide-react";

// ---------- helpers ----------
const DAY = 86400000;
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const parseDate = (s) => {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};
const dayDiff = (s) => {
  const d = parseDate(s);
  if (!d) return null;
  return Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
};
const relativeDay = (s) => {
  const diff = dayDiff(s);
  if (diff == null) return "No date";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < -1 && diff > -7) return `${-diff} days ago`;
  return parseDate(s).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export const rideKind = (item) => {
  if (item.item_type === "booking") return "booking";
  if (item.status === "in progress") return "active";
  if (item.status === "completed") return "completed";
  return "planned";
};

const missingFor = (item) => {
  if (rideKind(item) === "completed") return [];
  const m = [];
  if (!item.client_id && !item.client) m.push("client");
  if (!item.vehicle_id && !item.vehicle) m.push("vehicle");
  if (item.item_type !== "booking" && !item.driver_id && !item.driver) m.push("driver");
  if (!String(item.origin || "").trim()) m.push("pickup");
  if (!String(item.destination || "").trim()) m.push("destination");
  return m;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "planned", label: "Planned" },
  { key: "booking", label: "Bookings" },
  { key: "completed", label: "Done" },
];

const matches = (item, q) => {
  if (!q) return true;
  const hay = [
    item.name,
    item.package_name,
    item.client?.name,
    item.origin,
    item.destination,
    item.vehicle?.name,
    item.vehicle?.registration,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
};

// Group items by urgency so the driver sees what matters first
const groupItems = (items) => {
  const groups = { now: [], today: [], attention: [], upcoming: [], completed: [] };
  for (const it of items) {
    const kind = rideKind(it);
    const diff = dayDiff(it.date);
    if (kind === "active") groups.now.push(it);
    else if (kind === "completed") groups.completed.push(it);
    else if (diff === 0) groups.today.push(it);
    else if (diff != null && diff < 0) groups.attention.push(it);
    else groups.upcoming.push(it);
  }
  const byDateAsc = (a, b) => (parseDate(a.date) || 0) - (parseDate(b.date) || 0);
  const byDateDesc = (a, b) => byDateAsc(b, a);
  groups.today.sort((a, b) => String(a.pickup_time || "").localeCompare(String(b.pickup_time || "")));
  groups.upcoming.sort(byDateAsc);
  groups.attention.sort(byDateDesc);
  groups.completed.sort(byDateDesc);
  return [
    { key: "now", title: "Driving now", items: groups.now },
    { key: "today", title: "Today", items: groups.today },
    { key: "attention", title: "Not started · past date", items: groups.attention },
    { key: "upcoming", title: "Upcoming", items: groups.upcoming },
    { key: "completed", title: "Completed", items: groups.completed, collapsible: true },
  ].filter((g) => g.items.length);
};

// ---------- row ----------
function RideRow({ item, isCurrent, isSuggested, onSelect }) {
  const kind = rideKind(item);
  const missing = missingFor(item);
  const rel = relativeDay(item.date);
  const action =
    kind === "active" ? "Open" : kind === "booking" ? "Start" : kind === "completed" ? "View" : "Open";
  const title = item.package_name || item.name || "Ride";
  const route = [item.origin, item.destination].filter(Boolean).join(" → ") || "Route not set";
  const meta = [item.client?.name, item.vehicle?.name, item.pickup_time].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      id={`ride-row-${item.id}`}
      className={`ride-row kind-${kind} ${isCurrent ? "is-current" : ""}`}
      onClick={() => onSelect(item)}
    >
      <span className="ride-row-bar" aria-hidden="true" />
      <span className="ride-row-main">
        <span className="ride-row-top">
          {kind === "active" && <span className="pulsing-dot" />}
          <span className="ride-row-title">{title}</span>
          {isCurrent ? (
            <span className="ride-chip current">Current</span>
          ) : isSuggested ? (
            <span className="ride-chip suggested">
              <Sparkles size={10} /> Next
            </span>
          ) : null}
        </span>
        <span className="ride-row-route">{route}</span>
        <span className="ride-row-meta">
          <span className={`ride-when ${dayDiff(item.date) === 0 ? "today" : ""}`}>{rel}</span>
          {meta && <span className="ride-row-meta-text">{meta}</span>}
        </span>
        {missing.length > 0 && kind !== "active" && (
          <span className="ride-row-warn">
            <AlertTriangle size={11} /> Add {missing.join(", ")} before starting
          </span>
        )}
      </span>
      <span className="ride-row-action">
        <span>{action}</span>
        <ChevronRight size={15} />
      </span>
    </button>
  );
}

// ---------- picker ----------
export default function RidePicker({ items = [], currentId = null, onSelect, variant = "page" }) {
  const counts = useMemo(() => {
    const c = { all: items.length, active: 0, planned: 0, booking: 0, completed: 0 };
    items.forEach((i) => (c[rideKind(i)] += 1));
    return c;
  }, [items]);

  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(items.length > 8);
  const [showDone, setShowDone] = useState(false);

  const visible = useMemo(
    () => items.filter((i) => (filter === "all" || rideKind(i) === filter) && matches(i, query.trim())),
    [items, filter, query]
  );
  const groups = useMemo(() => groupItems(visible), [visible]);

  // Suggest the most relevant item to open next
  const suggestedId = useMemo(() => {
    const g = groupItems(items);
    const first = g.find((x) => x.key !== "completed");
    return first?.items[0]?.id || null;
  }, [items]);

  const filters = FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0);
  const onlyOneGroup = groups.length === 1 || filter !== "all";

  return (
    <div className={`ride-picker ride-picker--${variant}`}>
      <div className="ride-picker-controls">
        {searchOpen ? (
          <div className="ride-search">
            <Search size={15} />
            <input
              id="ride-picker-search"
              type="search"
              autoFocus={items.length <= 8}
              placeholder="Search customer, place, vehicle…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className="ride-icon-btn"
              aria-label="Close search"
              onClick={() => {
                setQuery("");
                setSearchOpen(false);
              }}
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <div className="ride-filter-row">
            <div className="ride-filters" role="tablist" aria-label="Filter rides">
              {filters.map((f) => (
                <button
                  key={f.key}
                  id={`ride-filter-${f.key}`}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  className={`ride-filter kind-${f.key} ${filter === f.key ? "active" : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.key !== "all" && <span className="ride-filter-dot" />}
                  {f.label}
                  <span className="ride-filter-count">{counts[f.key]}</span>
                </button>
              ))}
            </div>
            {items.length > 3 && (
              <button
                type="button"
                id="ride-picker-search-toggle"
                className="ride-icon-btn"
                aria-label="Search rides"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="ride-picker-list">
        {groups.length === 0 ? (
          <div className="ride-empty">
            <CarFront size={26} />
            <b>{items.length ? "Nothing matches" : "No rides assigned yet"}</b>
            <span>
              {items.length
                ? "Try another filter or clear the search."
                : "New trips and bookings will appear here automatically."}
            </span>
          </div>
        ) : (
          groups.map((g) => {
            const collapsed = g.collapsible && filter === "all" && !showDone && !query;
            return (
              <section key={g.key} className="ride-group">
                {!onlyOneGroup &&
                  (g.collapsible ? (
                    <button
                      type="button"
                      className="ride-group-title as-toggle"
                      onClick={() => setShowDone((v) => !v)}
                    >
                      {g.title} <span>{g.items.length}</span>
                      <ChevronDown size={14} className={collapsed ? "" : "rot"} />
                    </button>
                  ) : (
                    <h3 className={`ride-group-title group-${g.key}`}>
                      {g.title} <span>{g.items.length}</span>
                    </h3>
                  ))}
                {!collapsed &&
                  g.items.map((item) => (
                    <RideRow
                      key={item.id}
                      item={item}
                      isCurrent={currentId === item.id}
                      isSuggested={!currentId && suggestedId === item.id}
                      onSelect={onSelect}
                    />
                  ))}
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
