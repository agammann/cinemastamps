import React, { useEffect, useState } from "react";
import { api, download } from "./api";
import StampList from "./StampList";
import { NoteDialog, ExportDialog } from "./Dialogs";
import { exportReview } from "../shared/model.mjs";
import Icon from "./Icon";
export default function Companion() {
  const [connection, setConnection] = useState(() => ({
    base: location.origin,
    token: new URLSearchParams(location.hash.slice(1)).get("token") || "",
  }));
  const [review, setReview] = useState(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(null),
    [exporting, setExporting] = useState(false),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const changed = () => {
      setReview(null);
      setEditing(null);
      setExporting(false);
      setMessage("");
      setConnection({base: location.origin, token: new URLSearchParams(location.hash.slice(1)).get("token") || ""});
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const next = await api(connection, "/session");
        if (alive) {
          setReview(next);
          setError("");
        }
      } catch (e) {
        if (alive) setError(e.message);
      }
    }
    refresh();
    const id = setInterval(refresh, 1800);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [connection]);
  const note = async (id, text) => {
    const next = await api(connection, `/stamps/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ note: text }),
    });
    setReview(next);
  };
  return (
    <main className="companion">
      <div className="brand">
        <Icon name="stamp" size={30} />
        <span>Cinemastamps</span>
      </div>
      <h1>Your seat in the screening room.</h1>
      <p className="muted">
        Keep watching the TV. Use your phone for the details.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {review && (
        <>
          <section className="phone-film">
            <span className="muted">Now reviewing</span>
            <h2>{review.source.name}</h2>
            <p>{review.stamps.length} stamps collected</p>
          </section>
          <div className="phone-actions">
            <button className="primary" onClick={() => setExporting(true)}>
              <Icon name="export" />
              Export review
            </button>
            <button onClick={() => setConfirm(!confirm)}>
              <Icon name="folder" />
              Send video
            </button>
          </div>
          {confirm && (
            <section className="upload-panel">
              <h3>Start a new screening</h3>
              <p>
                Sending a video replaces this screening and its stamps. Export
                your current review first.
              </p>
              <label htmlFor="phone-video">
                Choose an MP4 or WebM, up to 250 MB.
              </label>
              <input
                id="phone-video"
                type="file"
                accept="video/mp4,video/webm"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (!file) return;
                  if (file.size > 250 * 1024 * 1024) {
                    setError("Video must be smaller than 250 MB.");
                    return;
                  }
                  setBusy(true);
                  setError("");
                  try {
                    const form = new FormData();
                    form.append("video", file);
                    const next = await api(connection, "/video", {
                      method: "POST",
                      body: form,
                    });
                    setReview(next);
                    setConfirm(false);
                    setMessage("Video sent. It is ready on the TV.");
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              {busy && <p role="status">Sending video. Keep this page open…</p>}
            </section>
          )}
          {message && (
            <p role="status" className="success">
              {message}
            </p>
          )}
          <StampList
            stamps={review.stamps}
            onEdit={setEditing}
            onRemove={async (id) => {
              try {
                setReview(
                  await api(connection, `/stamps/${id}`, { method: "DELETE" }),
                );
              } catch (e) {
                setError(e.message);
              }
            }}
          />
          <p className="credits">
            This private link expires 24 hours after pairing. Keep it within
            your review group.
          </p>
        </>
      )}
      {editing && (
        <NoteDialog
          stamp={editing}
          close={() => setEditing(null)}
          save={note}
        />
      )}
      {exporting && (
        <ExportDialog
          review={review}
          close={() => setExporting(false)}
          save={(format) => {
            download(exportReview(review, format), format);
            setExporting(false);
          }}
        />
      )}
    </main>
  );
}
