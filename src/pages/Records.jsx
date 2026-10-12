import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Archive, ArrowRight, Download } from "lucide-react";
import { modules } from "../lib/schema";
import { suggestCategory } from "../lib/intelligence";
import { useApp, useList, useDebounce } from "../lib/context";
import { minor, money, today, downloadCsv } from "../lib/calculations";
import {
  Button,
  PageHeader,
  SearchBox,
  Pagination,
  Empty,
  Loading,
  ErrorBox,
  Modal,
  Field,
  Lookup,
  Badge,
} from "../components/ui";
import ScheduleNotice from "../components/ScheduleNotice";
export default function Records({ table }) {
  const config = modules[table],
    { api, refresh, notify } = useApp(),
    navigate = useNavigate(),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [edit, setEdit] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const {
    rows,
    count,
    loading,
    error: loadError,
  } = useList(table, { page, search: useDebounce(search) });
  function open(row) {
    setError("");
    setEdit(
      row
        ? { ...row }
        : {
            request_key: crypto.randomUUID(),
            ...Object.fromEntries(
              config.fields.map(([k, l, type, opts]) => [
                k,
                type === "date" && k === "date"
                  ? today()
                  : type === "select"
                    ? opts[0]
                    : "",
              ]),
            ),
          },
    );
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const row = { ...edit };
      for (const [k, l, type] of config.fields) {
        if (type === "money") row[k] = minor(row[k]);
        else if (["number", "decimal"].includes(type))
          row[k] = row[k] === "" ? null : Number(row[k]);
        else if (row[k] === "") row[k] = null;
      }
      await api.save(table, row);
      refresh();
      setEdit(null);
      notify("Saved successfully");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function archive(row) {
    if (
      !confirm("Archive " + row.name + "? Historical links will be preserved.")
    )
      return;
    try {
      await api.archive(table, row.id);
      refresh();
      notify("Record archived");
    } catch (e) {
      notify(e.message);
    }
  }
  async function convert(row) {
    setBusy(true);
    try {
      const trip = await api.convertBooking(row);
      refresh();
      navigate("/trips/" + trip.id + "/edit");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader title={config.title} subtitle={config.subtitle}>
        <Button onClick={() => open()}>
          <Plus size={18} /> Add {config.singular}
        </Button>
      </PageHeader>
      {table === "fuel_logs" && (
        <div className="notice">
          Fuel logs are tracking records. Enter the cost under Expenses for
          financial reports; fuel logs are not added again.
        </div>
      )}
      {table === "maintenance" && (
        <div className="notice">
          Service costs are included separately in operating reports. Do not
          enter the same service cost again as an expense.
        </div>
      )}
      <section className="panel">
        <div className="toolbar">
          <SearchBox
            value={search}
            onChange={(s) => {
              setSearch(s);
              setPage(0);
            }}
          />
          <Button
            variant="secondary"
            disabled={!rows.length}
            onClick={() => downloadCsv(rows, table + "-page-" + (page + 1))}
          >
            <Download size={16} /> Export page
          </Button>
        </div>
        {loading ? (
          <Loading />
        ) : loadError ? (
          <ErrorBox message={loadError} />
        ) : !rows.length ? (
          <Empty
            title={"No " + config.title.toLowerCase() + " found"}
            text="Create a record or adjust your search."
          />
        ) : (
          <div className="record-grid">
            {rows.map((r) => (
              <article className="record-card" key={r.id}>
                <div className="record-top">
                  <span className="record-initial">
                    {r.name?.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <h3>{r.name}</h3>
                    <small>
                      {r.date || r.model || r.phone || config.singular}
                    </small>
                  </div>
                  {r.status && <Badge>{r.status}</Badge>}
                </div>
                {r.amount_minor != null && (
                  <strong className="record-amount">
                    {money(r.amount_minor)}
                  </strong>
                )}
                <p>
                  {r.origin
                    ? r.origin + " → " + r.destination
                    : r.address ||
                      r.email ||
                      r.notes ||
                      r.license ||
                      r.vendor ||
                      r.category ||
                      "Ready to manage"}
                </p>
                <div className="card-actions">
                  <Button
                    variant="text"
                    onClick={() =>
                      open({
                        ...r,
                        ...Object.fromEntries(
                          config.fields
                            .filter((f) => f[2] === "money")
                            .map(([k]) => [k, String((r[k] || 0) / 100)]),
                        ),
                      })
                    }
                  >
                    <Pencil size={15} /> Edit
                  </Button>
                  {table === "bookings" && r.status !== "cancelled" && (
                    <Button
                      variant="text"
                      disabled={busy}
                      onClick={() => convert(r)}
                    >
                      {r.trip_id ? "Open trip" : "Create trip"}
                      <ArrowRight size={15} />
                    </Button>
                  )}
                  <Button
                    variant="icon ghost"
                    aria-label={"Archive " + r.name}
                    onClick={() => archive(r)}
                  >
                    <Archive size={16} />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
        <Pagination page={page} setPage={setPage} count={count} />
      </section>
      {edit && (
        <Modal
          title={(edit.id ? "Edit " : "New ") + config.singular}
          onClose={() => {
            if (
              !busy &&
              confirm("Close this form? Unsaved changes will be lost.")
            )
              setEdit(null);
          }}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              {config.fields.map(([k, label, type, opts]) => (
                <Field key={k} label={label + (opts === true ? " *" : "")}>
                  {["clients", "vehicles", "drivers", "trips"].includes(
                    type,
                  ) ? (
                    <Lookup
                      table={type}
                      value={edit[k]}
                      required={opts === true}
                      onChange={(v) => setEdit({ ...edit, [k]: v })}
                    />
                  ) : type === "select" ? (
                    <>
                      <select
                        value={edit[k] || opts[0]}
                        onChange={(e) =>
                          setEdit({ ...edit, [k]: e.target.value })
                        }
                      >
                        {opts.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                      {table === "expenses" &&
                        k === "category" &&
                        (() => {
                          const hint = suggestCategory(
                            (edit.name || "") + " " + (edit.notes || ""),
                          );
                          return hint !== "Other" &&
                            hint !== (edit.category || opts[0]) ? (
                            <span className="category-hint">
                              Suggested: {hint}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setEdit({ ...edit, category: hint });
                                }}
                              >
                                Use
                              </button>
                            </span>
                          ) : null;
                        })()}
                    </>
                  ) : type === "textarea" ? (
                    <textarea
                      value={edit[k] || ""}
                      onChange={(e) =>
                        setEdit({ ...edit, [k]: e.target.value })
                      }
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
                      inputMode={
                        ["number", "decimal", "money"].includes(type)
                          ? "decimal"
                          : undefined
                      }
                      required={opts === true}
                      value={edit[k] ?? ""}
                      onChange={(e) =>
                        setEdit({ ...edit, [k]: e.target.value })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
            {table === "bookings" && <ScheduleNotice record={edit} />}{" "}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save " + config.singular}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
