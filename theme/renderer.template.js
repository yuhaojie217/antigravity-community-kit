// Antigravity · Hakimi Muse Companion + Codex Context Ring + Gemini Pulse Side Panel + i18n Engine
// Injected by dist/custom-theme-main.js on dom-ready inside an outer IIFE providing AGY_PHRASES & AGY_TELEMETRY_PORT.

const POSES = __HAKIMI_POSES__;
const AGY_THEMES = __AGY_THEMES__;
const THEME_STORE = 'agy-theme-mode:v1';
const DIAL_SOUND_STORE = 'agy-dial-sound:v1';
const MUSE_COLLAPSED_STORE = 'agy-hakimi-collapsed:v1';

const DIAL_THEMES = [
  { id: 'google',     short: '晨曦',   label: 'Google',  dot: '#3587ff', sliceBg: '#e8f0fe', sliceInk: '#1a73e8', say: 'Google 晨曦风' },
  { id: 'claude',     short: '暖纸',   label: 'Claude',  dot: '#d97757', sliceBg: '#f4e8de', sliceInk: '#b4532f', say: 'Claude 暖纸风' },
  { id: 'nebula',     short: '星云',   label: '星云紫',  dot: '#8839ef', sliceBg: '#ede4ff', sliceInk: '#7c3aed', say: '氖基米本命星云！' },
  { id: 'everforest', short: '抹茶',   label: '抹茶绿',  dot: '#3a7d54', sliceBg: '#e2efe2', sliceInk: '#2f6f47', say: '护眼林间抹茶～' },
  { id: 'kanagawa',   short: '浪涌',   label: '神奈川',  dot: '#264c7d', sliceBg: '#e6e4d5', sliceInk: '#1f3a5f', say: '神奈川浮世浪涌！' },
  { id: 'bauhaus',    short: '包豪斯', label: '包豪斯',  dot: '#d13429', sliceBg: '#f6ebc4', sliceInk: '#b91c1c', say: '包豪斯几何印刷风' },
];
const VALID_THEME_IDS = new Set([...DIAL_THEMES.map((x) => x.id), 'off']);
const OUTFIT_CANDIDATE_THEMES = new Set(['claude', 'everforest', 'kanagawa', 'bauhaus', 'nebula']);
const OUTFIT_POSE_KEYS = ['idle', 'write1', 'write2', 'laptop1', 'laptop2', 'done', 'sleepy'];
const OUTFIT_CACHE = Object.create(null); // { [theme]: { [pose]: url } }
const OUTFIT_INFLIGHT = Object.create(null);

function readThemeMode() {
  try {
    const v = localStorage.getItem(THEME_STORE);
    return VALID_THEME_IDS.has(v) ? v : 'google';
  } catch (_) {
    return 'google';
  }
}

function isHostDarkMode() {
  const b = document.body;
  const h = document.documentElement;
  return !!(
    (b && (b.classList.contains('theme-dark') || b.classList.contains('dark'))) ||
    (h && (h.classList.contains('dark') || h.getAttribute('data-theme') === 'dark'))
  );
}

const TITLEBAR_COLORS = {
  google:     { light: ['#eef3fa', '#1b1f24'], dark: ['#0b0f15', '#e8edf4'] },
  claude:     { light: ['#eee9de', '#2b2723'], dark: ['#151310', '#ece7df'] },
  nebula:     { light: ['#eee8fb', '#231e33'], dark: ['#181825', '#cdd6f4'] },
  everforest: { light: ['#e7efe3', '#223026'], dark: ['#1c221f', '#d3c6aa'] },
  kanagawa:   { light: ['#e7e0cb', '#272520'], dark: ['#16161d', '#dcd7ba'] },
  bauhaus:    { light: ['#e7e1d4', '#111111'], dark: ['#0e0e0d', '#f4f1ea'] },
  off:        { light: ['#f4f4f5', '#18181b'], dark: ['#0e1014', '#f4f4f5'] },
};
let lastTitleBarKey = '';

function syncTitleBarOverlay(mode) {
  const api = window.electronNative && typeof window.electronNative.setTitleBarOverlay === 'function'
    ? window.electronNative
    : null;
  if (!api) return;
  const theme = VALID_THEME_IDS.has(mode) ? mode : readThemeMode();
  const dark = isHostDarkMode();
  const key = theme + ':' + (dark ? 'd' : 'l');
  if (key === lastTitleBarKey) return;
  lastTitleBarKey = key;
  const pair = (TITLEBAR_COLORS[theme] || TITLEBAR_COLORS.google)[dark ? 'dark' : 'light'];
  try {
    void api.setTitleBarOverlay({ color: pair[0], symbolColor: pair[1] });
  } catch (_) {}
}

function syncDarkAttr() {
  const dark = isHostDarkMode();
  const h = document.documentElement;
  const cur = h.getAttribute('data-agy-dark') === '1';
  if (dark !== cur) {
    if (dark) h.setAttribute('data-agy-dark', '1');
    else h.removeAttribute('data-agy-dark');
    syncTitleBarOverlay(window.__agyCurrentTheme || readThemeMode());
    return true;
  }
  return false;
}

function getEffectiveSurfaceForPulse() {
  if (isHostDarkMode()) return 'dark';
  const m = readThemeMode();
  return (m === 'off' ? 'google' : m);
}

function syncPulseDrawerSurface() {
  const frame = document.getElementById('agy-pulse-iframe');
  if (!frame || !frame.src) return;
  const surf = getEffectiveSurfaceForPulse();
  if (frame.dataset.surf !== surf) {
    frame.dataset.surf = surf;
    try {
      frame.contentWindow?.postMessage({ type: 'gemini-pulse:surface', surface: surf }, new URL(frame.src).origin);
    } catch (_) {}
  }
}

function preloadOutfitForTheme(theme) {
  if (!OUTFIT_CANDIDATE_THEMES.has(theme)) return;
  const port = normalizeTelemetryPort(window.__agyTelemetryPort);
  if (!port) return;
  const inflightKey = theme + '@' + port;
  if (OUTFIT_INFLIGHT[inflightKey]) return;
  OUTFIT_INFLIGHT[inflightKey] = true;
  if (!OUTFIT_CACHE[theme]) OUTFIT_CACHE[theme] = Object.create(null);

  for (let i = 0; i < OUTFIT_POSE_KEYS.length; i++) {
    const pose = OUTFIT_POSE_KEYS[i];
    if (OUTFIT_CACHE[theme][pose]) continue;
    const url = 'http://127.0.0.1:' + port + '/outfits/' + theme + '/muse-' + pose + '.webp';
    const probe = new Image();
    probe.onload = () => {
      OUTFIT_CACHE[theme][pose] = url;
      if (window.__agyCurrentTheme === theme) applyPoseFrame();
    };
    probe.onerror = () => {};
    probe.src = url;
  }
}

function applyThemeMode(mode) {
  const normalized = VALID_THEME_IDS.has(mode) ? mode : 'google';
  syncDarkAttr();
  // Zero-jank O(1) switch: all 6+1 themes live in dist/theme.css; only toggle 1 attribute!
  if (document.documentElement.getAttribute('data-agy-theme') !== normalized) {
    document.documentElement.setAttribute('data-agy-theme', normalized);
  }
  const legacyStyle = document.getElementById('agy-theme-style');
  if (legacyStyle) legacyStyle.remove();

  try { localStorage.setItem(THEME_STORE, normalized); } catch (_) {}
  window.__agyCurrentTheme = normalized;

  const btn = document.getElementById('agy-inline-theme-btn');
  if (btn) {
    const item = DIAL_THEMES.find((x) => x.id === normalized);
    const meta = item
      ? { dot: item.dot, label: item.label }
      : { dot: '#8e9299', label: 'Default' };
    const dot = btn.querySelector('.agy-tb-dot');
    const lbl = btn.querySelector('.agy-tb-label');
    if (dot) dot.style.background = meta.dot;
    if (lbl && lbl.textContent !== meta.label) lbl.textContent = meta.label;
  }

  preloadOutfitForTheme(normalized);
  if (typeof applyPoseFrame === 'function') applyPoseFrame();
  syncPulseDrawerSurface();
  syncTitleBarOverlay(normalized);
  return normalized;
}

// ==================== Part 1: Localization Engine ====================

const REGEX_RULES = [
  [/^Remove shortcut (.+) for (.+)$/, '移除「$2」的快捷键 $1'],
  [/^Add shortcut for (.+)$/, '为「$1」添加快捷键'],
  [/^Shortcut (.+) for (.+)$/, '「$2」的快捷键 $1'],
  [/^Show (\d+) breakdowns?$/, '展开 $1 项明细'],
  [/^Toggle (.+)$/, '开关 $1'],
  [/^Rules: (.+) tokens$/, '规则：$1 tokens'],
  [/^Skills: (.+) tokens$/, '技能：$1 tokens'],
  [/^(.+) Weekly Limit$/, '$1 每周额度'],
  [/^(\d+)% left$/, '剩余 $1%'],
  [/^Resets in (.+)$/, '$1 后重置'],
  [/^You have used some of your weekly limit, it will fully refresh in (.+)\.$/, '本周额度已部分使用，将在 $1 后完全恢复。'],
  [/^You have used some of your 5-hour limit, it will fully refresh in (.+)\.$/, '5 小时额度已部分使用，将在 $1 后完全恢复。'],
  [/^You have hit your weekly limit, it refreshes in (.+?)\. If on a supported paid plan, you can use AI credits in the interim or upgrade to a higher tier\.$/, '本周额度已用完，将在 $1 后恢复。付费方案可先用 AI 积分顶上，或升级到更高档位。'],
  [/^(\d+) active conversations? and (\d+) archived conversations?$/, '$1 个进行中会话和 $2 个已归档会话'],
  [/^Show (.+) QR code$/, '显示$1二维码'],
];

const RAW_PHRASES = (typeof AGY_PHRASES !== 'undefined' && Array.isArray(AGY_PHRASES)) ? AGY_PHRASES : [];
const exactMap = new Map();
const subPhrases = [];
for (let i = 0; i < RAW_PHRASES.length; i++) {
  const pair = RAW_PHRASES[i];
  if (!Array.isArray(pair) || pair.length < 2) continue;
  const en = String(pair[0]).trim();
  const zh = pair[1];
  if (!en) continue;
  exactMap.set(en, zh);
  if (/\s/.test(en)) subPhrases.push([en, zh]);
}
subPhrases.sort((a, b) => b[0].length - a[0].length);

function translateText(text) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return text;
  // Fast path: skip pure Chinese / numeric / punctuation strings without scanning English dictionaries
  if (!/[A-Za-z]/.test(trimmed)) return text;

  for (let r = 0; r < REGEX_RULES.length; r++) {
    const rx = REGEX_RULES[r][0];
    if (!rx.test(trimmed)) continue;
    let out = trimmed.replace(rx, REGEX_RULES[r][1]);
    out = out.replace(/「([^」]+)」/g, (m, g) => '「' + (exactMap.get(g) || g) + '」');
    return text.replace(trimmed, out);
  }

  if (exactMap.has(trimmed)) return text.replace(trimmed, exactMap.get(trimmed));

  let result = text;
  let replaced = false;
  for (let i = 0; i < subPhrases.length; i++) {
    const en = subPhrases[i][0];
    if (result.includes(en)) {
      result = result.split(en).join(subPhrases[i][1]);
      replaced = true;
    }
  }
  return replaced ? result : text;
}

const EXCLUDE_SEL =
  '[data-quotable="true"], [data-testid="planner-response-text"], textarea, pre, code, ' +
  '.monaco-editor, .cm-content, .hljs, .notranslate, ' +
  '#hakimi-muse-stage, #hakimi-say, #agy-codex-ctx-btn, #agy-codex-ctx-popover, #agy-pulse-drawer, #agy-model-picker';

const ATTRS = ['placeholder', 'data-placeholder', 'aria-placeholder', 'title', 'aria-label'];

function isExcluded(node) {
  if (!node || !node.parentElement) return false;
  return !!node.parentElement.closest(EXCLUDE_SEL);
}

function translateNode(node) {
  if (!node) return;
  try {
    const nt = node.nodeType;
    if (nt === 3) {
      const original = node.nodeValue;
      if (!original || !original.trim()) return;
      if (node.__agyDoneVal === original) return;
      if (isExcluded(node)) { node.__agyDoneVal = original; return; }
      const translated = translateText(original);
      if (translated !== original) {
        node.nodeValue = translated;
        node.__agyDoneVal = translated;
      } else {
        node.__agyDoneVal = original;
      }
      return;
    }
    if (nt !== 1) return;

    const tag = node.tagName;
    if (tag === 'SVG' || tag === 'PATH' || tag === 'CODE' || tag === 'PRE' ||
        tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'IFRAME') return;

    for (let i = 0; i < ATTRS.length; i++) {
      const a = ATTRS[i];
      if (!node.hasAttribute(a)) continue;
      const v = node.getAttribute(a);
      const key = '__agyDone_' + a;
      if (!v || node[key] === v) continue;
      const tv = translateText(v);
      if (v !== tv) node.setAttribute(a, tv);
      node[key] = tv;
    }

    let child = node.firstChild;
    while (child) {
      translateNode(child);
      child = child.nextSibling;
    }
  } catch (_) {}
}

function scan(root) {
  translateNode(root || document.body);
}

// ==================== Part 2: Unified Custom Styles ====================

const CUSTOM_UI_CSS = `
/* --- Muse-Style Top-Center Desk Companion --- */
#hakimi-muse-stage {
  position: fixed;
  z-index: 38;
  pointer-events: none;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  user-select: none;
  transition: opacity 0.2s ease;
}

#hakimi-muse-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

#hakimi-muse-img {
  display: block;
  width: 112px;
  height: 92px;
  object-fit: contain;
  cursor: pointer;
  -webkit-user-drag: none;
  transform-origin: 50% 80%;
  transition: transform 0.16s ease;
}

#hakimi-muse-img:hover {
  transform: translateY(-2px) scale(1.03);
}
#hakimi-muse-img:active {
  transform: translateY(0) scale(0.97);
}

/* Muse Dynamic Status Pill beside Hakimi when working */
#hakimi-muse-pill {
  position: absolute;
  left: calc(100% - 6px);
  bottom: 28px;
  display: none;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--gs-line, #e3e8ef);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
  color: var(--gs-ink-2, #525866);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  max-width: 196px;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: auto;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  animation: hakimi-pill-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
}
body.theme-dark #hakimi-muse-pill {
  background: rgba(24, 30, 38, 0.94);
  border-color: #2a323d;
  color: #cbd5e1;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.38);
}
#hakimi-muse-pill.show {
  display: inline-flex;
}
#hakimi-muse-pill .muse-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gs-accent, #1a73e8);
  flex-shrink: 0;
}
#hakimi-muse-pill.show .muse-pulse-dot {
  animation: muse-dot-pulse 1.6s steps(2, end) infinite;
}
@keyframes muse-dot-pulse {
  0% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes hakimi-pill-in {
  from { opacity: 0; transform: translateX(-4px) scale(0.95); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}

/* Collapsed Mini Badge Mode (right-click toggle) */
#hakimi-muse-mini {
  display: none;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 9px;
  margin-bottom: 5px;
  border-radius: 999px;
  background: #ffffff;
  border: 1px solid var(--gs-line, #e3e8ef);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
  color: var(--gs-ink-2, #525866);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  pointer-events: auto;
}
body.theme-dark #hakimi-muse-mini {
  background: #181e26;
  border-color: #2a323d;
  color: #9ba4b2;
}
#hakimi-muse-stage.collapsed #hakimi-muse-img,
#hakimi-muse-stage.collapsed #hakimi-muse-pill {
  display: none !important;
}
#hakimi-muse-stage.collapsed #hakimi-muse-mini {
  display: inline-flex;
}

/* Speech Bubble above Hakimi */
#hakimi-say {
  position: fixed;
  z-index: 42;
  width: max-content;
  max-width: 240px;
  padding: 5px 11px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid var(--gs-line, #e3e8ef);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.11);
  color: var(--gs-ink, #1f1f1f);
  font-size: 12px;
  line-height: 1.45;
  pointer-events: none;
  animation: hakimi-say-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
}
body.theme-dark #hakimi-say {
  background: #1c222b;
  border-color: #2c3542;
  color: #e8edf4;
}
#hakimi-say::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -5px;
  margin-left: -4.5px;
  width: 8px;
  height: 8px;
  background: inherit;
  border-right: 1px solid var(--gs-line, #e3e8ef);
  border-bottom: 1px solid var(--gs-line, #e3e8ef);
  transform: rotate(45deg);
}
body.theme-dark #hakimi-say::after {
  border-color: #2c3542;
}
@keyframes hakimi-say-pop {
  from { opacity: 0; transform: translateY(4px) scale(0.92); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* --- Codex-Style Context Ring Left of Permissions Button --- */
#agy-codex-ctx-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 26px;
  padding: 0 7.5px;
  margin-right: 3px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--gs-ink-2, #5f6368);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
#agy-codex-ctx-btn:hover,
#agy-codex-ctx-btn.drawer-open {
  background: var(--gs-accent-soft, rgba(26, 115, 232, 0.08));
  color: var(--gs-ink, #1f1f1f);
  border-color: rgba(128, 138, 155, 0.18);
}
#agy-codex-ctx-btn svg.codex-ring-svg {
  width: 14px;
  height: 14px;
  transform: rotate(-90deg);
  flex-shrink: 0;
}
#agy-codex-ctx-btn .codex-ring-bg {
  stroke: currentColor;
  stroke-opacity: 0.18;
}
#agy-codex-ctx-btn .codex-ring-fg {
  stroke: var(--gs-accent, #1a73e8);
  transition: stroke-dashoffset 0.26s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.2s ease;
}
#agy-codex-ctx-btn[data-level="warn"] .codex-ring-fg { stroke: #d97706; }
#agy-codex-ctx-btn[data-level="warn"] .codex-ctx-pct { color: #b45309; }
body.theme-dark #agy-codex-ctx-btn[data-level="warn"] .codex-ctx-pct { color: #fbbf24; }
#agy-codex-ctx-btn[data-level="danger"] .codex-ring-fg { stroke: #dc2626; }
#agy-codex-ctx-btn[data-level="danger"] .codex-ctx-pct { color: #dc2626; font-weight: 600; }
body.theme-dark #agy-codex-ctx-btn[data-level="danger"] .codex-ctx-pct { color: #f87171; }

/* Codex Hover Popover Card (Direction B · Ring Gauge Layout v1.1.0) */
#agy-codex-ctx-popover {
  position: fixed;
  z-index: 999992;
  width: 316px;
  padding: 12px 14px 11px;
  border-radius: 13px;
  background: #ffffff;
  border: 1px solid var(--gs-line, #e3e8ef);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.11), 0 2px 6px rgba(15, 23, 42, 0.05);
  color: var(--gs-ink, #1f1f1f);
  font-size: 12px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  display: none;
  pointer-events: auto;
  transform-origin: bottom right;
  animation: codex-pop-in 0.18s cubic-bezier(0.22, 1, 0.36, 1) both;
}
body.theme-dark #agy-codex-ctx-popover,
html.dark #agy-codex-ctx-popover {
  background: #171c23;
  border-color: #2a323e;
  color: #e8edf4;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(255, 255, 255, 0.05);
}
#agy-codex-ctx-popover.open {
  display: block;
}
#agy-codex-ctx-popover .cpop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding-right: 26px;
}
#agy-codex-ctx-popover .cpop-title-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
#agy-codex-ctx-popover .pulse-close-x {
  position: absolute;
  top: 9px;
  right: 10px;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--gs-ink-3, #80868b);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}
#agy-codex-ctx-popover .pulse-close-x:hover {
  background: var(--gs-side-hover, rgba(128, 138, 155, 0.14));
  color: var(--gs-ink, #1f1f1f);
}
@keyframes codex-pop-in {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.cpop-title {
  font-weight: 600;
  font-size: 12.5px;
  color: var(--gs-ink, #1f1f1f);
}
body.theme-dark .cpop-title,
html.dark .cpop-title { color: #e8edf4; }
.cpop-badge {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 99px;
  background: var(--gs-accent-soft, rgba(26, 115, 232, 0.09));
  color: var(--gs-accent, #1a73e8);
  font-weight: 500;
  white-space: nowrap;
}
.cpop-ring-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0 10px;
  border-bottom: 1px solid var(--gs-line-soft, #eef2f7);
}
body.theme-dark .cpop-ring-row,
html.dark .cpop-ring-row { border-bottom-color: #242b35; }
.cpop-big-ring {
  position: relative;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cpop-big-ring-pct {
  position: absolute;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--gs-ink, #1f1f1f);
}
body.theme-dark .cpop-big-ring-pct,
html.dark .cpop-big-ring-pct { color: #e8edf4; }
.cpop-ring-info {
  flex: 1;
  min-width: 0;
}
.cpop-ring-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}
.cpop-big {
  font-size: 15.5px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.cpop-big small {
  font-size: 11px;
  font-weight: 500;
  color: var(--gs-ink-3, #80868b);
}
.cpop-rem {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--gs-accent, #1a73e8);
}
.cpop-sub {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--gs-ink-2, #5f6368);
  margin-top: 3px;
}
.cpop-quota-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 10px;
}
.cpop-qtile {
  background: var(--gs-bg-2, #f4f7fb);
  border: 1px solid var(--gs-line-soft, #eaeff6);
  border-radius: 9px;
  padding: 7px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
body.theme-dark .cpop-qtile,
html.dark .cpop-qtile {
  background: #1d232d;
  border-color: #262f3c;
}
.cpop-mini-ring {
  position: relative;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cpop-mini-val {
  position: absolute;
  font-size: 9.5px;
  font-weight: 700;
}
.cpop-qtile-info { min-width: 0; }
.cpop-qtile-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--gs-ink, #1f1f1f);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
body.theme-dark .cpop-qtile-name,
html.dark .cpop-qtile-name { color: #e8edf4; }
.cpop-qtile-sub {
  font-size: 10px;
  color: var(--gs-ink-3, #80868b);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cpop-foot-link {
  margin-top: 10px;
  padding: 8px 2px 0;
  width: 100%;
  border: none;
  border-top: 1px solid var(--gs-line-soft, #eef2f7);
  background: transparent;
  color: var(--gs-ink-3, #7b8394);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: color 0.15s ease;
}
body.theme-dark .cpop-foot-link,
html.dark .cpop-foot-link { border-top-color: #242b35; color: #9ba4b2; }
.cpop-foot-link:hover {
  color: var(--gs-accent, #1a73e8);
}

/* --- Local File / Artifact Context Menu (v1.1.0) --- */
#agy-file-ctx-menu {
  position: fixed;
  z-index: 9999998;
  min-width: 214px;
  max-width: 300px;
  padding: 5px;
  border-radius: 11px;
  background: #ffffff;
  border: 1px solid var(--gs-line, #dde5f0);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.15), 0 2px 6px rgba(15, 23, 42, 0.06);
  color: var(--gs-ink, #1b1f24);
  font-size: 12px;
  display: none;
  user-select: none;
  animation: codex-pop-in 0.12s cubic-bezier(0.22, 1, 0.36, 1) both;
}
body.theme-dark #agy-file-ctx-menu,
html.dark #agy-file-ctx-menu {
  background: #1a212b;
  border-color: #2c3543;
  color: #e8edf4;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.52);
}
#agy-file-ctx-menu.open { display: block; }
.agy-fctx-head {
  padding: 5px 9px 6px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--gs-line-soft, #eef2f7);
  font-size: 11px;
  font-weight: 600;
  color: var(--gs-ink-3, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
body.theme-dark .agy-fctx-head,
html.dark .agy-fctx-head { border-bottom-color: #27303d; color: #9aa4b2; }
.agy-fctx-item {
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  padding: 6.5px 9px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}
.agy-fctx-item:hover {
  background: var(--gs-accent-soft, rgba(26, 115, 232, 0.10));
  color: var(--gs-accent, #1a73e8);
}
.agy-fctx-item svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.85;
}
.agy-fctx-sep {
  height: 1px;
  margin: 4px 4px;
  background: var(--gs-line-soft, #eef2f7);
}
body.theme-dark .agy-fctx-sep,
html.dark .agy-fctx-sep { background: #27303d; }

/* --- Docked Side Pane Drawer for Gemini Pulse --- */
#agy-pulse-drawer {
  position: fixed;
  top: 35px;
  right: 0;
  bottom: 0;
  width: 376px;
  max-width: calc(100vw - 16px);
  z-index: 999991;
  background: var(--gs-bg, #fbfdff);
  border-left: 1px solid var(--gs-line, #e3e8ef);
  box-shadow: -6px 0 24px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  transform: translateX(102%);
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  visibility: hidden;
  pointer-events: none;
}
body.theme-dark #agy-pulse-drawer {
  background: #101418;
  border-left-color: #242b35;
  box-shadow: -8px 0 28px rgba(0, 0, 0, 0.42);
}
#agy-pulse-drawer.open {
  transform: translateX(0);
  visibility: visible;
  pointer-events: auto;
}
.pulse-drawer-head {
  height: 40px;
  flex: 0 0 40px;
  padding: 0 12px 0 14px;
  border-bottom: 1px solid var(--gs-line-soft, #eef2f7);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--gs-ink, #1f1f1f);
}
body.theme-dark .pulse-drawer-head {
  border-bottom-color: #1f2630;
  color: #e8edf4;
}
.pulse-drawer-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.pulse-close {
  -webkit-app-region: no-drag;
  flex: none;
  min-width: 40px;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--gs-line, #d2d8e0);
  background: var(--gs-bg, #fff);
  color: var(--gs-ink, #20242a);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}
.pulse-close:hover, .pulse-close:focus-visible {
  background: rgba(234, 67, 53, 0.10);
  color: #dc2626;
}
#agy-pulse-iframe {
  flex: 1;
  width: 100%;
  border: none;
  background: transparent;
}

/* Topbar Theme Switcher Pill */
#agy-inline-theme-btn {
  -webkit-app-region: no-drag;
  font-size: 11.5px;
  line-height: 1.2;
  height: 22px;
  opacity: 0.86;
  white-space: nowrap;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 6px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid rgba(128, 128, 128, 0.18);
  background: rgba(128, 128, 128, 0.09);
  color: inherit;
  cursor: pointer;
  user-select: none;
  pointer-events: auto;
  transition: opacity 0.15s ease, background 0.15s ease;
}
#agy-inline-theme-btn:hover {
  opacity: 1;
  background: rgba(128, 128, 128, 0.18);
}
#agy-inline-theme-btn .agy-tb-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

/* Compact 208px Tactile Rotary Theme Dial (v1.2.0) */
#agy-theme-dial-pop {
  position: fixed;
  z-index: 9999995;
  width: 206px;
  padding: 12px 12px 10px;
  border-radius: 18px;
  background: var(--gs-pop-bg, #ffffff);
  border: 1px solid var(--gs-line, #dde5f0);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.17), 0 3px 10px rgba(15, 23, 42, 0.06);
  display: none;
  flex-direction: column;
  align-items: center;
  user-select: none;
  -webkit-app-region: no-drag;
  animation: codex-pop-in 0.14s cubic-bezier(0.22, 1, 0.36, 1) both;
}
body.theme-dark #agy-theme-dial-pop,
html.dark #agy-theme-dial-pop {
  background: var(--gs-pop-bg, #181f29);
  border-color: var(--gs-line, #2a3342);
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.54);
}
#agy-theme-dial-pop.open { display: flex; }
.agy-dial-stage {
  position: relative;
  width: 178px;
  height: 178px;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}
.agy-dial-ptr {
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.24));
  pointer-events: none;
}
.agy-dial-ptr.tick {
  animation: agyPtrTick 0.16s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes agyPtrTick {
  0% { transform: translateX(-50%) rotate(0deg); }
  45% { transform: translateX(-50%) rotate(-11deg); }
  100% { transform: translateX(-50%) rotate(0deg); }
}
#agy-dial-rotor {
  width: 168px;
  height: 168px;
  border-radius: 50%;
  cursor: grab;
  position: relative;
  box-shadow: 0 5px 14px rgba(15, 23, 42, 0.12);
}
#agy-dial-rotor.dragging { cursor: grabbing; }
#agy-dial-rotor.snapping { transition: transform 0.30s cubic-bezier(0.22, 1.24, 0.36, 1); }
#agy-dial-hub {
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: var(--gs-pop-bg, #ffffff);
  border: 2px solid var(--gs-accent, #1a73e8);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14);
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.18s ease;
}
#agy-dial-hub:hover { transform: scale(1.06); }
#agy-dial-hub:active { transform: scale(0.94); }
.agy-hub-name { font-size: 11.5px; font-weight: 800; color: var(--gs-ink, #1b1f24); line-height: 1.15; }
.agy-hub-sub { font-size: 8.5px; color: var(--gs-accent, #1a73e8); font-weight: 700; margin-top: 1px; }
.agy-dial-foot {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  padding-top: 7px;
  border-top: 1px solid var(--gs-line-soft, #eef2f7);
}
body.theme-dark .agy-dial-foot,
html.dark .agy-dial-foot { border-top-color: #27303d; }
.agy-dial-mbtn {
  padding: 2.5px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--gs-ink-3, #64748b);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  transition: all 0.14s ease;
}
.agy-dial-mbtn:hover,
.agy-dial-mbtn.active {
  background: var(--gs-accent-soft, rgba(26, 115, 232, 0.10));
  color: var(--gs-accent, #1a73e8);
  border-color: var(--gs-row-selected-border, rgba(26, 115, 232, 0.30));
}

/* --- Codex-Style Minimal Model Trigger & 0-Flicker Categorized Picker (v1.2.3) --- */
.agy-model-trigger {
  position: relative !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  height: 26px !important;
  padding: 0 7px !important;
  border-radius: 7px !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  transition: background-color 0.12s ease !important;
}
.agy-model-trigger:hover {
  background: var(--gs-side-hover, rgba(26, 115, 232, 0.08)) !important;
}
.agy-model-trigger::before {
  content: "" !important;
  width: 6px !important;
  height: 6px !important;
  border-radius: 50% !important;
  background: var(--gs-accent, #1a73e8) !important;
  flex-shrink: 0 !important;
}
.agy-model-trigger[data-agy-mfamily="claude"]::before { background: #d97757 !important; }
.agy-model-trigger[data-agy-mfamily="gpt"]::before { background: #10a37f !important; }
.agy-model-trigger[data-agy-mfamily="orch"]::before { background: #8839ef !important; }

/* 0-frame stealth: hide newly mounted native menu/submenu BEFORE first paint */
html[data-agy-mp-capturing="1"] [data-radix-popper-content-wrapper],
html[data-agy-mp-capturing="1"] [role="menu"],
html[data-agy-mp-capturing="1"] [role="listbox"],
html[data-agy-mp-capturing="1"] [data-radix-menu-content],
html[data-agy-mp-capturing="1"] [data-floating-ui-portal] > *,
html:not(#_) .agy-native-model-stealth,
html:not(#_) [role="menu"].agy-native-model-stealth,
html:not(#_) [role="listbox"].agy-native-model-stealth {
  opacity: 0 !important;
  pointer-events: none !important;
  box-shadow: none !important;
  transition: none !important;
  animation: none !important;
}

#agy-model-picker {
  position: fixed;
  z-index: 9999996;
  width: 304px;
  max-width: calc(100vw - 16px);
  border-radius: 13px;
  background: var(--gs-pop-bg, #ffffff);
  border: 1px solid var(--gs-line, #dde5f0);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.13), 0 2px 6px rgba(15, 23, 42, 0.04);
  color: var(--gs-ink, #1b1f24);
  font-size: 12.5px;
  display: none;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  pointer-events: auto !important;
  animation: codex-pop-in 0.11s cubic-bezier(0.22, 1, 0.36, 1) both;
}
body.theme-dark #agy-model-picker,
html.dark #agy-model-picker,
html[data-agy-dark="1"] #agy-model-picker {
  background: var(--gs-pop-bg, #181f29);
  border-color: var(--gs-line, #2a3342);
  color: var(--gs-ink, #e8edf4);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.54);
}
#agy-model-picker.open { display: flex; }

.amp-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  border-bottom: 1px solid var(--gs-line-soft, #eef2f7);
}
.amp-tabs {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--gs-side, #eef3fa);
  border-radius: 8px;
  padding: 2px;
  flex: 1;
}
.amp-tab-glider {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(50% - 2px);
  height: calc(100% - 4px);
  border-radius: 6px;
  background: var(--gs-pop-bg, #ffffff);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1);
  pointer-events: none;
}
.amp-tabs[data-tab="other"] .amp-tab-glider {
  transform: translateX(100%);
}
.amp-tab {
  position: relative;
  z-index: 1;
  border: none;
  background: transparent;
  color: var(--gs-ink-2, #525d6d);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  text-align: center;
  transition: color 0.12s ease;
}
.amp-tab.active {
  color: var(--gs-ink, #1b1f24);
  font-weight: 700;
}
.amp-raw-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--gs-ink-3, #8c96a6);
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.amp-raw-btn:hover {
  background: var(--gs-side-hover, rgba(26, 115, 232, 0.08));
  color: var(--gs-ink, #1b1f24);
}

.amp-list {
  padding: 5px 6px;
  max-height: 276px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.amp-hairline {
  height: 1px;
  margin: 4px 8px;
  background: var(--gs-line-soft, #eef2f7);
}
.amp-row {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--gs-ink, #1b1f24);
  padding: 6.5px 9px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.10s ease;
}
.amp-row:hover {
  background: var(--gs-side-hover, rgba(26, 115, 232, 0.08));
}
.amp-row.active {
  background: var(--gs-row-selected, #dfebfc);
  color: var(--gs-accent-strong, #124eb3);
}
.amp-row.leaving { opacity: 0.56; }
.amp-row.leaving:hover,
.amp-row.leaving.active { opacity: 0.95; }
.amp-name {
  font-weight: 500;
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.amp-row.active .amp-name { font-weight: 600; }
.amp-row-r {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.amp-eff-txt {
  font-size: 11px;
  font-weight: 500;
  color: var(--gs-ink-3, #7c8798);
}
.amp-row.active .amp-eff-txt {
  color: var(--gs-accent, #1a73e8);
  font-weight: 600;
}
.amp-check {
  color: var(--gs-accent, #1a73e8);
  font-weight: 700;
  font-size: 12px;
  width: 12px;
  text-align: center;
}

/* Codex-Style 1:1 Pill Track Slider for Dynamic N-Level Thinking Effort */
.amp-effort-box {
  padding: 11px 14px 13px;
  border-top: 1px solid var(--gs-line-soft, #eef2f7);
  background: var(--gs-pop-bg, #ffffff);
}
.amp-effort-box.is-hidden { display: none; }

.amp-cx-top {
  display: grid;
  grid-template-columns: 26px 1fr 26px;
  align-items: start;
  margin-bottom: 11px;
}
.amp-cx-iconbtn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--gs-ink-3, #7c8798);
  border-radius: 7px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.amp-cx-iconbtn:hover {
  background: var(--gs-side-hover, rgba(26, 115, 232, 0.08));
  color: var(--gs-ink, #1b1f24);
}
.amp-cx-center {
  text-align: center;
  line-height: 1.25;
  min-width: 0;
}
.amp-cx-big {
  font-size: 16.5px;
  font-weight: 700;
  color: var(--gs-accent, #1a73e8);
  letter-spacing: 0.01em;
}
.amp-cx-model {
  margin-top: 2px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--gs-ink-3, #707a8a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.amp-cx-pill-track {
  --amp-r: 0.5;
  position: relative;
  height: 26px;
  border-radius: 999px;
  background: var(--gs-side, #e6e9ef);
  cursor: pointer;
  touch-action: none;
  overflow: visible;
}
body.theme-dark .amp-cx-pill-track,
html.dark .amp-cx-pill-track,
html[data-agy-dark="1"] .amp-cx-pill-track {
  background: #272f3b;
}
.amp-cx-pill-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: calc(26px + (100% - 26px) * var(--amp-r));
  border-radius: 999px;
  background: var(--gs-accent, #1a73e8);
  transition: width 0.18s cubic-bezier(0.22, 1.14, 0.36, 1);
  pointer-events: none;
}
.amp-cx-pill-dot {
  position: absolute;
  top: 50%;
  width: 4.5px;
  height: 4.5px;
  border-radius: 50%;
  background: rgba(110, 120, 136, 0.48);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 2;
}
.amp-cx-pill-dot.passed {
  background: rgba(255, 255, 255, 0.48);
}
.amp-cx-pill-thumb {
  position: absolute;
  top: 1px;
  left: calc(13px + (100% - 26px) * var(--amp-r));
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.24), 0 0 0 1px rgba(15, 23, 42, 0.05);
  transform: translateX(-50%);
  transition: left 0.18s cubic-bezier(0.22, 1.14, 0.36, 1), transform 0.12s ease;
  pointer-events: none;
  z-index: 3;
}
.amp-cx-pill-track.dragging .amp-cx-pill-fill,
.amp-cx-pill-track.dragging .amp-cx-pill-thumb {
  transition: none;
}
.amp-cx-pill-track.dragging .amp-cx-pill-thumb {
  transform: translateX(-50%) scale(1.06);
}

.amp-sub-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  justify-content: center;
}
.amp-sub-pill {
  border: 1px solid var(--gs-line, #dde5f0);
  background: var(--gs-bg-2, #f7f9fc);
  color: var(--gs-ink-2, #525d6d);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 9px;
  border-radius: 999px;
  cursor: pointer;
}
.amp-sub-pill.active {
  background: var(--gs-accent, #1a73e8);
  border-color: var(--gs-accent, #1a73e8);
  color: #ffffff;
}
`;

// ==================== Part 3: Hakimi Muse Stage Logic ====================

const IDLE_LINES = ['在呢，随时吩咐', '今天想推进哪件事？', '我在桌边守着啦', '有活随时叫我'];
const WRITE_LINES = ['嘘，正在伏案构思…', '刷刷记笔记中', '马上理出头绪啦'];
const LAPTOP_LINES = ['键盘都要敲火星子啦', '正在调工具跑任务…', '代码与命令飞速处理中'];
const DONE_LINES = ['办妥啦！', '搞定收工～', '全部给你弄好啦'];
const SLEEPY_LINES = ['趴桌眯一小会儿…', '叫我就立马醒', '呼噜…轻轻待机中'];

let stageEl = null;
let imgEl = null;
let pillEl = null;
let pillTextEl = null;
let sayEl = null;
let sayTimer = 0;

let currentMode = 'idle'; // 'idle' | 'write' | 'laptop' | 'done' | 'sleepy'
let animToggle = false;
let animTimer = 0;
let wasBusy = false;
let busyStartedAt = 0;
let lastWorkDetectAt = 0;
let lastWorkAct = { mode: 'write', label: '正在伏案构思…' };
let lastMuseLayoutKey = '';
let composerResizeObs = null;

function isBusy() {
  return !!document.querySelector(
    'button[data-testid="input-stop-button"], [data-testid="running-items-card"], .surface-composer button[aria-label*="停止"], .surface-composer button[aria-label*="Stop"]'
  );
}

function detectWorkActivity(force) {
  const now = Date.now();
  if (!force && now - lastWorkDetectAt < 800) {
    return lastWorkAct;
  }
  lastWorkDetectAt = now;

  // Inspect live status text in the active chat view to pick laptop (code/terminal) vs writing (thinking/drafting)
  let statusText = '';
  const candidates = document.querySelectorAll(
    '[data-testid*="status"], [data-testid*="focus"], [class*="animate-pulse"]'
  );
  for (let i = candidates.length - 1; i >= 0; i--) {
    const el = candidates[i];
    if (el.closest('#hakimi-muse-stage')) continue;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (t && t.length >= 2 && t.length <= 64) {
      statusText = t;
      break;
    }
  }

  const codeRx = /终端|命令|运行|执行|脚本|代码|修改|编辑|写入|构建|测试|搜索|排查|查看|读取|插件|部署|terminal|command|run|edit|write|file|search|build|test|mcp/i;
  const isCode = codeRx.test(statusText);

  // If no explicit keyword found, alternate smoothly every 6.5s so both desk animations get showcased naturally
  let mode = isCode ? 'laptop' : 'write';
  if (!statusText && busyStartedAt > 0) {
    mode = (Math.floor((now - busyStartedAt) / 6500) % 2 === 0) ? 'write' : 'laptop';
  }

  let label = statusText;
  if (!label || label.length > 22) {
    label = mode === 'laptop' ? '正在敲电脑处理…' : '正在伏案构思…';
  }
  const m = window.__agyLastTelemetry && window.__agyLastTelemetry.metrics;
  const rate = m && (m.latestStepTokPerSec || m.avgTokPerSec);
  if (rate && rate > 5 && label.length <= 12) {
    label += ' · ' + Math.round(rate) + ' t/s';
  }
  lastWorkAct = { mode, label };
  return lastWorkAct;
}

function applyPoseFrame() {
  if (!imgEl || !POSES) return;
  let key = 'idle';
  if (currentMode === 'laptop') {
    key = animToggle ? 'laptop2' : 'laptop1';
  } else if (currentMode === 'write') {
    key = animToggle ? 'write2' : 'write1';
  } else if (currentMode === 'done') {
    key = 'done';
  } else if (currentMode === 'sleepy') {
    key = 'sleepy';
  }
  const curTheme = window.__agyCurrentTheme || readThemeMode();
  const themedSrc = OUTFIT_CACHE[curTheme] && OUTFIT_CACHE[curTheme][key];
  const src = themedSrc || POSES[key] || POSES.idle;
  if (src && imgEl.src !== src) {
    imgEl.src = src;
  }
  imgEl.classList.toggle('pose-idle', currentMode === 'idle');
}

function setMuseMode(nextMode, statusLabel) {
  if (currentMode !== nextMode) {
    currentMode = nextMode;
    animToggle = false;
    window.clearInterval(animTimer);
    animTimer = 0;

    if (nextMode === 'laptop' || nextMode === 'write') {
      const interval = nextMode === 'laptop' ? 340 : 460;
      animTimer = window.setInterval(() => {
        animToggle = !animToggle;
        applyPoseFrame();
      }, interval);
    }
    applyPoseFrame();
  }

  if (pillEl && pillTextEl) {
    if (nextMode === 'laptop' || nextMode === 'write') {
      const label = statusLabel || (nextMode === 'laptop' ? '正在敲电脑处理…' : '正在伏案构思…');
      if (pillTextEl.textContent !== label) pillTextEl.textContent = label;
    }
    pillEl.classList.toggle('show', nextMode === 'laptop' || nextMode === 'write');
  }
}

function say(text, ms) {
  if (!sayEl || !stageEl) return;
  sayEl.textContent = text;
  sayEl.style.display = 'block';
  sayEl.style.animation = 'none';
  void sayEl.offsetWidth;
  sayEl.style.animation = '';
  placeSayBubble();
  window.clearTimeout(sayTimer);
  sayTimer = window.setTimeout(() => {
    if (sayEl) sayEl.style.display = 'none';
  }, ms || 2400);
}

function placeSayBubble() {
  if (!sayEl || sayEl.style.display === 'none' || !imgEl) return;
  const r = imgEl.getBoundingClientRect();
  if (r.width === 0) return;
  const w = sayEl.offsetWidth;
  const h = sayEl.offsetHeight;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
  let top = r.top - h - 6;
  if (top < 40) top = r.bottom + 6;
  sayEl.style.left = Math.round(left) + 'px';
  sayEl.style.top = Math.round(top) + 'px';
}

function ensureChatScrollPadding(composer) {
  if (!composer || composer.__agyPadDone) return;
  composer.__agyPadDone = true;
  // Walk previous siblings or ancestor siblings once per composer to avoid repeated getComputedStyle layout thrashing
  let cur = composer.parentElement;
  while (cur && cur !== document.body) {
    const prev = cur.previousElementSibling;
    if (prev) {
      const innerScroll = prev.querySelector('[class*="overflow-y-auto"]');
      if (innerScroll) {
        innerScroll.classList.add('agy-muse-scroll-pad');
        return;
      }
      const cs = window.getComputedStyle(prev);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
        prev.classList.add('agy-muse-scroll-pad');
        return;
      }
    }
    cur = cur.parentElement;
  }
}

function layoutMuseStage() {
  if (!stageEl) return;
  const composer = document.querySelector('.surface-composer');
  if (!composer) {
    if (lastMuseLayoutKey !== 'hidden') {
      lastMuseLayoutKey = 'hidden';
      stageEl.style.display = 'none';
    }
    return;
  }
  const cr = composer.getBoundingClientRect();
  if (cr.width < 180 || cr.top < 80 || cr.height === 0) {
    if (lastMuseLayoutKey !== 'hidden') {
      lastMuseLayoutKey = 'hidden';
      stageEl.style.display = 'none';
    }
    return;
  }
  ensureChatScrollPadding(composer);

  const isCollapsed = stageEl.classList.contains('collapsed');
  const imgH = window.innerHeight < 660 ? 76 : 90;
  const imgW = Math.round(imgH * (560 / 460));
  const overhang = isCollapsed ? 0 : Math.round(imgH * 0.20 - 1);
  const bottomPx = Math.round(window.innerHeight - cr.top - overhang);
  const centerX = Math.round(cr.left + cr.width / 2);

  const layoutKey = centerX + ',' + bottomPx + ',' + imgW + ',' + imgH + ',' + (isCollapsed ? 1 : 0);
  if (layoutKey !== lastMuseLayoutKey) {
    lastMuseLayoutKey = layoutKey;
    stageEl.style.display = 'flex';
    if (imgEl) {
      imgEl.style.width = imgW + 'px';
      imgEl.style.height = imgH + 'px';
    }
    stageEl.style.left = centerX + 'px';
    stageEl.style.bottom = bottomPx + 'px';
    stageEl.style.transform = 'translateX(-50%)';
    if (sayEl && sayEl.style.display !== 'none') placeSayBubble();
  }
}

function syncHakimiState() {
  if (!stageEl) return;
  const busy = isBusy();
  if (busy) {
    if (!wasBusy) busyStartedAt = Date.now();
    wasBusy = true;
    const act = detectWorkActivity();
    setMuseMode(act.mode, act.label);
  } else if (wasBusy) {
    wasBusy = false;
    busyStartedAt = 0;
    setMuseMode('done');
    window.setTimeout(() => {
      if (!isBusy() && currentMode === 'done') setMuseMode('idle');
    }, 2100);
  }
}

function mountMuseHakimi() {
  // Remove legacy bottom-right dock & top gray strip
  for (const oldId of ['hakimi-dock', 'agy-composer-top-strip', 'agy-token-telemetry-bar']) {
    const old = document.getElementById(oldId);
    if (old) old.remove();
  }

  if (!POSES || !POSES.idle) return;

  const existing = document.getElementById('hakimi-muse-stage');
  if (existing) {
    stageEl = existing;
    imgEl = document.getElementById('hakimi-muse-img');
    pillEl = document.getElementById('hakimi-muse-pill');
    pillTextEl = pillEl ? pillEl.querySelector('.muse-pill-txt') : null;
    sayEl = document.getElementById('hakimi-say');
    layoutMuseStage();
    return;
  }

  stageEl = document.createElement('div');
  stageEl.id = 'hakimi-muse-stage';
  stageEl.className = 'notranslate';
  try {
    if (localStorage.getItem(MUSE_COLLAPSED_STORE) === '1') {
      stageEl.classList.add('collapsed');
    }
  } catch (_) {}

  const wrap = document.createElement('div');
  wrap.id = 'hakimi-muse-wrap';

  imgEl = document.createElement('img');
  imgEl.id = 'hakimi-muse-img';
  imgEl.alt = '哈基米';
  imgEl.draggable = false;
  imgEl.src = POSES.idle;
  imgEl.title = '左键对话 · 双击打盹 · 右键折叠为迷你徽标';

  pillEl = document.createElement('div');
  pillEl.id = 'hakimi-muse-pill';
  pillEl.title = '点击查看实时模型额度与上下文';
  pillEl.innerHTML = '<span class="muse-pulse-dot"></span><span class="muse-pill-txt">正在构思…</span>';
  pillTextEl = pillEl.querySelector('.muse-pill-txt');
  pillEl.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePulseSidePanel();
  });

  const mini = document.createElement('div');
  mini.id = 'hakimi-muse-mini';
  mini.title = '点击展开哈基米工作台';
  mini.innerHTML = '<span style="color:var(--gs-accent,#1a73e8)">✦</span><span>哈基米</span>';
  mini.addEventListener('click', (e) => {
    e.stopPropagation();
    stageEl.classList.remove('collapsed');
    try { localStorage.setItem(MUSE_COLLAPSED_STORE, '0'); } catch (_) {}
    layoutMuseStage();
  });

  imgEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const pool = currentMode === 'laptop' ? LAPTOP_LINES
      : currentMode === 'write' ? WRITE_LINES
      : currentMode === 'done' ? DONE_LINES
      : currentMode === 'sleepy' ? SLEEPY_LINES
      : IDLE_LINES;
    say(pool[Math.floor(Math.random() * pool.length)]);
  });

  imgEl.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBusy()) return;
    const next = currentMode === 'sleepy' ? 'idle' : 'sleepy';
    setMuseMode(next);
    if (next === 'sleepy') say(SLEEPY_LINES[Math.floor(Math.random() * SLEEPY_LINES.length)]);
  });

  imgEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    stageEl.classList.add('collapsed');
    try { localStorage.setItem(MUSE_COLLAPSED_STORE, '1'); } catch (_) {}
    layoutMuseStage();
  });

  wrap.appendChild(imgEl);
  wrap.appendChild(pillEl);
  wrap.appendChild(mini);
  stageEl.appendChild(wrap);

  sayEl = document.createElement('div');
  sayEl.id = 'hakimi-say';
  sayEl.className = 'notranslate';
  sayEl.style.display = 'none';

  document.body.appendChild(stageEl);
  document.body.appendChild(sayEl);

  wasBusy = isBusy();
  if (wasBusy) {
    busyStartedAt = Date.now();
    const act = detectWorkActivity();
    setMuseMode(act.mode, act.label);
  } else {
    setMuseMode('idle');
  }
  layoutMuseStage();

  if (!window.__HAKIMI_MUSE_EVENTS__) {
    window.__HAKIMI_MUSE_EVENTS__ = true;
    window.addEventListener('resize', () => {
      layoutMuseStage();
      positionCodexPopover();
    });
  }
}

function bindComposerResizeObserver() {
  const composer = document.querySelector('.surface-composer');
  if (!composer || composer.__agyResizeObserved) return;
  composer.__agyResizeObserved = true;
  if (typeof ResizeObserver !== 'undefined') {
    if (!composerResizeObs) {
      composerResizeObs = new ResizeObserver(() => layoutMuseStage());
    }
    composerResizeObs.observe(composer);
    if (composer.parentElement) composerResizeObs.observe(composer.parentElement);
  }
}

// ==================== Part 4: Codex Context Ring + Popover + Side Panel ====================

const SEG_COLOR_HEX = {
  tools: '#0d9488',
  messages: '#2563eb',
  system: '#d97706',
  rules: '#64748b',
  thinking: '#7c3aed'
};

let popHideTimer = 0;

function fmtCompact(n) {
  const v = Number(n || 0);
  if (v >= 1000000) return (v / 1000000).toFixed(v >= 10000000 ? 1 : 2).replace(/\.00$/, '') + 'M';
  if (v >= 1000) return (v / 1000).toFixed(v >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(v);
}

function fmtResetShort(sec) {
  if (sec === null || sec === undefined || sec < 0) return '';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.max(1, Math.floor((sec % 3600) / 60));
  if (d > 0) return d + '天' + h + 'h 后重置';
  if (h > 0) return h + 'h' + m + 'm 后重置';
  return m + 'm 后重置';
}

function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function findPermissionButtonInComposer(composer) {
  if (!composer) return null;
  const micBtn = composer.querySelector('button[data-tooltip-id="input-send-button-record-tooltip"]');
  const sendBtn = composer.querySelector('button[data-testid="input-send-button"], button[data-testid="input-stop-button"], button[aria-label*="Send"], button[aria-label*="发送"]');
  const buttons = Array.from(composer.querySelectorAll('button, [role="button"]')).filter((b) => b.id !== 'agy-codex-ctx-btn');

  // 1. Explicit match for permission / execution policy selector text
  const permRx = /\b(Turbo|Auto|Strict|Review|Ask|Sandbox|Always\s*proceed|Request\s*review)\b|自动|极速|严格|审核|沙箱|始终允许|请求审查/i;
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    if (b === micBtn || b === sendBtn) continue;
    const txt = (b.textContent || '').replace(/\s+/g, ' ').trim();
    const aria = (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '');
    if (permRx.test(txt) || /permission|execution|policy|sandbox|权限|执行策略/i.test(aria)) {
      return b;
    }
  }

  // 2. Fallback: right-side toolbar button immediately preceding the mic or send button
  if (micBtn && micBtn.previousElementSibling && micBtn.previousElementSibling.id !== 'agy-codex-ctx-btn') {
    return micBtn;
  }
  return micBtn || sendBtn || null;
}

function ensurePulseSideDrawer() {
  let drawer = document.getElementById('agy-pulse-drawer');
  if (drawer) return drawer;

  drawer = document.createElement('aside');
  drawer.id = 'agy-pulse-drawer';
  drawer.className = 'notranslate';
  drawer.inert = true;
  drawer.setAttribute('aria-label', 'Gemini 额度与上下文');
  drawer.innerHTML =
    '<div class="pulse-drawer-head">' +
      '<span class="pulse-drawer-title">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gs-accent,#1a73e8)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke-opacity="0.25"/><path d="M12 3a9 9 0 1 1-8.4 12.2"/><path d="M12 7.5c.3 2.2 2.3 4.2 4.5 4.5-2.2.3-4.2 2.3-4.5 4.5-.3-2.2-2.3-4.2-4.5-4.5 2.2-.3 4.2-2.3 4.5-4.5Z" fill="var(--gs-accent,#1a73e8)" stroke="none"/></svg>' +
        '<span>Gemini 额度与上下文</span>' +
      '</span>' +
      '<button type="button" class="pulse-close" aria-label="关闭额度面板" title="关闭额度面板（Esc）">关闭</button>' +
    '</div>' +
    '<iframe id="agy-pulse-iframe" title="Gemini Pulse"></iframe>';

  drawer.querySelector('.pulse-close').addEventListener('click', () => closePulseViews(true));

  document.body.appendChild(drawer);
  return drawer;
}

function notifyPulseFrame(msg) {
  const frame = document.getElementById('agy-pulse-iframe');
  if (!frame || !frame.src || !frame.contentWindow) return;
  try {
    frame.contentWindow.postMessage(msg, new URL(frame.src).origin);
  } catch (_) {}
}

function closePulseViews(restoreFocus = false) {
  const drawer = document.getElementById('agy-pulse-drawer');
  const pop = document.getElementById('agy-codex-ctx-popover');
  if (!drawer?.classList.contains('open') && !pop?.classList.contains('open')) return false;
  window.clearTimeout(popHideTimer);
  pop?.classList.remove('open');
  if (drawer && drawer.classList.contains('open')) {
    drawer.classList.remove('open');
    drawer.inert = true;
    notifyPulseFrame({ type: 'gemini-pulse:active', active: false });
  }
  const btn = document.getElementById('agy-codex-ctx-btn');
  if (btn) {
    btn.classList.remove('drawer-open');
    btn.setAttribute('aria-expanded', 'false');
    if (restoreFocus) btn.focus({ preventScroll: true });
  }
  return true;
}

function dismissPulseOutside(event) {
  const target = event.target;
  if (target instanceof Element && target.closest('#agy-pulse-drawer, #agy-codex-ctx-popover, #agy-codex-ctx-btn')) return;
  closePulseViews();
}

document.addEventListener('pointerdown', dismissPulseOutside, true);
document.addEventListener('click', dismissPulseOutside, true);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && closePulseViews(true)) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);
window.addEventListener('message', (event) => {
  if (event.data !== 'gemini-pulse:close') return;
  const frame = document.getElementById('agy-pulse-iframe');
  if (frame?.src && event.source === frame.contentWindow && event.origin === new URL(frame.src).origin) {
    closePulseViews(true);
  }
});

function togglePulseSidePanel() {
  const drawer = ensurePulseSideDrawer();
  if (drawer.classList.contains('open')) {
    closePulseViews(true);
    return;
  }
  document.getElementById('agy-codex-ctx-popover')?.classList.remove('open');
  const port = normalizeTelemetryPort(window.__agyTelemetryPort);
  if (!port) {
    say('额度服务尚未就绪，请稍候或重启客户端生效', 2400);
    return;
  }
  const surf = getEffectiveSurfaceForPulse();
  const frame = drawer.querySelector('iframe');
  if (!frame.src || frame.dataset.port !== String(port)) {
    frame.dataset.surf = surf;
    frame.dataset.port = String(port);
    frame.src = 'http://127.0.0.1:' + port + '/?theme=' + surf;
  } else {
    if (frame.dataset.surf !== surf) {
      frame.dataset.surf = surf;
      notifyPulseFrame({ type: 'gemini-pulse:surface', surface: surf });
    }
    notifyPulseFrame({ type: 'gemini-pulse:active', active: true });
  }
  drawer.inert = false;
  drawer.classList.add('open');
  const btn = document.getElementById('agy-codex-ctx-btn');
  if (btn) {
    btn.classList.add('drawer-open');
    btn.setAttribute('aria-expanded', 'true');
  }
  drawer.querySelector('.pulse-close').focus({ preventScroll: true });
  window.setTimeout(layoutMuseStage, 230);
}

function positionCodexPopover() {
  const pop = document.getElementById('agy-codex-ctx-popover');
  const btn = document.getElementById('agy-codex-ctx-btn');
  if (!pop || !btn || !pop.classList.contains('open')) return;
  const r = btn.getBoundingClientRect();
  if (r.width === 0) {
    pop.classList.remove('open');
    return;
  }
  const w = pop.offsetWidth || 282;
  const h = pop.offsetHeight || 170;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(10, Math.min(window.innerWidth - w - 10, left));
  let top = r.top - h - 10;
  if (top < 10) top = r.bottom + 10;
  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(top) + 'px';
}

function quotaRingColor(pct) {
  const dark = isHostDarkMode();
  if (pct > 50) return dark ? '#34d399' : (readThemeMode() === 'claude' ? '#2f855a' : '#16a34a');
  if (pct >= 20) return dark ? '#fbbf24' : '#d97706';
  return dark ? '#f87171' : '#dc2626';
}

function fmtResetCompact(sec) {
  if (sec === null || sec === undefined || sec < 0) return '';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.max(1, Math.floor((sec % 3600) / 60));
  if (d > 0) return d + '天' + h + 'h';
  if (h > 0) return h + 'h' + m + 'm';
  return m + 'm';
}

function buildMiniQuotaTile(name, bucket) {
  const rem = bucket && Number.isFinite(bucket.remainingPct) ? Math.max(0, Math.min(100, Math.round(bucket.remainingPct))) : null;
  if (rem === null) return '';
  const r = 14;
  const c = 2 * Math.PI * r;
  const dash = ((rem / 100) * c).toFixed(2);
  const col = quotaRingColor(rem);
  const trackCol = isHostDarkMode() ? '#293240' : 'rgba(128,138,155,0.18)';
  const sub = bucket.resetInSec ? fmtResetCompact(bucket.resetInSec) : (rem >= 100 ? '满额就绪' : '实时额度');
  return (
    '<div class="cpop-qtile">' +
      '<div class="cpop-mini-ring">' +
        '<svg width="36" height="36" viewBox="0 0 36 36" style="transform:rotate(-90deg)">' +
          '<circle cx="18" cy="18" r="' + r + '" fill="none" stroke="' + trackCol + '" stroke-width="3.2"/>' +
          '<circle cx="18" cy="18" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="3.2" stroke-dasharray="' + dash + ' ' + c.toFixed(2) + '" stroke-linecap="round"/>' +
        '</svg>' +
        '<span class="cpop-mini-val" style="color:' + col + '">' + rem + '%</span>' +
      '</div>' +
      '<div class="cpop-qtile-info">' +
        '<div class="cpop-qtile-name">' + escHtml(name) + '</div>' +
        '<div class="cpop-qtile-sub">' + escHtml(sub) + '</div>' +
      '</div>' +
    '</div>'
  );
}

function renderCodexPopoverContent(payload) {
  const pop = document.getElementById('agy-codex-ctx-content');
  if (!pop) return;
  const m = payload && payload.metrics;
  if (!m) {
    pop.innerHTML =
      '<div class="cpop-head"><div class="cpop-title-wrap"><span class="cpop-title">上下文与配额</span><span class="cpop-badge">待就绪</span></div></div>' +
      '<div style="color:var(--gs-ink-2);font-size:11.5px;padding:4px 0 2px;">发送首条消息后即可实时统计上下文构成与模型配额。</div>' +
      '<button type="button" class="cpop-foot-link" id="cpopOpenSideBtn"><span>展开侧栏完整明细</span><span>→</span></button>';
  } else {
    const usedPct = Math.max(0, Math.min(100, Number(m.contextPct || 0)));
    const r = 18;
    const c = 2 * Math.PI * r;
    const usedLen = ((usedPct / 100) * c).toFixed(2);
    const ringCol = usedPct >= 82 ? (isHostDarkMode() ? '#f87171' : '#dc2626')
      : (usedPct >= 60 ? (isHostDarkMode() ? '#fbbf24' : '#d97706') : 'var(--gs-accent, #1a73e8)');
    const trackCol = isHostDarkMode() ? '#293240' : 'rgba(128,138,155,0.18)';

    const rate = m.latestStepTokPerSec > 0 ? m.latestStepTokPerSec : (m.avgTokPerSec || 0);
    const activePool = payload.quota && payload.quota.activePool;
    let quotaHtml = '';
    if (activePool) {
      const t1 = buildMiniQuotaTile('5h 额度', activePool.window5h);
      const t2 = buildMiniQuotaTile('每周余量', activePool.windowWeekly);
      if (t1 || t2) {
        const cols = (t1 && t2) ? 'repeat(2,1fr)' : '1fr';
        quotaHtml = '<div class="cpop-quota-grid" style="grid-template-columns:' + cols + '">' + t1 + t2 + '</div>';
      }
    }

    const shortModel = (m.activeModelLabel || 'Gemini').replace(/^Gemini\s+/i, '');
    pop.innerHTML =
      '<div class="cpop-head">' +
        '<div class="cpop-title-wrap">' +
          '<span class="cpop-title">上下文与配额</span>' +
          '<span class="cpop-badge">' + escHtml(shortModel) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="cpop-ring-row">' +
        '<div class="cpop-big-ring">' +
          '<svg width="46" height="46" viewBox="0 0 46 46" style="transform:rotate(-90deg)">' +
            '<circle cx="23" cy="23" r="' + r + '" fill="none" stroke="' + trackCol + '" stroke-width="4.2"/>' +
            '<circle cx="23" cy="23" r="' + r + '" fill="none" stroke="' + ringCol + '" stroke-width="4.2" stroke-dasharray="' + usedLen + ' ' + c.toFixed(2) + '" stroke-linecap="round"/>' +
          '</svg>' +
          '<span class="cpop-big-ring-pct">' + Math.round(usedPct) + '%</span>' +
        '</div>' +
        '<div class="cpop-ring-info">' +
          '<div class="cpop-ring-top">' +
            '<span class="cpop-big">' + fmtCompact(m.latestContextTokens) + ' <small>/ ' + fmtCompact(m.contextLimit) + '</small></span>' +
            '<span class="cpop-rem" style="color:' + ringCol + '">剩 ' + m.remainingPct + '%</span>' +
          '</div>' +
          '<div class="cpop-sub">' +
            '<span>缓存 ' + Math.round(m.latestCacheHitPct || m.avgCacheHitPct || 0) + '%</span>' +
            '<span>' + (rate > 0 ? rate.toFixed(1) + ' tok/s' : m.steps + ' 步推理') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      quotaHtml +
      '<button type="button" class="cpop-foot-link" id="cpopOpenSideBtn"><span>展开侧栏完整明细</span><span>→</span></button>';
  }

  const openBtn = pop.querySelector('#cpopOpenSideBtn');
  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePulseSidePanel();
    });
  }
}

function updateTelemetryUI(payload) {
  if (!payload) return;
  window.__agyLastTelemetry = payload;
  const m = payload.metrics;

  const btn = document.getElementById('agy-codex-ctx-btn');
  if (btn && m) {
    const pct = Math.max(0, Math.min(100, Number(m.contextPct || 0)));
    const circ = 33.93; // 2 * pi * 5.4
    const offset = circ * (1 - pct / 100);
    const fg = btn.querySelector('.codex-ring-fg');
    const lbl = btn.querySelector('.codex-ctx-pct');
    if (fg) fg.setAttribute('stroke-dashoffset', offset.toFixed(2));
    const label = Math.round(pct) + '%';
    if (lbl && lbl.textContent !== label) lbl.textContent = label;

    const level = pct >= 82 ? 'danger' : (pct >= 60 ? 'warn' : 'normal');
    btn.setAttribute('data-level', level);
  }

  const pop = document.getElementById('agy-codex-ctx-popover');
  if (pop && pop.classList.contains('open')) {
    renderCodexPopoverContent(payload);
    positionCodexPopover();
  }

  if (wasBusy) syncHakimiState();
}

function normalizeTelemetryPort(p) {
  const num = Number(p);
  return Number.isInteger(num) && num >= 1 && num <= 65535 ? num : null;
}

if (typeof window.__agyTelemetryPort === 'undefined') {
  window.__agyTelemetryPort = normalizeTelemetryPort(
    typeof AGY_TELEMETRY_PORT !== 'undefined' ? AGY_TELEMETRY_PORT : null
  );
} else if (typeof AGY_TELEMETRY_PORT !== 'undefined') {
  const injectedPort = normalizeTelemetryPort(AGY_TELEMETRY_PORT);
  if (injectedPort) window.__agyTelemetryPort = injectedPort;
}

function connectTelemetryStream() {
  if (window.__agyTelemetryRetryTimer) {
    window.clearTimeout(window.__agyTelemetryRetryTimer);
    window.__agyTelemetryRetryTimer = 0;
  }
  if (window.__agyTelemetryES) {
    try { window.__agyTelemetryES.close(); } catch (_) {}
    window.__agyTelemetryES = null;
  }
  const port = normalizeTelemetryPort(window.__agyTelemetryPort);
  if (!port) return;
  try {
    const es = new EventSource('http://127.0.0.1:' + port + '/api/events?conv=auto&view=compact');
    window.__agyTelemetryES = es;
    es.onmessage = (evt) => {
      try { updateTelemetryUI(JSON.parse(evt.data)); } catch (_) {}
    };
    es.onerror = () => {
      try { es.close(); } catch (_) {}
      if (window.__agyTelemetryES === es) window.__agyTelemetryES = null;
      window.__agyTelemetryRetryTimer = window.setTimeout(connectTelemetryStream, 3500);
    };
  } catch (_) {}
}

window.__agySetTelemetryPort = function(nextPort) {
  const valid = normalizeTelemetryPort(nextPort);
  if (!valid) return;
  const changed = window.__agyTelemetryPort !== valid;
  window.__agyTelemetryPort = valid;
  if (changed || !window.__agyTelemetryES) {
    connectTelemetryStream();
  }
  preloadOutfitForTheme(window.__agyCurrentTheme || readThemeMode());
  const drawer = document.getElementById('agy-pulse-drawer');
  const frame = document.getElementById('agy-pulse-iframe');
  if (changed && frame && frame.dataset.port && frame.dataset.port !== String(valid)) {
    if (drawer?.classList.contains('open')) {
      const surf = getEffectiveSurfaceForPulse();
      frame.dataset.surf = surf;
      frame.dataset.port = String(valid);
      frame.src = 'http://127.0.0.1:' + valid + '/?theme=' + surf;
    } else {
      frame.dataset.port = '';
      frame.removeAttribute('src');
    }
  }
};

// ==================== Part 4.2: Compact 6-Slice Rotary Theme Dial ====================
let dialAngle = 0;
let dialActiveIdx = 0;
let dialAudioCtx = null;
let dialSoundOn = (() => {
  try { return localStorage.getItem(DIAL_SOUND_STORE) !== '0'; } catch (_) { return true; }
})();

function playDialTick() {
  if (!dialSoundOn) return;
  try {
    if (!dialAudioCtx) dialAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = dialAudioCtx.currentTime;
    const osc = dialAudioCtx.createOscillator();
    const gain = dialAudioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(980, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.022);
    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.026);
    osc.connect(gain);
    gain.connect(dialAudioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.028);
  } catch (_) {}
}

function buildDialSvgMarkup() {
  const n = DIAL_THEMES.length;
  const step = 360 / n;
  const cx = 114, cy = 114, rOuter = 108, rInner = 42, rText = 77;
  const parts = ['<circle cx="114" cy="114" r="112" fill="none" stroke="rgba(128,128,128,0.22)" stroke-width="2"/>'];
  for (let i = 0; i < n; i++) {
    const t = DIAL_THEMES[i];
    const midDeg = -90 + i * step;
    const a1 = (midDeg - step / 2) * Math.PI / 180;
    const a2 = (midDeg + step / 2) * Math.PI / 180;
    const x1 = cx + rOuter * Math.cos(a1), y1 = cy + rOuter * Math.sin(a1);
    const x2 = cx + rOuter * Math.cos(a2), y2 = cy + rOuter * Math.sin(a2);
    const x3 = cx + rInner * Math.cos(a2), y3 = cy + rInner * Math.sin(a2);
    const x4 = cx + rInner * Math.cos(a1), y4 = cy + rInner * Math.sin(a1);
    const d = 'M ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' A ' + rOuter + ' ' + rOuter + ' 0 0 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' L ' + x3.toFixed(2) + ' ' + y3.toFixed(2) + ' A ' + rInner + ' ' + rInner + ' 0 0 0 ' + x4.toFixed(2) + ' ' + y4.toFixed(2) + ' Z';
    const radMid = midDeg * Math.PI / 180;
    const tx = cx + rText * Math.cos(radMid), ty = cy + rText * Math.sin(radMid);
    const dx = cx + 97 * Math.cos(radMid), dy = cy + 97 * Math.sin(radMid);
    const rotTxt = i * step;
    parts.push(
      '<g class="agy-dial-slice" data-idx="' + i + '" style="cursor:pointer">' +
        '<path d="' + d + '" fill="' + t.sliceBg + '" stroke="rgba(255,255,255,0.9)" stroke-width="2.2"/>' +
        '<circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="4.5" fill="' + t.sliceInk + '"/>' +
        '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" fill="' + t.sliceInk + '" font-size="13" font-weight="800" text-anchor="middle" dominant-baseline="central" transform="rotate(' + rotTxt + ',' + tx.toFixed(1) + ',' + ty.toFixed(1) + ')">' + t.short + '</text>' +
      '</g>'
    );
  }
  return parts.join('');
}

function closeThemeDial() {
  const pop = document.getElementById('agy-theme-dial-pop');
  if (pop) pop.classList.remove('open');
}

function ensureThemeDialPop() {
  let pop = document.getElementById('agy-theme-dial-pop');
  if (pop) return pop;
  const n = DIAL_THEMES.length;
  const step = 360 / n;

  pop = document.createElement('div');
  pop.id = 'agy-theme-dial-pop';
  pop.className = 'notranslate';
  pop.innerHTML =
    '<div class="agy-dial-stage" id="agy-dial-stage" title="拖动旋转 / 滚轮拨动 / 点击转一格">' +
      '<svg class="agy-dial-ptr" id="agy-dial-ptr" width="22" height="20" viewBox="0 0 26 24">' +
        '<path d="M13 21L3.5 5.5C2.8 4.3 3.7 2.8 5.1 2.8H20.9C22.3 2.8 23.2 4.3 22.5 5.5L13 21Z" fill="var(--gs-accent,#1a73e8)" stroke="#ffffff" stroke-width="2.2" stroke-linejoin="round"/>' +
      '</svg>' +
      '<div id="agy-dial-rotor"><svg width="168" height="168" viewBox="0 0 228 228">' + buildDialSvgMarkup() + '</svg></div>' +
      '<button type="button" id="agy-dial-hub" title="点击顺时针转一格">' +
        '<span class="agy-hub-name" id="agy-hub-name">晨曦</span>' +
        '<span class="agy-hub-sub">点击转格</span>' +
      '</button>' +
    '</div>' +
    '<div class="agy-dial-foot">' +
      '<button type="button" class="agy-dial-mbtn' + (dialSoundOn ? ' active' : '') + '" id="agy-dial-mute" title="开关机械微音">' + (dialSoundOn ? '🔊' : '🔇') + '</button>' +
      '<button type="button" class="agy-dial-mbtn" id="agy-dial-reset" title="恢复 Default 极简原版">↺ 恢复默认</button>' +
    '</div>';
  document.body.appendChild(pop);

  const rotor = pop.querySelector('#agy-dial-rotor');
  const ptr = pop.querySelector('#agy-dial-ptr');
  const hubName = pop.querySelector('#agy-hub-name');
  const resetBtn = pop.querySelector('#agy-dial-reset');
  const muteBtn = pop.querySelector('#agy-dial-mute');

  function idxFromDeg(deg) {
    const norm = ((-deg % 360) + 360) % 360;
    return Math.round(norm / step) % n;
  }

  function setDialAngle(deg, snap, silent) {
    dialAngle = deg;
    rotor.classList.toggle('snapping', !!snap);
    rotor.style.transform = 'rotate(' + dialAngle.toFixed(2) + 'deg)';
    const idx = idxFromDeg(dialAngle);
    if (idx !== dialActiveIdx) {
      dialActiveIdx = idx;
      const item = DIAL_THEMES[idx];
      hubName.textContent = item.short;
      resetBtn.classList.remove('active');
      if (!silent) {
        playDialTick();
        ptr.classList.remove('tick');
        void ptr.offsetWidth;
        ptr.classList.add('tick');
        applyThemeMode(item.id);
        if (!isBusy()) say(item.say, 1400);
      }
    }
  }

  function stepDial(delta) {
    const slot = Math.round(dialAngle / step) - delta;
    setDialAngle(slot * step, true, false);
  }

  function snapToIdx(targetIdx) {
    const desiredMod = ((-targetIdx * step) % 360 + 360) % 360;
    const curMod = ((dialAngle % 360) + 360) % 360;
    let diff = desiredMod - curMod;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    setDialAngle(dialAngle + diff, true, false);
  }

  let dragging = false;
  let moved = 0;
  let startPtrAngle = 0;
  let startRotor = 0;

  function ptrAngle(e) {
    const r = rotor.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  }

  rotor.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    rotor.classList.add('dragging');
    rotor.classList.remove('snapping');
    try { rotor.setPointerCapture(e.pointerId); } catch (_) {}
    startPtrAngle = ptrAngle(e);
    startRotor = dialAngle;
  });
  rotor.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    let d = ptrAngle(e) - startPtrAngle;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    moved += Math.abs(d);
    setDialAngle(startRotor + d, false, false);
  });
  rotor.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    rotor.classList.remove('dragging');
    try { rotor.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved < 5) {
      const slice = e.target instanceof Element ? e.target.closest('.agy-dial-slice') : null;
      if (slice) { snapToIdx(Number(slice.getAttribute('data-idx'))); return; }
    }
    setDialAngle(Math.round(dialAngle / step) * step, true, false);
  });

  pop.querySelector('#agy-dial-stage').addEventListener('wheel', (e) => {
    e.preventDefault();
    stepDial(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  pop.querySelector('#agy-dial-hub').addEventListener('click', (e) => {
    e.stopPropagation();
    stepDial(1);
  });
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dialSoundOn = !dialSoundOn;
    try { localStorage.setItem(DIAL_SOUND_STORE, dialSoundOn ? '1' : '0'); } catch (_) {}
    muteBtn.classList.toggle('active', dialSoundOn);
    muteBtn.textContent = dialSoundOn ? '🔊' : '🔇';
  });
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    playDialTick();
    dialActiveIdx = -1;
    hubName.textContent = '极简';
    resetBtn.classList.add('active');
    applyThemeMode('off');
    if (!isBusy()) say('已恢复原生极简风', 1400);
  });

  pop.__syncFromTheme = () => {
    const cur = readThemeMode();
    const idx = DIAL_THEMES.findIndex((x) => x.id === cur);
    if (idx >= 0) {
      dialActiveIdx = -1;
      resetBtn.classList.remove('active');
      setDialAngle(-idx * step, false, true);
      hubName.textContent = DIAL_THEMES[idx].short;
    } else {
      dialActiveIdx = -1;
      hubName.textContent = '极简';
      resetBtn.classList.add('active');
    }
  };

  if (!window.__AGY_DIAL_GLOBAL_BOUND__) {
    window.__AGY_DIAL_GLOBAL_BOUND__ = true;
    document.addEventListener('pointerdown', (e) => {
      if (e.target instanceof Element && e.target.closest('#agy-theme-dial-pop, #agy-inline-theme-btn')) return;
      closeThemeDial();
    }, true);
    document.addEventListener('keydown', (e) => {
      const p = document.getElementById('agy-theme-dial-pop');
      if (!p || !p.classList.contains('open')) return;
      if (e.key === 'Escape') { closeThemeDial(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { stepDial(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { stepDial(-1); e.preventDefault(); }
    }, true);
  }
  return pop;
}

function toggleThemeDial(anchorBtn) {
  const pop = ensureThemeDialPop();
  if (pop.classList.contains('open')) {
    closeThemeDial();
    return;
  }
  pop.__syncFromTheme();
  const r = anchorBtn.getBoundingClientRect();
  const left = Math.max(10, Math.min(window.innerWidth - 216, r.left - 24));
  const top = Math.max(38, r.bottom + 8);
  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(top) + 'px';
  pop.classList.add('open');
}

function mountCodexRingAndTopTheme() {
  for (const oldId of ['agy-theme-switch', 'agy-theme-tip', 'agy-theme-switch-style', 'agy-theme-switcher-host', 'agy-token-telemetry-style', 'agy-composer-top-strip', 'agy-token-telemetry-bar']) {
    const el = document.getElementById(oldId);
    if (el) el.remove();
  }

  let st = document.getElementById('agy-custom-ui-style');
  if (!st) {
    st = document.createElement('style');
    st.id = 'agy-custom-ui-style';
    document.head.appendChild(st);
  }
  if (st.textContent !== CUSTOM_UI_CSS) st.textContent = CUSTOM_UI_CSS;

  // 1. Mount Codex Context Ring immediately to the left of the Permissions button inside .surface-composer
  const composer = document.querySelector('.surface-composer');
  if (composer) {
    bindComposerResizeObserver();
    const anchor = findPermissionButtonInComposer(composer);
    if (anchor && anchor.parentElement) {
      let ctxBtn = document.getElementById('agy-codex-ctx-btn');
      if (!ctxBtn) {
        ctxBtn = document.createElement('button');
        ctxBtn.id = 'agy-codex-ctx-btn';
        ctxBtn.type = 'button';
        ctxBtn.className = 'notranslate';
        ctxBtn.setAttribute('aria-label', '查看上下文窗口与模型额度');
        ctxBtn.setAttribute('aria-controls', 'agy-pulse-drawer');
        ctxBtn.setAttribute('aria-expanded', String(document.getElementById('agy-pulse-drawer')?.classList.contains('open') === true));
        ctxBtn.innerHTML =
          '<svg class="codex-ring-svg" viewBox="0 0 16 16" fill="none">' +
            '<circle class="codex-ring-bg" cx="8" cy="8" r="5.4" stroke-width="2.1"/>' +
            '<circle class="codex-ring-fg" cx="8" cy="8" r="5.4" stroke-width="2.1" stroke-dasharray="33.93" stroke-dashoffset="33.93" stroke-linecap="round"/>' +
          '</svg>' +
          '<span class="codex-ctx-pct">--%</span>';

        ctxBtn.addEventListener('mouseenter', () => {
          if (document.getElementById('agy-pulse-drawer')?.classList.contains('open')) return;
          window.clearTimeout(popHideTimer);
          let pop = document.getElementById('agy-codex-ctx-popover');
          if (!pop) {
            pop = document.createElement('div');
            pop.id = 'agy-codex-ctx-popover';
            pop.className = 'notranslate';
            pop.innerHTML =
              '<div id="agy-codex-ctx-content"></div>' +
              '<button type="button" class="pulse-close-x" aria-label="关闭速览" title="关闭">' +
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>' +
              '</button>';
            pop.querySelector('.pulse-close-x').addEventListener('click', () => closePulseViews(true));
            pop.addEventListener('mouseenter', () => window.clearTimeout(popHideTimer));
            pop.addEventListener('mouseleave', () => {
              popHideTimer = window.setTimeout(() => pop.classList.remove('open'), 160);
            });
            document.body.appendChild(pop);
          }
          renderCodexPopoverContent(window.__agyLastTelemetry);
          pop.classList.add('open');
          positionCodexPopover();
        });

        ctxBtn.addEventListener('mouseleave', () => {
          const pop = document.getElementById('agy-codex-ctx-popover');
          if (pop) {
            popHideTimer = window.setTimeout(() => pop.classList.remove('open'), 180);
          }
        });

        ctxBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          togglePulseSidePanel();
        });
      }

      if (ctxBtn.parentElement !== anchor.parentElement || ctxBtn.nextElementSibling !== anchor) {
        anchor.parentElement.insertBefore(ctxBtn, anchor);
      }
      if (window.__agyLastTelemetry) updateTelemetryUI(window.__agyLastTelemetry);
    }
  }

  // 2. Mount Topbar Theme Switcher Pill
  const titleMenuBar = document.querySelector('[data-testid="title-menu-bar"]');
  if (titleMenuBar) {
    let btn = document.getElementById('agy-inline-theme-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'agy-inline-theme-btn';
      btn.type = 'button';
      btn.className = 'notranslate';
      btn.title = '打开实体主题转盘（支持拖转 / 滚轮 / 点击切换 6 套主题）';
      btn.innerHTML = '<span class="agy-tb-dot"></span><span class="agy-tb-label">Google</span>';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleThemeDial(btn);
      });
    }
    if (btn.parentElement !== titleMenuBar) {
      titleMenuBar.appendChild(btn);
    }
    applyThemeMode(readThemeMode());
  }

  // 3. Enhance native Model Selector button inside composer
  if (typeof enhanceModelTriggerButton === 'function') {
    enhanceModelTriggerButton(composer);
  }

  if (!window.__agyTelemetryStarted) {
    window.__agyTelemetryStarted = true;
    connectTelemetryStream();
  }
}

// ==================== Part 4.3: 0-Flicker Categorized Model Picker + Dynamic Effort Slider ====================

const MODEL_NAME_RX = /\b(Gemini|Claude|GPT|Orchestrator|Opus|Sonnet|Flash|Neon|Carbon|Argon|Hydrogen)\b/i;
const EFFORT_TAIL_RX = /^(.*?)\s+(Minimal|Low|Medium|High|X-?High|Ex\s*High|Extra\s*High|Max)\s*$/i;
const EFFORT_WORD_RX = /^(Minimal|Low|Medium|High|X-?High|Ex\s*High|Extra\s*High|Max)$/i;

let mpState = {
  open: false,
  tab: 'gemini',
  items: [],
  usageEl: null,
  nativeRoot: null,
  focusedName: '',
  rawBypassUntil: 0,
  busySwitching: false,
  probingModel: '',
  effortCache: Object.create(null), // { [baseName]: [{ label, short, isEffort }] }
  captureTimer: 0,
  captureObs: null,
  knownNodes: null,
};

function detectModelFamily(name) {
  const s = String(name || '');
  if (/^Orchestrator\b/i.test(s)) return 'orch';
  if (/\bClaude\b|Opus|Sonnet/i.test(s)) return 'claude';
  if (/\bGPT\b|\bo[134]\b/i.test(s)) return 'gpt';
  return 'gemini';
}

function shortEffortLabel(raw) {
  const s = String(raw || '').trim();
  if (/^Medium$/i.test(s)) return 'Med';
  if (/^Extra\s*High$/i.test(s)) return 'Ex High';
  if (/^Minimal$/i.test(s)) return 'Min';
  return s;
}

function findModelTriggerInComposer(composer) {
  const root = composer || document.querySelector('.surface-composer');
  if (!root) return null;
  const buttons = root.querySelectorAll('button, [role="button"]');
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    if (b.id === 'agy-codex-ctx-btn') continue;
    const txt = (b.textContent || '').replace(/\s+/g, ' ').trim();
    if (txt.length >= 3 && txt.length <= 64 && MODEL_NAME_RX.test(txt)) {
      return b;
    }
  }
  return null;
}

function getModelClickableRows(rootEl) {
  if (!rootEl) return [];
  // 1. Prefer explicit ARIA menu/listbox items
  const ariaItems = Array.from(rootEl.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]'));
  if (ariaItems.length >= 2) return ariaItems;

  // 2. Fallback: native buttons inside custom popovers
  const btns = Array.from(rootEl.querySelectorAll('button')).filter((b) => {
    const t = (b.textContent || '').trim();
    return t.length >= 2 && t.length <= 120;
  });
  if (btns.length >= 2) return btns;

  // 3. Universal fallback: shallowest clickable leaf row divs matching model or usage text
  const allDivs = Array.from(rootEl.querySelectorAll('div, li'));
  const rows = [];
  for (let i = 0; i < allDivs.length; i++) {
    const d = allDivs[i];
    const t = (d.innerText || d.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 100) continue;
    const isModelOrUsage = MODEL_NAME_RX.test(t) || /查看用量统计|View\s*Usage/i.test(t);
    if (!isModelOrUsage) continue;
    // Skip outer container if it holds multiple child rows
    const childMatches = Array.from(d.children).filter((c) => MODEL_NAME_RX.test(c.textContent || '')).length;
    if (childMatches >= 2) continue;
    // Skip tiny inner spans/sub-divs if an already-collected row contains it or vice versa
    const hasChildDivWithModel = Array.from(d.querySelectorAll('div')).some(
      (sub) => sub !== d && (sub.textContent || '').trim().length >= 6 && MODEL_NAME_RX.test(sub.textContent || '') && sub.getBoundingClientRect().height >= 26
    );
    if (hasChildDivWithModel) continue;
    const rect = d.getBoundingClientRect();
    if (rect.height >= 24 && rect.height <= 64 && rect.width >= 120) {
      rows.push(d);
    }
  }
  return rows;
}

function collectLeafTexts(el) {
  const out = [];
  if (!el) return out;
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === 3) {
      const t = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === 'SVG' || tag === 'STYLE' || tag === 'SCRIPT') return;
    let c = node.firstChild;
    while (c) {
      walk(c);
      c = c.nextSibling;
    }
  };
  walk(el);
  return out;
}

function getSpacedText(el) {
  return collectLeafTexts(el).join(' ').replace(/\s+/g, ' ').trim();
}

function isMainAppShell(el) {
  if (!el || el === document.body || el === document.documentElement) return true;
  if (el.id === 'root' || el.id === 'app') return true;
  if (el.querySelector && el.querySelector('.surface-composer, [data-testid="title-menu-bar"], [role="navigation"], main')) return true;
  const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  if (r && (r.width > 560 || r.height > Math.max(680, window.innerHeight * 0.88))) return true;
  return false;
}

function isModelPopupContainer(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.id === 'agy-model-picker' || el.closest('#agy-model-picker, .surface-composer, [role="navigation"]')) return false;
  if (isMainAppShell(el)) return false;
  const txt = getSpacedText(el);
  if (txt.length < 18 || txt.length > 3000) return false;
  const rows = getModelClickableRows(el);
  let hits = 0;
  for (let i = 0; i < rows.length; i++) {
    if (MODEL_NAME_RX.test(getSpacedText(rows[i]))) hits++;
  }
  return hits >= 2;
}

function getStealthTargetRoot(el) {
  if (!el) return null;
  const popper = el.closest('[data-radix-popper-content-wrapper], [data-floating-ui-portal]');
  if (popper && popper !== document.body && !isMainAppShell(popper)) return popper;
  let cur = el;
  while (cur.parentElement && cur.parentElement !== document.body && !isMainAppShell(cur.parentElement)) {
    cur = cur.parentElement;
  }
  return cur;
}

function markStealth(el) {
  if (!el || el.id === 'agy-model-picker' || isMainAppShell(el)) return;
  el.classList.add('agy-native-model-stealth');
  const root = getStealthTargetRoot(el);
  if (root && root !== document.body && root.id !== 'agy-model-picker' && !isMainAppShell(root)) {
    root.classList.add('agy-native-model-stealth');
  }
}

function clearAllStealth() {
  document.documentElement.removeAttribute('data-agy-mp-capturing');
  document.querySelectorAll('.agy-native-model-stealth').forEach((el) => {
    el.classList.remove('agy-native-model-stealth');
  });
}

function findNativeModelRoot() {
  const candidates = document.querySelectorAll(
    '[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"], [data-radix-menu-content], [role="dialog"], [data-floating-ui-portal], body > div'
  );
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    if (isModelPopupContainer(c)) return c;
  }
  return null;
}

function parseNativeModelMenu(menuEl, triggerText) {
  const rows = getModelClickableRows(menuEl);
  const items = [];
  const seenNames = new Set();
  let usageEl = null;
  const trigClean = (triggerText || '').replace(/\s+/g, ' ').trim();

  for (let i = 0; i < rows.length; i++) {
    const el = rows[i];
    const parts = collectLeafTexts(el).filter((p) => !/^[✓✔>›ⓘ•·]$/.test(p));
    if (!parts.length) continue;
    const rawSpaced = parts.join(' ');
    if (/查看用量统计|用量统计|View\s*Usage/i.test(rawSpaced)) {
      usageEl = el;
      continue;
    }
    if (!MODEL_NAME_RX.test(rawSpaced)) continue;

    const isLeaving = parts.some((p) => /Leaving\s*Soon|即将下线|即将停用/i.test(p));
    // Strip badge tokens cleanly while preserving separate span boundaries!
    const coreParts = parts.filter(
      (p) => !/^(New|Leaving\s*Soon|即将下线|即将停用|Notice|Hint|提示)$/i.test(p)
    );
    if (!coreParts.length) continue;

    let baseName = coreParts[0];
    let effortLabel = '';
    let subLabel = '';
    let hasSubmenu = false;
    const fam = detectModelFamily(baseName);

    if (fam === 'orch') {
      baseName = 'Orchestrator';
      subLabel = coreParts.slice(1).join(' ').trim();
      if (!subLabel) {
        subLabel = coreParts[0].replace(/^Orchestrator\s*/i, '').trim();
      }
      hasSubmenu = true;
    } else if (coreParts.length >= 2 && EFFORT_WORD_RX.test(coreParts[coreParts.length - 1])) {
      effortLabel = coreParts[coreParts.length - 1];
      baseName = coreParts.slice(0, -1).join(' ').trim();
      hasSubmenu = true;
    } else {
      const joined = coreParts.join(' ');
      const em = joined.match(EFFORT_TAIL_RX);
      if (em) {
        baseName = em[1].trim();
        effortLabel = em[2].trim();
        hasSubmenu = true;
      } else {
        baseName = joined;
        const parenM = joined.match(/\((Minimal|Low|Medium|High|XHigh|Ex\s*High|Extra\s*High|Max)\)/i);
        if (parenM) effortLabel = parenM[1].trim();
        hasSubmenu = el.getAttribute('aria-haspopup') === 'menu' || !!el.querySelector('svg.lucide-chevron-right');
      }
    }

    const dedupeKey = baseName.toLowerCase();
    if (!baseName || seenNames.has(dedupeKey)) continue;
    seenNames.add(dedupeKey);

    const isSelected =
      el.getAttribute('aria-checked') === 'true' ||
      el.getAttribute('data-state') === 'checked' ||
      !!el.querySelector('svg.lucide-check') ||
      (trigClean && trigClean.toLowerCase().startsWith(baseName.toLowerCase()));

    items.push({
      el,
      baseName,
      family: fam,
      tab: (fam === 'gemini' || fam === 'orch') ? 'gemini' : 'other',
      effortLabel,
      subLabel,
      hasSubmenu,
      isLeaving,
      isSelected,
    });
  }
  return { items, usageEl };
}

function dispatchRadixClick(el) {
  if (!el) return;
  try {
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 10, top: 10, width: 40, height: 24 };
    const cx = Math.round(r.left + r.width * 0.5);
    const cy = Math.round(r.top + r.height * 0.5);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true, clientX: cx, clientY: cy }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, buttons: 0, pointerType: 'mouse', isPrimary: true, clientX: cx, clientY: cy }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, buttons: 0, clientX: cx, clientY: cy }));
    el.click();
  } catch (_) {
    try { el.click(); } catch (__) {}
  }
}

function waitMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function findVisibleSubmenuOptions(mainRootEl) {
  // Search ALL compact floating containers (including siblings/descendants inside the same portal, ONLY excluding mainRootEl itself!)
  const pools = document.querySelectorAll(
    '[role="menu"], [data-radix-menu-content], [role="listbox"], [data-radix-popper-content-wrapper], [data-floating-ui-portal] > div, body > div'
  );
  for (let i = pools.length - 1; i >= 0; i--) {
    const p = pools[i];
    if (!p || p === mainRootEl || p.id === 'agy-model-picker' || p.closest('#agy-model-picker')) continue;
    if (isMainAppShell(p)) continue;
    // Never mistake an ancestor wrapper of the main model list for the submenu
    if (mainRootEl && p.contains(mainRootEl)) continue;

    const rc = p.getBoundingClientRect();
    if (rc.width < 50 || rc.width > 380 || rc.height < 40 || rc.height > 460) continue;

    const rawTxt = getSpacedText(p);
    if (!rawTxt || rawTxt.length > 600) continue;
    if (/模型选择|查看用量统计|View\s*Usage/i.test(rawTxt)) continue;

    const looksEffort = /Thinking\s*effort|思考强度/i.test(rawTxt) || (/\bLow\b/i.test(rawTxt) && /\bHigh\b/i.test(rawTxt));
    let candEls = Array.from(p.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], button'));
    if (candEls.length < 2) {
      candEls = Array.from(p.querySelectorAll('div, li')).filter((d) => {
        if (d.children.length > 3) return false;
        const t = getSpacedText(d).replace(/[✓✔ⓘ>›]/g, '').trim();
        if (!t || t.length > 48 || /^Thinking\s*effort$|^思考强度$/i.test(t)) return false;
        const dr = d.getBoundingClientRect();
        return dr.height >= 18 && dr.height <= 54 && (EFFORT_WORD_RX.test(t) || MODEL_NAME_RX.test(t));
      });
    }

    const opts = [];
    const seen = new Set();
    for (let j = 0; j < candEls.length; j++) {
      const el = candEls[j];
      const lbl = getSpacedText(el).replace(/[✓✔ⓘ>›]/g, '').trim();
      if (!lbl || lbl.length > 48 || /^Thinking\s*effort$|^思考强度$/i.test(lbl)) continue;
      const isEff = EFFORT_WORD_RX.test(lbl);
      const isMod = MODEL_NAME_RX.test(lbl);
      if (!isEff && !isMod) continue;
      const k = lbl.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      opts.push({
        label: lbl,
        short: shortEffortLabel(lbl),
        el,
        isEffort: isEff,
      });
    }
    if (opts.length >= 2 && (looksEffort || opts.every((o) => o.isEffort || MODEL_NAME_RX.test(o.label)))) {
      markStealth(p);
      return { root: p, opts, isEffort: opts.every((o) => o.isEffort) || looksEffort };
    }
  }
  return null;
}

async function ensureStealthNativeMenuOpen() {
  let root = findNativeModelRoot();
  if (root) {
    markStealth(root);
    mpState.nativeRoot = root;
    return root;
  }
  const trig = findModelTriggerInComposer();
  if (!trig) return null;
  document.documentElement.setAttribute('data-agy-mp-capturing', '1');
  mpState.rawBypassUntil = Date.now() + 450;
  dispatchRadixClick(trig);
  for (let i = 0; i < 12; i++) {
    await waitMs(20);
    root = findNativeModelRoot();
    if (root) {
      markStealth(root);
      document.documentElement.removeAttribute('data-agy-mp-capturing');
      mpState.nativeRoot = root;
      return root;
    }
  }
  document.documentElement.removeAttribute('data-agy-mp-capturing');
  return null;
}

async function openSubmenuForModel(mainRoot, modelBaseName) {
  const parsed = parseNativeModelMenu(mainRoot, '');
  const row = parsed.items.find((x) => x.baseName.toLowerCase() === modelBaseName.toLowerCase());
  if (!row || !row.el) return null;

  // Prefer explicit Radix SubTrigger element if nested or ancestor
  const trigEl =
    row.el.closest('[aria-haspopup="menu"]') ||
    row.el.querySelector('[aria-haspopup="menu"]') ||
    row.el;

  const r = trigEl.getBoundingClientRect();
  const cx = Math.round(r.left + r.width * 0.65);
  const cy = Math.round(r.top + r.height * 0.5);

  document.documentElement.setAttribute('data-agy-mp-capturing', '1');
  const pOpts = { bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true, clientX: cx, clientY: cy };
  const mOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };
  trigEl.dispatchEvent(new PointerEvent('pointerover', pOpts));
  trigEl.dispatchEvent(new PointerEvent('pointerenter', Object.assign({}, pOpts, { bubbles: false })));
  trigEl.dispatchEvent(new PointerEvent('pointermove', pOpts));
  trigEl.dispatchEvent(new MouseEvent('mouseover', mOpts));
  trigEl.dispatchEvent(new MouseEvent('mouseenter', Object.assign({}, mOpts, { bubbles: false })));
  trigEl.dispatchEvent(new MouseEvent('mousemove', mOpts));
  try { trigEl.focus({ preventScroll: true }); } catch (_) {}

  let sub = null;
  for (let i = 0; i < 16; i++) {
    await waitMs(22);
    if (!document.contains(mainRoot)) break;
    // Re-send a tiny pointermove on step 2 (Radix open timer starts after hover move)
    if (i === 2) {
      trigEl.dispatchEvent(new PointerEvent('pointermove', Object.assign({}, pOpts, { clientX: cx + 2 })));
      trigEl.dispatchEvent(new MouseEvent('mousemove', Object.assign({}, mOpts, { clientX: cx + 2 })));
    }
    sub = findVisibleSubmenuOptions(mainRoot);
    if (sub) break;
    if (i === 5) {
      trigEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));
    }
  }
  document.documentElement.removeAttribute('data-agy-mp-capturing');
  return sub;
}

async function probeModelOptionsLive(modelBaseName) {
  if (!modelBaseName || mpState.suppressAutoProbe || mpState.probingModel === modelBaseName) return;
  const item = mpState.items.find((x) => x.baseName.toLowerCase() === modelBaseName.toLowerCase());
  if (!item || !item.hasSubmenu) return;
  if (mpState.effortCache[modelBaseName] && mpState.effortCache[modelBaseName].length >= 2) return;

  mpState.probingModel = modelBaseName;
  try {
    const mainRoot = await ensureStealthNativeMenuOpen();
    if (!mainRoot) return;
    const sub = await openSubmenuForModel(mainRoot, modelBaseName);
    if (sub && sub.opts.length >= 2) {
      mpState.effortCache[modelBaseName] = sub.opts.map((o) => ({
        label: o.label,
        short: o.short,
        isEffort: o.isEffort,
      }));
      if (mpState.open && mpState.focusedName.toLowerCase() === modelBaseName.toLowerCase()) {
        renderModelPickerBody();
      }
    }
  } finally {
    if (mpState.probingModel === modelBaseName) mpState.probingModel = '';
  }
}

async function triggerSubOptionSelection(modelBaseName, targetLabel) {
  if (mpState.busySwitching) return;
  mpState.busySwitching = true;
  try {
    const mainRoot = await ensureStealthNativeMenuOpen();
    if (!mainRoot) return;
    const sub = await openSubmenuForModel(mainRoot, modelBaseName);
    if (!sub) return;
    mpState.effortCache[modelBaseName] = sub.opts.map((o) => ({
      label: o.label,
      short: o.short,
      isEffort: o.isEffort,
    }));
    const match = sub.opts.find((o) => o.label.toLowerCase() === targetLabel.toLowerCase());
    if (match && match.el) {
      dispatchRadixClick(match.el);
      for (let i = 0; i < mpState.items.length; i++) {
        const it = mpState.items[i];
        it.isSelected = it.baseName.toLowerCase() === modelBaseName.toLowerCase();
        if (it.isSelected) {
          if (it.family === 'orch') it.subLabel = match.label;
          else it.effortLabel = match.label;
        }
      }
      renderModelPickerBody();
      window.setTimeout(() => enhanceModelTriggerButton(), 80);
    }
  } finally {
    mpState.busySwitching = false;
  }
}

async function triggerModelSelection(item) {
  if (mpState.busySwitching) return;
  mpState.busySwitching = true;
  mpState.suppressAutoProbe = true;
  try {
    // 0ms instant visual feedback + immediate native row click (NEVER block waiting for submenu!)
    mpState.focusedName = item.baseName;
    for (let i = 0; i < mpState.items.length; i++) {
      mpState.items[i].isSelected = mpState.items[i].baseName.toLowerCase() === item.baseName.toLowerCase();
    }
    renderModelPickerBody();

    const mainRoot = await ensureStealthNativeMenuOpen();
    if (!mainRoot) return;
    const parsed = parseNativeModelMenu(mainRoot, '');
    const live = parsed.items.find((x) => x.baseName.toLowerCase() === item.baseName.toLowerCase());
    if (live && live.el) {
      dispatchRadixClick(live.el);
    }
    window.setTimeout(() => enhanceModelTriggerButton(), 60);
  } finally {
    mpState.busySwitching = false;
  }
  // Probe real effort levels cleanly AFTER native menu finishes closing
  window.setTimeout(() => {
    mpState.suppressAutoProbe = false;
    if (item.hasSubmenu && !mpState.effortCache[item.baseName] && mpState.open && mpState.focusedName.toLowerCase() === item.baseName.toLowerCase()) {
      void probeModelOptionsLive(item.baseName);
    }
  }, 110);
}

function stopCaptureWatch() {
  if (mpState.captureObs) {
    mpState.captureObs.disconnect();
    mpState.captureObs = null;
  }
  if (mpState.captureTimer) {
    window.clearTimeout(mpState.captureTimer);
    mpState.captureTimer = 0;
  }
  document.documentElement.removeAttribute('data-agy-mp-capturing');
}

function closeModelPicker(dismissNative) {
  stopCaptureWatch();
  mpState.open = false;
  const pop = document.getElementById('agy-model-picker');
  if (pop) pop.classList.remove('open');
  if (dismissNative) {
    const root = findNativeModelRoot();
    if (root) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    }
  }
  clearAllStealth();
}

function positionModelPicker(anchorBtn) {
  const pop = document.getElementById('agy-model-picker');
  const btn = anchorBtn || findModelTriggerInComposer();
  if (!pop || !btn || !pop.classList.contains('open')) return;
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth || 320;
  const h = pop.offsetHeight || 390;
  const left = Math.max(10, Math.min(window.innerWidth - w - 10, r.left));
  let top = r.top - h - 8;
  if (top < 12) top = Math.max(10, window.innerHeight - h - 12);
  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(top) + 'px';
}

function renderModelRowHtml(item) {
  const isFocused = item.baseName.toLowerCase() === (mpState.focusedName || '').toLowerCase();
  const rightTxt = item.subLabel || item.effortLabel || '';
  return (
    '<button type="button" class="amp-row' + (isFocused ? ' active' : '') + (item.isLeaving ? ' leaving' : '') + '" data-model="' + escHtml(item.baseName) + '">' +
      '<span class="amp-name">' + escHtml(item.baseName) + '</span>' +
      '<span class="amp-row-r">' +
        (rightTxt ? '<span class="amp-eff-txt">' + escHtml(rightTxt) + '</span>' : '') +
        '<span class="amp-check">' + (item.isSelected ? '✓' : '') + '</span>' +
      '</span>' +
    '</button>'
  );
}

const AMP_BOLT_ICO =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' +
  '</svg>';
const AMP_RESET_ICO =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>' +
  '</svg>';

function displayEffortWord(raw) {
  const s = String(raw || '').trim();
  if (/^Minimal$/i.test(s)) return '极低';
  if (/^Low$/i.test(s)) return '低';
  if (/^Medium$/i.test(s)) return '中';
  if (/^High$/i.test(s)) return '高';
  if (/^XHigh$/i.test(s)) return 'XHigh';
  if (/^Ex\s*High$|^Extra\s*High$/i.test(s)) return '超高';
  if (/^Max$/i.test(s)) return '极限';
  return s;
}

function renderEffortArea(pop, focused) {
  const box = pop.querySelector('.amp-effort-box');
  if (!box) return;

  if (!focused || !focused.hasSubmenu) {
    box.classList.add('is-hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('is-hidden');

  const cached = mpState.effortCache[focused.baseName];
  if (!cached || cached.length < 2) {
    box.innerHTML =
      '<div class="amp-cx-top">' +
        '<span></span>' +
        '<div class="amp-cx-center">' +
          '<div class="amp-cx-big">' + escHtml(displayEffortWord(focused.effortLabel || focused.subLabel || '…')) + '</div>' +
          '<div class="amp-cx-model">' + escHtml(focused.baseName) + '</div>' +
        '</div>' +
        '<span></span>' +
      '</div>' +
      '<div class="amp-cx-pill-track" style="--amp-r:0.5;opacity:0.45"><div class="amp-cx-pill-fill"></div><div class="amp-cx-pill-thumb"></div></div>';
    void probeModelOptionsLive(focused.baseName);
    return;
  }

  const allEffort = cached.every((o) => o.isEffort);
  if (!allEffort) {
    const curSub = (focused.subLabel || '').toLowerCase();
    box.innerHTML =
      '<div class="amp-cx-top" style="margin-bottom:8px">' +
        '<span></span>' +
        '<div class="amp-cx-center"><div class="amp-cx-model" style="margin-top:0">' + escHtml(focused.baseName) + '</div></div>' +
        '<span></span>' +
      '</div>' +
      '<div class="amp-sub-pills">' +
        cached.map((o) =>
          '<button type="button" class="amp-sub-pill' + (o.label.toLowerCase() === curSub ? ' active' : '') + '" data-sub-lbl="' + escHtml(o.label) + '">' + escHtml(o.label) + '</button>'
        ).join('') +
      '</div>';
    box.querySelectorAll('.amp-sub-pill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        playDialTick();
        void triggerSubOptionSelection(focused.baseName, btn.getAttribute('data-sub-lbl'));
      });
    });
    return;
  }

  // Codex 1:1 pill-track slider preserving ALL real levels (Low / Med / High / XHigh / Ex High ...)
  const n = cached.length;
  const curEff = (focused.effortLabel || '').toLowerCase();
  let curIdx = cached.findIndex((o) => o.label.toLowerCase() === curEff);
  if (curIdx < 0) curIdx = Math.floor(n / 2);
  const ratio = n > 1 ? curIdx / (n - 1) : 1;

  const dotsHtml = cached.map((o, i) => {
    const r = n > 1 ? i / (n - 1) : 0;
    return '<span class="amp-cx-pill-dot' + (i < curIdx ? ' passed' : '') + '" data-eff-idx="' + i + '" data-eff-lbl="' + escHtml(o.label) + '" style="left:calc(13px + (100% - 26px) * ' + r.toFixed(4) + ')"></span>';
  }).join('');

  box.innerHTML =
    '<div class="amp-cx-top">' +
      '<button type="button" class="amp-cx-iconbtn" id="amp-cx-bolt" title="快速切至最低档">' + AMP_BOLT_ICO + '</button>' +
      '<div class="amp-cx-center">' +
        '<div class="amp-cx-big" id="amp-cx-big" data-eff-lbl="' + escHtml(cached[curIdx].label) + '">' + escHtml(displayEffortWord(cached[curIdx].label)) + '</div>' +
        '<div class="amp-cx-model">' + escHtml(focused.baseName) + '</div>' +
      '</div>' +
      '<button type="button" class="amp-cx-iconbtn" id="amp-cx-reset" title="重置为均衡档">' + AMP_RESET_ICO + '</button>' +
    '</div>' +
    '<div class="amp-cx-pill-track" id="amp-cx-track" style="--amp-r:' + ratio.toFixed(4) + '">' +
      '<div class="amp-cx-pill-fill"></div>' +
      dotsHtml +
      '<div class="amp-cx-pill-thumb"></div>' +
    '</div>';

  const track = box.querySelector('#amp-cx-track');
  const bigEl = box.querySelector('#amp-cx-big');
  const dots = Array.from(box.querySelectorAll('.amp-cx-pill-dot'));
  let sliding = false;
  let lastIdx = curIdx;

  function ratioFromX(clientX) {
    const rc = track.getBoundingClientRect();
    const usable = Math.max(1, rc.width - 26);
    return Math.max(0, Math.min(1, (clientX - rc.left - 13) / usable));
  }
  function paintTrack(r, idx) {
    track.style.setProperty('--amp-r', r.toFixed(4));
    dots.forEach((d, i) => d.classList.toggle('passed', i < idx));
    if (bigEl && cached[idx]) {
      bigEl.textContent = displayEffortWord(cached[idx].label);
      bigEl.setAttribute('data-eff-lbl', cached[idx].label);
    }
  }
  function commitIdx(idx) {
    const snapR = n > 1 ? idx / (n - 1) : 1;
    paintTrack(snapR, idx);
    const chosen = cached[idx];
    if (chosen && chosen.label.toLowerCase() !== curEff) {
      playDialTick();
      void triggerSubOptionSelection(focused.baseName, chosen.label);
    }
  }

  track.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    sliding = true;
    track.classList.add('dragging');
    try { track.setPointerCapture(e.pointerId); } catch (_) {}
    const r = ratioFromX(e.clientX);
    const idx = Math.round(r * (n - 1));
    lastIdx = idx;
    paintTrack(r, idx);
  });
  track.addEventListener('pointermove', (e) => {
    if (!sliding) return;
    const r = ratioFromX(e.clientX);
    const idx = Math.round(r * (n - 1));
    if (idx !== lastIdx) {
      lastIdx = idx;
      playDialTick();
    }
    paintTrack(r, idx);
  });
  track.addEventListener('pointerup', (e) => {
    if (!sliding) return;
    sliding = false;
    track.classList.remove('dragging');
    try { track.releasePointerCapture(e.pointerId); } catch (_) {}
    const idx = Math.round(ratioFromX(e.clientX) * (n - 1));
    commitIdx(idx);
  });

  const boltBtn = box.querySelector('#amp-cx-bolt');
  if (boltBtn) {
    boltBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      commitIdx(0);
    });
  }
  const resetBtn = box.querySelector('#amp-cx-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const medIdx = cached.findIndex((o) => /^Medium$/i.test(o.label));
      commitIdx(medIdx >= 0 ? medIdx : Math.floor(n / 2));
    });
  }
}

function renderModelPickerBody() {
  const pop = document.getElementById('agy-model-picker');
  if (!pop) return;

  const tabsEl = pop.querySelector('.amp-tabs');
  if (tabsEl) tabsEl.setAttribute('data-tab', mpState.tab);
  pop.querySelectorAll('.amp-tab').forEach((tb) => {
    tb.classList.toggle('active', tb.getAttribute('data-amp-tab') === mpState.tab);
  });

  const listEl = pop.querySelector('.amp-list');
  if (listEl) {
    const shown = mpState.items.filter((x) => x.tab === mpState.tab);
    const blocks = [];
    if (mpState.tab === 'gemini') {
      const mainGem = shown.filter((x) => x.family === 'gemini' && !x.isLeaving);
      const orch = shown.filter((x) => x.family === 'orch');
      const leaving = shown.filter((x) => x.family === 'gemini' && x.isLeaving);
      if (mainGem.length) blocks.push(mainGem.map(renderModelRowHtml).join(''));
      if (orch.length) blocks.push(orch.map(renderModelRowHtml).join(''));
      if (leaving.length) blocks.push(leaving.map(renderModelRowHtml).join(''));
    } else {
      const claudes = shown.filter((x) => x.family === 'claude');
      const others = shown.filter((x) => x.family !== 'claude');
      if (claudes.length) blocks.push(claudes.map(renderModelRowHtml).join(''));
      if (others.length) blocks.push(others.map(renderModelRowHtml).join(''));
    }
    listEl.innerHTML = blocks.join('<div class="amp-hairline"></div>');

    listEl.querySelectorAll('.amp-row').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.getAttribute('data-model');
        const target = mpState.items.find((x) => x.baseName === name);
        if (!target) return;
        playDialTick();
        void triggerModelSelection(target);
      });
    });
  }

  const focused = mpState.items.find((x) => x.baseName.toLowerCase() === (mpState.focusedName || '').toLowerCase()) || mpState.items[0];
  renderEffortArea(pop, focused);
  if (mpState.open) positionModelPicker();
}

function ensureModelPickerPop() {
  let pop = document.getElementById('agy-model-picker');
  if (pop) return pop;
  pop = document.createElement('div');
  pop.id = 'agy-model-picker';
  pop.className = 'notranslate';
  pop.innerHTML =
    '<div class="amp-head">' +
      '<div class="amp-tabs" data-tab="gemini">' +
        '<div class="amp-tab-glider"></div>' +
        '<button type="button" class="amp-tab active" data-amp-tab="gemini">Gemini</button>' +
        '<button type="button" class="amp-tab" data-amp-tab="other">其他模型</button>' +
      '</div>' +
      '<button type="button" class="amp-raw-btn" id="amp-raw-btn" title="临时切回原生菜单">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="amp-list"></div>' +
    '<div class="amp-effort-box"></div>';
  document.body.appendChild(pop);

  pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  pop.addEventListener('mousedown', (e) => e.stopPropagation());

  pop.querySelectorAll('.amp-tab').forEach((tb) => {
    tb.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = tb.getAttribute('data-amp-tab');
      if (next && next !== mpState.tab) {
        mpState.tab = next;
        renderModelPickerBody();
      }
    });
  });

  pop.querySelector('#amp-raw-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    mpState.rawBypassUntil = Date.now() + 2000;
    const hadNative = !!findNativeModelRoot();
    closeModelPicker(false);
    if (!hadNative) {
      const trig = findModelTriggerInComposer();
      if (trig) dispatchRadixClick(trig);
    }
  });

  if (!window.__AGY_MP_GLOBAL_BOUND__) {
    window.__AGY_MP_GLOBAL_BOUND__ = true;
    document.addEventListener('pointerdown', (e) => {
      if (!mpState.open || mpState.busySwitching || !e.isTrusted) return;
      if (e.target instanceof Element && e.target.closest('#agy-model-picker, .agy-model-trigger')) return;
      closeModelPicker(true);
    }, true);
    document.addEventListener('keydown', (e) => {
      if (mpState.open && e.key === 'Escape') {
        closeModelPicker(true);
        e.preventDefault();
      }
    }, true);
  }
  return pop;
}

function attachModelPickerFromRoot(menuRoot, anchorBtn) {
  if (!menuRoot) return false;
  markStealth(menuRoot);
  const parsed = parseNativeModelMenu(menuRoot, anchorBtn ? anchorBtn.textContent : '');
  if (!parsed.items.length) return false;

  stopCaptureWatch();
  mpState.nativeRoot = menuRoot;
  mpState.items = parsed.items;
  mpState.usageEl = parsed.usageEl;
  const sel = parsed.items.find((x) => x.isSelected) || parsed.items[0];
  mpState.focusedName = sel.baseName;
  mpState.tab = sel.tab;
  mpState.open = true;

  const pop = ensureModelPickerPop();
  renderModelPickerBody();
  pop.classList.add('open');
  positionModelPicker(anchorBtn);

  // Immediately probe real thinking effort levels (incl. XHigh / Ex High) in stealth!
  void probeModelOptionsLive(sel.baseName);
  return true;
}

function armZeroFrameModelCapture(anchorBtn) {
  if (Date.now() < mpState.rawBypassUntil) return;
  stopCaptureWatch();
  // Stealth BEFORE native menu mounts = absolute 0-frame flicker!
  document.documentElement.setAttribute('data-agy-mp-capturing', '1');

  const obs = new MutationObserver(() => {
    const root = findNativeModelRoot();
    if (root) {
      attachModelPickerFromRoot(root, anchorBtn);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  mpState.captureObs = obs;
  mpState.captureTimer = window.setTimeout(() => {
    // Safety valve: if native menu did not open within 450ms, never stay stuck hiding popovers
    const root = findNativeModelRoot();
    if (!root || !attachModelPickerFromRoot(root, anchorBtn)) {
      stopCaptureWatch();
    }
  }, 450);
}

function enhanceModelTriggerButton(composer) {
  const btn = findModelTriggerInComposer(composer);
  if (!btn) return null;
  if (!btn.classList.contains('agy-model-trigger')) {
    btn.classList.add('agy-model-trigger');
  }
  const fam = detectModelFamily(btn.textContent || '');
  if (btn.getAttribute('data-agy-mfamily') !== fam) {
    btn.setAttribute('data-agy-mfamily', fam);
  }
  if (!btn.__agyModelBound) {
    btn.__agyModelBound = true;
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || Date.now() < mpState.rawBypassUntil) return;
      if (mpState.open) {
        closeModelPicker(true);
        return;
      }
      armZeroFrameModelCapture(btn);
    }, true);
    btn.addEventListener('click', () => {
      if (Date.now() < mpState.rawBypassUntil || mpState.open) return;
      const root = findNativeModelRoot();
      if (root) attachModelPickerFromRoot(root, btn);
    }, true);
  }
  return btn;
}

// ==================== Part 4.5: Local File & Artifact Context Menu ====================

function normalizeClientFilePath(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim().replace(/^["'`]+|["'`]+$/g, '');
  if (!s) return '';
  if (/^file:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      s = decodeURIComponent(u.pathname || '');
      if (/^\/[A-Za-z]:/.test(s)) s = s.slice(1);
    } catch (_) {
      s = s.replace(/^file:\/\/\/?/i, '');
      try { s = decodeURIComponent(s); } catch (_) {}
    }
  }
  s = s.replace(/#L?\d+(?:-L?\d+)?$/i, '').replace(/#.*$/, '').replace(/:(\d+)(?::\d+)?$/, '');
  if (/^[A-Za-z]:[\\/]/.test(s)) s = s.replace(/\//g, '\\');
  return s;
}

function getCurrentConvIdFromHost() {
  const m = (window.location.href || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (m) return m[0];
  return (window.__agyLastTelemetry && window.__agyLastTelemetry.activeConversationId) || '';
}

function detectFileContextTarget(target) {
  if (!(target instanceof Element)) return null;
  if (target.closest('#agy-file-ctx-menu, #hakimi-muse-stage, #agy-pulse-drawer, #agy-codex-ctx-popover')) return null;

  // 1. Direct file:/// anchor link
  const a = target.closest('a[href]');
  if (a) {
    const href = a.getAttribute('href') || '';
    if (/^file:\/\//i.test(href)) {
      const fp = normalizeClientFilePath(href);
      if (fp) return { path: fp, label: (a.textContent || '').trim() || fp.split(/[\\/]/).pop() };
    }
  }

  // 2. Selected Windows/POSIX absolute file path text or <code> path
  const selText = (window.getSelection ? String(window.getSelection()) : '').trim();
  const winPathRx = /^[A-Za-z]:[\\/][^<>:"|?*\r\n]{2,260}$/;
  if (selText && winPathRx.test(selText)) {
    const fp = normalizeClientFilePath(selText);
    return { path: fp, label: fp.split(/[\\/]/).pop(), selText };
  }
  const codeEl = target.closest('code');
  if (codeEl) {
    const ct = (codeEl.textContent || '').trim();
    if (winPathRx.test(ct)) {
      const fp = normalizeClientFilePath(ct);
      return { path: fp, label: fp.split(/[\\/]/).pop(), selText };
    }
  }

  // 3. Antigravity Artifact card (e.g. rounded card inside chat containing a file icon + title + summary)
  const inChat = target.closest('main, [data-quotable="true"], [data-testid*="conversation"], [data-testid*="message"]');
  if (inChat) {
    let el = target;
    for (let depth = 0; depth < 7 && el && el !== inChat; depth += 1) {
      const attrPath = el.getAttribute('data-path') || el.getAttribute('data-file-path') || el.getAttribute('data-uri') || el.getAttribute('title') || '';
      if (/^file:\/\//i.test(attrPath) || winPathRx.test(attrPath.trim())) {
        const fp = normalizeClientFilePath(attrPath);
        return { path: fp, label: fp.split(/[\\/]/).pop(), selText };
      }
      const cls = String(el.className || '');
      const hasCardLook = /rounded-(?:lg|xl|2xl)|border|cursor-pointer/.test(cls);
      const hasSvg = !!el.querySelector('svg');
      if (hasCardLook && hasSvg && !el.closest('.surface-composer, [role="navigation"]') && !el.querySelector('pre, textarea, input')) {
        const rect = el.getBoundingClientRect();
        if (rect.width >= 180 && rect.width <= 960 && rect.height >= 44 && rect.height <= 260) {
          const lines = (el.innerText || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
          if (lines.length >= 1 && lines.length <= 8 && lines[0].length >= 2 && lines[0].length <= 90) {
            const firstLine = lines[0];
            if (!/^(Copy|复制|Working|Thought|思考)$/i.test(firstLine)) {
              return { artifactTitle: firstLine, convId: getCurrentConvIdFromHost(), label: firstLine, selText };
            }
          }
        }
      }
      el = el.parentElement;
    }
  }
  return null;
}

async function callLocalOpenApi(payload) {
  const port = normalizeTelemetryPort(window.__agyTelemetryPort);
  if (!port) return { ok: false, error: 'no_port' };
  try {
    const res = await fetch('http://127.0.0.1:' + port + '/api/local-open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

function closeFileCtxMenu() {
  const m = document.getElementById('agy-file-ctx-menu');
  if (m) m.classList.remove('open');
}

function showFileCtxMenu(x, y, resolved, selText) {
  let menu = document.getElementById('agy-file-ctx-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'agy-file-ctx-menu';
    menu.className = 'notranslate';
    document.body.appendChild(menu);
  }
  const filePath = resolved.path;
  const isDir = !!resolved.isDirectory;
  const titleName = resolved.name || filePath.split(/[\\/]/).pop() || filePath;

  const iconFolder = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';
  const iconOpen = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
  const iconApps = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>';
  const iconCopy = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

  menu.innerHTML =
    '<div class="agy-fctx-head" title="' + escHtml(filePath) + '">' + escHtml(titleName) + '</div>' +
    '<button type="button" class="agy-fctx-item" data-act="reveal">' + iconFolder + '<span>' + (isDir ? '打开文件夹' : '在文件夹中显示') + '</span></button>' +
    '<button type="button" class="agy-fctx-item" data-act="open">' + iconOpen + '<span>用默认程序打开</span></button>' +
    (isDir ? '' : '<button type="button" class="agy-fctx-item" data-act="open-with">' + iconApps + '<span>选择打开方式…</span></button>') +
    '<div class="agy-fctx-sep"></div>' +
    '<button type="button" class="agy-fctx-item" data-act="copy-path">' + iconCopy + '<span>复制完整路径</span></button>' +
    (selText ? '<button type="button" class="agy-fctx-item" data-act="copy-sel">' + iconCopy + '<span>复制选中文字</span></button>' : '');

  menu.querySelectorAll('.agy-fctx-item').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const act = btn.getAttribute('data-act');
      closeFileCtxMenu();
      if (act === 'copy-path') {
        try { await navigator.clipboard.writeText(filePath); say('已复制路径', 1400); } catch (_) {}
      } else if (act === 'copy-sel' && selText) {
        try { await navigator.clipboard.writeText(selText); } catch (_) {}
      } else if (act === 'reveal' || act === 'open' || act === 'open-with') {
        const res = await callLocalOpenApi({ action: act, path: filePath });
        if (!res || !res.ok) say('打开失败，文件可能已被移动', 2000);
      }
    });
  });

  menu.classList.add('open');
  const mw = menu.offsetWidth || 224;
  const mh = menu.offsetHeight || 190;
  const left = Math.max(8, Math.min(window.innerWidth - mw - 8, x));
  const top = Math.max(8, Math.min(window.innerHeight - mh - 8, y));
  menu.style.left = Math.round(left) + 'px';
  menu.style.top = Math.round(top) + 'px';
}

function bindLocalFileContextMenu() {
  if (window.__AGY_FILE_CTX_BOUND__) return;
  window.__AGY_FILE_CTX_BOUND__ = true;

  const artifactCache = new Map();

  function preResolveArtifact(title, convId) {
    const cacheKey = (convId || '') + '::' + title;
    const hit = artifactCache.get(cacheKey);
    if (hit && Date.now() - hit.at < 8000) return hit;
    const entry = { at: Date.now(), pending: true, res: null };
    artifactCache.set(cacheKey, entry);
    void callLocalOpenApi({ action: 'resolve', artifactTitle: title, convId: convId || '' }).then((res) => {
      entry.pending = false;
      entry.res = res && res.ok && res.path ? res : null;
      entry.at = Date.now();
    });
    return entry;
  }

  // Pre-resolve artifact cards on right-button press (~80-150ms before contextmenu fires)
  // so non-artifact cards are NEVER falsely intercepted!
  document.addEventListener('mousedown', (event) => {
    if (event.button !== 2) return;
    if (!normalizeTelemetryPort(window.__agyTelemetryPort)) return;
    const info = detectFileContextTarget(event.target);
    if (info && info.artifactTitle && !info.path) {
      preResolveArtifact(info.artifactTitle, info.convId || '');
    }
  }, true);

  document.addEventListener('contextmenu', (event) => {
    closeFileCtxMenu();
    if (!normalizeTelemetryPort(window.__agyTelemetryPort)) return; // Let Electron native fallback handle it
    const info = detectFileContextTarget(event.target);
    if (!info) return;

    // 1. Direct file:/// links or explicit local paths: intercept immediately
    if (info.path) {
      event.preventDefault();
      event.stopPropagation();
      const cx = event.clientX;
      const cy = event.clientY;
      void callLocalOpenApi({ action: 'resolve', path: info.path }).then((res) => {
        if (res && res.ok && res.path) {
          showFileCtxMenu(cx, cy, res, info.selText || '');
        } else {
          showFileCtxMenu(cx, cy, { path: info.path, name: info.label, isDirectory: false }, info.selText || '');
        }
      });
      return;
    }

    // 2. Artifact cards: intercept ONLY when pre-resolved to a real backing file in brain/
    if (info.artifactTitle) {
      const cacheKey = (info.convId || '') + '::' + info.artifactTitle;
      const entry = artifactCache.get(cacheKey);
      if (entry && entry.res && entry.res.path) {
        event.preventDefault();
        event.stopPropagation();
        showFileCtxMenu(event.clientX, event.clientY, entry.res, info.selText || '');
      } else {
        preResolveArtifact(info.artifactTitle, info.convId || '');
      }
    }
  }, true);

  document.addEventListener('pointerdown', (e) => {
    if (e.target instanceof Element && e.target.closest('#agy-file-ctx-menu')) return;
    closeFileCtxMenu();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFileCtxMenu();
  }, true);
  window.addEventListener('scroll', closeFileCtxMenu, true);
  window.addEventListener('blur', closeFileCtxMenu);
}

// ==================== Part 5: Observer & Public API ====================

function ensureObserver() {
  if (window.__AGY_I18N_OBS__) return;
  window.__AGY_I18N_OBS__ = true;

  // Coalesce host updates with a 180ms throttle instead of every animation frame during streaming
  let refreshTimer = 0;
  function refreshFromHost() {
    refreshTimer = 0;
    syncDarkAttr();
    syncPulseDrawerSurface();
    syncHakimiState();
    const needsRing = !document.getElementById('agy-codex-ctx-btn') && !!document.querySelector('.surface-composer');
    const needsTheme = !document.getElementById('agy-inline-theme-btn') && !!document.querySelector('[data-testid="title-menu-bar"]');
    if (needsRing || needsTheme) mountCodexRingAndTopTheme();
    else enhanceModelTriggerButton();
    layoutMuseStage();
  }
  function scheduleRefresh() {
    if (!refreshTimer) {
      refreshTimer = window.setTimeout(refreshFromHost, 180);
    }
  }

  // Lightweight dedicated observer for light/dark theme class changes on <html> and <body> only (subtree: false!)
  const darkObs = new MutationObserver(() => {
    if (syncDarkAttr()) {
      syncPulseDrawerSurface();
    }
  });
  darkObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  if (document.body) {
    darkObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  const ownControls = '#hakimi-muse-stage, #hakimi-say, #agy-inline-theme-btn, #agy-theme-dial-pop, #agy-codex-ctx-btn, #agy-codex-ctx-popover, #agy-pulse-drawer, #agy-file-ctx-menu, #agy-model-picker';
  const observer = new MutationObserver((mutations) => {
    let hostChanged = false;
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (el && el.closest(ownControls)) continue;
      hostChanged = true;
      if (m.type === 'characterData') {
        translateNode(m.target);
      } else if (m.addedNodes && m.addedNodes.length) {
        for (let j = 0; j < m.addedNodes.length; j++) translateNode(m.addedNodes[j]);
      }
    }
    if (hostChanged) scheduleRefresh();
  });

  // Never watch `class` across the entire subtree (avoids waking on every hover/cursor/stream class toggle!)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-testid', 'aria-label']
  });
}

window.__AGY_THEME__ = {
  set: (m) => applyThemeMode(m),
  get: () => readThemeMode(),
  list: () => ['google', 'claude', 'nebula', 'everforest', 'kanagawa', 'bauhaus', 'off'],
  openDial: () => {
    const b = document.getElementById('agy-inline-theme-btn');
    if (b) toggleThemeDial(b);
  },
  openPulse: () => togglePulseSidePanel(),
};

window.__AGY_I18N__ = {
  refresh() {
    scan(document.body);
    ensureObserver();
    mountCodexRingAndTopTheme();
    mountMuseHakimi();
    layoutMuseStage();
  },
  translate: translateText,
};

applyThemeMode(readThemeMode());
window.setTimeout(() => { lastTitleBarKey = ''; syncTitleBarOverlay(readThemeMode()); }, 800);
scan(document.body);
ensureObserver();
mountCodexRingAndTopTheme();
mountMuseHakimi();
bindLocalFileContextMenu();

return 'AGY_MUSE_PULSE_OK';
