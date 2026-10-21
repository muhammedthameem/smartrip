import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Printer, Trash2 } from "lucide-react";
import { useApp, useList, useDebounce } from "../lib/context";
import {
  minor,
  money,
  today,
  invoiceTotal,
  balanceFor,
  invoiceStatus,
} from "../lib/calculations";
import {
  PageHeader,
  Button,
  Modal,
  Field,
  Lookup,
  SearchBox,
  Loading,
  Empty,
  ErrorBox,
  Pagination,
  Badge,
  RecordName,
} from "../components/ui";
import PrintDocument from "../components/PrintDocument";
import { useConfirm } from "../components/Confirm";
export default function Finance({ table }) {
  const confirm = useConfirm(),
    invoiceMode = table === "invoices",
    { api, refresh, notify, version } = useApp(),
    [params] = useSearchParams(),
    [edit, setEdit] = useState(null),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [print, setPrint] = useState(null),
    [paymentRows, setPaymentRows] = useState([]);
  const {
    rows,
    count,
    loading,
    error: loadError,
  } = useList(table, { page, search: useDebounce(search) });
  const [balances, setBalances] = useState({});
  const ids = rows.map((r) => r.id).join(",");
  useEffect(() => {
    if (invoiceMode)
      api
        .invoiceBalances(ids ? ids.split(",") : [])
        .then((result) =>
          setBalances(Object.fromEntries(result.map((r) => [r.id, r]))),
        )
        .catch((e) => notify(e.message));
  }, [api, ids, version, invoiceMode]);
  function status(r) {
    const b = balances[r.id];
    return r.status === "cancelled"
      ? "cancelled"
      : !b
        ? r.status
        : b.balance_minor === 0
          ? "paid"
          : b.paid_minor > 0
            ? "partially paid"
            : r.due_date < today()
              ? "overdue"
              : "issued";
  }
  async function open() {
    setError("");
    if (!invoiceMode) {
      setEdit({
        request_key: crypto.randomUUID(),
        name: "Payment received",
        date: today(),
        invoice_id: params.get("invoice") || "",
        amount: "",
        kind: "payment",
        method: "UPI",
        reference: "",
        notes: "",
      });
      return;
    }
    let initial = {
      request_key: crypto.randomUUID(),
      trip_id: params.get("trip") || "",
      client_id: "",
      date: today(),
      due_date: today(),
      items: [{ description: "Trip charge", quantity: 1, unit_minor: 0 }],
      discount: "0",
      tax: "0",
      status: "issued",
      notes: "",
    };
    if (initial.trip_id) {
      try {
        const trip = await api.get("trips", initial.trip_id);
        let quantity = 1;
        if (trip.pricing === "per km") {
          if (trip.closing_km == null)
            throw new Error(
              "Complete odometer readings before distance billing.",
            );
          quantity = trip.closing_km - trip.opening_km;
        }
        if (trip.pricing === "per hour") {
          if (!trip.start_time || !trip.end_time)
            throw new Error(
              "Complete actual start and end time before hourly billing.",
            );
          quantity =
            Math.round(
              (new Date(trip.end_time) - new Date(trip.start_time)) / 36000,
            ) / 100;
        }
        initial = {
          ...initial,
          client_id: trip.client_id,
          items: [
            {
              description:
                trip.origin +
                " → " +
                trip.destination +
                " (" +
                trip.pricing +
                ")",
              quantity,
              unit_minor: trip.rate_minor || 0,
            },
          ],
        };
      } catch (e) {
        notify(e.message);
        return;
      }
    }
    setEdit(initial);
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let row;
      if (invoiceMode) {
        const { discount, tax, ...rest } = edit;
        row = { ...rest, discount_minor: minor(discount), tax_bps: minor(tax) };
        row.total_minor = invoiceTotal(
          row.items,
          row.discount_minor,
          row.tax_bps,
        ).total;
        if (row.total_minor <= 0)
          throw new Error("Invoice total must be positive.");
      } else {
        const { amount, ...rest } = edit;
        row = { ...rest, amount_minor: minor(amount) };
      }
      await api.save(table, row);
      refresh();
      setEdit(null);
      notify(invoiceMode ? "Invoice issued" : "Payment recorded");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function showPrint(row) {
    try {
      let payments = [];
      if (invoiceMode) {
        const result = await api.list("payments", {
          filters: { invoice_id: row.id },
          limit: 1000,
        });
        if (result.count > 1000)
          throw new Error(
            "Payment history exceeds preview limit. Export from the database for reconciliation.",
          );
        payments = result.rows;
      }
      setPaymentRows(payments);
      setPrint(row);
    } catch (e) {
      notify(e.message);
    }
  }
  async function cancel(row) {
    const ok = await confirm({
      title: "Cancel this invoice?",
      message: "Cancel invoice " + row.name + "?",
      detail:
        "This requires zero net payments and cannot be undone here. Remove linked payments or refunds first.",
      confirmLabel: "Cancel invoice",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const { rows: payments } = await api.list("payments", {
        filters: { invoice_id: row.id },
        limit: 1000,
      });
      if (
        payments.reduce(
          (s, p) => s + (p.kind === "refund" ? -1 : 1) * p.amount_minor,
          0,
        ) !== 0
      )
        throw new Error("Refund payments before cancelling this invoice.");
      await api.save("invoices", { ...row, status: "cancelled" });
      refresh();
      notify("Invoice cancelled");
    } catch (e) {
      notify(e.message);
    }
  }
  return (
    <>
      <PageHeader
        title={invoiceMode ? "Invoices" : "Payments"}
        subtitle={
          invoiceMode
            ? "Clear bills. Confident collections."
            : "Every payment, connected to its invoice."
        }
      >
        <Button onClick={open}>
          <Plus size={18} />
          {invoiceMode ? "Create invoice" : "Record payment"}
        </Button>
      </PageHeader>
      <div className="notice">
        {invoiceMode
          ? "Issued invoices are immutable. Cancel an unpaid invoice and issue a replacement to correct it."
          : "Offline payment recording only. Refunds are separate audit records; online payment processing is not configured."}
      </div>
      <section className="panel">
        <div className="toolbar">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(0);
            }}
          />
        </div>
        {loading ? (
          <Loading />
        ) : loadError ? (
          <ErrorBox message={loadError} />
        ) : !rows.length ? (
          <Empty title={invoiceMode ? "No invoices yet" : "No payments yet"} />
        ) : (
          <div className="record-grid">
            {rows.map((r) => (
              <article className="record-card" key={r.id}>
                <div className="record-top">
                  <div>
                    <h3>{r.name}</h3>
                    <small>{r.date}</small>
                  </div>
                  <Badge>{invoiceMode ? status(r) : r.kind}</Badge>
                </div>
                <strong className="record-amount">
                  {money(r.total_minor ?? r.amount_minor)}
                </strong>
                <p>
                  {invoiceMode && balances[r.id] && (
                    <>
                      Balance: <b>{money(balances[r.id].balance_minor)}</b>
                      <br />
                    </>
                  )}
                  {invoiceMode ? (
                    <RecordName table="clients" id={r.client_id} />
                  ) : (
                    <RecordName table="invoices" id={r.invoice_id} />
                  )}
                </p>
                <div className="card-actions">
                  <Button variant="text" onClick={() => showPrint(r)}>
                    <Printer size={16} />{" "}
                    {invoiceMode ? "View invoice" : "Receipt"}
                  </Button>
                  {invoiceMode && r.status !== "cancelled" && (
                    <Button variant="text" onClick={() => cancel(r)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <Pagination page={page} setPage={setPage} count={count} />
      </section>
      {edit && (
        <Modal
          title={invoiceMode ? "Create invoice" : "Record payment"}
          onClose={async () => {
            if (busy) return;
            const ok = await confirm({
              title: "Discard changes?",
              message: "Close this form? Unsaved changes will be lost.",
              confirmLabel: "Discard",
              tone: "warning",
            });
            if (ok) setEdit(null);
          }}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              {invoiceMode ? (
                <>
                  <Field label="Client *">
                    <Lookup
                      table="clients"
                      value={edit.client_id}
                      required
                      onChange={(v) => setEdit({ ...edit, client_id: v })}
                    />
                  </Field>
                  <Field label="Trip (optional)">
                    <Lookup
                      table="trips"
                      value={edit.trip_id}
                      onChange={(v) => setEdit({ ...edit, trip_id: v })}
                    />
                  </Field>
                  <Field label="Due date">
                    <input
                      type="date"
                      required
                      value={edit.due_date}
                      onChange={(e) =>
                        setEdit({ ...edit, due_date: e.target.value })
                      }
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Invoice *">
                    <Lookup
                      table="invoices"
                      value={edit.invoice_id}
                      required
                      onChange={(v) => setEdit({ ...edit, invoice_id: v })}
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      value={edit.kind}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          kind: e.target.value,
                          name:
                            e.target.value === "refund"
                              ? "Refund"
                              : "Payment received",
                        })
                      }
                    >
                      <option value="payment">Payment received</option>
                      <option value="refund">Refund</option>
                    </select>
                  </Field>
                  <Field label="Amount (INR) *">
                    <input
                      required
                      type="number"
                      min=".01"
                      step=".01"
                      inputMode="decimal"
                      value={edit.amount}
                      onChange={(e) =>
                        setEdit({ ...edit, amount: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Method">
                    <select
                      value={edit.method}
                      onChange={(e) =>
                        setEdit({ ...edit, method: e.target.value })
                      }
                    >
                      {["Cash", "UPI", "Bank transfer", "Card", "Other"].map(
                        (m) => (
                          <option key={m}>{m}</option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="Reference">
                    <input
                      value={edit.reference}
                      onChange={(e) =>
                        setEdit({ ...edit, reference: e.target.value })
                      }
                    />
                  </Field>
                </>
              )}
              <Field label="Date">
                <input
                  type="date"
                  required
                  value={edit.date}
                  onChange={(e) => setEdit({ ...edit, date: e.target.value })}
                />
              </Field>
              {invoiceMode && (
                <>
                  <div className="full line-items">
                    <h3>Line items</h3>
                    {edit.items.map((item, i) => (
                      <div className="item-row" key={i}>
                        <Field label="Description">
                          <input
                            required
                            value={item.description}
                            onChange={(e) =>
                              setEdit({
                                ...edit,
                                items: edit.items.map((r, j) =>
                                  i === j
                                    ? { ...r, description: e.target.value }
                                    : r,
                                ),
                              })
                            }
                          />
                        </Field>
                        <Field label="Quantity">
                          <input
                            type="number"
                            min=".01"
                            step=".01"
                            required
                            value={item.quantity}
                            onChange={(e) =>
                              setEdit({
                                ...edit,
                                items: edit.items.map((r, j) =>
                                  i === j
                                    ? { ...r, quantity: Number(e.target.value) }
                                    : r,
                                ),
                              })
                            }
                          />
                        </Field>
                        <Field label="Unit price (INR)">
                          <input
                            type="number"
                            min="0"
                            step=".01"
                            required
                            value={item.unit_minor / 100}
                            onChange={(e) => {
                              try {
                                const value = minor(e.target.value || 0);
                                setEdit({
                                  ...edit,
                                  items: edit.items.map((r, j) =>
                                    i === j ? { ...r, unit_minor: value } : r,
                                  ),
                                });
                              } catch {}
                            }}
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="icon secondary"
                          disabled={edit.items.length === 1}
                          aria-label={"Remove item " + (i + 1)}
                          onClick={() =>
                            setEdit({
                              ...edit,
                              items: edit.items.filter((_, j) => i !== j),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setEdit({
                          ...edit,
                          items: [
                            ...edit.items,
                            { description: "", quantity: 1, unit_minor: 0 },
                          ],
                        })
                      }
                    >
                      <Plus size={16} /> Add charge
                    </Button>
                  </div>
                  <Field label="Discount (INR)">
                    <input
                      type="number"
                      min="0"
                      step=".01"
                      required
                      value={edit.discount}
                      onChange={(e) =>
                        setEdit({ ...edit, discount: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Tax (%) — only if applicable">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step=".01"
                      required
                      value={edit.tax}
                      onChange={(e) =>
                        setEdit({ ...edit, tax: e.target.value })
                      }
                    />
                  </Field>
                </>
              )}
              <Field label="Notes">
                <textarea
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </Field>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <Button disabled={busy}>
                {busy
                  ? "Saving…"
                  : invoiceMode
                    ? "Issue invoice"
                    : "Record payment"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {print && (
        <Modal
          title={invoiceMode ? "Invoice preview" : "Payment receipt"}
          onClose={() => setPrint(null)}
        >
          <PrintDocument
            kind={invoiceMode ? "invoice" : "receipt"}
            record={print}
            payments={paymentRows}
          />
        </Modal>
      )}
    </>
  );
}
