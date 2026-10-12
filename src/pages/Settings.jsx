import React, { useEffect, useState } from "react";
import { ShieldCheck, Download, RotateCcw } from "lucide-react";
import { useApp, useList } from "../lib/context";
import { resetDemo, configured } from "../lib/repository";
import { PageHeader, Field, Button, Badge } from "../components/ui";
export default function Settings() {
  const { api, demo, profile, refresh, notify, signOut } = useApp(),
    { rows } = useList("settings", { limit: 1 }),
    [form, setForm] = useState({
      name: "",
      phone: "",
      address: "",
      invoice_prefix: "INV",
      voucher_prefix: "ST",
      currency: "INR",
      timezone: "Asia/Kolkata",
    }),
    [busy, setBusy] = useState(false),
    [install, setInstall] = useState(null);
  useEffect(() => {
    if (rows[0]) setForm(rows[0]);
  }, [rows]);
  useEffect(() => {
    const f = (e) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", f);
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.save("settings", form);
      refresh();
      notify("Business settings saved");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader title="Settings" subtitle="Make this workspace your own." />
      <div className="two-cols">
        <section className="panel padded">
          <h2>Business details</h2>
          <form onSubmit={save}>
            {[
              ["name", "Business name"],
              ["phone", "Contact number"],
              ["address", "Business address"],
              ["voucher_prefix", "Voucher prefix"],
              ["invoice_prefix", "Invoice prefix"],
            ].map(([k, label]) => (
              <Field key={k} label={label}>
                <input
                  required={k === "name"}
                  maxLength={k.includes("prefix") ? 10 : 200}
                  value={form[k] || ""}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </Field>
            ))}
            <div className="notice">
              Currency: INR · Timezone: Asia/Kolkata
              <br />
              This release uses these defaults consistently.
            </div>
            <Button disabled={busy || (!demo && profile?.role !== "admin")}>
              {busy ? "Saving…" : "Save business details"}
            </Button>
          </form>
        </section>
        <div className="stack">
          <section className="panel padded">
            <h2>Connections</h2>
            {[
              ["Supabase", configured ? "Configured" : "Not connected"],
              ["OCR & document extraction", "Not configured"],
              ["AI assistant / voice", "Not configured"],
              ["GPS tracking", "Not configured"],
              ["WhatsApp / email / SMS", "Not configured"],
              ["Online payments", "Not configured"],
            ].map(([name, status]) => (
              <div className="list-row" key={name}>
                <span>{name}</span>
                <Badge>{status}</Badge>
              </div>
            ))}
            <p className="muted">
              To connect your database, follow README.md: create a Supabase
              project, run the SQL migration, set the public project URL and
              publishable key, and rebuild. Secret keys must stay server-side.
            </p>
          </section>
          <section className="panel padded">
            <h2>Install SmartTrip</h2>
            <p>
              On supported browsers, use “Install app” or “Add to Home Screen”.
              On iPhone, use Safari’s Share menu. Live records require an
              internet connection.
            </p>
            {install && (
              <Button
                onClick={async () => {
                  await install.prompt();
                  setInstall(null);
                }}
              >
                <Download size={16} /> Install app
              </Button>
            )}
            <p className="muted">
              Installation and background features depend on your browser and
              operating system.
            </p>
          </section>
          {demo && (
            <section className="panel padded">
              <h2>Demo workspace</h2>
              <p>
                Reset only the fictional records in this browser. This does not
                touch Supabase.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  if (
                    confirm(
                      "Reset all demo changes to the original sample records?",
                    )
                  ) {
                    resetDemo();
                    refresh();
                    notify("Demo reset");
                  }
                }}
              >
                <RotateCcw size={16} /> Reset demo
              </Button>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
