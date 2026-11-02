"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const oldId = "20261101T230000Z-aaaaaaaaaaaa";
const newId = "20261101T230100Z-bbbbbbbbbbbb";
function serve(getRelease) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "x-ordersawa-release": getRelease(), "content-type": "text/plain" });
    res.end(req.url);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
function freePort() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}
async function get(port, target) {
  const response = await fetch(`http://127.0.0.1:${port}${target}`);
  return { status: response.status, body: await response.text() };
}
test("gateway fails closed on release mismatch and restores prior release", async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "ordersawa-proxy-test-"));
  let apiId = oldId;
  let webId = oldId;
  const api = await serve(() => apiId);
  const web = await serve(() => webId);
  const port = await freePort();
  const active = (releaseId) => fs.writeFileSync(path.join(state, "active.json"), JSON.stringify({ releaseId }));
  active(oldId);
  const child = spawn(process.execPath, [path.join(__dirname, "proxy.cjs")], {
    env: { ...process.env, ORDERSAWA_DEMO_STATE_ROOT: state, ORDERSAWA_DEMO_TEST_MODE: "1",
      ORDERSAWA_DEMO_PROXY_PORT: String(port), ORDERSAWA_DEMO_API_PORT: String(api.address().port), ORDERSAWA_DEMO_WEB_PORT: String(web.address().port) },
    stdio: "ignore", windowsHide: true
  });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { if ((await get(port, "/__demo/version")).status === 200) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, "proxy should become ready");
    assert.equal((await get(port, "/api/public/menus/preview-ordersawa")).status, 200);
    active(newId);
    assert.equal((await get(port, "/__demo/version")).status, 503, "old upstream must not be advertised as new release");
    assert.equal((await get(port, "/api/public/menus/preview-ordersawa")).status, 503, "old API response must not pass through");
    apiId = newId; webId = newId;
    assert.equal((await get(port, "/__demo/version")).status, 200);
    fs.writeFileSync(path.join(state, "maintenance.flag"), "updating");
    assert.equal((await get(port, "/__demo/version")).status, 503);
    fs.unlinkSync(path.join(state, "maintenance.flag"));
    active(oldId); apiId = oldId; webId = oldId;
    assert.equal((await get(port, "/__demo/version")).status, 200, "rollback pointer and processes should restore readiness");
  } finally {
    child.kill();
    await Promise.all([new Promise((resolve) => api.close(resolve)), new Promise((resolve) => web.close(resolve))]);
    for (const file of ["active.json", "maintenance.flag"]) {
      const target = path.join(state, file);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    if (path.dirname(state) === os.tmpdir()) fs.rmdirSync(state);
  }
});
