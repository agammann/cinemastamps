import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "dist");
const target = path.resolve(root, "android/app/src/main/assets/web");
if (!existsSync(path.join(source, "index.html")))
  throw new Error("Run pnpm build first.");
if (
  path.relative(root, target) !==
  path.join("android", "app", "src", "main", "assets", "web")
)
  throw new Error("Unexpected asset path.");
console.log(`Refreshing generated assets inside ${target}`);
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
console.log("Web build copied into Android assets.");
