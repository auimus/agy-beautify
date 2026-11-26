import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function normalizeWinDrive(p) {
  return p.replace(/^[a-z]:/, ch => ch.toUpperCase());
}

export function stripLocationSuffix(raw) {
  let value = String(raw ?? '').trim();
  value = value.replace(/#L?\d+(?:-L?\d+)?$/i, '');
  const winDrive = /^[A-Za-z]:/.test(value);
  const body = winDrive ? value.slice(2) : value;
  const cleanedBody = body.replace(/:(\d+)(?::(\d+))?$/, '');
  return (winDrive ? value.slice(0, 2) : '') + cleanedBody;
}

export function uriOrPathToLocal(raw, { platform = process.platform, home = homedir(), existsCheck = null } = {}) {
  if (typeof raw !== 'string') return '';
  let value = raw.trim().replace(/^["'`]+|["'`]+$/g, '');
  if (!value) return '';
  if (/^(?:https?|mailto|javascript|data|blob|sidecar|customization|plugin|conversation):/i.test(value)) {
    return '';
  }

  const p = platform === 'win32' ? path.win32 : path.posix;

  if (/^file:\//i.test(value)) {
    const hashIdx = value.indexOf('#');
    if (hashIdx !== -1) value = value.slice(0, hashIdx);
    const queryIdx = value.indexOf('?');
    if (queryIdx !== -1) value = value.slice(0, queryIdx);
    if (platform === 'win32') {
      try {
        value = fileURLToPath(value);
      } catch {
        let rest = value.replace(/^file:\/\/(?:localhost)?/i, '').replace(/^file:/i, '');
        rest = safeDecode(rest);
        if (/^\/[A-Za-z]:/.test(rest)) rest = rest.slice(1);
        else if (!rest.startsWith('/') && rest.includes('/')) rest = '\\\\' + rest;
        value = rest.replace(/\//g, '\\');
      }
      return normalizeWinDrive(p.normalize(stripLocationSuffix(value)));
    }
    try {
      value = fileURLToPath(value);
    } catch {
      value = safeDecode(value.replace(/^file:\/\/(?:localhost)?/i, '').replace(/^file:/i, ''));
    }
    return p.normalize(stripLocationSuffix(value));
  }

  if (value === '~' || value.startsWith('~/') || value.startsWith('~\\')) {
    value = p.join(home, value.slice(2));
  }

  const rawCandidate = value.replace(/#L?\d+(?:-L?\d+)?$/i, '');
  const canKeepRaw = typeof existsCheck === 'function' && existsCheck(rawCandidate);
  const stripped = canKeepRaw ? rawCandidate : stripLocationSuffix(value);

  if (platform === 'win32' && /^\/[A-Za-z]:[\\/]/.test(stripped)) {
    return normalizeWinDrive(path.win32.normalize(stripped.slice(1)));
  }
  if (/^[A-Za-z]:[\\/]/.test(stripped) || /^\\\\[^\\]/.test(stripped)) {
    return normalizeWinDrive(path.win32.normalize(stripped));
  }
  if (stripped.startsWith('/')) {
    return path.posix.normalize(stripped);
  }
  return '';
}

export function resolveRevealTarget(raw, { platform = process.platform, home = homedir(), statImpl = statSync } = {}) {
  const existsCheck = p => {
    try { statImpl(p); return true; } catch { return false; }
  };
  const localPath = uriOrPathToLocal(raw, { platform, home, existsCheck });
  if (!localPath) {
    return { ok: false, exists: false, localPath: '', error: '无法识别有效的本地文件路径' };
  }
  const p = (platform === 'win32' || /^[A-Za-z]:|^\\\\/.test(localPath)) ? path.win32 : path.posix;
  try {
    const st = statImpl(localPath);
    const isDirectory = typeof st?.isDirectory === 'function' ? st.isDirectory() : false;
    return {
      ok: true,
      exists: true,
      isDirectory,
      fallback: false,
      localPath,
      targetPath: localPath,
      folderPath: isDirectory ? localPath : p.dirname(localPath),
    };
  } catch {
    let cur = p.dirname(localPath);
    while (cur) {
      try {
        const st = statImpl(cur);
        const isDirectory = typeof st?.isDirectory === 'function' ? st.isDirectory() : true;
        const folderPath = isDirectory ? cur : p.dirname(cur);
        return {
          ok: true,
          exists: false,
          isDirectory: true,
          fallback: true,
          localPath,
          targetPath: folderPath,
          folderPath,
        };
      } catch {
        const next = p.dirname(cur);
        if (next === cur) break;
        cur = next;
      }
    }
    return { ok: false, exists: false, localPath, error: `路径不存在: ${localPath}` };
  }
}

export function buildExplorerSelectArgs(targetPath) {
  return [`/select,"${String(targetPath).replace(/"/g, '')}"`];
}

export function spawnDetached(command, args, options = {}) {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', ...options });
  child.unref();
  return child;
}

export function revealInFileManager(raw, { platform = process.platform, statImpl = statSync, spawnImpl = spawnDetached } = {}) {
  const resolved = resolveRevealTarget(raw, { platform, statImpl });
  if (!resolved.ok) return resolved;
  if (platform === 'win32') {
    if (resolved.isDirectory) {
      spawnImpl('explorer.exe', [resolved.folderPath], { windowsHide: false });
    } else {
      spawnImpl('explorer.exe', buildExplorerSelectArgs(resolved.targetPath), {
        windowsHide: false,
        windowsVerbatimArguments: true,
      });
    }
    return resolved;
  }
  if (platform === 'darwin') {
    spawnImpl('open', resolved.isDirectory ? [resolved.folderPath] : ['-R', resolved.targetPath]);
    return resolved;
  }
  spawnImpl('xdg-open', [resolved.folderPath]);
  return resolved;
}

export function openTargetWithDefaultApp(raw, { platform = process.platform, statImpl = statSync, spawnImpl = spawnDetached } = {}) {
  const resolved = resolveRevealTarget(raw, { platform, statImpl });
  if (!resolved.ok) return resolved;
  if (platform === 'win32') {
    spawnImpl('explorer.exe', [resolved.targetPath], { windowsHide: false });
    return resolved;
  }
  if (platform === 'darwin') {
    spawnImpl('open', [resolved.targetPath]);
    return resolved;
  }
  spawnImpl('xdg-open', [resolved.targetPath]);
  return resolved;
}

export function openTerminalInFolder(raw, { platform = process.platform, statImpl = statSync, spawnImpl = spawnDetached } = {}) {
  const resolved = resolveRevealTarget(raw, { platform, statImpl });
  if (!resolved.ok) return resolved;
  if (platform === 'win32') {
    const escaped = resolved.folderPath.replace(/'/g, "''");
    const psExe = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    try {
      spawnImpl('wt.exe', ['-d', resolved.folderPath], { windowsHide: false });
    } catch {
      spawnImpl(psExe, ['-NoExit', '-Command', `Set-Location -LiteralPath '${escaped}'`], { windowsHide: false });
    }
    return resolved;
  }
  if (platform === 'darwin') {
    spawnImpl('open', ['-a', 'Terminal', resolved.folderPath]);
    return resolved;
  }
  spawnImpl('x-terminal-emulator', ['--working-directory', resolved.folderPath]);
  return resolved;
}
