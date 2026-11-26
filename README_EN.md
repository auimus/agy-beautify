<div align="center">
  <img src="assets/logo.svg" width="76" height="76" alt="AGY Beautify Logo" />
  <h1>AGY Beautify</h1>
  <p><strong>All-in-One Liquid Glass Theme, Auto-Compact Context & Token/USD Monitor Plugin for Google Antigravity 2.0</strong></p>
  <p>
    <a href="README.md">简体中文</a> ·
    <a href="README_EN.md">English</a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/Antigravity-2.0%2B-6366f1?style=flat-square" alt="Antigravity 2.0+" />
    <img src="https://img.shields.io/badge/Version-1.4.0-10b981?style=flat-square" alt="Version 1.4.0" />
    <img src="https://img.shields.io/badge/Dependencies-Zero-38bdf8?style=flat-square" alt="Zero Dependencies" />
    <img src="https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square" alt="MIT License" />
  </p>
</div>

---

**AGY Beautify** is a zero-dependency, non-invasive native plugin for **Google Antigravity 2.0**. It never modifies `app.asar` or your Antigravity installation — disable or remove the folder anytime for a 100% clean revert.

## Key Features

- **Liquid Glass Engine & Native Titlebar Sync**: Instant `Auto / Light / Dark` switch with automatic Windows `titleBarOverlay` & opposite-tone wallpaper pairing, `Liquid Glass / Frosted / Solid` surface materials, curated light & dark wallpapers, custom image upload (picker, drag-drop, `Ctrl+V`, or local path), and a Reading Glass backdrop.
- **Real-Time Quick Studio, Quota Reset Countdown & Auto-Compact (`/compact`)**: Bottom-bar `✦ xx% · ↻ XhXXm` pill shows live context usage and next quota reset countdown. Click to toggle themes, materials, presets, wallpapers in `<20ms`, inspect 5-hour & weekly quotas with exact reset times, trigger `/compact`, or drag the **auto-compact threshold bar (`40%–95%`, default `80%`)**.
- **Gemini Starlight Model & Effort Slider**: Replaces the tall native dropdown with a sleek Liquid Glass stardust effort slider directly above the composer (`Shift+Click` opens the native menu anytime).
- **Full-Pane Token & USD Monitor (`监控台`)**: Native sidebar entry opening a 3-tab analytics dashboard:
  - **Overview**: 6 KPI cards (Tokens, USD + RMB, Cache Savings, Tool Calls, Active Time, Sessions), 14-day trend bar chart, SVG Token/Timing donut chart, 20-week interactive activity heatmap, per-model cost breakdown, and live **5h / Weekly Quota & Reset Time** cards.
  - **Tools & Timings**: Side-by-side Token & Latency donuts, Top 10 Tool Calls (with duration), Top 10 Shell Commands, and Skills / Workspace breakdown.
  - **All Sessions**: Live search, workspace filters, 4 sort modes, circular SVG context gauges, and click-to-jump navigation.
- **Auto Chinese UI (`zh-CN`) & Right-Click Reveal File**: Cleanly localizes UI chrome while skipping responses/code blocks, and adds right-click `Open in Folder`, `Open`, `Copy Path`, and `Open in Terminal` on any file reference.

## Installation

### Option 1: Git Clone

**Windows (PowerShell):**
```powershell
git clone https://github.com/hongyanmo/agy-beautify.git "$env:USERPROFILE\.gemini\config\plugins\agy-beautify"
```

**macOS / Linux:**
```bash
git clone https://github.com/hongyanmo/agy-beautify.git ~/.gemini/config/plugins/agy-beautify
```

### Option 2: Release ZIP

1. Download `agy-beautify-v1.4.0.zip` from **Releases**.
2. Extract it into `~/.gemini/config/plugins/` so `plugin.json` lives at `~/.gemini/config/plugins/agy-beautify/plugin.json`.
3. Enable **AGY Beautify** in Antigravity's **Customizations / Plugins** panel.

## Tests

```bash
node --test sidecars/beautify_hub/beautify.test.mjs
```

## Privacy

100% local and offline. All token, USD, tool, and session analytics are read strictly in read-only mode from your local Antigravity SQLite files — nothing is ever sent to any external server.

## License

[MIT License](LICENSE)
