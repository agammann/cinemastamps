import express from "express";
import multer from "multer";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import QRCode from "qrcode";
import { createNativeMedia, nativePaths } from "./native-media.mjs";
import {
  KINDS,
  DEMO,
  validStamp,
  newReview,
  exportReview,
  validateVideoUrl,
} from "../shared/model.mjs";

const TOKEN = /^[a-f0-9]{48}$/;
const DAY = 24 * 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
// FFmpeg can write one packet past -fs before the completed-file check runs.
const MAX_NATIVE_BYTES = 40 * 1024 * 1024;
const SESSION_STORAGE_BYTES = 550 * 1024 * 1024;
const INSTANCE_STORAGE_BYTES = 2 * 1024 * 1024 * 1024;
const storageError = (message) => Object.assign(new Error(message), { code: 'STORAGE_LIMIT' });
export function createApp({
  dataDir, webDir, port = 4318, publicBase = "",
  maxUploadBytes = MAX_UPLOAD_BYTES,
  maxSessionStorageBytes = SESSION_STORAGE_BYTES,
  maxInstanceStorageBytes = INSTANCE_STORAGE_BYTES,
  pruneIntervalMs = 60 * 60 * 1000,
}) {
  mkdirSync(dataDir, { recursive: true });
  const app = express();
  const uploadsInFlight = new Map();
  const nativeInFlight = new Map();
  const directoryBytes = (dir) => {
    if (!existsSync(dir)) return 0;
    return readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) =>
      sum + (entry.isFile() && existsSync(path.join(dir, entry.name))
        ? statSync(path.join(dir, entry.name)).size : 0), 0);
  };
  const reservedBytes = (token) =>
    (uploadsInFlight.has(token) ? maxUploadBytes : 0) +
    [...nativeInFlight.values()].filter((owner) => owner === token).length * MAX_NATIVE_BYTES;
  const assertCapacity = (token, additional) => {
    const sessionBytes = directoryBytes(path.join(dataDir, token));
    if (sessionBytes + reservedBytes(token) + additional > maxSessionStorageBytes)
      throw storageError('This screening has reached its storage limit. Export it and start a new screening.');
    const usedBytes = readdirSync(dataDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && TOKEN.test(entry.name))
      .reduce((sum, entry) => sum + directoryBytes(path.join(dataDir, entry.name)), 0);
    const pendingBytes = [...uploadsInFlight.keys()].length * maxUploadBytes + nativeInFlight.size * MAX_NATIVE_BYTES;
    if (usedBytes + pendingBytes + additional > maxInstanceStorageBytes)
      throw storageError('The companion has reached its storage limit. Try again after an old screening expires.');
  };
  const cleanupMedia = (token, review) => {
    const dir = path.join(dataDir, token);
    if (!existsSync(dir)) return;
    const keepUpload = review?.source.kind === 'upload' ? review.source.file : null;
    const keepNative = ['demo', 'upload'].includes(review?.source.kind)
      ? `native-${review.source.id}.mp4` : null;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const name = entry.name;
      const uploadFile = /^upload-[a-f0-9]{16}\.(mp4|webm)$/.test(name);
      const nativeFile = /^native-(sintel-demo|[a-f0-9]{16})\.mp4(\.tmp\.mp4)?$/.test(name);
      if (!uploadFile && !nativeFile) continue;
      if (name === keepUpload || name === uploadsInFlight.get(token)) continue;
      if (name === keepNative || name === `${keepNative}.tmp.mp4`) continue;
      if (nativeFile && [...nativeInFlight.keys()].some((output) =>
        path.dirname(output) === dir && (name === path.basename(output) || name === path.basename(output) + '.tmp.mp4'))) continue;
      rmSync(path.join(dir, name), { force: true });
    }
  };
  const cleanupAfterResponse = (token) => {
    try { cleanupMedia(token, get(token)); }
    catch (error) { console.error('Could not remove old companion media:', error); }
  };
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "no-referrer");
    const origin = req.headers.origin;
    const own = `${req.protocol}://${req.get("host")}`;
    if (origin && origin !== own) {
      if (
        ![
          "http://appassets.androidplatform.net",
          "https://appassets.androidplatform.net",
          "http://127.0.0.1:5173",
          "http://localhost:5173",
        ].includes(origin)
      )
        return res.status(403).json({ error: "This origin is not allowed." });
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      );
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "512kb" }));
  const sessionDir = (token) => path.join(dataDir, token);
  const save = (token, review) => {
    const dir = sessionDir(token);
    mkdirSync(dir, { recursive: true });
    const serialized = JSON.stringify(review);
    assertCapacity(token, Buffer.byteLength(serialized));
    writeFileSync(path.join(dir, "review.tmp"), serialized);
    renameSync(path.join(dir, "review.tmp"), path.join(dir, "review.json"));
  };
  const get = (token) => {
    if (!TOKEN.test(token || "")) return null;
    try {
      const session = JSON.parse(
        readFileSync(path.join(sessionDir(token), "review.json"), "utf8"),
      );
      if (Date.now() - session.startedAt > DAY) return null;
      return session;
    } catch {
      return null;
    }
  };
  const auth = (req, res, next) => {
    const token =
      req.headers.authorization?.replace(/^Bearer /, "") ||
      (req.path === "/api/video" ? req.query.token : "");
    const session = get(token);
    if (!session)
      return res
        .status(401)
        .json({
          error:
            "This screening link has expired or is invalid. Pair again from the TV.",
        });
    req.token = token;
    req.review = session;
    next();
  };
  const prune = () => {
    for (const name of readdirSync(dataDir))
      if (TOKEN.test(name)) {
        if (uploadsInFlight.has(name) || [...nativeInFlight.values()].includes(name)) continue;
        const review = get(name);
        if (!review) rmSync(sessionDir(name), { recursive: true, force: true });
        else cleanupMedia(name, review);
      }
  };
  prune();
  const maintenance = setInterval(() => {
    try { prune(); } catch (error) { console.error('Could not prune companion media:', error); }
  }, pruneIntervalMs);
  maintenance.unref();
  app.locals.stopMaintenance = () => clearInterval(maintenance);
  app.get("/api/health", (req, res) => {
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i.family === "IPv4" && !i.internal)
      .map((i) => `http://${i.address}:${port}`);
    res.json({ name: "Cinemastamps", addresses, maxUploadMB: 250 });
  });
  app.post("/api/sessions", (req, res) => {
    prune();
    if (readdirSync(dataDir).filter((x) => TOKEN.test(x)).length >= 50)
      return res
        .status(429)
        .json({ error: "Too many active screenings. Try again later." });
    const body = req.body || {};
    const review = newReview();
    review.title = String(body.title || review.title).slice(0, 150);
    if (body.source?.kind === "url") {
      try {
        review.source = {
          id: randomBytes(8).toString("hex"),
          kind: "url",
          name: String(body.source.name).slice(0, 150),
          url: validateVideoUrl(body.source.url),
        };
      } catch {
        return res.status(400).json({ error: "Invalid video URL." });
      }
    }
    if (Array.isArray(body.stamps))
      review.stamps = body.stamps.filter(validStamp).slice(0, 2000);
    review.startedAt = Date.now();
    review.position = 0;
    review.revision = 1;
    const token = randomBytes(24).toString("hex");
    save(token, review);
    res.status(201).json({ token, review });
  });
  app.get("/api/session", auth, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(req.review);
  });
  const prepareNativeMedia = createNativeMedia();
  app.get("/api/native/pair", auth, async (req, res) => {
    const base = publicBase || `${req.protocol}://${req.get('host')}`;
    const url = `${base.replace(/\/$/, '')}/?companion=1#token=${req.token}`;
    res.set('Cache-Control', 'no-store').json({ url, qr: await QRCode.toDataURL(url, { width: 360, margin: 2 }) });
  });
  app.get("/api/native/media", auth, async (req, res) => {
    if (req.query.source !== req.review.source.id) return res.status(409).json({ error: 'The film changed. Refresh this screening.' });
    const { input, output } = nativePaths(req.review, sessionDir(req.token), webDir);
    const reserved = !existsSync(output) && !nativeInFlight.has(output);
    if (reserved) {
      assertCapacity(req.token, MAX_NATIVE_BYTES);
      nativeInFlight.set(output, req.token);
    }
    try { await prepareNativeMedia(input, output); }
    finally {
      if (reserved) nativeInFlight.delete(output);
      cleanupMedia(req.token, get(req.token));
    }
    if (get(req.token)?.source.id !== req.query.source) {
      cleanupMedia(req.token, get(req.token));
      return res.status(409).json({ error: 'The film changed while preparing playback.' });
    }
    res.once('close', () => cleanupAfterResponse(req.token));
    res.set('Cache-Control', 'private, no-store').type('video/mp4').sendFile(path.resolve(output));
  });
  app.put("/api/position", auth, (req, res) => {
    if (
      !Number.isFinite(req.body?.position) ||
      req.body.position < 0 ||
      req.body.position > 86400
    )
      return res.status(400).json({ error: "Invalid playback position." });
    req.review.position = req.body.position;
    save(req.token, req.review);
    res.sendStatus(204);
  });
  app.post("/api/stamps", auth, (req, res) => {
    const stamp = req.body;
    if (stamp?.sourceId && stamp.sourceId !== req.review.source.id)
      return res.status(409).json({ error: "The film changed before this stamp was saved. Stamp the new film instead." });
    if (!validStamp(stamp))
      return res.status(400).json({ error: "Invalid stamp." });
    if (req.review.stamps.some((s) => s.id === stamp.id))
      return res.json(req.review);
    if (req.review.stamps.length >= 2000)
      return res
        .status(400)
        .json({
          error:
            "This screening has reached 2,000 stamps. Export it and start a new review.",
        });
    req.review.stamps.push({
      id: stamp.id,
      kind: stamp.kind,
      time: stamp.time,
      note: stamp.note,
    });
    req.review.revision++;
    save(req.token, req.review);
    res.status(201).json(req.review);
  });
  app.patch("/api/stamps/:id", auth, (req, res) => {
    const stamp = req.review.stamps.find((s) => s.id === req.params.id);
    if (!stamp)
      return res.status(404).json({ error: "Stamp no longer exists." });
    if (typeof req.body?.note !== "string" || req.body.note.length > 4000)
      return res
        .status(400)
        .json({ error: "Notes must be under 4,000 characters." });
    stamp.note = req.body.note;
    req.review.revision++;
    save(req.token, req.review);
    res.json(req.review);
  });
  app.delete("/api/stamps/:id", auth, (req, res) => {
    req.review.stamps = req.review.stamps.filter((s) => s.id !== req.params.id);
    req.review.revision++;
    save(req.token, req.review);
    res.json(req.review);
  });
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, sessionDir(req.token)),
      filename: (req, file, cb) => {
        const name = `upload-${randomBytes(8).toString("hex")}${path.extname(file.originalname).toLowerCase()}`;
        uploadsInFlight.set(req.token, name);
        cb(null, name);
      },
    }),
    limits: { fileSize: maxUploadBytes, files: 1 },
    fileFilter: (req, file, cb) =>
      cb(
        /\.(mp4|webm)$/i.test(file.originalname)
          ? null
          : new Error("Choose an MP4 or WebM video."),
        /\.(mp4|webm)$/i.test(file.originalname),
      ),
  });
  const reserveUpload = (req, res, next) => {
    if (uploadsInFlight.has(req.token))
      return res.status(409).json({ error: 'A video is already uploading to this screening.' });
    assertCapacity(req.token, maxUploadBytes);
    uploadsInFlight.set(req.token, null);
    res.once('close', () => {
      uploadsInFlight.delete(req.token);
      cleanupAfterResponse(req.token);
    });
    next();
  };
  app.post("/api/video", auth, reserveUpload, upload.single("video"), (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: "Choose a video first." });
    // Reload after streaming the upload so notes written during it are not lost.
    const current = get(req.token);
    if (!current) {
      rmSync(req.file.path, { force: true });
      return res.status(401).json({ error: "Session expired. Pair again." });
    }
    const review = newReview({
      id: randomBytes(8).toString("hex"),
      kind: "upload",
      name: path.basename(req.file.originalname).slice(0, 150),
      file: req.file.filename,
    });
    review.startedAt = current.startedAt;
    review.position = 0;
    review.revision = current.revision + 1;
    save(req.token, review);
    cleanupMedia(req.token, review);
    res.json(review);
  });
  app.put("/api/source", auth, (req, res) => {
    if (uploadsInFlight.has(req.token))
      return res.status(409).json({ error: 'Wait for the video upload to finish.' });
    let source;
    try {
      source =
        req.body?.kind === "demo"
          ? DEMO
          : {
              id: randomBytes(8).toString("hex"),
              kind: "url",
              name: String(req.body.name || "Untitled film").slice(0, 150),
              url: validateVideoUrl(req.body.url),
            };
    } catch {
      return res
        .status(400)
        .json({ error: "Use a direct HTTP or HTTPS video link." });
    }
    const review = {
      ...newReview(source),
      startedAt: req.review.startedAt,
      position: 0,
      revision: req.review.revision + 1,
    };
    save(req.token, review);
    cleanupMedia(req.token, review);
    res.json(review);
  });
  app.get("/api/video", auth, (req, res) => {
    if (req.review.source.kind !== "upload")
      return res.status(404).json({ error: "No uploaded video." });
    res.sendFile(path.resolve(sessionDir(req.token), req.review.source.file));
  });
  app.get("/api/export/:format", auth, (req, res) => {
    const format = req.params.format;
    if (!["json", "csv", "md"].includes(format)) return res.sendStatus(400);
    res
      .type(format === "json" ? "application/json" : "text/plain")
      .attachment(`cinemastamps-review.${format}`)
      .send(exportReview(req.review, format));
  });
  if (existsSync(webDir))
    app.use(express.static(webDir, { index: "index.html" }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `Video must be smaller than ${Math.ceil(maxUploadBytes / 1024 / 1024)} MB.`
        : err.message || "Request failed.";
    res.status(err.code === 'STORAGE_LIMIT' ? 507 : 400).json({ error: message });
  });
  return app;
}
