import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBeautifyInjector } from './injector.mjs';
import { openTargetWithDefaultApp, openTerminalInFolder, revealInFileManager } from './path_utils.mjs';
import {
  createSettingsStore,
  deleteCustomWallpaper,
  getPresetPatch,
  importWallpaperFromLocalPath,
  listWallpapers,
  PRESETS,
  resolveWallpaperDataUri,
  saveCustomWallpaper,
} from './settings.mjs';
import { createTelemetryEngine, getConversationDirs } from './telemetry.mjs';
import { createSidebarHtml } from './ui_html.mjs';
import { createSidebarScript } from './ui_script.mjs';
import { createPluginUpdater } from './updater.mjs';

function installEpipeGuard(proc = process) {
  const isEpipe = err => err?.code === 'EPIPE';
  for (const stream of [proc.stdout, proc.stderr]) {
    stream?.on?.('error', err => { if (!isEpipe(err)) throw err; });
  }
  const fatal = err => {
    if (isEpipe(err)) return;
    try { console.error('[agy-beautify] fatal:', err); } catch {}
    proc.exit(1);
  };
  proc.on('uncaughtException', fatal);
  proc.on('unhandledRejection', fatal);
}

function getProductRoots(dataDir) {
  if (dataDir) {
    const root = resolve(dataDir);
    for (let dir = root; dir !== dirname(dir); dir = dirname(dir)) {
      if (basename(dir) === 'sidecar_data') return [dirname(dir)];
    }
    return [root];
  }
  return ['antigravity', 'antigravity-ide', 'antigravity-cli'].map(p => join(homedir(), '.gemini', p));
}

function startSelfReloadWatcher(directory, onChanged) {
  const pluginDirectory = resolve(directory, '../..');
  const snapshot = () => {
    try {
      if (existsSync(join(pluginDirectory, '.update-in-progress'))) return null;
      const files = readdirSync(directory).filter(n => /\.(mjs|js|json|html|css)$/.test(n)).sort();
      return JSON.stringify([...files.map(n => join(directory, n)), join(pluginDirectory, 'plugin.json')].map(f => {
        const st = statSync(f);
        return [f, st.mtimeMs, st.size];
      }));
    } catch {
      return null;
    }
  };
  let baseline = snapshot();
  let pendingSig = null;
  let pendingSince = 0;
  const timer = setInterval(() => {
    const current = snapshot();
    if (!current) return;
    if (!baseline) {
      baseline = current;
      return;
    }
    if (current !== baseline) {
      if (current !== pendingSig) {
        pendingSig = current;
        pendingSince = Date.now();
      } else if (Date.now() - pendingSince >= 1800) {
        clearInterval(timer);
        onChanged();
      }
    } else {
      pendingSig = null;
      pendingSince = 0;
    }
  }, 600);
  timer.unref?.();
  return () => clearInterval(timer);
}

const pluginRootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const settingsStore = createSettingsStore();
const telemetryEngine = createTelemetryEngine({ conversationDirs: getConversationDirs() });
let lastStatus = { cdpState: 'unknown', pageCount: 0, attachedCount: 0 };
let cachedUsage = null;
let cachedUsageAt = 0;
let injectorRef = null;
let triggerShutdown = null;
let ackClientRev = 0;
let sidecarRev = 0;

const updater = createPluginUpdater({
  pluginDir: pluginRootDir,
  onUpdated: () => {
    void injectorRef?.tick();
    setTimeout(() => { triggerShutdown?.('updated'); }, 1000);
  },
});

function bumpAckRev(payload) {
  const r = Number(payload?.clientRev);
  if (Number.isInteger(r) && r > ackClientRev) ackClientRev = r;
}

function readUsageCached(force = false) {
  const now = Date.now();
  if (!force && cachedUsage && now - cachedUsageAt < 15_000) return cachedUsage;
  cachedUsage = telemetryEngine.getUsageDashboard();
  cachedUsageAt = now;
  return cachedUsage;
}

function getWallpaperCatalogForPage() {
  return listWallpapers().map(({ id, name, tone, builtin, kind, dataUri }) => ({
    id,
    name,
    tone: tone || 'both',
    builtin: Boolean(builtin),
    kind,
    // Inline tiny SVG data URIs (~1.5KB each) so switching built-in wallpapers/presets is 0ms instant!
    dataUri: kind === 'svg' ? dataUri : '',
  }));
}

function handleInvoke(payload = {}) {
  const { action, raw } = payload;

  // Built-in GitHub Release Updater Actions
  if (action === 'checkUpdate') {
    return updater.checkForUpdate({ force: true }).then(st => {
      void injectorRef?.tick();
      if (st.status === 'error') return { message: `检查更新失败：${st.error}`, isError: true };
      if (st.hasUpdate) return { message: `发现新版本 v${st.latestVersion}（当前 v${st.currentVersion}），可点击顶部更新按钮一键升级`, isError: false };
      return { message: `当前已是最新版本 v${st.currentVersion}`, isError: false };
    });
  }
  if (action === 'installUpdate') {
    return updater.installUpdate().then(res => {
      void injectorRef?.tick();
      return { message: res.message, isError: !res.ok };
    });
  }

  // Quick Studio & In-Page Settings Actions
  if (action === 'refreshDashboard') {
    readUsageCached(true);
    void injectorRef?.tick();
    return { ok: true, silent: true };
  }
  if (action === 'updateSettings') {
    bumpAckRev(payload);
    const patch = payload.patch && typeof payload.patch === 'object' ? { ...payload.patch } : {};
    if (!('activePreset' in patch)) patch.activePreset = 'custom';
    settingsStore.update(patch);
    void injectorRef?.tick();
    return { ok: true, silent: true };
  }
  if (action === 'applyPreset') {
    bumpAckRev(payload);
    const patch = getPresetPatch(payload.presetId);
    if (!patch) return { message: '未找到该预设方案', isError: true };
    settingsStore.update(patch);
    void injectorRef?.tick();
    const meta = PRESETS.find(p => p.id === payload.presetId);
    return { message: `已切换风格：${meta?.name || payload.presetId}`, isError: false };
  }
  if (action === 'uploadWallpaper') {
    bumpAckRev(payload);
    try {
      const id = saveCustomWallpaper(payload.filename, payload.dataUri);
      settingsStore.update({ wallpaperId: id, activePreset: 'custom' });
      void injectorRef?.tick();
      return { message: `已应用自定义壁纸：${payload.filename}`, isError: false };
    } catch (err) {
      return { message: `导入壁纸失败：${err.message}`, isError: true };
    }
  }
  if (action === 'deleteWallpaper') {
    bumpAckRev(payload);
    const id = String(payload.id || '');
    deleteCustomWallpaper(id);
    if (settingsStore.read().wallpaperId === id) {
      settingsStore.update({ wallpaperId: 'none', activePreset: 'custom' });
    }
    void injectorRef?.tick();
    return { message: '已删除自定义壁纸', isError: false };
  }

  // Right-Click Reveal File Actions
  if (!raw) return { message: '未检测到文件路径', isError: true };
  if (action === 'reveal') {
    const res = revealInFileManager(raw);
    if (!res.ok) return { message: res.error || '打开文件夹失败', isError: true };
    settingsStore.recordReveal({ path: res.localPath, folder: res.folderPath, name: basename(res.localPath) || res.localPath });
    return {
      message: res.fallback ? `原文件不存在，已打开上级目录：${res.folderPath}` : `已打开所在文件夹：${res.folderPath}`,
      isError: false,
      result: res,
    };
  }
  if (action === 'open') {
    const res = openTargetWithDefaultApp(raw);
    if (!res.ok) return { message: res.error || '打开文件失败', isError: true };
    settingsStore.recordReveal({ path: res.localPath, folder: res.folderPath, name: basename(res.localPath) || res.localPath });
    return { message: `已打开：${basename(res.targetPath) || res.targetPath}`, isError: false, result: res };
  }
  if (action === 'terminal') {
    const res = openTerminalInFolder(raw);
    if (!res.ok) return { message: res.error || '打开终端失败', isError: true };
    return { message: `已在终端打开：${res.folderPath}`, isError: false, result: res };
  }
  return { message: `未知操作: ${action}`, isError: true };
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  installEpipeGuard();

  const injector = startBeautifyInjector({
    productRoots: getProductRoots(process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR),
    getSettings: () => settingsStore.read(),
    getSettingsMeta: () => ({ ackClientRev, sidecarRev }),
    getWallpaperDataUri: id => resolveWallpaperDataUri(id),
    getWallpaperCatalog: () => getWallpaperCatalogForPage(),
    getPresets: () => PRESETS.map(({ id, name, desc, icon, patch }) => ({ id, name, desc, icon, patch })),
    getTelemetry: async convId => ({
      context: telemetryEngine.getConversationMetrics(convId),
      quotas: await telemetryEngine.fetchQuota(),
      dashboard: readUsageCached(false),
      update: updater.getState(),
    }),
    onInvoke: handleInvoke,
    onStatus: s => { lastStatus = s; },
  });
  injectorRef = injector;

  if (process.env.ANTIGRAVITY_SIDECAR_WEB_PORT && process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN?.trim()) {
    const { SidecarApp, Response } = await import('sidecar_sdk');
    const app = new SidecarApp();
    const html = createSidebarHtml();
    const script = createSidebarScript();

    app.page('/', () => html);
    app.page('/ui.html', () => html);
    app.page('/app.js', () => script);

    app.api('/wallpaper', data => {
      const id = String(data?.id || '');
      const all = listWallpapers();
      const found = all.find(w => w.id === id);
      if (!found || found.kind === 'none') return new Response('', { status: 404 });
      if (found.kind === 'svg') {
        const b64 = found.dataUri.split(',')[1] || '';
        return new Response(Buffer.from(b64, 'base64'), { contentType: 'image/svg+xml' });
      }
      if (found.filePath && existsSync(found.filePath)) {
        return new Response(readFileSync(found.filePath), { contentType: found.mime || 'image/jpeg' });
      }
      return new Response('', { status: 404 });
    }, 'GET');

    app.api('/api/state', async data => {
      const convId = data?.conversationId || app.config?.conversationId || '';
      const wallpapers = listWallpapers().map(({ id, name, tone, builtin }) => ({ id, name, tone, builtin }));
      return {
        ...lastStatus,
        cdpState: injector.status(),
        attachedCount: injector.attachedPages(),
        settings: settingsStore.read(),
        wallpapers,
        presets: PRESETS.map(({ id, name, desc, icon }) => ({ id, name, desc, icon })),
        context: telemetryEngine.getConversationMetrics(convId),
        quotas: await telemetryEngine.fetchQuota(),
        usage: data?.includeUsage ? readUsageCached(false) : cachedUsage,
        update: updater.getState(),
      };
    }, 'POST');

    app.api('/api/update/check', async data => {
      const state = await updater.checkForUpdate({ force: data?.force !== false });
      void injector.tick();
      return { ok: state.status !== 'error', update: state };
    }, 'POST');

    app.api('/api/update/install', async () => {
      const res = await updater.installUpdate();
      void injector.tick();
      return { ...res, update: updater.getState() };
    }, 'POST');

    app.api('/api/settings', data => {
      const patch = data && typeof data === 'object' ? { ...data } : {};
      if (!('activePreset' in patch)) patch.activePreset = 'custom';
      if ('themeMode' in patch && !('wallpaperId' in patch)) {
        const curWp = settingsStore.read().wallpaperId;
        if (patch.themeMode === 'light' && ['deep-ocean-glass', 'gemini-aurora', 'midnight-grid'].includes(curWp)) {
          patch.wallpaperId = 'liquid-prism-light';
        } else if (patch.themeMode === 'dark' && ['liquid-prism-light', 'sakura-mist-light'].includes(curWp)) {
          patch.wallpaperId = 'deep-ocean-glass';
        }
      }
      const next = settingsStore.update(patch);
      sidecarRev++;
      void injector.tick();
      return { ok: true, settings: next };
    }, 'POST');

    app.api('/api/compact', async () => {
      const ok = await injector.triggerCompact();
      return { ok };
    }, 'POST');

    app.api('/api/preset', data => {
      const patch = getPresetPatch(data?.presetId);
      if (!patch) return { ok: false, error: '未找到预设方案' };
      const next = settingsStore.update(patch);
      sidecarRev++;
      void injector.tick();
      return { ok: true, settings: next };
    }, 'POST');

    app.api('/api/wallpaper/upload', data => {
      try {
        const id = saveCustomWallpaper(data?.filename, data?.dataUri);
        const next = settingsStore.update({ wallpaperId: id, activePreset: 'custom' });
        sidecarRev++;
        void injector.tick();
        return { ok: true, id, settings: next };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }, 'POST');

    app.api('/api/wallpaper/import-path', data => {
      try {
        const id = importWallpaperFromLocalPath(data?.path);
        const next = settingsStore.update({ wallpaperId: id, activePreset: 'custom' });
        sidecarRev++;
        void injector.tick();
        return { ok: true, id, settings: next };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }, 'POST');

    app.api('/api/wallpaper/delete', data => {
      const id = String(data?.id || '');
      deleteCustomWallpaper(id);
      const cur = settingsStore.read();
      if (cur.wallpaperId === id) settingsStore.update({ wallpaperId: 'none', activePreset: 'custom' });
      sidecarRev++;
      void injector.tick();
      return { ok: true, settings: settingsStore.read() };
    }, 'POST');

    app.api('/api/reveal', data => handleInvoke({ action: 'reveal', raw: data?.raw }), 'POST');
    app.api('/api/clear-reveals', () => ({ ok: true, settings: settingsStore.clearReveals() }), 'POST');
    await app.run();
  }

  let stopping = false;
  const shutdown = async reason => {
    if (stopping) return;
    stopping = true;
    clearTimeout(initUpdateTimer);
    clearInterval(periodicUpdateTimer);
    stopWatching();
    console.log('[agy-beautify] stopping:', reason);
    try { await injector.stop(); }
    finally { process.exit(0); }
  };
  triggerShutdown = reason => { void shutdown(reason); };

  // Passive background check on startup (10s delay) & every 6 hours when enabled
  const runAutoUpdateCheck = () => {
    if (settingsStore.read().autoCheckUpdate === false) return;
    void updater.checkForUpdate({ force: false }).then(() => { void injector.tick(); }).catch(() => {});
  };
  const initUpdateTimer = setTimeout(runAutoUpdateCheck, 10_000);
  initUpdateTimer.unref?.();
  const periodicUpdateTimer = setInterval(runAutoUpdateCheck, 6 * 3600_000);
  periodicUpdateTimer.unref?.();

  const stopWatching = startSelfReloadWatcher(dirname(fileURLToPath(import.meta.url)), () => void shutdown('files changed'));
  for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => void shutdown(sig));
}
