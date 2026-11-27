import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFullTelemetryPayload, saveSettings } from "./telemetry.mjs";

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const UI_HTML_PATH = join(SELF_DIR, "ui.html");
const BRAIN_DIR = join(homedir(), ".gemini", "antigravity", "brain");
const OUTFITS_DIR = join(homedir(), ".gemini", "antigravity", "custom_theme", "app", "outfits");
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

function normalizeLocalFilePath(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (!s) return "";
  if (/^file:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      s = decodeURIComponent(u.pathname || "");
      if (process.platform === "win32" && /^\/[A-Za-z]:/.test(s)) s = s.slice(1);
    } catch {
      s = s.replace(/^file:\/\/\/?/i, "");
      try { s = decodeURIComponent(s); } catch {}
    }
  }
  // Strip optional line range suffix like #L12-L40 or :12:5
  s = s.replace(/#L?\d+(?:-L?\d+)?$/i, "").replace(/#.*$/, "");
  s = s.replace(/:(\d+)(?::\d+)?$/, "");
  if (process.platform === "win32") {
    s = s.replace(/\//g, "\\");
  }
  return normalize(s);
}

function slugKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function resolveArtifactInBrain(title, convId) {
  if (!title || !existsSync(BRAIN_DIR)) return "";
  const targetSlug = slugKey(title);
  if (!targetSlug) return "";

  const dirsToScan = [];
  if (convId && /^[a-z0-9-]{8,64}$/i.test(convId)) {
    const exact = join(BRAIN_DIR, convId);
    if (existsSync(exact)) dirsToScan.push(exact);
  }

  try {
    const entries = readdirSync(BRAIN_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => {
        const full = join(BRAIN_DIR, d.name);
        let mtime = 0;
        try { mtime = statSync(full).mtimeMs; } catch {}
        return { full, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 24);
    for (const e of entries) {
      if (!dirsToScan.includes(e.full)) dirsToScan.push(e.full);
    }
  } catch {}

  for (const dir of dirsToScan) {
    let files = [];
    try { files = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const f of files) {
      if (!f.isFile()) continue;
      if (f.name.endsWith(".metadata.json")) continue;
      if (slugKey(f.name) === targetSlug) {
        return join(dir, f.name);
      }
    }
    // Secondary pass: check .metadata.json summary or artifact stem
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".metadata.json")) continue;
      const baseFile = join(dir, f.name.replace(/\.metadata\.json$/i, ""));
      if (!existsSync(baseFile)) continue;
      try {
        const meta = JSON.parse(readFileSync(join(dir, f.name), "utf8"));
        const combined = slugKey(meta.title || "") + "|" + slugKey(meta.summary || "");
        if (combined.includes(targetSlug)) return baseFile;
      } catch {}
    }
  }
  return "";
}

function runOsFileAction(action, targetPath) {
  return new Promise((resolve) => {
    if (!targetPath || !existsSync(targetPath)) {
      resolve({ ok: false, error: "path_not_found", path: targetPath });
      return;
    }
    let isDir = false;
    try { isDir = statSync(targetPath).isDirectory(); } catch {}

    if (process.platform === "win32") {
      if (action === "reveal") {
        const args = isDir ? [targetPath] : ["/select," + targetPath];
        execFile("explorer.exe", args, { windowsHide: false }, () => resolve({ ok: true, path: targetPath }));
        return;
      }
      if (action === "open") {
        execFile("cmd.exe", ["/d", "/c", "start", "", targetPath], { windowsHide: true }, (err) => {
          resolve(err ? { ok: false, error: String(err.message), path: targetPath } : { ok: true, path: targetPath });
        });
        return;
      }
      if (action === "open-with") {
        execFile("rundll32.exe", ["shell32.dll,OpenAs_RunDLL", targetPath], { windowsHide: false }, () => {
          resolve({ ok: true, path: targetPath });
        });
        return;
      }
    } else if (process.platform === "darwin") {
      const args = action === "reveal" && !isDir ? ["-R", targetPath] : [targetPath];
      execFile("open", args, () => resolve({ ok: true, path: targetPath }));
      return;
    } else {
      const target = action === "reveal" && !isDir ? dirname(targetPath) : targetPath;
      execFile("xdg-open", [target], () => resolve({ ok: true, path: targetPath }));
      return;
    }
    resolve({ ok: false, error: "unsupported_action", path: targetPath });
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

  // Lazy-load external character outfit frames (WebP/PNG) from custom_theme/app/outfits/<skin>/<pose>.webp
  const outfitMatch = url.pathname.match(/^\/outfits\/([a-z0-9_-]{2,24})\/([a-z0-9_-]{2,32}\.(?:webp|png))$/i);
  if (outfitMatch && req.method === "GET") {
    const [, skinDir, fileName] = outfitMatch;
    const fp = join(OUTFITS_DIR, skinDir, fileName);
    if (!existsSync(fp)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end("not found");
      return;
    }
    try {
      const buf = readFileSync(fp);
      const mime = fileName.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "public, max-age=3600" });
      res.end(buf);
    } catch {
      res.writeHead(500);
      res.end();
    }
    return;
  }

  if (url.pathname === "/api/local-open" && req.method === "POST") {
    const body = await readJsonBody(req);
    const action = String(body.action || "resolve");
    let targetPath = normalizeLocalFilePath(body.path || "");
    if ((!targetPath || !existsSync(targetPath)) && body.artifactTitle) {
      targetPath = resolveArtifactInBrain(String(body.artifactTitle), String(body.convId || ""));
    }
    const exists = Boolean(targetPath && existsSync(targetPath));
    let isDirectory = false;
    if (exists) {
      try { isDirectory = statSync(targetPath).isDirectory(); } catch {}
    }

    if (action === "resolve") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({
        ok: exists,
        exists,
        isDirectory,
        path: targetPath,
        name: targetPath ? basename(targetPath) : ""
      }));
      return;
    }

    if (!["reveal", "open", "open-with"].includes(action)) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "invalid_action" }));
      return;
    }

    const result = await runOsFileAction(action, targetPath);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ...result, name: targetPath ? basename(targetPath) : "", isDirectory }));
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
