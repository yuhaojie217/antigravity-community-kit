#!/usr/bin/env python3
"""Precisely patch Antigravity's app.asar without touching unrelated bytes.

Features:
  * Auto-detects Windows Antigravity install directory (or accepts --install-dir / ANTIGRAVITY_INSTALL_DIR).
  * Auto-detects official upgrades and archives each version's pristine baseline
    under ~/.gemini/antigravity/custom_theme/baselines.
  * Fast --ensure mode (<15ms when already patched and unchanged) for zero-resident
    pre-launch wrappers.
  * Strict SHA-256 and V8 Pickle verification before atomic same-volume replacement,
    preserving all unpacked entries in app.asar.unpacked.
  * Safe same-version --restore (never rolls back to an older version's baseline).

Usage:
  python patch_asar_stable.py --check
  python patch_asar_stable.py --ensure
  python patch_asar_stable.py --apply
  python patch_asar_stable.py --restore
"""

import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import time

BUNDLE = os.path.dirname(os.path.abspath(__file__))
MAIN_JS_SRC = os.path.join(BUNDLE, "custom-theme-main.js")

CUSTOM_HOME = os.path.join(os.path.expanduser("~"), ".gemini", "antigravity", "custom_theme")
BASELINES_DIR = os.path.join(CUSTOM_HOME, "baselines")
STATE_FILE = os.path.join(BASELINES_DIR, "state.json")
LOCK_FILE = os.path.join(BASELINES_DIR, "patch.lock")

THEME_FILE = "dist/custom-theme-main.js"
UTILS_FILE = "dist/utils.js"
PRELOAD_FILE = "dist/preload.js"

MARK_ATTACH = "agy-theme-attach-v2"
PATCHER_VERSION = 3

UTILS_ANCHOR = "    registerWindowWebContents(win, hubContents);\n"
UTILS_SNIPPET = f"""    // [{MARK_ATTACH}] mount theme+localization; must run before loadURL()
    try {{
        require('./custom-theme-main').attach(hubContents);
    }} catch (error) {{
        console.error('[agy-theme] attach error:', error && error.message);
    }}
"""

STALE_ATTACH = (
    "    try { require('./custom-theme-main').attach(hubContents); } "
    "catch (e) { console.error('[custom-theme] attach error:', e); }\n"
)
RETIRED_PRELOAD_MARK = "contextBridge.exposeInMainWorld('customTheme'"


def detect_install_dir(explicit=None):
    if explicit:
        return os.path.abspath(explicit)
    env_dir = os.environ.get("ANTIGRAVITY_INSTALL_DIR", "").strip()
    if env_dir and os.path.isdir(env_dir):
        return os.path.abspath(env_dir)
    candidates = []
    local_app = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local")
    candidates.append(os.path.join(local_app, "Programs", "antigravity"))
    candidates.append(os.path.join(local_app, "Programs", "Antigravity"))
    prog_files = os.environ.get("ProgramFiles")
    if prog_files:
        candidates.append(os.path.join(prog_files, "Antigravity"))
    for c in candidates:
        if os.path.exists(os.path.join(c, "resources", "app.asar")):
            return c
    return candidates[0]


INSTALL_DIR = detect_install_dir()
RES = os.path.join(INSTALL_DIR, "resources")
ASAR = os.path.join(RES, "app.asar")
VERSION_FILE = os.path.join(INSTALL_DIR, "version")


def configure_install_dir(explicit=None):
    global INSTALL_DIR, RES, ASAR, VERSION_FILE
    INSTALL_DIR = detect_install_dir(explicit)
    RES = os.path.join(INSTALL_DIR, "resources")
    ASAR = os.path.join(RES, "app.asar")
    VERSION_FILE = os.path.join(INSTALL_DIR, "version")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            chunk = fh.read(1048576)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def read_asar_app_version(path):
    try:
        raw, header, base = read_asar(path)
        files = dict(iter_entries(header))
        entry = files.get("package.json")
        if not entry or entry.get("unpacked"):
            return None
        off = int(entry["offset"])
        pkg = json.loads(raw[base + off : base + off + entry["size"]].decode("utf-8", "replace"))
        v = str(pkg.get("version") or "").strip()
        return v or None
    except Exception:
        return None


def read_version(asar_path=None):
    shell_ver = "unknown"
    if os.path.exists(VERSION_FILE):
        with open(VERSION_FILE, "r", encoding="utf-8", errors="replace") as fh:
            v = fh.read().strip()
            if v:
                shell_ver = v
    app_ver = read_asar_app_version(asar_path or ASAR)
    return f"{app_ver}+{shell_ver}" if app_ver else shell_ver


def load_state():
    if not os.path.exists(STATE_FILE):
        return {}
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def save_state(state):
    os.makedirs(BASELINES_DIR, exist_ok=True)
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=2, ensure_ascii=False)
    os.replace(tmp, STATE_FILE)


def antigravity_running():
    """Return True only if an actual Antigravity UI/main/renderer process is running
    (ignoring standalone sidecar workers launched via --import=)."""
    if sys.platform != "win32":
        return False
    try:
        ps_cmd = (
            "Get-CimInstance Win32_Process -Filter \"Name='Antigravity.exe'\" | "
            "Where-Object { $_.CommandLine -notlike '*--import=*' } | "
            "Select-Object -First 1 -ExpandProperty ProcessId"
        )
        out = subprocess.check_output(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        ).decode("utf-8", "replace").strip()
        return bool(out)
    except Exception:
        try:
            out = subprocess.check_output(
                ["tasklist", "/FI", "IMAGENAME eq Antigravity.exe", "/NH"],
                stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            ).decode("mbcs", "replace")
            return "Antigravity.exe" in out
        except Exception:
            return False


def acquire_lock(timeout_s=5.0):
    os.makedirs(BASELINES_DIR, exist_ok=True)
    deadline = time.time() + timeout_s
    while True:
        try:
            fd = os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode("ascii"))
            os.close(fd)
            return
        except FileExistsError:
            try:
                age = time.time() - os.path.getmtime(LOCK_FILE)
                if age > 30:
                    os.remove(LOCK_FILE)
                    continue
            except OSError:
                pass
            if time.time() >= deadline:
                raise SystemExit("another patch_asar_stable process holds the lock")
            time.sleep(0.1)


def release_lock():
    try:
        os.remove(LOCK_FILE)
    except OSError:
        pass


# ---------------------------------------------------------------- asar format


def read_asar(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    header_size = struct.unpack("<I", raw[4:8])[0]
    json_size = struct.unpack("<I", raw[12:16])[0]
    header = json.loads(raw[16 : 16 + json_size].decode("utf-8"))
    base = 8 + header_size
    return raw, header, base


def iter_entries(header):
    out = []

    def walk(node, prefix):
        for name, value in node.get("files", {}).items():
            full = f"{prefix}/{name}" if prefix else name
            if "files" in value:
                walk(value, full)
            else:
                out.append((full, value))

    walk(header, "")
    return out


def integrity_of(blob):
    digest = hashlib.sha256(blob).hexdigest()
    return {
        "algorithm": "SHA256",
        "hash": digest,
        "blockSize": 4194304,
        "blocks": [digest],
    }


def serialize_pickle_header(json_bytes):
    json_len = len(json_bytes)
    inner = ((4 + json_len) + 3) & ~3
    outer = ((4 + inner) + 3) & ~3
    buf = bytearray()
    buf += struct.pack("<I", 4)
    buf += struct.pack("<I", outer)
    buf += struct.pack("<I", inner)
    buf += struct.pack("<I", json_len)
    buf += json_bytes
    buf += b"\x00" * (8 + outer - len(buf))
    return bytes(buf)


def verify(path):
    raw, header, base = read_asar(path)
    entries = iter_entries(header)
    problems = []

    h0 = struct.unpack("<I", raw[0:4])[0]
    h1 = struct.unpack("<I", raw[4:8])[0]
    h2 = struct.unpack("<I", raw[8:12])[0]
    h3 = struct.unpack("<I", raw[12:16])[0]
    exp_inner = ((4 + h3) + 3) & ~3
    exp_outer = ((4 + exp_inner) + 3) & ~3
    if h0 != 4:
        problems.append(f"header[0] should be 4, got {h0}")
    if h2 != exp_inner:
        problems.append(f"header[2] {h2} != expected inner {exp_inner}")
    if h1 != exp_outer:
        problems.append(f"header[1] {h1} != expected outer {exp_outer}")
    if base != 8 + h1:
        problems.append(f"base {base} != 8 + header size {8 + h1}")
    if base % 4 != 0:
        problems.append(f"base {base} is not 4-byte aligned")
    if raw[16 + h3 : base].strip(b"\x00"):
        problems.append("non-zero padding after JSON header")

    cursor = 0
    for rel, entry in entries:
        if entry.get("unpacked"):
            continue
        off = int(entry["offset"])
        size = int(entry["size"])
        blob = raw[base + off : base + off + size]
        if len(blob) != size:
            problems.append(f"{rel}: short read")
            continue
        declared = (entry.get("integrity") or {}).get("hash")
        if declared and hashlib.sha256(blob).hexdigest() != declared:
            problems.append(f"{rel}: integrity mismatch")
        cursor = max(cursor, off + size)
    if base + cursor != len(raw):
        problems.append(f"trailing mismatch: {base + cursor} vs {len(raw)}")

    for rel, entry in entries:
        if entry.get("unpacked"):
            disk = os.path.join(RES, "app.asar.unpacked", rel.replace("/", os.sep))
            if not os.path.exists(disk):
                problems.append(f"{rel}: unpacked file missing on disk")
    return problems


def inspect_asar(path):
    raw, header, base = read_asar(path)
    files = dict(iter_entries(header))

    def text_of(rel):
        entry = files.get(rel)
        if not entry or entry.get("unpacked"):
            return ""
        off = int(entry["offset"])
        return raw[base + off : base + off + entry["size"]].decode("utf-8", "replace")

    utils = text_of(UTILS_FILE)
    preload = text_of(PRELOAD_FILE)
    return {
        "size": len(raw),
        "entries": len(files),
        "unpacked": sum(1 for _, e in files.items() if e.get("unpacked")),
        "has_v2": MARK_ATTACH in utils,
        "has_stale_v1": ".attach(hubContents); } catch (e) { console.error('[custom-theme]" in utils,
        "has_legacy_bridge": RETIRED_PRELOAD_MARK in preload,
        "anchor_count": utils.count(UTILS_ANCHOR),
        "has_theme_main": THEME_FILE in files,
    }


def build_patches(baseline_path):
    with open(MAIN_JS_SRC, "r", encoding="utf-8") as fh:
        theme_main = fh.read()

    patches = {THEME_FILE: theme_main}
    raw, header, base = read_asar(baseline_path)
    files = dict(iter_entries(header))

    entry = files.get(UTILS_FILE)
    if not entry or entry.get("unpacked"):
        raise SystemExit(f"missing or unpacked {UTILS_FILE} in baseline")
    off = int(entry["offset"])
    utils = raw[base + off : base + off + entry["size"]].decode("utf-8")
    utils = utils.replace(STALE_ATTACH, "")
    utils = utils.replace(
        "    try { require('./custom-theme-main').attach(hubContents); }"
        " catch (e) { console.error('[custom-theme] attach error:', e); }",
        "",
    )
    if MARK_ATTACH not in utils:
        cnt = utils.count(UTILS_ANCHOR)
        if cnt != 1:
            raise SystemExit(f"utils.js anchor count={cnt} (expected 1); refusing to patch")
        utils = utils.replace(UTILS_ANCHOR, UTILS_ANCHOR + UTILS_SNIPPET, 1)
    patches[UTILS_FILE] = utils
    return patches


def apply_patches(baseline_path, patches, out_path):
    raw, header, base = read_asar(baseline_path)
    entries = iter_entries(header)
    blobs = {}
    for rel, entry in entries:
        if entry.get("unpacked"):
            continue
        off = int(entry["offset"])
        blobs[rel] = raw[base + off : base + off + entry["size"]]

    order = [rel for rel, entry in entries if not entry.get("unpacked")]

    for rel, text in patches.items():
        blob = text.encode("utf-8")
        if rel in blobs:
            blobs[rel] = blob
            continue
        order.append(rel)
        blobs[rel] = blob
        parts = rel.split("/")
        node = header
        for part in parts[:-1]:
            node = node["files"].setdefault(part, {"files": {}})
        node["files"][parts[-1]] = {"size": len(blob)}

    cursor = 0
    by_rel = dict(entries)
    for rel in order:
        blob = blobs[rel]
        entry = by_rel.get(rel)
        if entry is None:
            parts = rel.split("/")
            node = header
            for part in parts[:-1]:
                node = node["files"][part]
            entry = node["files"][parts[-1]]
        entry["size"] = len(blob)
        entry["offset"] = str(cursor)
        entry["integrity"] = integrity_of(blob)
        entry.pop("unpacked", None)
        cursor += len(blob)

    json_bytes = json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    pickle_header = serialize_pickle_header(json_bytes)

    with open(out_path, "wb") as fh:
        fh.write(pickle_header)
        for rel in order:
            fh.write(blobs[rel])


def fast_is_current(state, version):
    if not state or state.get("patcher_version") != PATCHER_VERSION:
        return False
    if state.get("version") != version:
        return False
    if not os.path.exists(ASAR) or not os.path.exists(MAIN_JS_SRC):
        return False
    st = os.stat(ASAR)
    mst = os.stat(MAIN_JS_SRC)
    return (
        st.st_size == state.get("patched_size")
        and st.st_mtime_ns == state.get("patched_mtime_ns")
        and mst.st_mtime_ns == state.get("main_js_mtime_ns")
    )


def baseline_path_for(version, official_sha):
    safe_ver = "".join(c if c.isalnum() or c in ".-_" else "_" for c in version)
    return os.path.join(BASELINES_DIR, f"app_{safe_ver}_{official_sha[:12]}.asar.orig")


def prune_old_baselines(keep_path):
    if not os.path.exists(BASELINES_DIR):
        return
    files = []
    for name in os.listdir(BASELINES_DIR):
        if name.endswith(".asar.orig"):
            full = os.path.join(BASELINES_DIR, name)
            if os.path.abspath(full) != os.path.abspath(keep_path):
                files.append((os.path.getmtime(full), full))
    files.sort(reverse=True)
    for _, old in files[2:]:
        try:
            os.remove(old)
        except OSError:
            pass


def report_state():
    if not os.path.exists(ASAR):
        raise SystemExit(f"app.asar not found: {ASAR} (pass --install-dir <path>)")
    version = read_version()
    info = inspect_asar(ASAR)
    state = load_state()
    print(f"version          : {version}")
    print(f"app.asar         : {ASAR}")
    print(f"size             : {info['size']}")
    print(f"entries          : {info['entries']}  (unpacked flags: {info['unpacked']})")
    print(f"attach hook v2   : {info['has_v2']}")
    print(f"theme main blob  : {info['has_theme_main']}")
    print(f"anchor count     : {info['anchor_count']}")
    print(f"stale v1 hook    : {info['has_stale_v1']}")
    print(f"legacy bridge    : {info['has_legacy_bridge']}")
    print(f"baseline stored  : {bool(state.get('baseline_path') and os.path.exists(state.get('baseline_path')))}")
    print(f"assets           : {os.path.join(CUSTOM_HOME, 'app')}")


def ensure_or_apply(force_apply=False):
    if not os.path.exists(ASAR):
        raise SystemExit(f"app.asar missing: {ASAR} (pass --install-dir <path>)")
    if not os.path.exists(MAIN_JS_SRC):
        raise SystemExit(f"custom-theme-main.js missing: {MAIN_JS_SRC}")

    version = read_version()
    state = load_state()

    if not force_apply and fast_is_current(state, version):
        print(f"[ensure] already patched and current (version={version})")
        return 0

    acquire_lock()
    try:
        state = load_state()
        cur_sha = sha256_file(ASAR)
        main_sha = sha256_file(MAIN_JS_SRC)
        info = inspect_asar(ASAR)

        baseline_path = None
        official_sha = None

        if not info["has_v2"]:
            probs = verify(ASAR)
            if probs:
                raise SystemExit(f"current unpatched app.asar failed integrity check: {probs[0]}")
            if info["anchor_count"] != 1:
                raise SystemExit(
                    f"dist/utils.js anchor count={info['anchor_count']} in version {version}; refusing to patch"
                )
            official_sha = cur_sha
            baseline_path = baseline_path_for(version, official_sha)
            os.makedirs(BASELINES_DIR, exist_ok=True)
            if not os.path.exists(baseline_path) or sha256_file(baseline_path) != official_sha:
                tmp_base = baseline_path + ".tmp"
                shutil.copyfile(ASAR, tmp_base)
                os.replace(tmp_base, baseline_path)
            prune_old_baselines(baseline_path)
        else:
            if (
                not force_apply
                and state.get("version") == version
                and state.get("patched_sha256") == cur_sha
                and state.get("main_js_sha256") == main_sha
                and state.get("patcher_version") == PATCHER_VERSION
            ):
                st = os.stat(ASAR)
                mst = os.stat(MAIN_JS_SRC)
                state["patched_size"] = st.st_size
                state["patched_mtime_ns"] = st.st_mtime_ns
                state["main_js_mtime_ns"] = mst.st_mtime_ns
                save_state(state)
                print(f"[ensure] already patched (hash verified, version={version})")
                return 0

            cand_base = state.get("baseline_path")
            cand_sha = state.get("official_sha256")
            if (
                state.get("version") == version
                and cand_base
                and cand_sha
                and os.path.exists(cand_base)
                and sha256_file(cand_base) == cand_sha
            ):
                baseline_path = cand_base
                official_sha = cand_sha
            else:
                raise SystemExit(
                    "app.asar already has patch marker but matching same-version official baseline is missing; refusing to overwrite"
                )

        tmp_out = os.path.join(RES, f".app.asar.theme-tmp.{os.getpid()}")
        try:
            patches = build_patches(baseline_path)
            apply_patches(baseline_path, patches, tmp_out)
            probs = verify(tmp_out)
            if probs:
                raise SystemExit(f"candidate verification failed: {probs[0]}")

            if antigravity_running():
                raise SystemExit(
                    "Antigravity.exe is running; close Antigravity first before replacing app.asar"
                )

            if read_version() != version or sha256_file(ASAR) != cur_sha:
                raise SystemExit("app.asar changed concurrently during patching; aborting safely")

            last_err = None
            for _ in range(15):
                try:
                    os.replace(tmp_out, ASAR)
                    last_err = None
                    break
                except PermissionError as exc:
                    last_err = exc
                    time.sleep(0.2)
            if last_err is not None:
                raise last_err
        finally:
            if os.path.exists(tmp_out):
                try:
                    os.remove(tmp_out)
                except OSError:
                    pass

        patched_sha = sha256_file(ASAR)
        st = os.stat(ASAR)
        mst = os.stat(MAIN_JS_SRC)
        save_state(
            {
                "patcher_version": PATCHER_VERSION,
                "version": version,
                "official_sha256": official_sha,
                "patched_sha256": patched_sha,
                "main_js_sha256": main_sha,
                "baseline_path": baseline_path,
                "patched_size": st.st_size,
                "patched_mtime_ns": st.st_mtime_ns,
                "main_js_mtime_ns": mst.st_mtime_ns,
                "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
        )
        print(f"patched and deployed app.asar (version={version})")
        report_state()
        return 0
    finally:
        release_lock()


def restore_official():
    version = read_version()
    state = load_state()
    base = state.get("baseline_path")
    base_sha = state.get("official_sha256")
    if state.get("version") != version or not base or not os.path.exists(base):
        raise SystemExit(f"no same-version official baseline found for {version}; refusing to restore")
    if base_sha and sha256_file(base) != base_sha:
        raise SystemExit("stored baseline hash mismatch; refusing to restore")
    if antigravity_running():
        raise SystemExit("Antigravity.exe is running; close Antigravity first before restoring app.asar")

    tmp_out = os.path.join(RES, f".app.asar.restore-tmp.{os.getpid()}")
    try:
        shutil.copyfile(base, tmp_out)
        os.replace(tmp_out, ASAR)
    finally:
        if os.path.exists(tmp_out):
            try:
                os.remove(tmp_out)
            except OSError:
                pass
    print(f"restored official app.asar for version {version} from {base}")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Lossless Antigravity app.asar theme/i18n injector")
    ap.add_argument("--install-dir", help="Antigravity install directory (default: auto-detect)")
    ap.add_argument("--apply", action="store_true", help="Force re-patch same version")
    ap.add_argument("--ensure", action="store_true", help="Patch only if missing or updated")
    ap.add_argument("--restore", action="store_true", help="Restore official app.asar baseline")
    ap.add_argument("--check", action="store_true", help="Inspect current patch state")
    args = ap.parse_args()

    configure_install_dir(args.install_dir)

    if args.check or not (args.apply or args.ensure or args.restore):
        report_state()
        return 0
    if args.restore:
        return restore_official()
    return ensure_or_apply(force_apply=args.apply)


if __name__ == "__main__":
    sys.exit(main())
