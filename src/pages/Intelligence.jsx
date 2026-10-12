import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ScanLine,
  Mic,
  MessageCircleQuestion,
  Lightbulb,
  BarChart3,
  Sparkles,
  Cpu,
  AlertTriangle,
  Check,
} from "lucide-react";
import { useApp } from "../lib/context";
import { askAI, fileData } from "../lib/ai";
import {
  insights,
  suggestCategory,
  expenseCategories,
  parseEntry,
  answerLocally,
  categoryFixes,
  unusualCosts,
} from "../lib/intelligence";
import { today, money, minor } from "../lib/calculations";
import {
  PageHeader,
  Button,
  Field,
  Lookup,
  ErrorBox,
  RecordName,
  Stat,
} from "../components/ui";

const TABS = [
  ["Scan documents", ScanLine],
  ["Voice entry", Mic],
  ["Ask assistant", MessageCircleQuestion],
  ["Suggestions", Lightbulb],
  ["Business insights", BarChart3],
];
const QUICK_QUESTIONS = [
  "Which clients still owe money?",
  "What did each vehicle cost?",
  "Which trips were most profitable?",
  "How much did we spend by category?",
  "Are there any unusual costs?",
];

export default function Intelligence() {
  const { api, demo, notify, refresh } = useApp();
  const [tab, setTab] = useState("Scan documents"),
    [text, setText] = useState(""),
    [file, setFile] = useState(null),
    [preview, setPreview] = useState(""),
    [draft, setDraft] = useState(null),
    [answer, setAnswer] = useState(""),
    [source, setSource] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [listening, setListening] = useState(false),
    [ready, setReady] = useState(null),
    [from, setFrom] = useState(today().slice(0, 8) + "01"),
    [to, setTo] = useState(today()),
    [summary, setSummary] = useState(null),
    [review, setReview] = useState(null),
    [trip, setTrip] = useState(null),
    [vehicle, setVehicle] = useState(null),
    [client, setClient] = useState(null),
    [reading, setReading] = useState("opening_km"),
    [confirmed, setConfirmed] = useState(false),
    [saved, setSaved] = useState(null),
    [entities, setEntities] = useState({ clients: [], vehicles: [] });
  const recognition = useRef(null),
    requestKey = useRef(crypto.randomUUID());

  useEffect(() => {
    let active = true;
    setReady(null);
    askAI(demo, { action: "status" })
      .then((r) => active && setReady(!!r.ready))
      .catch(() => active && setReady(false));
    Promise.all([
      api.list("clients", { limit: 500 }),
      api.list("vehicles", { limit: 500 }),
    ])
      .then(([c, v]) => active && setEntities({ clients: c.rows, vehicles: v.rows }))
      .catch(() => {});
    return () => {
      active = false;
      recognition.current?.abort();
    };
  }, [demo, api]);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function reset() {
    setError("");
    setAnswer("");
    setSource("");
    setDraft(null);
    setSaved(null);
    setConfirmed(false);
  }

  function openDraft(d, origin) {
    // AI never infers record IDs; match names from the transcript on the device instead.
    const matched = text ? parseEntry(text, today(), entities) : {};
    setDraft({ ...d, warnings: d.warnings || [] });
    setClient(d.client_id || matched.client_id || null);
    setVehicle(d.vehicle_id || matched.vehicle_id || null);
    setTrip(null);
    setSource(origin);
  }

  async function report() {
    if (!from || !to || from > to) throw new Error("Choose a valid date range.");
    return api.report(from, to);
  }

  async function run(action) {
    setBusy(true);
    reset();
    requestKey.current = crypto.randomUUID();
    try {
      if (!ready) {
        // On-device fallback: deterministic, no data leaves the browser.
        if (action === "scan")
          throw new Error(
            "Document scanning needs the AI server. Deploy the smarttrip-ai function with an OpenAI key (see AI_SETUP.md), or type the details in Voice entry.",
          );
        if (action === "draft" || action === "category") {
          openDraft(parseEntry(text, today(), entities), "local");
        } else {
          setAnswer(
            answerLocally(
              action === "insights" ? "" : text,
              await report(),
              { ...entities, from, to },
            ),
          );
          setSource("local");
        }
        return;
      }
      const result = await askAI(demo, {
        action,
        text,
        from,
        to,
        ...(action === "scan" ? { file: await fileData(file) } : {}),
      });
      if (result.draft) openDraft(result.draft, "ai");
      else {
        setAnswer(result.answer);
        setSource("ai");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function speak() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      setError(
        "Voice dictation is unavailable in this browser. Use your keyboard microphone or type the description.",
      );
      return;
    }
    const r = new Speech();
    recognition.current = r;
    r.lang = "en-IN";
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      let addition = "";
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal) addition += e.results[i][0].transcript + " ";
      setText((t) => (t + " " + addition).trim().slice(0, 4000));
    };
    r.onerror = (e) => {
      setError(
        e.error === "not-allowed"
          ? "Microphone permission was denied. Allow it in the browser, or type instead."
          : "Dictation stopped: " + e.error + ". You can still type.",
      );
      setListening(false);
    };
    r.onend = () => setListening(false);
    try {
      r.start();
      setListening(true);
      setError("");
    } catch {
      setError("Microphone could not start. Check browser permission.");
    }
  }

  async function loadInsights() {
    setBusy(true);
    reset();
    setSummary(null);
    try {
      setSummary(insights(await report()));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadReview() {
    setBusy(true);
    reset();
    setReview(null);
    try {
      const data = await report();
      const expenses = data.expenses || [];
      setReview({
        fixes: categoryFixes(expenses),
        warnings: unusualCosts(expenses),
        count: expenses.length,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function applyCategory(fix) {
    setBusy(true);
    setError("");
    try {
      const row = await api.get("expenses", fix.id);
      await api.save("expenses", { ...row, category: fix.suggested });
      setReview((r) => ({ ...r, fixes: r.fixes.filter((f) => f.id !== fix.id) }));
      refresh();
      notify(`${fix.name} → ${fix.suggested}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!confirmed)
        throw new Error("Review the original and confirm the details first.");
      let row, table;
      if (draft.kind === "expense") {
        table = "expenses";
        row = {
          name: draft.name,
          date: draft.date,
          amount_minor: minor(draft.amount),
          category: draft.category || "Other",
          notes: draft.notes || "",
          trip_id: trip,
          vehicle_id: vehicle,
          request_key: requestKey.current,
        };
      } else if (draft.kind === "trip") {
        table = "trips";
        row = {
          date: draft.date,
          origin: draft.origin || "",
          destination: draft.destination || "",
          notes: draft.notes || "",
          opening_km: draft.opening_km ?? null,
          closing_km: draft.closing_km ?? null,
          client_id: client,
          vehicle_id: vehicle,
          status: "draft",
          pricing: "fixed",
          rate_minor: 0,
          places: [],
          request_key: requestKey.current,
        };
      } else {
        if (!trip) throw new Error("Choose a trip to update.");
        table = "trips";
        const original = await api.get("trips", trip);
        if (original[reading] != null)
          throw new Error(
            "This reading already exists. Edit the trip to change it.",
          );
        if (draft.opening_km == null || draft.opening_km === "")
          throw new Error("Enter the visible reading.");
        row = { ...original, [reading]: Number(draft.opening_km) };
      }
      const record = await api.save(table, row);
      setSaved({ table, id: record.id });
      setDraft(null);
      setText("");
      refresh();
      notify(
        table === "expenses" ? "Reviewed expense saved" : "Reviewed trip saved",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setConfirmed(false);
  };
  const vehicleName = (id) =>
    entities.vehicles.find((v) => v.id === id)?.name;
  const hint = text.trim() ? suggestCategory(text) : null;
  const periodTabs = ["Ask assistant", "Suggestions", "Business insights"];

  return (
    <>
      <PageHeader
        title="Smart assistant"
        subtitle="Less typing. Clearer records. You stay in control."
      />
      <div className={"ai-status " + (ready ? "on" : ready === false ? "off" : "")}>
        {ready ? <Sparkles size={18} /> : <Cpu size={18} />}
        <div>
          <b>
            {ready == null
              ? "Checking AI connection…"
              : ready
                ? "AI connected"
                : "On-device mode"}
          </b>
          <span>
            {ready
              ? "Scans, drafts and answers use the SmartTrip AI server. Everything is reviewed before saving."
              : "Voice entry, questions, suggestions and insights run on this device using your records. Document scanning needs the AI server. "}
            {!ready && <Link to="/settings">Connection settings</Link>}
          </span>
        </div>
      </div>
      <div className="ai-tabs" role="tablist" aria-label="Assistant tools">
        {TABS.map(([t, Icon]) => (
          <button
            key={t}
            id={"ai-tab-" + t.toLowerCase().replaceAll(" ", "-")}
            role="tab"
            aria-selected={tab === t}
            disabled={busy || listening}
            className={"btn " + (tab === t ? "" : "secondary")}
            onClick={() => {
              setTab(t);
              reset();
            }}
          >
            <Icon size={16} /> {t}
          </button>
        ))}
      </div>
      <section className="panel padded stack">
        <h2>{tab}</h2>
        {periodTabs.includes(tab) && (
          <div className="form-grid">
            <Field label="Records from">
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setSummary(null);
                  setReview(null);
                  setAnswer("");
                }}
              />
            </Field>
            <Field label="Records through">
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setSummary(null);
                  setReview(null);
                  setAnswer("");
                }}
              />
            </Field>
          </div>
        )}

        {tab === "Scan documents" && (
          <>
            <p>
              Extract a receipt, trip voucher or odometer reading. The selected
              file is sent to the AI server only when you choose Scan, and is
              not saved to the document inbox automatically.
            </p>
            <Field label="JPEG, PNG or PDF · up to 5 MB">
              <input
                id="ai-scan-file"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                capture="environment"
                onChange={(e) => {
                  setFile(e.target.files[0] || null);
                  setDraft(null);
                }}
              />
            </Field>
            {preview &&
              (file.type.startsWith("image/") ? (
                <img
                  className="ai-preview"
                  src={preview}
                  alt="Original document for review"
                />
              ) : (
                <a href={preview} target="_blank" rel="noreferrer">
                  Open original PDF for review
                </a>
              ))}
            <Button
              id="ai-scan"
              disabled={busy || !file || ready === false}
              onClick={() => run("scan")}
            >
              <ScanLine size={16} /> {busy ? "Scanning…" : "Scan document"}
            </Button>
            {ready === false && (
              <p className="muted">
                Scanning is unavailable until the AI server is deployed. You
                can still upload the file in{" "}
                <Link to="/documents">Documents</Link> and type the details in
                Voice entry.
              </p>
            )}
          </>
        )}

        {["Voice entry", "Ask assistant", "Suggestions"].includes(tab) && (
          <>
            {tab === "Ask assistant" && (
              <div className="ai-chips">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="ai-chip"
                    disabled={busy}
                    onClick={() => setText(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <Field
              label={
                tab === "Ask assistant"
                  ? "Question about the selected period"
                  : tab === "Suggestions"
                    ? "Describe an expense to categorise"
                    : "Describe a trip or expense"
              }
            >
              <textarea
                id="ai-text"
                rows={4}
                maxLength={4000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  tab === "Ask assistant"
                    ? "Which clients still owe money for invoices in this period?"
                    : tab === "Suggestions"
                      ? "FASTag recharge at Nelamangala plaza"
                      : "Paid 850 rupees for diesel today for KA 03 MN 4821 · or · Trip for Ananya Rao from Bengaluru to Mysuru, opening 26357, closing 26520"
                }
              />
            </Field>
            {tab === "Voice entry" && (
              <div className="ai-voice">
                <Button
                  id="ai-mic"
                  variant={listening ? "" : "secondary"}
                  disabled={busy}
                  onClick={() =>
                    listening ? recognition.current?.stop() : speak()
                  }
                >
                  <Mic size={16} />{" "}
                  {listening ? "Stop microphone" : "Start microphone"}
                </Button>
                <span role="status" className={listening ? "ai-live" : ""}>
                  {listening ? "Listening…" : ""}
                </span>
                <p className="muted">
                  Dictation uses your browser’s speech service. Review the
                  transcript before creating a draft.
                </p>
              </div>
            )}
            {tab === "Suggestions" && hint && (
              <p>
                Suggested category: <b>{hint}</b>
                {hint === "Other" && " (no keyword matched)"}
              </p>
            )}
            <Button
              id="ai-run"
              disabled={busy || listening || !text.trim()}
              onClick={() =>
                run(
                  tab === "Ask assistant"
                    ? "assistant"
                    : tab === "Suggestions"
                      ? "category"
                      : "draft",
                )
              }
            >
              {busy
                ? "Working…"
                : tab === "Ask assistant"
                  ? "Ask"
                  : tab === "Suggestions"
                    ? "Create categorised expense draft"
                    : "Create draft"}
            </Button>
          </>
        )}

        {tab === "Suggestions" && (
          <div className="ai-review">
            <h3>Review recorded expenses</h3>
            <p className="muted">
              Finds expenses filed under “Other” that match a known category,
              and amounts over three times the median of at least three other
              expenses in the same category and period.
            </p>
            <Button
              id="ai-review"
              variant="secondary"
              disabled={busy}
              onClick={loadReview}
            >
              Review expenses in period
            </Button>
            {review && (
              <>
                <h3>Category suggestions</h3>
                {!review.fixes.length && (
                  <p>
                    No re-categorisation needed across {review.count} expenses.
                  </p>
                )}
                {review.fixes.map((f) => (
                  <div className="list-row" key={f.id}>
                    <div>
                      {f.name}
                      <small>
                        {f.date} · {f.current} → <b>{f.suggested}</b>
                      </small>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => applyCategory(f)}
                    >
                      <Check size={15} /> Apply
                    </Button>
                  </div>
                ))}
                <h3>Unusual costs</h3>
                {!review.warnings.length && (
                  <p>
                    No unusual costs detected, or insufficient comparison
                    records.
                  </p>
                )}
                {review.warnings.map((w) => (
                  <div className="list-row ai-warning" key={w.id}>
                    <div>
                      <AlertTriangle size={15} /> {w.name}
                      <small>
                        {w.date} · {w.category} · typical {money(w.median)}
                      </small>
                    </div>
                    <b>{money(w.amount)}</b>
                  </div>
                ))}
                {!!review.warnings.length && (
                  <Link className="text-link" to="/expenses">
                    Open expenses to check
                  </Link>
                )}
              </>
            )}
          </div>
        )}

        {tab === "Business insights" && (
          <>
            <p className="muted">
              Costs use expenses + maintenance. Fuel logs are excluded to avoid
              counting the same fuel twice. Trip contribution uses linked
              invoices minus linked expenses; it is not net profit.
            </p>
            <div className="ai-tabs">
              <Button id="ai-insights" disabled={busy} onClick={loadInsights}>
                <BarChart3 size={16} /> Calculate insights
              </Button>
              <Button
                id="ai-explain"
                disabled={busy}
                variant="secondary"
                onClick={() => run("insights")}
              >
                <Sparkles size={16} />{" "}
                {ready ? "Explain with AI" : "Write summary"}
              </Button>
            </div>
            {summary && (
              <>
                <div className="stats-grid ai-stats">
                  <Stat label="Invoiced revenue" value={money(summary.revenue)} foot="Excludes cancelled" />
                  <Stat label="Recorded costs" value={money(summary.cost)} foot="Expenses + maintenance" />
                  <Stat
                    label="Contribution"
                    value={money(summary.contribution)}
                    foot={
                      summary.revenue
                        ? Math.round((summary.contribution / summary.revenue) * 100) + "% of revenue"
                        : "No revenue in period"
                    }
                  />
                </div>
                <h3>Spending by category</h3>
                {!summary.categories.length && <p>No expenses in this period.</p>}
                {summary.categories.map((c) => (
                  <div className="ai-bar" key={c.category}>
                    <span>{c.category}</span>
                    <i>
                      <b style={{ width: (c.cost / summary.categories[0].cost) * 100 + "%" }} />
                    </i>
                    <span>{money(c.cost)}</span>
                  </div>
                ))}
                <h3>Vehicle costs</h3>
                {!summary.vehicles.length && (
                  <p>No linked vehicle costs in this period.</p>
                )}
                {summary.vehicles.map((v) => (
                  <div className="list-row" key={v.id}>
                    <div>
                      {vehicleName(v.id) || <RecordName table="vehicles" id={v.id} />}
                      <small>
                        Expenses {money(v.expenses)} · Maintenance{" "}
                        {money(v.maintenance)}
                      </small>
                    </div>
                    <b>{money(v.cost)}</b>
                  </div>
                ))}
                {!!summary.unlinkedCost && (
                  <p className="muted">
                    {money(summary.unlinkedCost)} of costs are not linked to a
                    vehicle.
                  </p>
                )}
                <h3>Trip contribution</h3>
                {!summary.trips.length && <p>No trips in this period.</p>}
                {summary.trips.map((t) => (
                  <div className="list-row" key={t.id}>
                    <div>
                      <Link to={"/trips/" + t.id}>{t.name}</Link>
                      <small>
                        {t.route || "—"} · {money(t.revenue)} − {money(t.cost)}
                        {!t.invoiced && " · not invoiced"}
                      </small>
                    </div>
                    <b className={t.contribution < 0 ? "ai-negative" : ""}>
                      {money(t.contribution)}
                    </b>
                  </div>
                ))}
                <h3>Unusual costs</h3>
                {summary.warnings.length ? (
                  summary.warnings.map((w) => (
                    <div className="list-row ai-warning" key={w.id}>
                      <div>
                        <AlertTriangle size={15} /> {w.name}
                        <small>
                          {w.date} · typical {money(w.median)}
                        </small>
                      </div>
                      <b>{money(w.amount)}</b>
                    </div>
                  ))
                ) : (
                  <p>
                    No unusual costs detected, or insufficient comparison
                    records.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {error && <ErrorBox message={error} />}
        {answer && (
          <div className="ai-answer" role="status">
            <span className="ai-source">
              {source === "ai" ? "AI answer" : "Calculated on this device"}
            </span>
            {answer}
            <p className="muted">
              {source === "ai"
                ? "AI can make mistakes. Check the referenced records before acting."
                : "Calculated from your records for the selected period."}
            </p>
          </div>
        )}
        {saved && (
          <div className="notice">
            Saved.{" "}
            <Link
              to={saved.table === "trips" ? "/trips/" + saved.id : "/expenses"}
            >
              View record
            </Link>
          </div>
        )}
        {draft && (
          <form onSubmit={save} className="stack ai-draft">
            <h3>
              Review before saving{" "}
              <span className="ai-source">
                {source === "ai" ? "AI draft" : "On-device draft"}
              </span>
            </h3>
            {draft.warnings?.map((w, i) => (
              <p className="notice" key={i}>
                {w}
              </p>
            ))}
            <Field label="Entry type">
              <select
                value={draft.kind}
                onChange={(e) => set("kind", e.target.value)}
              >
                <option value="expense">Expense</option>
                <option value="trip">Trip draft</option>
                <option value="odometer">Odometer reading</option>
              </select>
            </Field>
            {draft.kind !== "odometer" && (
              <Field label="Date">
                <input
                  required
                  type="date"
                  value={draft.date || ""}
                  onChange={(e) => set("date", e.target.value)}
                />
              </Field>
            )}
            {draft.kind === "expense" && (
              <>
                <Field label="Description">
                  <input
                    required
                    maxLength={200}
                    value={draft.name || ""}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </Field>
                <Field label="Amount (INR)">
                  <input
                    required
                    inputMode="decimal"
                    value={draft.amount || ""}
                    onChange={(e) => set("amount", e.target.value)}
                  />
                </Field>
                <Field label="Category">
                  <select
                    value={draft.category || "Other"}
                    onChange={(e) => set("category", e.target.value)}
                  >
                    {expenseCategories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {draft.kind === "trip" && (
              <>
                <Field label="Client">
                  <Lookup table="clients" value={client} onChange={setClient} />
                </Field>
                <Field label="Origin">
                  <input
                    value={draft.origin || ""}
                    onChange={(e) => set("origin", e.target.value)}
                  />
                </Field>
                <Field label="Destination">
                  <input
                    value={draft.destination || ""}
                    onChange={(e) => set("destination", e.target.value)}
                  />
                </Field>
              </>
            )}
            {draft.kind !== "trip" && (
              <Field
                label={
                  draft.kind === "odometer"
                    ? "Trip to update"
                    : "Related trip (optional)"
                }
              >
                <Lookup table="trips" value={trip} onChange={setTrip} />
              </Field>
            )}
            {draft.kind !== "odometer" && (
              <Field label="Vehicle (optional)">
                <Lookup
                  table="vehicles"
                  value={vehicle}
                  onChange={setVehicle}
                />
              </Field>
            )}
            {draft.kind === "odometer" && (
              <Field label="Use reading as">
                <select
                  value={reading}
                  onChange={(e) => setReading(e.target.value)}
                >
                  <option value="opening_km">Opening odometer</option>
                  <option value="closing_km">Closing odometer</option>
                </select>
              </Field>
            )}
            {draft.kind !== "expense" &&
              (draft.kind === "odometer"
                ? [["opening_km", "Visible odometer (km)"]]
                : [
                    ["opening_km", "Opening odometer (km)"],
                    ["closing_km", "Closing odometer (km)"],
                  ]
              ).map(([k, label]) => (
                <Field key={k} label={label}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft[k] ?? ""}
                    onChange={(e) =>
                      set(
                        k,
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                  />
                </Field>
              ))}
            <Field label="Notes">
              <textarea
                value={draft.notes || ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
            <label className="ai-confirm">
              <input
                id="ai-confirm"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />{" "}
              I checked these details against the original.
            </label>
            <Button id="ai-save" disabled={busy || !confirmed}>
              {busy
                ? "Saving…"
                : draft.kind === "trip"
                  ? "Save reviewed trip draft"
                  : "Save reviewed entry"}
            </Button>
          </form>
        )}
      </section>
    </>
  );
}
