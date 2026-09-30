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
} from "node:fs";
import path from "node:path";
import os from "node:os";
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
export function createApp({ dataDir, webDir, port = 4318 }) {
  mkdirSync(dataDir, { recursive: true });
  const app = express();
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
    writeFileSync(path.join(dir, "review.tmp"), JSON.stringify(review));
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
      if (TOKEN.test(name) && !get(name))
        rmSync(sessionDir(name), { recursive: true, force: true });
  };
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
      filename: (req, file, cb) =>
        cb(
          null,
          `upload-${randomBytes(8).toString("hex")}${path.extname(file.originalname).toLowerCase()}`,
        ),
    }),
    limits: { fileSize: 250 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) =>
      cb(
        /\.(mp4|webm)$/i.test(file.originalname)
          ? null
          : new Error("Choose an MP4 or WebM video."),
        /\.(mp4|webm)$/i.test(file.originalname),
      ),
  });
  app.post("/api/video", auth, upload.single("video"), (req, res) => {
    if (!req.file)
      return res.status(400).json({ error: "Choose a video first." });
    // Reload after streaming the upload so notes written during it are not lost.
    const current = get(req.token);
    if (!current) {
      rmSync(req.file.path, { force: true });
      return res.status(401).json({ error: "Session expired. Pair again." });
    }
    if (current.source.kind === "upload")
      rmSync(path.join(sessionDir(req.token), current.source.file), {
        force: true,
      });
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
    res.json(review);
  });
  app.put("/api/source", auth, (req, res) => {
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
        ? "Video must be smaller than 250 MB."
        : err.message || "Request failed.";
    res.status(400).json({ error: message });
  });
  return app;
}
