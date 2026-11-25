#!/usr/bin/env python3
"""Zero-resident pre-launch wrapper for Antigravity (Windows).

Runs via pythonw.exe (no console window), ensures app.asar has the theme/i18n
hook if Antigravity UI is not currently running (auto-archiving a new version's
official baseline on upgrade), then launches Antigravity.exe and exits immediately.
"""

import os
import subprocess
import sys
import time
import traceback

BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(
    os.path.expanduser("~"), ".gemini", "antigravity", "custom_theme", "baselines", "launcher.log"
)


def append_log(msg):
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        lines = []
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as fh:
                lines = fh.read().splitlines()[-29:]
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        lines.append(f"[{ts}] {msg}")
        with open(LOG_FILE, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    except Exception:
        pass


def main():
    if BUNDLE_DIR not in sys.path:
        sys.path.insert(0, BUNDLE_DIR)
    import patch_asar_stable as patcher

    install_dir = patcher.detect_install_dir()
    antigravity_exe = os.path.join(install_dir, "Antigravity.exe")

    try:
        if patcher.antigravity_running():
            append_log("skip ensure: main Antigravity.exe already running")
        else:
            rc = patcher.ensure_or_apply(force_apply=False)
            append_log(f"ensure finished rc={rc}")
    except SystemExit as exc:
        append_log(f"ensure skipped: {exc}")
    except Exception:
        append_log("ensure error:\n" + traceback.format_exc().strip())

    if not os.path.exists(antigravity_exe):
        append_log(f"Antigravity.exe not found: {antigravity_exe}")
        return 1

    flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    subprocess.Popen(
        [antigravity_exe, *sys.argv[1:]],
        cwd=os.path.dirname(antigravity_exe),
        close_fds=True,
        creationflags=flags,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
