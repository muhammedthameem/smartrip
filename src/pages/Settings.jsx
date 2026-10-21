import React, { useEffect, useState } from "react";
import { ShieldCheck, Download, RotateCcw, Sparkles, RefreshCw, Smartphone, Apple, CheckCircle2 } from "lucide-react";
import { useApp, useList } from "../lib/context";
import { resetDemo, configured } from "../lib/repository";
import { askAI } from "../lib/ai";
import { PageHeader, Field, Button, Badge } from "../components/ui";
import { isAppInstalled } from "../components/InstallPrompt";
import { useConfirm } from "../components/Confirm";
export default function Settings() {
  const confirm = useConfirm(),
    { api, demo, profile, refresh, notify, signOut } = useApp(),
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
    [install, setInstall] = useState(null),
    [aiReady, setAiReady] = useState(null);
  useEffect(() => {
    let active = true;
    askAI(demo, { action: "status" })
      .then((r) => active && setAiReady(!!r.ready))
      .catch(() => active && setAiReady(false));
    return () => {
      active = false;
    };
  }, [demo]);
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
              [
                "Document scanning (AI)",
                aiReady == null
                  ? "Checking"
                  : aiReady
                    ? "Connected"
                    : "Server setup required",
              ],
              [
                "AI assistant, voice drafts & suggestions",
                aiReady ? "Connected" : "On-device mode",
              ],
              ["Voice dictation", "Browser dependent"],
              ["Cost insights & unusual-cost warnings", "Available"],
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
            <h2>App updates & version</h2>
            <div className="list-row">
              <span>Installed build version</span>
              <Badge>
                {typeof __APP_VERSION__ !== "undefined" ? "v" + __APP_VERSION__ : "v0.1.0"}
                {typeof __APP_COMMIT_HASH__ !== "undefined" && __APP_COMMIT_HASH__ ? ` (#${__APP_COMMIT_HASH__})` : ""}
              </Badge>
            </div>
            <p className="muted">
              SmartTrip automatically detects updates whenever new code is deployed to the server. You can also manually check or preview the theme-based update popup.
            </p>
            <div style={{ display: "flex", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
              <Button
                variant="secondary"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("smarttrip-check-update"));
                  notify("Checking for updates…");
                }}
              >
                <RefreshCw size={15} /> Check for updates
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("smarttrip-check-update", { detail: { simulate: true } })
                  );
                }}
              >
                <Sparkles size={15} /> Preview update popup
              </Button>
            </div>
          </section>
          <section className="panel padded">
            <h2>Install SmartTrip on phone</h2>
            <div className="list-row" style={{ marginBottom: "10px" }}>
              <span>Home screen app status</span>
              {isAppInstalled() ? (
                <Badge style={{ background: "#e6f3ec", color: "#165b49" }}>
                  <CheckCircle2 size={13} /> Installed PWA
                </Badge>
              ) : (
                <Badge>Running in browser</Badge>
              )}
            </div>
            <p>
              SmartTrip features automatic mobile detection. If not installed on an Android or iOS phone, a theme-based shortcut popup automatically prompts the user to add SmartTrip to their home screen. Once installed, the popup is hidden.
            </p>
            {install && !isAppInstalled() && (
              <div style={{ marginTop: "10px", marginBottom: "10px" }}>
                <Button
                  onClick={async () => {
                    await install.prompt();
                    setInstall(null);
                  }}
                >
                  <Download size={16} /> Install to home screen
                </Button>
              </div>
            )}
            <div style={{ display: "flex", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
              <Button
                variant="secondary"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("smarttrip-open-install-prompt", {
                      detail: { platform: "android" },
                    })
                  );
                }}
              >
                <Smartphone size={15} /> Preview Android Popup
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("smarttrip-open-install-prompt", {
                      detail: { platform: "ios" },
                    })
                  );
                }}
              >
                <Apple size={15} /> Preview iOS Popup
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  localStorage.removeItem("smarttrip_install_dismissed_until");
                  localStorage.removeItem("smarttrip_pwa_installed");
                  notify("Install prompt snooze cleared");
                }}
              >
                <RotateCcw size={15} /> Reset install snooze
              </Button>
            </div>
            <p className="muted" style={{ marginTop: "12px" }}>
              Android uses native WebAPK installation. iOS creates a direct Safari home screen shortcut.
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
                onClick={async () => {
                  const ok = await confirm({
                    title: "Reset the demo workspace?",
                    message:
                      "Reset all demo changes to the original sample records?",
                    detail:
                      "Only fictional data in this browser is reset. Supabase is never touched.",
                    confirmLabel: "Reset demo",
                    icon: RotateCcw,
                    tone: "danger",
                  });
                  if (ok) {
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
