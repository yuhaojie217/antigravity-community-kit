// Antigravity · Hakimi Muse Companion + Codex Context Ring + Gemini Pulse Side Panel + i18n Engine
// Injected by dist/custom-theme-main.js on dom-ready inside an outer IIFE providing AGY_PHRASES & AGY_TELEMETRY_PORT.

const POSES = __HAKIMI_POSES__;
const AGY_THEMES = __AGY_THEMES__;
const THEME_STORE = 'agy-theme-mode:v1';
const MUSE_COLLAPSED_STORE = 'agy-hakimi-collapsed:v1';

const OFF_VAR_OVERRIDE =
  '\nhtml[data-agy-theme="off"] { --gs-bg: #ffffff; --gs-bg-2: #f4f4f5; --gs-side: #f4f4f5; --gs-side-hover: rgba(15, 23, 42, 0.06); ' +
  '--gs-ink: #18181b; --gs-ink-2: #52525b; --gs-ink-3: #71717a; --gs-line: #e4e4e7; --gs-line-soft: #f0f0f2; ' +
  '--gs-accent: #18181b; --gs-accent-hover: #27272a; --gs-accent-soft: rgba(24, 24, 27, 0.08); --gs-accent-ring: rgba(24, 24, 27, 0.22); }\n' +
  'html[data-agy-theme="off"]:has(body.theme-dark), html[data-agy-theme="off"] body.theme-dark { --gs-bg: #111317; --gs-bg-2: #181b21; --gs-side: #0e1014; --gs-side-hover: rgba(255, 255, 255, 0.07); ' +
  '--gs-ink: #f4f4f5; --gs-ink-2: #a1a1aa; --gs-ink-3: #71717a; --gs-line: #27272a; --gs-line-soft: #1f1f23; ' +
  '--gs-accent: #e4e4e7; --gs-accent-hover: #ffffff; --gs-accent-soft: rgba(255, 255, 255, 0.10); --gs-accent-ring: rgba(255, 255, 255, 0.24); }\n' +
  '/* Default(off) 极简石墨主题：同样提供干净的侧边栏层次、新建对话细框与聚焦框 */\n' +
  'html[data-agy-theme="off"] div[role="navigation"].bg-sidebar, html[data-agy-theme="off"] div[role="navigation"][aria-label="Sidebar"], html[data-agy-theme="off"] div[role="navigation"] .bg-sidebar { background: var(--gs-side) !important; background-color: var(--gs-side) !important; }\n' +
  'html[data-agy-theme="off"] div[role="navigation"].bg-sidebar, html[data-agy-theme="off"] div[role="navigation"][aria-label="Sidebar"] { border-right: 1px solid var(--gs-line) !important; }\n' +
  'html[data-agy-theme="off"] div[role="navigation"] [class*="group/section-header"] { background: var(--gs-side) !important; border-top: 1px solid var(--gs-line) !important; margin-top: 8px !important; padding-top: 10px !important; }\n' +
  'html[data-agy-theme="off"] div[role="navigation"].bg-sidebar > div:last-child { border-top: 1px solid var(--gs-line) !important; }\n' +
  'html[data-agy-theme="off"] a[data-testid="new-conversation-button"] { border-radius: 9999px !important; background: var(--gs-bg) !important; border: 1.5px solid var(--gs-line) !important; color: var(--gs-ink) !important; font-weight: 600 !important; transition: border-color 0.16s ease, box-shadow 0.16s ease !important; }\n' +
  'html[data-agy-theme="off"] a[data-testid="new-conversation-button"]:hover { border-color: var(--gs-ink-2) !important; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important; }\n' +
  'html[data-agy-theme="off"] div[data-testid="conversation-row-sidebar"] { border-radius: 9px !important; margin: 1.5px 6px !important; padding: 6px 10px !important; --row-bg: var(--gs-side); }\n' +
  'html[data-agy-theme="off"] div[data-testid="conversation-row-sidebar"]:hover { background: var(--gs-bg) !important; --row-bg: var(--gs-bg); }\n' +
  'html[data-agy-theme="off"] div[data-testid="conversation-row-sidebar"][data-selected="true"], html[data-agy-theme="off"] div[data-testid="conversation-row-sidebar"].bg-sidebar-secondary { background: var(--gs-bg) !important; box-shadow: inset 3px 0 0 var(--gs-accent), inset 0 0 0 1px var(--gs-line) !important; --row-bg: var(--gs-bg); }\n' +
  'html[data-agy-theme="off"] div[data-testid="conversation-row-sidebar"][data-selected="true"] span, html[data-agy-theme="off"] div[data-testid="conversation-row-sidebar"].bg-sidebar-secondary span { color: var(--gs-ink) !important; font-weight: 600 !important; }\n' +
  'html[data-agy-theme="off"] .surface-composer { border: 1.5px solid var(--gs-line) !important; border-radius: 17px !important; background: var(--gs-bg) !important; transition: border-color 0.18s ease, box-shadow 0.18s ease !important; }\n' +
  'html[data-agy-theme="off"] .surface-composer:focus-within { border-color: var(--gs-ink-2) !important; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08) !important; }\n';

function readThemeMode() {
  try {
    const v = localStorage.getItem(THEME_STORE);
    return (v === 'claude' || v === 'off' || v === 'google') ? v : 'google';
  } catch (_) {
    return 'google';
  }
}

function getEffectiveSurfaceForPulse() {
  if (document.body && document.body.classList.contains('theme-dark')) return 'dark';
  const m = readThemeMode();
  return m === 'claude' ? 'claude' : 'google';
}

function applyThemeMode(mode) {
  const normalized = (mode === 'claude' || mode === 'off' || mode === 'google') ? mode : 'google';
  if (document.documentElement.getAttribute('data-agy-theme') !== normalized) {
    document.documentElement.setAttribute('data-agy-theme', normalized);
  }
  let css = '';
  if (normalized === 'claude') {
    css = AGY_THEMES.claude || '';
  } else if (normalized === 'off') {
    css = OFF_VAR_OVERRIDE;
  }
  let style = document.getElementById('agy-theme-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'agy-theme-style';
  }
  if (document.head.lastElementChild !== style) document.head.appendChild(style);
  if (style.textContent !== css) style.textContent = css;
  try { localStorage.setItem(THEME_STORE, normalized); } catch (_) {}
  window.__agyCurrentTheme = normalized;

  const btn = document.getElementById('agy-inline-theme-btn');
  if (btn) {
    const meta = {
      claude: { dot: '#d97757', label: 'Claude' },
      google: { dot: '#3587ff', label: 'Google' },
      off:    { dot: '#8e9299', label: 'Default' }
    }[normalized] || { dot: '#3587ff', label: 'Google' };
    const dot = btn.querySelector('.agy-tb-dot');
    const lbl = btn.querySelector('.agy-tb-label');
    if (dot) dot.style.background = meta.dot;
    if (lbl && lbl.textContent !== meta.label) lbl.textContent = meta.label;
  }

  // Sync side drawer iframe theme live via postMessage without reloading the iframe
  const frame = document.getElementById('agy-pulse-iframe');
  if (frame && frame.src) {
    const surf = getEffectiveSurfaceForPulse();
    if (frame.dataset.surf !== surf) {
      frame.dataset.surf = surf;
      try {
        frame.contentWindow?.postMessage({ type: 'gemini-pulse:surface', surface: surf }, new URL(frame.src).origin);
      } catch (_) {}
    }
  }
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
  '#hakimi-muse-stage, #hakimi-say, #agy-codex-ctx-btn, #agy-codex-ctx-popover, #agy-pulse-drawer';

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
  filter: drop-shadow(0 4px 10px rgba(26, 40, 72, 0.12));
  transform-origin: 50% 80%;
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
}
body.theme-dark #hakimi-muse-img {
  filter: drop-shadow(0 5px 14px rgba(0, 0, 0, 0.46));
}

#hakimi-muse-img.pose-idle {
  animation: hakimi-breathe 3.8s ease-in-out infinite;
}
#hakimi-muse-img:hover {
  transform: translateY(-2px) scale(1.035);
}
#hakimi-muse-img:active {
  transform: translateY(0) scale(0.97);
}

@keyframes hakimi-breathe {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-1.8px); }
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
  animation: muse-dot-pulse 1.4s ease-in-out infinite;
}
@keyframes muse-dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.42; transform: scale(0.78); }
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

/* Codex Hover Popover Card */
#agy-codex-ctx-popover {
  position: fixed;
  z-index: 999992;
  width: 282px;
  padding: 12px 13px 10px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid var(--gs-line, #e3e8ef);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.13), 0 2px 6px rgba(15, 23, 42, 0.05);
  color: var(--gs-ink, #1f1f1f);
  font-size: 12px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  display: none;
  pointer-events: auto;
  animation: codex-pop-in 0.15s cubic-bezier(0.16, 1, 0.3, 1) both;
}
body.theme-dark #agy-codex-ctx-popover {
  background: #171c23;
  border-color: #2a323e;
  color: #e8edf4;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.50);
}
#agy-codex-ctx-popover.open {
  display: block;
}
#agy-codex-ctx-popover .cpop-head {
  padding-right: 42px;
}
#agy-codex-ctx-popover .pulse-close {
  position: absolute;
  top: 7px;
  right: 8px;
}
@keyframes codex-pop-in {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.cpop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.cpop-title {
  font-weight: 600;
  font-size: 12px;
  color: var(--gs-ink, #1f1f1f);
}
body.theme-dark .cpop-title { color: #e8edf4; }
.cpop-badge {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 99px;
  background: var(--gs-accent-soft, rgba(26, 115, 232, 0.09));
  color: var(--gs-accent, #1a73e8);
  font-weight: 500;
}
.cpop-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 7px;
}
.cpop-big {
  font-size: 16.5px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.cpop-big small {
  font-size: 11.5px;
  font-weight: 400;
  color: var(--gs-ink-3, #80868b);
}
.cpop-rem {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--gs-accent, #1a73e8);
}
.cpop-bar {
  height: 6px;
  border-radius: 99px;
  background: rgba(128, 138, 155, 0.15);
  overflow: hidden;
  display: flex;
  gap: 1px;
  margin-bottom: 8px;
}
.cpop-sub {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--gs-ink-2, #5f6368);
}
.cpop-div {
  height: 1px;
  background: var(--gs-line-soft, #eef2f7);
  margin: 9px 0;
}
body.theme-dark .cpop-div { background: #242b35; }
.cpop-quota-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11.5px;
  margin-bottom: 4px;
}
.cpop-foot-btn {
  margin-top: 8px;
  width: 100%;
  padding: 5px 8px;
  border-radius: 7px;
  border: 1px solid var(--gs-line, #e3e8ef);
  background: var(--gs-bg, #fbfdff);
  color: var(--gs-ink-2, #5f6368);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: border-color 0.14s ease, color 0.14s ease, background 0.14s ease;
}
body.theme-dark .cpop-foot-btn {
  background: #1e252f;
  border-color: #2c3542;
  color: #9ba4b2;
}
.cpop-foot-btn:hover {
  border-color: var(--gs-accent, #1a73e8);
  color: var(--gs-accent, #1a73e8);
}

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
let composerResizeObs = null;

function isBusy() {
  if (document.querySelector('button[data-testid="input-stop-button"]')) return true;
  if (document.querySelector('button[aria-label*="停止"], button[aria-label*="Stop"]')) return true;
  if (document.querySelector('[data-testid="running-items-card"]')) return true;
  return false;
}

function detectWorkActivity() {
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
    mode = (Math.floor((Date.now() - busyStartedAt) / 6500) % 2 === 0) ? 'write' : 'laptop';
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
  return { mode, label };
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
  const src = POSES[key] || POSES.idle;
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
  if (!composer) return;
  // Walk previous siblings or ancestor siblings to find the scrollable message list above composer
  let cur = composer.parentElement;
  while (cur && cur !== document.body) {
    const prev = cur.previousElementSibling;
    if (prev) {
      const cs = window.getComputedStyle(prev);
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
        prev.classList.toggle('agy-muse-scroll-pad', true);
        return;
      }
      const innerScroll = prev.querySelector('[class*="overflow-y-auto"]');
      if (innerScroll) {
        innerScroll.classList.toggle('agy-muse-scroll-pad', true);
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
    stageEl.style.display = 'none';
    return;
  }
  const cr = composer.getBoundingClientRect();
  if (cr.width < 180 || cr.top < 80 || cr.height === 0) {
    stageEl.style.display = 'none';
    return;
  }
  stageEl.style.display = 'flex';
  ensureChatScrollPadding(composer);

  const isCollapsed = stageEl.classList.contains('collapsed');
  // Responsive scale on compact window heights
  const imgH = window.innerHeight < 660 ? 76 : 90;
  const imgW = Math.round(imgH * (560 / 460));
  if (imgEl) {
    imgEl.style.width = imgW + 'px';
    imgEl.style.height = imgH + 'px';
  }

  // Desk baseline is at 80.0% from top of the 560x460 frame (20.0% overhang below desk edge for hands/laptop/notebook).
  // Aligning bottom at cr.top + 0.20*imgH places the desk baseline squarely on the 1px composer top border!
  const overhang = isCollapsed ? 0 : Math.round(imgH * 0.20 - 1);
  const bottomPx = Math.round(window.innerHeight - cr.top - overhang);
  const centerX = Math.round(cr.left + cr.width / 2);

  stageEl.style.left = centerX + 'px';
  stageEl.style.bottom = bottomPx + 'px';
  stageEl.style.transform = 'translateX(-50%)';

  if (sayEl && sayEl.style.display !== 'none') placeSayBubble();
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

function renderCodexPopoverContent(payload) {
  const pop = document.getElementById('agy-codex-ctx-content');
  if (!pop) return;
  const m = payload && payload.metrics;
  if (!m) {
    pop.innerHTML =
      '<div class="cpop-head"><span class="cpop-title">上下文窗口</span><span class="cpop-badge">待就绪</span></div>' +
      '<div style="color:var(--gs-ink-2);font-size:11.5px;">发送首条消息后即可实时统计上下文构成与模型配额。</div>' +
      '<button type="button" class="cpop-foot-btn" id="cpopOpenSideBtn"><span>在侧边窗口打开额度看板</span><span>→</span></button>';
  } else {
    const bList = m.breakdown || [];
    const barSegs = bList.map((b) => {
      const w = m.contextLimit > 0 ? Math.max(0.8, (b.tokens / m.contextLimit) * 100) : 0;
      return '<div style="height:100%;width:' + w.toFixed(1) + '%;background:' + (SEG_COLOR_HEX[b.key] || '#1a73e8') + '"></div>';
    }).join('');

    const rate = m.latestStepTokPerSec > 0 ? m.latestStepTokPerSec : (m.avgTokPerSec || 0);
    const activePool = payload.quota && payload.quota.activePool;
    let quotaHtml = '';
    if (activePool && (activePool.window5h || activePool.windowWeekly)) {
      const qRows = [];
      if (Number.isFinite(activePool.window5h?.remainingPct)) {
        const rst = fmtResetShort(activePool.window5h.resetInSec);
        qRows.push(
          '<div class="cpop-quota-row">' +
            '<span style="color:var(--gs-ink-2)">' + escHtml(activePool.label) + ' · 5h</span>' +
            '<span><strong>剩余 ' + activePool.window5h.remainingPct + '%</strong>' + (rst ? ' <small style="color:var(--gs-ink-3)">(' + escHtml(rst) + ')</small>' : '') + '</span>' +
          '</div>'
        );
      }
      if (Number.isFinite(activePool.windowWeekly?.remainingPct)) {
        const weeklyReset = fmtResetShort(activePool.windowWeekly.resetInSec);
        qRows.push(
          '<div class="cpop-quota-row">' +
            '<span style="color:var(--gs-ink-2)">每周池余量</span>' +
            '<span><strong>剩余 ' + activePool.windowWeekly.remainingPct + '%</strong>' + (weeklyReset ? ' <small>(' + escHtml(weeklyReset) + ')</small>' : '') + '</span>' +
          '</div>'
        );
      }
      if (qRows.length) quotaHtml = '<div class="cpop-div"></div>' + qRows.join('');
    }

    const shortModel = (m.activeModelLabel || 'Gemini').replace(/^Gemini\s+/i, '');
    pop.innerHTML =
      '<div class="cpop-head">' +
        '<span class="cpop-title">上下文窗口</span>' +
        '<span class="cpop-badge">' + escHtml(shortModel) + '</span>' +
      '</div>' +
      '<div class="cpop-main">' +
        '<span class="cpop-big">' + fmtCompact(m.latestContextTokens) + ' <small>/ ' + fmtCompact(m.contextLimit) + '</small></span>' +
        '<span class="cpop-rem">剩余 ' + m.remainingPct + '%</span>' +
      '</div>' +
      '<div class="cpop-bar">' + barSegs + '</div>' +
      '<div class="cpop-sub">' +
        '<span>缓存命中 ' + Math.round(m.latestCacheHitPct || m.avgCacheHitPct || 0) + '%</span>' +
        '<span>' + (rate > 0 ? rate.toFixed(1) + ' tok/s' : m.steps + ' 步推理') + '</span>' +
      '</div>' +
      quotaHtml +
      '<button type="button" class="cpop-foot-btn" id="cpopOpenSideBtn"><span>在右侧窗口查看完整配额与 7 日明细</span><span>→</span></button>';
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
            pop.innerHTML = '<div id="agy-codex-ctx-content"></div><button type="button" class="pulse-close" aria-label="关闭速览">关闭</button>';
            pop.querySelector('.pulse-close').addEventListener('click', () => closePulseViews(true));
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
      btn.title = '切换界面主题 (Google / Claude / Default)';
      btn.innerHTML = '<span class="agy-tb-dot"></span><span class="agy-tb-label">Google</span>';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const order = ['google', 'claude', 'off'];
        const cur = readThemeMode();
        const next = order[(order.indexOf(cur) + 1) % order.length];
        applyThemeMode(next);
        if (!isBusy()) {
          setMuseMode('done');
          say(next === 'google' ? 'Google 晨曦风' : (next === 'claude' ? 'Claude 暖纸风' : '原生极简风'), 1600);
          window.setTimeout(() => { if (!isBusy() && currentMode === 'done') setMuseMode('idle'); }, 1500);
        }
      });
    }
    if (btn.parentElement !== titleMenuBar) {
      titleMenuBar.appendChild(btn);
    }
    applyThemeMode(readThemeMode());
  }

  if (!window.__agyTelemetryStarted) {
    window.__agyTelemetryStarted = true;
    connectTelemetryStream();
  }
}

// ==================== Part 5: Observer & Public API ====================

function ensureObserver() {
  if (window.__AGY_I18N_OBS__) return;
  window.__AGY_I18N_OBS__ = true;

  // Coalesce host updates per frame. Our controls also change the observed DOM.
  let refreshQueued = false;
  function refreshFromHost() {
    refreshQueued = false;
    syncHakimiState();
    const composer = document.querySelector('.surface-composer');
    const needsRing = composer && !document.getElementById('agy-codex-ctx-btn');
    const needsTheme = document.querySelector('[data-testid="title-menu-bar"]') && !document.getElementById('agy-inline-theme-btn');
    if (needsRing || needsTheme) mountCodexRingAndTopTheme();
    layoutMuseStage();
  }
  const ownControls = '#hakimi-muse-stage, #hakimi-say, #agy-inline-theme-btn, #agy-codex-ctx-btn, #agy-codex-ctx-popover, #agy-pulse-drawer';
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
    if (hostChanged && !refreshQueued) {
      refreshQueued = true;
      window.requestAnimationFrame(refreshFromHost);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-testid', 'aria-label', 'class']
  });
}

window.__AGY_THEME__ = {
  set: (m) => applyThemeMode(m),
  get: () => readThemeMode(),
  list: () => ['google', 'claude', 'off'],
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
scan(document.body);
ensureObserver();
mountCodexRingAndTopTheme();
mountMuseHakimi();

return 'AGY_MUSE_PULSE_OK';
