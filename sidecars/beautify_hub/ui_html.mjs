export function createSidebarHtml() {
  return `<!doctype html>
<html lang="zh-CN" data-ui-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>AGY Beautify</title>
  <script src="/preload.js"></script>
  <style>
    /* Use --agy-* prefixed tokens so Antigravity preload.js shadcn variables (like --muted: rgba(255,255,255,0.05)) NEVER collide with text colors */
    :root,
    html[data-ui-theme="dark"] {
      --agy-bg: #0b101d;
      --agy-card: #141c2f;
      --agy-card-alt: rgba(255, 255, 255, 0.06);
      --agy-border: rgba(148, 163, 184, 0.24);
      --agy-text: #f8fafc;
      --agy-text-sub: #cbd5e1;
      --agy-text-muted: #9fb0c7;
      --agy-accent: #6366f1;
      --agy-accent-text: #ffffff;
      --agy-input-bg: rgba(15, 23, 42, 0.65);
      --agy-ok: #4ade80;
      --agy-warn: #fbbf24;
      --agy-err: #f87171;
    }
    html[data-ui-theme="light"] {
      --agy-bg: #f3f6fc;
      --agy-card: #ffffff;
      --agy-card-alt: #eef2f9;
      --agy-border: rgba(15, 23, 42, 0.13);
      --agy-text: #0f172a;
      --agy-text-sub: #334155;
      --agy-text-muted: #475569;
      --agy-accent: #4f46e5;
      --agy-accent-text: #ffffff;
      --agy-input-bg: #ffffff;
      --agy-ok: #16a34a;
      --agy-warn: #d97706;
      --agy-err: #dc2626;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      min-height: 100%;
      background: var(--agy-bg) !important;
      color: var(--agy-text) !important;
    }
    .app {
      min-height: 100vh;
      padding: 13px;
      font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      background: var(--agy-bg);
      color: var(--agy-text);
      font-size: 12.5px;
      line-height: 1.45;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 11px;
    }
    .brand { display: flex; align-items: center; gap: 9px; }
    .brand-icon {
      width: 30px; height: 30px; border-radius: 9px;
      background: linear-gradient(135deg, #2563eb, #7c3aed, #06b6d4);
      display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 14px;
      box-shadow: 0 4px 14px rgba(79,70,229,0.36);
      flex-shrink: 0;
    }
    .brand-title { font-weight: 700; font-size: 14.5px; color: var(--agy-text); }
    .badge {
      font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px;
      border: 1px solid var(--agy-border); background: var(--agy-card);
      color: var(--agy-text-sub); white-space: nowrap;
    }
    .badge.ok { color: var(--agy-ok); border-color: rgba(74,222,128,0.45); }
    .badge.warn { color: var(--agy-warn); border-color: rgba(251,191,36,0.45); }
    .badge.err { color: var(--agy-err); border-color: rgba(248,113,113,0.45); }
    .tabs {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;
      margin-bottom: 12px; padding: 4px; border-radius: 12px;
      background: var(--agy-card); border: 1px solid var(--agy-border);
    }
    .tab {
      border: 0; background: transparent; color: var(--agy-text-sub);
      padding: 7px 4px; border-radius: 9px; cursor: pointer;
      font-size: 12px; font-weight: 600; transition: all .14s ease;
    }
    .tab:hover { color: var(--agy-text); background: var(--agy-card-alt); }
    .tab.active {
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(79,70,229,0.28);
    }
    .panel { display: none; }
    .panel.active { display: block; }
    .card {
      background: var(--agy-card); border: 1px solid var(--agy-border);
      border-radius: 14px; padding: 12px 13px; margin-bottom: 10px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    }
    .card h3 {
      margin: 0 0 9px; font-size: 12.5px; font-weight: 700;
      color: var(--agy-text); letter-spacing: 0.01em;
      display: flex; align-items: center; justify-content: space-between; gap: 6px;
    }
    .seg {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;
      padding: 3px; border-radius: 11px; background: var(--agy-card-alt); border: 1px solid var(--agy-border);
    }
    .seg button {
      border: 0; background: transparent; color: var(--agy-text-sub);
      padding: 7px 6px; border-radius: 8px; cursor: pointer;
      font-size: 12px; font-weight: 500; transition: all .14s ease;
    }
    .seg button:hover { color: var(--agy-text); background: rgba(99,102,241,0.12); }
    .seg button.active {
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: #ffffff; font-weight: 600;
      box-shadow: 0 2px 10px rgba(79,70,229,0.3);
    }
    .preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
    .preset-card {
      border: 1.5px solid var(--agy-border); background: var(--agy-card-alt); color: var(--agy-text);
      border-radius: 11px; padding: 9px 10px; text-align: left; cursor: pointer;
      transition: all .15s ease;
    }
    .preset-card:hover { border-color: rgba(99,102,241,0.6); transform: translateY(-1px); }
    .preset-card.active {
      border-color: var(--agy-accent);
      background: linear-gradient(135deg, rgba(37,99,235,0.2), rgba(124,58,237,0.22));
    }
    .preset-top { display: flex; align-items: center; gap: 5px; font-weight: 600; font-size: 12px; color: var(--agy-text); }
    .preset-desc { font-size: 11px; color: var(--agy-text-muted); margin-top: 3px; line-height: 1.38; }
    .filter-pills { display: flex; gap: 5px; margin-bottom: 9px; flex-wrap: wrap; }
    .f-pill {
      border: 1px solid var(--agy-border); background: var(--agy-card-alt); color: var(--agy-text-sub);
      border-radius: 999px; padding: 4px 10px; font-size: 11.5px; font-weight: 500; cursor: pointer;
    }
    .f-pill:hover { color: var(--agy-text); border-color: rgba(99,102,241,0.5); }
    .f-pill.active {
      border-color: var(--agy-accent); color: #ffffff; font-weight: 600;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
    }
    .dropzone {
      border: 1.5px dashed var(--agy-border); border-radius: 11px; padding: 11px;
      text-align: center; color: var(--agy-text-sub); font-size: 12px;
      margin-bottom: 9px; transition: all .15s ease; background: var(--agy-card-alt);
      cursor: pointer;
    }
    .dropzone b { color: var(--agy-text); }
    .dropzone:hover, .dropzone.dragover {
      border-color: var(--agy-accent); background: rgba(99,102,241,0.14); color: var(--agy-text);
    }
    .wp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .wp-card {
      position: relative; border-radius: 11px; overflow: hidden;
      border: 2px solid var(--agy-border); cursor: pointer; background: var(--agy-card-alt);
      transition: border-color .15s ease, transform .15s ease;
    }
    .wp-card:hover { transform: translateY(-1px); border-color: rgba(99,102,241,0.55); }
    .wp-card.active { border-color: #38bdf8; box-shadow: 0 0 0 1px #38bdf8; }
    .wp-thumb {
      height: 76px; width: 100%; background-size: cover; background-position: center;
      display: grid; place-items: center; color: var(--agy-text-sub); font-size: 11.5px; position: relative;
    }
    .wp-tone {
      position: absolute; top: 5px; left: 5px;
      padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 600;
      background: rgba(15,23,42,0.72); color: #f8fafc; backdrop-filter: blur(8px);
    }
    .wp-name {
      padding: 6px 8px; font-size: 11.5px; font-weight: 600; color: var(--agy-text);
      display: flex; align-items: center; justify-content: space-between; gap: 4px;
    }
    .wp-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .wp-del {
      border: 0; background: transparent; color: var(--agy-text-muted);
      cursor: pointer; padding: 0 3px; font-size: 12px;
    }
    .wp-del:hover { color: var(--agy-err); }
    details.advanced {
      border-top: 1px solid var(--agy-border); margin-top: 10px; padding-top: 9px;
    }
    details.advanced summary {
      cursor: pointer; font-size: 12px; font-weight: 600; color: var(--agy-text-sub);
      list-style: none; display: flex; align-items: center; justify-content: space-between;
    }
    details.advanced summary:hover { color: var(--agy-text); }
    details.advanced summary::after { content: '展开微调 ▾'; font-size: 11px; color: var(--agy-text-muted); }
    details.advanced[open] summary::after { content: '收起微调 ▴'; color: var(--agy-text-muted); }
    .gauge-row { display: flex; align-items: center; gap: 12px; }
    .gauge-meta { flex: 1; min-width: 0; }
    .big-num { font-size: 18px; font-weight: 700; color: var(--agy-text); }
    .sub-txt { font-size: 11.5px; color: var(--agy-text-muted); }
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
    .stat-box {
      padding: 8px 10px; border-radius: 10px;
      background: var(--agy-card-alt); border: 1px solid var(--agy-border);
    }
    .stat-label { font-size: 11px; color: var(--agy-text-muted); }
    .stat-val { font-size: 14px; font-weight: 700; margin-top: 2px; color: var(--agy-text); }
    .bar-row { margin-top: 6px; }
    .bar-head { display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px; color: var(--agy-text-sub); }
    .bar-track { height: 6px; border-radius: 999px; background: var(--agy-card-alt); overflow: hidden; border: 1px solid var(--agy-border); }
    .bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #2563eb, #7c3aed, #06b6d4); }
    .daily-chart { display: flex; align-items: flex-end; gap: 3px; height: 74px; padding: 6px 2px 0; }
    .d-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; }
    .d-bar { width: 100%; min-height: 3px; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, #38bdf8, #6366f1); }
    .d-lbl { font-size: 9.5px; color: var(--agy-text-muted); margin-top: 3px; }
    .slider-row { margin: 9px 0; }
    .slider-head { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; color: var(--agy-text-sub); }
    input[type="range"] { width: 100%; accent-color: var(--agy-accent); cursor: pointer; }
    .toggle-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 10px; padding: 8px 0;
    }
    .toggle-row + .toggle-row { border-top: 1px solid var(--agy-border); }
    .toggle-title { font-weight: 600; color: var(--agy-text); font-size: 12.5px; }
    .toggle-sub { font-size: 11px; color: var(--agy-text-muted); margin-top: 1px; }
    input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--agy-accent); cursor: pointer; flex-shrink: 0; }
    .row-actions { display: flex; gap: 6px; margin-top: 7px; }
    input[type="text"] {
      flex: 1; min-width: 0; padding: 7px 10px; border-radius: 8px;
      border: 1px solid var(--agy-border); background: var(--agy-input-bg);
      color: var(--agy-text); font-size: 12px;
    }
    input[type="text"]::placeholder { color: var(--agy-text-muted); }
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--agy-border); background: var(--agy-card-alt); color: var(--agy-text);
      border-radius: 8px; padding: 6px 11px; font-size: 11.5px; font-weight: 600;
      cursor: pointer; white-space: nowrap; text-decoration: none;
    }
    .btn:hover { border-color: rgba(99,102,241,0.55); }
    .btn.primary {
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      border-color: transparent; color: #ffffff;
      box-shadow: 0 2px 10px rgba(79,70,229,0.28);
    }
    .preview-strip {
      margin-top: 8px; padding: 10px 12px; border-radius: 15px;
      border: 1px solid rgba(139,92,246,0.38);
      background: linear-gradient(135deg, rgba(37,99,235,0.16), rgba(124,58,237,0.16));
      color: var(--agy-text);
    }
    .preview-bar {
      height: 18px; border-radius: 999px; margin-top: 7px; position: relative;
      background: linear-gradient(90deg, #2563eb, #4f46e5, #7c3aed);
    }
    .preview-thumb {
      position: absolute; right: 2px; top: 2px; width: 14px; height: 14px;
      border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
    .hist-item {
      display: flex; align-items: center; justify-content: space-between;
      gap: 6px; padding: 7px 0; border-top: 1px solid var(--agy-border);
    }
    .hist-item:first-child { border-top: 0; padding-top: 0; }
    .hist-main { min-width: 0; flex: 1; }
    .hist-name { font-size: 12px; color: var(--agy-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hist-dir { font-size: 10.5px; color: var(--agy-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .muted { color: var(--agy-text-muted); font-weight: 500; }
  </style>
</head>
<body>
  <div class="app">
    <div class="header">
      <div class="brand">
        <div class="brand-icon">✦</div>
        <div>
          <div class="brand-title">AGY Beautify</div>
          <div class="sub-txt">液态玻璃 · 主题壁纸 · 效率套件</div>
        </div>
      </div>
      <div id="cdpBadge" class="badge">连接中...</div>
    </div>

    <div class="tabs">
      <button type="button" class="tab active" data-tab="wallpaper">外观壁纸</button>
      <button type="button" class="tab" data-tab="dashboard">用量仪表</button>
      <button type="button" class="tab" data-tab="ui">模型汉化</button>
      <button type="button" class="tab" data-tab="reveal">右键定位</button>
    </div>

    <!-- Tab 1: Humanized Appearance, Liquid Glass & Wallpapers -->
    <section id="tab-wallpaper" class="panel active">
      <div class="card">
        <h3>界面深浅色 & 表面材质</h3>
        <div class="sub-txt" style="margin-bottom:6px;">界面配色（一键在浅色柔光 / 深色暗夜之间切换）</div>
        <div id="segTheme" class="seg">
          <button type="button" data-theme="auto">跟随系统</button>
          <button type="button" data-theme="light">☀ 浅色</button>
          <button type="button" data-theme="dark">🌙 深色</button>
        </div>
        <div class="sub-txt" style="margin:10px 0 6px;">玻璃材质风格</div>
        <div id="segGlass" class="seg">
          <button type="button" data-glass="liquid">💧 液态玻璃</button>
          <button type="button" data-glass="frosted">🧊 轻柔磨砂</button>
          <button type="button" data-glass="solid">■ 纯净实体</button>
        </div>
        <div class="toggle-row" style="margin-top:6px;">
          <div>
            <div class="toggle-title">阅读护眼玻璃底板</div>
            <div class="toggle-sub">为 AI 回复文字垫一层柔透玻璃，配任意高清壁纸都清晰不费眼</div>
          </div>
          <input type="checkbox" data-setting="readingSurface" />
        </div>
      </div>

      <div class="card">
        <h3>一键氛围预设（免调参）</h3>
        <div id="presetGrid" class="preset-grid"></div>
      </div>

      <div class="card">
        <h3>
          <span>壁纸画廊（支持浅色 / 深色 / 自选）</span>
          <label class="btn primary" style="cursor:pointer;">
            + 选择图片
            <input id="wpUploadInput" type="file" accept="image/*" style="display:none;" />
          </label>
        </h3>
        <div id="wpDropzone" class="dropzone">
          拖放图片到此处、点击右上角按钮，或按 <b>Ctrl+V</b> 粘贴截图即可设为壁纸
        </div>
        <div class="filter-pills" id="wpFilters">
          <button type="button" class="f-pill active" data-filter="all">全部</button>
          <button type="button" class="f-pill" data-filter="light">☀ 浅色适配</button>
          <button type="button" class="f-pill" data-filter="dark">🌙 深色适配</button>
          <button type="button" class="f-pill" data-filter="custom">🖼 我的壁纸</button>
        </div>
        <div id="wpGrid" class="wp-grid"></div>
        <div class="row-actions" style="margin-top:9px;">
          <input id="wpPathInput" type="text" placeholder="或粘贴本地图片路径，如 C:\\Pictures\\bg.jpg" />
          <button id="btnImportPath" type="button" class="btn">导入</button>
        </div>
        <div id="wpUploadMsg" class="sub-txt" style="margin-top:5px;"></div>

        <details class="advanced">
          <summary>构图与画质精细微调</summary>
          <div class="sub-txt" style="margin:8px 0 5px;">构图焦点（人物壁纸推荐「偏上」）</div>
          <div id="segPos" class="seg">
            <button type="button" data-pos="top">偏上构图</button>
            <button type="button" data-pos="center">居中构图</button>
            <button type="button" data-pos="bottom">偏下构图</button>
          </div>
          <div class="slider-row">
            <div class="slider-head"><span>遮罩浓度（越低壁纸越清晰）</span><span id="valScrim">42%</span></div>
            <input id="rngScrim" type="range" min="0" max="90" step="2" value="42" />
          </div>
          <div class="slider-row">
            <div class="slider-head"><span>液态玻璃强度</span><span id="valGlass">78%</span></div>
            <input id="rngGlass" type="range" min="20" max="100" step="2" value="78" />
          </div>
          <div class="slider-row">
            <div class="slider-head"><span>壁纸背景模糊</span><span id="valBlur">0 px</span></div>
            <input id="rngBlur" type="range" min="0" max="20" step="1" value="0" />
          </div>
          <div class="slider-row">
            <div class="slider-head"><span>壁纸亮度</span><span id="valBright">100%</span></div>
            <input id="rngBright" type="range" min="50" max="130" step="2" value="100" />
          </div>
          <div class="slider-row">
            <div class="slider-head"><span>色彩饱和度</span><span id="valSat">108%</span></div>
            <input id="rngSat" type="range" min="60" max="150" step="2" value="108" />
          </div>
        </details>
      </div>
    </section>

    <!-- Tab 2: Context & Token Dashboard -->
    <section id="tab-dashboard" class="panel">
      <div class="card">
        <h3><span>当前会话上下文</span> <span id="ctxModel" class="muted"></span></h3>
        <div class="gauge-row">
          <svg width="68" height="68" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="29" fill="none" stroke="rgba(148,163,184,0.28)" stroke-width="6"/>
            <circle id="ctxArc" cx="36" cy="36" r="29" fill="none" stroke="#38bdf8" stroke-width="6"
              stroke-linecap="round" stroke-dasharray="182.2" stroke-dashoffset="182.2" transform="rotate(-90 36 36)"/>
            <text id="ctxPctText" x="36" y="40" text-anchor="middle" fill="currentColor" font-size="14" font-weight="700">0%</text>
          </svg>
          <div class="gauge-meta">
            <div id="ctxUsedMax" class="big-num">0 / 200K</div>
            <div id="ctxSubStats" class="sub-txt">缓存命中 — · 速率 —</div>
          </div>
        </div>
        <div class="stats-grid">
          <div class="stat-box"><div class="stat-label">缓存读取</div><div id="ctxCached" class="stat-val">0</div></div>
          <div class="stat-box"><div class="stat-label">未缓存输入</div><div id="ctxUncached" class="stat-val">0</div></div>
          <div class="stat-box"><div class="stat-label">思考 Token</div><div id="ctxThink" class="stat-val">0</div></div>
          <div class="stat-box"><div class="stat-label">回复输出</div><div id="ctxReply" class="stat-val">0</div></div>
        </div>
        <div class="toggle-row" style="margin-top:9px;border-top:1px solid var(--agy-border);padding-top:9px;">
          <div>
            <div class="toggle-title">对话结束自动压缩上下文 (/compact)</div>
            <div class="toggle-sub">当前上下文超过下方阈值时，等本轮回复结束后自动压缩</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
            <button id="btnCompactNow" type="button" class="btn primary" style="padding:4px 9px;font-size:11px;">⚡ 立即压缩</button>
            <input type="checkbox" data-setting="autoCompactEnabled" />
          </div>
        </div>
        <div class="slider-row" style="margin-bottom:2px;">
          <div class="slider-head"><span>自动压缩触发阈值</span><span id="valAutoCompact">80%</span></div>
          <input id="rngAutoCompact" type="range" min="40" max="95" step="1" value="80" />
        </div>
      </div>

      <div class="card">
        <h3>模型配额与重置时间（实时）</h3>
        <div id="quotaList" class="sub-txt">读取中...</div>
      </div>

      <div class="card">
        <h3><span>全局 Token 与美元</span> <span id="scannedConvs" class="muted"></span></h3>
        <div class="stats-grid">
          <div class="stat-box"><div class="stat-label">今日用量</div><div id="tokToday" class="stat-val">0</div><div id="usdToday" class="sub-txt">$0.00</div></div>
          <div class="stat-box"><div class="stat-label">近 7 天</div><div id="tokWeek" class="stat-val">0</div><div id="usdWeek" class="sub-txt">$0.00</div></div>
          <div class="stat-box"><div class="stat-label">近 30 天</div><div id="tokMonth" class="stat-val">0</div><div id="usdMonth" class="sub-txt">$0.00</div></div>
          <div class="stat-box"><div class="stat-label">累计总量</div><div id="tokAll" class="stat-val">0</div><div id="usdAll" class="sub-txt">$0.00</div></div>
        </div>
        <div id="dailyChart" class="daily-chart"></div>
        <div id="modelUsageList" style="margin-top:8px;"></div>
      </div>
    </section>

    <!-- Tab 3: Gemini Model Picker & Auto Chinese -->
    <section id="tab-ui" class="panel">
      <div class="card">
        <h3>Gemini 星尘模型选择器</h3>
        <div class="toggle-row">
          <div>
            <div class="toggle-title">启用星尘滑条并自动屏蔽原生下拉菜单</div>
            <div class="toggle-sub">悬浮于对话框正上方，支持 ⚡ Orchestrator 与点击切换模型家族；按住 Shift 点击可开原生菜单</div>
          </div>
          <input type="checkbox" data-setting="geminiModelPicker" />
        </div>
        <div class="preview-strip">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">
            <span>⚡</span>
            <strong style="background:linear-gradient(90deg,#60a5fa,#a78bfa,#38bdf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">XHigh › Gemini 4 Neon</strong>
            <span>↻</span>
          </div>
          <div class="preview-bar"><span class="preview-thumb"></span></div>
        </div>
      </div>

      <div class="card">
        <h3>界面自动汉化（zh-CN）</h3>
        <div class="toggle-row">
          <div>
            <div class="toggle-title">自动汉化 Antigravity 界面</div>
            <div class="toggle-sub">跳过对话正文与代码块，关闭后即时还原英文</div>
          </div>
          <input type="checkbox" data-setting="autoChinese" />
        </div>
      </div>

      <div class="card">
        <h3>左侧监控台 & 底栏快捷胶囊（✦）</h3>
        <div class="toggle-row">
          <div>
            <div class="toggle-title">在左侧导航栏显示「监控台」入口</div>
            <div class="toggle-sub">点开后在右侧全屏展示总 Token、美元、缓存节省与模型统计</div>
          </div>
          <input type="checkbox" data-setting="showSidebarMonitor" />
        </div>
        <div class="toggle-row">
          <div>
            <div class="toggle-title">显示底栏美化 & 用量快捷胶囊</div>
            <div class="toggle-sub">点击胶囊可直接在对话框上方快切深浅色、液态玻璃与壁纸</div>
          </div>
          <input type="checkbox" data-setting="showContextCapsule" />
        </div>
        <div class="sub-txt" style="margin:6px 0 5px;">胶囊显示密度（检测到 agy-capsule 时自动精简防重复）</div>
        <div id="segCapsule" class="seg">
          <button type="button" data-cap="auto">智能避让</button>
          <button type="button" data-cap="compact">极简图标</button>
          <button type="button" data-cap="full">完整数据</button>
        </div>
      </div>
    </section>

    <!-- Tab 4: Right-Click Reveal File -->
    <section id="tab-reveal" class="panel">
      <div class="card">
        <h3>文件右键定位设置</h3>
        <div class="toggle-row">
          <div>
            <div class="toggle-title">启用文件右键菜单（Open in Folder）</div>
            <div class="toggle-sub">覆盖文件胶囊、Markdown 表格清单、Artifact、变更文件与文件树</div>
          </div>
          <input type="checkbox" data-setting="revealEnabled" />
        </div>
        <div class="toggle-row">
          <div><div class="toggle-title">识别回复中的行内代码路径</div></div>
          <input type="checkbox" data-setting="revealDetectCodePaths" />
        </div>
        <div class="toggle-row">
          <div><div class="toggle-title">优先使用系统原生右键菜单</div></div>
          <input type="checkbox" data-setting="revealUseNativeMenu" />
        </div>
        <div class="toggle-row">
          <div><div class="toggle-title">显示「用默认程序打开」</div></div>
          <input type="checkbox" data-setting="revealShowOpenFile" />
        </div>
        <div class="toggle-row">
          <div><div class="toggle-title">显示「复制完整路径 / 文件夹路径」</div></div>
          <input type="checkbox" data-setting="revealShowCopyActions" />
        </div>
        <div class="toggle-row">
          <div><div class="toggle-title">显示「在终端中打开此目录」</div></div>
          <input type="checkbox" data-setting="revealShowTerminal" />
        </div>
      </div>

      <div class="card">
        <h3>快速定位</h3>
        <div class="row-actions">
          <input id="quickPath" type="text" placeholder="输入或粘贴文件路径 / file:// URI" />
          <button id="btnQuickReveal" type="button" class="btn primary">打开文件夹</button>
        </div>
        <div id="quickRevealMsg" class="sub-txt" style="margin-top:5px;"></div>
      </div>

      <div class="card">
        <h3><span>最近定位记录</span> <button id="btnClearReveals" type="button" class="btn">清空</button></h3>
        <div id="revealHistory" class="sub-txt">暂无记录</div>
      </div>
    </section>
  </div>
  <script src="/app.js"></script>
</body>
</html>`;
}
