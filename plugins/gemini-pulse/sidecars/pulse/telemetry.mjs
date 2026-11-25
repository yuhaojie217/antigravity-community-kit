import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const HOME = homedir();
const AGY_DIR = join(HOME, ".gemini", "antigravity");
const BRAIN_DIR = join(AGY_DIR, "brain");
const DB_PATH = join(AGY_DIR, "conversation_summaries.db");
const CONFIG_DIR = join(HOME, ".gemini", "config");
const DATA_DIR = process.env.ANTIGRAVITY_SIDECAR_DATA_DIR || join(AGY_DIR, "sidecar_data", "gemini-pulse");
const SETTINGS_PATH = join(DATA_DIR, "settings.json");

const DEFAULT_SETTINGS = {
  capMode: "compact",  // "compact" (512K Antigravity auto-compaction ceiling) | "physical" (1M real model window)
  themeHint: "auto"    // "auto" | "google" | "claude" | "dark"
};

export function loadSettings() {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
      return { ...DEFAULT_SETTINGS, ...raw };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...(patch || {}) };
  if (next.capMode !== "compact" && next.capMode !== "physical") next.capMode = "compact";
  try {
    mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2), "utf8");
  } catch {}
  return next;
}

// ---------------- Language Server Official Quota & Models ----------------

let quotaCache = {
  ts: 0,
  lastTryTs: 0,
  pools: [],
  modelCaps: {},
  account: "",
  error: null
};

function normalizeLoopbackBaseUrl(rawAddr) {
  const s = String(rawAddr || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const h = u.hostname.toLowerCase();
      if (h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]") return s;
    } catch {}
    return "";
  }
  if (/^(127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/i.test(s)) {
    return `http://${s}`;
  }
  return "";
}

function postLoopbackJson(fullUrl, csrfToken, bodyObj, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(fullUrl);
    } catch (e) {
      reject(e);
      return;
    }
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;
    const payload = Buffer.from(JSON.stringify(bodyObj || {}), "utf8");

    const req = mod.request(
      {
        hostname: parsed.hostname.replace(/^\[|\]$/g, ""),
        port: Number(parsed.port || (isHttps ? 443 : 80)),
        path: parsed.pathname + parsed.search,
        method: "POST",
        rejectUnauthorized: false,
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
          "Content-Length": payload.length,
          ...(csrfToken
            ? {
                "x-codeium-csrf-token": csrfToken,
                "x-antigravity-csrf-token": csrfToken
              }
            : {})
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(text || "{}"));
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function callLsMethod(method, body = {}, timeoutMs = 4500) {
  const baseUrl = normalizeLoopbackBaseUrl(process.env.ANTIGRAVITY_LS_ADDRESS);
  const csrf = String(process.env.ANTIGRAVITY_CSRF_TOKEN || "").trim();
  if (!baseUrl) throw new Error("LS address unavailable");
  const url = `${baseUrl}/exa.language_server_pb.LanguageServerService/${method}`;
  try {
    return await postLoopbackJson(url, csrf, body, timeoutMs);
  } catch (err) {
    if (url.startsWith("http://")) {
      const httpsUrl = "https://" + url.slice("http://".length);
      return await postLoopbackJson(httpsUrl, csrf, body, timeoutMs);
    }
    throw err;
  }
}

function parseIsoMs(iso) {
  if (!iso || typeof iso !== "string") return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function quotaWindow(bucket) {
  const period = [bucket.window, bucket.windowType, bucket.displayName, bucket.bucketId, bucket.name]
    .filter(Boolean).join(" ").toLowerCase();
  if (/weekly|\bweek\b|7[-_ ]?(?:d\b|days?)|604800s|每周|周限/.test(period)) return "windowWeekly";
  if (/5\s*[-_]?\s*h(?:ours?)?\b|five[-_ ]?hours?|18000s|5\s*小时/.test(period)) return "window5h";
  return null;
}

function normalizeQuotaBucket(bucket, now) {
  const remaining = bucket.remaining;
  const fraction = bucket.remainingFraction ?? remaining?.remainingFraction ??
    (remaining?.case === "remainingFraction" ? remaining.value : undefined);
  let value = typeof fraction === "number" ? fraction :
    typeof bucket.remainingPercentage === "number" ? bucket.remainingPercentage / 100 : null;
  if (bucket.disabled || !Number.isFinite(value)) value = null;
  if (value !== null) value = Math.max(0, Math.min(1, value));
  const stamp = bucket.resetTime ?? bucket.refreshTime ?? bucket.expiresAt;
  const resetMs = typeof stamp === "object" && stamp?.seconds != null ?
    1000 * Number(stamp.seconds) : parseIsoMs(stamp);
  const remainingPct = value === null ? null : Math.round(100 * value);
  return {
    remainingFraction: value, remainingPct, usedPct: remainingPct === null ? null : 100 - remainingPct,
    resetTime: resetMs > 0 ? new Date(resetMs).toISOString() : null,
    resetInSec: resetMs > now ? Math.round((resetMs - now) / 1000) : null,
    disabled: Boolean(bucket.disabled)
  };
}

function quotaFamily(label) {
  if (/claude|gpt|anthropic|third[-_ ]?party|non[-_ ]?gemini|sonnet|opus/i.test(label)) return "claude_gpt";
  if (/carbon/i.test(label)) return "carbon";
  if (/argon/i.test(label)) return "argon";
  if (/gemini|google|orchestrat/i.test(label)) return "gemini";
  return "";
}

function readQuotaGroups(summary, now) {
  const groups = Array.isArray(summary?.groups) ? summary.groups : [];
  // Older responses may supply flat buckets. Keep the model group on each one.
  let source = groups;
  if (!groups.length && Array.isArray(summary?.buckets)) {
    const byGroup = new Map();
    for (const bucket of summary.buckets) {
      const id = bucket.groupId || bucket.groupName || quotaFamily(bucket.bucketId || bucket.name || "") || "quota";
      if (!byGroup.has(id)) byGroup.set(id, {groupId: id, displayName: bucket.groupName || id, buckets: []});
      byGroup.get(id).buckets.push(bucket);
    }
    source = [...byGroup.values()];
  }
  return source.map((group, i) => {
    const label = group.displayName || group.name || group.title || group.groupId || "模型额度";
    const family = quotaFamily(label) || quotaFamily(group.groupId || group.id || "");
    const key = String(group.groupId || group.id || family || label || i);
    const pool = {key, label, family, accent: family === "claude_gpt" ? "amber" : "blue", models: [], window5h: null, windowWeekly: null};
    for (const bucket of Array.isArray(group.buckets) ? group.buckets : [group]) {
      const window = quotaWindow(bucket);
      if (window) pool[window] = normalizeQuotaBucket(bucket, now);
    }
    return pool;
  }).filter(pool => pool.window5h || pool.windowWeekly);
}

function activeQuotaPool(pools, model) {
  const family = quotaFamily(model || "");
  return pools.find(pool => family && pool.family === family) ||
    (["carbon", "argon"].includes(family) ? pools.find(pool => pool.family === "gemini") : null) ||
    (pools.length === 1 ? pools[0] : null);
}

const STATIC_META_TTL_MS = 60 * 60 * 1000; // 1 hour cache for static model caps & plan label
const STATIC_META_RETRY_MS = 5 * 60 * 1000; // 5 min retry backoff on failure

let staticMetaCache = {
  ts: 0,
  lastTryTs: 0,
  modelCaps: {},
  account: ""
};
let pendingStaticMeta = null;

let pendingQuota = null;
let pendingForcedQuota = null;

async function ensureStaticMeta(force = false) {
  const now = Date.now();
  if (pendingStaticMeta) return pendingStaticMeta;
  const hasCaps = Object.keys(staticMetaCache.modelCaps).length > 0;
  if (!force && staticMetaCache.ts > 0 && now - staticMetaCache.ts < STATIC_META_TTL_MS && hasCaps) {
    return staticMetaCache;
  }
  if (!force && staticMetaCache.lastTryTs > 0 && now - staticMetaCache.lastTryTs < STATIC_META_RETRY_MS) {
    return staticMetaCache;
  }
  pendingStaticMeta = (async () => {
    staticMetaCache.lastTryTs = Date.now();
    const [status, models] = await Promise.allSettled([
      callLsMethod("GetUserStatus", {}, 3500),
      callLsMethod("GetAvailableModels", {}, 4000)
    ]);
    const caps = { ...staticMetaCache.modelCaps };
    if (models.status === "fulfilled" && models.value) {
      const catalog = models.value?.response?.models ?? models.value?.models ?? {};
      for (const [key, info] of Object.entries(catalog)) {
        if (Number(info?.maxTokens) > 0) {
          caps[key.toLowerCase()] = Number(info.maxTokens);
          if (info.model) caps[String(info.model).toLowerCase()] = Number(info.maxTokens);
        }
      }
    }
    let account = staticMetaCache.account;
    if (status.status === "fulfilled" && status.value) {
      const user = status.value?.userStatus || status.value?.response?.userStatus || {};
      const plan = user.planStatus?.planInfo?.planName || user.tierName || user.planName || "";
      if (plan) account = String(plan);
    }
    staticMetaCache = {
      ts: Object.keys(caps).length > 0 ? Date.now() : staticMetaCache.ts,
      lastTryTs: staticMetaCache.lastTryTs,
      modelCaps: caps,
      account
    };
    return staticMetaCache;
  })().finally(() => { pendingStaticMeta = null; });
  return pendingStaticMeta;
}

export async function fetchQuotaSnapshot(force = false) {
  const now = Date.now();
  if (pendingForcedQuota) return pendingForcedQuota;
  if (pendingQuota && !force) return pendingQuota;
  if (!force && !quotaCache.error && quotaCache.ts && now - quotaCache.ts < 12000) return { ...quotaCache, stale: false };
  if (!force && quotaCache.error && now - quotaCache.lastTryTs < 5000) return { ...quotaCache, stale: true };
  if (force) {
    pendingForcedQuota = (pendingQuota || Promise.resolve()).then(() => loadQuota(true))
      .finally(() => { pendingForcedQuota = null; });
    return pendingForcedQuota;
  }
  pendingQuota = loadQuota(false).finally(() => { pendingQuota = null; });
  return pendingQuota;
}

async function loadQuota(force) {
  quotaCache.lastTryTs = Date.now();
  // Daily 12s poll only calls lightweight RetrieveUserQuotaSummary (~1.9KB);
  // GetUserStatus (~72KB) & GetAvailableModels (~330KB) are cached for 1 hour.
  const [quota, meta] = await Promise.allSettled([
    callLsMethod("RetrieveUserQuotaSummary", { forceRefresh: force }, 5000),
    ensureStaticMeta(false)
  ]);
  const resolvedMeta = meta.status === "fulfilled" ? meta.value : staticMetaCache;
  quotaCache.modelCaps = resolvedMeta.modelCaps;
  quotaCache.account = resolvedMeta.account || quotaCache.account;

  const summary = quota.status === "fulfilled" ? (quota.value?.response ?? quota.value) : null;
  const now = Date.now();
  const pools = readQuotaGroups(summary, now);
  if (pools.length) {
    quotaCache = { ...quotaCache, pools, ts: now, error: null };
    return { ...quotaCache, stale: false };
  }
  quotaCache.error = quota.status === "rejected" ? "宿主额度接口暂时不可用" : "宿主未返回五小时或每周额度";
  return { ...quotaCache, stale: true };
}

// ---------------- Local Workspace Overhead Estimation ----------------

let staticOverheadCache = { ts: 0, rulesTokens: 1200, skillsTokens: 2400, mcpTokens: 2800 };

function getStaticPromptOverhead() {
  const now = Date.now();
  if (now - staticOverheadCache.ts < 30000) return staticOverheadCache;
  let rulesChars = 0;
  let skillsCount = 0;
  let mcpToolsCount = 0;
  try {
    const geminiMd = join(HOME, ".gemini", "GEMINI.md");
    if (existsSync(geminiMd)) rulesChars += statSync(geminiMd).size;
    const rulesDir = join(CONFIG_DIR, "rules");
    if (existsSync(rulesDir)) {
      for (const f of readdirSync(rulesDir)) {
        try { rulesChars += statSync(join(rulesDir, f)).size; } catch {}
      }
    }
    const skillsDir = join(CONFIG_DIR, "skills");
    if (existsSync(skillsDir)) skillsCount += readdirSync(skillsDir).length;
    const pluginsDir = join(CONFIG_DIR, "plugins");
    if (existsSync(pluginsDir)) skillsCount += readdirSync(pluginsDir).length * 2;
    const mcpRoot = join(AGY_DIR, "mcp");
    if (existsSync(mcpRoot)) {
      for (const srv of readdirSync(mcpRoot)) {
        try { mcpToolsCount += readdirSync(join(mcpRoot, srv)).filter((x) => x.endsWith(".json")).length; } catch {}
      }
    }
  } catch {}
  staticOverheadCache = {
    ts: now,
    rulesTokens: Math.max(600, Math.round(rulesChars / 3.2)),
    skillsTokens: Math.max(900, skillsCount * 115),
    mcpTokens: Math.max(1200, 2200 + mcpToolsCount * 55)
  };
  return staticOverheadCache;
}

// ---------------- Conversation Discovery & Transcript Parsing ----------------

export function listConversations(limit = 16) {
  const items = [];
  if (existsSync(DB_PATH)) {
    let db = null;
    try {
      db = new DatabaseSync(DB_PATH, { readOnly: true });
      const rows = db.prepare(`
        SELECT conversation_id, title, last_user_input_time, last_modified_time
        FROM conversation_summaries
        WHERE nesting_depth = 0
          AND source != 'CORTEX_TRAJECTORY_SOURCE_CLI'
        ORDER BY last_modified_time DESC, last_user_input_time DESC
        LIMIT ?
      `).all(limit * 2);

      for (const row of rows) {
        const id = row.conversation_id;
        const logPath = join(BRAIN_DIR, id, ".system_generated", "logs", "transcript.jsonl");
        if (!existsSync(logPath)) continue;
        try {
          const st = statSync(logPath);
          items.push({ id, title: row.title || "", logPath, mtimeMs: st.mtimeMs, size: st.size });
          if (items.length >= limit) break;
        } catch {}
      }
    } catch {} finally {
      try { db?.close(); } catch {}
    }
  }

  if (items.length === 0 && existsSync(BRAIN_DIR)) {
    try {
      for (const ent of readdirSync(BRAIN_DIR, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const logPath = join(BRAIN_DIR, ent.name, ".system_generated", "logs", "transcript.jsonl");
        if (!existsSync(logPath)) continue;
        try {
          const st = statSync(logPath);
          items.push({ id: ent.name, title: "", logPath, mtimeMs: st.mtimeMs, size: st.size });
        } catch {}
      }
    } catch {}
  }

  // Always sort by actual transcript mtimeMs descending so the currently streaming chat is #1
  items.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return items.slice(0, limit);
}

export function resolveModelLimits(modelId, modelCaps = {}, capMode = "compact") {
  const id = String(modelId || "").toLowerCase();
  let physicalCap = modelCaps[id] || 1048576;
  if (/gpt-oss-120b/i.test(id)) physicalCap = modelCaps[id] || 131072;
  else if (/claude|sonnet|opus/i.test(id)) physicalCap = modelCaps[id] || 1000000;
  else if (/gpt/i.test(id)) physicalCap = modelCaps[id] || 256000;

  // Antigravity triggers automatic compaction (CHECKPOINT) around 512K tokens on 1M-class models.
  const compactCap = Math.min(524288, physicalCap);

  const effectiveLimit = capMode === "physical" ? physicalCap : compactCap;
  return {
    effectiveLimit,
    compactCap,
    physicalCap,
    capMode
  };
}

export function humanizeModelName(modelId) {
  const s = String(modelId || "").trim();
  if (!s || s === "unknown") return "上下文自动压缩";
  if (/flash-worker/i.test(s)) return "Gemini Flash · 子任务";
  return s
    .replace(/^gemini-(\d(?:\.\d)?)-([a-z]+)-([a-z]+)$/i, (_, v, tier, eff) =>
      `Gemini ${v} ${tier.charAt(0).toUpperCase() + tier.slice(1)} · ${eff.toUpperCase()}`
    )
    .replace(/^claude-([a-z]+)-(\d+)-(\d+)-([a-z]+)$/i, (_, t, a, b, eff) =>
      `Claude ${t.charAt(0).toUpperCase() + t.slice(1)} ${a}.${b} · ${eff.toUpperCase()}`
    );
}

const transcriptMemo = new Map();

export function parseConversationTranscript(logPath, modelCaps = {}, capMode = "compact") {
  let st;
  try {
    st = statSync(logPath);
  } catch {
    return null;
  }
  const memoKey = `${logPath}:${capMode}`;
  const hit = transcriptMemo.get(memoKey);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    return hit.data;
  }

  let raw = "";
  try {
    raw = readFileSync(logPath, "utf8");
  } catch {
    return null;
  }

  const events = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try { events.push(JSON.parse(t)); } catch {}
  }

  let turns = 0;
  let steps = 0;
  let totalInput = 0;
  let totalCacheRead = 0;
  let totalOutput = 0;
  let validDurationSec = 0;
  let validOutputTokens = 0;
  let latestContextTokens = 0;
  let latestInputTokens = 0;
  let latestCacheTokens = 0;
  let latestOutputTokens = 0;
  let latestCacheHitPct = 0;
  let latestStepTokPerSec = 0;
  let activeModel = "";
  let titlePreview = "";

  // Rough character counters for proportional context anatomy
  let userReplyChars = 0;
  let toolIoChars = 0;
  let thinkingChars = 0;

  const stepHistory = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.source === "USER_EXPLICIT" && ev.type === "USER_INPUT") {
      turns += 1;
      const c = typeof ev.content === "string" ? ev.content : JSON.stringify(ev.content || "");
      userReplyChars += c.length;
      if (!titlePreview && typeof ev.content === "string") {
        const m = ev.content.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
        titlePreview = (m ? m[1] : ev.content).replace(/\s+/g, " ").trim().slice(0, 44);
      }
      continue;
    }

    if (ev.type === "TOOL_RESULT" || ev.type === "OBSERVATION" || ev.source === "TOOL") {
      const c = JSON.stringify(ev);
      toolIoChars += c.length;
    }

    if (ev.type === "PLANNER_RESPONSE") {
      steps += 1;
      const inTok = Number(ev.input_tokens || 0);
      const cacheTok = Number(ev.cache_read_tokens || 0);
      const outTok = Number(ev.output_tokens || 0);
      if (ev.model) activeModel = String(ev.model);

      if (ev.thinking) thinkingChars += String(ev.thinking).length;
      if (ev.response || ev.content) userReplyChars += String(ev.response || ev.content).length;
      if (ev.tool_calls) toolIoChars += JSON.stringify(ev.tool_calls).length * 2.2;

      totalInput += inTok;
      totalCacheRead += cacheTok;
      totalOutput += outTok;

      const promptTok = inTok + cacheTok;
      const stepCachePct = promptTok > 0 ? (cacheTok / promptTok) * 100 : 0;
      if (promptTok + outTok > 0) {
        latestContextTokens = promptTok + outTok;
        latestInputTokens = inTok;
        latestCacheTokens = cacheTok;
        latestOutputTokens = outTok;
        latestCacheHitPct = stepCachePct;
      }

      let durationSec = 0;
      const currTs = parseIsoMs(ev.created_at);
      const prevTs = i > 0 ? parseIsoMs(events[i - 1]?.created_at) : 0;
      const nextTs = i + 1 < events.length && events[i + 1]?.type !== "USER_INPUT" ? parseIsoMs(events[i + 1]?.created_at) : 0;

      if (currTs > 0 && prevTs > 0) {
        const d = (currTs - prevTs) / 1000;
        if (d >= 0.35 && d <= 180) durationSec = d;
      }
      if (durationSec === 0 && currTs > 0 && nextTs > 0) {
        const d = (nextTs - currTs) / 1000;
        if (d >= 0.35 && d <= 180) durationSec = d;
      }

      let stepTokPerSec = 0;
      if (durationSec >= 1.2 && outTok > 0) {
        const cand = outTok / durationSec;
        if (cand <= 320) {
          stepTokPerSec = cand;
          validDurationSec += durationSec;
          validOutputTokens += outTok;
          latestStepTokPerSec = stepTokPerSec;
        }
      }

      stepHistory.push({
        step: steps,
        model: ev.model || activeModel || "",
        modelShort: humanizeModelName(ev.model || activeModel || ""),
        inputTokens: inTok,
        cacheReadTokens: cacheTok,
        outputTokens: outTok,
        contextTokens: promptTok + outTok,
        cacheHitPct: Number(stepCachePct.toFixed(1)),
        durationSec: Number(durationSec.toFixed(1)),
        tokPerSec: Number(stepTokPerSec.toFixed(1)),
        createdAt: ev.created_at || null
      });
    }
  }

  const limits = resolveModelLimits(activeModel, modelCaps, capMode);
  const contextLimit = limits.effectiveLimit;
  const contextPct = contextLimit > 0 ? Math.min(100, (latestContextTokens / contextLimit) * 100) : 0;
  const cumulativeTokens = totalInput + totalCacheRead + totalOutput;
  const totalPromptAll = totalInput + totalCacheRead;
  const avgCacheHitPct = totalPromptAll > 0 ? (totalCacheRead / totalPromptAll) * 100 : 0;
  const avgTokPerSec = validDurationSec > 0 ? validOutputTokens / validDurationSec : 0;

  // Compute proportional 5-part context breakdown summing cleanly to latestContextTokens
  const overhead = getStaticPromptOverhead();
  let breakdown = [];
  if (latestContextTokens > 0) {
    const fixedSys = Math.min(Math.round(latestContextTokens * 0.42), overhead.mcpTokens + 3200);
    const fixedRules = Math.min(Math.round(latestContextTokens * 0.26), overhead.rulesTokens + overhead.skillsTokens);
    const dynamicBudget = Math.max(0, latestContextTokens - fixedSys - fixedRules);

    const wMsg = Math.max(200, userReplyChars);
    const wTool = Math.max(200, toolIoChars * 1.4);
    const wThink = Math.max(80, thinkingChars * 0.7);
    const wSum = wMsg + wTool + wThink;

    const tokMsg = Math.round((dynamicBudget * wMsg) / wSum);
    const tokThink = Math.round((dynamicBudget * wThink) / wSum);
    const tokTool = Math.max(0, dynamicBudget - tokMsg - tokThink);

    const rawItems = [
      { key: "tools", label: "工具与终端输出", tokens: tokTool },
      { key: "messages", label: "对话与回复正文", tokens: tokMsg },
      { key: "system", label: "系统底座与 MCP", tokens: fixedSys },
      { key: "rules", label: "全局规则与技能", tokens: fixedRules },
      { key: "thinking", label: "模型思考链", tokens: tokThink }
    ];
    breakdown = rawItems.map((it) => ({
      ...it,
      pct: Number(((it.tokens / latestContextTokens) * 100).toFixed(1))
    }));
  }

  const result = {
    turns,
    steps,
    activeModel,
    activeModelLabel: humanizeModelName(activeModel),
    titlePreview,
    totalInput,
    totalCacheRead,
    totalOutput,
    cumulativeTokens,
    avgCacheHitPct: Number(avgCacheHitPct.toFixed(1)),
    latestCacheHitPct: Number(latestCacheHitPct.toFixed(1)),
    avgTokPerSec: Number(avgTokPerSec.toFixed(1)),
    latestStepTokPerSec: Number(latestStepTokPerSec.toFixed(1)),
    latestContextTokens,
    latestInputTokens,
    latestCacheTokens,
    latestOutputTokens,
    contextLimit,
    compactCap: limits.compactCap,
    physicalCap: limits.physicalCap,
    capMode: limits.capMode,
    contextPct: Number(contextPct.toFixed(1)),
    remainingPct: Number(Math.max(0, 100 - contextPct).toFixed(1)),
    breakdown,
    recentSteps: stepHistory.slice(-20).reverse(),
    updatedAt: new Date().toISOString()
  };

  if (transcriptMemo.size > 40) transcriptMemo.clear();
  transcriptMemo.set(memoKey, { mtimeMs: st.mtimeMs, size: st.size, data: result });
  return result;
}

// ---------------- 7-Day Multi-Session Trend Aggregator ----------------

let sevenDayCache = { ts: 0, days: [], models: [], totals: { tokens: 0, cacheSavedPct: 0 } };
const perFileDayMemo = new Map();

export function buildSevenDayTrend() {
  const now = Date.now();
  if (now - sevenDayCache.ts < 15000 && sevenDayCache.days.length > 0) {
    return sevenDayCache;
  }

  const dayKeys = [];
  const dayBuckets = new Map();
  for (let d = 6; d >= 0; d--) {
    const dt = new Date(now - d * 86400000);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const shortLabel = d === 0 ? "今日" : `${dt.getMonth() + 1}/${dt.getDate()}`;
    dayKeys.push(key);
    dayBuckets.set(key, { date: key, label: shortLabel, input: 0, cache: 0, output: 0, total: 0 });
  }
  const cutoffMs = now - 7.5 * 86400000;
  const modelMap = new Map();

  if (existsSync(BRAIN_DIR)) {
    try {
      for (const ent of readdirSync(BRAIN_DIR, { withFileTypes: true })) {
        if (!ent.isDirectory()) continue;
        const lp = join(BRAIN_DIR, ent.name, ".system_generated", "logs", "transcript.jsonl");
        if (!existsSync(lp)) continue;
        let st;
        try { st = statSync(lp); } catch { continue; }
        if (st.mtimeMs < cutoffMs) continue;

        let fileRecords = perFileDayMemo.get(lp);
        if (!fileRecords || fileRecords.mtimeMs !== st.mtimeMs || fileRecords.size !== st.size) {
          const recs = [];
          try {
            const txt = readFileSync(lp, "utf8");
            for (const line of txt.split(/\r?\n/)) {
              if (!line.includes("PLANNER_RESPONSE")) continue;
              const ev = JSON.parse(line);
              if (ev.type !== "PLANNER_RESPONSE") continue;
              const ms = parseIsoMs(ev.created_at) || st.mtimeMs;
              const dt = new Date(ms);
              const dk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
              recs.push({
                dk,
                model: String(ev.model || "unknown"),
                inTok: Number(ev.input_tokens || 0),
                cacheTok: Number(ev.cache_read_tokens || 0),
                outTok: Number(ev.output_tokens || 0)
              });
            }
          } catch {}
          fileRecords = { mtimeMs: st.mtimeMs, size: st.size, recs };
          perFileDayMemo.set(lp, fileRecords);
        }

        for (const r of fileRecords.recs) {
          const b = dayBuckets.get(r.dk);
          if (!b) continue;
          const tot = r.inTok + r.cacheTok + r.outTok;
          b.input += r.inTok;
          b.cache += r.cacheTok;
          b.output += r.outTok;
          b.total += tot;

          const mPrev = modelMap.get(r.model) || { model: r.model, label: humanizeModelName(r.model), total: 0, output: 0, cache: 0, steps: 0 };
          mPrev.total += tot;
          mPrev.output += r.outTok;
          mPrev.cache += r.cacheTok;
          mPrev.steps += 1;
          modelMap.set(r.model, mPrev);
        }
      }
    } catch {}
  }

  const days = dayKeys.map((k) => dayBuckets.get(k));
  const totalTok = days.reduce((s, x) => s + x.total, 0);
  const totalPrompt = days.reduce((s, x) => s + x.input + x.cache, 0);
  const totalCache = days.reduce((s, x) => s + x.cache, 0);

  const models = [...modelMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((m) => ({
      ...m,
      sharePct: totalTok > 0 ? Number(((m.total / totalTok) * 100).toFixed(1)) : 0
    }));

  sevenDayCache = {
    ts: now,
    days,
    models,
    totals: {
      tokens: totalTok,
      output: days.reduce((s, x) => s + x.output, 0),
      cacheHitPct: totalPrompt > 0 ? Number(((totalCache / totalPrompt) * 100).toFixed(1)) : 0
    }
  };
  return sevenDayCache;
}

export async function buildFullTelemetryPayload({ convId = "auto", forceQuota = false, compact = false } = {}) {
  const settings = loadSettings();
  const quota = await fetchQuotaSnapshot(forceQuota);
  const conversations = listConversations(compact && convId === "auto" ? 1 : 15);

  let target = conversations[0] || null;
  if (convId && convId !== "auto") {
    const found = conversations.find((c) => c.id === convId);
    if (found) target = found;
  }

  const fullMetrics = target ? parseConversationTranscript(target.logPath, quota.modelCaps, settings.capMode) : null;
  const activePool = activeQuotaPool(quota.pools, [fullMetrics?.activeModelLabel, fullMetrics?.activeModel].filter(Boolean).join(" "));

  if (compact) {
    let metrics = null;
    if (fullMetrics) {
      const { recentSteps: _omitted, ...lite } = fullMetrics;
      metrics = lite;
    }
    return {
      activeConversationId: target ? target.id : null,
      activeTitle: (target && target.title) || fullMetrics?.titlePreview || "",
      settings,
      quota: {
        activePool,
        account: quota.account,
        stale: quota.stale,
        error: quota.error,
        fetchedAt: quota.ts ? new Date(quota.ts).toISOString() : null
      },
      metrics
    };
  }

  const trend7d = buildSevenDayTrend();

  return {
    activeConversationId: target ? target.id : null,
    activeTitle: (target && target.title) || fullMetrics?.titlePreview || "",
    mode: convId && convId !== "auto" ? "pinned" : "auto",
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title || "",
      mtimeMs: c.mtimeMs,
      size: c.size
    })),
    settings,
    quota: {
      pools: quota.pools,
      activePool,
      account: quota.account,
      stale: quota.stale,
      error: quota.error,
      fetchedAt: quota.ts ? new Date(quota.ts).toISOString() : null
    },
    metrics: fullMetrics,
    trend7d
  };
}
