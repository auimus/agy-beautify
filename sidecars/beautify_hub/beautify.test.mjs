import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildCssFontStack, listSystemFonts, normalizeFontList, sanitizeFontFamily } from './fonts.mjs';
import { translateUiText } from './i18n_dict.mjs';
import { buildExplorerSelectArgs, resolveRevealTarget, uriOrPathToLocal } from './path_utils.mjs';
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
import { createTelemetryEngine, estimateRequestCostUsd, normalizeModelFamily, parseQuotaGroups } from './telemetry.mjs';
import { applyUpdateFromZip, compareSemver, pickReleaseZipAsset } from './updater.mjs';

test('i18n dictionary translates exact and patterned Antigravity UI strings', () => {
  assert.equal(translateUiText('New Conversation'), '新建对话');
  assert.equal(translateUiText('Worked for 18s'), '已工作 18s');
  assert.equal(translateUiText('3 files changed'), '已变更 3 个文件');
  assert.equal(translateUiText('4/5 steps'), '4/5 步骤');
  assert.equal(translateUiText('Browse the Marketplace'), '浏览插件市场');
  assert.equal(translateUiText('New Conversation (Ctrl+N)'), '新建对话 (Ctrl+N)');
  assert.equal(translateUiText('12 tools'), '12 个工具');
  assert.equal(translateUiText('70% left'), '70% 剩余');
  assert.equal(translateUiText('Every 15 minutes'), '每 15 分钟');
  assert.equal(translateUiText('Publish feat/i18n to origin'), '将 feat/i18n 发布到 origin');
  assert.equal(
    translateUiText("When toggled on, Antigravity will use your AI credits to fulfill model requests once you're out of model quota. Antigravity will always use your model quota first before using AI credits."),
    '启用后，当模型配额用尽时，Antigravity 将使用您的 AI 额度处理模型请求。系统会优先使用模型配额，之后才使用 AI 额度。',
  );
  assert.equal(
    translateUiText('You have used some of your weekly limit, it will fully refresh in 6 days, 3 hours.'),
    '您已使用部分每周配额，将在 6 天 3 小时后完全刷新。',
  );
  assert.equal(
    translateUiText('You have used some of your 5-hour limit, it will fully refresh in 2 hours, 45 minutes.'),
    '您已使用部分 5 小时配额，将在 2 小时 45 分钟后完全刷新。',
  );
  assert.equal(translateUiText('Auto'), '自动');
  assert.equal(translateUiText('Turbo'), '极速');
  assert.equal(translateUiText('Request Review'), '请求审查');
  assert.equal(translateUiText('Every command requires approval.'), '每个命令都需要审批.');
  assert.equal(translateUiText('Mark Unread'), '标记为未读');
  assert.equal(translateUiText('Unrelated arbitrary code foo()'), null);
});

test('wallpapers provide curated light/dark themes (without gta6) and support upload, path import and delete', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-beautify-wp-'));
  try {
    const builtIns = listWallpapers(dir);
    assert.ok(!builtIns.some(w => w.id === 'gta6'));
    assert.ok(builtIns.some(w => w.id === 'liquid-prism-light' && w.tone === 'light'));
    assert.ok(builtIns.some(w => w.id === 'sakura-mist-light' && w.tone === 'light'));
    assert.ok(builtIns.some(w => w.id === 'deep-ocean-glass' && w.tone === 'dark'));
    assert.ok(builtIns.some(w => w.id === 'gemini-aurora' && w.tone === 'dark'));
    assert.ok(resolveWallpaperDataUri('deep-ocean-glass', dir).startsWith('data:image/svg+xml;base64,'));

    const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const customId = saveCustomWallpaper('my-bg.png', png1x1, dir);
    assert.equal(customId, 'custom:my-bg.png');
    assert.ok(resolveWallpaperDataUri(customId, dir).startsWith('data:image/png;base64,'));
    assert.equal(deleteCustomWallpaper(customId, dir), true);
    assert.equal(resolveWallpaperDataUri(customId, dir), '');

    const srcFile = join(dir, 'local_sample.png');
    writeFileSync(srcFile, Buffer.from(png1x1, 'base64'));
    const importedId = importWallpaperFromLocalPath(srcFile, join(dir, 'custom_store'));
    assert.equal(importedId, 'custom:local_sample.png');
    assert.ok(resolveWallpaperDataUri(importedId, join(dir, 'custom_store')).startsWith('data:image/png;base64,'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('settings store persists Liquid Glass, sidebar monitor, presets and migrates legacy gta6', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-beautify-cfg-'));
  try {
    const cfgPath = join(dir, 'settings.json');
    const store = createSettingsStore(cfgPath);
    const init = store.read();
    assert.equal(init.geminiModelPicker, true);
    assert.equal(init.autoChinese, true);
    assert.equal(init.wallpaperId, 'deep-ocean-glass');
    assert.equal(init.showSidebarMonitor, true);
    assert.equal(init.themeMode, 'dark');
    assert.equal(init.glassStyle, 'liquid');
    assert.equal(init.autoCompactEnabled, false);
    assert.equal(init.autoCompactThreshold, 80);

    // Auto-compact threshold clamping check
    store.update({ autoCompactEnabled: true, autoCompactThreshold: 70 });
    assert.equal(store.read().autoCompactEnabled, true);
    assert.equal(store.read().autoCompactThreshold, 70);
    store.update({ autoCompactThreshold: 10 });
    assert.equal(store.read().autoCompactThreshold, 40);
    store.update({ autoCompactThreshold: 120 });
    assert.equal(store.read().autoCompactThreshold, 95);

    // Custom system font & weight clamping + sanitization check
    assert.equal(init.customFontEnabled, false);
    assert.equal(init.uiFontFamily, '');
    assert.equal(init.uiFontWeight, 400);
    store.update({
      customFontEnabled: true,
      uiFontFamily: 'Noto Sans SC; } body { display:none',
      uiFontWeight: 525,
      codeFontFamily: 'Maple Mono',
      codeFontWeight: 1200,
    });
    assert.equal(store.read().customFontEnabled, true);
    assert.ok(!/[{};<>]/.test(store.read().uiFontFamily));
    assert.equal(store.read().uiFontWeight, 550);
    assert.equal(store.read().codeFontFamily, 'Maple Mono');
    assert.equal(store.read().codeFontWeight, 900);

    // Legacy gta6 migration check
    store.update({ wallpaperId: 'gta6', activePreset: 'gta-neon' });
    assert.equal(store.read().wallpaperId, 'deep-ocean-glass');
    assert.equal(store.read().activePreset, 'liquid-dark');

    assert.ok(PRESETS.length >= 5);
    const lightPreset = getPresetPatch('liquid-light');
    assert.equal(lightPreset.themeMode, 'light');
    store.update(lightPreset);
    store.recordReveal({ path: 'C:\\a.py', folder: 'C:\\', name: 'a.py' });
    const reloaded = createSettingsStore(cfgPath).read();
    assert.equal(reloaded.themeMode, 'light');
    assert.equal(reloaded.activePreset, 'liquid-light');
    assert.equal(reloaded.recentReveals[0].path, 'C:\\a.py');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('path_utils resolves Windows file URIs and explorer select args cleanly', () => {
  assert.equal(
    uriOrPathToLocal('file:///c%3A/Users/demo/my%20doc.md#L10-L20', { platform: 'win32' }),
    'C:\\Users\\demo\\my doc.md',
  );
  assert.deepEqual(buildExplorerSelectArgs('C:\\My Dir\\a.txt'), ['/select,"C:\\My Dir\\a.txt"']);
  const res = resolveRevealTarget('C:\\Work\\missing.txt', {
    platform: 'win32',
    statImpl: p => {
      if (p === 'C:\\Work') return { isDirectory: () => true };
      throw new Error('ENOENT');
    },
  });
  assert.equal(res.ok, true);
  assert.equal(res.fallback, true);
  assert.equal(res.folderPath, 'C:\\Work');
});

test('telemetry engine estimates USD cost, cache savings, achievements and reads real local DBs', () => {
  assert.equal(normalizeModelFamily('Gemini 4 Neon (XHigh)'), 'Gemini 4 Neon');
  const cost = estimateRequestCostUsd({ modelDisplayName: 'Gemini 4 Neon (XHigh)', uncachedIn: 1_000_000, cachedIn: 2_000_000, totalOut: 100_000 });
  assert.equal(Math.round(cost.totalUsd * 100) / 100, 4.5); // 2.5 + 0.5 + 1.5
  assert.equal(Math.round(cost.savedUsd * 100) / 100, 4.5); // 2M * (2.5 - 0.25)

  const engine = createTelemetryEngine();
  const dash = engine.getUsageDashboard();
  assert.ok(dash.scannedConversations >= 1);
  assert.equal(dash.daily14.length, 14);
  assert.equal(dash.heatmap.length, 140);
  assert.ok(dash.totals.all.tokens > 0);
  assert.ok(dash.totals.all.costUsd > 0);
  assert.ok(dash.totals.all.toolCalls >= 0);
  assert.ok(typeof dash.totals.all.timings?.totalSec === 'number');
  assert.ok(Array.isArray(dash.totals.all.topTools));
  assert.ok(Array.isArray(dash.totals.all.topCommands));
  assert.ok(Array.isArray(dash.byWorkspace));
  assert.ok(Array.isArray(dash.conversations));
  assert.ok(dash.achievement.title.length > 0);
  assert.ok(Array.isArray(dash.topConversations));

  const parsedQuotas = parseQuotaGroups({
    response: {
      groups: [
        {
          displayName: 'Gemini Models',
          buckets: [
            { bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0.7, resetTime: '2026-12-03T07:20:03Z' },
            { bucketId: 'gemini-5h', window: '5h', remainingFraction: 0.66, resetTime: '2026-11-26T17:20:03Z' },
          ],
        },
      ],
    },
  });
  assert.equal(parsedQuotas.length, 1);
  assert.equal(parsedQuotas[0].windows[0].window, '5h');
  assert.equal(parsedQuotas[0].windows[0].label, '5 小时');
  assert.equal(parsedQuotas[0].windows[0].resetTime, '2026-11-26T17:20:03Z');
  assert.equal(parsedQuotas[0].windows[1].window, 'weekly');
});

test('updater compares semver, picks release zip assets, and applies atomic verified zip updates', async () => {
  assert.equal(compareSemver('1.5.0', '1.4.0'), 1);
  assert.equal(compareSemver('v1.10.0', '1.9.9'), 1);
  assert.equal(compareSemver('v1.4.0', '1.4.0'), 0);
  assert.equal(compareSemver('1.3.9', '1.4.0'), -1);

  const asset = pickReleaseZipAsset({
    tag_name: 'v1.5.0',
    assets: [
      { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' },
      {
        name: 'agy-beautify-v1.5.0.zip',
        browser_download_url: 'https://example.com/agy-beautify-v1.5.0.zip',
        size: 102400,
        digest: 'sha256:' + 'a'.repeat(64),
      },
    ],
  });
  assert.equal(asset.name, 'agy-beautify-v1.5.0.zip');
  assert.equal(asset.sha256, 'a'.repeat(64));

  // End-to-end atomic zip update test inside an isolated temp sandbox
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const { existsSync, mkdirSync, readFileSync } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'agy-beautify-upd-test-'));
  try {
    const installedDir = join(root, 'installed');
    mkdirSync(join(installedDir, 'sidecars', 'beautify_hub'), { recursive: true });
    writeFileSync(join(installedDir, 'plugin.json'), JSON.stringify({ name: 'agy-beautify', version: '1.4.0' }));
    writeFileSync(join(installedDir, 'sidecars', 'beautify_hub', 'server.mjs'), '// v1.4.0\n');

    const pkgSrc = join(root, 'pkg', 'agy-beautify');
    mkdirSync(join(pkgSrc, 'sidecars', 'beautify_hub'), { recursive: true });
    writeFileSync(join(pkgSrc, 'plugin.json'), JSON.stringify({ name: 'agy-beautify', version: '1.5.0' }));
    writeFileSync(join(pkgSrc, 'sidecars', 'beautify_hub', 'server.mjs'), '// v1.5.0 updated\n');

    const zipPath = join(root, 'agy-beautify-v1.5.0.zip');
    if (process.platform === 'win32') {
      execFileSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', 'Compress-Archive -Path $env:SRC -DestinationPath $env:DST -Force'],
        { env: { ...process.env, SRC: pkgSrc, DST: zipPath }, windowsHide: true },
      );
    } else {
      execFileSync('zip', ['-qr', zipPath, 'agy-beautify'], { cwd: join(root, 'pkg') });
    }
    const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');

    // Wrong SHA-256 must fail before touching installedDir
    await assert.rejects(
      () => applyUpdateFromZip({ zipPath, pluginDir: installedDir, expectedSha256: '0'.repeat(64) }),
      /SHA-256/,
    );
    assert.equal(JSON.parse(readFileSync(join(installedDir, 'plugin.json'), 'utf8')).version, '1.4.0');

    // Valid SHA-256 upgrades files cleanly and removes .update-in-progress lock
    const res = await applyUpdateFromZip({ zipPath, pluginDir: installedDir, expectedSha256: sha });
    assert.equal(res.ok, true);
    assert.equal(res.version, '1.5.0');
    assert.equal(JSON.parse(readFileSync(join(installedDir, 'plugin.json'), 'utf8')).version, '1.5.0');
    assert.equal(readFileSync(join(installedDir, 'sidecars', 'beautify_hub', 'server.mjs'), 'utf8'), '// v1.5.0 updated\n');
    assert.equal(existsSync(join(installedDir, '.update-in-progress')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('system font scanner enumerates local fonts and builds safe CSS stacks', async () => {
  assert.equal(sanitizeFontFamily('Microsoft YaHei; } <script>'), 'Microsoft YaHei script');
  assert.equal(
    buildCssFontStack('Noto Sans SC, Segoe UI', 'sans-serif'),
    '"Noto Sans SC", "Segoe UI", sans-serif',
  );
  const normalized = normalizeFontList(['Maple Mono', 'maple mono', '微软雅黑', 'Segoe UI']);
  assert.equal(normalized.length, 3);
  assert.equal(normalized.find(f => f.name === 'Maple Mono')?.isMono, true);
  assert.equal(normalized.find(f => f.name === '微软雅黑')?.isCjk, true);

  const systemFonts = await listSystemFonts();
  assert.ok(Array.isArray(systemFonts) && systemFonts.length > 10);
  assert.ok(systemFonts.every(f => typeof f.name === 'string' && f.name.length > 0));
});
