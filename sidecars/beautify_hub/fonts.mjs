import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MONO_RE = /\b(mono|code|consolas|courier|fira|jetbrains|cascadia|hack|maple|sarasa|iosevka|menlo|monaco|ubuntu mono|sf mono|roboto mono|inconsolata|dejavu sans mono|droid sans mono|nerd|terminal|fixedsys)\b/i;
const CJK_RE = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]|\b(yahei|pingfang|heiti|songti|kaiti|fangsong|dengxian|simsun|simhei|kaiti|noto sans sc|noto serif sc|noto sans tc|noto sans cjk|source han|sarasa|lxgw|harmonyos|misans|alibaba|oppo sans|vivo sans|meiryo|yu gothic|malgun|microsoft jhenghei)\b/i;

const FALLBACK_FONTS = [
  'Microsoft YaHei UI',
  'Microsoft YaHei',
  'Segoe UI',
  'PingFang SC',
  'Hiragino Sans GB',
  'Noto Sans SC',
  'Consolas',
  'Cascadia Code',
  'JetBrains Mono',
  'SF Mono',
  'Menlo',
];

let cachedList = null;
let inflightPromise = null;

export function sanitizeFontFamily(raw) {
  return String(raw || '')
    .replace(/[{};<>\\\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function buildCssFontStack(family, fallback = 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif') {
  const cleaned = sanitizeFontFamily(family);
  if (!cleaned) return '';
  const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'emoji']);
  const parts = cleaned
    .split(',')
    .map(p => p.trim().replace(/^["']+|["']+$/g, '').trim())
    .filter(Boolean)
    .map(name => {
      if (generic.has(name.toLowerCase())) return name.toLowerCase();
      return /[^a-zA-Z0-9_-]/.test(name) ? `"${name.replace(/"/g, '')}"` : `"${name}"`;
    });
  if (!parts.length) return '';
  return fallback ? `${parts.join(', ')}, ${fallback}` : parts.join(', ');
}

export function classifyFontEntry(name) {
  const clean = sanitizeFontFamily(name);
  return {
    name: clean,
    isMono: MONO_RE.test(clean),
    isCjk: CJK_RE.test(clean),
  };
}

export function normalizeFontList(rawNames = []) {
  const seen = new Map();
  for (const raw of rawNames) {
    const clean = sanitizeFontFamily(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, classifyFontEntry(clean));
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

async function scanWindowsFonts() {
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Drawing',
    '$names = (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name } | Sort-Object -Unique',
    '$names | ConvertTo-Json -Compress',
  ].join('; ');
  const { stdout } = await execFileAsync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { maxBuffer: 4 * 1024 * 1024, timeout: 12_000, windowsHide: true },
  );
  const parsed = JSON.parse(String(stdout || '[]').trim() || '[]');
  return Array.isArray(parsed) ? parsed : (typeof parsed === 'string' ? [parsed] : []);
}

async function scanMacFonts() {
  try {
    const { stdout } = await execFileAsync('fc-list', [':', 'family'], { maxBuffer: 4 * 1024 * 1024, timeout: 10_000 });
    return String(stdout || '')
      .split(/\r?\n/)
      .flatMap(line => line.split(','))
      .map(s => s.trim())
      .filter(Boolean);
  } catch {
    const { stdout } = await execFileAsync('system_profiler', ['SPFontsDataType', '-json'], { maxBuffer: 8 * 1024 * 1024, timeout: 15_000 });
    const json = JSON.parse(stdout || '{}');
    const items = Array.isArray(json?.SPFontsDataType) ? json.SPFontsDataType : [];
    const names = [];
    for (const item of items) {
      if (Array.isArray(item?.typefaces)) {
        for (const tf of item.typefaces) {
          if (tf?.family) names.push(tf.family);
        }
      }
    }
    return names;
  }
}

async function scanLinuxFonts() {
  const { stdout } = await execFileAsync('fc-list', [':', 'family'], { maxBuffer: 4 * 1024 * 1024, timeout: 10_000 });
  return String(stdout || '')
    .split(/\r?\n/)
    .flatMap(line => line.split(','))
    .map(s => s.trim())
    .filter(Boolean);
}

export async function listSystemFonts({ forceRefresh = false } = {}) {
  if (!forceRefresh && cachedList) return cachedList;
  if (!forceRefresh && inflightPromise) return inflightPromise;

  const task = (async () => {
    try {
      let names = [];
      if (process.platform === 'win32') names = await scanWindowsFonts();
      else if (process.platform === 'darwin') names = await scanMacFonts();
      else names = await scanLinuxFonts();
      const normalized = normalizeFontList(names);
      cachedList = normalized.length ? normalized : normalizeFontList(FALLBACK_FONTS);
    } catch {
      cachedList = cachedList || normalizeFontList(FALLBACK_FONTS);
    } finally {
      inflightPromise = null;
    }
    return cachedList;
  })();

  inflightPromise = task;
  return task;
}

export function getCachedSystemFonts() {
  if (!cachedList && !inflightPromise) void listSystemFonts();
  return cachedList || [];
}
