#!/usr/bin/env python3
"""One-click installer for Antigravity Community UI & Plugin Kit (Windows).

What it does:
  1. Deploys prebuilt theme assets (theme.css, renderer.js, localization_dict.json)
     to ~/.gemini/antigravity/custom_theme/app/
  2. Deploys the lossless injector scripts to ~/.gemini/antigravity/custom_theme/injector/
  3. Installs gemini-pulse and theme-canvas plugins into ~/.gemini/config/plugins/
     and enables them in ~/.gemini/config/config.json (with automatic backup).
  4. Runs patch_asar_stable.py --ensure (unless --skip-asar is passed) to hook
     dist/utils.js while preserving official baselines and all unpacked entries.
"""

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys

KIT_ROOT = pathlib.Path(__file__).resolve().parent
HOME = pathlib.Path.home()
CUSTOM_THEME_DIR = HOME / ".gemini" / "antigravity" / "custom_theme"
APP_DIR = CUSTOM_THEME_DIR / "app"
INJECTOR_DIR = CUSTOM_THEME_DIR / "injector"
PLUGINS_DIR = HOME / ".gemini" / "config" / "plugins"
CONFIG_JSON = HOME / ".gemini" / "config" / "config.json"


def copy_tree_clean(src: pathlib.Path, dst: pathlib.Path, dry_run: bool):
    if dry_run:
        print(f"[dry-run] copy dir  {src} -> {dst}")
        return
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    print(f"[ok] deployed {dst}")


def enable_plugins_in_config(plugin_names, dry_run: bool):
    if dry_run:
        print(f"[dry-run] enable plugins {plugin_names} in {CONFIG_JSON}")
        return
    CONFIG_JSON.parent.mkdir(parents=True, exist_ok=True)
    cfg = {}
    if CONFIG_JSON.exists():
        bak = CONFIG_JSON.with_name("config.json.before-community-kit.bak")
        if not bak.exists():
            shutil.copy2(CONFIG_JSON, bak)
        try:
            cfg = json.loads(CONFIG_JSON.read_text(encoding="utf-8"))
        except Exception:
            cfg = {}
    plugins = cfg.setdefault("plugins", {})
    for name in plugin_names:
        entry = plugins.get(name)
        if not isinstance(entry, dict):
            plugins[name] = {"enabled": True}
        else:
            entry["enabled"] = True
    CONFIG_JSON.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[ok] enabled {plugin_names} in {CONFIG_JSON}")


def main():
    ap = argparse.ArgumentParser(description="Install Antigravity Community UI & Plugin Kit")
    ap.add_argument("--install-dir", help="Antigravity install directory (default: auto-detect)")
    ap.add_argument("--skip-asar", action="store_true", help="Deploy assets & plugins only; skip patching app.asar")
    ap.add_argument("--dry-run", action="store_true", help="Print planned actions without modifying any files")
    args = ap.parse_args()

    # 1. Deploy theme/dist + localization_dict.json
    dist_dir = KIT_ROOT / "theme" / "dist"
    files_to_app = [
        (dist_dir / "theme.css", APP_DIR / "theme.css"),
        (dist_dir / "renderer.js", APP_DIR / "renderer.js"),
        (KIT_ROOT / "theme" / "localization_dict.json", APP_DIR / "localization_dict.json"),
    ]
    for src, dst in files_to_app:
        if not src.exists():
            raise SystemExit(f"Missing kit asset: {src}")
        if args.dry_run:
            print(f"[dry-run] copy file {src} -> {dst}")
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            print(f"[ok] deployed {dst}")

    # 2. Deploy injector scripts
    copy_tree_clean(KIT_ROOT / "injector", INJECTOR_DIR, args.dry_run)

    # 3. Deploy plugins
    installed_plugins = []
    for pname in ("gemini-pulse", "theme-canvas"):
        psrc = KIT_ROOT / "plugins" / pname
        if psrc.exists():
            copy_tree_clean(psrc, PLUGINS_DIR / pname, args.dry_run)
            installed_plugins.append(pname)
    if installed_plugins:
        enable_plugins_in_config(installed_plugins, args.dry_run)

    # 4. Patch app.asar
    patcher = INJECTOR_DIR / "patch_asar_stable.py"
    if args.skip_asar:
        print("[skip] app.asar patching skipped (--skip-asar). Run later:")
        print(f'       python "{patcher}" --ensure')
        return 0

    cmd = [sys.executable, str(patcher), "--ensure"]
    if args.install_dir:
        cmd.extend(["--install-dir", args.install_dir])
    if args.dry_run:
        print("[dry-run] run:", " ".join(cmd))
        return 0

    print("[step] patching app.asar (make sure Antigravity is closed first)...")
    res = subprocess.run(cmd)
    if res.returncode != 0:
        print("\n[hint] Close Antigravity completely, then re-run:")
        print(f'       python "{patcher}" --ensure')
        return res.returncode

    print("\nInstallation complete! Launch Antigravity to enjoy the new UI and plugins.")
    print(f'Tip: Point your Windows shortcut to pythonw.exe "{INJECTOR_DIR / "launch_antigravity.pyw"}" to survive official upgrades automatically.')
    return 0


if __name__ == "__main__":
    sys.exit(main())
