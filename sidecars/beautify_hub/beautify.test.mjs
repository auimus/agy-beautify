import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
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

test('i18n dictionary translates exact and patterned Antigravity UI strings', () => {
  assert.equal(translateUiText('New Conversation'), '新建对话');
  assert.equal(translateUiText('Worked for 18s'), '已工作 18s');
  assert.equal(translateUiText('3 files changed'), '已变更 3 个文件');
  assert.equal(translateUiText('4/5 steps'), '4/5 步骤');
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
