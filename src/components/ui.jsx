import React, { useEffect, useRef, useState } from "react";
import {
  X,
  ArrowRight,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { useApp, useList, useDebounce } from "../lib/context";
export function Button({ children, variant = "", className = "", ...props }) {
  const combinedClassName = ["btn", variant, className].filter(Boolean).join(" ");
  return (
    <button className={combinedClassName} {...props}>
      {children}
    </button>
  );
}
export function Badge({ children }) {
  return (
    <span className={"badge " + String(children).replaceAll(" ", "-")}>
      {children}
    </span>
  );
}
export function PageHeader({
  eyebrow = "YOUR WORKSPACE",
  title,
  subtitle,
  children,
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Empty({
  title = "Nothing here yet",
  text = "Add your first record to get started.",
  children,
}) {
  return (
    <div className="empty">
      <Inbox size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="skeleton" aria-label="Loading" role="status">
      <div />
      <div />
      <div />
    </div>
  );
}
export function ErrorBox({ message }) {
  const { refresh } = useApp();
  return (
    <div className="error" role="alert">
      {message}
      <Button variant="secondary" onClick={refresh}>
        Retry
      </Button>
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Search records…",
}) {
  return (
    <label className="search">
      <Search size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Pagination({ page, setPage, count }) {
  return (
    <div className="pagination">
      <span>
        {count} records · Page {page + 1}
      </span>
      <Button
        variant="icon secondary"
        aria-label="Previous page"
        disabled={!page}
        onClick={() => setPage(page - 1)}
      >
        <ChevronLeft size={18} />
      </Button>
      <Button
        variant="icon secondary"
        aria-label="Next page"
        disabled={(page + 1) * 20 >= count}
        onClick={() => setPage(page + 1)}
      >
        <ChevronRight size={18} />
      </Button>
    </div>
  );
}
export function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
    const dialog = ref.current;
    const close = (e) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", close);
    return () => dialog.removeEventListener("cancel", close);
  }, [onClose]);
  return (
    <dialog ref={ref} className="modal" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <Button
          variant="icon secondary"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </Button>
      </header>
      {children}
    </dialog>
  );
}
export function Field({ label, children, error }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="text-red-700">{error}</small>}
    </label>
  );
}
export function Lookup({ table, value, onChange, required = false }) {
  const [search, setSearch] = useState("");
  const { rows } = useList(table, { search: useDebounce(search), limit: 30 });
  const [selected, setSelected] = useState(null);
  const { api } = useApp();
  useEffect(() => {
    if (value)
      api
        .get(table, value)
        .then(setSelected)
        .catch(() => setSelected(null));
    else setSelected(null);
  }, [value, table, api]);
  const options =
    selected && !rows.some((r) => r.id === selected.id)
      ? [selected, ...rows]
      : rows;
  return (
    <div className="lookup">
      <input
        aria-label={"Search " + table}
        placeholder={"Find " + table.replace("_", " ") + "…"}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        aria-label={"Select " + table}
        value={value || ""}
        required={required}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Choose {table.replace("_", " ")}</option>
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name || r.origin + " → " + r.destination}
          </option>
        ))}
      </select>
    </div>
  );
}
export function RecordName({ table, id }) {
  const { api } = useApp(),
    [name, setName] = useState("—");
  useEffect(() => {
    let active = true;
    if (id)
      api
        .get(table, id)
        .then((r) => active && setName(r.name))
        .catch(() => active && setName("Unavailable"));
    return () => {
      active = false;
    };
  }, [api, table, id]);
  return name;
}
export function Stat({ label, value, foot, icon: Icon }) {
  return (
    <div className="stat">
      <div className="stat-label">
        {label}
        {Icon && <Icon size={19} />}
      </div>
      <strong>{value}</strong>
      <small>{foot}</small>
    </div>
  );
}
