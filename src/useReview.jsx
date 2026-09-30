import { useState, useEffect, useRef, useCallback } from "react";
import { newReview, uid, validStamp } from "../shared/model.mjs";
import { api } from "./api";
const STORAGE = "cinemastamps.review.v1";
function readReview() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE));
    if (
      value?.version === 1 &&
      Array.isArray(value.stamps) &&
      value.source &&
      value.stamps.every(validStamp)
    )
      return value.source.kind === "file"
        ? { ...value, source: { ...value.source, url: "", needsFile: true } }
        : value;
  } catch {
    /* Start with the bundled film if storage is unavailable. */
  }
  return newReview();
}
function readConnection() {
  try {
    return JSON.parse(localStorage.getItem("cinemastamps.connection"));
  } catch {
    return null;
  }
}
export default function useReview() {
  const [review, setReview] = useState(readReview);
  const [connection, setConnection] = useState(readConnection);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const current = useRef(review);
  current.current = review;
  const queue = useRef(Promise.resolve());
  const [pending, setPending] = useState(0);
  const pendingRef = useRef(0);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(review));
    } catch {
      setError("Storage is full. Export this review before closing the app.");
    }
  }, [review]);
  useEffect(() => {
    try {
      if (connection)
        localStorage.setItem(
          "cinemastamps.connection",
          JSON.stringify(connection),
        );
      else localStorage.removeItem("cinemastamps.connection");
    } catch {}
  }, [connection]);
  const adopt = useCallback(
    (next) =>
      setReview((old) =>
        next.revision && old.revision && next.revision < old.revision
          ? old
          : next,
      ),
    [],
  );
  useEffect(() => {
    if (!connection) return;
    let active = true;
    const refresh = async () => {
      try {
        const data = await api(connection, "/session");
        if (active) {
          setOnline(true);
          if (!pendingRef.current) adopt(data);
        }
      } catch {
        if (active) setOnline(false);
      }
    };
    refresh();
    const timer = setInterval(refresh, 1800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connection, adopt]);
  const mutate = useCallback(
    (route, options, localUpdate) => {
      if (!connection) {
        setReview(localUpdate);
        return Promise.resolve();
      }
      pendingRef.current++;
      setPending(pendingRef.current);
      const task = queue.current
        .catch(() => {})
        .then(async () => {
          try {
            const data = await api(connection, route, options);
            adopt(data);
            setOnline(true);
          } catch (e) {
            setError(
              e.message +
                " Your change was not saved; reconnect and try again.",
            );
            throw e;
          } finally {
            pendingRef.current--;
            setPending(pendingRef.current);
          }
        });
      queue.current = task;
      return task;
    },
    [connection, adopt],
  );
  const stamp = (kind, time) => {
    const entry = { id: uid(), kind, time, note: "" };
    return mutate(
      "/stamps",
      { method: "POST", body: JSON.stringify(entry) },
      (old) => ({ ...old, stamps: [...old.stamps, entry] }),
    );
  };
  const note = (id, text) =>
    mutate(
      `/stamps/${id}`,
      { method: "PATCH", body: JSON.stringify({ note: text }) },
      (old) => ({
        ...old,
        stamps: old.stamps.map((s) => (s.id === id ? { ...s, note: text } : s)),
      }),
    );
  const remove = (id) =>
    mutate(`/stamps/${id}`, { method: "DELETE" }, (old) => ({
      ...old,
      stamps: old.stamps.filter((s) => s.id !== id),
    }));
  const source = async (next) => {
    if (connection && next.kind !== "file")
      await mutate(
        "/source",
        { method: "PUT", body: JSON.stringify(next) },
        () => newReview(next),
      );
    else {
      setConnection(null);
      setOnline(false);
      setReview(newReview(next));
    }
  };
  const pair = async (base) => {
    if (current.current.source.needsFile)
      throw new Error(
        "Reopen your local video before pairing so the correct film is shared.",
      );
    const cleanBase = base.replace(/\/$/, "");
    const response = await api({ base: cleanBase }, "/sessions", {
      method: "POST",
      body: JSON.stringify(current.current),
    });
    const next = { base: cleanBase, token: response.token };
    // A browser-local file cannot be fetched by the phone. Transfer it to the local hub.
    if (current.current.source.kind === "file" && current.current.source.url) {
      const file = await fetch(current.current.source.url).then((r) =>
        r.blob(),
      );
      const form = new FormData();
      form.append("video", file, current.current.source.name);
      const uploaded = await api(next, "/video", {
        method: "POST",
        body: form,
      });
      for (const entry of current.current.stamps)
        await api(next, "/stamps", {
          method: "POST",
          body: JSON.stringify(entry),
        });
      // A new session has its own revision sequence; replace the old session.
      setReview({ ...uploaded, stamps: current.current.stamps });
    } else setReview(response.review);
    setConnection(next);
    setOnline(true);
    return next;
  };
  return {
    review,
    connection,
    online,
    pending,
    error,
    setError,
    stamp,
    note,
    remove,
    source,
    pair,
    adopt,
    disconnect: () => {
      setConnection(null);
      setOnline(false);
      setReview((old) =>
        old.source.kind === "upload"
          ? {
              ...old,
              source: {
                id: old.source.id,
                kind: "file",
                name: old.source.name,
                url: "",
                needsFile: true,
              },
            }
          : old,
      );
    },
  };
}
