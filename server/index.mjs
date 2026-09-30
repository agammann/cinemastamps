import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4318);
const host = process.argv.includes("--lan") ? "0.0.0.0" : "127.0.0.1";
const app = createApp({
  dataDir: path.join(root, "data"),
  webDir: path.join(root, "dist"),
  port,
  publicBase: process.env.PUBLIC_BASE_URL || "",
});
app.listen(port, host, () =>
  console.log(
    `Cinemastamps: http://127.0.0.1:${port} (${host === "0.0.0.0" ? "local-network companion enabled" : "this computer only"})`,
  ),
);
