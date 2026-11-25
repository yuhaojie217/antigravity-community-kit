#!/usr/bin/env python3
"""Clean uninstaller & official app.asar restorer for Antigravity Community Kit."""

import argparse
import json
import pathlib
import shutil
import subprocess
import sys

HOME = pathlib.Path.home()
CUSTOM_THEME_DIR = HOME / ".gemini" / "antigravity" / "custom_theme"
INJECTOR_DIR = CUSTOM_THEME_DIR / "injector"
PLUGINS_DIR = HOME / ".gemini" / "config" / "plugins"
CONFIG_JSON = HOME / ".gemini" / "config" / "config.json"


def main():
    ap = argparse.ArgumentParser(description="Uninstall Antigravity Community Kit and restore official app.asar")
    ap.add_argument("--install-dir", help="Antigravity install directory (default: auto-detect)")
    ap.add_argument("--keep-assets", action="store_true", help="Only restore app.asar; keep plugins and theme files")
    args = ap.parse_args()

    patcher = INJECTOR_DIR / "patch_asar_stable.py"
    if not patcher.exists():
        patcher = pathlib.Path(__file__).resolve().parent / "injector" / "patch_asar_stable.py"

    cmd = [sys.executable, str(patcher), "--restore"]
    if args.install_dir:
        cmd.extend(["--install-dir", args.install_dir])
    print("[step] restoring official app.asar baseline...")
    res = subprocess.run(cmd)
    if res.returncode != 0:
        print("[abort] Please close Antigravity completely and re-run uninstall.py.")
        return res.returncode

    if args.keep_assets:
        print("[ok] official app.asar restored (assets/plugins kept).")
        return 0

    for pname in ("gemini-pulse", "theme-canvas"):
        pdir = PLUGINS_DIR / pname
        if pdir.exists():
            shutil.rmtree(pdir)
            print(f"[ok] removed plugin {pdir}")

    if CONFIG_JSON.exists():
        try:
            cfg = json.loads(CONFIG_JSON.read_text(encoding="utf-8"))
            plugins = cfg.get("plugins") or {}
            for pname in ("gemini-pulse", "theme-canvas"):
                plugins.pop(pname, None)
            sidecars = cfg.get("sidecars") or {}
            sidecars.pop("gemini-pulse/pulse", None)
            CONFIG_JSON.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"[ok] cleaned plugin entries from {CONFIG_JSON}")
        except Exception as exc:
            print(f"[warn] could not update {CONFIG_JSON}: {exc}")

    app_dir = CUSTOM_THEME_DIR / "app"
    if app_dir.exists():
        shutil.rmtree(app_dir)
        print(f"[ok] removed {app_dir}")

    print("\nUninstall complete. Antigravity is back to pristine official state.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
