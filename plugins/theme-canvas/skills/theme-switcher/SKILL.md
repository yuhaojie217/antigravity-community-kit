---
name: theme-switcher
description: Antigravity 界面三主题隔离皮肤（Google 晨曦、Claude 暖纸、Default 极简）与增量汉化维护技能，支持检查、防升级修复与无损恢复官方原版，0 后台常驻。
---

# Theme Switcher（主题与汉化维护）

当用户需要切换、修复主题，或 Antigravity 客户端升级覆盖了 `app.asar` 时，调用部署在 `~/.gemini/antigravity/custom_theme/injector/patch_asar_stable.py` 的无损注入脚本，执行完即退，不留驻留守护进程。

## 常用指令

- 检查当前客户端注入与官方基线状态：
  ```powershell
  python "$env:USERPROFILE\.gemini\antigravity\custom_theme\injector\patch_asar_stable.py" --check
  ```
- 修复 / 升级后重注（需先退出 `Antigravity.exe`，支持自动归档新版本官方基线）：
  ```powershell
  python "$env:USERPROFILE\.gemini\antigravity\custom_theme\injector\patch_asar_stable.py" --ensure
  ```
- 强制同版本重新打补丁：
  ```powershell
  python "$env:USERPROFILE\.gemini\antigravity\custom_theme\injector\patch_asar_stable.py" --apply
  ```
- 无损恢复当前版本官方原版 `app.asar`：
  ```powershell
  python "$env:USERPROFILE\.gemini\antigravity\custom_theme\injector\patch_asar_stable.py" --restore
  ```
- 界面内即时切换主题：直接点击顶部菜单栏右侧的主题胶囊按钮（`Google / Claude / Default`），或在 DevTools 控制台调用 `window.__AGY_THEME__.set('google' | 'claude' | 'off')`。
