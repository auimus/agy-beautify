import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ZH_EXACT, ZH_PATTERNS } from './i18n_dict.mjs';
import { loopbackFetch } from './loopback_fetch.mjs';

const INSTANCE_TS = Date.now();
const INTERVAL_MS = 1500;
const BINDING_NAME = '__agyBeautifyInvoke';

const PORT_FILE =
  process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'Antigravity', 'DevToolsActivePort')
    : process.platform === 'win32'
      ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Antigravity', 'DevToolsActivePort')
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Antigravity', 'DevToolsActivePort');

export function createComposerOriginResolver(productRoots = [], env = process.env, now = Date.now) {
  let session = null;
  return async function composerOrigin() {
    const address = env.ANTIGRAVITY_LS_ADDRESS;
    const token = env.ANTIGRAVITY_CSRF_TOKEN;
    const match = /^(127\.0\.0\.1|localhost):([1-9]\d{0,4})$/.exec(address || '');
    if (!match || +match[2] > 65535 || !token) {
      session = null;
      return null;
    }
    for (const root of productRoots) {
      let hub;
      try {
        hub = JSON.parse(readFileSync(join(root, 'daemon', 'hub_' + match[2] + '.json'), 'utf8'));
      } catch {
        continue;
      }
      if (hub?.httpPort !== +match[2] || !Number.isInteger(hub.httpsPort) || hub.httpsPort < 1 || hub.httpsPort > 65535) continue;
      const origin = new URL('https://127.0.0.1:' + hub.httpsPort).origin;
      if (!session || session.address !== address || session.token !== token || session.origin !== origin || session.pid !== hub.pid) {
        session = { address, token, origin, pid: hub.pid, verified: false, retryAt: 0, delay: 3000 };
      }
      if (session.verified) return origin;
      if (now() < session.retryAt) return null;
      try {
        const res = await loopbackFetch(`http://${match[1]}:${match[2]}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-codeium-csrf-token': token },
          body: '{}',
          redirect: 'error',
          signal: AbortSignal.timeout(3000),
        });
        await res.body?.cancel();
        if (res.ok) {
          session.verified = true;
          return origin;
        }
      } catch {}
      session.retryAt = now() + session.delay;
      session.delay = Math.min(30_000, session.delay * 2);
      return null;
    }
    return null;
  };
}

function pageInstallBeautifyRuntime(owner, hash, bindingName, zhExact, zhPatterns, initialSettings) {
  if (globalThis.__agyBeautifyRuntime?.owner > owner) return 'superseded';
  if (globalThis.__agyBeautifyRuntime?.owner === owner && globalThis.__agyBeautifyRuntime?.hash === hash) return true;
  globalThis.__agyBeautifyRuntime?.dispose?.();

  let settings = { ...initialSettings };
  let localRev = 0;
  let lastSidecarRev = 0;
  let studioDragging = false;
  let wallpaperDataUri = '';
  const wpUriCache = new Map();
  let wallpaperCatalog = [];
  let presetsCatalog = [];
  let telemetry = null;
  let disposed = false;

  const nativeBodyClasses = {
    dark: document.body.classList.contains('dark'),
    darkTheme: document.body.classList.contains('dark-theme'),
    themeDark: document.body.classList.contains('theme-dark'),
    themeLight: document.body.classList.contains('theme-light'),
  };

  const isColorDark = raw => {
    const v = String(raw || '').trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(v);
    if (hex) {
      const n = parseInt(hex[1], 16);
      return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 130;
    }
    const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v);
    if (rgb) return (0.299 * +rgb[1] + 0.587 * +rgb[2] + 0.114 * +rgb[3]) < 130;
    return null;
  };

  // Detect Antigravity's real native host theme from inline <html style> (which our stylesheet never mutates)
  const isHostDark = () => {
    const inlineScheme = document.documentElement.style.colorScheme;
    if (inlineScheme === 'dark') return true;
    if (inlineScheme === 'light') return false;
    const inlineBg = document.documentElement.style.getPropertyValue('--background');
    const bgDark = isColorDark(inlineBg);
    if (bgDark !== null) return bgDark;
    if (nativeBodyClasses.themeDark || nativeBodyClasses.dark) return true;
    if (nativeBodyClasses.themeLight) return false;
    return Boolean(window.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
  };

  const isDarkTheme = () => {
    if (settings.themeMode === 'dark') return true;
    if (settings.themeMode === 'light') return false;
    return isHostDark();
  };

  let lastTboSig = '';
  const syncTitleBarOverlay = (force = false) => {
    const tbo = window.electronNative?.setTitleBarOverlay;
    if (typeof tbo !== 'function' || window.electronNative?.customWindowControls === true) return;
    const dark = isDarkTheme();
    const bar = document.querySelector('[data-testid="title-menu-bar"]');
    const barH = bar ? Math.round(bar.getBoundingClientRect().height) : 29;
    const height = Math.max(24, Math.min(48, barH || 29));
    // Transparent overlay (#00000000) lets Liquid Glass / Frosted / Solid titlebar & wallpaper flow seamlessly behind Win32 window controls
    const color = '#00000000';
    const symbolColor = dark ? '#e2e8f0' : '#1e293b';
    const sig = `${color}:${symbolColor}:${height}`;
    if (!force && sig === lastTboSig) return;
    lastTboSig = sig;
    try {
      tbo({ color, symbolColor, height });
    } catch {}
  };

  const restoreNativeTitleBarOverlay = () => {
    const tbo = window.electronNative?.setTitleBarOverlay;
    if (typeof tbo !== 'function' || window.electronNative?.customWindowControls === true) return;
    const hostDark = isHostDark();
    const bar = document.querySelector('[data-testid="title-menu-bar"]');
    const height = Math.max(24, Math.min(48, Math.round(bar?.getBoundingClientRect()?.height || 29)));
    const inlineSide = document.documentElement.style.getPropertyValue('--sidebar').trim();
    const inlineFg = document.documentElement.style.getPropertyValue('--secondary-foreground').trim();
    const isHex = s => /^#[0-9a-f]{6}$/i.test(s);
    try {
      tbo({
        color: isHex(inlineSide) ? inlineSide : (hostDark ? '#131313' : '#FAFAFA'),
        symbolColor: isHex(inlineFg) ? inlineFg : (hostDark ? '#FAFAFA' : '#3F3F46'),
        height,
      });
    } catch {}
  };

  const syncBodyThemeClasses = () => {
    const mode = settings.themeMode || 'auto';
    if (mode === 'auto') {
      const hostDark = isHostDark();
      document.body.classList.toggle('dark', hostDark);
      document.body.classList.toggle('dark-theme', hostDark);
      document.body.classList.toggle('theme-dark', hostDark);
      document.body.classList.toggle('theme-light', !hostDark);
    } else {
      const dark = mode === 'dark';
      document.body.classList.toggle('dark', dark);
      document.body.classList.toggle('dark-theme', dark);
      document.body.classList.toggle('theme-dark', dark);
      document.body.classList.toggle('theme-light', !dark);
    }
  };

  const onWindowResize = () => {
    if (!disposed) syncTitleBarOverlay(false);
  };
  window.addEventListener('resize', onWindowResize);

  const invokeSidecar = payload => {
    const fn = globalThis[bindingName];
    if (typeof fn === 'function') fn(JSON.stringify(payload));
    else showToast('AGY Beautify 桥接尚未就绪', true);
  };

  // ---------------- Shared Liquid Toast ----------------
  let toastHost = null;
  let toastTimer = null;
  const showToast = (msg, isError = false) => {
    if (disposed || !msg) return;
    if (!toastHost || !toastHost.isConnected) {
      toastHost = document.createElement('div');
      toastHost.id = 'agy-beautify-toast-host';
      toastHost.style.cssText = 'position:fixed;right:18px;bottom:58px;z-index:2147483647;pointer-events:none;';
      toastHost.attachShadow({ mode: 'open' });
      document.documentElement.appendChild(toastHost);
    }
    const dark = isDarkTheme();
    const root = toastHost.shadowRoot;
    root.innerHTML = '';
    const box = document.createElement('div');
    box.textContent = msg;
    box.style.cssText = [
      'font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
      'font-size:12px',
      'line-height:1.4',
      'max-width:380px',
      'padding:8px 13px',
      'border-radius:13px',
      'box-shadow:' + (dark
        ? '0 14px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)'
        : '0 12px 30px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.92)'),
      'border:1px solid ' + (isError ? 'rgba(248,113,113,0.48)' : dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.75)'),
      'background:' + (dark
        ? 'linear-gradient(135deg, rgba(24,30,48,0.88), rgba(16,20,34,0.82))'
        : 'linear-gradient(135deg, rgba(255,255,255,0.88), rgba(244,247,255,0.82))'),
      'color:' + (isError ? (dark ? '#fca5a5' : '#b91c1c') : (dark ? '#f8fafc' : '#0f172a')),
      'backdrop-filter:blur(20px) saturate(180%)',
      'word-break:break-all',
    ].join(';');
    root.appendChild(box);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toastHost?.shadowRoot) toastHost.shadowRoot.innerHTML = '';
    }, 2400);
  };

  // ---------------- Module 5: Humanized Theme + Liquid Glass + Wallpaper Engine ----------------
  let wpLayer = null;
  let wpStyle = null;

  const applyWallpaperAndTheme = () => {
    const hasWp = Boolean(settings.wallpaperId && settings.wallpaperId !== 'none' && wallpaperDataUri);
    const themeMode = settings.themeMode || 'auto';
    const glassStyle = settings.glassStyle || (settings.wallpaperGlass === false ? 'solid' : 'liquid');
    const dark = isDarkTheme();
    const hostDark = isHostDark();
    const needThemeOverride = (themeMode === 'dark' && !hostDark) || (themeMode === 'light' && hostDark);
    const needStyleTag = true; // Always keep topbar stacking / monitor overlay z-index / popover rules active

    syncBodyThemeClasses();
    syncTitleBarOverlay(false);

    if (!hasWp) {
      wpLayer?.remove();
      wpLayer = null;
    } else {
      if (!wpLayer || !wpLayer.isConnected) {
        wpLayer = document.createElement('div');
        wpLayer.id = 'agy-beautify-wallpaper-layer';
        document.body.prepend(wpLayer);
      }
      const opacity = Number(settings.wallpaperOpacity ?? 0.94);
      const blur = Number(settings.wallpaperBlur ?? 0);
      const scrim = Number(settings.wallpaperScrim ?? 0.42);
      const fit = settings.wallpaperFit === 'contain' ? 'contain' : 'cover';
      const posMap = { top: 'center top', center: 'center center', bottom: 'center bottom' };
      const pos = posMap[settings.wallpaperPosition] || 'center top';
      const bright = Number(settings.wallpaperBrightness ?? 1.0);
      const sat = Number(settings.wallpaperSaturation ?? 1.08);
      const filterStr = `blur(${blur}px) brightness(${bright}) saturate(${sat})`;
      const veil = dark
        ? `linear-gradient(180deg, rgba(7,11,22,${(scrim * 0.94).toFixed(3)}) 0%, rgba(9,13,26,${scrim.toFixed(3)}) 55%, rgba(6,10,20,${Math.min(0.95, scrim + 0.1).toFixed(3)}) 100%)`
        : `linear-gradient(180deg, rgba(248,250,255,${(scrim * 0.88).toFixed(3)}) 0%, rgba(245,248,255,${scrim.toFixed(3)}) 55%, rgba(242,246,255,${Math.min(0.93, scrim + 0.08).toFixed(3)}) 100%)`;

      wpLayer.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;';
      wpLayer.innerHTML = '';
      const baseBg = document.createElement('div');
      baseBg.style.cssText = `position:absolute;inset:0;background:${dark ? '#090d16' : '#f4f7fc'};`;
      const imgDiv = document.createElement('div');
      imgDiv.style.cssText = [
        'position:absolute',
        `inset:-${Math.max(0, blur * 2)}px`,
        `background-image:url("${wallpaperDataUri}")`,
        `background-size:${fit}`,
        `background-position:${pos}`,
        'background-repeat:no-repeat',
        `opacity:${opacity}`,
        `filter:${filterStr}`,
        'transition:opacity .25s ease, filter .25s ease, background-position .25s ease',
      ].join(';');
      const scrimDiv = document.createElement('div');
      scrimDiv.style.cssText = `position:absolute;inset:0;background:${veil};transition:background .25s ease;`;
      wpLayer.append(baseBg, imgDiv, scrimDiv);
    }

    if (!needStyleTag) {
      wpStyle?.remove();
      wpStyle = null;
      return;
    }

    if (!wpStyle || !wpStyle.isConnected) {
      wpStyle = document.createElement('style');
      wpStyle.id = 'agy-beautify-wallpaper-style';
      document.head.appendChild(wpStyle);
    }

    const strength = Math.max(0.2, Math.min(1, Number(settings.glassStrength ?? 0.78)));
    const blurPx = glassStyle === 'liquid'
      ? Math.round(14 + strength * 14)
      : glassStyle === 'frosted'
        ? Math.round(8 + strength * 10)
        : 0;
    const satPct = glassStyle === 'liquid' ? Math.round(150 + strength * 55) : 130;
    const readingOn = settings.readingSurface !== false;

    const cssParts = [];

    // 1. Complete Light / Dark theme token override (zero app.asar modification, 100% reversible)
    if (themeMode === 'dark') {
      cssParts.push(`
        :root, html, body {
          color-scheme: dark !important;
          --background: #0c101b !important;
          --foreground: #f1f5f9 !important;
          --primary: #60a5fa !important;
          --primary-foreground: #090d16 !important;
          --link: #93c5fd !important;
          --error: #f87171 !important;
          --warning: #fbbf24 !important;
          --success: #4ade80 !important;
          --secondary: rgba(255, 255, 255, 0.085) !important;
          --secondary-foreground: #cbd5e1 !important;
          --muted: rgba(255, 255, 255, 0.05) !important;
          --muted-foreground: #a8b7cc !important;
          --placeholder: #94a3b8 !important;
          --sidebar: #0e1320 !important;
          --sidebar-secondary: rgba(255, 255, 255, 0.095) !important;
          --sidebar-muted: rgba(255, 255, 255, 0.055) !important;
          --content: #0c101b !important;
          --card: rgba(18, 24, 38, 0.88) !important;
          --card-border: rgba(255, 255, 255, 0.13) !important;
          --card-edge: rgba(255, 255, 255, 0.12) !important;
          --border: rgba(255, 255, 255, 0.1) !important;
          --shell: #090d17 !important;
          --shell-canvas: ${hasWp ? 'transparent' : '#090d17'} !important;
          --scrim: rgba(2, 6, 18, 0.56) !important;
          --glass: rgba(18, 24, 38, 0.82) !important;
          --glass-border: rgba(255, 255, 255, 0.14) !important;
          --glass-highlight: rgba(255, 255, 255, 0.22) !important;
          --onyx-frame: rgba(255, 255, 255, 0.09) !important;
          --onyx-well: rgba(255, 255, 255, 0.07) !important;
          --onyx-raised: rgba(24, 31, 48, 0.9) !important;
          --onyx-selected: rgba(96, 165, 250, 0.2) !important;
          --onyx-key: rgba(30, 38, 58, 0.92) !important;
          --home-glow: rgba(96, 165, 250, 0.12) !important;
          --editor-selection-background: rgba(96, 165, 250, 0.3) !important;
          --editor-comment-selection-background: rgba(96, 165, 250, 0.2) !important;
          --editor-diff-inserted-line-background: rgba(34, 197, 94, 0.15) !important;
          --editor-diff-removed-line-background: rgba(248, 113, 113, 0.18) !important;
          --editor-diff-inserted-text-background: rgba(34, 197, 94, 0.28) !important;
          --editor-diff-removed-text-background: rgba(248, 113, 113, 0.3) !important;
          --chart-1: #60a5fa !important;
          --chart-2: #fbbf24 !important;
          --chart-3: #34d399 !important;
          --chart-4: #c084fc !important;
          --chart-5: #fb7185 !important;
          --chart-6: #38bdf8 !important;
          --code-foreground: #e2e8f0 !important;
          --syntax-comment: #7f8ea3 !important;
          --syntax-punctuation: #94a3b8 !important;
          --syntax-property: #f472b6 !important;
          --syntax-string: #86efac !important;
          --syntax-keyword: #7dd3fc !important;
          --syntax-function: #c4b5fd !important;
          --syntax-variable: #fcd34d !important;
          --syntax-default-fg: #e2e8f0 !important;
        }
        [data-testid="conversation-row-sidebar"][aria-current="page"],
        [data-testid="conversation-row-sidebar"].bg-sidebar-secondary {
          background: rgba(96, 165, 250, 0.18) !important;
        }
      `);
    } else if (themeMode === 'light') {
      cssParts.push(`
        :root, html, body {
          color-scheme: light !important;
          --background: #ffffff !important;
          --foreground: #0a0a0c !important;
          --primary: #2563eb !important;
          --primary-foreground: #ffffff !important;
          --link: #1d4ed8 !important;
          --error: #dc2626 !important;
          --warning: #b45309 !important;
          --success: #16a34a !important;
          --secondary: rgba(10, 10, 12, 0.06) !important;
          --secondary-foreground: #3f3f46 !important;
          --muted: rgba(10, 10, 12, 0.04) !important;
          --muted-foreground: #64748b !important;
          --placeholder: #8e8e95 !important;
          --sidebar: #fafafa !important;
          --sidebar-secondary: rgba(10, 10, 12, 0.075) !important;
          --sidebar-muted: rgba(10, 10, 12, 0.045) !important;
          --content: #ffffff !important;
          --card: #ffffff !important;
          --card-border: rgba(10, 10, 12, 0.08) !important;
          --card-edge: rgba(15, 23, 42, 0.11) !important;
          --border: rgba(10, 10, 12, 0.07) !important;
          --shell: #fafafa !important;
          --shell-canvas: ${hasWp ? 'transparent' : '#fafafa'} !important;
          --scrim: rgba(10, 10, 12, 0.28) !important;
          --glass: #ffffff !important;
          --glass-border: rgba(10, 10, 12, 0.08) !important;
          --glass-highlight: rgba(255, 255, 255, 1) !important;
          --onyx-frame: #f4f6fb !important;
          --onyx-well: rgba(10, 10, 12, 0.055) !important;
          --onyx-raised: #ffffff !important;
          --onyx-selected: rgba(37, 99, 235, 0.11) !important;
          --onyx-key: #ffffff !important;
          --home-glow: rgba(37, 99, 235, 0.08) !important;
          --editor-selection-background: rgba(47, 117, 195, 0.32) !important;
          --editor-comment-selection-background: rgba(47, 117, 195, 0.2) !important;
          --editor-diff-inserted-line-background: rgba(102, 232, 123, 0.16) !important;
          --editor-diff-removed-line-background: rgba(245, 145, 130, 0.22) !important;
          --editor-diff-inserted-text-background: rgba(102, 232, 123, 0.28) !important;
          --editor-diff-removed-text-background: rgba(245, 145, 130, 0.3) !important;
          --chart-1: #1d4ed8 !important;
          --chart-2: #b45309 !important;
          --chart-3: #15803d !important;
          --chart-4: #7e22ce !important;
          --chart-5: #be123c !important;
          --chart-6: #0369a1 !important;
          --code-foreground: #1e293b !important;
          --syntax-comment: #64748b !important;
          --syntax-punctuation: #64748b !important;
          --syntax-property: #be185d !important;
          --syntax-string: #15803d !important;
          --syntax-keyword: #0369a1 !important;
          --syntax-function: #6d28d9 !important;
          --syntax-variable: #b45309 !important;
          --syntax-default-fg: #0f172a !important;
        }
      `);
    } else if (hasWp) {
      cssParts.push(`:root, html, body { --shell-canvas: transparent !important; }`);
    }

    // 2. Transparent canvas containers & eliminate bottom scroll fade band when wallpaper is active
    if (hasWp) {
      cssParts.push(`
        html, body { background-color: transparent !important; }
        #root, .agy-shell, .agy-inset-shell { background: transparent !important; }
        #root { position: relative !important; z-index: 1 !important; }
        .browser-hole-opaque > .flex-1.min-h-0.flex.flex-col { background: transparent !important; }
        [data-testid="conversation-list-sidebar"],
        [data-testid="conversation-list-sidebar"] .bg-sidebar {
          background: transparent !important;
        }
        /* Remove harsh horizontal white/black scroll fade band above the floating composer */
        .absolute.bottom-0.z-10.pointer-events-none.left-4,
        .absolute.bottom-0.z-10.pointer-events-none {
          background: transparent !important;
          background-image: none !important;
        }
      `);
    }

    // 3. True Liquid Glass vs Frosted vs Solid surface styling
    if (glassStyle === 'liquid') {
      const titleBg = dark
        ? 'linear-gradient(180deg, rgba(14,19,34,0.72), rgba(12,17,30,0.58))'
        : 'linear-gradient(180deg, rgba(255,255,255,0.68), rgba(246,249,255,0.52))';
      const sidebarBg = dark
        ? 'linear-gradient(180deg, rgba(16,22,38,0.66) 0%, rgba(11,16,30,0.56) 100%)'
        : 'linear-gradient(180deg, rgba(255,255,255,0.64) 0%, rgba(246,249,255,0.48) 100%)';
      const composerBg = dark
        ? 'linear-gradient(145deg, rgba(28,35,58,0.72) 0%, rgba(16,22,38,0.58) 54%, rgba(24,31,52,0.68) 100%)'
        : 'linear-gradient(145deg, rgba(255,255,255,0.76) 0%, rgba(246,249,255,0.56) 54%, rgba(240,245,255,0.66) 100%)';
      const bubbleBg = dark
        ? 'linear-gradient(135deg, rgba(40,52,86,0.74) 0%, rgba(26,34,58,0.62) 100%)'
        : 'linear-gradient(135deg, rgba(255,255,255,0.82) 0%, rgba(242,247,255,0.66) 100%)';
      const cardBg = dark
        ? 'linear-gradient(145deg, rgba(22,29,48,0.68) 0%, rgba(14,19,34,0.56) 100%)'
        : 'linear-gradient(145deg, rgba(255,255,255,0.74) 0%, rgba(246,249,255,0.58) 100%)';
      const readingBg = dark
        ? 'linear-gradient(160deg, rgba(14,19,33,0.62) 0%, rgba(11,15,27,0.52) 100%)'
        : 'linear-gradient(160deg, rgba(255,255,255,0.66) 0%, rgba(248,250,255,0.54) 100%)';
      const rim = dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.82)';
      const innerTop = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.95)';
      const innerBot = dark ? 'rgba(129,140,248,0.18)' : 'rgba(99,102,241,0.13)';
      const shadow = dark
        ? '0 16px 42px rgba(0,0,0,0.44), 0 2px 10px rgba(0,0,0,0.24)'
        : '0 14px 36px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.05)';
      const softShadow = dark
        ? '0 10px 26px rgba(0,0,0,0.34)'
        : '0 8px 24px rgba(15,23,42,0.08)';

      cssParts.push(`
        /* Top Menu Bar - Single-Layer Liquid Glass Ribbon (z-index: 90 keeps menu dropdowns above sidebar & monitor!) */
        .shrink-0.flex.bg-sidebar {
          position: relative !important;
          z-index: 90 !important;
          background: ${titleBg} !important;
          backdrop-filter: blur(${Math.max(12, blurPx - 4)}px) saturate(${satPct}%) !important;
          border-bottom: 1px solid ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.62)'} !important;
          box-shadow: inset 0 -1px 0 ${dark ? 'rgba(0,0,0,0.25)' : 'rgba(15,23,42,0.04)'} !important;
        }
        [data-testid="title-menu-bar"] {
          background: transparent !important;
          backdrop-filter: none !important;
          border: 0 !important;
          box-shadow: none !important;
        }
        /* Left Sidebar - Unified Liquid Glass Column */
        [data-testid="sidebar-split"] > div:first-child .bg-sidebar.h-full {
          background: ${sidebarBg} !important;
          backdrop-filter: blur(${blurPx}px) saturate(${satPct}%) !important;
          border-right: 1px solid ${dark ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.7)'} !important;
          box-shadow: inset -1px 0 0 ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)'} !important;
        }
        /* Sidebar New Conversation & Active Row - Liquid Glass Pills */
        [data-testid="sidebar-split"] > div:first-child .bg-background,
        [data-testid="sidebar-split"] > div:first-child .bg-card {
          background: ${dark ? 'rgba(255,255,255,0.085)' : 'rgba(255,255,255,0.68)'} !important;
          border: 1px solid ${dark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.84)'} !important;
          box-shadow: ${dark ? 'inset 0 1px 0 rgba(255,255,255,0.14)' : '0 2px 8px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.92)'} !important;
          backdrop-filter: blur(12px) saturate(160%) !important;
        }
        [data-testid="conversation-row-sidebar"][data-active="true"],
        [data-testid="conversation-row-sidebar"][aria-current="page"],
        [data-testid="conversation-row-sidebar"].bg-onyx-selected {
          background: ${dark ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.72)'} !important;
          box-shadow: inset 0 1px 0 ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.9)'} !important;
        }
        /* Floating Liquid Glass Composer Dock */
        [data-testid="agent-input-box"] {
          background: transparent !important;
          backdrop-filter: none !important;
        }
        .surface-composer {
          background: transparent !important;
          padding: 0 !important;
          border-radius: 22px !important;
        }
        .surface-composer-card {
          background: ${composerBg} !important;
          backdrop-filter: blur(${blurPx}px) saturate(${satPct}%) brightness(${dark ? 1.04 : 1.05}) !important;
          border: 1px solid ${rim} !important;
          border-radius: 21px !important;
          box-shadow: ${shadow}, inset 0 1.5px 1px ${innerTop}, inset 0 -1px 2px ${innerBot} !important;
          transition: box-shadow .2s ease, border-color .2s ease !important;
        }
        .surface-composer-card:focus-within {
          border-color: ${dark ? 'rgba(129,140,248,0.52)' : 'rgba(99,102,241,0.45)'} !important;
          box-shadow: ${shadow}, 0 0 0 1px ${dark ? 'rgba(129,140,248,0.25)' : 'rgba(99,102,241,0.18)'}, inset 0 1.5px 1px ${innerTop} !important;
        }
        /* User Message Bubble - Liquid Glass Droplet */
        [data-testid="user-message-bubble"],
        .agy-user-bubble {
          background: ${bubbleBg} !important;
          backdrop-filter: blur(${Math.max(12, blurPx - 4)}px) saturate(${satPct}%) !important;
          border: 1px solid ${rim} !important;
          box-shadow: ${softShadow}, inset 0 1px 0 ${innerTop}, inset 0 -1px 1px ${innerBot} !important;
        }
        /* Cards: Artifacts, Changed Files, Live Task Checklists */
        .artifact-card,
        [data-testid="step-plan"],
        [data-testid="changed-files-card"] > div,
        [data-testid="changed-files-card-header"] {
          background: ${cardBg} !important;
          backdrop-filter: blur(${Math.max(12, blurPx - 6)}px) saturate(${satPct}%) !important;
          border-color: ${rim} !important;
          box-shadow: ${softShadow}, inset 0 1px 0 ${innerTop} !important;
        }
        ${readingOn && hasWp ? `
        /* Soft Reading Glass Backdrop for AI Replies */
        [data-testid="planner-response-text"],
        [data-testid="agent-response"] > div:has(> .prose, > .markdown-body) {
          background: ${readingBg} !important;
          backdrop-filter: blur(${Math.max(10, blurPx - 8)}px) saturate(145%) !important;
          border: 1px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.68)'} !important;
          border-radius: 16px !important;
          padding: 12px 16px !important;
          box-shadow: ${dark ? '0 8px 24px rgba(0,0,0,0.22)' : '0 6px 20px rgba(15,23,42,0.06)'}, inset 0 1px 0 ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)'} !important;
        }
        ` : ''}
        /* Crisp Code Blocks in Glass Mode */
        [data-testid="planner-response-text"] pre {
          background: ${dark ? 'rgba(9,13,24,0.78)' : 'rgba(248,250,255,0.82)'} !important;
          border: 1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)'} !important;
          border-radius: 12px !important;
        }
      `);
    } else if (glassStyle === 'frosted') {
      // Matte satin frosted glass: noticeably calmer, flatter, higher opacity & softer blur than Liquid Glass
      const fBg = dark ? 'rgba(18, 24, 39, 0.84)' : 'rgba(255, 255, 255, 0.84)';
      const fSide = dark ? 'rgba(14, 19, 32, 0.88)' : 'rgba(248, 250, 252, 0.88)';
      const fBorder = dark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(15, 23, 42, 0.11)';
      const fBlur = Math.max(8, Math.round(8 + strength * 6));
      cssParts.push(`
        .shrink-0.flex.bg-sidebar {
          position: relative !important;
          z-index: 90 !important;
          background: ${fSide} !important;
          backdrop-filter: blur(${fBlur}px) saturate(118%) !important;
          border-color: ${fBorder} !important;
          box-shadow: none !important;
        }
        [data-testid="title-menu-bar"] {
          background: transparent !important;
          backdrop-filter: none !important;
          border: 0 !important;
          box-shadow: none !important;
        }
        [data-testid="sidebar-split"] > div:first-child .bg-sidebar.h-full {
          background: ${fSide} !important;
          backdrop-filter: blur(${fBlur}px) saturate(118%) !important;
          border-color: ${fBorder} !important;
          box-shadow: none !important;
        }
        [data-testid="sidebar-split"] > div:first-child .bg-background,
        [data-testid="sidebar-split"] > div:first-child .bg-card {
          background: ${dark ? 'rgba(30, 38, 56, 0.84)' : 'rgba(255, 255, 255, 0.86)'} !important;
          border: 1px solid ${fBorder} !important;
          box-shadow: none !important;
          backdrop-filter: blur(8px) !important;
        }
        [data-testid="agent-input-box"] { background: transparent !important; backdrop-filter: none !important; }
        .surface-composer { background: transparent !important; padding: 0 !important; border-radius: 16px !important; }
        .surface-composer-card, [data-testid="user-message-bubble"], .agy-user-bubble,
        .artifact-card, [data-testid="step-plan"], [data-testid="changed-files-card"] > div, [data-testid="changed-files-card-header"] {
          background: ${fBg} !important;
          backdrop-filter: blur(${fBlur}px) saturate(118%) !important;
          border: 1px solid ${fBorder} !important;
          box-shadow: 0 4px 14px rgba(0, 0, 0, ${dark ? '0.26' : '0.06'}) !important;
        }
        ${readingOn && hasWp ? `
        [data-testid="planner-response-text"],
        [data-testid="agent-response"] > div:has(> .prose, > .markdown-body) {
          background: ${dark ? 'rgba(16, 22, 36, 0.82)' : 'rgba(255, 255, 255, 0.84)'} !important;
          backdrop-filter: blur(${fBlur}px) !important;
          border: 1px solid ${fBorder} !important;
          border-radius: 14px !important;
          padding: 12px 15px !important;
          box-shadow: none !important;
        }
        ` : ''}
      `);
    } else if (glassStyle === 'solid') {
      // Pure solid opaque chrome: zero backdrop-filter, crisp opaque panels & cards
      const sSide = dark ? '#0f1422' : '#f8fafc';
      const sCard = dark ? '#161e31' : '#ffffff';
      const sBubble = dark ? '#1e2942' : '#f1f5f9';
      const sBorder = dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.12)';
      cssParts.push(`
        .shrink-0.flex.bg-sidebar {
          position: relative !important;
          z-index: 90 !important;
          background: ${sSide} !important;
          backdrop-filter: none !important;
          border-color: ${sBorder} !important;
          box-shadow: none !important;
        }
        [data-testid="title-menu-bar"] {
          background: transparent !important;
          backdrop-filter: none !important;
          border: 0 !important;
          box-shadow: none !important;
        }
        [data-testid="sidebar-split"] > div:first-child .bg-sidebar.h-full {
          background: ${sSide} !important;
          backdrop-filter: none !important;
          border-color: ${sBorder} !important;
          box-shadow: none !important;
        }
        [data-testid="sidebar-split"] > div:first-child .bg-background,
        [data-testid="sidebar-split"] > div:first-child .bg-card {
          background: ${sCard} !important;
          border: 1px solid ${sBorder} !important;
          backdrop-filter: none !important;
          box-shadow: none !important;
        }
        [data-testid="agent-input-box"] { background: transparent !important; backdrop-filter: none !important; }
        .surface-composer { background: transparent !important; padding: 0 !important; border-radius: 16px !important; }
        .surface-composer-card, .artifact-card, [data-testid="step-plan"],
        [data-testid="changed-files-card"] > div, [data-testid="changed-files-card-header"] {
          background: ${sCard} !important;
          backdrop-filter: none !important;
          border: 1px solid ${sBorder} !important;
          box-shadow: 0 2px 10px rgba(0, 0, 0, ${dark ? '0.28' : '0.05'}) !important;
        }
        [data-testid="user-message-bubble"], .agy-user-bubble {
          background: ${sBubble} !important;
          backdrop-filter: none !important;
          border: 1px solid ${sBorder} !important;
          box-shadow: none !important;
        }
        ${readingOn && hasWp ? `
        [data-testid="planner-response-text"],
        [data-testid="agent-response"] > div:has(> .prose, > .markdown-body) {
          background: ${sCard} !important;
          backdrop-filter: none !important;
          border: 1px solid ${sBorder} !important;
          border-radius: 14px !important;
          padding: 12px 16px !important;
          box-shadow: none !important;
        }
        ` : ''}
      `);
    }

    // 4. Crisp topbar menu dropdowns, Monitor z-index layering above aux toggle, & suppress stray tooltip when popover is open
    cssParts.push(`
      [data-testid="title-menu-bar"] .border-menu-border {
        background: ${dark ? 'rgba(18, 24, 38, 0.94)' : 'rgba(255, 255, 255, 0.96)'} !important;
        backdrop-filter: blur(18px) saturate(160%) !important;
        border-color: ${dark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.12)'} !important;
        box-shadow: ${dark ? '0 14px 36px rgba(0, 0, 0, 0.5)' : '0 10px 28px rgba(15, 23, 42, 0.14)'} !important;
      }
      html[data-agy-monitor-open="1"] .agy-sheet {
        z-index: 60 !important;
      }
      html[data-agy-beautify-popover-open="1"] [role="tooltip"],
      html[data-agy-beautify-popover-open="1"] .react-tooltip {
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `);

    wpStyle.textContent = cssParts.join('\n');
  };

  // ---------------- Module 2: Auto Chinese Localization ----------------
  const compiledPatterns = zhPatterns.map(([p, r]) => [new RegExp(p), r]);
  const origTextMap = new WeakMap();
  const origAttrMap = new WeakMap();
  const i18nSkipSelector = '[data-testid="planner-response-text"], [data-testid="user-message-content"], code, pre, textarea, input, [contenteditable="true"], #agy-beautify-model-host, #agy-beautify-studio-host, #agy-beautify-capsule-host, #agy-beautify-menu-host, #agy-beautify-toast-host, #agy-beautify-monitor-nav, #agy-beautify-monitor-overlay';

  const translateStr = raw => {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 90) return null;
    if (Object.prototype.hasOwnProperty.call(zhExact, trimmed)) {
      return raw.replace(trimmed, zhExact[trimmed]);
    }
    for (const [re, rep] of compiledPatterns) {
      if (re.test(trimmed)) return raw.replace(trimmed, trimmed.replace(re, rep));
    }
    return null;
  };

  const runLocalization = (root = document.body) => {
    if (!root || settings.autoChinese === false) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest(i18nSkipSelector)) continue;
      const cur = node.nodeValue || '';
      const translated = translateStr(cur);
      if (translated && translated !== cur) {
        if (!origTextMap.has(node)) origTextMap.set(node, cur);
        node.nodeValue = translated;
      }
    }
    for (const el of root.querySelectorAll?.('[aria-label], [placeholder]') || []) {
      if (el.closest(i18nSkipSelector)) continue;
      for (const attr of ['aria-label', 'placeholder']) {
        const val = el.getAttribute(attr);
        if (!val) continue;
        const t = translateStr(val);
        if (t && t !== val) {
          let rec = origAttrMap.get(el);
          if (!rec) { rec = {}; origAttrMap.set(el, rec); }
          if (!(attr in rec)) rec[attr] = val;
          el.setAttribute(attr, t);
        }
      }
    }
  };

  const restoreLocalization = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (origTextMap.has(node)) {
        node.nodeValue = origTextMap.get(node);
        origTextMap.delete(node);
      }
    }
    for (const el of document.querySelectorAll('[aria-label], [placeholder]')) {
      const rec = origAttrMap.get(el);
      if (!rec) continue;
      for (const [k, v] of Object.entries(rec)) el.setAttribute(k, v);
      origAttrMap.delete(el);
    }
  };

  let i18nRaf = 0;
  const i18nObserver = new MutationObserver(() => {
    if (disposed || settings.autoChinese === false || i18nRaf) return;
    i18nRaf = requestAnimationFrame(() => {
      i18nRaf = 0;
      if (!disposed && settings.autoChinese !== false) runLocalization(document.body);
    });
  });
  i18nObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  // ---------------- Module 1: Gemini Starlight Liquid Glass Model & Effort Picker ----------------
  const TIER_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'extra', 'extra high', 'xhigh', 'max', 'ultra'];
  const TIER_RE = /^(.*?)\s*\((off|minimal|low|medium|high|extra\s+high|extra|xhigh|max|ultra)(?:\s+thinking)?\)$/i;

  const formatTierDisplay = tier => {
    const k = String(tier || '').toLowerCase().trim();
    if (k === 'xhigh' || k === 'extra' || k === 'extra high') return 'XHigh';
    if (k === 'max' || k === 'ultra') return 'Ultra';
    if (k === 'high') return 'High';
    if (k === 'medium') return 'Medium';
    if (k === 'low') return 'Low';
    if (k === 'minimal') return 'Minimal';
    if (k === 'off') return 'Off';
    return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Standard';
  };

  const tierRank = tier => {
    const idx = TIER_ORDER.indexOf(String(tier || '').toLowerCase().trim());
    return idx === -1 ? 50 : idx;
  };

  const modelAccentColor = name => {
    const n = String(name || '').toLowerCase();
    if (n.includes('neon')) return '#818cf8';
    if (n.includes('hydrogen')) return '#38bdf8';
    if (n.includes('argon')) return '#2dd4bf';
    if (n.includes('carbon')) return '#34d399';
    if (n.includes('claude')) return '#fb923c';
    return '#60a5fa';
  };

  const readPickerState = trigger => {
    if (!trigger) return null;
    const key = Object.keys(trigger).find(k => k.startsWith('__reactFiber$'));
    let fiber = key && trigger[key];
    if (!fiber) return null;
    if (fiber.alternate) {
      let root = fiber;
      while (root.return) root = root.return;
      if (root.stateNode?.current && root !== root.stateNode.current) fiber = fiber.alternate;
    }

    let selector = null;
    let legacyProvider = null;
    let conversationId = '';
    let plannerPreference;
    for (let node = fiber; node; node = node.return) {
      const props = node.memoizedProps;
      if (!props || typeof props !== 'object') continue;
      if (!conversationId && 'conversationId' in props && typeof props.conversationId === 'string') {
        conversationId = props.conversationId;
      }
      const cand = props.value && typeof props.value === 'object' ? props.value : props;
      if (!selector && typeof cand.setSelectedModel === 'function' && cand.selectedModel && Array.isArray(cand.modelOptions)) {
        selector = cand;
      }
      if (selector?.orchestratorPick && plannerPreference === undefined && typeof props.value?.getState === 'function') {
        plannerPreference = props.value.getState()?.getPrefValue?.('orchestratorModel');
      }
      if (!legacyProvider && typeof props.value?.getModelConfigForConversation === 'function' && typeof props.value?.setModelConfigByLabelForConversation === 'function') {
        legacyProvider = props.value;
      }
    }

    const usable = list => {
      const map = new Map();
      for (const opt of list || []) {
        if (!opt || opt.disabled || opt.isDisabled || opt.isAvailable === false || opt.isHidden) continue;
        if (typeof opt.label !== 'string' || !opt.label.trim()) continue;
        if (!map.has(opt.label)) map.set(opt.label, opt);
      }
      return map;
    };

    const buildFamilies = (byLabel, skipOrchestrator) => {
      const isOrch = opt => /^(gemini-pro-coordinator|gemini-pro-orchestrator(?:-.+)?)$/.test(opt?.modelId || '');
      const famMap = new Map();
      for (const [label, opt] of byLabel) {
        if (skipOrchestrator && isOrch(opt)) continue;
        const m = TIER_RE.exec(label);
        const famName = m ? m[1].trim() : label;
        const tier = m ? m[2].trim() : null;
        if (!famMap.has(famName)) famMap.set(famName, { name: famName, tiers: [] });
        famMap.get(famName).tiers.push({ label, tier, opt });
      }
      for (const fam of famMap.values()) {
        fam.tiers.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
      }
      return [...famMap.values()];
    };

    if (selector) {
      const byLabel = usable(selector.modelOptions);
      let selected = selector.selectedModel?.label || '';
      if (!byLabel.has(selected)) return null;
      const selectedOpt = byLabel.get(selected);
      const isOrch = opt => /^(gemini-pro-coordinator|gemini-pro-orchestrator(?:-.+)?)$/.test(opt?.modelId || '');
      const orchRoot = [...byLabel.values()].find(opt => isOrch(opt));
      const pick = selector.orchestratorPick;
      const plannerOpts = Array.isArray(selector.orchestratorPlanners) ? usable(selector.orchestratorPlanners) : new Map();

      let orchestrator = null;
      if (orchRoot && typeof pick?.select === 'function' && plannerOpts.size && !selector.bestOfNConfig?.isBestOfNEnabled) {
        const defaultPlanner = [...plannerOpts.values()].find(o => o.value === plannerPreference)
          ?? plannerOpts.get(selector.orchestratorDefaultPlanner?.label);
        const currentPlanner = [...plannerOpts.values()].find(o => o.value === pick.model) ?? defaultPlanner;
        const active = isOrch(selectedOpt);
        const plannerByLabel = new Map();
        for (const o of plannerOpts.values()) plannerByLabel.set(o.label, o);
        if (active && currentPlanner) selected = currentPlanner.label;
        orchestrator = {
          active,
          supported: true,
          canToggleFor(label) { return plannerByLabel.has(label); },
          toggle(currentLabel) {
            if (active) {
              const standalone = byLabel.get(currentLabel);
              if (standalone) return selector.setSelectedModel(standalone);
            } else {
              const targetPlanner = plannerByLabel.get(currentLabel) || currentPlanner || defaultPlanner;
              if (targetPlanner) {
                pick.select(targetPlanner.value === defaultPlanner?.value ? 0 : targetPlanner.value);
                return selector.setSelectedModel(orchRoot);
              }
            }
          },
          choosePlanner(label) {
            const p = plannerByLabel.get(label);
            if (p) {
              pick.select(p.value === defaultPlanner?.value ? 0 : p.value);
              return selector.setSelectedModel(orchRoot);
            }
          },
        };
      }

      const families = buildFamilies(byLabel, Boolean(orchestrator));
      return {
        families,
        selected,
        orchestrator,
        choose(label) {
          if (orchestrator?.active && orchestrator.canToggleFor(label)) return orchestrator.choosePlanner(label);
          const opt = byLabel.get(label);
          if (opt) return selector.setSelectedModel(opt);
        },
      };
    }

    if (legacyProvider && conversationId) {
      const byLabel = usable(legacyProvider.visibleModelConfigs);
      const selected = legacyProvider.getModelConfigForConversation(conversationId)?.label || '';
      if (!byLabel.has(selected)) return null;
      return {
        families: buildFamilies(byLabel, false),
        selected,
        orchestrator: null,
        choose(label) { return legacyProvider.setModelConfigByLabelForConversation(label, conversationId, false); },
      };
    }
    return null;
  };

  let modelPopoverHost = null;
  let allowNativeModelMenuUntil = 0;
  let suppressTriggerClickUntil = 0;

  const syncPopoverFlag = () => {
    if (modelPopoverHost || studioPopoverHost) {
      document.documentElement.setAttribute('data-agy-beautify-popover-open', '1');
    } else {
      document.documentElement.removeAttribute('data-agy-beautify-popover-open');
    }
  };

  const closeModelPopover = () => {
    if (modelPopoverHost) {
      modelPopoverHost.remove();
      modelPopoverHost = null;
    }
    document.removeEventListener('pointerdown', onModelOutsideDown, true);
    document.removeEventListener('keydown', onModelKeyDown, true);
    syncPopoverFlag();
  };
  const onModelOutsideDown = ev => {
    if (!modelPopoverHost) return;
    if (ev.target === modelPopoverHost || modelPopoverHost.contains(ev.target)) return;
    if (ev.target instanceof Element && ev.target.closest('button[data-testid="model-selector-trigger"]')) return;
    closeModelPopover();
  };
  const onModelKeyDown = ev => {
    if (ev.key === 'Escape') closeModelPopover();
  };

  const openGeminiModelPopover = trigger => {
    if (modelPopoverHost) {
      closeModelPopover();
      return;
    }
    closeStudioPopover();
    if (trigger.getAttribute('aria-expanded') === 'true') {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    const state = readPickerState(trigger);
    if (!state || !state.families.length) return;

    const findCurrent = () => {
      for (const fam of state.families) {
        const idx = fam.tiers.findIndex(t => t.label === state.selected);
        if (idx !== -1) return { fam, idx };
      }
      return { fam: state.families[0], idx: 0 };
    };

    let { fam: activeFam, idx: activeIdx } = findCurrent();
    let listOpen = false;
    let previewIdx = activeIdx;

    modelPopoverHost = document.createElement('div');
    modelPopoverHost.id = 'agy-beautify-model-host';
    modelPopoverHost.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
    const shadow = modelPopoverHost.attachShadow({ mode: 'open' });
    const dark = isDarkTheme();
    const isLiquid = (settings.glassStyle || 'liquid') === 'liquid';

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      @keyframes starDrift {
        0% { background-position: 0 0, 12px 4px, 24px -4px, 6px 8px, 18px -2px, 0% 50%; }
        50% { background-position: 22px -3px, 34px 7px, 10px 5px, 28px -3px, 36px 4px, 100% 50%; }
        100% { background-position: 44px 0, 56px 4px, 24px -4px, 50px 8px, 58px -2px, 0% 50%; }
      }
      @keyframes cardIn {
        from { opacity: 0; transform: translateY(6px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .card {
        position: fixed;
        width: 262px;
        pointer-events: auto;
        border-radius: 19px;
        padding: 11px 13px 11px;
        font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
        background: ${dark
          ? (isLiquid ? 'linear-gradient(145deg, rgba(28,34,56,0.78), rgba(16,20,36,0.68))' : 'rgba(20, 23, 36, 0.92)')
          : (isLiquid ? 'linear-gradient(145deg, rgba(255,255,255,0.82), rgba(244,248,255,0.68))' : 'rgba(248, 250, 255, 0.94)')};
        border: 1px solid ${dark
          ? (isLiquid ? 'rgba(255,255,255,0.18)' : 'rgba(139,92,246,0.26)')
          : (isLiquid ? 'rgba(255,255,255,0.88)' : 'rgba(99,102,241,0.18)')};
        box-shadow: ${dark
          ? '0 20px 48px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 2px rgba(129,140,248,0.18)'
          : '0 16px 38px rgba(15,23,42,0.15), inset 0 1.5px 1px rgba(255,255,255,0.96), inset 0 -1px 2px rgba(99,102,241,0.12)'};
        backdrop-filter: blur(26px) saturate(195%);
        color: ${dark ? '#f8fafc' : '#0f172a'};
        animation: cardIn 140ms cubic-bezier(.16,1,.3,1);
        user-select: none;
      }
      .top-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-bottom: 9px;
      }
      .icon-btn {
        position: relative;
        width: 28px;
        height: 28px;
        border-radius: 9px;
        border: 1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.65)'};
        background: ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.045)'};
        color: ${dark ? '#cbd5e1' : '#475569'};
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: all .16s ease;
        flex-shrink: 0;
        padding: 0;
      }
      .icon-btn:hover {
        background: ${dark ? 'rgba(99,102,241,0.24)' : 'rgba(79,70,229,0.11)'};
        color: ${dark ? '#e0e7ff' : '#4338ca'};
      }
      .icon-btn.active {
        background: linear-gradient(135deg, rgba(59,130,246,0.25), rgba(124,58,237,0.32));
        border-color: rgba(129,140,248,0.52);
        color: ${dark ? '#c4b5fd' : '#6d28d9'};
        box-shadow: 0 0 10px rgba(124,58,237,0.28);
      }
      .icon-btn.disabled { opacity: 0.36; cursor: default; }
      .bolt-tip {
        position: absolute;
        left: -4px;
        bottom: calc(100% + 8px);
        padding: 5px 9px;
        border-radius: 10px;
        background: ${dark ? 'rgba(20,25,42,0.94)' : 'rgba(255,255,255,0.95)'};
        border: 1px solid ${dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.09)'};
        box-shadow: 0 8px 20px rgba(0,0,0,0.18);
        backdrop-filter: blur(16px);
        color: ${dark ? '#f1f5f9' : '#1e293b'};
        font-size: 11px;
        line-height: 1.35;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transform: translateY(3px);
        transition: opacity .14s ease, transform .14s ease;
      }
      .bolt-tip b { display: block; font-weight: 600; color: ${dark ? '#a5b4fc' : '#4f46e5'}; }
      .icon-btn:hover .bolt-tip { opacity: 1; transform: translateY(0); }
      .center-btn {
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        text-align: center;
        padding: 2px 4px;
        border-radius: 8px;
        transition: background .14s ease;
      }
      .center-btn:hover { background: ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)'}; }
      .tier-title {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: -0.01em;
        line-height: 1.2;
        background: linear-gradient(90deg, ${dark ? '#60a5fa, #a78bfa, #38bdf8' : '#2563eb, #7c3aed, #0284c7'});
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .model-sub {
        font-size: 11px;
        line-height: 1.25;
        color: ${dark ? '#94a3b8' : '#64748b'};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 1px;
      }
      .slider-shell {
        position: relative;
        height: 20px;
        border-radius: 999px;
        background: ${dark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(15, 23, 42, 0.085)'};
        box-shadow: inset 0 1px 2px ${dark ? 'rgba(0,0,0,0.45)' : 'rgba(15,23,42,0.1)'};
        cursor: pointer;
        touch-action: none;
        overflow: hidden;
      }
      .slider-fill {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        border-radius: 999px;
        background-image:
          radial-gradient(circle at 14% 34%, rgba(255,255,255,0.95) 0 0.85px, transparent 1.3px),
          radial-gradient(circle at 32% 72%, rgba(224,242,254,0.88) 0 0.75px, transparent 1.2px),
          radial-gradient(circle at 54% 28%, rgba(255,255,255,0.92) 0 0.95px, transparent 1.4px),
          radial-gradient(circle at 71% 68%, rgba(196,181,253,0.9) 0 0.8px, transparent 1.25px),
          radial-gradient(circle at 86% 38%, rgba(255,255,255,0.95) 0 0.85px, transparent 1.3px),
          linear-gradient(90deg, #2563eb 0%, #4f46e5 38%, #7c3aed 76%, #2563eb 100%);
        background-size: 44px 20px, 58px 20px, 50px 20px, 66px 20px, 40px 20px, 200% 100%;
        animation: starDrift 8s linear infinite;
        transition: width 100ms cubic-bezier(.22,1,.36,1);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.32), 0 0 12px rgba(99, 102, 241, 0.34);
      }
      .slider-ticks { position: absolute; inset: 0; pointer-events: none; }
      .tick {
        position: absolute;
        top: 50%;
        width: 3px;
        height: 3px;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        background: ${dark ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.52)'};
      }
      .slider-thumb {
        position: absolute;
        top: 50%;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: 0 1px 4px rgba(15,23,42,0.28), 0 0 0 0.5px rgba(15,23,42,0.08);
        transform: translate(-50%, -50%);
        transition: left 100ms cubic-bezier(.22,1,.36,1), transform 120ms ease;
        pointer-events: none;
      }
      .slider-shell:hover .slider-thumb { transform: translate(-50%, -50%) scale(1.07); }
      .tier-labels {
        display: flex;
        justify-content: space-between;
        margin-top: 5px;
        padding: 0 2px;
      }
      .tier-lbl {
        border: 0;
        background: transparent;
        padding: 1px 3px;
        border-radius: 5px;
        font-family: inherit;
        font-size: 10px;
        color: ${dark ? '#94a3b8' : '#64748b'};
        cursor: pointer;
        transition: color .14s ease, background .14s ease;
      }
      .tier-lbl:hover {
        color: ${dark ? '#e2e8f0' : '#1e293b'};
        background: ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)'};
      }
      .tier-lbl.on {
        color: ${dark ? '#93c5fd' : '#4f46e5'};
        font-weight: 600;
      }
      .family-list {
        margin-top: 8px;
        padding-top: 7px;
        border-top: 1px solid ${dark ? 'rgba(255,255,255,0.11)' : 'rgba(15,23,42,0.08)'};
        max-height: 204px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .fam-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        width: 100%;
        border: 0;
        background: transparent;
        color: inherit;
        border-radius: 8px;
        padding: 5px 7px;
        font-size: 12px;
        cursor: pointer;
        text-align: left;
      }
      .fam-item:hover { background: ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)'}; }
      .fam-item.active {
        background: ${dark ? 'rgba(79,70,229,0.26)' : 'rgba(79,70,229,0.11)'};
        font-weight: 600;
      }
      .fam-left { display: flex; align-items: center; gap: 7px; min-width: 0; }
      .fam-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
      .fam-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .fam-count { font-size: 10px; color: ${dark ? '#94a3b8' : '#64748b'}; flex-shrink: 0; }
      .native-link {
        margin-top: 4px;
        padding: 5px 7px;
        border: 0;
        border-top: 1px solid ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.06)'};
        background: transparent;
        color: ${dark ? '#94a3b8' : '#64748b'};
        font-size: 10.5px;
        cursor: pointer;
        text-align: center;
        width: 100%;
      }
      .native-link:hover { color: ${dark ? '#e2e8f0' : '#0f172a'}; }
    `;

    const card = document.createElement('div');
    card.className = 'card';

    const applySliderPosition = (fillEl, thumbEl, ratio) => {
      const r = Math.max(0, Math.min(1, ratio));
      fillEl.style.width = `calc(20px + (100% - 20px) * ${r})`;
      thumbEl.style.left = `calc(10px + (100% - 20px) * ${r})`;
    };

    const renderCard = () => {
      card.innerHTML = '';
      const tiers = activeFam.tiers;
      const curTier = tiers[previewIdx] || tiers[0];
      const count = tiers.length;
      const ratio = count <= 1 ? 1 : previewIdx / (count - 1);
      const orch = state.orchestrator;
      const orchSupported = Boolean(orch?.supported && orch.canToggleFor(curTier.label));
      const orchActive = Boolean(orch?.active);

      const topRow = document.createElement('div');
      topRow.className = 'top-row';

      const boltBtn = document.createElement('button');
      boltBtn.type = 'button';
      boltBtn.className = 'icon-btn' + (orchActive ? ' active' : '') + (!orchSupported && !orchActive ? ' disabled' : '');
      boltBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4.5 13.5h6.5L10 22l9.5-12h-6.5L13 2z"/></svg>`;
      const tip = document.createElement('div');
      tip.className = 'bolt-tip';
      tip.innerHTML = orchActive
        ? '<b>2x Orchestrator</b>常规步骤提速中'
        : orchSupported
          ? '<b>2x speed</b>开启 Orchestrator 提速'
          : '<b>Gemini Starlight</b>当前模型直连运行';
      boltBtn.appendChild(tip);
      boltBtn.onclick = () => {
        if (!orchSupported && !orchActive) return;
        orch.toggle(curTier.label);
        closeModelPopover();
        showToast(orchActive ? '已关闭 Orchestrator 加速模式' : '已开启 Orchestrator 加速模式');
      };

      const centerBtn = document.createElement('button');
      centerBtn.type = 'button';
      centerBtn.className = 'center-btn';
      centerBtn.title = '点击展开全部模型列表';
      const tierTitle = document.createElement('div');
      tierTitle.className = 'tier-title';
      tierTitle.textContent = `${formatTierDisplay(curTier.tier)} ${listOpen ? '▾' : '›'}`;
      const modelSub = document.createElement('div');
      modelSub.className = 'model-sub';
      modelSub.textContent = (orchActive ? '⚡ ' : '') + activeFam.name;
      centerBtn.append(tierTitle, modelSub);
      centerBtn.onclick = () => {
        listOpen = !listOpen;
        renderCard();
        repositionCard();
      };

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'icon-btn';
      resetBtn.title = '重置思考强度为默认档位';
      resetBtn.innerHTML = `<svg width="13.5" height="13.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`;
      resetBtn.onclick = () => {
        const defIdx = Math.max(0, tiers.findIndex(t => /^(high|medium)$/i.test(t.tier || '')));
        previewIdx = defIdx;
        activeIdx = defIdx;
        state.choose(tiers[defIdx].label);
        renderCard();
      };

      topRow.append(boltBtn, centerBtn, resetBtn);
      card.appendChild(topRow);

      const sliderShell = document.createElement('div');
      sliderShell.className = 'slider-shell';
      sliderShell.tabIndex = 0;

      const fill = document.createElement('div');
      fill.className = 'slider-fill';

      const ticks = document.createElement('div');
      ticks.className = 'slider-ticks';
      if (count > 1) {
        for (let i = 0; i < count; i++) {
          const dot = document.createElement('span');
          dot.className = 'tick';
          dot.style.left = `calc(10px + (100% - 20px) * ${i / (count - 1)})`;
          ticks.appendChild(dot);
        }
      }

      const thumb = document.createElement('div');
      thumb.className = 'slider-thumb';
      applySliderPosition(fill, thumb, ratio);
      sliderShell.append(fill, ticks, thumb);

      const idxFromClientX = clientX => {
        if (count <= 1) return 0;
        const rect = sliderShell.getBoundingClientRect();
        const norm = Math.max(0, Math.min(1, (clientX - rect.left - 10) / Math.max(1, rect.width - 20)));
        return Math.round(norm * (count - 1));
      };

      let dragging = false;
      const updatePreview = nextIdx => {
        if (nextIdx === previewIdx) return;
        previewIdx = nextIdx;
        applySliderPosition(fill, thumb, count <= 1 ? 1 : previewIdx / (count - 1));
        tierTitle.textContent = `${formatTierDisplay(tiers[previewIdx].tier)} ${listOpen ? '▾' : '›'}`;
      };
      sliderShell.onpointerdown = ev => {
        if (count <= 1) return;
        dragging = true;
        sliderShell.setPointerCapture(ev.pointerId);
        updatePreview(idxFromClientX(ev.clientX));
      };
      sliderShell.onpointermove = ev => {
        if (!dragging || count <= 1) return;
        updatePreview(idxFromClientX(ev.clientX));
      };
      sliderShell.onpointerup = ev => {
        if (!dragging) return;
        dragging = false;
        try { sliderShell.releasePointerCapture(ev.pointerId); } catch {}
        activeIdx = previewIdx;
        state.choose(tiers[activeIdx].label);
        renderCard();
      };
      sliderShell.onkeydown = ev => {
        if (count <= 1) return;
        if (ev.key === 'ArrowLeft' && previewIdx > 0) {
          ev.preventDefault();
          previewIdx--;
          activeIdx = previewIdx;
          state.choose(tiers[activeIdx].label);
          renderCard();
        } else if (ev.key === 'ArrowRight' && previewIdx < count - 1) {
          ev.preventDefault();
          previewIdx++;
          activeIdx = previewIdx;
          state.choose(tiers[activeIdx].label);
          renderCard();
        }
      };

      card.appendChild(sliderShell);

      if (count > 1) {
        const labelsRow = document.createElement('div');
        labelsRow.className = 'tier-labels';
        tiers.forEach((t, i) => {
          const sp = document.createElement('button');
          sp.type = 'button';
          sp.className = 'tier-lbl' + (i === previewIdx ? ' on' : '');
          sp.textContent = formatTierDisplay(t.tier);
          sp.onclick = () => {
            previewIdx = i;
            activeIdx = i;
            state.choose(tiers[i].label);
            renderCard();
          };
          labelsRow.appendChild(sp);
        });
        card.appendChild(labelsRow);
      }

      if (listOpen) {
        const list = document.createElement('div');
        list.className = 'family-list';
        for (const fam of state.families) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'fam-item' + (fam.name === activeFam.name ? ' active' : '');
          const left = document.createElement('span');
          left.className = 'fam-left';
          const dot = document.createElement('span');
          dot.className = 'fam-dot';
          dot.style.background = modelAccentColor(fam.name);
          const nm = document.createElement('span');
          nm.className = 'fam-name';
          nm.textContent = fam.name;
          left.append(dot, nm);
          const cnt = document.createElement('span');
          cnt.className = 'fam-count';
          cnt.textContent = fam.tiers.length > 1 ? `${fam.tiers.length} 档` : '单档';
          btn.append(left, cnt);
          btn.onclick = () => {
            const desiredTier = String(curTier.tier || '').toLowerCase();
            let nextIdx = fam.tiers.findIndex(t => String(t.tier || '').toLowerCase() === desiredTier);
            if (nextIdx === -1) nextIdx = Math.max(0, fam.tiers.findIndex(t => /high|medium/i.test(t.tier || '')));
            activeFam = fam;
            activeIdx = nextIdx;
            previewIdx = nextIdx;
            state.choose(fam.tiers[nextIdx].label);
            listOpen = false;
            renderCard();
            repositionCard();
          };
          list.appendChild(btn);
        }
        const nativeBtn = document.createElement('button');
        nativeBtn.type = 'button';
        nativeBtn.className = 'native-link';
        nativeBtn.textContent = '打开原生模型菜单 (或按住 Shift 点击)';
        nativeBtn.onclick = () => {
          closeModelPopover();
          allowNativeModelMenuUntil = Date.now() + 800;
          trigger.click();
        };
        list.appendChild(nativeBtn);
        card.appendChild(list);
      }
    };

    const repositionCard = () => {
      const tr = trigger.getBoundingClientRect();
      const inputBox = trigger.closest('[data-testid="agent-input-box"]') || document.querySelector('[data-testid="agent-input-box"]');
      const ir = inputBox?.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      const anchorTop = ir && ir.height > 0 ? Math.min(tr.top, ir.top) : tr.top;
      const preferredLeft = ir && ir.width > 0 ? Math.max(ir.left + 4, tr.left - 8) : tr.left;
      const left = Math.max(10, Math.min(window.innerWidth - cr.width - 10, preferredLeft));
      const top = Math.max(10, anchorTop - cr.height - 10);
      card.style.left = `${Math.round(left)}px`;
      card.style.top = `${Math.round(top)}px`;
    };

    shadow.append(style, card);
    document.documentElement.appendChild(modelPopoverHost);
    syncPopoverFlag();
    renderCard();
    repositionCard();
    document.addEventListener('pointerdown', onModelOutsideDown, true);
    document.addEventListener('keydown', onModelKeyDown, true);
  };

  const findModelTrigger = ev => {
    if (disposed || settings.geminiModelPicker === false || ev.shiftKey) return null;
    if (Date.now() < allowNativeModelMenuUntil) return null;
    const target = ev.target instanceof Element ? ev.target : ev.target?.parentElement;
    const trigger = target?.closest?.('button[data-testid="model-selector-trigger"]');
    if (!trigger) return null;
    const state = readPickerState(trigger);
    return state && state.families.length ? trigger : null;
  };

  const stopEvent = ev => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    ev.stopPropagation();
  };

  const onModelTriggerPointerDown = ev => {
    if (ev.button !== 0) return;
    const trigger = findModelTrigger(ev);
    if (!trigger) return;
    stopEvent(ev);
    suppressTriggerClickUntil = Date.now() + 600;
    openGeminiModelPopover(trigger);
  };
  const onModelTriggerMouseGuard = ev => {
    if (ev.button !== 0) return;
    const trigger = findModelTrigger(ev);
    if (!trigger) return;
    stopEvent(ev);
  };
  const onModelTriggerClick = ev => {
    const trigger = findModelTrigger(ev);
    if (!trigger) return;
    stopEvent(ev);
    if (Date.now() > suppressTriggerClickUntil) openGeminiModelPopover(trigger);
  };
  const onModelTriggerKeyDown = ev => {
    if (!['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(ev.key)) return;
    const trigger = findModelTrigger(ev);
    if (!trigger) return;
    stopEvent(ev);
    openGeminiModelPopover(trigger);
  };
  window.addEventListener('pointerdown', onModelTriggerPointerDown, true);
  window.addEventListener('mousedown', onModelTriggerMouseGuard, true);
  window.addEventListener('mouseup', onModelTriggerMouseGuard, true);
  window.addEventListener('click', onModelTriggerClick, true);
  window.addEventListener('keydown', onModelTriggerKeyDown, true);

  // ---------------- Module 3 + Quick Beautify Control Center (Liquid Glass) ----------------
  const fmtTok = n => {
    const v = Number(n) || 0;
    if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + 'B';
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(v >= 100_000 ? 0 : 1) + 'K';
    return String(v);
  };
  const fmtUsd = v => {
    const n = Number(v) || 0;
    if (n >= 1000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    if (n >= 0.01 || n === 0) return '$' + n.toFixed(2);
    return '$' + n.toFixed(4);
  };
  const fmtCny = v => '≈ ¥' + Math.round((Number(v) || 0) * 7.25).toLocaleString('en-US');
  const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtResetTime = (iso, compact = false) => {
    if (!iso) return '';
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return '';
    const diffMs = ts - Date.now();
    if (diffMs <= 60_000) return compact ? '即将' : '即将重置';
    const totalMin = Math.ceil(diffMs / 60_000);
    const days = Math.floor(totalMin / 1440);
    const hrs = Math.floor((totalMin % 1440) / 60);
    const mins = totalMin % 60;
    const d = new Date(ts);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (compact) {
      if (days > 0) return `${days}d${hrs}h`;
      if (hrs > 0) return mins > 0 ? `${hrs}h${String(mins).padStart(2, '0')}m` : `${hrs}h`;
      return `${mins}m`;
    }
    if (days > 0) return `${days}天${hrs}h 后 (${mmdd} ${hhmm})`;
    if (hrs > 0) return `${hrs}h${mins > 0 ? mins + 'm' : ''} 后 (${hhmm})`;
    return `${mins}m 后 (${hhmm})`;
  };
  const collectQuotaWindows = quotas => {
    const rows = [];
    for (const q of Array.isArray(quotas) ? quotas : []) {
      const ws = Array.isArray(q.windows) && q.windows.length
        ? q.windows
        : (typeof q.remainingFraction === 'number' ? [{ label: '', remainingFraction: q.remainingFraction, resetTime: q.resetTime || '' }] : []);
      const validWs = ws.filter(w => typeof w.remainingFraction === 'number');
      if (!validWs.length) continue;
      rows.push({
        name: q.name || 'Model Pool',
        windows: validWs.map(w => ({
          label: w.label || (w.window === '5h' ? '5 小时' : w.window === 'weekly' ? '周额度' : '配额'),
          window: w.window || '',
          pct: Math.max(0, Math.min(100, Math.round(w.remainingFraction * 100))),
          resetTime: w.resetTime || '',
        })),
      });
    }
    return rows;
  };
  const pickPrimaryReset = quotas => {
    const groups = collectQuotaWindows(quotas);
    const allWins = groups.flatMap(g => g.windows.map(w => ({ ...w, group: g.name, ts: Date.parse(w.resetTime || '') })));
    const active = allWins
      .filter(w => Number.isFinite(w.ts) && w.ts > Date.now())
      .sort((a, b) => a.ts - b.ts);
    return active[0] || null;
  };

  let studioPopoverHost = null;
  let studioActiveTab = 'beautify'; // 'beautify' | 'usage'
  let studioAnchorEl = null;

  const closeStudioPopover = () => {
    if (studioPopoverHost) {
      studioPopoverHost.remove();
      studioPopoverHost = null;
    }
    document.removeEventListener('pointerdown', onStudioOutsideDown, true);
    document.removeEventListener('keydown', onStudioKeyDown, true);
    syncPopoverFlag();
  };
  const onStudioOutsideDown = ev => {
    if (!studioPopoverHost) return;
    if (ev.target === studioPopoverHost || studioPopoverHost.contains(ev.target)) return;
    if (capsuleHost && (ev.target === capsuleHost || capsuleHost.contains(ev.target))) return;
    closeStudioPopover();
  };
  const onStudioKeyDown = ev => {
    if (ev.key === 'Escape') closeStudioPopover();
  };

  const wpSwatchStyle = wp => {
    if (wp.id === 'none') return 'background:linear-gradient(135deg,#e2e8f0,#f8fafc);color:#475569;';
    if (wp.id === 'liquid-prism-light') return 'background:linear-gradient(135deg,#dbeafe,#ede9fe,#cffafe);color:#1e3a8a;';
    if (wp.id === 'sakura-mist-light') return 'background:linear-gradient(135deg,#ffe4e6,#ffedd5,#dbeafe);color:#9f1239;';
    if (wp.id === 'deep-ocean-glass') return 'background:linear-gradient(135deg,#0c4a6e,#1e3a8a,#115e59);color:#e0f2fe;';
    if (wp.id === 'gemini-aurora') return 'background:linear-gradient(135deg,#1d4ed8,#7c3aed,#06b6d4);color:#fff;';
    if (wp.id === 'midnight-grid') return 'background:linear-gradient(135deg,#090d16,#1e293b);color:#7dd3fc;';
    return 'background:linear-gradient(135deg,#4f46e5,#0ea5e9);color:#fff;';
  };

  // ---------------- Module 7: Manual & Auto-Compact Context Engine ----------------
  let oneShotCompactPending = false;
  let oneShotCompactConvId = '';
  let autoCompactTimer = null;
  let autoCompactTimerKind = ''; // 'oneshot' | 'auto' | ''
  const lastCompactByConv = new Map(); // convId -> { at, reqCount }

  const readComposerControl = () => {
    const ib = document.querySelector('[data-testid="agent-input-box"]');
    if (!ib) return null;
    const fk = Object.keys(ib).find(k => k.startsWith('__reactFiber$'));
    let f = fk && ib[fk];
    if (f?.alternate) {
      let root = f;
      while (root.return) root = root.return;
      if (root.stateNode?.current && root !== root.stateNode.current) f = f.alternate;
    }
    let propsFound = null;
    for (let i = 0; f && i < 16; f = f.return, i++) {
      const p = f.memoizedProps;
      if (p && typeof p === 'object' && typeof p.handleSubmit === 'function') {
        propsFound = p;
        break;
      }
    }
    const hasCancelBtn = Boolean(document.querySelector('button[data-testid="input-cancel-button"]'));
    const isRunning = Boolean(propsFound?.isRunning) || hasCancelBtn;
    return { ib, props: propsFound, isRunning };
  };

  let wasAgentRunning = Boolean(readComposerControl()?.isRunning);

  const triggerCompactContext = async ({ auto = false } = {}) => {
    const ctrl = readComposerControl();
    if (!ctrl) {
      if (!auto) showToast('未找到当前对话输入框', true);
      return false;
    }
    if (ctrl.isRunning) {
      if (!auto) {
        if (oneShotCompactPending) {
          oneShotCompactPending = false;
          oneShotCompactConvId = '';
          showToast('已取消预约压缩');
        } else {
          oneShotCompactPending = true;
          oneShotCompactConvId = api.readConversationId() || '';
          showToast('当前正在回复中，已预约在本轮对话结束后自动压缩上下文');
        }
        if (studioPopoverHost) renderStudioContent();
      }
      return false;
    }

    const convId = api.readConversationId() || telemetry?.context?.conversationId || 'current';
    const reqCount = telemetry?.context?.requestCount || 0;
    lastCompactByConv.set(convId, { at: Date.now(), reqCount });
    oneShotCompactPending = false;
    oneShotCompactConvId = '';

    const p = ctrl.props;
    const compactDef = Array.isArray(p?.slashCommandItems)
      ? p.slashCommandItems.find(x => x?.info?.name === 'compact' || x?.title === 'compact')
      : null;
    if (typeof p?.handleSubmit === 'function' && compactDef?.info) {
      try {
        const chunk = {
          $typeName: 'exa.codeium_common_pb.TextOrScopeItem',
          chunk: {
            case: 'item',
            value: {
              $typeName: 'exa.codeium_common_pb.ContextScopeItem',
              scopeItem: {
                case: 'slashCommand',
                value: {
                  $typeName: 'exa.codeium_common_pb.SlashCommandScopeItem',
                  info: compactDef.info,
                  argumentValues: {},
                },
              },
            },
          },
        };
        await p.handleSubmit([chunk], [], () => {});
        const pctNow = Math.round(telemetry?.context?.contextPct || 0);
        showToast(auto
          ? `上下文已达 ${pctNow}%（> ${settings.autoCompactThreshold ?? 80}%），已自动执行 /compact 压缩`
          : '已触发 /compact 上下文压缩');
        if (studioPopoverHost) renderStudioContent();
        return true;
      } catch {}
    }

    const editor = ctrl.ib.querySelector('[contenteditable="true"]');
    if (editor && !(editor.textContent || '').trim()) {
      editor.focus();
      document.execCommand('insertText', false, '/compact');
      await new Promise(r => setTimeout(r, 120));
      const sendBtn = ctrl.ib.querySelector('button[data-testid="send-button"]');
      if (sendBtn && !sendBtn.disabled) sendBtn.click();
      else editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      showToast(auto ? '已自动发送 /compact 压缩上下文' : '已发送 /compact 压缩上下文');
      if (studioPopoverHost) renderStudioContent();
      return true;
    }

    if (!auto) showToast('输入框中有未发送草稿，请清空后重试或手动输入 /compact', true);
    return false;
  };

  const checkAutoCompactTick = () => {
    if (disposed) return;
    const ctrl = readComposerControl();
    if (!ctrl) return;
    const runningNow = ctrl.isRunning;
    const justFinishedTurn = wasAgentRunning && !runningNow;
    wasAgentRunning = runningNow;

    if (runningNow) {
      if (autoCompactTimer) {
        clearTimeout(autoCompactTimer);
        autoCompactTimer = null;
        autoCompactTimerKind = '';
      }
      return;
    }

    // 1. Reserved one-shot compact ("已预约压缩"): fire once after 900ms idle without resetting existing timer
    if (oneShotCompactPending) {
      const curConvId = api.readConversationId() || '';
      if (oneShotCompactConvId && curConvId && oneShotCompactConvId !== curConvId) {
        oneShotCompactPending = false;
        oneShotCompactConvId = '';
        if (studioPopoverHost) renderStudioContent();
        return;
      }
      if (autoCompactTimer && autoCompactTimerKind === 'oneshot') return;
      if (autoCompactTimer) clearTimeout(autoCompactTimer);
      autoCompactTimerKind = 'oneshot';
      autoCompactTimer = setTimeout(() => {
        autoCompactTimer = null;
        autoCompactTimerKind = '';
        if (disposed || !oneShotCompactPending) return;
        const latestCtrl = readComposerControl();
        if (!latestCtrl || latestCtrl.isRunning) return;
        void triggerCompactContext({ auto: false });
      }, 900);
      return;
    }

    // 2. Threshold-based auto compact after a turn completes
    if (!justFinishedTurn) return;
    if (!settings.autoCompactEnabled) return;

    invokeSidecar({ action: 'refreshDashboard' });
    if (autoCompactTimer) clearTimeout(autoCompactTimer);
    autoCompactTimerKind = 'auto';
    autoCompactTimer = setTimeout(() => {
      autoCompactTimer = null;
      autoCompactTimerKind = '';
      if (disposed || !settings.autoCompactEnabled) return;
      const latestCtrl = readComposerControl();
      if (!latestCtrl || latestCtrl.isRunning) return;
      const threshold = Number(settings.autoCompactThreshold ?? 80);
      const ctx = telemetry?.context;
      const pct = Number(ctx?.contextPct || 0);
      if (pct <= threshold) return;

      const convId = api.readConversationId() || ctx?.conversationId || 'current';
      const reqCount = ctx?.requestCount || 0;
      const prev = lastCompactByConv.get(convId);
      if (prev && (Date.now() - prev.at < 60_000 || (reqCount > 0 && reqCount <= prev.reqCount))) return;

      void triggerCompactContext({ auto: true });
    }, 1800);
  };

  const compactWatchTimer = setInterval(checkAutoCompactTick, 500);

  let studioStyleThemeKey = '';

  const renderStudioContent = () => {
    if (!studioPopoverHost) return;
    const shadow = studioPopoverHost.shadowRoot;
    const dark = isDarkTheme();
    const s = settings;
    const glassStyle = s.glassStyle || 'liquid';
    const ctx = telemetry?.context || {};
    const quotas = Array.isArray(telemetry?.quotas) ? telemetry.quotas : [];
    const pct = Math.min(100, Math.round(ctx.contextPct || 0));
    const themeKey = `${dark ? 'dark' : 'light'}:${glassStyle}`;

    let style = shadow.getElementById('agy-studio-style');
    let box = shadow.getElementById('agy-studio-box');
    const isFirstMount = !box;
    if (!style) {
      style = document.createElement('style');
      style.id = 'agy-studio-style';
      shadow.appendChild(style);
      studioStyleThemeKey = '';
    }
    if (studioStyleThemeKey !== themeKey) {
      studioStyleThemeKey = themeKey;
      const studioBgColor = glassStyle === 'solid'
        ? (dark ? '#151c2e' : '#ffffff')
        : glassStyle === 'frosted'
          ? (dark ? 'rgba(18,24,40,0.9)' : 'rgba(255,255,255,0.92)')
          : (dark ? 'rgba(18,24,42,0.8)' : 'rgba(250,252,255,0.82)');
      const studioBgImage = glassStyle === 'liquid'
        ? (dark
          ? 'linear-gradient(145deg, rgba(24,31,52,0.82), rgba(14,19,34,0.74))'
          : 'linear-gradient(145deg, rgba(255,255,255,0.84), rgba(244,248,255,0.74))')
        : 'none';
      const studioBlur = glassStyle === 'solid' ? 'none' : glassStyle === 'frosted' ? 'blur(12px) saturate(120%)' : 'blur(28px) saturate(195%)';
      const studioBorder = glassStyle === 'solid'
        ? (dark ? 'rgba(148,163,184,0.26)' : 'rgba(15,23,42,0.14)')
        : (dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.9)');
      const studioShadow = glassStyle === 'solid'
        ? (dark ? '0 14px 36px rgba(0,0,0,0.48)' : '0 10px 28px rgba(15,23,42,0.14)')
        : (dark
          ? '0 22px 54px rgba(0,0,0,0.56), inset 0 1px 0 rgba(255,255,255,0.22)'
          : '0 18px 44px rgba(15,23,42,0.16), inset 0 1.5px 1px rgba(255,255,255,0.96)');
      style.textContent = `
      * { box-sizing: border-box; }
      @keyframes popIn {
        from { opacity: 0; transform: translateY(8px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .studio {
        position: fixed;
        width: 326px;
        pointer-events: auto;
        border-radius: 20px;
        padding: 11px 13px 12px;
        font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
        font-size: 12px;
        color: ${dark ? '#f1f5f9' : '#0f172a'};
        background-color: ${studioBgColor};
        background-image: ${studioBgImage};
        border: 1px solid ${studioBorder};
        box-shadow: ${studioShadow};
        backdrop-filter: ${studioBlur};
        user-select: none;
      }
      .studio.entering { animation: popIn 150ms cubic-bezier(.16,1,.3,1); }
      .hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 9px;
      }
      .brand { display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 12.5px; }
      .spark {
        width: 20px; height: 20px; border-radius: 7px;
        background: linear-gradient(135deg, #2563eb, #7c3aed, #06b6d4);
        display: grid; place-items: center; color: #fff; font-size: 11px;
      }
      .tabs {
        display: inline-flex; padding: 2px; border-radius: 9px;
        background: ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)'};
      }
      .tab {
        border: 0; background: transparent; color: ${dark ? '#94a3b8' : '#64748b'};
        padding: 3px 9px; border-radius: 7px; font-size: 11px; font-weight: 600; cursor: pointer;
      }
      .tab.on {
        background: ${dark ? 'rgba(99,102,241,0.38)' : '#ffffff'};
        color: ${dark ? '#f8fafc' : '#1e293b'};
        box-shadow: 0 1px 4px rgba(0,0,0,0.12);
      }
      .sec-label {
        font-size: 10.5px; font-weight: 600; color: ${dark ? '#9fb0c7' : '#64748b'};
        margin: 8px 0 5px; display: flex; align-items: center; justify-content: space-between; gap: 6px;
      }
      .sec-label:first-of-type { margin-top: 2px; }
      .seg {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px;
        padding: 3px; border-radius: 11px;
        background: ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.055)'};
      }
      .seg button {
        border: 0; background: transparent; color: ${dark ? '#cbd5e1' : '#475569'};
        padding: 5px 4px; border-radius: 8px; font-size: 11px; font-weight: 500;
        cursor: pointer; transition: all .12s ease;
      }
      .seg button.on {
        background: ${dark ? 'linear-gradient(135deg, rgba(59,130,246,0.42), rgba(124,58,237,0.42))' : '#ffffff'};
        color: ${dark ? '#ffffff' : '#1d4ed8'}; font-weight: 600;
        box-shadow: 0 2px 6px rgba(15,23,42,0.12);
      }
      .presets { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
      .preset-btn {
        border: 1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)'};
        background: ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.68)'};
        color: inherit; border-radius: 10px; padding: 6px 8px; text-align: left;
        cursor: pointer; font-size: 11px; display: flex; align-items: center; gap: 6px;
        transition: all .12s ease;
      }
      .preset-btn:hover { border-color: rgba(99,102,241,0.52); }
      .preset-btn.on {
        border-color: ${dark ? '#818cf8' : '#4f46e5'};
        background: ${dark ? 'rgba(79,70,229,0.28)' : 'rgba(79,70,229,0.1)'};
        font-weight: 600;
      }
      .wp-strip {
        display: flex; gap: 6px; overflow-x: auto; padding-bottom: 5px;
      }
      .wp-strip::-webkit-scrollbar { height: 4px; }
      .wp-strip::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
      .wp-strip::-webkit-scrollbar-track { background: transparent; }
      .wp-strip::-webkit-scrollbar-thumb {
        background: ${dark ? 'rgba(148,163,184,0.38)' : 'rgba(15,23,42,0.22)'};
        border-radius: 999px;
      }
      .wp-chip {
        flex: 0 0 auto; width: 72px; border-radius: 10px; padding: 6px 6px 5px;
        border: 1.5px solid transparent; cursor: pointer; text-align: left;
        font-size: 10px; font-weight: 600; line-height: 1.25;
        display: flex; flex-direction: column; justify-content: space-between;
        height: 45px; box-shadow: 0 3px 10px rgba(0,0,0,0.12);
        transition: transform .12s ease, border-color .12s ease;
      }
      .wp-chip:hover { transform: translateY(-1px); }
      .wp-chip.on { border-color: #38bdf8; box-shadow: 0 0 0 2px rgba(56,189,248,0.35); }
      .wp-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .wp-tag { font-size: 9px; opacity: 0.85; font-weight: 500; }
      .upload-btn {
        border: 0; background: transparent; color: ${dark ? '#93c5fd' : '#2563eb'};
        font-size: 10.5px; font-weight: 600; cursor: pointer; padding: 0;
      }
      .range-row { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
      .range-row input { flex: 1; accent-color: #6366f1; cursor: pointer; }
      /* Context Auto-Compact Card inside Quick Studio */
      .compact-box {
        margin-top: 9px; padding: 9px 10px; border-radius: 13px;
        background: ${dark ? 'rgba(255,255,255,0.045)' : 'rgba(15,23,42,0.038)'};
        border: 1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)'};
      }
      .compact-top {
        display: flex; align-items: center; justify-content: space-between; gap: 6px;
        margin-bottom: 7px;
      }
      .compact-title { font-size: 11.5px; font-weight: 700; display: flex; align-items: center; gap: 5px; }
      .compact-actions { display: inline-flex; align-items: center; gap: 5px; }
      .mini-btn {
        border: 1px solid ${dark ? 'rgba(129,140,248,0.45)' : 'rgba(79,70,229,0.3)'};
        background: ${dark ? 'linear-gradient(135deg, rgba(37,99,235,0.34), rgba(124,58,237,0.34))' : 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(124,58,237,0.12))'};
        color: ${dark ? '#e0e7ff' : '#3730a3'};
        border-radius: 7px; padding: 3px 8px; font-size: 10.5px; font-weight: 600;
        cursor: pointer; transition: all .12s ease;
      }
      .mini-btn:hover { filter: brightness(1.12); }
      .auto-switch {
        border: 1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.12)'};
        background: ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.75)'};
        color: ${dark ? '#cbd5e1' : '#475569'};
        border-radius: 999px; padding: 3px 8px; font-size: 10.5px; font-weight: 600; cursor: pointer;
      }
      .auto-switch.on {
        border-color: rgba(52,211,153,0.55);
        background: ${dark ? 'rgba(16,185,129,0.24)' : 'rgba(16,185,129,0.14)'};
        color: ${dark ? '#6ee7b7' : '#047857'};
      }
      .ctx-meter-wrap { position: relative; padding: 6px 0 4px; }
      .ctx-track {
        position: relative; height: 10px; border-radius: 999px;
        background: ${dark ? 'rgba(15,23,42,0.78)' : 'rgba(15,23,42,0.1)'};
        overflow: hidden;
      }
      .ctx-fill {
        position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px;
        transition: width .18s ease;
      }
      .ctx-marker {
        position: absolute; top: 3px; bottom: 1px; width: 2.5px; border-radius: 2px;
        background: #ffffff; box-shadow: 0 0 6px rgba(99,102,241,0.9);
        pointer-events: none; transform: translateX(-50%);
      }
      .ctx-marker::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 50%;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        background: #ffffff;
        border: 2.5px solid #6366f1;
        box-shadow: 0 1px 6px rgba(15,23,42,0.42);
      }
      .ctx-range {
        position: absolute; inset: 0; width: 100%; height: 100%; margin: 0;
        opacity: 0; cursor: ew-resize;
      }
      .ctx-sub {
        display: flex; align-items: center; justify-content: space-between;
        font-size: 10.5px; color: ${dark ? '#9fb0c7' : '#64748b'}; margin-top: 4px;
      }
      .ctx-sub b { color: ${dark ? '#f1f5f9' : '#1e293b'}; }
      .quick-checks { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
      .chk-pill {
        border: 1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)'};
        background: ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.62)'};
        color: ${dark ? '#cbd5e1' : '#475569'};
        border-radius: 999px; padding: 4px 9px; font-size: 10.5px; cursor: pointer;
      }
      .chk-pill.on {
        border-color: rgba(99,102,241,0.5);
        background: ${dark ? 'rgba(79,70,229,0.28)' : 'rgba(79,70,229,0.11)'};
        color: ${dark ? '#e0e7ff' : '#4338ca'}; font-weight: 600;
      }
      .bar { height: 6px; border-radius: 999px; background: ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.09)'}; overflow: hidden; margin: 5px 0 8px; }
      .bar > i { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg,#2563eb,#7c3aed,#06b6d4); }
      .u-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11.5px; }
      .muted { color: ${dark ? '#94a3b8' : '#64748b'}; }
    `;
    }

    const prevWpScroll = box?.querySelector('.wp-strip')?.scrollLeft || 0;
    if (!box) {
      box = document.createElement('div');
      box.id = 'agy-studio-box';
      box.className = 'studio entering';
      box.addEventListener('animationend', () => box.classList.remove('entering'), { once: true });
      shadow.appendChild(box);
    }
    box.innerHTML = '';

    const hdr = document.createElement('div');
    hdr.className = 'hdr';
    hdr.innerHTML = `<div class="brand"><span class="spark">✦</span><span>AGY Beautify</span></div>`;
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    for (const [id, lbl] of [['beautify', '快捷美化'], ['usage', '用量速览']]) {
      const tb = document.createElement('button');
      tb.type = 'button';
      tb.className = 'tab' + (studioActiveTab === id ? ' on' : '');
      tb.textContent = lbl;
      tb.onclick = () => {
        studioActiveTab = id;
        renderStudioContent();
        repositionStudio();
      };
      tabs.appendChild(tb);
    }
    hdr.appendChild(tabs);
    box.appendChild(hdr);

    // Unified real-time local applier so EVERY button inside Quick Studio takes effect in <16ms!
    const applyLocalPatch = (patch, presetId = null) => {
      const prevZh = settings.autoChinese;
      const next = { ...settings, ...patch };
      if (presetId !== null) next.activePreset = presetId;
      else if (!('activePreset' in patch)) next.activePreset = 'custom';
      settings = next;

      // Instant wallpaper resolution from in-memory cache / built-in SVG catalog
      if ('wallpaperId' in patch) {
        if (!patch.wallpaperId || patch.wallpaperId === 'none') {
          wallpaperDataUri = '';
        } else if (wpUriCache.has(patch.wallpaperId)) {
          wallpaperDataUri = wpUriCache.get(patch.wallpaperId);
        } else {
          const hit = wallpaperCatalog.find(w => w.id === patch.wallpaperId && w.dataUri);
          if (hit) {
            wallpaperDataUri = hit.dataUri;
            wpUriCache.set(hit.id, hit.dataUri);
          }
        }
      }
      if ('autoChinese' in patch) {
        if (settings.autoChinese === false && prevZh !== false) restoreLocalization();
        else if (settings.autoChinese !== false) runLocalization(document.body);
      }
      if (settings.geminiModelPicker === false && modelPopoverHost) closeModelPopover();

      applyWallpaperAndTheme();
      syncContextCapsule();
      updateMonitorNavVisual();
      if (monitorOpen) renderMonitorOverlay(true);
      renderStudioContent();
      repositionStudio();
    };

    const pushSetting = patch => {
      const rev = ++localRev;
      applyLocalPatch(patch, null);
      invokeSidecar({ action: 'updateSettings', patch, clientRev: rev });
    };

    if (studioActiveTab === 'beautify') {
      // Theme Mode: Auto / Light / Dark (auto-pairs opposite-tone built-in wallpaper while preserving custom/none)
      const DARK_BUILTIN_WPS = new Set(['deep-ocean-glass', 'gemini-aurora', 'midnight-grid']);
      const LIGHT_BUILTIN_WPS = new Set(['liquid-prism-light', 'sakura-mist-light']);
      const lblTheme = document.createElement('div');
      lblTheme.className = 'sec-label';
      lblTheme.textContent = '界面深浅色模式';
      box.appendChild(lblTheme);
      const segTheme = document.createElement('div');
      segTheme.className = 'seg';
      for (const [val, txt] of [['auto', '跟随系统'], ['light', '☀ 浅色'], ['dark', '🌙 深色']]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = (s.themeMode || 'auto') === val ? 'on' : '';
        b.textContent = txt;
        b.onclick = () => {
          const patch = { themeMode: val };
          const effectiveDark = val === 'dark' ? true : val === 'light' ? false : isHostDark();
          if (!effectiveDark && DARK_BUILTIN_WPS.has(settings.wallpaperId)) {
            patch.wallpaperId = 'liquid-prism-light';
          } else if (effectiveDark && LIGHT_BUILTIN_WPS.has(settings.wallpaperId)) {
            patch.wallpaperId = 'deep-ocean-glass';
          }
          pushSetting(patch);
        };
        segTheme.appendChild(b);
      }
      box.appendChild(segTheme);

      // Surface Material: Liquid Glass / Frosted / Solid
      const lblGlass = document.createElement('div');
      lblGlass.className = 'sec-label';
      lblGlass.textContent = '玻璃与表面材质';
      box.appendChild(lblGlass);
      const segGlass = document.createElement('div');
      segGlass.className = 'seg';
      for (const [val, txt] of [['liquid', '💧 液态玻璃'], ['frosted', '🧊 轻柔磨砂'], ['solid', '■ 纯净实体']]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = (s.glassStyle || 'liquid') === val ? 'on' : '';
        b.textContent = txt;
        b.onclick = () => pushSetting({ glassStyle: val, wallpaperGlass: val !== 'solid' });
        segGlass.appendChild(b);
      }
      box.appendChild(segGlass);

      // One-Click Presets (0ms optimistic instant apply!)
      if (presetsCatalog.length) {
        const lblPre = document.createElement('div');
        lblPre.className = 'sec-label';
        lblPre.textContent = '一键氛围预设';
        box.appendChild(lblPre);
        const pGrid = document.createElement('div');
        pGrid.className = 'presets';
        for (const p of presetsCatalog.slice(0, 4)) {
          const pb = document.createElement('button');
          pb.type = 'button';
          pb.className = 'preset-btn' + (s.activePreset === p.id ? ' on' : '');
          pb.innerHTML = `<span>${p.icon || '✨'}</span><span>${p.name}</span>`;
          pb.title = p.desc || p.name;
          pb.onclick = () => {
            const rev = ++localRev;
            if (p.patch) applyLocalPatch(p.patch, p.id);
            invokeSidecar({ action: 'applyPreset', presetId: p.id, clientRev: rev });
          };
          pGrid.appendChild(pb);
        }
        box.appendChild(pGrid);
      }

      // Wallpaper Quick Strip + Instant Local Upload
      const lblWp = document.createElement('div');
      lblWp.className = 'sec-label';
      lblWp.innerHTML = '<span>壁纸快选（支持自选本地图）</span>';
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'upload-btn';
      upBtn.textContent = '+ 自选图片';
      const fileInp = document.createElement('input');
      fileInp.type = 'file';
      fileInp.accept = 'image/*';
      fileInp.style.display = 'none';
      fileInp.onchange = () => {
        const f = fileInp.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          const rev = ++localRev;
          wallpaperDataUri = String(reader.result || '');
          applyWallpaperAndTheme();
          invokeSidecar({ action: 'uploadWallpaper', filename: f.name, dataUri: reader.result, clientRev: rev });
        };
        reader.readAsDataURL(f);
      };
      upBtn.onclick = () => fileInp.click();
      lblWp.append(upBtn, fileInp);
      box.appendChild(lblWp);

      const strip = document.createElement('div');
      strip.className = 'wp-strip';
      strip.addEventListener('wheel', ev => {
        if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
          ev.preventDefault();
          strip.scrollLeft += ev.deltaY;
        }
      }, { passive: false });
      const wps = wallpaperCatalog.length
        ? wallpaperCatalog
        : [{ id: 'deep-ocean-glass', name: '深海流光', tone: 'dark' }, { id: 'liquid-prism-light', name: '液态棱镜', tone: 'light' }, { id: 'gemini-aurora', name: 'Gemini 星云', tone: 'dark' }, { id: 'none', name: '无壁纸', tone: 'both' }];
      for (const wp of wps) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'wp-chip' + (s.wallpaperId === wp.id ? ' on' : '');
        chip.style.cssText = wpSwatchStyle(wp);
        const toneTxt = wp.tone === 'light' ? '浅色' : wp.tone === 'dark' ? '深色' : wp.tone === 'custom' ? '自定义' : '通用';
        chip.innerHTML = `<span class="wp-tag">${toneTxt}</span><span>${wp.name}</span>`;
        chip.title = wp.name;
        chip.onclick = () => pushSetting({ wallpaperId: wp.id });
        strip.appendChild(chip);
      }
      box.appendChild(strip);
      if (prevWpScroll) strip.scrollLeft = prevWpScroll;

      // Quick Scrim slider
      if (s.wallpaperId && s.wallpaperId !== 'none') {
        const lblSc = document.createElement('div');
        lblSc.className = 'sec-label';
        const scVal = Math.round((s.wallpaperScrim ?? 0.36) * 100);
        lblSc.innerHTML = `<span>壁纸清晰度 / 遮罩浓度</span><span id="scVal">${scVal}%</span>`;
        box.appendChild(lblSc);
        const rRow = document.createElement('div');
        rRow.className = 'range-row';
        const rng = document.createElement('input');
        rng.type = 'range';
        rng.min = '0';
        rng.max = '88';
        rng.step = '2';
        rng.value = String(scVal);
        rng.onpointerdown = () => { studioDragging = true; };
        rng.onpointerup = () => { studioDragging = false; };
        rng.onpointercancel = () => { studioDragging = false; };
        rng.oninput = () => {
          localRev++;
          lblSc.querySelector('#scVal').textContent = rng.value + '%';
          settings = { ...settings, wallpaperScrim: Number(rng.value) / 100, activePreset: 'custom' };
          applyWallpaperAndTheme();
        };
        rng.onchange = () => {
          studioDragging = false;
          const rev = ++localRev;
          invokeSidecar({ action: 'updateSettings', patch: { wallpaperScrim: Number(rng.value) / 100 }, clientRev: rev });
        };
        rRow.appendChild(rng);
        box.appendChild(rRow);
      }

      // Context Auto-Compact Module (Manual Trigger + Toggle + Draggable Threshold Progress Bar!)
      const compactBox = document.createElement('div');
      compactBox.className = 'compact-box';
      const autoOn = Boolean(s.autoCompactEnabled);
      const thresh = Math.round(Number(s.autoCompactThreshold ?? 80));
      const fillCol = pct > thresh ? 'linear-gradient(90deg,#f59e0b,#ef4444)' : 'linear-gradient(90deg,#2563eb,#38bdf8)';

      const cTop = document.createElement('div');
      cTop.className = 'compact-top';
      cTop.innerHTML = `<span class="compact-title"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.9;flex-shrink:0;"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg><span>上下文压缩</span></span>`;
      const cActs = document.createElement('div');
      cActs.className = 'compact-actions';
      const nowBtn = document.createElement('button');
      nowBtn.type = 'button';
      nowBtn.className = 'mini-btn';
      nowBtn.textContent = oneShotCompactPending ? '已预约压缩' : '⚡ 立即压缩';
      nowBtn.onclick = () => void triggerCompactContext({ auto: false });
      const autoBtn = document.createElement('button');
      autoBtn.type = 'button';
      autoBtn.className = 'auto-switch' + (autoOn ? ' on' : '');
      autoBtn.textContent = autoOn ? '自动：开' : '自动：关';
      autoBtn.onclick = () => pushSetting({ autoCompactEnabled: !autoOn });
      cActs.append(nowBtn, autoBtn);
      cTop.appendChild(cActs);
      compactBox.appendChild(cTop);

      // Interactive dual-layer progress bar (0..100 visual scale matches live context % 1:1; threshold clamped 40..95%)
      const meter = document.createElement('div');
      meter.className = 'ctx-meter-wrap';
      const track = document.createElement('div');
      track.className = 'ctx-track';
      const fill = document.createElement('div');
      fill.id = 'agyCtxFill';
      fill.className = 'ctx-fill';
      fill.style.width = `${pct}%`;
      fill.style.background = fillCol;
      track.appendChild(fill);
      const marker = document.createElement('div');
      marker.className = 'ctx-marker';
      marker.style.left = `${thresh}%`;
      const rngTh = document.createElement('input');
      rngTh.type = 'range';
      rngTh.className = 'ctx-range';
      rngTh.min = '0';
      rngTh.max = '100';
      rngTh.step = '1';
      rngTh.value = String(thresh);
      rngTh.title = '左右拖动进度条上的圆点，设置自动压缩阈值（40%–95%）';
      meter.append(track, marker, rngTh);
      compactBox.appendChild(meter);

      const cSub = document.createElement('div');
      cSub.className = 'ctx-sub';
      const subLeft = document.createElement('span');
      subLeft.innerHTML = `当前上下文 <b id="agyCtxPctVal">${pct}%</b>`;
      const subRight = document.createElement('span');
      subRight.innerHTML = `> <b id="agyThVal">${thresh}%</b> 结束自动压缩`;
      cSub.append(subLeft, subRight);
      compactBox.appendChild(cSub);

      rngTh.onpointerdown = () => { studioDragging = true; };
      rngTh.onpointerup = () => { studioDragging = false; };
      rngTh.onpointercancel = () => { studioDragging = false; };
      rngTh.oninput = () => {
        const v = Math.max(40, Math.min(95, Math.round(Number(rngTh.value))));
        rngTh.value = String(v);
        localRev++;
        marker.style.left = `${v}%`;
        subRight.querySelector('#agyThVal').textContent = `${v}%`;
        const livePct = Math.min(100, Math.round(telemetry?.context?.contextPct || 0));
        fill.style.background = livePct > v ? 'linear-gradient(90deg,#f59e0b,#ef4444)' : 'linear-gradient(90deg,#2563eb,#38bdf8)';
        settings = { ...settings, autoCompactThreshold: v };
      };
      rngTh.onchange = () => {
        studioDragging = false;
        const v = Math.max(40, Math.min(95, Math.round(Number(rngTh.value))));
        rngTh.value = String(v);
        const patch = { autoCompactThreshold: v, ...(settings.autoCompactEnabled ? {} : { autoCompactEnabled: true }) };
        pushSetting(patch);
        showToast(`已设置上下文 > ${v}% 时对话结束自动压缩`);
      };
      box.appendChild(compactBox);

      // Quick Toggles
      const checks = document.createElement('div');
      checks.className = 'quick-checks';
      const toggles = [
        ['readingSurface', '阅读护眼玻璃', s.readingSurface !== false],
        ['autoChinese', '中文界面', s.autoChinese !== false],
        ['geminiModelPicker', '星尘模型滑条', s.geminiModelPicker !== false],
      ];
      for (const [k, label, on] of toggles) {
        const p = document.createElement('button');
        p.type = 'button';
        p.className = 'chk-pill' + (on ? ' on' : '');
        p.textContent = (on ? '✓ ' : '') + label;
        p.onclick = () => pushSetting({ [k]: !on });
        checks.appendChild(p);
      }
      box.appendChild(checks);
    } else {
      // Tab 2: Live Context & Quota Usage Summary
      const head = document.createElement('div');
      head.className = 'u-row';
      head.innerHTML = `<strong>上下文窗口</strong><span>${fmtTok(ctx.usedContext || 0)} / ${fmtTok(ctx.maxContext || 200000)} (${pct}%)</span>`;
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.innerHTML = `<i style="width:${pct}%"></i>`;
      box.append(head, bar);
      const rows = [
        ['缓存读取', `${fmtTok(ctx.cachedIn || 0)}${ctx.cacheHitPct != null ? ` (${ctx.cacheHitPct}%)` : ''}`],
        ['未缓存输入', fmtTok(ctx.uncachedIn || 0)],
        ['思考 Token', fmtTok(ctx.thinkTokens || 0)],
        ['回复输出', fmtTok(ctx.replyTokens || 0)],
        ['最近生成速率', ctx.speedTokPerSec ? `${ctx.speedTokPerSec} tok/s` : '—'],
      ];
      for (const [k, v] of rows) {
        const r = document.createElement('div');
        r.className = 'u-row';
        r.innerHTML = `<span class="muted">${k}</span><span>${v}</span>`;
        box.appendChild(r);
      }
      const quotaGroups = collectQuotaWindows(quotas);
      if (quotaGroups.length) {
        const ql = document.createElement('div');
        ql.className = 'sec-label';
        ql.textContent = '模型配额与重置时间';
        box.appendChild(ql);
        for (const g of quotaGroups.slice(0, 3)) {
          const gBox = document.createElement('div');
          gBox.style.cssText = 'margin-bottom:7px;padding:7px 9px;border-radius:10px;background:' + (dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.035)') + ';border:1px solid ' + (dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)') + ';';
          let html = `<div style="font-size:11px;font-weight:700;margin-bottom:4px;">${escHtml(g.name)}</div>`;
          for (const w of g.windows) {
            const resetTxt = fmtResetTime(w.resetTime, false) || (w.pct >= 100 ? '满额' : '');
            const barCol = w.pct <= 20 ? '#ef4444' : w.pct <= 50 ? '#f59e0b' : 'linear-gradient(90deg,#2563eb,#38bdf8)';
            html += `<div style="margin-top:4px;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px;font-size:10.5px;margin-bottom:2px;">
                <span class="muted">${escHtml(w.label)} <b style="color:${dark ? '#f1f5f9' : '#0f172a'};">${w.pct}%</b></span>
                <span class="muted" style="font-size:10px;">${escHtml(resetTxt)}</span>
              </div>
              <div class="bar" style="margin:2px 0 0;height:5px;"><i style="width:${w.pct}%;background:${barCol};"></i></div>
            </div>`;
          }
          gBox.innerHTML = html;
          box.appendChild(gBox);
        }
      }
    }
    if (isFirstMount) repositionStudio();
  };

  const updateStudioTelemetryInPlace = () => {
    if (!studioPopoverHost) return;
    if (studioActiveTab !== 'beautify') {
      if (!studioDragging) { renderStudioContent(); repositionStudio(); }
      return;
    }
    const shadow = studioPopoverHost.shadowRoot;
    const pct = Math.min(100, Math.round(telemetry?.context?.contextPct || 0));
    const thresh = Math.round(Number(settings.autoCompactThreshold ?? 80));
    const fill = shadow?.getElementById('agyCtxFill');
    const lbl = shadow?.getElementById('agyCtxPctVal');
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.style.background = pct > thresh ? 'linear-gradient(90deg,#f59e0b,#ef4444)' : 'linear-gradient(90deg,#2563eb,#38bdf8)';
    }
    if (lbl) lbl.textContent = `${pct}%`;
  };

  const repositionStudio = () => {
    if (!studioPopoverHost) return;
    const box = studioPopoverHost.shadowRoot?.querySelector('.studio');
    if (!box) return;
    const anchor = studioAnchorEl || capsuleHost;
    const ar = anchor?.getBoundingClientRect();
    const ib = document.querySelector('[data-testid="agent-input-box"]')?.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const anchorTop = ib && ib.height > 0 ? ib.top : (ar ? ar.top : window.innerHeight - 90);
    const preferredLeft = ar ? (ar.left + ar.width / 2 - br.width / 2) : (window.innerWidth / 2 - br.width / 2);
    const left = Math.max(10, Math.min(window.innerWidth - br.width - 10, preferredLeft));
    const top = Math.max(10, anchorTop - br.height - 10);
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  };

  const toggleStudioPopover = anchorEl => {
    if (studioPopoverHost) {
      closeStudioPopover();
      return;
    }
    closeModelPopover();
    studioAnchorEl = anchorEl;
    studioPopoverHost = document.createElement('div');
    studioPopoverHost.id = 'agy-beautify-studio-host';
    studioPopoverHost.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
    studioPopoverHost.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(studioPopoverHost);
    syncPopoverFlag();
    renderStudioContent();
    repositionStudio();
    document.addEventListener('pointerdown', onStudioOutsideDown, true);
    document.addEventListener('keydown', onStudioKeyDown, true);
  };

  let capsuleHost = null;
  let lastCapsuleSig = '';
  const findMainFooterLeft = () => {
    const nonMain = '[data-side-panel-composer], [data-testid="side-question-tab-content"], [data-testid="subagent-tab-composer"], [data-testid="voice-dock-composer"]';
    for (const el of document.querySelectorAll('.agy-composer-footer > div:first-child')) {
      if (el.closest(nonMain)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
    return null;
  };

  const hasSiblingAgyCapsule = footer => {
    const ext = footer?.querySelector('#agy-capsule-host');
    if (!ext) return false;
    return Boolean(ext.shadowRoot?.childElementCount || ext.childElementCount);
  };

  const syncContextCapsule = () => {
    if (disposed || settings.showContextCapsule === false) {
      capsuleHost?.remove();
      capsuleHost = null;
      return;
    }
    const footer = findMainFooterLeft();
    if (!footer) return;
    if (!capsuleHost || !capsuleHost.isConnected || capsuleHost.parentElement !== footer) {
      capsuleHost?.remove();
      capsuleHost = document.createElement('div');
      capsuleHost.id = 'agy-beautify-capsule-host';
      capsuleHost.style.cssText = 'display:inline-flex;align-items:center;margin-left:5px;position:relative;';
      capsuleHost.attachShadow({ mode: 'open' });
      footer.appendChild(capsuleHost);
      lastCapsuleSig = '';
    }
    const shadow = capsuleHost.shadowRoot;
    const dark = isDarkTheme();
    const glassStyle = settings.glassStyle || 'liquid';
    const isLiquid = glassStyle === 'liquid';
    const isSolid = glassStyle === 'solid';
    const ctx = telemetry?.context;
    const quotas = Array.isArray(telemetry?.quotas) ? telemetry.quotas : [];
    const pct = ctx ? Math.min(100, Math.round(ctx.contextPct || 0)) : 0;
    const ringColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#38bdf8';
    const dashTotal = 40.84;
    const dashOffset = dashTotal * (1 - pct / 100);
    const quotaGroups = collectQuotaWindows(quotas);
    const firstWin = quotaGroups[0]?.windows?.[0] || null;
    const quotaPct = firstWin ? firstWin.pct : null;
    const soonestReset = pickPrimaryReset(quotas);
    const resetShort = soonestReset ? fmtResetTime(soonestReset.resetTime, true) : '';
    const resetTipLines = quotaGroups.flatMap(g =>
      g.windows.map(w => `${g.name} · ${w.label}: ${w.pct}%${w.resetTime ? ' · ' + fmtResetTime(w.resetTime, false) : (w.pct >= 100 ? ' · 满额' : '')}`),
    );
    const pillTitle = ['点击打开 AGY Beautify 美化与用量快捷面板', ...resetTipLines].join('\n');
    const useCompact = settings.compactCapsule === 'compact'
      || (settings.compactCapsule !== 'full' && hasSiblingAgyCapsule(footer));
    const capSig = `${dark}:${glassStyle}:${pct}:${ctx?.usedContext || 0}:${ctx?.speedTokPerSec || ''}:${quotaPct}:${resetShort}:${useCompact}:${settings.showQuotaInFooter !== false}`;
    if (capSig === lastCapsuleSig) return;
    lastCapsuleSig = capSig;

    shadow.innerHTML = `
      <style>
        .wrap { position:relative; display:inline-flex; align-items:center; font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; }
        .pill {
          display:inline-flex; align-items:center; gap:5px; height:25px; padding:0 9px;
          border-radius:999px;
          border:1px solid ${dark ? (isLiquid ? 'rgba(255,255,255,0.18)' : 'rgba(148,163,184,0.24)') : (isLiquid ? 'rgba(255,255,255,0.86)' : 'rgba(15,23,42,0.12)')};
          background:${isSolid
            ? (dark ? '#172033' : '#ffffff')
            : dark
              ? (isLiquid ? 'linear-gradient(135deg, rgba(36,44,72,0.72), rgba(22,28,48,0.62))' : 'rgba(24,29,46,0.84)')
              : (isLiquid ? 'linear-gradient(135deg, rgba(255,255,255,0.78), rgba(240,246,255,0.62))' : 'rgba(255,255,255,0.88)')};
          box-shadow:${isSolid ? 'none' : dark ? 'inset 0 1px 0 rgba(255,255,255,0.16)' : '0 2px 8px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.92)'};
          color:${dark ? '#e2e8f0' : '#1e293b'}; font-size:11.5px; cursor:pointer;
          backdrop-filter:${isSolid ? 'none' : isLiquid ? 'blur(14px) saturate(175%)' : 'blur(8px)'}; white-space:nowrap;
          transition:border-color .15s ease, transform .14s ease;
        }
        .pill:hover { border-color: rgba(99,102,241,0.58); transform: translateY(-0.5px); }
        .spark { font-size: 10.5px; background: linear-gradient(135deg,#3b82f6,#8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 700; }
        .sep { opacity:0.32; }
        .muted { color:${dark ? '#94a3b8' : '#64748b'}; }
        .rst { display:inline-flex; align-items:center; gap:2.5px; color:${dark ? '#7dd3fc' : '#0369a1'}; font-weight:600; font-size:11px; }
      </style>
      <div class="wrap">
        <button type="button" class="pill" title="${escHtml(pillTitle)}">
          <span class="spark">✦</span>
          <svg width="13" height="13" viewBox="0 0 18 18" style="transform:rotate(-90deg)">
            <circle cx="9" cy="9" r="6.5" fill="none" stroke="rgba(148,163,184,0.28)" stroke-width="2.4"/>
            <circle cx="9" cy="9" r="6.5" fill="none" stroke="${ringColor}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${dashTotal}" stroke-dashoffset="${dashOffset.toFixed(2)}"/>
          </svg>
          <span>${pct}%</span>
          ${!useCompact ? `<span class="muted">${fmtTok(ctx?.usedContext || 0)}</span>` : ''}
          ${!useCompact && ctx?.speedTokPerSec ? `<span class="sep">·</span><span class="muted">${ctx.speedTokPerSec} t/s</span>` : ''}
          ${!useCompact && settings.showQuotaInFooter !== false && quotaPct !== null ? `<span class="sep">·</span><span>额度 ${quotaPct}%</span>` : ''}
          ${settings.showQuotaInFooter !== false && resetShort ? `<span class="sep">·</span><span class="rst">↻ ${escHtml(resetShort)}</span>` : ''}
        </button>
      </div>
    `;
    const btn = shadow.querySelector('.pill');
    if (btn) {
      btn.onclick = ev => {
        ev.stopPropagation();
        toggleStudioPopover(capsuleHost);
      };
    }
  };

  // ---------------- Module 4: Capture-Phase Right-Click Reveal File ----------------
  const isLocalRef = val => {
    if (typeof val !== 'string') return false;
    const v = val.trim();
    if (!v || /^(?:https?|mailto|javascript|data|blob|sidecar|customization|plugin|conversation):/i.test(v)) return false;
    return /^file:\//i.test(v)
      || /^[A-Za-z]:[\\/]/.test(v)
      || /^\\\\[^\\/]+\\[^\\/]+/.test(v)
      || /^~[\\/]\S/.test(v)
      || /^\/(?:Users|home|tmp|var|opt|etc|mnt|root|usr|Applications)\/\S/.test(v);
  };

  const normalizePreviewPath = raw => {
    let v = String(raw || '').trim();
    if (/^file:\//i.test(v)) {
      v = v.replace(/[#?].*$/, '').replace(/^file:\/\/(?:localhost)?/i, '').replace(/^file:/i, '');
      try { v = decodeURIComponent(v); } catch {}
      if (/^\/[A-Za-z]:/.test(v)) v = v.slice(1);
      if (/^[A-Za-z]:/.test(v)) v = v.replace(/\//g, '\\').replace(/^[a-z]:/, c => c.toUpperCase());
    }
    return v;
  };

  const displayParts = raw => {
    const clean = normalizePreviewPath(raw).replace(/#L?\d+(?:-L?\d+)?$/i, '').replace(/:(\d+)(?::(\d+))?$/, (m, _l, _c, offset, str) => {
      return offset <= 2 && /^[A-Za-z]:/.test(str) ? m : '';
    });
    const parts = clean.split(/[\\/]+/).filter(Boolean);
    const name = parts[parts.length - 1] || clean;
    const isWin = /^[A-Za-z]:/.test(clean) || /^\\\\/.test(clean);
    const sep = isWin ? '\\' : '/';
    const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
    const dir = idx > 0 ? clean.slice(0, idx) : clean;
    return { clean, name, dir: dir || sep };
  };

  const findPathInFiber = startEl => {
    const fk = Object.keys(startEl).find(k => k.startsWith('__reactFiber$'));
    if (!fk) return '';
    const propKeys = ['fileUri', 'uri', 'filePath', 'path', 'absolutePath', 'targetUri', 'artifactUri', 'href'];
    const stopIds = new Set([
      'conversation-view', 'planner-response-text', 'agent-response', 'turn-cards-container',
      'tool-group-collapsible', 'worked-for-collapsible', 'user-message', 'agent-input-box', 'aux-pane-split', 'overview-panel',
    ]);
    for (let fiber = startEl[fk], depth = 0; fiber && depth < 16; fiber = fiber.return, depth++) {
      const p = fiber.memoizedProps;
      if (!p || typeof p !== 'object') continue;
      if (stopIds.has(p['data-testid'])) break;
      for (const k of propKeys) if (isLocalRef(p[k])) return p[k].trim();
      for (const nk of ['entry', 'item', 'file', 'node']) {
        const nested = p[nk];
        if (nested && typeof nested === 'object') {
          for (const k of propKeys) if (isLocalRef(nested[k])) return nested[k].trim();
        }
      }
      if (startEl.closest?.('[data-testid="tool-group-collapsible"], [data-testid="worked-for-collapsible"]')) {
        const argsJson = p.step?.metadata?.toolCall?.argumentsJson;
        if (typeof argsJson === 'string' && argsJson.length < 4000) {
          try {
            const parsed = JSON.parse(argsJson);
            for (const ak of ['TargetFile', 'AbsolutePath', 'Path', 'FilePath', 'DirectoryPath', 'SearchPath']) {
              if (isLocalRef(parsed?.[ak])) return parsed[ak].trim();
            }
          } catch {}
        }
      }
    }
    return '';
  };

  const resolveFileFromTarget = rawTarget => {
    const target = rawTarget instanceof Element ? rawTarget : rawTarget?.parentElement;
    if (!(target instanceof Element)) return '';
    if (target.closest('#agy-beautify-menu-host, #agy-beautify-model-host, #agy-beautify-studio-host, #agy-beautify-monitor-overlay, #agy-beautify-monitor-nav')) return '';
    const inInputBox = target.closest('[data-testid="agent-input-box"]');
    if (inInputBox && !target.closest('[data-uri]')) return '';

    let el = target;
    for (let depth = 0; el && depth < 14; el = el.parentElement, depth++) {
      const tid = el.getAttribute?.('data-testid');
      if (tid === 'planner-response-text' || tid === 'conversation-view' || tid === 'user-message-content') break;
      const dataUri = el.getAttribute?.('data-uri');
      if (isLocalRef(dataUri)) return dataUri.trim();
      if (el.tagName === 'A') {
        const href = el.getAttribute('href');
        if (isLocalRef(href)) return href.trim();
      }
      for (const attr of ['data-path', 'data-file', 'data-filepath']) {
        const av = el.getAttribute?.(attr);
        if (isLocalRef(av)) return av.trim();
      }
      const title = el.getAttribute?.('title');
      if (isLocalRef(title)) return title.trim();
      const fiberRef = findPathInFiber(el);
      if (fiberRef) return fiberRef;
    }

    if (settings.revealDetectCodePaths !== false) {
      const codeEl = target.closest('code');
      if (codeEl && !codeEl.closest('pre')) {
        const sel = window.getSelection?.()?.toString?.()?.trim() || '';
        const text = codeEl.textContent?.trim() || '';
        if ((!sel || sel === text) && text.length <= 500 && !/[\r\n]/.test(text) && isLocalRef(text)) return text;
      }
      const sel = window.getSelection?.()?.toString?.()?.trim() || '';
      if (sel && sel.length <= 500 && !/[\r\n]/.test(sel) && isLocalRef(sel)) return sel;
    }
    return '';
  };

  const copyText = async text => {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch { return false; }
    }
  };

  let menuHost = null;
  const closeRevealMenu = () => {
    if (menuHost) { menuHost.remove(); menuHost = null; }
    document.removeEventListener('mousedown', onRevealDocDown, true);
    document.removeEventListener('keydown', onRevealDocKey, true);
    window.removeEventListener('blur', closeRevealMenu);
    window.removeEventListener('resize', closeRevealMenu);
  };
  const onRevealDocDown = ev => {
    if (menuHost && (ev.target === menuHost || menuHost.contains(ev.target))) return;
    closeRevealMenu();
  };
  const onRevealDocKey = ev => { if (ev.key === 'Escape') closeRevealMenu(); };

  const executeRevealAction = async (id, raw, selectedText = '') => {
    const info = displayParts(raw);
    if (id === 'copy-selection' && selectedText) {
      const ok = await copyText(selectedText);
      showToast(ok ? '已复制选中文本' : '复制失败', !ok);
      return;
    }
    if (id === 'copy-path') {
      const ok = await copyText(info.clean);
      showToast(ok ? `已复制路径：${info.clean}` : '复制失败', !ok);
      return;
    }
    if (id === 'copy-dir') {
      const ok = await copyText(info.dir);
      showToast(ok ? `已复制文件夹路径：${info.dir}` : '复制失败', !ok);
      return;
    }
    if (id === 'reveal' || id === 'open' || id === 'terminal') invokeSidecar({ action: id, raw });
  };

  const showFallbackMenu = (x, y, items, raw, selectedText = '') => {
    closeRevealMenu();
    menuHost = document.createElement('div');
    menuHost.id = 'agy-beautify-menu-host';
    menuHost.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
    const shadow = menuHost.attachShadow({ mode: 'open' });
    const dark = isDarkTheme();
    const menu = document.createElement('div');
    menu.style.cssText = [
      'position:fixed', `left:${Math.max(8, x)}px`, `top:${Math.max(8, y)}px`,
      'min-width:215px', 'max-width:320px', 'padding:5px', 'border-radius:13px',
      'pointer-events:auto', 'font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
      'font-size:12.5px', 'user-select:none',
      'box-shadow:' + (dark ? '0 16px 40px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.18)' : '0 14px 36px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.92)'),
      'border:1px solid ' + (dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.82)'),
      'background:' + (dark ? 'rgba(22,27,44,0.88)' : 'rgba(255,255,255,0.88)'),
      'color:' + (dark ? '#f8fafc' : '#0f172a'), 'backdrop-filter:blur(22px) saturate(185%)',
    ].join(';');
    for (const item of items) {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;margin:4px 6px;background:' + (dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.08)');
        menu.appendChild(sep);
        continue;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.disabled = !!item.disabled;
      btn.style.cssText = [
        'display:block', 'width:100%', 'text-align:left', 'border:0', 'background:transparent',
        'border-radius:7px', 'padding:6px 10px', 'font-size:12.5px', 'line-height:1.35',
        'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
        item.disabled ? ('color:' + (dark ? '#94a3b8' : '#64748b') + ';font-size:11.5px;cursor:default;') : 'color:inherit;cursor:pointer;',
      ].join(';');
      if (!item.disabled) {
        btn.onmouseenter = () => { btn.style.background = dark ? 'rgba(99,102,241,0.22)' : 'rgba(79,70,229,0.11)'; };
        btn.onmouseleave = () => { btn.style.background = 'transparent'; };
        btn.onclick = ev => { ev.stopPropagation(); closeRevealMenu(); void executeRevealAction(item.id, raw, selectedText); };
      }
      menu.appendChild(btn);
    }
    shadow.appendChild(menu);
    document.documentElement.appendChild(menuHost);
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, Math.max(8, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.min(y, Math.max(8, window.innerHeight - rect.height - 8))}px`;
    document.addEventListener('mousedown', onRevealDocDown, true);
    document.addEventListener('keydown', onRevealDocKey, true);
    window.addEventListener('blur', closeRevealMenu);
    window.addEventListener('resize', closeRevealMenu);
  };

  const onContextMenu = ev => {
    if (disposed || settings.revealEnabled === false || ev.defaultPrevented) return;
    const raw = resolveFileFromTarget(ev.target);
    if (!raw) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    ev.stopPropagation();

    const selectedText = window.getSelection?.()?.toString?.() || '';
    const info = displayParts(raw);
    const items = [
      { id: 'header', label: info.name, type: 'normal', disabled: true },
      { id: 'sep-1', type: 'separator' },
      { id: 'reveal', label: '打开所在文件夹 (Open in Folder)', type: 'normal', disabled: false },
    ];
    if (settings.revealShowOpenFile !== false) items.push({ id: 'open', label: '用默认程序打开', type: 'normal', disabled: false });
    if (settings.revealShowCopyActions !== false || selectedText.trim()) items.push({ id: 'sep-2', type: 'separator' });
    if (selectedText.trim()) items.push({ id: 'copy-selection', label: '复制', type: 'normal', disabled: false });
    if (settings.revealShowCopyActions !== false) {
      items.push({ id: 'copy-path', label: '复制完整路径', type: 'normal', disabled: false });
      items.push({ id: 'copy-dir', label: '复制文件夹路径', type: 'normal', disabled: false });
    }
    if (settings.revealShowTerminal !== false) {
      items.push({ id: 'sep-3', type: 'separator' });
      items.push({ id: 'terminal', label: '在终端中打开此目录', type: 'normal', disabled: false });
    }

    if (settings.revealUseNativeMenu !== false && typeof window.electronNative?.showContextMenu === 'function') {
      window.electronNative.showContextMenu(items)
        .then(id => { if (id) void executeRevealAction(id, raw, selectedText); })
        .catch(() => showFallbackMenu(ev.clientX, ev.clientY, items, raw, selectedText));
    } else {
      showFallbackMenu(ev.clientX, ev.clientY, items, raw, selectedText);
    }
  };
  window.addEventListener('contextmenu', onContextMenu, true);

  // ---------------- Module 6: Left-Sidebar "监控台" + Full Right-Pane Rich Analytics Monitor ----------------
  const fmtDur = sec => {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    if (s === 0) return '0s';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(rem).padStart(2, '0')}s`;
    return `${rem}s`;
  };
  const fmtRelTime = ms => {
    const diff = Math.max(0, Date.now() - (Number(ms) || 0));
    const min = Math.floor(diff / 60000);
    if (min < 2) return '刚刚';
    if (min < 60) return `${min} 分钟前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} 小时前`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day} 天前`;
    return new Date(ms).toISOString().slice(0, 10);
  };
  const buildDonutSvg = (segments, centerTop, centerSub, trackColor, textColor, mutedColor) => {
    const r = 48;
    const c = 2 * Math.PI * r;
    const total = segments.reduce((acc, s) => acc + Math.max(0, Number(s.value) || 0), 0);
    const nonZero = segments.filter(s => (Number(s.value) || 0) > 0);
    const gap = nonZero.length > 1 ? 2.2 : 0;
    let offset = 0;
    const arcs = total > 0 ? nonZero.map(s => {
      const len = (s.value / total) * c;
      const dash = Math.max(2, len - gap);
      const html = `<circle cx="64" cy="64" r="${r}" fill="none" stroke="${s.color}" stroke-width="14" stroke-linecap="butt" stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 64 64)"/>`;
      offset += len;
      return html;
    }).join('') : '';
    return `<svg width="128" height="128" viewBox="0 0 128 128" style="flex-shrink:0;">
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="${trackColor}" stroke-width="14"/>
      ${arcs}
      <text x="64" y="61" text-anchor="middle" fill="${textColor}" font-size="15.5" font-weight="800">${escHtml(centerTop)}</text>
      <text x="64" y="77" text-anchor="middle" fill="${mutedColor}" font-size="10.5" font-weight="600">${escHtml(centerSub)}</text>
    </svg>`;
  };
  const buildContextRingSvg = (pct, usedLabel, trackColor, textColor, mutedColor) => {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    const r = 22;
    const c = 2 * Math.PI * r;
    const col = p >= 85 ? '#ef4444' : p >= 65 ? '#f59e0b' : '#38bdf8';
    return `<svg width="56" height="56" viewBox="0 0 56 56" style="flex-shrink:0;">
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="${trackColor}" stroke-width="4.8"/>
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="${col}" stroke-width="4.8" stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p / 100)).toFixed(2)}" transform="rotate(-90 28 28)"/>
      <text x="28" y="27" text-anchor="middle" fill="${textColor}" font-size="11.5" font-weight="800">${Math.round(p)}%</text>
      <text x="28" y="38" text-anchor="middle" fill="${mutedColor}" font-size="8.5" font-weight="600">${escHtml(usedLabel)}</text>
    </svg>`;
  };
  const openConversationById = convId => {
    if (!convId) return;
    closeMonitorOverlay();
    if (location.pathname.includes(convId)) return;
    // Try clicking matching native sidebar link/button if present, else navigate directly
    const link = document.querySelector(`a[href*="${convId}"]`);
    if (link) { link.click(); return; }
    window.location.assign(`/c/${convId}`);
  };

  let monitorNavBtn = null;
  let monitorOverlayHost = null;
  let monitorOpen = false;
  let monitorTab = 'overview'; // 'overview' | 'insights' | 'sessions'
  let monitorPeriod = 'all'; // 'all' | 'month' | 'week' | 'today'
  let monitorChartMode = 'usd'; // 'usd' | 'tokens'
  let monitorOverviewDonut = 'tokens'; // 'tokens' | 'time'
  let monitorHeatMode = 'usd'; // 'usd' | 'tokens'
  let monitorSelectedDay = '';
  let monitorCol3Mode = 'skills'; // 'skills' | 'workspaces'
  let monitorSearch = '';
  let monitorWorkspace = 'all';
  let monitorSort = 'cost'; // 'cost' | 'tokens' | 'recent' | 'context'

  const closeMonitorOverlay = () => {
    monitorOpen = false;
    document.documentElement.removeAttribute('data-agy-monitor-open');
    if (monitorOverlayHost) {
      monitorOverlayHost.remove();
      monitorOverlayHost = null;
    }
    document.removeEventListener('keydown', onMonitorKeyDown, true);
    updateMonitorNavVisual();
  };

  const onMonitorKeyDown = ev => {
    if (ev.key === 'Escape' && monitorOpen) closeMonitorOverlay();
  };

  const onSidebarOtherClick = ev => {
    if (!monitorOpen || disposed) return;
    const t = ev.target instanceof Element ? ev.target : ev.target?.parentElement;
    if (!t) return;
    if (t.closest('#agy-beautify-monitor-nav') || t.closest('#agy-beautify-monitor-overlay')) return;
    if (t.closest('[data-testid="sidebar-split"] > div:first-child')) {
      closeMonitorOverlay();
    }
  };
  window.addEventListener('click', onSidebarOtherClick, true);

  const updateMonitorNavVisual = () => {
    if (!monitorNavBtn) return;
    const dark = isDarkTheme();
    const dash = telemetry?.dashboard;
    const allUsd = dash?.totals?.all?.costUsd;
    const badge = monitorNavBtn.querySelector('.agy-mon-badge');
    if (badge) {
      badge.textContent = typeof allUsd === 'number' && allUsd > 0 ? fmtUsd(allUsd) : '';
      badge.style.display = badge.textContent ? 'inline-flex' : 'none';
      badge.style.background = dark ? 'rgba(16,185,129,0.18)' : 'rgba(5,150,105,0.14)';
      badge.style.color = dark ? '#34d399' : '#047857';
    }
    if (monitorOpen) {
      monitorNavBtn.style.background = dark ? 'rgba(99, 102, 241, 0.24)' : 'rgba(79, 70, 229, 0.12)';
      monitorNavBtn.style.color = dark ? '#f8fafc' : '#1e1b4b';
      monitorNavBtn.style.boxShadow = dark
        ? 'inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 10px rgba(79,70,229,0.22)'
        : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 8px rgba(79,70,229,0.1)';
    } else {
      monitorNavBtn.style.background = '';
      monitorNavBtn.style.color = '';
      monitorNavBtn.style.boxShadow = '';
    }
  };

  let monitorThemeKey = '';
  let monitorRenderSig = '';

  const renderMonitorOverlay = (force = false) => {
    if (!monitorOpen) return;
    const sheet = document.querySelector('.agy-sheet') || document.querySelector('[data-testid="aux-pane-split"]');
    if (!sheet) return;
    let firstMount = false;
    if (!monitorOverlayHost || !monitorOverlayHost.isConnected || monitorOverlayHost.parentElement !== sheet) {
      monitorOverlayHost?.remove();
      monitorOverlayHost = document.createElement('div');
      monitorOverlayHost.id = 'agy-beautify-monitor-overlay';
      monitorOverlayHost.style.cssText = 'position:absolute;inset:0;z-index:55;overflow:hidden;';
      monitorOverlayHost.attachShadow({ mode: 'open' });
      sheet.appendChild(monitorOverlayHost);
      monitorThemeKey = '';
      monitorRenderSig = '';
      firstMount = true;
    }

    const shadow = monitorOverlayHost.shadowRoot;
    // Skip re-render while user is typing in session search box unless explicitly forced
    if (!force && !firstMount && shadow.activeElement?.id === 'monSearch') return;

    const dark = isDarkTheme();
    const glassStyle = settings.glassStyle || 'liquid';
    const isLiquid = glassStyle === 'liquid';
    const isSolid = glassStyle === 'solid';
    const dash = telemetry?.dashboard;
    const quotas = Array.isArray(telemetry?.quotas) ? telemetry.quotas : [];
    const themeKey = `${dark ? 'd' : 'l'}:${glassStyle}`;
    const nextSig = JSON.stringify([
      themeKey, monitorTab, monitorPeriod, monitorChartMode, monitorOverviewDonut,
      monitorHeatMode, monitorCol3Mode, monitorWorkspace, monitorSort,
      dash?.updatedAt || 0, dash?.totals?.[monitorPeriod]?.tokens || 0, quotas.length,
    ]);
    if (!force && !firstMount && nextSig === monitorRenderSig) return;
    monitorRenderSig = nextSig;

    const totals = dash?.totals || {};
    const b = totals[monitorPeriod] || totals.all || {
      tokens: 0, requests: 0, cached: 0, uncached: 0, output: 0, think: 0, reply: 0,
      costUsd: 0, savedUsd: 0, inputUsd: 0, cachedUsd: 0, outputUsd: 0, avgSpeed: null,
      toolCalls: 0, turns: 0, sessions: 0,
      timings: { waitSec: 0, thinkSec: 0, replySec: 0, toolSec: 0, totalSec: 0 },
      byModel: [], topTools: [], topCommands: [], topSkills: [],
    };
    const daily14 = Array.isArray(dash?.daily14) ? dash.daily14 : [];
    const heatmap = Array.isArray(dash?.heatmap) ? dash.heatmap : [];
    const byModel = Array.isArray(b.byModel) && b.byModel.length ? b.byModel : (Array.isArray(dash?.byModel) ? dash.byModel : []);
    const topTools = Array.isArray(b.topTools) ? b.topTools : [];
    const topCommands = Array.isArray(b.topCommands) ? b.topCommands : [];
    const topSkills = Array.isArray(b.topSkills) ? b.topSkills : [];
    const byWorkspace = Array.isArray(dash?.byWorkspace) ? dash.byWorkspace : [];
    const allConvs = Array.isArray(dash?.conversations) ? dash.conversations : (Array.isArray(dash?.topConversations) ? dash.topConversations : []);
    const timings = b.timings || { waitSec: 0, thinkSec: 0, replySec: 0, toolSec: 0, totalSec: 0 };

    const inputTotal = b.cached + b.uncached;
    const cacheHitPct = inputTotal > 0 ? ((b.cached / inputTotal) * 100).toFixed(1) : '0.0';
    const periodLabel = { all: '全部累计', month: '近 30 天', week: '近 7 天', today: '今日' }[monitorPeriod] || '全部累计';
    const avgCostPerConv = b.sessions > 0 ? b.costUsd / b.sessions : 0;

    const cardBg = isSolid
      ? (dark ? '#151c2e' : '#ffffff')
      : dark
        ? (isLiquid ? 'linear-gradient(145deg, rgba(24,31,52,0.74), rgba(14,19,34,0.64))' : 'rgba(18,24,40,0.88)')
        : (isLiquid ? 'linear-gradient(145deg, rgba(255,255,255,0.84), rgba(245,248,255,0.7))' : 'rgba(255,255,255,0.94)');
    const borderCol = dark ? 'rgba(255,255,255,0.13)' : 'rgba(15,23,42,0.1)';
    const innerTop = dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.96)';
    const textMain = dark ? '#f8fafc' : '#0f172a';
    const textSub = dark ? '#cbd5e1' : '#334155';
    const textMuted = dark ? '#9fb0c7' : '#64748b';
    const trackBg = dark ? 'rgba(255,255,255,0.085)' : 'rgba(15,23,42,0.085)';
    const subCardBg = dark ? 'rgba(255,255,255,0.045)' : 'rgba(15,23,42,0.035)';

    let style = shadow.getElementById('agy-mon-style');
    let shell = shadow.getElementById('agy-mon-shell');
    let container = shadow.getElementById('agy-mon-container');
    if (!style) {
      style = document.createElement('style');
      style.id = 'agy-mon-style';
      shadow.appendChild(style);
    }
    if (monitorThemeKey !== themeKey) {
      monitorThemeKey = themeKey;
      style.textContent = `
      * { box-sizing: border-box; }
      @keyframes fadeSlide {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .shell {
        width: 100%; height: 100%; overflow-y: auto;
        padding: 22px 28px 40px;
        font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
        color: ${textMain};
        background: ${isSolid ? (dark ? '#0c101b' : '#f3f6fc') : (dark ? 'rgba(7, 11, 22, 0.56)' : 'rgba(243, 246, 252, 0.58)')};
        backdrop-filter: ${isSolid ? 'none' : isLiquid ? 'blur(20px) saturate(165%)' : 'blur(10px) saturate(120%)'};
      }
      .shell.entering { animation: fadeSlide 150ms cubic-bezier(.16,1,.3,1); }
      .shell::-webkit-scrollbar { width: 6px; }
      .shell::-webkit-scrollbar-thumb { background: ${dark ? 'rgba(148,163,184,0.28)' : 'rgba(15,23,42,0.18)'}; border-radius: 999px; }
      .container { max-width: 1280px; margin: 0 auto; }
      .topbar {
        display: flex; align-items: center; justify-content: space-between;
        flex-wrap: wrap; gap: 12px; margin-bottom: 18px;
      }
      .title-wrap { display: flex; align-items: center; gap: 12px; }
      .logo-box {
        width: 38px; height: 38px; border-radius: 12px;
        background: linear-gradient(135deg, #2563eb, #7c3aed, #10b981);
        display: grid; place-items: center; color: #fff; font-size: 17px; font-weight: 700;
        box-shadow: 0 8px 20px rgba(79,70,229,0.34), inset 0 1px 1px rgba(255,255,255,0.45);
      }
      .title-h h1 { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; }
      .subtitle { font-size: 11.5px; color: ${textMuted}; margin-top: 2px; }
      .nav-tabs {
        display: inline-flex; gap: 4px; padding: 4px; border-radius: 13px;
        background: ${dark ? 'rgba(15,23,42,0.62)' : 'rgba(255,255,255,0.78)'};
        border: 1px solid ${borderCol};
      }
      .nav-tabs button {
        border: 0; background: transparent; color: ${textSub};
        padding: 6px 14px; border-radius: 9px; font-size: 12.5px; font-weight: 600;
        cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        transition: all .14s ease;
      }
      .nav-tabs button:hover { color: ${textMain}; }
      .nav-tabs button.on {
        background: linear-gradient(135deg, #2563eb, #7c3aed);
        color: #ffffff; box-shadow: 0 3px 12px rgba(79,70,229,0.32);
      }
      .tab-cnt {
        font-size: 10.5px; padding: 0 6px; border-radius: 999px;
        background: rgba(255,255,255,0.18); font-weight: 700;
      }
      .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .seg {
        display: inline-flex; gap: 2px; padding: 3px; border-radius: 11px;
        background: ${dark ? 'rgba(15,23,42,0.58)' : 'rgba(255,255,255,0.75)'};
        border: 1px solid ${borderCol};
      }
      .seg button {
        border: 0; background: transparent; color: ${textSub};
        padding: 5px 10px; border-radius: 8px; font-size: 11.5px; font-weight: 600;
        cursor: pointer; transition: all .14s ease;
      }
      .seg button:hover { color: ${textMain}; }
      .seg button.on {
        background: ${dark ? 'rgba(99,102,241,0.42)' : '#2563eb'};
        color: #ffffff;
      }
      .act-btn {
        border: 1px solid ${borderCol}; background: ${cardBg}; color: ${textMain};
        border-radius: 10px; padding: 6px 12px; font-size: 12px; font-weight: 600;
        cursor: pointer; box-shadow: inset 0 1px 0 ${innerTop};
        transition: border-color .14s ease;
      }
      .act-btn:hover { border-color: rgba(99,102,241,0.65); }
      .kpi-grid-6 {
        display: grid; grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 12px; margin-bottom: 14px;
      }
      @media (max-width: 1280px) { .kpi-grid-6 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media (max-width: 720px) { .kpi-grid-6 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      .card {
        background: ${cardBg}; border: 1px solid ${borderCol};
        border-radius: 17px; padding: 15px 17px;
        box-shadow: ${dark
          ? '0 12px 32px rgba(0,0,0,0.32), inset 0 1px 0 ' + innerTop
          : '0 8px 24px rgba(15,23,42,0.07), inset 0 1px 0 ' + innerTop};
      }
      .kpi-card { padding: 13px 15px; }
      .kpi-lbl { font-size: 11.5px; font-weight: 600; color: ${textMuted}; display: flex; justify-content: space-between; align-items: center; gap: 4px; }
      .kpi-val { font-size: 25px; font-weight: 800; letter-spacing: -0.03em; margin: 7px 0 4px; line-height: 1.1; white-space: nowrap; }
      .grad-blue { background: linear-gradient(90deg, ${dark ? '#60a5fa, #a78bfa, #38bdf8' : '#1d4ed8, #7c3aed, #0284c7'}); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
      .grad-usd { background: linear-gradient(90deg, ${dark ? '#34d399, #fde047, #2dd4bf' : '#059669, #d97706, #0d9488'}); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
      .grad-save { background: linear-gradient(90deg, ${dark ? '#38bdf8, #c084fc' : '#0284c7, #7c3aed'}); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
      .kpi-sub { font-size: 11px; color: ${textSub}; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kpi-tag {
        font-size: 10px; padding: 2px 6px; border-radius: 999px; font-weight: 700; white-space: nowrap;
        background: ${dark ? 'rgba(52,211,153,0.16)' : 'rgba(16,185,129,0.14)'};
        color: ${dark ? '#6ee7b7' : '#047857'};
      }
      .grid-2-wide { display: grid; grid-template-columns: 1.32fr 1fr; gap: 14px; margin-bottom: 14px; }
      .grid-2-eq { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
      .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
      @media (max-width: 1020px) { .grid-2-wide, .grid-2-eq, .grid-3 { grid-template-columns: 1fr; } }
      .card-hd {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        margin-bottom: 13px;
      }
      .card-hd h2 { margin: 0; font-size: 13.5px; font-weight: 700; color: ${textMain}; }
      .hd-meta { font-size: 11px; color: ${textMuted}; }
      .mini-seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: ${trackBg}; }
      .mini-seg button {
        border: 0; background: transparent; color: ${textSub}; padding: 3px 9px;
        border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;
      }
      .mini-seg button.on {
        background: ${dark ? 'rgba(99,102,241,0.48)' : '#ffffff'};
        color: ${dark ? '#fff' : '#1d4ed8'};
      }
      /* 14-day Bar Chart */
      .chart-wrap { display: flex; align-items: flex-end; gap: 7px; height: 190px; padding: 18px 4px 2px; }
      .c-col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
      .c-val { font-size: 9.5px; font-weight: 600; color: ${textMuted}; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
      .c-bar {
        width: 100%; max-width: 32px; min-height: 4px; border-radius: 7px 7px 3px 3px;
        background: linear-gradient(180deg, #34d399 0%, #3b82f6 55%, #7c3aed 100%);
        box-shadow: 0 4px 12px rgba(59,130,246,0.24);
        transition: transform .14s ease, filter .14s ease;
      }
      .c-col:hover .c-bar { transform: scaleY(1.03); filter: brightness(1.15); }
      .c-col:hover .c-val { color: ${textMain}; }
      .c-lbl { font-size: 10px; color: ${textMuted}; margin-top: 6px; }
      /* Donut Layout */
      .donut-layout { display: flex; align-items: center; gap: 18px; }
      @media (max-width: 560px) { .donut-layout { flex-direction: column; align-items: flex-start; } }
      .donut-legend { flex: 1; min-width: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
      .leg-item {
        padding: 9px 11px; border-radius: 11px;
        background: ${subCardBg}; border: 1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)'};
      }
      .leg-top { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: ${textSub}; gap: 4px; }
      .leg-name { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
      .leg-val { font-size: 14.5px; font-weight: 700; margin-top: 4px; display: flex; align-items: baseline; justify-content: space-between; gap: 4px; }
      .leg-extra { font-size: 11px; font-weight: 700; color: ${dark ? '#6ee7b7' : '#059669'}; }
      .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      /* Heatmap */
      .heat-body { display: flex; gap: 10px; align-items: flex-start; }
      .heat-days { display: grid; grid-template-rows: repeat(7, 17px); gap: 5px; padding-top: 21px; font-size: 10px; color: ${textMuted}; flex-shrink: 0; }
      .heat-days span { line-height: 17px; }
      .heat-grid-wrap { flex: 1; min-width: 0; overflow-x: auto; padding-bottom: 2px; }
      .heat-months { display: grid; gap: 5px; height: 16px; margin-bottom: 5px; font-size: 10px; color: ${textMuted}; }
      .heat-months span { white-space: nowrap; overflow: visible; line-height: 16px; }
      .heat-cols { display: grid; gap: 5px; }
      .heat-col { display: grid; grid-template-rows: repeat(7, 17px); gap: 5px; }
      .h-cell {
        width: 100%; min-width: 16px; height: 17px; border-radius: 4px; cursor: pointer;
        border: 1px solid transparent; transition: transform .1s ease, border-color .1s ease;
      }
      .h-cell.empty { background: transparent; cursor: default; pointer-events: none; }
      .h-cell.lv0 { background: ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'}; }
      .h-cell.lv1 { background: ${dark ? 'rgba(56,189,248,0.28)' : 'rgba(59,130,246,0.22)'}; }
      .h-cell.lv2 { background: ${dark ? 'rgba(59,130,246,0.52)' : 'rgba(59,130,246,0.45)'}; }
      .h-cell.lv3 { background: ${dark ? 'rgba(99,102,241,0.78)' : 'rgba(79,70,229,0.7)'}; }
      .h-cell.lv4 { background: ${dark ? '#34d399' : '#059669'}; }
      .h-cell:hover { transform: scale(1.18); border-color: ${dark ? '#fff' : '#0f172a'}; }
      .h-cell.sel { border-color: #fde047; box-shadow: 0 0 0 1px #fde047; }
      .heat-foot {
        margin-top: 12px; padding-top: 10px; border-top: 1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)'};
        display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
        font-size: 11.5px; color: ${textSub};
      }
      .heat-foot b { color: ${textMain}; }
      .heat-scale { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; color: ${textMuted}; }
      .heat-scale i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; }
      /* Ranked Bars (Models / Tools / Commands / Skills) */
      .m-row { margin-bottom: 11px; }
      .m-row:last-child { margin-bottom: 0; }
      .m-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; font-size: 12px; }
      .m-name { display: flex; align-items: center; gap: 7px; font-weight: 600; min-width: 0; }
      .m-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .m-nums { display: flex; align-items: baseline; gap: 7px; flex-shrink: 0; }
      .m-usd { font-weight: 700; color: ${dark ? '#6ee7b7' : '#059669'}; }
      .m-tok { font-size: 11px; color: ${textMuted}; }
      .track { height: 6px; border-radius: 999px; background: ${trackBg}; overflow: hidden; }
      .fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #2563eb, #7c3aed, #10b981); }
      .m-rate { font-size: 10px; color: ${textMuted}; margin-top: 3px; display: flex; justify-content: space-between; }
      .rank-row { margin-bottom: 9px; }
      .rank-row:last-child { margin-bottom: 0; }
      .rank-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; margin-bottom: 4px; }
      .rank-lbl { display: flex; align-items: center; gap: 7px; min-width: 0; font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-weight: 600; }
      .rank-lbl span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .rank-val { display: flex; align-items: baseline; gap: 7px; flex-shrink: 0; font-size: 11.5px; color: ${textSub}; font-weight: 700; }
      .rank-sub { font-size: 10.5px; font-weight: 500; color: ${textMuted}; }
      /* Sessions Explorer Tab */
      .sess-toolbar {
        display: flex; align-items: center; justify-content: space-between;
        flex-wrap: wrap; gap: 10px; margin-bottom: 14px;
      }
      .sess-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1; min-width: 240px; }
      .search-inp {
        width: 240px; max-width: 100%; padding: 7px 12px; border-radius: 10px;
        border: 1px solid ${borderCol}; background: ${dark ? 'rgba(15,23,42,0.68)' : '#ffffff'};
        color: ${textMain}; font-size: 12px; outline: none;
      }
      .search-inp:focus { border-color: #6366f1; }
      .ws-pills { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
      .ws-pill {
        border: 1px solid ${borderCol}; background: ${subCardBg}; color: ${textSub};
        border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer;
      }
      .ws-pill.on {
        border-color: #6366f1;
        background: ${dark ? 'rgba(79,70,229,0.34)' : 'rgba(79,70,229,0.12)'};
        color: ${dark ? '#e0e7ff' : '#3730a3'};
      }
      .sess-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 13px;
      }
      .sess-card {
        background: ${cardBg}; border: 1px solid ${borderCol};
        border-radius: 16px; padding: 14px 15px; cursor: pointer;
        box-shadow: ${dark ? '0 8px 24px rgba(0,0,0,0.26), inset 0 1px 0 ' + innerTop : '0 6px 18px rgba(15,23,42,0.06), inset 0 1px 0 ' + innerTop};
        transition: transform .14s ease, border-color .14s ease;
      }
      .sess-card:hover { transform: translateY(-2px); border-color: rgba(99,102,241,0.62); }
      .sess-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 7px; }
      .sess-title { font-size: 13px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sess-time { font-size: 10.5px; color: ${textMuted}; flex-shrink: 0; }
      .sess-tags { display: flex; align-items: center; gap: 5px; margin-bottom: 11px; flex-wrap: wrap; }
      .s-tag {
        font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px;
        background: ${subCardBg}; color: ${textSub}; border: 1px solid ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.08)'};
      }
      .sess-body { display: flex; align-items: center; gap: 14px; }
      .sess-metrics { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; }
      .sm-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
      .sm-k { color: ${textMuted}; }
      .sm-v { font-weight: 700; color: ${textMain}; }
      .sm-usd { font-weight: 800; color: ${dark ? '#34d399' : '#059669'}; font-size: 13px; }
      .quota-strip {
        margin-top: 12px; padding-top: 10px;
        border-top: 1px solid ${dark ? 'rgba(255,255,255,0.09)' : 'rgba(15,23,42,0.08)'};
      }
    `;
    }

    if (!shell) {
      shell = document.createElement('div');
      shell.id = 'agy-mon-shell';
      shell.className = 'shell entering';
      shell.addEventListener('animationend', () => shell.classList.remove('entering'), { once: true });
      container = document.createElement('div');
      container.id = 'agy-mon-container';
      container.className = 'container';
      shell.appendChild(container);
      shadow.appendChild(shell);
    }

    // Shared computations
    const totalTokComp = Math.max(1, b.cached + b.uncached + b.think + b.reply);
    const tokenSegs = [
      { label: '缓存读取', value: b.cached, pct: (b.cached / totalTokComp) * 100, main: fmtTok(b.cached), extra: fmtUsd(b.cachedUsd), color: '#06b6d4' },
      { label: '未缓存输入', value: b.uncached, pct: (b.uncached / totalTokComp) * 100, main: fmtTok(b.uncached), extra: fmtUsd(b.inputUsd), color: '#3b82f6' },
      { label: '深度思考', value: b.think, pct: (b.think / totalTokComp) * 100, main: fmtTok(b.think), extra: '含于输出', color: '#8b5cf6' },
      { label: '回复输出', value: b.reply, pct: (b.reply / totalTokComp) * 100, main: fmtTok(b.reply), extra: fmtUsd(b.outputUsd), color: '#10b981' },
    ];
    const totalTimeSec = Math.max(0.01, timings.totalSec || (timings.waitSec + timings.thinkSec + timings.replySec + timings.toolSec));
    const timeSegs = [
      { label: '工具执行', value: timings.toolSec, pct: (timings.toolSec / totalTimeSec) * 100, main: fmtDur(timings.toolSec), extra: `${b.toolCalls} 次`, color: '#f59e0b' },
      { label: '模型等待', value: timings.waitSec, pct: (timings.waitSec / totalTimeSec) * 100, main: fmtDur(timings.waitSec), extra: `${b.requests} 次`, color: '#3b82f6' },
      { label: '模型回复', value: timings.replySec, pct: (timings.replySec / totalTimeSec) * 100, main: fmtDur(timings.replySec), extra: b.avgSpeed ? `${b.avgSpeed} t/s` : '', color: '#10b981' },
      { label: '模型思考', value: timings.thinkSec, pct: (timings.thinkSec / totalTimeSec) * 100, main: fmtDur(timings.thinkSec), extra: fmtTok(b.think), color: '#a855f7' },
    ];
    const renderDonutCardBody = (segs, centerTop, centerSub) => `
      <div class="donut-layout">
        ${buildDonutSvg(segs, centerTop, centerSub, trackBg, textMain, textMuted)}
        <div class="donut-legend">
          ${segs.map(s => `
            <div class="leg-item">
              <div class="leg-top">
                <span class="leg-name"><i class="dot" style="background:${s.color}"></i>${s.label}</span>
                <span>${s.pct.toFixed(1)}%</span>
              </div>
              <div class="leg-val"><span>${s.main}</span><span class="leg-extra">${s.extra}</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Build body HTML for current tab
    let bodyHtml = '';

    if (monitorTab === 'overview') {
      const maxBarVal = Math.max(0.0001, ...daily14.map(d => (monitorChartMode === 'usd' ? d.costUsd : d.tokens)));
      const maxModelUsd = Math.max(0.0001, ...byModel.map(m => m.costUsd));
      const totalModelUsd = Math.max(0.0001, byModel.reduce((a, m) => a + m.costUsd, 0));

      // Align 84-day heatmap into Monday-first columns
      const padLead = heatmap.length ? heatmap[0].dow : 0;
      const heatCells = [...Array.from({ length: padLead }, () => null), ...heatmap];
      const weeks = [];
      for (let i = 0; i < heatCells.length; i += 7) weeks.push(heatCells.slice(i, i + 7));
      const maxHeat = Math.max(0.0001, ...heatmap.map(d => (monitorHeatMode === 'usd' ? d.costUsd : d.tokens)));
      const defaultDay = [...heatmap].reverse().find(d => d.tokens > 0) || heatmap[heatmap.length - 1] || null;
      const activeDayObj = heatmap.find(d => d.date === monitorSelectedDay) || defaultDay;
      if (activeDayObj && !monitorSelectedDay) monitorSelectedDay = activeDayObj.date;

      const monthMarks = [];
      let lastMo = '';
      weeks.forEach((wk, idx) => {
        const firstReal = wk.find(Boolean);
        const mo = firstReal ? firstReal.date.slice(5, 7) + '月' : '';
        monthMarks.push(mo && mo !== lastMo ? (lastMo = mo, mo) : '');
      });

      const ovSegs = monitorOverviewDonut === 'time' ? timeSegs : tokenSegs;
      const ovCenterTop = monitorOverviewDonut === 'time' ? fmtDur(timings.totalSec) : fmtTok(b.tokens);
      const ovCenterSub = monitorOverviewDonut === 'time' ? '活跃时长' : '总 Token';

      bodyHtml = `
        <div class="kpi-grid-6">
          <div class="card kpi-card">
            <div class="kpi-lbl"><span>总 Token</span><span class="kpi-tag">${periodLabel}</span></div>
            <div class="kpi-val grad-blue">${fmtTok(b.tokens)}</div>
            <div class="kpi-sub">输入 ${fmtTok(b.uncached)} · 缓存 ${fmtTok(b.cached)}</div>
          </div>
          <div class="card kpi-card">
            <div class="kpi-lbl"><span>美元</span><span class="kpi-tag">${fmtCny(b.costUsd)}</span></div>
            <div class="kpi-val grad-usd">${fmtUsd(b.costUsd)}</div>
            <div class="kpi-sub">入 ${fmtUsd(b.inputUsd)} · 缓 ${fmtUsd(b.cachedUsd)} · 出 ${fmtUsd(b.outputUsd)}</div>
          </div>
          <div class="card kpi-card">
            <div class="kpi-lbl"><span>缓存节省</span><span class="kpi-tag">命中 ${cacheHitPct}%</span></div>
            <div class="kpi-val grad-save">${fmtUsd(b.savedUsd)}</div>
            <div class="kpi-sub">相比无缓存省下 ${fmtCny(b.savedUsd).replace(/^≈\s*/, '')}</div>
          </div>
          <div class="card kpi-card">
            <div class="kpi-lbl"><span>工具调用</span><span class="kpi-tag">${fmtDur(timings.toolSec)}</span></div>
            <div class="kpi-val">${b.toolCalls.toLocaleString('en-US')}</div>
            <div class="kpi-sub">模型调用 ${b.requests.toLocaleString('en-US')} 次</div>
          </div>
          <div class="card kpi-card">
            <div class="kpi-lbl"><span>活跃时长</span><span class="kpi-tag">${b.avgSpeed ? b.avgSpeed + ' t/s' : '—'}</span></div>
            <div class="kpi-val">${fmtDur(timings.totalSec)}</div>
            <div class="kpi-sub">模型 ${fmtDur(timings.waitSec + timings.thinkSec + timings.replySec)} · 工具 ${fmtDur(timings.toolSec)}</div>
          </div>
          <div class="card kpi-card">
            <div class="kpi-lbl"><span>会话数</span><span class="kpi-tag">${b.turns} 轮</span></div>
            <div class="kpi-val">${b.sessions}</div>
            <div class="kpi-sub">均价 ${fmtUsd(avgCostPerConv)} / 会话</div>
          </div>
        </div>

        <div class="grid-2-wide">
          <div class="card">
            <div class="card-hd">
              <h2>近 14 天趋势（${monitorChartMode === 'usd' ? '美元' : 'Token'}）</h2>
              <div class="mini-seg" id="monChartMode">
                <button type="button" data-m="usd" class="${monitorChartMode === 'usd' ? 'on' : ''}">$ 美元</button>
                <button type="button" data-m="tokens" class="${monitorChartMode === 'tokens' ? 'on' : ''}">Token</button>
              </div>
            </div>
            <div class="chart-wrap">
              ${daily14.map(d => {
                const v = monitorChartMode === 'usd' ? d.costUsd : d.tokens;
                const h = v > 0 ? Math.max(8, Math.round((v / maxBarVal) * 136)) : 4;
                const topTxt = v > 0 ? (monitorChartMode === 'usd' ? fmtUsd(v) : fmtTok(v)) : '';
                const tip = `${d.date}\n美元：${fmtUsd(d.costUsd)} (${fmtCny(d.costUsd)})\nToken：${fmtTok(d.tokens)}\n调用：${d.requests} 次 · ${d.sessions} 个会话`;
                return `<div class="c-col" title="${escHtml(tip)}">
                  <div class="c-val">${topTxt}</div>
                  <div class="c-bar" style="height:${h}px;opacity:${v > 0 ? 1 : 0.25}"></div>
                  <div class="c-lbl">${d.date.slice(5)}</div>
                </div>`;
              }).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-hd">
              <h2>${monitorOverviewDonut === 'time' ? '耗时分布' : 'Token 构成'}（${periodLabel}）</h2>
              <div class="mini-seg" id="monOvDonut">
                <button type="button" data-d="tokens" class="${monitorOverviewDonut === 'tokens' ? 'on' : ''}">Token</button>
                <button type="button" data-d="time" class="${monitorOverviewDonut === 'time' ? 'on' : ''}">耗时</button>
              </div>
            </div>
            ${renderDonutCardBody(ovSegs, ovCenterTop, ovCenterSub)}
          </div>
        </div>

        <div class="grid-2-eq">
          <div class="card">
            <div class="card-hd">
              <h2>近 20 周活跃度</h2>
              <div class="mini-seg" id="monHeatMode">
                <button type="button" data-h="usd" class="${monitorHeatMode === 'usd' ? 'on' : ''}">$ 美元</button>
                <button type="button" data-h="tokens" class="${monitorHeatMode === 'tokens' ? 'on' : ''}">Token</button>
              </div>
            </div>
            <div class="heat-body">
              <div class="heat-days">
                <span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span>日</span>
              </div>
              <div class="heat-grid-wrap">
                <div class="heat-months" style="grid-template-columns:repeat(${weeks.length}, minmax(16px, 1fr));">
                  ${monthMarks.map(m => `<span>${m}</span>`).join('')}
                </div>
                <div class="heat-cols" style="grid-template-columns:repeat(${weeks.length}, minmax(16px, 1fr));">
                  ${weeks.map(wk => `<div class="heat-col">${wk.map(d => {
                    if (!d) return '<div class="h-cell empty"></div>';
                    const v = monitorHeatMode === 'usd' ? d.costUsd : d.tokens;
                    const lv = v <= 0 ? 0 : v <= maxHeat * 0.25 ? 1 : v <= maxHeat * 0.5 ? 2 : v <= maxHeat * 0.78 ? 3 : 4;
                    const sel = d.date === monitorSelectedDay ? ' sel' : '';
                    const tip = `${d.date} · 美元 ${fmtUsd(d.costUsd)} · Token ${fmtTok(d.tokens)} · ${d.requests} 次调用`;
                    return `<div class="h-cell lv${lv}${sel}" data-day="${d.date}" title="${escHtml(tip)}"></div>`;
                  }).join('')}</div>`).join('')}
                </div>
              </div>
            </div>
            <div class="heat-foot">
              <span id="monHeatInfo">${activeDayObj
                ? `<b>${activeDayObj.date}</b> · 美元 <b>${fmtUsd(activeDayObj.costUsd)}</b> · Token <b>${fmtTok(activeDayObj.tokens)}</b> · ${activeDayObj.requests} 次调用 · ${activeDayObj.sessions} 个会话`
                : '暂无活跃记录'}</span>
              <span class="heat-scale">
                少
                <i style="background:${dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'}"></i>
                <i style="background:${dark ? 'rgba(56,189,248,0.28)' : 'rgba(59,130,246,0.22)'}"></i>
                <i style="background:${dark ? 'rgba(59,130,246,0.52)' : 'rgba(59,130,246,0.45)'}"></i>
                <i style="background:${dark ? 'rgba(99,102,241,0.78)' : 'rgba(79,70,229,0.7)'}"></i>
                <i style="background:${dark ? '#34d399' : '#059669'}"></i>
                多
              </span>
            </div>
          </div>

          <div class="card">
            <div class="card-hd">
              <h2>模型费用排行</h2>
              <span class="hd-meta">合计 ${fmtUsd(b.costUsd)}</span>
            </div>
            ${byModel.length ? byModel.slice(0, 5).map(m => {
              const pct = Math.round((m.costUsd / totalModelUsd) * 100);
              const barW = Math.max(4, Math.round((m.costUsd / maxModelUsd) * 100));
              return `<div class="m-row">
                <div class="m-top">
                  <div class="m-name"><span class="dot" style="background:${modelAccentColor(m.model)}"></span><span>${escHtml(m.model)}</span></div>
                  <div class="m-nums"><span class="m-usd">${fmtUsd(m.costUsd)}</span><span class="m-tok">${fmtTok(m.tokens)} · ${pct}%</span></div>
                </div>
                <div class="track"><div class="fill" style="width:${barW}%"></div></div>
                <div class="m-rate"><span>${m.requests} 次调用 · 省 ${fmtUsd(m.savedUsd)}</span><span>单价 $${m.inPerM}/$${m.cachedPerM}/$${m.outPerM} per 1M</span></div>
              </div>`;
            }).join('') : `<div style="color:${textMuted};padding:20px 0;text-align:center;">该时段暂无模型调用记录</div>`}
            ${(() => {
              const qGroups = collectQuotaWindows(quotas);
              if (!qGroups.length) return '';
              return `<div class="quota-strip">
                <div style="font-size:11.5px;font-weight:700;color:${textMain};margin-bottom:8px;">实时配额与重置时间</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
                  ${qGroups.slice(0, 2).map(g => `<div style="padding:8px 10px;border-radius:11px;background:${subCardBg};border:1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)'};">
                    <div style="font-size:11.5px;font-weight:700;color:${textMain};margin-bottom:6px;">${escHtml(g.name)}</div>
                    ${g.windows.map(w => {
                      const rst = fmtResetTime(w.resetTime, false) || (w.pct >= 100 ? '满额' : '');
                      const col = w.pct <= 20 ? '#ef4444' : w.pct <= 50 ? '#f59e0b' : 'linear-gradient(90deg,#2563eb,#38bdf8,#10b981)';
                      return `<div style="margin-bottom:6px;">
                        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px;font-size:10.5px;margin-bottom:3px;">
                          <span style="color:${textSub};font-weight:600;">${escHtml(w.label)} · <b style="color:${textMain};">${w.pct}%</b></span>
                          <span style="color:${textMuted};font-size:10px;">${escHtml(rst)}</span>
                        </div>
                        <div class="track"><div class="fill" style="width:${w.pct}%;background:${col};"></div></div>
                      </div>`;
                    }).join('')}
                  </div>`).join('')}
                </div>
              </div>`;
            })()}
          </div>
        </div>
      `;
    } else if (monitorTab === 'insights') {
      const toolColors = ['#38bdf8', '#818cf8', '#34d399', '#f59e0b', '#f472b6', '#2dd4bf', '#a78bfa', '#60a5fa', '#fb923c', '#94a3b8'];
      const maxTool = Math.max(1, ...topTools.map(t => t.count));
      const maxCmd = Math.max(1, ...topCommands.map(c => c.count));
      const maxSkill = Math.max(1, ...topSkills.map(s => s.count));
      const maxWs = Math.max(0.0001, ...byWorkspace.map(w => w.costUsd));

      bodyHtml = `
        <div class="grid-2-eq">
          <div class="card">
            <div class="card-hd">
              <h2>Token 构成（${periodLabel}）</h2>
              <span class="hd-meta">合计 ${fmtTok(b.tokens)} · ${fmtUsd(b.costUsd)}</span>
            </div>
            ${renderDonutCardBody(tokenSegs, fmtTok(b.tokens), '总 Token')}
          </div>
          <div class="card">
            <div class="card-hd">
              <h2>耗时分布（${periodLabel}）</h2>
              <span class="hd-meta">输出速率 ${b.avgSpeed ? b.avgSpeed + ' tok/s' : '—'}</span>
            </div>
            ${renderDonutCardBody(timeSegs, fmtDur(timings.totalSec), '活跃时长')}
          </div>
        </div>

        <div class="grid-3">
          <div class="card">
            <div class="card-hd">
              <h2>工具调用 TOP 10</h2>
              <span class="hd-meta">${b.toolCalls.toLocaleString('en-US')} 次</span>
            </div>
            ${topTools.length ? topTools.map((t, i) => `
              <div class="rank-row">
                <div class="rank-top">
                  <div class="rank-lbl"><i class="dot" style="background:${toolColors[i % toolColors.length]}"></i><span>${escHtml(t.name)}</span></div>
                  <div class="rank-val"><span class="rank-sub">${t.durationSec > 0 ? fmtDur(t.durationSec) : ''}</span><span>×${t.count}</span></div>
                </div>
                <div class="track"><div class="fill" style="width:${Math.max(4, Math.round((t.count / maxTool) * 100))}%;background:${toolColors[i % toolColors.length]}"></div></div>
              </div>
            `).join('') : `<div style="color:${textMuted};padding:20px 0;text-align:center;">该时段暂无工具调用</div>`}
          </div>

          <div class="card">
            <div class="card-hd">
              <h2>命令执行 TOP 10</h2>
              <span class="hd-meta">${topCommands.reduce((a, c) => a + c.count, 0)} 次</span>
            </div>
            ${topCommands.length ? topCommands.map((c, i) => `
              <div class="rank-row">
                <div class="rank-top">
                  <div class="rank-lbl"><i class="dot" style="background:${toolColors[(i + 2) % toolColors.length]}"></i><span>${escHtml(c.name)}</span></div>
                  <div class="rank-val"><span>×${c.count}</span></div>
                </div>
                <div class="track"><div class="fill" style="width:${Math.max(4, Math.round((c.count / maxCmd) * 100))}%;background:${toolColors[(i + 2) % toolColors.length]}"></div></div>
              </div>
            `).join('') : `<div style="color:${textMuted};padding:20px 0;text-align:center;">该时段暂无终端命令记录</div>`}
          </div>

          <div class="card">
            <div class="card-hd">
              <h2>${monitorCol3Mode === 'skills' ? '技能调用' : '项目分布'}</h2>
              <div class="mini-seg" id="monCol3Mode">
                <button type="button" data-c3="skills" class="${monitorCol3Mode === 'skills' ? 'on' : ''}">技能</button>
                <button type="button" data-c3="workspaces" class="${monitorCol3Mode === 'workspaces' ? 'on' : ''}">项目</button>
              </div>
            </div>
            ${monitorCol3Mode === 'skills'
              ? (topSkills.length ? topSkills.map((sk, i) => `
                <div class="rank-row">
                  <div class="rank-top">
                    <div class="rank-lbl"><i class="dot" style="background:${toolColors[(i + 4) % toolColors.length]}"></i><span>${escHtml(sk.name)}</span></div>
                    <div class="rank-val"><span class="rank-sub">${sk.lastUsedMs ? fmtRelTime(sk.lastUsedMs) : ''}</span><span>×${sk.count}</span></div>
                  </div>
                  <div class="track"><div class="fill" style="width:${Math.max(6, Math.round((sk.count / maxSkill) * 100))}%;background:${toolColors[(i + 4) % toolColors.length]}"></div></div>
                </div>
              `).join('') : `<div style="color:${textMuted};padding:20px 0;text-align:center;">该时段暂无技能加载记录</div>`)
              : (byWorkspace.length ? byWorkspace.slice(0, 8).map((w, i) => `
                <div class="rank-row">
                  <div class="rank-top">
                    <div class="rank-lbl" style="font-family:inherit;"><i class="dot" style="background:${toolColors[i % toolColors.length]}"></i><span>${escHtml(w.name)}</span></div>
                    <div class="rank-val"><span class="rank-sub">${w.sessions} 会话 · ${fmtTok(w.tokens)}</span><span class="m-usd">${fmtUsd(w.costUsd)}</span></div>
                  </div>
                  <div class="track"><div class="fill" style="width:${Math.max(4, Math.round((w.costUsd / maxWs) * 100))}%"></div></div>
                </div>
              `).join('') : `<div style="color:${textMuted};padding:20px 0;text-align:center;">暂无项目统计</div>`)}
          </div>
        </div>
      `;
    } else {
      // Tab 3: Searchable & Sortable All-Sessions Explorer
      const wsChips = byWorkspace.slice(0, 6);
      bodyHtml = `
        <div class="sess-toolbar">
          <div class="sess-left">
            <input id="monSearch" class="search-inp" type="text" placeholder="搜索会话标题、项目或模型..." value="${escHtml(monitorSearch)}" />
            <div class="ws-pills" id="monWsPills">
              <button type="button" data-ws="all" class="ws-pill ${monitorWorkspace === 'all' ? 'on' : ''}">全部 ${allConvs.length}</button>
              ${wsChips.map(w => `<button type="button" data-ws="${escHtml(w.name)}" class="ws-pill ${monitorWorkspace === w.name ? 'on' : ''}">${escHtml(w.name)} ${w.sessions}</button>`).join('')}
            </div>
          </div>
          <div class="seg" id="monSort">
            <button type="button" data-s="cost" class="${monitorSort === 'cost' ? 'on' : ''}">按美元</button>
            <button type="button" data-s="tokens" class="${monitorSort === 'tokens' ? 'on' : ''}">按 Token</button>
            <button type="button" data-s="recent" class="${monitorSort === 'recent' ? 'on' : ''}">最近更新</button>
            <button type="button" data-s="context" class="${monitorSort === 'context' ? 'on' : ''}">当前上下文</button>
          </div>
        </div>
        <div class="sess-grid" id="monSessGrid"></div>
      `;
    }

    container.innerHTML = `
      <div class="topbar">
        <div class="title-wrap">
          <div class="logo-box">✦</div>
          <div>
            <div class="title-h"><h1>Token 与美元监控台</h1></div>
            <div class="subtitle">${dash?.scannedConversations || 0} 个本地会话 · ${periodLabel}</div>
          </div>
        </div>
        <div class="nav-tabs" id="monTabs">
          <button type="button" data-t="overview" class="${monitorTab === 'overview' ? 'on' : ''}">总览</button>
          <button type="button" data-t="insights" class="${monitorTab === 'insights' ? 'on' : ''}">工具与耗时</button>
          <button type="button" data-t="sessions" class="${monitorTab === 'sessions' ? 'on' : ''}">全部会话 <span class="tab-cnt">${allConvs.length}</span></button>
        </div>
        <div class="actions">
          <div class="seg" id="monPeriods" style="${monitorTab === 'sessions' ? 'opacity:0.45;pointer-events:none;' : ''}">
            <button type="button" data-p="today" class="${monitorPeriod === 'today' ? 'on' : ''}">今日</button>
            <button type="button" data-p="week" class="${monitorPeriod === 'week' ? 'on' : ''}">近 7 天</button>
            <button type="button" data-p="month" class="${monitorPeriod === 'month' ? 'on' : ''}">近 30 天</button>
            <button type="button" data-p="all" class="${monitorPeriod === 'all' ? 'on' : ''}">全部</button>
          </div>
          <button type="button" class="act-btn" id="monRefresh">↻ 刷新</button>
          <button type="button" class="act-btn" id="monClose">✕ 返回对话</button>
        </div>
      </div>
      ${bodyHtml}
    `;

    // Bind Topbar Controls
    for (const btn of container.querySelectorAll('#monTabs button')) {
      btn.onclick = () => {
        if (monitorTab === btn.dataset.t) return;
        monitorTab = btn.dataset.t;
        renderMonitorOverlay(true);
      };
    }
    for (const btn of container.querySelectorAll('#monPeriods button')) {
      btn.onclick = () => {
        if (monitorPeriod === btn.dataset.p) return;
        monitorPeriod = btn.dataset.p;
        renderMonitorOverlay(true);
      };
    }
    container.querySelector('#monRefresh').onclick = () => {
      invokeSidecar({ action: 'refreshDashboard' });
      showToast('已刷新用量统计');
    };
    container.querySelector('#monClose').onclick = closeMonitorOverlay;

    // Bind Overview Controls
    for (const btn of container.querySelectorAll('#monChartMode button')) {
      btn.onclick = () => {
        if (monitorChartMode === btn.dataset.m) return;
        monitorChartMode = btn.dataset.m;
        renderMonitorOverlay(true);
      };
    }
    for (const btn of container.querySelectorAll('#monOvDonut button')) {
      btn.onclick = () => {
        if (monitorOverviewDonut === btn.dataset.d) return;
        monitorOverviewDonut = btn.dataset.d;
        renderMonitorOverlay(true);
      };
    }
    for (const btn of container.querySelectorAll('#monHeatMode button')) {
      btn.onclick = () => {
        if (monitorHeatMode === btn.dataset.h) return;
        monitorHeatMode = btn.dataset.h;
        renderMonitorOverlay(true);
      };
    }
    const heatInfoEl = container.querySelector('#monHeatInfo');
    for (const cell of container.querySelectorAll('.h-cell[data-day]')) {
      cell.onclick = () => {
        monitorSelectedDay = cell.dataset.day;
        for (const c of container.querySelectorAll('.h-cell.sel')) c.classList.remove('sel');
        cell.classList.add('sel');
        const d = heatmap.find(x => x.date === monitorSelectedDay);
        if (d && heatInfoEl) {
          heatInfoEl.innerHTML = `<b>${d.date}</b> · 美元 <b>${fmtUsd(d.costUsd)}</b> · Token <b>${fmtTok(d.tokens)}</b> · ${d.requests} 次调用 · ${d.sessions} 个会话`;
        }
      };
    }

    // Bind Insights Controls
    for (const btn of container.querySelectorAll('#monCol3Mode button')) {
      btn.onclick = () => {
        if (monitorCol3Mode === btn.dataset.c3) return;
        monitorCol3Mode = btn.dataset.c3;
        renderMonitorOverlay(true);
      };
    }

    // Bind Sessions Tab (renders cards independently so typing in search NEVER drops focus!)
    if (monitorTab === 'sessions') {
      const grid = container.querySelector('#monSessGrid');
      const renderSessionCards = () => {
        if (!grid) return;
        const q = monitorSearch.trim().toLowerCase();
        const filtered = allConvs.filter(c => {
          if (monitorWorkspace !== 'all' && c.workspace !== monitorWorkspace) return false;
          if (!q) return true;
          return `${c.title} ${c.workspace} ${c.model} ${c.id}`.toLowerCase().includes(q);
        });
        const sorted = [...filtered].sort((a, c2) => {
          if (monitorSort === 'tokens') return c2.tokens - a.tokens;
          if (monitorSort === 'recent') return (c2.lastUpdatedMs || 0) - (a.lastUpdatedMs || 0);
          if (monitorSort === 'context') return (c2.contextPct || 0) - (a.contextPct || 0);
          return c2.costUsd - a.costUsd;
        });
        if (!sorted.length) {
          grid.innerHTML = `<div class="card" style="grid-column:1/-1;text-align:center;color:${textMuted};padding:28px;">没有匹配的会话记录</div>`;
          return;
        }
        grid.innerHTML = sorted.map(c => `
          <div class="sess-card" data-cid="${escHtml(c.id)}" title="点击跳转到该会话">
            <div class="sess-head">
              <div class="sess-title">${escHtml(c.title)}</div>
              <div class="sess-time">${fmtRelTime(c.lastUpdatedMs)}</div>
            </div>
            <div class="sess-tags">
              <span class="s-tag">${escHtml(c.workspace || '全局对话')}</span>
              <span class="s-tag" style="display:inline-flex;align-items:center;gap:4px;"><i class="dot" style="width:6px;height:6px;background:${modelAccentColor(c.model)}"></i>${escHtml(c.model)}</span>
            </div>
            <div class="sess-body">
              ${buildContextRingSvg(c.contextPct, fmtTok(c.usedContext), trackBg, textMain, textMuted)}
              <div class="sess-metrics">
                <div class="sm-row"><span class="sm-k">美元</span><span class="sm-usd">${fmtUsd(c.costUsd)}</span></div>
                <div class="sm-row"><span class="sm-k">总 Token</span><span class="sm-v">${fmtTok(c.tokens)}</span></div>
                <div class="sm-row"><span class="sm-k">轮次 / 工具</span><span class="sm-v">${c.turns || 0} 轮 · ${c.toolCalls || 0} 工具</span></div>
                <div class="sm-row"><span class="sm-k">活跃时长</span><span class="sm-v">${fmtDur(c.activeSec)}</span></div>
              </div>
            </div>
          </div>
        `).join('');
        for (const card of grid.querySelectorAll('.sess-card[data-cid]')) {
          card.onclick = () => openConversationById(card.dataset.cid);
        }
      };
      renderSessionCards();

      const searchEl = container.querySelector('#monSearch');
      if (searchEl) {
        searchEl.oninput = () => {
          monitorSearch = searchEl.value;
          renderSessionCards();
        };
      }
      for (const btn of container.querySelectorAll('#monWsPills button')) {
        btn.onclick = () => {
          monitorWorkspace = btn.dataset.ws;
          for (const b2 of container.querySelectorAll('#monWsPills button')) b2.classList.toggle('on', b2 === btn);
          renderSessionCards();
        };
      }
      for (const btn of container.querySelectorAll('#monSort button')) {
        btn.onclick = () => {
          monitorSort = btn.dataset.s;
          for (const b2 of container.querySelectorAll('#monSort button')) b2.classList.toggle('on', b2 === btn);
          renderSessionCards();
        };
      }
    }
  };

  const toggleMonitorOverlay = () => {
    if (monitorOpen) {
      closeMonitorOverlay();
      return;
    }
    closeModelPopover();
    closeStudioPopover();
    monitorOpen = true;
    document.documentElement.setAttribute('data-agy-monitor-open', '1');
    invokeSidecar({ action: 'refreshDashboard' });
    renderMonitorOverlay();
    updateMonitorNavVisual();
    document.addEventListener('keydown', onMonitorKeyDown, true);
  };

  const syncMonitorNav = () => {
    if (disposed || settings.showSidebarMonitor === false) {
      monitorNavBtn?.remove();
      monitorNavBtn = null;
      if (monitorOpen) closeMonitorOverlay();
      return;
    }
    const autoBtn = document.querySelector('button[data-testid="automations-button"]');
    const navParent = autoBtn?.parentElement;
    if (!navParent) return;
    if (!monitorNavBtn || !monitorNavBtn.isConnected || monitorNavBtn.parentElement !== navParent) {
      monitorNavBtn?.remove();
      monitorNavBtn = document.createElement('button');
      monitorNavBtn.id = 'agy-beautify-monitor-nav';
      monitorNavBtn.type = 'button';
      monitorNavBtn.className = 'agy-button agy-button-custom inline-flex items-center font-medium transition-colors select-none outline-none cursor-pointer flex-grow w-full justify-between font-normal min-w-0 gap-1.5 px-2 rounded-lg py-1.5 bg-transparent text-secondary-foreground hover:bg-sidebar-muted hover:text-foreground';
      monitorNavBtn.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:8px;min-width:0;overflow:hidden;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.9;">
            <path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>
          </svg>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">监控台</span>
        </span>
        <span class="agy-mon-badge" style="display:none;font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:999px;background:rgba(16,185,129,0.16);color:#34d399;flex-shrink:0;"></span>
      `;
      monitorNavBtn.onclick = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        toggleMonitorOverlay();
      };
      navParent.appendChild(monitorNavBtn);
    }
    updateMonitorNavVisual();
  };

  const syncTimer = setInterval(() => {
    if (disposed) return;
    syncContextCapsule();
    syncMonitorNav();
    syncTitleBarOverlay(false);
    if (settings.wallpaperId && settings.wallpaperId !== 'none' && wallpaperDataUri && (!wpLayer || !wpLayer.isConnected)) {
      applyWallpaperAndTheme();
    }
  }, 1500);

  if (settings.autoChinese !== false) runLocalization(document.body);
  applyWallpaperAndTheme();
  syncMonitorNav();

  const api = {
    owner,
    hash,
    resolveFileFromTarget,
    readConversationId() {
      const view = document.querySelector('[data-testid="conversation-view"][data-cascade-id]');
      const id = view?.getAttribute('data-cascade-id') || location.pathname.match(/\/c\/([0-9a-f-]{36})/i)?.[1] || '';
      return /^[0-9a-f-]{36}$/i.test(id) ? id : '';
    },
    updateSettings(next, meta) {
      if (!next || typeof next !== 'object') return false;
      const fromSidecar = meta && typeof meta.sidecarRev === 'number' && meta.sidecarRev > lastSidecarRev;
      if (fromSidecar) {
        lastSidecarRev = meta.sidecarRev;
      } else if (meta && typeof meta.ackClientRev === 'number' && meta.ackClientRev < localRev) {
        // Ignore stale in-flight tick snapshot from before newer local Quick Studio clicks/drags
        return false;
      }
      if (studioDragging && !fromSidecar) return false;
      const prevZh = settings.autoChinese;
      settings = { ...settings, ...next };
      if ('wallpaperId' in next) {
        if (!next.wallpaperId || next.wallpaperId === 'none') {
          wallpaperDataUri = '';
        } else if (wpUriCache.has(next.wallpaperId)) {
          wallpaperDataUri = wpUriCache.get(next.wallpaperId);
        }
      }
      if (settings.autoChinese === false && prevZh !== false) restoreLocalization();
      else if (settings.autoChinese !== false) runLocalization(document.body);
      applyWallpaperAndTheme();
      syncContextCapsule();
      syncMonitorNav();
      if (studioPopoverHost) { renderStudioContent(); repositionStudio(); }
      if (monitorOpen) renderMonitorOverlay();
      return true;
    },
    setCatalogs(wps, presets) {
      if (Array.isArray(wps)) {
        wallpaperCatalog = wps;
        for (const w of wps) {
          if (w?.id && w?.dataUri) wpUriCache.set(w.id, w.dataUri);
        }
      }
      if (Array.isArray(presets)) presetsCatalog = presets;
      if (studioPopoverHost && !studioDragging) { renderStudioContent(); repositionStudio(); }
      return true;
    },
    setWallpaperDataUri(dataUri, wpId) {
      const uri = typeof dataUri === 'string' ? dataUri : '';
      const targetId = wpId || settings.wallpaperId;
      if (targetId && uri) wpUriCache.set(targetId, uri);
      if (wpId && wpId !== settings.wallpaperId) return false;
      wallpaperDataUri = uri;
      applyWallpaperAndTheme();
      return true;
    },
    updateTelemetry(next) {
      telemetry = next;
      syncContextCapsule();
      updateMonitorNavVisual();
      if (studioPopoverHost) updateStudioTelemetryInPlace();
      if (monitorOpen) renderMonitorOverlay();
      return true;
    },
    triggerCompact: opts => triggerCompactContext(opts),
    notify(msg, isError) { showToast(msg, !!isError); },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(syncTimer);
      clearInterval(compactWatchTimer);
      clearTimeout(autoCompactTimer);
      clearTimeout(toastTimer);
      if (i18nRaf) cancelAnimationFrame(i18nRaf);
      i18nObserver.disconnect();
      restoreLocalization();
      closeModelPopover();
      closeStudioPopover();
      closeMonitorOverlay();
      closeRevealMenu();
      monitorNavBtn?.remove();
      capsuleHost?.remove();
      toastHost?.remove();
      wpLayer?.remove();
      wpStyle?.remove();
      document.documentElement.removeAttribute('data-agy-beautify-popover-open');
      document.documentElement.removeAttribute('data-agy-monitor-open');
      document.body.classList.toggle('dark', nativeBodyClasses.dark);
      document.body.classList.toggle('dark-theme', nativeBodyClasses.darkTheme);
      document.body.classList.toggle('theme-dark', nativeBodyClasses.themeDark);
      document.body.classList.toggle('theme-light', nativeBodyClasses.themeLight);
      restoreNativeTitleBarOverlay();
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('click', onSidebarOtherClick, true);
      window.removeEventListener('pointerdown', onModelTriggerPointerDown, true);
      window.removeEventListener('mousedown', onModelTriggerMouseGuard, true);
      window.removeEventListener('mouseup', onModelTriggerMouseGuard, true);
      window.removeEventListener('click', onModelTriggerClick, true);
      window.removeEventListener('keydown', onModelTriggerKeyDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
      if (globalThis.__agyBeautifyRuntime === api) delete globalThis.__agyBeautifyRuntime;
    },
  };

  globalThis.__agyBeautifyRuntime = api;
  return true;
}

function buildRuntimeBundle(owner, initialSettings) {
  const fnSrc = pageInstallBeautifyRuntime.toString();
  const dictSrc = JSON.stringify(ZH_EXACT) + JSON.stringify(ZH_PATTERNS);
  const hash = createHash('sha256').update(fnSrc + dictSrc).digest('hex').slice(0, 16);
  const code = `(${fnSrc})(${Number(owner)},${JSON.stringify(hash)},${JSON.stringify(BINDING_NAME)},${JSON.stringify(ZH_EXACT)},${JSON.stringify(ZH_PATTERNS)},${JSON.stringify(initialSettings)})`;
  return { code, hash };
}

export function startBeautifyInjector({
  productRoots = [],
  getSettings,
  getSettingsMeta,
  getWallpaperDataUri,
  getWallpaperCatalog,
  getPresets,
  getTelemetry,
  onInvoke,
  onStatus,
} = {}) {
  const owner = INSTANCE_TS;
  const sockets = new Map();
  const composerOrigin = createComposerOriginResolver(productRoots);
  let cachedPages = [];
  let lastListAt = 0;
  let lastErr = '';
  let cdpState = 'unknown';
  let stopped = false;
  let busy = false;
  let tickQueued = false;

  const logOnce = msg => {
    if (lastErr !== msg) { lastErr = msg; console.error('[agy-beautify]', msg); }
  };

  const retire = (entry, id) => {
    if (entry.closed) return;
    entry.closed = true;
    for (const cb of entry.pending.values()) cb(undefined);
    entry.pending.clear();
    try { entry.ws.close(); } catch {}
    if (sockets.get(id) === entry) sockets.delete(id);
  };

  const command = (entry, method, params) => new Promise(resolve => {
    if (entry.ws.readyState !== 1) return resolve(undefined);
    const id = entry.nextId++;
    const timer = setTimeout(() => { entry.pending.delete(id); resolve(undefined); }, 4000);
    entry.pending.set(id, msg => { clearTimeout(timer); resolve(msg?.result); });
    try { entry.ws.send(JSON.stringify({ id, method, params })); }
    catch { clearTimeout(timer); entry.pending.delete(id); resolve(undefined); }
  });

  const evaluate = async (entry, context, expression) => {
    if (!context || context !== entry.context) return undefined;
    return (await command(entry, 'Runtime.evaluate', { uniqueContextId: context, expression, returnByValue: true }))?.result?.value;
  };

  const connect = async target => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const entry = {
      ws, pending: new Map(), nextId: 1, context: null, frameId: null,
      lastSettingsJson: '', lastWallpaperKey: '', lastCatalogJson: '', lastTelemetryJson: '',
      origin: new URL(target.url).origin, closed: false,
    };
    await new Promise((resolve, reject) => {
      const fail = m => { clearTimeout(timer); retire(entry, target.id); reject(new Error(m)); };
      const timer = setTimeout(() => fail('ws timeout'), 3000);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => fail('ws error');
    });
    if (stopped) { retire(entry, target.id); throw new Error('stopped'); }
    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.executionContextCreated') {
          const ctx = msg.params.context;
          if (ctx.auxData?.isDefault && ctx.auxData.frameId === entry.frameId) {
            entry.context = ctx.origin === entry.origin ? ctx.uniqueId : null;
            entry.lastSettingsJson = '';
            entry.lastWallpaperKey = '';
            entry.lastCatalogJson = '';
            entry.lastTelemetryJson = '';
          }
        } else if (
          msg.method === 'Runtime.executionContextsCleared'
          || (msg.method === 'Runtime.executionContextDestroyed' && msg.params.executionContextUniqueId === entry.context)
        ) {
          entry.context = null;
        } else if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === BINDING_NAME) {
          Promise.resolve()
            .then(() => onInvoke?.(JSON.parse(msg.params.payload)))
            .then(fb => {
              if (fb?.message && !fb?.silent && entry.context) {
                void evaluate(entry, entry.context, `globalThis.__agyBeautifyRuntime?.notify(${JSON.stringify(fb.message)},${Boolean(fb.isError)})`);
              }
            })
            .catch(() => {});
        }
        const cb = entry.pending.get(msg.id);
        if (cb) { entry.pending.delete(msg.id); cb(msg); }
      } catch {}
    };
    ws.onerror = ws.onclose = () => retire(entry, target.id);
    sockets.set(target.id, entry);
    const tree = await command(entry, 'Page.getFrameTree', {});
    entry.frameId = tree?.frameTree?.frame?.id;
    if (!entry.frameId || !(await command(entry, 'Runtime.enable', {}))) {
      retire(entry, target.id);
      throw new Error('could not attach Runtime');
    }
    await command(entry, 'Runtime.addBinding', { name: BINDING_NAME });
    return entry;
  };

  const listPages = async () => {
    const now = Date.now();
    if (lastListAt && now - lastListAt < 4000) return cachedPages;
    let port;
    try { port = readFileSync(PORT_FILE, 'utf8').split(/\r?\n/)[0].trim(); }
    catch { cdpState = 'missing'; logOnce('DevToolsActivePort not found'); return []; }
    try {
      if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('invalid CDP port');
      const res = await loopbackFetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const targets = await res.json();
      const origin = await composerOrigin();
      const wsOrigin = new URL('ws://127.0.0.1:' + Number(port)).origin;
      cachedPages = targets.filter(t => {
        if (!origin || t?.type !== 'page' || typeof t.id !== 'string' || !t.id || !URL.canParse(t.url) || new URL(t.url).origin !== origin || !URL.canParse(t.webSocketDebuggerUrl)) return false;
        const ws = new URL(t.webSocketDebuggerUrl);
        return ws.origin === wsOrigin && ws.pathname === '/devtools/page/' + t.id && !ws.username && !ws.password;
      });
      lastListAt = now;
      cdpState = origin ? 'ok' : 'unverified';
      const ids = new Set(cachedPages.map(t => t.id));
      for (const [id, entry] of sockets) if (!ids.has(id) || entry.origin !== origin) retire(entry, id);
      return cachedPages;
    } catch (err) {
      cdpState = 'unreachable';
      logOnce('CDP list failed: ' + err.message);
      return [];
    }
  };

  const tick = async () => {
    if (stopped) return;
    if (busy) { tickQueued = true; return; }
    busy = true;
    try {
      const pages = await listPages();
      const rawSettings = getSettings ? getSettings() : {};
      const { recentReveals: _omit, ...pageSettings } = rawSettings;
      const revMeta = getSettingsMeta ? getSettingsMeta() : { ackClientRev: 0, sidecarRev: 0 };
      const settingsJson = JSON.stringify(pageSettings);
      const settingsSyncKey = settingsJson + ':' + revMeta.ackClientRev + ':' + revMeta.sidecarRev;
      const bundle = buildRuntimeBundle(owner, pageSettings);
      const wpId = pageSettings.wallpaperId || 'none';
      const wpDataUri = getWallpaperDataUri ? getWallpaperDataUri(wpId) : '';
      const wpKey = wpId + ':' + wpDataUri.length;
      const wpCatalog = getWallpaperCatalog ? getWallpaperCatalog() : [];
      const presets = getPresets ? getPresets() : [];
      const catalogJson = JSON.stringify([wpCatalog, presets]);
      let okPages = 0;

      for (const target of pages) {
        if (stopped) break;
        try {
          const entry = sockets.get(target.id) || (await connect(target));
          const ctx = entry.context;
          if (!ctx) continue;
          const status = await evaluate(entry, ctx, `globalThis.__agyBeautifyRuntime ? { owner: globalThis.__agyBeautifyRuntime.owner, hash: globalThis.__agyBeautifyRuntime.hash, convId: globalThis.__agyBeautifyRuntime.readConversationId() } : null`);
          if (status === undefined || stopped) continue;
          if (status?.owner > owner) { await stop(); return; }

          let convId = status?.convId || '';
          if (!status || status.owner !== owner || status.hash !== bundle.hash) {
            const installed = await evaluate(entry, ctx, bundle.code);
            if (installed === 'superseded') { await stop(); return; }
            if (!installed) continue;
            entry.lastSettingsJson = settingsSyncKey;
            entry.lastWallpaperKey = '';
            entry.lastCatalogJson = '';
            entry.lastTelemetryJson = '';
            convId = (await evaluate(entry, ctx, `globalThis.__agyBeautifyRuntime?.readConversationId() || ''`)) || '';
          } else if (entry.lastSettingsJson !== settingsSyncKey) {
            await evaluate(entry, ctx, `globalThis.__agyBeautifyRuntime?.updateSettings(${settingsJson},${JSON.stringify(revMeta)})`);
            entry.lastSettingsJson = settingsSyncKey;
          }

          if (entry.lastCatalogJson !== catalogJson) {
            await evaluate(entry, ctx, `globalThis.__agyBeautifyRuntime?.setCatalogs(${JSON.stringify(wpCatalog)},${JSON.stringify(presets)})`);
            entry.lastCatalogJson = catalogJson;
          }

          if (entry.lastWallpaperKey !== wpKey) {
            await evaluate(entry, ctx, `globalThis.__agyBeautifyRuntime?.setWallpaperDataUri(${JSON.stringify(wpDataUri)},${JSON.stringify(wpId)})`);
            entry.lastWallpaperKey = wpKey;
          }

          if (getTelemetry) {
            const tele = await getTelemetry(convId);
            const teleJson = JSON.stringify(tele);
            if (entry.lastTelemetryJson !== teleJson) {
              await evaluate(entry, ctx, `globalThis.__agyBeautifyRuntime?.updateTelemetry(${teleJson})`);
              entry.lastTelemetryJson = teleJson;
            }
          }
          okPages++;
          lastErr = '';
        } catch (err) {
          const entry = sockets.get(target.id);
          if (entry) retire(entry, target.id);
          logOnce('page ' + target.id + ': ' + err.message);
        }
      }
      onStatus?.({ cdpState, pageCount: pages.length, attachedCount: okPages });
    } finally {
      busy = false;
      if (tickQueued && !stopped) {
        tickQueued = false;
        void tick();
      }
    }
  };

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    await Promise.all([...sockets].map(async ([id, entry]) => {
      try { await evaluate(entry, entry.context, `globalThis.__agyBeautifyRuntime?.owner===${owner}&&globalThis.__agyBeautifyRuntime.dispose()`); }
      finally { retire(entry, id); }
    }));
  };

  const triggerCompact = async () => {
    for (const entry of sockets.values()) {
      if (!entry.context) continue;
      const ok = await evaluate(entry, entry.context, `globalThis.__agyBeautifyRuntime?.triggerCompact({ auto: false })`);
      if (ok !== undefined) return Boolean(ok);
    }
    return false;
  };

  const timer = setInterval(tick, INTERVAL_MS);
  void tick();
  return { stop, tick, triggerCompact, status: () => cdpState, attachedPages: () => sockets.size };
}
