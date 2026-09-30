export const KINDS = {
  great: { label: "Great moment", key: "1", icon: "thumb" },
  dragging: { label: "Dragging", key: "2", icon: "clock" },
  confusing: { label: "Confusing", key: "3", icon: "question" },
};
export const DEMO = {
  id: "sintel-demo",
  kind: "demo",
  name: "Sintel · trailer",
  url: "./media/sintel-trailer.mp4",
};
export function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) + Math.random().toString(36).slice(2)
  );
}
export function timecode(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(n / 3600),
    m = Math.floor((n % 3600) / 60),
    s = n % 60;
  return (
    (h ? String(h).padStart(2, "0") + ":" : "") +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0")
  );
}
export function newReview(source = DEMO) {
  return {
    version: 1,
    id: uid(),
    title: source.kind === "demo" ? "First screening" : source.name,
    source,
    stamps: [],
    createdAt: new Date().toISOString(),
  };
}
export function validStamp(stamp) {
  return (
    stamp &&
    typeof stamp.id === "string" &&
    stamp.id.length <= 100 &&
    Object.prototype.hasOwnProperty.call(KINDS, stamp.kind) &&
    Number.isFinite(stamp.time) &&
    stamp.time >= 0 &&
    stamp.time <= 86400 &&
    typeof stamp.note === "string" &&
    stamp.note.length <= 4000
  );
}
export function ordered(stamps) {
  return [...stamps].sort(
    (a, b) => a.time - b.time || a.id.localeCompare(b.id),
  );
}
export function validateVideoUrl(value) {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Use a direct HTTP or HTTPS video link.");
  return url.href;
}
function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function exportReview(review, format) {
  const stamps = ordered(review.stamps);
  const safeReview = {
    version: 1,
    title: review.title,
    video: review.source.name,
    createdAt: review.createdAt,
    stamps,
  };
  if (format === "json") return JSON.stringify(safeReview, null, 2);
  if (format === "csv")
    return [
      ["Timecode", "Seconds", "Reaction", "Note"],
      ...stamps.map((s) => [
        timecode(s.time),
        s.time.toFixed(3),
        KINDS[s.kind].label,
        s.note,
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
  return (
    `# ${review.title}\n\nVideo: ${review.source.name}\nStamps: ${stamps.length}\n\n` +
    stamps
      .map(
        (s) =>
          `- **${timecode(s.time)} · ${KINDS[s.kind].label}**${s.note ? " — " + s.note.replace(/\n/g, " ") : ""}`,
      )
      .join("\n")
  );
}
