import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const DEFAULT_REPO_OWNER = 'auimus';
export const DEFAULT_REPO_NAME = 'agy-beautify';
const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const PAYLOAD_ITEMS = ['plugin.json', 'README.md', 'README_EN.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'assets', 'skills', 'sidecars'];

export function normalizeVersion(raw) {
  return String(raw || '')
    .trim()
    .replace(/^v/i, '')
    .replace(/\s+/g, '');
}

export function compareSemver(a, b) {
  const parse = v => {
    const clean = normalizeVersion(v);
    const [core, pre = ''] = clean.split('-', 2);
    const parts = core.split('.').map(x => {
      const n = Number.parseInt(x, 10);
      return Number.isFinite(n) ? n : 0;
    });
    while (parts.length < 3) parts.push(0);
    return { parts: parts.slice(0, 3), pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa.parts[i] !== pb.parts[i]) return pa.parts[i] > pb.parts[i] ? 1 : -1;
  }
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  return pa.pre > pb.pre ? 1 : -1;
}

export function readInstalledVersion(pluginDir) {
  try {
    const manifest = JSON.parse(readFileSync(join(pluginDir, 'plugin.json'), 'utf8'));
    return normalizeVersion(manifest?.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

export function pickReleaseZipAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const preferred = assets.find(a => /agy-beautify.*\.zip$/i.test(String(a?.name || '')) && a?.browser_download_url)
    || assets.find(a => /\.zip$/i.test(String(a?.name || '')) && a?.browser_download_url);
  if (preferred) {
    const digest = typeof preferred.digest === 'string' && preferred.digest.startsWith('sha256:')
      ? preferred.digest.slice('sha256:'.length).trim().toLowerCase()
      : '';
    return {
      name: String(preferred.name),
      url: String(preferred.browser_download_url),
      size: Number(preferred.size) || 0,
      sha256: /^[0-9a-f]{64}$/.test(digest) ? digest : '',
    };
  }
  if (release?.zipball_url) {
    return {
      name: `agy-beautify-${release.tag_name || 'latest'}.zip`,
      url: String(release.zipball_url),
      size: 0,
      sha256: '',
    };
  }
  return null;
}

async function fetchJsonWithProxyFallback(url, timeoutMs = 10_000) {
  const headers = {
    'User-Agent': 'agy-beautify-updater',
    Accept: 'application/vnd.github+json',
  };
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return await res.json();
    if (res.status === 404) throw new Error('HTTP_404');
    if (res.status === 403 || res.status === 429) throw new Error('HTTP_RATE_LIMIT');
    throw new Error(`HTTP_${res.status}`);
  } catch (fetchErr) {
    if (String(fetchErr?.message || '').startsWith('HTTP_')) throw fetchErr;
    // Fallback to OS HTTP stack (PowerShell auto-uses Windows system proxy such as Clash/WinINet)
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$ProgressPreference="SilentlyContinue"; $r = Invoke-WebRequest -UseBasicParsing -Uri $env:AGY_URL -Headers @{"User-Agent"="agy-beautify-updater";"Accept"="application/vnd.github+json"} -TimeoutSec 12; Write-Output $r.Content',
        ],
        {
          env: { ...process.env, AGY_URL: url },
          maxBuffer: 4 * 1024 * 1024,
          timeout: timeoutMs + 4000,
          windowsHide: true,
        },
      );
      return JSON.parse(stdout);
    }
    const { stdout } = await execFileAsync(
      'curl',
      ['-fsSL', '--max-time', '12', '-H', 'User-Agent: agy-beautify-updater', '-H', 'Accept: application/vnd.github+json', url],
      { maxBuffer: 4 * 1024 * 1024, timeout: timeoutMs + 4000 },
    );
    return JSON.parse(stdout);
  }
}

async function resolveLatestViaRedirect(owner, repo, timeoutMs = 10_000) {
  const latestWebUrl = `https://github.com/${owner}/${repo}/releases/latest`;
  let finalUrl = '';
  try {
    const res = await fetch(latestWebUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'agy-beautify-updater' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    finalUrl = res.url || '';
    await res.body?.cancel();
  } catch {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$ProgressPreference="SilentlyContinue"; $r = Invoke-WebRequest -UseBasicParsing -MaximumRedirection 5 -Uri $env:AGY_URL -TimeoutSec 12; Write-Output $r.BaseResponse.ResponseUri.AbsoluteUri',
        ],
        { env: { ...process.env, AGY_URL: latestWebUrl }, timeout: timeoutMs + 4000, windowsHide: true },
      );
      finalUrl = stdout.trim();
    }
  }
  const m = /\/releases\/tag\/([^/?#]+)/i.exec(finalUrl);
  if (!m) throw new Error('无法解析 GitHub 最新版本标签');
  const tag = decodeURIComponent(m[1]);
  return {
    tag_name: tag,
    name: `AGY Beautify ${tag}`,
    html_url: `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(tag)}`,
    published_at: '',
    body: '',
    assets: [
      {
        name: `agy-beautify-${tag}.zip`,
        browser_download_url: `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tag)}/agy-beautify-${encodeURIComponent(tag)}.zip`,
        size: 0,
      },
    ],
  };
}

async function downloadFileWithProxyFallback(url, destPath, timeoutMs = 45_000) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'agy-beautify-updater' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`下载失败 (HTTP ${res.status})`);
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > MAX_ZIP_BYTES) {
      throw new Error('更新包体积异常');
    }
    writeFileSync(destPath, Buffer.from(ab));
    return destPath;
  } catch (fetchErr) {
    if (String(fetchErr?.message || '').startsWith('下载失败') || String(fetchErr?.message || '').includes('体积异常')) {
      throw fetchErr;
    }
    if (process.platform === 'win32') {
      await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$ProgressPreference="SilentlyContinue"; Invoke-WebRequest -UseBasicParsing -Uri $env:AGY_URL -Headers @{"User-Agent"="agy-beautify-updater"} -OutFile $env:AGY_OUT -TimeoutSec 45',
        ],
        {
          env: { ...process.env, AGY_URL: url, AGY_OUT: destPath },
          timeout: timeoutMs + 5000,
          windowsHide: true,
        },
      );
      return destPath;
    }
    await execFileAsync(
      'curl',
      ['-fsSL', '--max-time', '45', '-H', 'User-Agent: agy-beautify-updater', '-o', destPath, url],
      { timeout: timeoutMs + 5000 },
    );
    return destPath;
  }
}

export async function extractZipArchive(zipPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$ProgressPreference="SilentlyContinue"; Expand-Archive -LiteralPath $env:AGY_ZIP -DestinationPath $env:AGY_DEST -Force',
      ],
      {
        env: { ...process.env, AGY_ZIP: zipPath, AGY_DEST: destDir },
        timeout: 30_000,
        windowsHide: true,
      },
    );
    return;
  }
  try {
    await execFileAsync('unzip', ['-oq', zipPath, '-d', destDir], { timeout: 30_000 });
  } catch {
    await execFileAsync('python3', ['-m', 'zipfile', '-e', zipPath, destDir], { timeout: 30_000 });
  }
}

function locateExtractedPluginRoot(extractDir) {
  const isPluginRoot = dir =>
    existsSync(join(dir, 'plugin.json')) && existsSync(join(dir, 'sidecars', 'beautify_hub', 'server.mjs'));
  if (isPluginRoot(extractDir)) return extractDir;
  for (const name of readdirSync(extractDir)) {
    const child = join(extractDir, name);
    try {
      if (statSync(child).isDirectory() && isPluginRoot(child)) return child;
    } catch {}
  }
  return null;
}

export async function applyUpdateFromZip({
  zipPath,
  pluginDir,
  expectedSha256 = '',
  expectedPluginName = 'agy-beautify',
}) {
  const targetDir = resolve(pluginDir);
  if (!existsSync(zipPath)) throw new Error('更新压缩包不存在');
  const buf = readFileSync(zipPath);
  if (buf.length < 22 || buf.length > MAX_ZIP_BYTES) throw new Error('更新压缩包大小无效');
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('下载的文件不是有效的 ZIP 压缩包');

  if (expectedSha256) {
    const actual = createHash('sha256').update(buf).digest('hex').toLowerCase();
    if (actual !== expectedSha256.toLowerCase()) {
      throw new Error('更新包 SHA-256 校验失败，已中止更新');
    }
  }

  const stageDir = mkdtempSync(join(tmpdir(), 'agy-beautify-upd-'));
  const extractDir = join(stageDir, 'extracted');
  const backupDir = join(stageDir, 'backup');
  const lockFile = join(targetDir, '.update-in-progress');
  let lockCreated = false;

  try {
    await extractZipArchive(zipPath, extractDir);
    const pkgRoot = locateExtractedPluginRoot(extractDir);
    if (!pkgRoot) throw new Error('更新包缺少有效的 plugin.json 或 sidecars/beautify_hub/server.mjs');

    const nextManifest = JSON.parse(readFileSync(join(pkgRoot, 'plugin.json'), 'utf8'));
    if (expectedPluginName && nextManifest?.name !== expectedPluginName) {
      throw new Error(`插件名称不匹配 (${nextManifest?.name || 'unknown'})`);
    }
    const nextVersion = normalizeVersion(nextManifest?.version || '');
    if (!nextVersion) throw new Error('更新包版本号无效');

    // Snapshot existing payload for automatic rollback on any copy failure
    mkdirSync(backupDir, { recursive: true });
    for (const item of PAYLOAD_ITEMS) {
      const existing = join(targetDir, item);
      if (existsSync(existing)) {
        cpSync(existing, join(backupDir, item), { recursive: true, force: true });
      }
    }

    // Pause self-reload watcher while replacing files atomically
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(lockFile, String(Date.now()), 'utf8');
    lockCreated = true;

    try {
      for (const item of PAYLOAD_ITEMS) {
        const srcItem = join(pkgRoot, item);
        if (!existsSync(srcItem)) continue;
        cpSync(srcItem, join(targetDir, item), { recursive: true, force: true });
      }
    } catch (copyErr) {
      // Roll back from backup snapshot
      for (const item of PAYLOAD_ITEMS) {
        const bakItem = join(backupDir, item);
        if (existsSync(bakItem)) {
          try { cpSync(bakItem, join(targetDir, item), { recursive: true, force: true }); } catch {}
        }
      }
      throw new Error('写入更新文件失败，已自动回滚原版本：' + copyErr.message);
    }

    return {
      ok: true,
      version: nextVersion,
      pluginDir: targetDir,
      appliedItems: PAYLOAD_ITEMS.filter(i => existsSync(join(pkgRoot, i))),
    };
  } finally {
    if (lockCreated) {
      try { unlinkSync(lockFile); } catch {}
    }
    try { rmSync(stageDir, { recursive: true, force: true }); } catch {}
  }
}

export function createPluginUpdater({
  pluginDir,
  owner = DEFAULT_REPO_OWNER,
  repo = DEFAULT_REPO_NAME,
  onUpdated,
} = {}) {
  let state = {
    status: 'idle', // 'idle' | 'checking' | 'available' | 'up-to-date' | 'updating' | 'updated' | 'error'
    currentVersion: readInstalledVersion(pluginDir),
    latestVersion: '',
    hasUpdate: false,
    releaseTitle: '',
    releaseNotes: '',
    releaseUrl: `https://github.com/${owner}/${repo}/releases`,
    downloadUrl: '',
    assetName: '',
    assetSize: 0,
    assetSha256: '',
    publishedAt: '',
    checkedAt: 0,
    error: '',
  };
  let inflightCheck = null;
  let inflightUpdate = null;

  const getState = () => ({ ...state, currentVersion: readInstalledVersion(pluginDir) });

  const checkForUpdate = async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && state.checkedAt > 0 && now - state.checkedAt < 6 * 3600_000 && state.status !== 'error') {
      return getState();
    }
    if (inflightCheck) return inflightCheck;

    const currentVersion = readInstalledVersion(pluginDir);
    state = { ...state, status: 'checking', currentVersion, error: '' };

    inflightCheck = (async () => {
      try {
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
        let release;
        try {
          release = await fetchJsonWithProxyFallback(apiUrl, 10_000);
        } catch (err) {
          if (String(err?.message || '') === 'HTTP_RATE_LIMIT') {
            release = await resolveLatestViaRedirect(owner, repo, 10_000);
          } else {
            throw err;
          }
        }
        const latestVersion = normalizeVersion(release?.tag_name || release?.name || '');
        if (!latestVersion) throw new Error('未找到正式 Release 版本');
        const asset = pickReleaseZipAsset(release);
        const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;
        const notes = String(release?.body || '').trim().slice(0, 1400);
        state = {
          status: hasUpdate ? 'available' : 'up-to-date',
          currentVersion,
          latestVersion,
          hasUpdate,
          releaseTitle: String(release?.name || `v${latestVersion}`),
          releaseNotes: notes,
          releaseUrl: String(release?.html_url || `https://github.com/${owner}/${repo}/releases/tag/v${latestVersion}`),
          downloadUrl: asset?.url || '',
          assetName: asset?.name || '',
          assetSize: asset?.size || 0,
          assetSha256: asset?.sha256 || '',
          publishedAt: String(release?.published_at || ''),
          checkedAt: Date.now(),
          error: '',
        };
        return getState();
      } catch (err) {
        const msg = String(err?.message || '检查更新失败');
        const friendly = msg === 'HTTP_404'
          ? '尚未发布正式 Release'
          : msg.includes('abort') || msg.includes('timeout')
            ? '连接 GitHub 超时，请检查网络或代理'
            : msg;
        state = {
          ...state,
          status: 'error',
          currentVersion,
          checkedAt: Date.now(),
          error: friendly,
        };
        return getState();
      } finally {
        inflightCheck = null;
      }
    })();

    return inflightCheck;
  };

  const installUpdate = async () => {
    if (inflightUpdate) return inflightUpdate;
    inflightUpdate = (async () => {
      try {
        if (!state.downloadUrl || !state.hasUpdate) {
          const fresh = await checkForUpdate({ force: true });
          if (fresh.status === 'error') {
            return { ok: false, message: `检查更新失败：${fresh.error}`, state: getState() };
          }
          if (!fresh.hasUpdate) {
            return { ok: true, alreadyLatest: true, message: `当前已是最新版本 v${fresh.currentVersion}`, state: getState() };
          }
        }
        if (!state.downloadUrl) {
          throw new Error('最新 Release 未包含可下载的压缩包');
        }

        state = { ...state, status: 'updating', error: '' };
        const dlDir = mkdtempSync(join(tmpdir(), 'agy-beautify-dl-'));
        const zipPath = join(dlDir, basename(state.assetName || 'update.zip'));
        try {
          await downloadFileWithProxyFallback(state.downloadUrl, zipPath, 45_000);
          const applied = await applyUpdateFromZip({
            zipPath,
            pluginDir,
            expectedSha256: state.assetSha256,
            expectedPluginName: 'agy-beautify',
          });
          state = {
            ...state,
            status: 'updated',
            currentVersion: applied.version,
            hasUpdate: false,
            error: '',
          };
          onUpdated?.(applied);
          return {
            ok: true,
            version: applied.version,
            message: `已更新至 v${applied.version}，正在自动热重载生效...`,
            state: getState(),
          };
        } finally {
          try { rmSync(dlDir, { recursive: true, force: true }); } catch {}
        }
      } catch (err) {
        state = {
          ...state,
          status: 'error',
          error: err.message || '更新失败',
        };
        return { ok: false, message: `更新失败：${state.error}`, state: getState() };
      } finally {
        inflightUpdate = null;
      }
    })();
    return inflightUpdate;
  };

  return { getState, checkForUpdate, installUpdate };
}
