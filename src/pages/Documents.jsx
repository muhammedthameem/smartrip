import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Upload, ExternalLink, Check } from "lucide-react";
import { useApp, useList } from "../lib/context";
import {
  PageHeader,
  Field,
  Button,
  Lookup,
  Loading,
  ErrorBox,
  Empty,
  Badge,
  Pagination,
} from "../components/ui";
export default function Documents() {
  const { api, demo, refresh, notify } = useApp(),
    [file, setFile] = useState(null),
    [type, setType] = useState("Trip voucher"),
    [trip, setTrip] = useState(null),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0),
    { rows, count, loading, error } = useList("documents", { page });
  async function upload(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.upload(file, { type, trip_id: trip });
      setFile(null);
      e.target.reset();
      refresh();
      notify("Uploaded for manual review");
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Original records. Safely kept. Manually verified."
      />
      <div className="notice">
        <Link to="/assistant">Scan documents with the Smart assistant</Link>.
        Review extracted details before saving.{" "}
        {demo && "Private upload requires a connected Supabase project."}
      </div>
      <section className="panel padded">
        <form onSubmit={upload}>
          <div className="form-grid three">
            <Field label="Document type">
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {[
                  "Trip voucher",
                  "Odometer photo",
                  "Fuel receipt",
                  "Toll / parking receipt",
                  "Maintenance bill",
                  "Vehicle document",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Related trip">
              <Lookup table="trips" value={trip} onChange={setTrip} />
            </Field>
            <Field label="JPEG, PNG or PDF · max 10 MB">
              <input
                required
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => setFile(e.target.files[0])}
              />
            </Field>
          </div>
          <Button disabled={busy || demo || !file}>
            <Upload size={17} />
            {busy ? "Uploading…" : "Upload for review"}
          </Button>
        </form>
      </section>
      <section className="panel padded mt-5">
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} />
        ) : !rows.length ? (
          <Empty title="Your document inbox is clear" />
        ) : (
          rows.map((r) => (
            <div className="document-row" key={r.id}>
              <div>
                <h3>{r.name}</h3>
                <small>{r.type}</small>
              </div>
              <Badge>{r.verified ? "verified" : "manual review"}</Badge>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    const url = await api.fileUrl(r.path);
                    window.open(url, "_blank", "noopener,noreferrer");
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                <ExternalLink size={15} /> Open
              </Button>
              {!r.verified && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (
                      !confirm(
                        "Have you reviewed the original document and verified its details?",
                      )
                    )
                      return;
                    try {
                      await api.save("documents", { ...r, verified: true });
                      refresh();
                    } catch (e) {
                      notify(e.message);
                    }
                  }}
                >
                  <Check size={15} /> Verify
                </Button>
              )}
            </div>
          ))
        )}
        <Pagination page={page} setPage={setPage} count={count} />
      </section>
    </>
  );
}
