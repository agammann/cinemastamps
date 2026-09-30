import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import Icon from "./Icon";
import { focusable } from "./useRemote";
import { api } from "./api";
import { KINDS, timecode } from "../shared/model.mjs";
export function Dialog({ title, close, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    focusable(ref.current)[0]?.focus();
    const trap = (e) => {
      if (e.key !== "Tab") return;
      const list = focusable(ref.current),
        first = list[0],
        last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    ref.current?.addEventListener("keydown", trap);
    return () => {
      ref.current?.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function NoteDialog({ stamp, close, save }) {
  const [text, setText] = useState(stamp.note),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      title={`${timecode(stamp.time)} · ${KINDS[stamp.kind].label}`}
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await save(stamp.id, text);
            close();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="note">What should the editor know?</label>
        <textarea
          id="note"
          autoFocus
          maxLength={4000}
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Be specific about this moment…"
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <span className="muted">{text.length}/4000</span>
          <button className="primary" disabled={busy} type="submit">
            Save note
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export function ExportDialog({ review, close, save }) {
  return (
    <Dialog title="Export review" close={close}>
      <p>
        {review.stamps.length} stamps for <strong>{review.source.name}</strong>.
        Choose a format to keep or share your feedback.
      </p>
      <div className="export-options">
        {[
          ["csv", "Spreadsheet", "CSV · timestamps, reactions, and notes"],
          [
            "md",
            "Readable report",
            "Markdown · ready to share with your editor",
          ],
          ["json", "Complete data", "JSON · preserves precise timestamps"],
        ].map(([format, title, desc]) => (
          <button key={format} onClick={() => save(format)}>
            <Icon name="export" />
            <span>
              <strong>{title}</strong>
              <small>{desc}</small>
            </span>
          </button>
        ))}
      </div>
      {window.CinemaNative && (
        <p className="muted">
          On TV, reports are saved in the app’s Documents folder. Pair your
          phone to download them there.
        </p>
      )}
    </Dialog>
  );
}
export function OpenDialog({ close, onFile, onUrl, onDemo, hasStamps, error }) {
  const [url, setUrl] = useState(""),
    [name, setName] = useState(""),
    [localError, setLocalError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(!hasStamps);
  const act = async (fn) => {
    if (!confirmed) {
      setLocalError("Confirm that you have saved the current review.");
      return;
    }
    setBusy(true);
    try {
      await fn();
      close();
    } catch (e) {
      setLocalError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Open a video" close={close}>
      <p>Use your own draft or start with the bundled demo film.</p>
      {hasStamps && (
        <label className="check-label">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I have exported my current review. Opening another video starts a new
          review.
        </label>
      )}
      <div className="file-picker">
        <label htmlFor="video-file">
          <Icon name="folder" />
          Choose MP4 or WebM
        </label>
        <input
          id="video-file"
          type="file"
          accept="video/mp4,video/webm"
          disabled={busy || !confirmed}
          onChange={(e) => {
            if (e.target.files[0]) act(() => onFile(e.target.files[0]));
          }}
        />
      </div>
      <p className="muted compact">
        On Fire TV, pair a phone to send a file without a file picker.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act(() => onUrl(url, name));
        }}
      >
        <label htmlFor="video-title">Film title</label>
        <input
          id="video-title"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My first cut"
          maxLength={150}
        />
        <label htmlFor="video-url">Direct video link</label>
        <input
          id="video-url"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/my-film.mp4"
        />
        <div className="dialog-actions">
          <button
            type="button"
            onClick={() => act(onDemo)}
            disabled={busy || !confirmed}
          >
            Use demo film
          </button>
          <button
            className="primary"
            disabled={busy || !confirmed}
            type="submit"
          >
            {busy ? "Opening…" : "Open link"}
          </button>
        </div>
      </form>
      <p className="credits">
        Demo: Sintel trailer · © Blender Foundation · CC BY 3.0.{" "}
        <a
          href="https://durian.blender.org/about/"
          target="_blank"
          rel="noreferrer"
        >
          Film credits
        </a>
      </p>
      {(localError || error) && (
        <p role="alert" className="error">
          {localError || error}
        </p>
      )}
    </Dialog>
  );
}
export function PairDialog({ connection, pair, disconnect, close }) {
  const native = !!window.CinemaNative;
  const [base, setBase] = useState(
      connection?.base || (native ? "" : location.origin),
    ),
    [active, setActive] = useState(connection),
    [qr, setQr] = useState(""),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    (async () => {
      let publicBase = active.base;
      try {
        const info = await api(active, "/health");
        if (/localhost|127\.0\.0\.1/.test(publicBase) && info.addresses.length)
          publicBase = info.addresses[0];
      } catch {}
      const next = `${publicBase}/?companion=1#token=${active.token}`;
      const data = await QRCode.toDataURL(next, {
        width: 260,
        margin: 2,
        color: { dark: "#111310", light: "#ffffff" },
      });
      if (alive) {
        setLink(next);
        setQr(data);
      }
    })();
    return () => {
      alive = false;
    };
  }, [active]);
  return (
    <Dialog title="Pair your phone" close={close}>
      {active ? (
        <>
          <p>
            Scan with a phone on the same Wi-Fi. Anyone with this link can
            access this screening for 24 hours.
          </p>
          <div className="qr-wrap">
            {qr && (
              <img
                src={qr}
                alt="QR code to open your phone companion"
                width="230"
                height="230"
              />
            )}
          </div>
          <a
            className="companion-link"
            href={link}
            target="_blank"
            rel="noreferrer"
          >
            Open phone companion
          </a>
          <p className="muted">
            Send a video, add notes to stamps, and download your review.
          </p>
          <div className="dialog-actions">
            <button
              onClick={() => {
                disconnect();
                setActive(null);
              }}
            >
              Disconnect TV
            </button>
            <button className="primary" onClick={close}>
              Done
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const value = new URL(base);
              if (!["http:", "https:"].includes(value.protocol))
                throw new Error("Use an HTTP or HTTPS address.");
              setActive(await pair(value.origin));
            } catch (e) {
              setError(
                "Could not connect. Start the Cinemastamps companion service on your computer and use its local-network address. " +
                  e.message,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Connect this screening to the Cinemastamps companion service running
            on your computer.
          </p>
          <label htmlFor="hub">Companion service address</label>
          <input
            id="hub"
            type="url"
            required
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="http://192.168.1.20:4318"
          />
          <p className="muted">
            Your TV, computer, and phone must be on the same Wi-Fi. The
            standalone TV app works without pairing.
          </p>
          <button className="primary wide" disabled={busy}>
            {busy ? "Connecting…" : "Create phone link"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
