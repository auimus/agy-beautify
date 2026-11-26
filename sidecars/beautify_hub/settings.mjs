import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_SETTINGS = {
  // Module 1: Gemini-style model & effort picker
  geminiModelPicker: true,
  // Module 2: Auto Chinese localization
  autoChinese: true,
  // Module 3: Context & token telemetry footer pill + Sidebar Monitor + Auto Compact
  showContextCapsule: true,
  showQuotaInFooter: true,
  compactCapsule: 'auto', // 'auto' | 'compact' | 'full'
  showSidebarMonitor: true,
  autoCompactEnabled: false,
  autoCompactThreshold: 80, // 40..95 (%)
  // Module 4: Right-click reveal file in folder
  revealEnabled: true,
  revealDetectCodePaths: true,
  revealUseNativeMenu: true,
  revealShowOpenFile: true,
  revealShowCopyActions: true,
  revealShowTerminal: true,
  // Module 5: Humanized Appearance, Liquid Glass & Wallpaper Engine
  themeMode: 'dark', // 'auto' | 'light' | 'dark'
  glassStyle: 'liquid', // 'liquid' | 'frosted' | 'solid'
  glassStrength: 0.78, // 0.2 .. 1.0
  readingSurface: true,
  activePreset: 'liquid-dark',
  wallpaperId: 'deep-ocean-glass',
  wallpaperOpacity: 0.95,
  wallpaperBlur: 0,
  wallpaperScrim: 0.36,
  wallpaperGlass: true,
  wallpaperFit: 'cover', // 'cover' | 'contain'
  wallpaperPosition: 'center', // 'center' | 'top' | 'bottom'
  wallpaperBrightness: 0.96,
  wallpaperSaturation: 1.12,
  // History
  recentReveals: [],
};

export const PRESETS = [
  {
    id: 'liquid-dark',
    name: '深海液态 · 暗夜',
    desc: '深海流光 + 暗夜液态玻璃，沉静高级',
    icon: '🌌',
    patch: {
      themeMode: 'dark',
      glassStyle: 'liquid',
      glassStrength: 0.84,
      readingSurface: true,
      wallpaperId: 'deep-ocean-glass',
      wallpaperOpacity: 0.95,
      wallpaperBlur: 0,
      wallpaperScrim: 0.36,
      wallpaperGlass: true,
      wallpaperPosition: 'center',
      wallpaperBrightness: 0.96,
      wallpaperSaturation: 1.12,
    },
  },
  {
    id: 'liquid-light',
    name: '液态琉璃 · 浅色',
    desc: '苹果风浅色液态棱镜，明亮通透',
    icon: '💧',
    patch: {
      themeMode: 'light',
      glassStyle: 'liquid',
      glassStrength: 0.84,
      readingSurface: true,
      wallpaperId: 'liquid-prism-light',
      wallpaperOpacity: 0.96,
      wallpaperBlur: 0,
      wallpaperScrim: 0.22,
      wallpaperGlass: true,
      wallpaperPosition: 'center',
      wallpaperBrightness: 1.02,
      wallpaperSaturation: 1.12,
    },
  },
  {
    id: 'gemini-starlight',
    name: 'Gemini 星云 · 深空',
    desc: '蓝紫星云极光，与星尘滑条浑然一体',
    icon: '✦',
    patch: {
      themeMode: 'dark',
      glassStyle: 'liquid',
      glassStrength: 0.82,
      readingSurface: true,
      wallpaperId: 'gemini-aurora',
      wallpaperOpacity: 0.96,
      wallpaperBlur: 0,
      wallpaperScrim: 0.38,
      wallpaperGlass: true,
      wallpaperPosition: 'center',
      wallpaperBrightness: 0.98,
      wallpaperSaturation: 1.12,
    },
  },
  {
    id: 'focus-minimal',
    name: '极简磨砂 · 专注',
    desc: '柔和低干扰磨砂，适合长时编程',
    icon: '🧊',
    patch: {
      themeMode: 'auto',
      glassStyle: 'frosted',
      glassStrength: 0.65,
      readingSurface: true,
      wallpaperBlur: 6,
      wallpaperScrim: 0.6,
      wallpaperGlass: true,
      wallpaperBrightness: 0.96,
      wallpaperSaturation: 0.95,
    },
  },
  {
    id: 'clean-native',
    name: '纯净原生',
    desc: '关闭壁纸与玻璃，保留监控台/模型/汉化',
    icon: '📄',
    patch: {
      themeMode: 'auto',
      glassStyle: 'solid',
      wallpaperId: 'none',
      wallpaperGlass: false,
      readingSurface: false,
    },
  },
];

const MAX_HISTORY = 25;

export function getConfigDir() {
  return join(homedir(), '.gemini', 'config', 'agy-beautify');
}

export function getSettingsFilePath() {
  return join(getConfigDir(), 'settings.json');
}

export function getCustomWallpapersDir() {
  return join(getConfigDir(), 'wallpapers');
}

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

const SVG_LIQUID_PRISM_LIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#EBF3FF"/>
      <stop offset="48%" stop-color="#F4EEFF"/>
      <stop offset="100%" stop-color="#E4F7FB"/>
    </linearGradient>
    <radialGradient id="b1" cx="18%" cy="22%" r="48%">
      <stop offset="0%" stop-color="#60A5FA" stop-opacity="0.62"/>
      <stop offset="60%" stop-color="#818CF8" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#EBF3FF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="b2" cx="82%" cy="28%" r="46%">
      <stop offset="0%" stop-color="#C084FC" stop-opacity="0.52"/>
      <stop offset="55%" stop-color="#F472B6" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#F4EEFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="b3" cx="54%" cy="82%" r="52%">
      <stop offset="0%" stop-color="#22D3EE" stop-opacity="0.52"/>
      <stop offset="58%" stop-color="#38BDF8" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#E4F7FB" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.68"/>
      <stop offset="50%" stop-color="#BAE6FD" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#DDD6FE" stop-opacity="0.48"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#base)"/>
  <rect width="1920" height="1080" fill="url(#b1)"/>
  <rect width="1920" height="1080" fill="url(#b2)"/>
  <rect width="1920" height="1080" fill="url(#b3)"/>
  <path d="M-120,760 C280,520 560,920 1020,620 C1420,360 1660,520 2040,260 L2040,560 C1660,820 1400,640 990,890 C540,1160 260,780 -120,980 Z" fill="url(#ribbon)"/>
  <circle cx="1440" cy="760" r="240" fill="#FFFFFF" fill-opacity="0.22"/>
  <circle cx="420" cy="280" r="190" fill="#FFFFFF" fill-opacity="0.26"/>
</svg>`;

const SVG_SAKURA_MIST_LIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFF5F7"/>
      <stop offset="50%" stop-color="#FEF3E8"/>
      <stop offset="100%" stop-color="#EEF6FF"/>
    </linearGradient>
    <radialGradient id="s1" cx="24%" cy="32%" r="52%">
      <stop offset="0%" stop-color="#FDA4AF" stop-opacity="0.52"/>
      <stop offset="100%" stop-color="#FFF5F7" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="s2" cx="76%" cy="24%" r="48%">
      <stop offset="0%" stop-color="#FDBA74" stop-opacity="0.44"/>
      <stop offset="100%" stop-color="#FEF3E8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="s3" cx="68%" cy="80%" r="54%">
      <stop offset="0%" stop-color="#93C5FD" stop-opacity="0.48"/>
      <stop offset="100%" stop-color="#EEF6FF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#sky)"/>
  <rect width="1920" height="1080" fill="url(#s1)"/>
  <rect width="1920" height="1080" fill="url(#s2)"/>
  <rect width="1920" height="1080" fill="url(#s3)"/>
  <ellipse cx="960" cy="640" rx="760" ry="180" fill="#FFFFFF" fill-opacity="0.34"/>
</svg>`;

const SVG_DEEP_OCEAN_GLASS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#030712"/>
      <stop offset="48%" stop-color="#0A192F"/>
      <stop offset="100%" stop-color="#0C142B"/>
    </linearGradient>
    <radialGradient id="w1" cx="22%" cy="28%" r="52%">
      <stop offset="0%" stop-color="#0EA5E9" stop-opacity="0.52"/>
      <stop offset="55%" stop-color="#2563EB" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#030712" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="w2" cx="78%" cy="68%" r="54%">
      <stop offset="0%" stop-color="#14B8A6" stop-opacity="0.44"/>
      <stop offset="55%" stop-color="#6366F1" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#030712" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="wave" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.16"/>
      <stop offset="50%" stop-color="#A78BFA" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#2DD4BF" stop-opacity="0.18"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#sea)"/>
  <rect width="1920" height="1080" fill="url(#w1)"/>
  <rect width="1920" height="1080" fill="url(#w2)"/>
  <path d="M-80,680 Q460,440 960,640 T2000,560 L2000,820 Q1460,960 960,790 T-80,860 Z" fill="url(#wave)"/>
  <path d="M-80,340 Q520,160 1060,360 T2000,260 L2000,420 Q1480,540 1020,450 T-80,460 Z" fill="#FFFFFF" fill-opacity="0.04"/>
</svg>`;

const SVG_GEMINI_AURORA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#060B1E"/>
      <stop offset="45%" stop-color="#0F173A"/>
      <stop offset="100%" stop-color="#1E103C"/>
    </linearGradient>
    <radialGradient id="g1" cx="25%" cy="30%" r="55%">
      <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.58"/>
      <stop offset="55%" stop-color="#6366F1" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#060B1E" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="78%" cy="68%" r="52%">
      <stop offset="0%" stop-color="#A855F7" stop-opacity="0.54"/>
      <stop offset="50%" stop-color="#06B6D4" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="#060B1E" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g3" cx="62%" cy="22%" r="36%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#060B1E" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#sky)"/>
  <rect width="1920" height="1080" fill="url(#g1)"/>
  <rect width="1920" height="1080" fill="url(#g2)"/>
  <rect width="1920" height="1080" fill="url(#g3)"/>
  <g fill="#E0F2FE" opacity="0.72">
    <circle cx="240" cy="180" r="2.2"/><circle cx="480" cy="120" r="1.5"/><circle cx="710" cy="290" r="2"/>
    <circle cx="960" cy="140" r="2.5"/><circle cx="1220" cy="210" r="1.8"/><circle cx="1490" cy="150" r="2.3"/>
    <circle cx="1690" cy="340" r="1.7"/><circle cx="320" cy="640" r="1.6"/><circle cx="620" cy="820" r="2.1"/>
    <circle cx="1090" cy="760" r="1.7"/><circle cx="1420" cy="880" r="2.4"/><circle cx="1760" cy="710" r="1.9"/>
  </g>
  <path d="M960 440C972 505 1015 548 1080 560C1015 572 972 615 960 680C948 615 905 572 840 560C905 548 948 505 960 440Z" fill="#BAE6FD" opacity="0.24"/>
</svg>`;

const SVG_MIDNIGHT_GRID = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#090D16"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
      <path d="M 64 0 L 0 0 0 64" fill="none" stroke="#38BDF8" stroke-opacity="0.12" stroke-width="1"/>
    </pattern>
    <radialGradient id="glow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#2563EB" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#090D16" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <rect width="1920" height="1080" fill="url(#grid)"/>
  <rect width="1920" height="1080" fill="url(#glow)"/>
</svg>`;

function toDataUri(buf, mime) {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export function listWallpapers(customDir = getCustomWallpapersDir()) {
  const list = [
    { id: 'none', name: '纯净无壁纸', tone: 'both', builtin: true, kind: 'none' },
    {
      id: 'deep-ocean-glass',
      name: '深海流光 · 深色',
      tone: 'dark',
      builtin: true,
      kind: 'svg',
      dataUri: toDataUri(Buffer.from(SVG_DEEP_OCEAN_GLASS, 'utf8'), 'image/svg+xml'),
    },
    {
      id: 'liquid-prism-light',
      name: '液态棱镜 · 浅色',
      tone: 'light',
      builtin: true,
      kind: 'svg',
      dataUri: toDataUri(Buffer.from(SVG_LIQUID_PRISM_LIGHT, 'utf8'), 'image/svg+xml'),
    },
    {
      id: 'sakura-mist-light',
      name: '晨曦云霞 · 浅色',
      tone: 'light',
      builtin: true,
      kind: 'svg',
      dataUri: toDataUri(Buffer.from(SVG_SAKURA_MIST_LIGHT, 'utf8'), 'image/svg+xml'),
    },
    {
      id: 'gemini-aurora',
      name: 'Gemini 星云 · 深色',
      tone: 'dark',
      builtin: true,
      kind: 'svg',
      dataUri: toDataUri(Buffer.from(SVG_GEMINI_AURORA, 'utf8'), 'image/svg+xml'),
    },
    {
      id: 'midnight-grid',
      name: '午夜极客 · 深色',
      tone: 'dark',
      builtin: true,
      kind: 'svg',
      dataUri: toDataUri(Buffer.from(SVG_MIDNIGHT_GRID, 'utf8'), 'image/svg+xml'),
    },
  ];
  if (existsSync(customDir)) {
    for (const file of readdirSync(customDir).sort()) {
      const ext = extname(file).toLowerCase();
      const mime = MIME_BY_EXT[ext];
      if (!mime) continue;
      list.push({
        id: `custom:${file}`,
        name: file.replace(/\.[^.]+$/, ''),
        tone: 'custom',
        builtin: false,
        kind: 'file',
        filePath: join(customDir, file),
        mime,
      });
    }
  }
  return list;
}

const _dataUriCache = new Map();

export function resolveWallpaperDataUri(wallpaperId, customDir = getCustomWallpapersDir()) {
  if (!wallpaperId || wallpaperId === 'none') return '';
  const all = listWallpapers(customDir);
  const found = all.find(w => w.id === wallpaperId);
  if (!found) return '';
  if (found.kind === 'svg') return found.dataUri;
  if (found.kind === 'file' && found.filePath && existsSync(found.filePath)) {
    const cached = _dataUriCache.get(found.filePath);
    if (cached) return cached;
    const uri = toDataUri(readFileSync(found.filePath), found.mime || 'image/jpeg');
    _dataUriCache.set(found.filePath, uri);
    return uri;
  }
  return '';
}

export function saveCustomWallpaper(filename, base64Data, customDir = getCustomWallpapersDir()) {
  const safeBase = String(filename || 'wallpaper.jpg')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, '_')
    .slice(0, 64);
  const ext = extname(safeBase).toLowerCase();
  if (!MIME_BY_EXT[ext]) throw new Error('仅支持 jpg / png / webp / gif / svg 图片格式');
  const raw = String(base64Data || '').replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length === 0 || buf.length > 18 * 1024 * 1024) {
    throw new Error('壁纸图片无效或超过 18 MB 大小限制');
  }
  mkdirSync(customDir, { recursive: true });
  const target = join(customDir, safeBase);
  writeFileSync(target, buf);
  _dataUriCache.delete(target);
  return `custom:${safeBase}`;
}

export function importWallpaperFromLocalPath(localPath, customDir = getCustomWallpapersDir()) {
  const cleaned = String(localPath || '').trim().replace(/^["']|["']$/g, '');
  if (!cleaned || !existsSync(cleaned)) {
    throw new Error('找不到该图片文件，请检查路径');
  }
  const ext = extname(cleaned).toLowerCase();
  if (!MIME_BY_EXT[ext]) throw new Error('仅支持 jpg / png / webp / gif / svg 图片格式');
  const buf = readFileSync(cleaned);
  if (buf.length === 0 || buf.length > 18 * 1024 * 1024) {
    throw new Error('壁纸图片无效或超过 18 MB 大小限制');
  }
  const safeBase = basename(cleaned).replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, '_').slice(0, 64);
  mkdirSync(customDir, { recursive: true });
  const target = join(customDir, safeBase);
  writeFileSync(target, buf);
  _dataUriCache.delete(target);
  return `custom:${safeBase}`;
}

export function deleteCustomWallpaper(wallpaperId, customDir = getCustomWallpapersDir()) {
  if (!wallpaperId?.startsWith('custom:')) return false;
  const fname = wallpaperId.slice('custom:'.length);
  if (!fname || fname.includes('/') || fname.includes('\\') || fname.includes('..')) return false;
  const target = join(customDir, fname);
  if (existsSync(target)) {
    unlinkSync(target);
    _dataUriCache.delete(target);
    return true;
  }
  return false;
}

export function getPresetPatch(presetId) {
  const found = PRESETS.find(p => p.id === presetId);
  return found ? { ...found.patch, activePreset: found.id } : null;
}

function clamp(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function oneOf(val, allowed, fallback) {
  return allowed.includes(val) ? val : fallback;
}

function sanitizeSettings(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const bool = (k, def) => (typeof obj[k] === 'boolean' ? obj[k] : def);
  const history = Array.isArray(obj.recentReveals)
    ? obj.recentReveals.filter(i => i && typeof i.path === 'string' && i.path).slice(0, MAX_HISTORY)
    : [];
  const legacyGlass = typeof obj.wallpaperGlass === 'boolean' ? obj.wallpaperGlass : DEFAULT_SETTINGS.wallpaperGlass;
  const glassStyle = oneOf(
    obj.glassStyle,
    ['liquid', 'frosted', 'solid'],
    legacyGlass ? DEFAULT_SETTINGS.glassStyle : 'solid',
  );
  // Gracefully migrate removed legacy gta6 wallpaper/preset
  let wpId = typeof obj.wallpaperId === 'string' ? obj.wallpaperId : DEFAULT_SETTINGS.wallpaperId;
  if (wpId === 'gta6') wpId = DEFAULT_SETTINGS.wallpaperId;
  let preset = typeof obj.activePreset === 'string' ? obj.activePreset : DEFAULT_SETTINGS.activePreset;
  if (preset === 'gta-neon') preset = DEFAULT_SETTINGS.activePreset;

  return {
    geminiModelPicker: bool('geminiModelPicker', DEFAULT_SETTINGS.geminiModelPicker),
    autoChinese: bool('autoChinese', DEFAULT_SETTINGS.autoChinese),
    showContextCapsule: bool('showContextCapsule', DEFAULT_SETTINGS.showContextCapsule),
    showQuotaInFooter: bool('showQuotaInFooter', DEFAULT_SETTINGS.showQuotaInFooter),
    compactCapsule: oneOf(obj.compactCapsule, ['auto', 'compact', 'full'], DEFAULT_SETTINGS.compactCapsule),
    showSidebarMonitor: bool('showSidebarMonitor', DEFAULT_SETTINGS.showSidebarMonitor),
    autoCompactEnabled: bool('autoCompactEnabled', DEFAULT_SETTINGS.autoCompactEnabled),
    autoCompactThreshold: Math.round(clamp(obj.autoCompactThreshold, 40, 95, DEFAULT_SETTINGS.autoCompactThreshold)),
    revealEnabled: bool('revealEnabled', DEFAULT_SETTINGS.revealEnabled),
    revealDetectCodePaths: bool('revealDetectCodePaths', DEFAULT_SETTINGS.revealDetectCodePaths),
    revealUseNativeMenu: bool('revealUseNativeMenu', DEFAULT_SETTINGS.revealUseNativeMenu),
    revealShowOpenFile: bool('revealShowOpenFile', DEFAULT_SETTINGS.revealShowOpenFile),
    revealShowCopyActions: bool('revealShowCopyActions', DEFAULT_SETTINGS.revealShowCopyActions),
    revealShowTerminal: bool('revealShowTerminal', DEFAULT_SETTINGS.revealShowTerminal),
    themeMode: oneOf(obj.themeMode, ['auto', 'light', 'dark'], DEFAULT_SETTINGS.themeMode),
    glassStyle,
    glassStrength: clamp(obj.glassStrength, 0.2, 1.0, DEFAULT_SETTINGS.glassStrength),
    readingSurface: bool('readingSurface', DEFAULT_SETTINGS.readingSurface),
    activePreset: preset,
    wallpaperId: wpId,
    wallpaperOpacity: clamp(obj.wallpaperOpacity, 0.1, 1.0, DEFAULT_SETTINGS.wallpaperOpacity),
    wallpaperBlur: clamp(obj.wallpaperBlur, 0, 24, DEFAULT_SETTINGS.wallpaperBlur),
    wallpaperScrim: clamp(obj.wallpaperScrim, 0, 0.92, DEFAULT_SETTINGS.wallpaperScrim),
    wallpaperGlass: glassStyle !== 'solid',
    wallpaperFit: oneOf(obj.wallpaperFit, ['cover', 'contain'], DEFAULT_SETTINGS.wallpaperFit),
    wallpaperPosition: oneOf(obj.wallpaperPosition, ['center', 'top', 'bottom'], DEFAULT_SETTINGS.wallpaperPosition),
    wallpaperBrightness: clamp(obj.wallpaperBrightness, 0.5, 1.35, DEFAULT_SETTINGS.wallpaperBrightness),
    wallpaperSaturation: clamp(obj.wallpaperSaturation, 0.6, 1.6, DEFAULT_SETTINGS.wallpaperSaturation),
    recentReveals: history,
  };
}

export function createSettingsStore(filePath = getSettingsFilePath()) {
  let cached = null;
  const read = () => {
    if (cached) return cached;
    try {
      cached = sanitizeSettings(JSON.parse(readFileSync(filePath, 'utf8')));
    } catch {
      cached = sanitizeSettings(DEFAULT_SETTINGS);
    }
    return cached;
  };
  const write = next => {
    cached = sanitizeSettings(next);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(cached, null, 2) + '\n', 'utf8');
    return cached;
  };
  const update = patch => write({ ...read(), ...(patch && typeof patch === 'object' ? patch : {}) });
  const recordReveal = entry => {
    const cur = read();
    const filtered = cur.recentReveals.filter(x => x.path !== entry.path);
    return write({ ...cur, recentReveals: [{ ...entry, at: Date.now() }, ...filtered].slice(0, MAX_HISTORY) });
  };
  const clearReveals = () => update({ recentReveals: [] });
  return { read, update, recordReveal, clearReveals, filePath };
}
