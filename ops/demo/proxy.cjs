"use strict";
// Loopback-only, Access-protected Demo gateway. Never logs requests or secrets.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const state = process.env.ORDERSAWA_DEMO_STATE_ROOT;
if (!state) throw Error("Demo state directory missing");
const host = "127.0.0.1";
const testMode = process.env.ORDERSAWA_DEMO_TEST_MODE === "1";
const port = testMode ? Number(process.env.ORDERSAWA_DEMO_PROXY_PORT) : 3210;
const apiPort = testMode ? Number(process.env.ORDERSAWA_DEMO_API_PORT) : 5001;
const webPort = testMode ? Number(process.env.ORDERSAWA_DEMO_WEB_PORT) : 3102;
if (![port, apiPort, webPort].every((value) => Number.isInteger(value) && value > 1024 && value < 65536)) throw Error("Invalid Demo loopback port");
const demoSlug = /^\/m\/preview-ordersawa(?:\/|$)/;
const appPage = /^\/(?:login|dashboard|admin)(?:\/|$)/;
const nextAsset = /^\/_next\/(?:static\/|image(?:\?|$))/;
const demoApi = /^\/public\/menus\/preview-ordersawa(?:\/|$)/;
const privateApi = /^\/(?:auth|dashboard|admin)(?:\/|$)/;

function deny(res, status = 404, message = "Preview route unavailable") {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(message);
}
function active() {
  const value = JSON.parse(fs.readFileSync(path.join(state, "active.json"), "utf8"));
  if (!/^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{12}$/.test(value.releaseId)) throw Error("Bad release ID");
  return value.releaseId;
}

http.createServer((req, res) => {
  if (!req.url || !req.headers.host || !(req.headers.host === `127.0.0.1:${port}` || req.headers.host === "rydtest.ordersawa.com")) return deny(res, 403);
  let url;
  try { url = new URL(req.url, `http://${host}:${port}`); } catch { return deny(res); }
  const pathname = url.pathname;
  if (/%2f|%5c|\\|\.\./i.test(pathname) || pathname.endsWith(".map")) return deny(res);
  if (fs.existsSync(path.join(state, "maintenance.flag"))) return deny(res, 503, "Demo update in progress");
  let releaseId;
  try { releaseId = active(); } catch { return deny(res, 503, "Demo release unavailable"); }
  if (pathname === "/__demo/version" && req.method === "GET") {
    const check = async (target) => {
      const response = await fetch(target, { signal: AbortSignal.timeout(5000) });
      return response.ok && response.headers.get("x-ordersawa-release") === releaseId;
    };
    Promise.all([check(`http://127.0.0.1:${apiPort}/health`), check(`http://127.0.0.1:${webPort}/login`)])
      .then(([api, web]) => {
        if (!api || !web) return deny(res, 503, "Demo release mismatch");
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-OrderSawa-Release": releaseId });
        res.end(JSON.stringify({ ok: true, releaseId, api, web }));
      }).catch(() => deny(res, 503, "Demo upstream unavailable"));
    return;
  }
  if (pathname === "/" && req.method === "GET") {
    res.writeHead(302, { Location: "/login", "Cache-Control": "no-store" });
    return res.end();
  }
  const isApi = pathname.startsWith("/api/");
  const apiPath = isApi ? pathname.slice(4) : "";
  if (isApi && !(demoApi.test(apiPath) || privateApi.test(apiPath) || apiPath.startsWith("/uploads/"))) return deny(res);
  if (!isApi && !(demoSlug.test(pathname) || appPage.test(pathname) || nextAsset.test(pathname) || pathname === "/favicon.ico")) return deny(res);
  if (!isApi && !["GET", "HEAD"].includes(req.method)) return deny(res);
  if (isApi && !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(req.method)) return deny(res);
  const upstreamPort = isApi ? apiPort : webPort;
  const headers = { ...req.headers, host: `127.0.0.1:${upstreamPort}` };
  for (const key of ["origin", "cookie", "proxy-authorization", "cf-access-jwt-assertion", "x-forwarded-host", "x-forwarded-proto"]) delete headers[key];
  const upstream = http.request({ hostname: host, port: upstreamPort, path: isApi ? req.url.slice(4) : req.url, method: req.method, headers, timeout: 30000 }, (upstreamRes) => {
    if (upstreamRes.headers["x-ordersawa-release"] !== releaseId) {
      upstreamRes.resume();
      return deny(res, 503, "Demo release mismatch");
    }
    res.writeHead(upstreamRes.statusCode || 502, { ...upstreamRes.headers, "Cache-Control": "no-store", "X-Preview-Only": "1", "X-OrderSawa-Release": releaseId });
    upstreamRes.pipe(res);
  });
  upstream.on("timeout", () => upstream.destroy(new Error("Demo upstream timeout")));
  upstream.on("error", () => { if (!res.headersSent) deny(res, 502, "Demo temporarily unavailable"); else res.end(); });
  req.pipe(upstream);
}).listen(port, host, () => process.stdout.write(`Demo gateway ready on ${host}:${port}\n`));
