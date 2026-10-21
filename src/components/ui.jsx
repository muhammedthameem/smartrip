import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ArrowRight,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { useApp, useList } from "../lib/context";
import { modules } from "../lib/schema";
import { minor } from "../lib/calculations";
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
    const dialog = ref.current;
    if (!dialog) return;
    try {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
    } catch {
      dialog.setAttribute("open", "");
    }
    const close = (e) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", close);
    return () => dialog.removeEventListener("cancel", close);
  }, [onClose]);
  return createPortal(
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
    </dialog>,
    document.body,
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
export function Lookup({
  table,
  value,
  onChange,
  required = false,
  allowCreate = false,
}) {
  const { rows } = useList(table, { limit: 30 });
  const [selected, setSelected] = useState(null);
  const { api, refresh, notify } = useApp();
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(null);
  const [createError, setCreateError] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const config = modules[table];
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
  const singular = config?.singular || table.replace("_", " ").replace(/s$/, "");
  const canCreate = allowCreate && !!config;

  function openCreate() {
    setCreateError("");
    const draft = { request_key: crypto.randomUUID() };
    for (const [k, , type, opts] of config.fields) {
      draft[k] = type === "select" ? opts[0] : "";
    }
    setCreateForm(draft);
    setCreating(true);
  }

  function closeCreate() {
    if (createBusy) return;
    setCreating(false);
    setCreateForm(null);
    setCreateError("");
  }

  async function saveNew() {
    setCreateBusy(true);
    setCreateError("");
    try {
      const row = { ...createForm };
      for (const [k, label, , opts] of config.fields) {
        if (opts === true && !String(row[k] ?? "").trim())
          throw new Error(label + " is required.");
      }
      for (const [k, , type] of config.fields) {
        if (type === "money") row[k] = minor(row[k]);
        else if (["number", "decimal"].includes(type))
          row[k] = row[k] === "" ? null : Number(row[k]);
        else if (row[k] === "") row[k] = null;
        else if (typeof row[k] === "string") row[k] = row[k].trim();
      }
      const saved = await api.save(table, row);
      refresh();
      notify(`${singular[0].toUpperCase()}${singular.slice(1)} added`);
      onChange(saved.id);
      setCreating(false);
      setCreateForm(null);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateBusy(false);
    }
  }

  const setCreateField = (k, v) =>
    setCreateForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="lookup">
      <div className="lookup-select-row">
        <select
          aria-label={"Select " + table}
          value={value || ""}
          required={required}
          onChange={(e) => {
            if (e.target.value === "__new__") {
              openCreate();
              return;
            }
            onChange(e.target.value || null);
          }}
        >
          <option value="">Choose {table.replace("_", " ")}</option>
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name || r.origin + " → " + r.destination}
            </option>
          ))}
          {canCreate && (
            <option value="__new__">＋ Add new {singular}…</option>
          )}
        </select>
        {canCreate && (
          <Button
            type="button"
            variant="secondary"
            className="lookup-add-btn"
            onClick={openCreate}
          >
            <Plus size={16} /> New
          </Button>
        )}
      </div>
      {creating && createForm && (
          <Modal title={"Add " + singular} onClose={closeCreate}>
            <div className="form-grid">
              {config.fields.map(([k, label, type, opts]) => (
                <Field key={k} label={label + (opts === true ? " *" : "")}>
                  {type === "select" ? (
                    <select
                      value={createForm[k] || opts[0]}
                      onChange={(e) => setCreateField(k, e.target.value)}
                    >
                      {opts.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : type === "textarea" ? (
                    <textarea
                      value={createForm[k] || ""}
                      onChange={(e) => setCreateField(k, e.target.value)}
                    />
                  ) : (
                    <input
                      type={
                        ["money", "decimal"].includes(type) ? "number" : type
                      }
                      min={
                        ["number", "decimal", "money"].includes(type)
                          ? 0
                          : undefined
                      }
                      step={
                        ["money", "decimal"].includes(type) ? ".01" : undefined
                      }
                      value={createForm[k] ?? ""}
                      onChange={(e) => setCreateField(k, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !createBusy) saveNew();
                      }}
                    />
                  )}
                </Field>
              ))}
            </div>
            {createError && (
              <p role="alert" className="error">
                {createError}
              </p>
            )}
            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={createBusy}
                onClick={closeCreate}
              >
                Cancel
              </Button>
              <Button type="button" disabled={createBusy} onClick={saveNew}>
                {createBusy ? "Saving…" : "Add " + singular}
              </Button>
            </div>
          </Modal>
        )}
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
