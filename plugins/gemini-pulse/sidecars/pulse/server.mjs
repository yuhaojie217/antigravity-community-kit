import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFullTelemetryPayload, saveSettings } from "./telemetry.mjs";

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const UI_HTML_PATH = join(SELF_DIR, "ui.html");
const PORT = Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || 0);
const LOCAL_PORT_FILE = join(SELF_DIR, "port.txt");

function publishPort(actualPort) {
  try {
    writeFileSync(LOCAL_PORT_FILE, String(actualPort), "utf8");
  } catch {}
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let len = 0;
    req.on("data", (c) => {
      len += c.length;
      if (len < 65536) chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

async function handleRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://127.0.0.1");

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("ok");
    return;
  }

  if (url.pathname === "/api/settings" && req.method === "POST") {
    const body = await readJsonBody(req);
    const saved = saveSettings(body);
    const payload = await buildFullTelemetryPayload({ convId: body.conv || "auto", forceQuota: false, compact: false });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true, settings: saved, payload }));
    return;
  }

  if (url.pathname === "/api/metrics") {
    const convId = url.searchParams.get("conv") || "auto";
    const forceQuota = url.searchParams.get("refresh") === "1";
    const compact = url.searchParams.get("view") === "compact";
    const payload = await buildFullTelemetryPayload({ convId, forceQuota, compact });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(payload));
    return;
  }

  if (url.pathname === "/api/events") {
    const convId = url.searchParams.get("conv") || "auto";
    const compact = url.searchParams.get("view") === "compact";
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "Connection": "keep-alive"
    });

    let closed = false;
    let lastSig = "";

    const pushUpdate = async () => {
      if (closed) return;
      try {
        const payload = await buildFullTelemetryPayload({ convId, forceQuota: false, compact });
        if (closed) return;
        const ap = payload.quota?.activePool;
        const sig = JSON.stringify([
          payload.activeConversationId,
          payload.metrics?.steps,
          payload.metrics?.turns,
          payload.metrics?.cumulativeTokens,
          payload.metrics?.contextLimit,
          payload.metrics?.contextPct,
          payload.settings?.capMode,
          payload.quota?.fetchedAt,
          payload.quota?.account,
          ap?.window5h?.remainingPct,
          ap?.windowWeekly?.remainingPct,
          compact ? 1 : (payload.trend7d?.totals?.tokens || 0)
        ]);
        if (sig !== lastSig) {
          lastSig = sig;
          res.write("data: " + JSON.stringify(payload) + "\n\n");
        }
      } catch {}
    };

    void pushUpdate();
    const timer = setInterval(() => { void pushUpdate(); }, compact ? 1800 : 1500);
    req.on("close", () => {
      closed = true;
      clearInterval(timer);
    });
    return;
  }

  // Serve UI HTML fresh from disk for zero-restart UI iteration
  try {
    const html = existsSync(UI_HTML_PATH) ? readFileSync(UI_HTML_PATH, "utf8") : "<h1>UI missing</h1>";
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(String(err?.message || err));
  }
}

const server = createServer((req, res) => {
  void handleRequest(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : PORT;
  publishPort(actualPort);
  console.log(`[gemini-pulse] listening on http://127.0.0.1:${actualPort}`);
});
