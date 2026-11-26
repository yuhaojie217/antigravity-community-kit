'use strict';

// Antigravity custom theme + localization + telemetry port mount module.
// Injected into app.asar/dist/custom-theme-main.js by patch_asar_stable.py.
//
// Design notes:
//  - attach() is called from dist/utils.js createWindow() BEFORE win.loadURL(),
//    so the 'dom-ready' listener is registered before the first navigation.
//  - Assets live under ~/.gemini/antigravity/custom_theme/app so updates never
//    delete them.
//  - Telemetry port is discovered in the main process from
//    ~/.gemini/config/plugins/gemini-pulse/sidecars/pulse/port.txt and pushed
//    to renderers on dom-ready, on bounded startup backoff if Sidecar starts
//    slightly later, and on port.txt change (zero continuous polling).

const { ipcMain, Menu, shell, clipboard } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const assetDirs = [
    path.join(os.homedir(), '.gemini', 'antigravity', 'custom_theme', 'app'),
];

const TELEMETRY_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugins', 'gemini-pulse', 'sidecars', 'pulse');
const TELEMETRY_PORT_FILE = path.join(TELEMETRY_DIR, 'port.txt');

const CHANNEL = 'custom-theme:set-mode:v1';

const attached = new WeakSet();
const activeContents = new Set();
let ipcReady = false;

let knownTelemetryPort = null;
let portWatch = null;
let watchDebounce = null;
let retryTimer = null;
let retryStep = 0;
const RETRY_DELAYS = [500, 1000, 1500, 2000, 3000, 5000, 5000, 5000];

function ensureIpc() {
    if (ipcReady) return;
    ipcReady = true;
    try {
        ipcMain.handle(CHANNEL, () => 'paper');
    } catch (_) {
        // Channel already registered - harmless.
    }
}

function readAsset(name) {
    for (const dir of assetDirs) {
        try {
            const file = path.join(dir, name);
            if (fs.existsSync(file)) {
                return fs.readFileSync(file, 'utf8');
            }
        } catch (error) {
            console.error('[agy-theme] read asset:', error.message);
        }
    }
    return null;
}

function parsePortFile() {
    try {
        if (!fs.existsSync(TELEMETRY_PORT_FILE)) return null;
        const raw = fs.readFileSync(TELEMETRY_PORT_FILE, 'utf8').trim();
        if (!/^\d{1,5}$/.test(raw)) return null;
        const port = Number(raw);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
        return port;
    } catch (_) {
        return null;
    }
}

function checkHealth(port) {
    return new Promise((resolve) => {
        if (!port) { resolve(false); return; }
        let settled = false;
        const done = (ok) => {
            if (settled) return;
            settled = true;
            resolve(ok);
        };
        const req = http.get(
            { hostname: '127.0.0.1', port, path: '/healthz', timeout: 700 },
            (res) => {
                res.resume();
                done(res.statusCode === 200);
            }
        );
        req.on('timeout', () => { req.destroy(); done(false); });
        req.on('error', () => done(false));
    });
}

function pushPortToAll(port) {
    if (!port) return;
    for (const wc of Array.from(activeContents)) {
        if (!wc || (wc.isDestroyed && wc.isDestroyed())) {
            activeContents.delete(wc);
            continue;
        }
        wc.executeJavaScript(
            `window.__agySetTelemetryPort && window.__agySetTelemetryPort(${port});`,
            true
        ).catch(() => {});
    }
}

function stopRetry() {
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
    retryStep = 0;
}

function scheduleProbe() {
    if (retryTimer || activeContents.size === 0) return;
    if (retryStep >= RETRY_DELAYS.length) return;
    const delay = RETRY_DELAYS[retryStep++];
    retryTimer = setTimeout(async () => {
        retryTimer = null;
        if (activeContents.size === 0) return;
        const candidate = parsePortFile();
        if (candidate && await checkHealth(candidate)) {
            knownTelemetryPort = candidate;
            pushPortToAll(candidate);
            stopRetry();
            return;
        }
        scheduleProbe();
    }, delay);
}

async function refreshTelemetryPort() {
    const candidate = parsePortFile();
    if (candidate && await checkHealth(candidate)) {
        const changed = knownTelemetryPort !== candidate;
        knownTelemetryPort = candidate;
        stopRetry();
        if (changed) pushPortToAll(candidate);
        return candidate;
    }
    knownTelemetryPort = null;
    scheduleProbe();
    return null;
}

function ensurePortWatcher() {
    if (portWatch) return;
    try {
        if (!fs.existsSync(TELEMETRY_DIR)) return;
        portWatch = fs.watch(TELEMETRY_DIR, { persistent: false }, (_event, filename) => {
            if (filename && String(filename) !== 'port.txt') return;
            if (watchDebounce) clearTimeout(watchDebounce);
            watchDebounce = setTimeout(() => {
                watchDebounce = null;
                void refreshTelemetryPort();
            }, 300);
        });
        portWatch.on('error', () => {
            try { portWatch.close(); } catch (_) {}
            portWatch = null;
        });
    } catch (_) {
        portWatch = null;
    }
}

exports.attach = function attach(wc) {
    if (!wc || typeof wc !== 'object' || attached.has(wc)) return;
    attached.add(wc);
    activeContents.add(wc);
    ensureIpc();
    ensurePortWatcher();

    wc.once('destroyed', () => {
        activeContents.delete(wc);
        if (activeContents.size === 0) {
            stopRetry();
            if (watchDebounce) { clearTimeout(watchDebounce); watchDebounce = null; }
            if (portWatch) { try { portWatch.close(); } catch (_) {} portWatch = null; }
        }
    });

    let css = null;
    let js = null;
    let phrases = null;
    let loadedAt = 0;

    function loadAssets() {
        if (css !== null && Date.now() - loadedAt < 3000) return true;
        css = readAsset('theme.css');
        js = readAsset('renderer.js');
        const rawDict = readAsset('localization_dict.json');
        try {
            phrases = rawDict ? JSON.parse(rawDict) : [];
        } catch (error) {
            console.error('[agy-theme] bad localization_dict.json:', error.message);
            phrases = [];
        }
        loadedAt = Date.now();
        return css !== null && js !== null;
    }

    let generation = 0;

    async function mount() {
        const gen = generation;
        if (wc.isDestroyed && wc.isDestroyed()) return;
        if (!loadAssets()) {
            console.error('[agy-theme] assets missing in', assetDirs.join(' | '));
            return;
        }
        try {
            const port = await refreshTelemetryPort();
            if (gen !== generation) return;
            if (wc.isDestroyed && wc.isDestroyed()) return;
            await wc.insertCSS(css, { cssOrigin: 'user' });
            if (gen !== generation) return;
            if (wc.isDestroyed && wc.isDestroyed()) return;
            await wc.executeJavaScript(
                `(() => {
                    const AGY_PHRASES = ${JSON.stringify(phrases)};
                    const AGY_TELEMETRY_PORT = ${JSON.stringify(port)};
                    ${js}
                })()`,
                true
            );
        } catch (error) {
            console.error('[agy-theme] mount failed:', error && error.message);
        }
    }

    function normalizeLocalPathFromMenu(raw) {
        if (!raw || typeof raw !== 'string') return '';
        let s = raw.trim().replace(/^["'`]+|["'`]+$/g, '');
        if (/^file:\/\//i.test(s)) {
            try {
                const u = new URL(s);
                s = decodeURIComponent(u.pathname || '');
                if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(s)) s = s.slice(1);
            } catch (_) {
                s = s.replace(/^file:\/\/\/?/i, '');
                try { s = decodeURIComponent(s); } catch (_) {}
            }
        }
        s = s.replace(/#L?\d+(?:-L?\d+)?$/i, '').replace(/#.*$/, '').replace(/:(\d+)(?::\d+)?$/, '');
        if (process.platform === 'win32') s = s.replace(/\//g, '\\');
        return s;
    }

    // Native Electron context-menu fallback for file:/// links & selected local paths
    // (runs only when the renderer custom menu did not preventDefault)
    wc.on('context-menu', (event, params) => {
        try {
            const rawCandidate = (params.linkURL && /^file:\/\//i.test(params.linkURL))
                ? params.linkURL
                : ((params.selectionText && /^[A-Za-z]:[\\/][^\r\n]+$/.test(params.selectionText.trim()))
                    ? params.selectionText.trim()
                    : '');
            if (!rawCandidate) return;
            const filePath = normalizeLocalPathFromMenu(rawCandidate);
            if (!filePath || !fs.existsSync(filePath)) return;
            event.preventDefault();
            const isDir = (() => { try { return fs.statSync(filePath).isDirectory(); } catch (_) { return false; } })();
            const items = [
                {
                    label: isDir ? '打开文件夹' : '在文件夹中显示',
                    click: () => {
                        if (isDir) void shell.openPath(filePath);
                        else shell.showItemInFolder(filePath);
                    }
                },
                {
                    label: '用默认程序打开',
                    click: () => { void shell.openPath(filePath); }
                }
            ];
            if (process.platform === 'win32' && !isDir) {
                items.push({
                    label: '选择打开方式…',
                    click: () => {
                        execFile('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', filePath], { windowsHide: false }, () => {});
                    }
                });
            }
            items.push(
                { type: 'separator' },
                {
                    label: '复制完整路径',
                    click: () => { clipboard.writeText(filePath); }
                }
            );
            if (params.selectionText) {
                items.push({
                    label: '复制选中文本',
                    click: () => { clipboard.writeText(params.selectionText); }
                });
            }
            Menu.buildFromTemplate(items).popup();
        } catch (_) {}
    });

    wc.on('dom-ready', () => {
        generation += 1;
        void mount();
    });
};
