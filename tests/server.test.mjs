import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.mjs";
test("companion saves, edits, exports and deletes stamps with session authorization", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cinemastamps-test-"));
  const app = createApp({ dataDir: dir, webDir: path.join(dir, "absent") });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (route, body, method = "POST", token = "") =>
    fetch(base + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    assert.equal((await call("/api/session", null, "GET")).status, 401);
    const created = await (
      await call("/api/sessions", { title: "Test screening" })
    ).json();
    const token = created.token;
    assert.match(token, /^[a-f0-9]{48}$/);
    assert.equal(
      (
        await call(
          "/api/stamps",
          { id: "a", kind: "great", time: -2, note: "" },
          "POST",
          token,
        )
      ).status,
      400,
    );
    const stamp = {
      id: "a",
      kind: "great",
      time: 12.345,
      note: "Useful moment",
    };
    assert.equal((await call("/api/stamps", stamp, "POST", token)).status, 201);
    await call("/api/stamps", stamp, "POST", token);
    assert.equal(
      (await (await call("/api/session", null, "GET", token)).json()).stamps
        .length,
      1,
    );
    await call("/api/stamps/a", { note: "More precise note" }, "PATCH", token);
    const csv = await (
      await call("/api/export/csv", null, "GET", token)
    ).text();
    assert.ok(csv.includes("More precise note"));
    assert.equal(
      (await call("/api/position", { position: 5 }, "PUT", token)).status,
      204,
    );
    assert.equal(
      (await (await call("/api/session", null, "GET", token)).json()).stamps[0]
        .note,
      "More precise note",
    );
    await call("/api/stamps/a", null, "DELETE", token);
    assert.equal(
      (await (await call("/api/session", null, "GET", token)).json()).stamps
        .length,
      0,
    );
    assert.equal(
      (
        await fetch(base + "/api/sessions", {
          method: "POST",
          headers: {
            Origin: "https://unrelated.example",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    const form = new FormData();
    form.append("video", new Blob(["not accepted"]), "document.html");
    assert.equal(
      (
        await fetch(base + "/api/video", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        })
      ).status,
      400,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("health publishes an explicit public origin and only advertises interfaces in LAN mode", async () => {
  const original = os.networkInterfaces;
  let queries = 0;
  os.networkInterfaces = () => {
    queries++;
    return { fixture: [
      { family: "IPv4", internal: false, address: "192.0.2.20" },
      { family: "IPv4", internal: true, address: "127.0.0.1" },
    ] };
  };
  try {
    for (const options of [{},
      { publicBase: "http://127.0.0.1:14318/", advertiseAddresses: false },
      { publicBase: "http://127.0.0.1:14318/", advertiseAddresses: true },
    ]) {
      const { publicBase = "", advertiseAddresses = false } = options;
      const dir = mkdtempSync(path.join(os.tmpdir(), "cinemastamps-health-"));
      const app = createApp({ dataDir: dir, webDir: dir, port: 4318, ...options });
      const server = app.listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      try {
        const info = await (await fetch(base + "/api/health")).json();
        assert.equal(info.publicBase, publicBase ? "http://127.0.0.1:14318" : "");
        assert.deepEqual(info.addresses, advertiseAddresses ? ["http://192.0.2.20:4318"] : []);
        assert.equal(queries, advertiseAddresses ? 1 : 0);
        const { token } = await (await fetch(base + "/api/sessions", { method: "POST" })).json();
        const pairing = await (await fetch(base + "/api/native/pair", {
          headers: { Authorization: `Bearer ${token}` },
        })).json();
        assert.equal(pairing.url, `${publicBase ? "http://127.0.0.1:14318" : base}/?companion=1#token=${token}`);
      } finally {
        app.locals.stopMaintenance();
        await new Promise((resolve) => server.close(resolve));
        rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally { os.networkInterfaces = original; }
});
