import React, { useCallback, useEffect, useRef, useState } from "react";
import Player from "./Player";
import StampList from "./StampList";
import Companion from "./Companion";
import Icon from "./Icon";
import useReview from "./useReview";
import useRemote from "./useRemote";
import { OpenDialog, NoteDialog, ExportDialog, PairDialog } from "./Dialogs";
import { DEMO, exportReview, uid, validateVideoUrl } from "../shared/model.mjs";
import { api, download, mediaUrl } from "./api";
function Screening() {
  const state = useReview();
  const { review, connection, online, error, setError } = state;
  const player = useRef(null),
    nav = useRef(null),
    noticeTimer = useRef(null),
    previousBlob = useRef(null);
  const [tab, setTab] = useState("screening"),
    [dialog, setDialog] = useState(null),
    [notice, setNotice] = useState("");
  const notify = (message) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 2800);
  };
  const shortcut = useCallback(
    (key) => {
      if (key === "back") {
        if (dialog) {
          setDialog(null);
          return;
        }
        if (player.current?.exitTheater()) return;
        if (tab === "review") {
          setTab("screening");
          return;
        }
        if (window.CinemaNative) window.CinemaNative.exitApp();
        else nav.current?.focus();
        return;
      }
      if (key === " " || key === "MediaPlayPause") player.current?.toggle();
      else if (key === "MediaRewind") player.current?.skip(-10);
      else if (key === "MediaFastForward") player.current?.skip(10);
      else if (["1", "2", "3"].includes(key))
        player.current?.stamp(
          { 1: "great", 2: "dragging", 3: "confusing" }[key],
        );
    },
    [dialog, tab],
  );
  useRemote(shortcut);
  useEffect(() => {
    if (window.CinemaNative) setTimeout(() => nav.current?.focus(), 100);
    return () => clearTimeout(noticeTimer.current);
  }, []);
  const seek = (time) => {
    setTab("screening");
    player.current?.seek(time);
  };
  const file = async (value) => {
    if (connection) {
      const form = new FormData();
      form.append("video", value);
      state.adopt(
        await api(connection, "/video", { method: "POST", body: form }),
      );
    } else {
      if (review.source.needsFile && value.name === review.source.name) {
        const url = URL.createObjectURL(value);
        previousBlob.current = url;
        state.adopt({
          ...review,
          source: { ...review.source, url, needsFile: false },
        });
        return;
      }
      if (previousBlob.current) URL.revokeObjectURL(previousBlob.current);
      const url = URL.createObjectURL(value);
      previousBlob.current = url;
      await state.source({ id: uid(), kind: "file", name: value.name, url });
    }
    setError("");
  };
  let url = "";
  try {
    url = mediaUrl(review, connection);
  } catch {
    /* A disconnected uploaded video needs its original companion connection. */
  }
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Icon name="stamp" size={34} />
          <span>Cinemastamps</span>
        </div>
        <nav className="tabs" aria-label="Workspace">
          <button
            ref={nav}
            className={tab === "screening" ? "active" : ""}
            onClick={() => setTab("screening")}
          >
            Screening room
          </button>
          <button
            className={tab === "review" ? "active" : ""}
            onClick={() => setTab("review")}
          >
            Review
          </button>
        </nav>
        <div className="header-actions">
          <button onClick={() => setDialog({ type: "open" })}>
            <Icon name="folder" />
            Open video
          </button>
          <button onClick={() => setDialog({ type: "pair" })}>
            <Icon name="phone" />
            Pair phone
          </button>
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
      {connection && (
        <div className={`connection-status ${online ? "connected" : ""}`}>
          {online
            ? "Phone companion connected"
            : "Companion disconnected. Reconnect to save changes."}
          {state.pending > 0 ? " · Saving…" : ""}
        </div>
      )}
      <div className={`workspace ${tab === "review" ? "review-mode" : ""}`}>
        <div className="screening-column">
          <div className="film-heading">
            <h1>{review.title}</h1>
            <p>
              {review.source.kind === "demo"
                ? "Demo film · Ready to review"
                : review.source.name}
            </p>
          </div>
          <Player
            ref={player}
            source={url}
            stamps={review.stamps}
            onStamp={(kind, time) => state.stamp(kind, time).catch(() => {})}
            onError={setError}
            onPosition={(position) => {
              if (connection && online)
                api(connection, "/position", {
                  method: "PUT",
                  body: JSON.stringify({ position }),
                }).catch(() => {});
            }}
          />
        </div>
        <StampList
          stamps={review.stamps}
          expanded={tab === "review"}
          onSeek={seek}
          onEdit={(stamp) => setDialog({ type: "note", stamp })}
          onRemove={(id) => state.remove(id).catch(() => {})}
        />
      </div>
      <footer className="footer">
        <p>
          <span className="remote-symbol">✣</span>Use the arrows to move. Press
          select to stamp.
        </p>
        <button onClick={() => setDialog({ type: "export" })}>
          <Icon name="export" />
          Export review
        </button>
      </footer>
      <div className={`toast ${notice ? "visible" : ""}`} role="status">
        {notice}
      </div>
      {dialog?.type === "open" && (
        <OpenDialog
          close={() => setDialog(null)}
          hasStamps={review.stamps.length > 0 && !review.source.needsFile}
          onFile={file}
          onDemo={() => {
            setError("");
            return state.source(DEMO);
          }}
          onUrl={(value, name) => {
            const url = validateVideoUrl(value);
            setError("");
            return state.source({
              id: uid(),
              kind: "url",
              name: name || "Untitled film",
              url,
            });
          }}
        />
      )}
      {dialog?.type === "note" && (
        <NoteDialog
          stamp={dialog.stamp}
          close={() => setDialog(null)}
          save={state.note}
        />
      )}
      {dialog?.type === "export" && (
        <ExportDialog
          review={review}
          close={() => setDialog(null)}
          save={(format) => {
            try {
              notify(download(exportReview(review, format), format));
              setDialog(null);
            } catch (e) {
              setError(e.message);
            }
          }}
        />
      )}
      {dialog?.type === "pair" && (
        <PairDialog
          connection={connection}
          pair={state.pair}
          disconnect={state.disconnect}
          close={() => setDialog(null)}
        />
      )}
    </main>
  );
}
export default function App() {
  return new URLSearchParams(location.search).has("companion") ? (
    <Companion />
  ) : (
    <Screening />
  );
}
