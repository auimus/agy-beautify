export function createSidebarScript() {
  return `const post = async (url, body = {}) => {
  if (window.sidecar && typeof window.sidecar.fetch === 'function') {
    const res = await window.sidecar.fetch(url, { method: 'POST', body: JSON.stringify(body) });
    return res.json();
  }
  const token = new URLSearchParams(location.search).get('token') || '';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-sidecar-token': token } : {}) },
    body: JSON.stringify(body),
  });
  return res.json();
};

const fmtTok = n => {
  const v = Number(n) || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + 'K';
  return String(v);
};

let wpFilter = 'all';
let latestData = null;

function detectHostIsDark() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(bg);
  if (hex) {
    const n = parseInt(hex[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) < 130;
  }
  const rgb = /rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/i.exec(bg);
  if (rgb) {
    return (0.299 * +rgb[1] + 0.587 * +rgb[2] + 0.114 * +rgb[3]) < 130;
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function syncPanelTheme(themeMode) {
  const dark = themeMode === 'dark' ? true : themeMode === 'light' ? false : detectHostIsDark();
  document.documentElement.setAttribute('data-ui-theme', dark ? 'dark' : 'light');
}

window.addEventListener('message', ev => {
  if (ev.data?.type === 'theme-change') {
    setTimeout(() => syncPanelTheme(latestData?.settings?.themeMode || 'auto'), 20);
  }
});

// Main tabs
for (const btn of document.querySelectorAll('.tab')) {
  btn.onclick = () => {
    for (const b of document.querySelectorAll('.tab')) b.classList.remove('active');
    for (const p of document.querySelectorAll('.panel')) p.classList.remove('active');
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  };
}

// Wallpaper filter pills
for (const pill of document.querySelectorAll('#wpFilters .f-pill')) {
  pill.onclick = () => {
    wpFilter = pill.dataset.filter;
    for (const p of document.querySelectorAll('#wpFilters .f-pill')) p.classList.toggle('active', p === pill);
    if (latestData) renderWallpapers(latestData);
  };
}

function renderUpdateStatus(upd) {
  if (!upd) return;
  const curVer = upd.currentVersion ? 'v' + upd.currentVersion : '';
  const hdrVer = document.getElementById('hdrVer');
  if (hdrVer) hdrVer.textContent = curVer;
  const updCur = document.getElementById('updCurrentVer');
  if (updCur) updCur.textContent = curVer;
  const hdrBtn = document.getElementById('hdrUpdBtn');
  const stEl = document.getElementById('updStatusText');
  const notesEl = document.getElementById('updNotesBox');
  const instBtn = document.getElementById('btnInstallUpdate');
  const chkBtn = document.getElementById('btnCheckUpdate');
  const lnk = document.getElementById('lnkReleasePage');
  if (lnk && upd.releaseUrl) lnk.href = upd.releaseUrl;
  if (hdrBtn) {
    if (upd.hasUpdate && upd.latestVersion) {
      hdrBtn.style.display = 'inline-flex';
      hdrBtn.textContent = upd.status === 'updating' ? '更新中...' : '⬆ v' + upd.latestVersion;
    } else {
      hdrBtn.style.display = 'none';
    }
  }
  if (chkBtn) chkBtn.disabled = upd.status === 'checking' || upd.status === 'updating';
  if (instBtn) {
    instBtn.style.display = upd.hasUpdate ? 'inline-flex' : 'none';
    instBtn.disabled = upd.status === 'updating';
    instBtn.textContent = upd.status === 'updating'
      ? '正在下载安装...'
      : '⚡ 一键更新至 v' + (upd.latestVersion || '');
  }
  if (stEl) {
    if (upd.status === 'checking') stEl.textContent = '正在连接 GitHub 检查最新 Release...';
    else if (upd.status === 'updating') stEl.textContent = '正在下载更新包并校验 SHA-256，完成后自动热重载...';
    else if (upd.status === 'updated') stEl.textContent = '✅ 已更新至 v' + upd.currentVersion + '，正在热重载生效...';
    else if (upd.status === 'available') {
      const dt = upd.publishedAt ? ' · 发布于 ' + upd.publishedAt.slice(0, 10) : '';
      stEl.textContent = '发现新版本 v' + upd.latestVersion + '（当前 ' + curVer + '）' + dt + '。点击下方按钮即可自动覆盖并重载，个人设置与壁纸完全保留。';
    } else if (upd.status === 'up-to-date') {
      stEl.textContent = '✓ 当前已是最新版本 ' + curVer + '（来自 GitHub Releases）。';
    } else if (upd.status === 'error') {
      stEl.textContent = '检查/更新失败：' + (upd.error || '网络异常');
    }
  }
  if (notesEl) {
    if (upd.hasUpdate && upd.releaseNotes) {
      notesEl.style.display = 'block';
      notesEl.textContent = upd.releaseNotes;
    } else {
      notesEl.style.display = 'none';
    }
  }
}

function renderDashboard(data) {
  const badge = document.getElementById('cdpBadge');
  if (data.cdpState === 'ok') {
    badge.textContent = '已生效 (' + data.attachedCount + ')';
    badge.className = 'badge ok';
  } else if (data.cdpState === 'missing') {
    badge.textContent = '未开启调试端口';
    badge.className = 'badge err';
  } else {
    badge.textContent = '连接中 (' + data.cdpState + ')';
    badge.className = 'badge warn';
  }

  const ctx = data.context || {};
  const pct = Math.min(100, Math.round(ctx.contextPct || 0));
  const arc = document.getElementById('ctxArc');
  arc.setAttribute('stroke-dashoffset', (182.2 * (1 - pct / 100)).toFixed(1));
  arc.setAttribute('stroke', pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#38bdf8');
  document.getElementById('ctxPctText').textContent = pct + '%';
  document.getElementById('ctxModel').textContent = ctx.modelName || '';
  document.getElementById('ctxUsedMax').textContent = fmtTok(ctx.usedContext) + ' / ' + fmtTok(ctx.maxContext || 200000);
  document.getElementById('ctxSubStats').textContent =
    '缓存命中 ' + (ctx.cacheHitPct != null ? ctx.cacheHitPct + '%' : '—') +
    ' · 速率 ' + (ctx.speedTokPerSec ? ctx.speedTokPerSec + ' tok/s' : '—');
  document.getElementById('ctxCached').textContent = fmtTok(ctx.cachedIn);
  document.getElementById('ctxUncached').textContent = fmtTok(ctx.uncachedIn);
  document.getElementById('ctxThink').textContent = fmtTok(ctx.thinkTokens);
  document.getElementById('ctxReply').textContent = fmtTok(ctx.replyTokens);

  const fmtReset = iso => {
    if (!iso) return '';
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return '';
    const diffMs = ts - Date.now();
    if (diffMs <= 60000) return '即将重置';
    const totalMin = Math.ceil(diffMs / 60000);
    const days = Math.floor(totalMin / 1440);
    const hrs = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    const d = new Date(ts);
    const hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const mmdd = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (days > 0) return days + '天' + hrs + 'h 后 (' + mmdd + ' ' + hhmm + ')';
    if (hrs > 0) return hrs + 'h' + (mins > 0 ? mins + 'm' : '') + ' 后 (' + hhmm + ')';
    return mins + 'm 后 (' + hhmm + ')';
  };
  const qBox = document.getElementById('quotaList');
  const quotas = Array.isArray(data.quotas) ? data.quotas : [];
  const validGroups = quotas
    .map(q => {
      const wins = (Array.isArray(q.windows) && q.windows.length ? q.windows : (typeof q.remainingFraction === 'number' ? [{ label: '配额', remainingFraction: q.remainingFraction, resetTime: q.resetTime || '' }] : []))
        .filter(w => typeof w.remainingFraction === 'number');
      return wins.length ? { name: q.name, windows: wins } : null;
    })
    .filter(Boolean);
  if (!validGroups.length) {
    qBox.textContent = '暂未获取到配额池数据';
  } else {
    qBox.innerHTML = '';
    for (const q of validGroups) {
      const box = document.createElement('div');
      box.style.cssText = 'margin-top:7px;padding:8px 10px;border-radius:10px;background:var(--agy-card-alt);border:1px solid var(--agy-border);';
      const title = document.createElement('div');
      title.style.cssText = 'font-size:12px;font-weight:700;color:var(--agy-text);margin-bottom:4px;';
      title.textContent = q.name;
      box.appendChild(title);
      for (const w of q.windows) {
        const qpct = Math.max(0, Math.min(100, Math.round(w.remainingFraction * 100)));
        const rst = fmtReset(w.resetTime) || (qpct >= 100 ? '满额' : '');
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.innerHTML = '<div class="bar-head"><span></span><span style="color:var(--agy-text-muted);font-size:10.5px;"></span></div><div class="bar-track"><div class="bar-fill"></div></div>';
        row.querySelector('.bar-head span:first-child').textContent = (w.label || '配额') + ' · ' + qpct + '%';
        row.querySelector('.bar-head span:last-child').textContent = rst;
        const fill = row.querySelector('.bar-fill');
        fill.style.width = qpct + '%';
        if (qpct <= 20) fill.style.background = '#ef4444';
        else if (qpct <= 50) fill.style.background = '#f59e0b';
        box.appendChild(row);
      }
      qBox.appendChild(box);
    }
  }

  const fmtUsd = v => {
    const n = Number(v) || 0;
    return n >= 0.01 || n === 0 ? '$' + n.toFixed(2) : '$' + n.toFixed(4);
  };
  const u = data.usage;
  if (u) {
    document.getElementById('scannedConvs').textContent = u.scannedConversations + ' 个本地会话';
    document.getElementById('tokToday').textContent = fmtTok(u.totals.today.tokens);
    document.getElementById('tokWeek').textContent = fmtTok(u.totals.week.tokens);
    document.getElementById('tokMonth').textContent = fmtTok(u.totals.month.tokens);
    document.getElementById('tokAll').textContent = fmtTok(u.totals.all.tokens);
    const setTxt = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    setTxt('usdToday', fmtUsd(u.totals.today.costUsd));
    setTxt('usdWeek', fmtUsd(u.totals.week.costUsd));
    setTxt('usdMonth', fmtUsd(u.totals.month.costUsd));
    setTxt('usdAll', fmtUsd(u.totals.all.costUsd) + ' · 省 ' + fmtUsd(u.totals.all.savedUsd));

    const chart = document.getElementById('dailyChart');
    chart.innerHTML = '';
    const maxDay = Math.max(1, ...u.daily14.map(d => d.tokens));
    for (const d of u.daily14) {
      const col = document.createElement('div');
      col.className = 'd-col';
      col.title = d.date + ': ' + fmtUsd(d.costUsd) + ' / ' + fmtTok(d.tokens) + ' tokens (' + d.requests + ' 次请求)';
      const bar = document.createElement('div');
      bar.className = 'd-bar';
      bar.style.height = Math.max(4, Math.round((d.tokens / maxDay) * 56)) + 'px';
      const lbl = document.createElement('div');
      lbl.className = 'd-lbl';
      lbl.textContent = d.date.slice(8);
      col.append(bar, lbl);
      chart.appendChild(col);
    }

    const mBox = document.getElementById('modelUsageList');
    mBox.innerHTML = '';
    const totalAll = Math.max(1, u.totals.all.tokens);
    for (const m of u.byModel) {
      const mpct = Math.round((m.tokens / totalAll) * 100);
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = '<div class="bar-head"><span></span><span></span></div><div class="bar-track"><div class="bar-fill"></div></div>';
      row.querySelector('.bar-head span:first-child').textContent = m.model;
      row.querySelector('.bar-head span:last-child').textContent = fmtUsd(m.costUsd) + ' · ' + fmtTok(m.tokens) + ' (' + mpct + '%)';
      row.querySelector('.bar-fill').style.width = Math.max(2, mpct) + '%';
      mBox.appendChild(row);
    }
  }

  renderUpdateStatus(data.update);
}

function renderWallpapers(data) {
  const s = data.settings || {};
  const grid = document.getElementById('wpGrid');
  grid.innerHTML = '';
  const items = (data.wallpapers || []).filter(wp => {
    if (wpFilter === 'all') return true;
    if (wpFilter === 'custom') return !wp.builtin;
    return wp.tone === wpFilter || wp.tone === 'both';
  });
  if (!items.length) {
    grid.innerHTML = '<div class="sub-txt" style="grid-column:1/-1;padding:12px 0;text-align:center;">该分类下暂无壁纸，拖放或点击上方按钮即可添加</div>';
    return;
  }
  const toneLabel = { light: '☀ 浅色', dark: '🌙 深色', both: '✨ 通用', custom: '🖼 自定义' };
  for (const wp of items) {
    const card = document.createElement('div');
    card.className = 'wp-card' + (wp.id === s.wallpaperId ? ' active' : '');
    const thumb = document.createElement('div');
    thumb.className = 'wp-thumb';
    if (wp.id === 'none') {
      thumb.textContent = '默认无壁纸';
    } else {
      thumb.style.backgroundImage = 'url("/wallpaper?id=' + encodeURIComponent(wp.id) + '")';
    }
    const tag = document.createElement('span');
    tag.className = 'wp-tone';
    tag.textContent = toneLabel[wp.tone] || '✨ 通用';
    thumb.appendChild(tag);

    const nm = document.createElement('div');
    nm.className = 'wp-name';
    const sp = document.createElement('span');
    sp.textContent = wp.name;
    sp.title = wp.name;
    nm.appendChild(sp);
    if (!wp.builtin) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'wp-del';
      del.textContent = '✕';
      del.title = '删除自定义壁纸';
      del.onclick = async ev => {
        ev.stopPropagation();
        await post('/api/wallpaper/delete', { id: wp.id });
        lastWallpaperSig = '';
        await refresh(false);
      };
      nm.appendChild(del);
    }
    card.append(thumb, nm);
    card.onclick = async () => {
      await post('/api/settings', { wallpaperId: wp.id });
      lastWallpaperSig = '';
      await refresh(false);
    };
    grid.appendChild(card);
  }
}

function renderSettingsAndWallpapers(data) {
  latestData = data;
  const s = data.settings || {};
  syncPanelTheme(s.themeMode || 'auto');

  for (const el of document.querySelectorAll('input[type="checkbox"][data-setting]')) {
    el.checked = s[el.dataset.setting] !== false;
  }

  for (const b of document.querySelectorAll('#segTheme button')) {
    b.classList.toggle('active', b.dataset.theme === (s.themeMode || 'auto'));
  }
  for (const b of document.querySelectorAll('#segGlass button')) {
    b.classList.toggle('active', b.dataset.glass === (s.glassStyle || 'liquid'));
  }
  for (const b of document.querySelectorAll('#segPos button')) {
    b.classList.toggle('active', b.dataset.pos === (s.wallpaperPosition || 'top'));
  }
  for (const b of document.querySelectorAll('#segCapsule button')) {
    b.classList.toggle('active', b.dataset.cap === (s.compactCapsule || 'auto'));
  }

  // Presets
  const pGrid = document.getElementById('presetGrid');
  pGrid.innerHTML = '';
  for (const p of data.presets || []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-card' + (s.activePreset === p.id ? ' active' : '');
    btn.innerHTML = '<div class="preset-top"><span>' + p.icon + '</span><span>' + p.name + '</span></div><div class="preset-desc">' + p.desc + '</div>';
    btn.onclick = async () => {
      await post('/api/preset', { presetId: p.id });
      lastWallpaperSig = '';
      await refresh(false);
    };
    pGrid.appendChild(btn);
  }

  // Sliders
  const setRng = (id, valId, v, suffix) => {
    const el = document.getElementById(id);
    if (el) el.value = v;
    const lb = document.getElementById(valId);
    if (lb) lb.textContent = v + suffix;
  };
  setRng('rngScrim', 'valScrim', Math.round((s.wallpaperScrim ?? 0.42) * 100), '%');
  setRng('rngGlass', 'valGlass', Math.round((s.glassStrength ?? 0.78) * 100), '%');
  setRng('rngBlur', 'valBlur', Math.round(s.wallpaperBlur ?? 0), ' px');
  setRng('rngBright', 'valBright', Math.round((s.wallpaperBrightness ?? 1.0) * 100), '%');
  setRng('rngSat', 'valSat', Math.round((s.wallpaperSaturation ?? 1.08) * 100), '%');
  setRng('rngAutoCompact', 'valAutoCompact', Math.round(s.autoCompactThreshold ?? 80), '%');

  renderWallpapers(data);

  // Reveal history
  const hBox = document.getElementById('revealHistory');
  const hist = Array.isArray(s.recentReveals) ? s.recentReveals : [];
  if (!hist.length) {
    hBox.textContent = '暂无记录，右键任意文件并选择「打开所在文件夹」后会显示在这里。';
  } else {
    hBox.innerHTML = '';
    for (const item of hist) {
      const row = document.createElement('div');
      row.className = 'hist-item';
      const left = document.createElement('div');
      left.className = 'hist-main';
      const n = document.createElement('div');
      n.className = 'hist-name';
      n.textContent = item.name || item.path;
      n.title = item.path;
      const d = document.createElement('div');
      d.className = 'hist-dir';
      d.textContent = item.folder || item.path;
      left.append(n, d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = '打开';
      btn.onclick = async () => {
        const res = await post('/api/reveal', { raw: item.path });
        document.getElementById('quickRevealMsg').textContent = res.message || '';
      };
      row.append(left, btn);
      hBox.appendChild(row);
    }
  }
}

let lastWallpaperSig = '';
async function refresh(includeUsage = false) {
  try {
    const convId = window.sidecar?.conversationId || new URLSearchParams(location.search).get('conversationId') || '';
    const data = await post('/api/state', { conversationId: convId, includeUsage });
    renderDashboard(data);
    const sig = JSON.stringify([data.settings, (data.wallpapers || []).map(w => w.id)]);
    if (sig !== lastWallpaperSig) {
      lastWallpaperSig = sig;
      renderSettingsAndWallpapers(data);
    }
  } catch {}
}

// Segmented controls
for (const b of document.querySelectorAll('#segTheme button')) {
  b.onclick = async () => {
    await post('/api/settings', { themeMode: b.dataset.theme });
    lastWallpaperSig = '';
    await refresh(false);
  };
}
for (const b of document.querySelectorAll('#segGlass button')) {
  b.onclick = async () => {
    await post('/api/settings', { glassStyle: b.dataset.glass, wallpaperGlass: b.dataset.glass !== 'solid' });
    lastWallpaperSig = '';
    await refresh(false);
  };
}
for (const b of document.querySelectorAll('#segPos button')) {
  b.onclick = async () => {
    await post('/api/settings', { wallpaperPosition: b.dataset.pos });
    lastWallpaperSig = '';
    await refresh(false);
  };
}
for (const b of document.querySelectorAll('#segCapsule button')) {
  b.onclick = async () => {
    await post('/api/settings', { compactCapsule: b.dataset.cap });
    lastWallpaperSig = '';
    await refresh(false);
  };
}

for (const el of document.querySelectorAll('input[type="checkbox"][data-setting]')) {
  el.onchange = async () => {
    await post('/api/settings', { [el.dataset.setting]: el.checked });
    lastWallpaperSig = '';
    await refresh(false);
  };
}

const bindRange = (id, key, scale, labelId, suffix) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.oninput = () => { document.getElementById(labelId).textContent = el.value + suffix; };
  el.onchange = async () => {
    await post('/api/settings', { [key]: Number(el.value) / scale });
    lastWallpaperSig = '';
    await refresh(false);
  };
};
bindRange('rngScrim', 'wallpaperScrim', 100, 'valScrim', '%');
bindRange('rngGlass', 'glassStrength', 100, 'valGlass', '%');
bindRange('rngBlur', 'wallpaperBlur', 1, 'valBlur', ' px');
bindRange('rngBright', 'wallpaperBrightness', 100, 'valBright', '%');
bindRange('rngSat', 'wallpaperSaturation', 100, 'valSat', '%');
bindRange('rngAutoCompact', 'autoCompactThreshold', 1, 'valAutoCompact', '%');

// File upload, drag-drop, Ctrl+V paste, and local path import
async function uploadFileObj(file) {
  if (!file) return;
  const msg = document.getElementById('wpUploadMsg');
  msg.textContent = '正在导入壁纸...';
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const name = file.name && file.name.includes('.') ? file.name : ('pasted_' + Date.now() + '.png');
      const res = await post('/api/wallpaper/upload', { filename: name, dataUri: reader.result });
      if (res.error) throw new Error(res.error);
      msg.textContent = '已添加并应用壁纸：' + name;
      lastWallpaperSig = '';
      await refresh(false);
    } catch (err) {
      msg.textContent = '导入失败：' + err.message;
    }
  };
  reader.readAsDataURL(file);
}

document.getElementById('wpUploadInput').onchange = ev => {
  const file = ev.target.files?.[0];
  if (file) void uploadFileObj(file);
  ev.target.value = '';
};

const dropzone = document.getElementById('wpDropzone');
dropzone.onclick = () => document.getElementById('wpUploadInput').click();
dropzone.ondragover = ev => { ev.preventDefault(); dropzone.classList.add('dragover'); };
dropzone.ondragleave = () => dropzone.classList.remove('dragover');
dropzone.ondrop = ev => {
  ev.preventDefault();
  dropzone.classList.remove('dragover');
  const file = ev.dataTransfer?.files?.[0];
  if (file) void uploadFileObj(file);
};

window.addEventListener('paste', ev => {
  const items = ev.clipboardData?.items || [];
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        void uploadFileObj(file);
        break;
      }
    }
  }
});

document.getElementById('btnImportPath').onclick = async () => {
  const p = document.getElementById('wpPathInput').value.trim();
  if (!p) return;
  const msg = document.getElementById('wpUploadMsg');
  msg.textContent = '正在导入本地图片...';
  const res = await post('/api/wallpaper/import-path', { path: p });
  if (res.error) {
    msg.textContent = '导入失败：' + res.error;
  } else {
    msg.textContent = '已导入并应用本地壁纸';
    document.getElementById('wpPathInput').value = '';
    lastWallpaperSig = '';
    await refresh(false);
  }
};

document.getElementById('btnCompactNow')?.addEventListener('click', async () => {
  await post('/api/compact', {});
});

document.getElementById('hdrUpdBtn')?.addEventListener('click', () => {
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === 'ui');
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('active', p.id === 'tab-ui');
  document.getElementById('updateCard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

document.getElementById('btnCheckUpdate')?.addEventListener('click', async () => {
  const stEl = document.getElementById('updStatusText');
  if (stEl) stEl.textContent = '正在连接 GitHub 检查最新 Release...';
  const res = await post('/api/update/check', { force: true });
  if (res?.update) {
    if (latestData) latestData.update = res.update;
    renderUpdateStatus(res.update);
  } else {
    await refresh(false);
  }
});

document.getElementById('btnInstallUpdate')?.addEventListener('click', async () => {
  const stEl = document.getElementById('updStatusText');
  const btn = document.getElementById('btnInstallUpdate');
  if (btn) { btn.disabled = true; btn.textContent = '正在下载安装...'; }
  if (stEl) stEl.textContent = '正在从 GitHub Release 下载更新包并校验完整性...';
  const res = await post('/api/update/install', {});
  if (res?.update) {
    if (latestData) latestData.update = res.update;
    renderUpdateStatus(res.update);
  } else if (stEl && res?.message) {
    stEl.textContent = res.message;
  }
});

document.getElementById('btnQuickReveal').onclick = async () => {
  const raw = document.getElementById('quickPath').value.trim();
  if (!raw) return;
  const res = await post('/api/reveal', { raw });
  document.getElementById('quickRevealMsg').textContent = res.message || '';
  lastWallpaperSig = '';
  await refresh(false);
};

document.getElementById('btnClearReveals').onclick = async () => {
  await post('/api/clear-reveals');
  lastWallpaperSig = '';
  await refresh(false);
};

refresh(true);
setInterval(() => refresh(false), 3000);
setInterval(() => refresh(true), 20000);
`;
}
