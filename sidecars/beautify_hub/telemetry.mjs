import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loopbackFetch } from './loopback_fetch.mjs';

function readVarint(buf, offset) {
  let val = 0n;
  let shift = 0n;
  let i = offset;
  while (i < buf.length && i - offset < 10) {
    const b = buf[i++];
    if (i - offset === 10 && b > 1) throw new RangeError('Invalid varint');
    val |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [Number(val), i];
    shift += 7n;
  }
  throw new RangeError('Truncated varint');
}

export function parsePbMap(buf) {
  const fields = new Map();
  let i = 0;
  while (i < buf.length) {
    try {
      const [tag, ni] = readVarint(buf, i);
      i = ni;
      const fn = tag >>> 3;
      const wt = tag & 7;
      if (fn === 0) break;
      if (!fields.has(fn)) fields.set(fn, []);
      if (wt === 0) {
        const [val, ni2] = readVarint(buf, i);
        i = ni2;
        fields.get(fn).push(val);
      } else if (wt === 2) {
        const [len, ni2] = readVarint(buf, i);
        i = ni2;
        if (len < 0 || i + len > buf.length) break;
        fields.get(fn).push(buf.subarray(i, i + len));
        i += len;
      } else if (wt === 5) {
        fields.get(fn).push(buf.subarray(i, i + 4));
        i += 4;
      } else if (wt === 1) {
        fields.get(fn).push(buf.subarray(i, i + 8));
        i += 8;
      } else break;
    } catch {
      break;
    }
  }
  return fields;
}

function formatFallbackModelId(rawId) {
  const s = String(rawId || '').trim();
  if (!s) return '';
  if (/^gemini-3\.8-flash/i.test(s)) return 'Gemini 3.8 Flash';
  if (/^gemini-4-neon/i.test(s)) return 'Gemini 4 Neon';
  if (/^gemini-4-hydrogen/i.test(s)) return 'Gemini 4 Hydrogen';
  if (/^gemini-4-carbon/i.test(s)) return 'Gemini 4 Carbon';
  if (/^gemini-4-argon/i.test(s)) return 'Gemini 4 Argon';
  if (/^gemini-pro-coordinator|^gemini-pro-orchestrator/i.test(s)) return 'Gemini Orchestrator';
  return s
    .replace(/-preview.*$/i, '')
    .replace(/-n\d*$/i, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map(w => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function parseGenMetadataRow(idx, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
  const top = parsePbMap(buf);
  if (!top.has(1)) return null;

  const stepIndices = [];
  for (const val of top.get(2) || []) {
    if (typeof val === 'number') stepIndices.push(val);
    else if (Buffer.isBuffer(val)) {
      for (let off = 0; off < val.length;) {
        const [n, next] = readVarint(val, off);
        stepIndices.push(n);
        off = next;
      }
    }
  }

  const m1 = parsePbMap(top.get(1)[0]);
  const usage = parsePbMap(m1.get(4)?.[0] || Buffer.alloc(0));
  const uncachedIn = usage.get(2)?.[0] || 0;
  const cachedIn = usage.get(5)?.[0] || 0;
  const totalOut = usage.get(3)?.[0] || 0;
  const thinkTokens = usage.get(9)?.[0] || 0;
  const replyTokens = usage.get(10)?.[0] || Math.max(0, totalOut - thinkTokens);
  const contextTokens = uncachedIn + cachedIn;

  const readDuration = fn => {
    const raw = m1.get(fn)?.[0];
    if (!raw) return null;
    const d = parsePbMap(raw);
    const sec = (d.get(1)?.[0] || 0) + (d.get(2)?.[0] || 0) / 1e9;
    return Number.isFinite(sec) && sec >= 0 && sec < 3600 ? sec : null;
  };
  const ttft = readDuration(11);
  const streaming = readDuration(12);
  const totalSec = (ttft || 0) + (streaming || 0);
  const speed = totalSec > 0 && totalOut > 0 ? Math.round((totalOut / totalSec) * 10) / 10 : null;

  let maxContextTokens = 0;
  const m9 = m1.get(9)?.[0] ? parsePbMap(m1.get(9)[0]) : null;
  const m10 = m9?.get(10)?.[0] ? parsePbMap(m9.get(10)[0]) : null;
  if (m10?.has(4)) maxContextTokens = m10.get(4)[0] || 0;

  const rawDisplay = Buffer.isBuffer(m1.get(21)?.[0]) ? m1.get(21)[0].toString('utf8').trim() : '';
  const rawModelId = Buffer.isBuffer(m1.get(19)?.[0]) ? m1.get(19)[0].toString('utf8').trim() : '';
  const modelDisplayName = rawDisplay || formatFallbackModelId(rawModelId);

  return {
    idx,
    stepIndices,
    uncachedIn,
    cachedIn,
    contextTokens,
    replyTokens,
    thinkTokens,
    totalOut,
    maxContextTokens,
    ttft,
    streaming,
    speed,
    modelDisplayName,
  };
}

export function normalizeModelFamily(rawName) {
  const s = String(rawName || '').trim();
  if (!s) return 'Unknown Model';
  return s.replace(/\s*\((?:off|low|medium|high|extra|xhigh|max|minimal|extra high)(?:\s+thinking)?\)\s*$/i, '').trim() || s;
}

// API rates ($ USD per 1M tokens)
export function getModelPricingUsdPerM(modelName) {
  const n = String(modelName || '').toLowerCase();
  if (n.includes('opus')) return { inPerM: 15.0, cachedPerM: 1.5, outPerM: 75.0 };
  if (n.includes('sonnet')) return { inPerM: 3.0, cachedPerM: 0.3, outPerM: 15.0 };
  if (n.includes('haiku')) return { inPerM: 0.8, cachedPerM: 0.08, outPerM: 4.0 };
  if (n.includes('neon') || n.includes('ultra')) return { inPerM: 2.5, cachedPerM: 0.25, outPerM: 15.0 };
  if (n.includes('carbon') || n.includes('pro')) return { inPerM: 2.0, cachedPerM: 0.2, outPerM: 12.0 };
  if (n.includes('hydrogen') || n.includes('argon')) return { inPerM: 1.25, cachedPerM: 0.125, outPerM: 10.0 };
  if (n.includes('flash') || n.includes('lite') || n.includes('mini')) return { inPerM: 0.3, cachedPerM: 0.03, outPerM: 2.5 };
  if (n.includes('gpt') || n.includes('codex') || n.includes('o3') || n.includes('o4')) return { inPerM: 2.5, cachedPerM: 0.25, outPerM: 10.0 };
  return { inPerM: 2.0, cachedPerM: 0.2, outPerM: 12.0 };
}

export function estimateRequestCostUsd(req) {
  const p = getModelPricingUsdPerM(req.modelDisplayName);
  const inputUsd = ((req.uncachedIn || 0) / 1e6) * p.inPerM;
  const cachedUsd = ((req.cachedIn || 0) / 1e6) * p.cachedPerM;
  const outputUsd = ((req.totalOut || 0) / 1e6) * p.outPerM;
  const totalUsd = inputUsd + cachedUsd + outputUsd;
  const savedUsd = ((req.cachedIn || 0) / 1e6) * Math.max(0, p.inPerM - p.cachedPerM);
  return { inputUsd, cachedUsd, outputUsd, totalUsd, savedUsd, pricing: p };
}

const MILESTONES = [
  { minTokens: 0, title: '算力启程者', icon: '🌱', nextAt: 1_000_000 },
  { minTokens: 1_000_000, title: '百万算力先锋', icon: '✨', nextAt: 10_000_000 },
  { minTokens: 10_000_000, title: '千万 Token 架构师', icon: '⚡', nextAt: 100_000_000 },
  { minTokens: 100_000_000, title: '亿级算力指挥官', icon: '🚀', nextAt: 500_000_000 },
  { minTokens: 500_000_000, title: '半十亿传奇领航者', icon: '👑', nextAt: 1_000_000_000 },
  { minTokens: 1_000_000_000, title: '十亿星海宗师', icon: '🌌', nextAt: 5_000_000_000 },
];

export function computeAchievement(totalTokens, totalOutputTokens) {
  let cur = MILESTONES[0];
  for (const m of MILESTONES) {
    if (totalTokens >= m.minTokens) cur = m;
  }
  const span = Math.max(1, cur.nextAt - cur.minTokens);
  const progressPct = Math.min(100, Math.max(0, Math.round(((totalTokens - cur.minTokens) / span) * 100)));
  return {
    title: cur.title,
    icon: cur.icon,
    nextAt: cur.nextAt,
    progressPct,
    booksEquivalent: Math.max(1, Math.round(totalTokens / 200_000)),
    codeLinesEquivalent: Math.max(1, Math.round(totalOutputTokens / 12)),
  };
}

export function extractPrimaryCommand(cmdLine) {
  if (typeof cmdLine !== 'string') return '';
  const text = cmdLine.trim();
  if (!text) return '';

  // Detect embedded python/node scripts in PowerShell variables/here-strings
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  let pyVarHint = false;
  let nodeVarHint = false;
  for (const line of lines) {
    if (/^\$[a-zA-Z0-9_]+\s*=/.test(line)) {
      if (/python(?:w|3|\d+)?\.exe|python3?\b/i.test(line)) pyVarHint = true;
      if (/node\.exe|\bnode\b/i.test(line)) nodeVarHint = true;
      continue;
    }
    if (line.startsWith("@'") || line.startsWith('@"')) continue;
    // Strip leading cd ... ; or cd ... &&
    const cleaned = line.replace(/^(?:cd|Set-Location)\s+[^;&|]+(?:&&|;)\s*/i, '').trim();
    if (!cleaned || cleaned.startsWith('if ') || cleaned.startsWith('foreach') || cleaned.startsWith('try') || cleaned.startsWith('{') || cleaned.startsWith('}')) {
      continue;
    }
    const amp = /^&\s+["']?([^"'\s]+)["']?/.exec(cleaned);
    if (amp) {
      const target = amp[1];
      if (target.startsWith('$')) {
        if (pyVarHint || /py/i.test(target)) return 'python';
        if (nodeVarHint || /node/i.test(target)) return 'node';
      } else {
        const base = basename(target).replace(/\.(?:exe|cmd|bat|ps1)$/i, '');
        if (base) return base.toLowerCase();
      }
    }
    const first = /^["']?([a-zA-Z0-9_.:\\/+-]+)["']?/.exec(cleaned)?.[1] || '';
    if (!first) continue;
    if (first.includes('\\') || first.includes('/')) {
      const base = basename(first).replace(/\.(?:exe|cmd|bat|ps1)$/i, '');
      if (/^python/i.test(base)) return 'python';
      return base || '';
    }
    if (/^python(?:\d|\.)*$/i.test(first)) return 'python';
    if (/^[a-zA-Z][a-zA-Z0-9_.-]{1,28}$/.test(first)) return first;
  }
  if (pyVarHint || /\bpython(?:\d|\.)?(?:\.exe)?\b/i.test(text)) return 'python';
  if (nodeVarHint || /\bnode(?:\.exe)?\b/i.test(text)) return 'node';
  if (/\bgit\b/i.test(text)) return 'git';
  if (/\bnpm\b/i.test(text)) return 'npm';
  return 'powershell';
}

export function extractSkillName(pathStr) {
  if (typeof pathStr !== 'string' || !/SKILL\.md$/i.test(pathStr.trim())) return '';
  const norm = pathStr.trim().replace(/\\/g, '/');
  const direct = /\/skills\/([^/]+)\/SKILL\.md$/i.exec(norm);
  if (direct && direct[1] && direct[1].toLowerCase() !== 'skills') return direct[1];
  const pluginLevel = /\/([^/]+)\/skills\/SKILL\.md$/i.exec(norm);
  if (pluginLevel && pluginLevel[1]) return pluginLevel[1];
  const fallback = /\/([^/]+)\/SKILL\.md$/i.exec(norm);
  return fallback ? fallback[1] : '';
}

function parseWorkspaceLabel(workspaceUrisRaw) {
  if (!workspaceUrisRaw || typeof workspaceUrisRaw !== 'string') return '全局对话';
  try {
    const arr = JSON.parse(workspaceUrisRaw);
    const first = Array.isArray(arr) ? String(arr[0] || '') : '';
    if (!first) return '全局对话';
    const clean = decodeURIComponent(first.replace(/^file:\/\/(?:localhost)?/i, '')).replace(/[\\/]+$/, '');
    const parts = clean.split(/[\\/]+/).filter(Boolean);
    return parts[parts.length - 1] || '全局对话';
  } catch {
    return '全局对话';
  }
}

export function getConversationDirs(dataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR) {
  if (dataDir) {
    const root = resolve(dataDir);
    for (let dir = root; dir !== dirname(dir); dir = dirname(dir)) {
      if (basename(dir) === 'sidecar_data') return [join(dirname(dir), 'conversations')];
    }
    return [join(root, 'conversations')];
  }
  return ['antigravity', 'antigravity-ide', 'antigravity-cli'].map(p => join(homedir(), '.gemini', p, 'conversations'));
}

function readStepTimestamps(metadataBuf) {
  if (!metadataBuf) return { startMs: 0, endMs: 0, durationSec: 0, map: null };
  const sm = parsePbMap(Buffer.from(metadataBuf));
  const readTs = fn => {
    const raw = sm.get(fn)?.[0];
    if (!raw || !Buffer.isBuffer(raw)) return 0;
    const p = parsePbMap(raw);
    const sec = p.has(1) ? Number(p.get(1)[0]) : 0;
    const nano = p.has(2) ? Number(p.get(2)[0]) : 0;
    return sec > 0 ? sec * 1000 + Math.floor(nano / 1e6) : 0;
  };
  const ts1 = readTs(1);
  const ts7 = readTs(7);
  const ts8 = readTs(8);
  const startMs = ts1 || ts7 || ts8 || 0;
  const endMs = Math.max(ts8, ts7, ts1);
  const rawDur = startMs > 0 && endMs > startMs ? (endMs - startMs) / 1000 : 0;
  const durationSec = rawDur > 0 && rawDur <= 600 ? rawDur : 0;
  return { startMs, endMs, durationSec, map: sm };
}

function extractToolCallFromMeta(sm) {
  if (!sm) return null;
  for (const vals of sm.values()) {
    for (const v of vals) {
      if (!Buffer.isBuffer(v) || v.length < 6) continue;
      const inner = parsePbMap(v);
      const nBuf = inner.get(2)?.[0];
      const aBuf = inner.get(3)?.[0];
      if (!Buffer.isBuffer(nBuf) || !Buffer.isBuffer(aBuf)) continue;
      const name = nBuf.toString('utf8').trim();
      if (!name || name.length > 80 || !/^[a-zA-Z0-9_.:-]+$/.test(name)) continue;
      const argsStr = aBuf.toString('utf8');
      if (!argsStr.startsWith('{')) continue;
      let command = '';
      let skillName = '';
      try {
        const args = JSON.parse(argsStr);
        if (name === 'run_command' || name.includes('command') || name.includes('bash')) {
          command = extractPrimaryCommand(args.CommandLine || args.command || args.cmd || '');
        }
        const pathArg = args.Path || args.AbsolutePath || args.TargetFile || args.FilePath || '';
        if (typeof pathArg === 'string' && /SKILL\.md$/i.test(pathArg)) {
          skillName = extractSkillName(pathArg);
        }
      } catch {}
      return { name, command, skillName };
    }
  }
  return null;
}

function dateKeyLocal(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function roundUsd(v) {
  return Math.round((Number(v) || 0) * 10000) / 10000;
}

function roundSec(v) {
  return Math.round((Number(v) || 0) * 10) / 10;
}

export function parseQuotaGroups(data) {
  const rawGroups = data?.response?.groups ?? data?.groups ?? [];
  const winRank = w => {
    const k = String(w || '').toLowerCase();
    if (k.includes('5h') || k.includes('five')) return 0;
    if (k.includes('day') || k.includes('24h')) return 1;
    if (k.includes('week')) return 2;
    return 3;
  };
  return (Array.isArray(rawGroups) ? rawGroups : []).map(g => {
    const rawList = Array.isArray(g.buckets)
      ? g.buckets
      : Array.isArray(g.quotaWindows)
        ? g.quotaWindows
        : Array.isArray(g.windows)
          ? g.windows
          : [];
    const windows = rawList
      .map(w => ({
        id: w.bucketId || w.id || '',
        window: w.window || w.windowType || '',
        label: w.window === '5h'
          ? '5 小时'
          : w.window === 'weekly'
            ? '周额度'
            : (w.displayName || w.label || w.window || w.windowType || '窗口'),
        remainingFraction: typeof w.remainingFraction === 'number' ? w.remainingFraction : null,
        resetTime: typeof w.resetTime === 'string' ? w.resetTime : '',
      }))
      .sort((a, b) => winRank(a.window || a.id) - winRank(b.window || b.id));
    const primary = windows.find(w => typeof w.remainingFraction === 'number') || windows[0] || null;
    const soonestReset = windows
      .map(w => ({ ts: Date.parse(w.resetTime || ''), iso: w.resetTime }))
      .filter(x => Number.isFinite(x.ts) && x.ts > 0)
      .sort((a, b) => a.ts - b.ts)[0]?.iso || '';
    return {
      name: g.displayName || g.groupName || g.id || 'Model Pool',
      remainingFraction: typeof g.remainingFraction === 'number' ? g.remainingFraction : (primary?.remainingFraction ?? null),
      resetTime: g.resetTime || primary?.resetTime || soonestReset || '',
      windows,
    };
  });
}

export function createTelemetryEngine({ conversationDirs = getConversationDirs() } = {}) {
  const fileCache = new Map();
  let quotaCache = { groups: [], fetchedAt: 0 };

  const readConversationMeta = () => {
    const meta = new Map();
    for (const dir of conversationDirs) {
      const sumPath = join(dirname(dir), 'conversation_summaries.db');
      if (!existsSync(sumPath)) continue;
      let db;
      try {
        db = new DatabaseSync(sumPath, { readOnly: true });
        for (const row of db.prepare('SELECT conversation_id, title, preview, step_count, workspace_uris FROM conversation_summaries').all()) {
          if (!row?.conversation_id) continue;
          const id = String(row.conversation_id);
          meta.set(id, {
            title: String(row.title || row.preview || '').trim(),
            workspace: parseWorkspaceLabel(row.workspace_uris),
            stepCount: Number(row.step_count) || 0,
          });
        }
      } catch {}
      finally { try { db?.close(); } catch {} }
    }
    return meta;
  };

  const resolveDb = (conversationId, allowLatest = true) => {
    if (conversationId && /^[0-9a-zA-Z_-]+$/.test(conversationId)) {
      for (const dir of conversationDirs) {
        const p = join(dir, `${conversationId}.db`);
        if (statSync(p, { throwIfNoEntry: false })?.isFile()) return p;
      }
    }
    if (!allowLatest) return null;
    let best = null;
    let bestMtime = -1;
    for (const dir of conversationDirs) {
      let entries;
      try { entries = readdirSync(dir); } catch { continue; }
      for (const file of entries) {
        if (!file.endsWith('.db')) continue;
        const p = join(dir, file);
        const st = statSync(p, { throwIfNoEntry: false });
        if (st && st.mtimeMs > bestMtime) {
          bestMtime = st.mtimeMs;
          best = p;
        }
      }
    }
    return best;
  };

  const inspectDbFile = dbPath => {
    const st = statSync(dbPath, { throwIfNoEntry: false });
    if (!st) return null;
    const walSt = statSync(dbPath + '-wal', { throwIfNoEntry: false });
    const sig = `${st.mtimeMs}:${st.size}:${walSt?.mtimeMs || 0}:${walSt?.size || 0}`;
    const hit = fileCache.get(dbPath);
    if (hit && hit.sig === sig) return hit.data;

    let db;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      const genRows = db.prepare('SELECT idx, data FROM gen_metadata ORDER BY idx ASC').all();
      const stepTimeByIdx = new Map();
      const toolEvents = [];
      let lastStepMs = st.mtimeMs;
      let totalSteps = 0;
      let userTurns = 0;
      let plannerStepSec = 0;

      try {
        for (const s of db.prepare('SELECT idx, step_type, metadata FROM steps').all()) {
          totalSteps++;
          if (s.step_type === 14) userTurns++;
          const { startMs, endMs, durationSec, map } = readStepTimestamps(s.metadata);
          const atMs = endMs || startMs || 0;
          if (atMs > 0) {
            stepTimeByIdx.set(s.idx, atMs);
            if (atMs > lastStepMs) lastStepMs = atMs;
          }
          if (s.step_type === 15 && durationSec > 0) {
            plannerStepSec += durationSec;
          }
          if (s.step_type === 132 || map) {
            const tc = extractToolCallFromMeta(map);
            if (tc) {
              toolEvents.push({
                name: tc.name,
                command: tc.command,
                skillName: tc.skillName,
                atMs: atMs || lastStepMs || st.mtimeMs,
                durationSec,
              });
            }
          }
        }
      } catch {}

      const parsed = [];
      for (const row of genRows) {
        const item = parseGenMetadataRow(row.idx, row.data);
        if (!item) continue;
        let atMs = 0;
        for (const si of item.stepIndices) {
          const ms = stepTimeByIdx.get(si);
          if (ms && ms > atMs) atMs = ms;
        }
        item.atMs = atMs || lastStepMs || st.mtimeMs;
        parsed.push(item);
      }

      const lastWithContext = [...parsed].reverse().find(r => r.contextTokens > 0) || parsed[parsed.length - 1] || null;
      const lastWithSpeed = [...parsed].reverse().find(r => r.speed !== null) || null;
      const maxContext = lastWithContext?.maxContextTokens || 200_000;
      const usedContext = lastWithContext ? (lastWithContext.contextTokens + lastWithContext.replyTokens) : 0;
      const totalInput = lastWithContext ? lastWithContext.contextTokens : 0;
      const cacheHitPct = totalInput > 0 ? Math.round((lastWithContext.cachedIn / totalInput) * 100) : null;

      const data = {
        conversationId: basename(dbPath, '.db'),
        requestCount: parsed.length,
        totalSteps,
        userTurns,
        plannerStepSec,
        lastUpdatedMs: lastStepMs,
        modelName: lastWithContext?.modelDisplayName || '',
        usedContext,
        maxContext,
        contextPct: maxContext > 0 ? Math.min(100, Math.round((usedContext / maxContext) * 1000) / 10) : 0,
        uncachedIn: lastWithContext?.uncachedIn || 0,
        cachedIn: lastWithContext?.cachedIn || 0,
        replyTokens: lastWithContext?.replyTokens || 0,
        thinkTokens: lastWithContext?.thinkTokens || 0,
        cacheHitPct,
        speedTokPerSec: lastWithSpeed?.speed ?? null,
        requests: parsed,
        toolEvents,
      };
      fileCache.set(dbPath, { sig, data });
      return data;
    } catch {
      return null;
    } finally {
      try { db?.close(); } catch {}
    }
  };

  const getConversationMetrics = conversationId => {
    const dbPath = resolveDb(conversationId, true);
    if (!dbPath) {
      return {
        conversationId: conversationId || '',
        requestCount: 0,
        modelName: '',
        usedContext: 0,
        maxContext: 200_000,
        contextPct: 0,
        uncachedIn: 0,
        cachedIn: 0,
        replyTokens: 0,
        thinkTokens: 0,
        cacheHitPct: null,
        speedTokPerSec: null,
      };
    }
    const snap = inspectDbFile(dbPath);
    if (!snap) return null;
    const { requests: _r, toolEvents: _t, ...summary } = snap;
    return summary;
  };

  const makeEmptyBucket = () => ({
    tokens: 0, requests: 0, cached: 0, uncached: 0, output: 0, think: 0, reply: 0,
    costUsd: 0, savedUsd: 0, inputUsd: 0, cachedUsd: 0, outputUsd: 0,
    toolCalls: 0, turns: 0,
    waitSec: 0, thinkSec: 0, replySec: 0, toolSec: 0,
    _speedSum: 0, _speedCount: 0,
    _sessions: new Set(),
    _byModel: new Map(),
    _byTool: new Map(),
    _byCmd: new Map(),
    _bySkill: new Map(),
  });

  const finalizeBucket = b => {
    const avgSpeed = b._speedCount > 0 ? Math.round((b._speedSum / b._speedCount) * 10) / 10 : null;
    const totalSec = b.waitSec + b.thinkSec + b.replySec + b.toolSec;
    return {
      tokens: b.tokens,
      requests: b.requests,
      cached: b.cached,
      uncached: b.uncached,
      output: b.output,
      think: b.think,
      reply: b.reply,
      costUsd: roundUsd(b.costUsd),
      savedUsd: roundUsd(b.savedUsd),
      inputUsd: roundUsd(b.inputUsd),
      cachedUsd: roundUsd(b.cachedUsd),
      outputUsd: roundUsd(b.outputUsd),
      avgSpeed,
      toolCalls: b.toolCalls,
      turns: b.turns,
      sessions: b._sessions.size,
      timings: {
        waitSec: roundSec(b.waitSec),
        thinkSec: roundSec(b.thinkSec),
        replySec: roundSec(b.replySec),
        toolSec: roundSec(b.toolSec),
        totalSec: roundSec(totalSec),
      },
      byModel: [...b._byModel.values()]
        .map(m => ({ ...m, costUsd: roundUsd(m.costUsd), savedUsd: roundUsd(m.savedUsd) }))
        .sort((a, b2) => b2.costUsd - a.costUsd)
        .slice(0, 8),
      topTools: [...b._byTool.values()]
        .map(t => ({ ...t, durationSec: roundSec(t.durationSec) }))
        .sort((a, b2) => b2.count - a.count)
        .slice(0, 10),
      topCommands: [...b._byCmd.values()]
        .sort((a, b2) => b2.count - a.count)
        .slice(0, 10),
      topSkills: [...b._bySkill.values()]
        .sort((a, b2) => b2.count - a.count)
        .slice(0, 10),
    };
  };

  const getUsageDashboard = () => {
    const now = Date.now();
    const todayKey = dateKeyLocal(now);
    const day7Cutoff = now - 7 * 86400_000;
    const day30Cutoff = now - 30 * 86400_000;

    const rawTotals = {
      today: makeEmptyBucket(),
      week: makeEmptyBucket(),
      month: makeEmptyBucket(),
      all: makeEmptyBucket(),
    };
    const byDay84 = new Map();
    const byWorkspace = new Map();
    const allConversations = [];
    const metaMap = readConversationMeta();

    // Build 140-day (20-week) calendar map ending today
    for (let i = 139; i >= 0; i--) {
      const ts = now - i * 86400_000;
      const d = new Date(ts);
      const dk = dateKeyLocal(ts);
      byDay84.set(dk, {
        date: dk,
        dow: (d.getDay() + 6) % 7, // 0=Mon .. 6=Sun
        tokens: 0, cached: 0, uncached: 0, output: 0,
        requests: 0, costUsd: 0, savedUsd: 0,
        _sessions: new Set(),
      });
    }

    const addRequestToBucket = (bucket, req, cost, convId) => {
      const total = req.uncachedIn + req.cachedIn + req.totalOut;
      bucket.tokens += total;
      bucket.cached += req.cachedIn;
      bucket.uncached += req.uncachedIn;
      bucket.output += req.totalOut;
      bucket.think += req.thinkTokens;
      bucket.reply += req.replyTokens;
      bucket.requests += 1;
      bucket.costUsd += cost.totalUsd;
      bucket.savedUsd += cost.savedUsd;
      bucket.inputUsd += cost.inputUsd;
      bucket.cachedUsd += cost.cachedUsd;
      bucket.outputUsd += cost.outputUsd;
      bucket._sessions.add(convId);

      // Timing breakdown: ttft -> waitSec; streaming -> split between thinkSec & replySec by token share
      if (typeof req.ttft === 'number' && req.ttft > 0) bucket.waitSec += req.ttft;
      if (typeof req.streaming === 'number' && req.streaming > 0) {
        const outSum = req.thinkTokens + req.replyTokens;
        const thinkShare = outSum > 0 ? req.thinkTokens / outSum : 0;
        bucket.thinkSec += req.streaming * thinkShare;
        bucket.replySec += req.streaming * (1 - thinkShare);
      }

      if (typeof req.speed === 'number' && req.speed > 0 && req.speed < 2000) {
        bucket._speedSum += req.speed;
        bucket._speedCount += 1;
      }

      const fam = normalizeModelFamily(req.modelDisplayName);
      const m = bucket._byModel.get(fam) || {
        model: fam,
        tokens: 0, cached: 0, uncached: 0, output: 0, requests: 0,
        costUsd: 0, savedUsd: 0,
        inPerM: cost.pricing.inPerM, cachedPerM: cost.pricing.cachedPerM, outPerM: cost.pricing.outPerM,
      };
      m.tokens += total;
      m.cached += req.cachedIn;
      m.uncached += req.uncachedIn;
      m.output += req.totalOut;
      m.requests += 1;
      m.costUsd += cost.totalUsd;
      m.savedUsd += cost.savedUsd;
      bucket._byModel.set(fam, m);
    };

    const addToolToBucket = (bucket, ev) => {
      bucket.toolCalls += 1;
      bucket.toolSec += ev.durationSec || 0;
      const t = bucket._byTool.get(ev.name) || { name: ev.name, count: 0, durationSec: 0 };
      t.count += 1;
      t.durationSec += ev.durationSec || 0;
      bucket._byTool.set(ev.name, t);

      if (ev.command) {
        const c = bucket._byCmd.get(ev.command) || { name: ev.command, count: 0 };
        c.count += 1;
        bucket._byCmd.set(ev.command, c);
      }
      if (ev.skillName) {
        const sk = bucket._bySkill.get(ev.skillName) || { name: ev.skillName, count: 0, lastUsedMs: 0 };
        sk.count += 1;
        if (ev.atMs > sk.lastUsedMs) sk.lastUsedMs = ev.atMs;
        bucket._bySkill.set(ev.skillName, sk);
      }
    };

    let scannedConversations = 0;
    for (const dir of conversationDirs) {
      let entries;
      try { entries = readdirSync(dir); } catch { continue; }
      for (const file of entries) {
        if (!file.endsWith('.db')) continue;
        const snap = inspectDbFile(join(dir, file));
        if (!snap) continue;
        scannedConversations++;
        const meta = metaMap.get(snap.conversationId);
        const title = meta?.title || snap.conversationId.slice(0, 8);
        const workspace = meta?.workspace || '全局对话';

        let convTokens = 0;
        let convCost = 0;
        let convSaved = 0;
        let convReqs = 0;
        let convActiveSec = 0;

        for (const req of snap.requests) {
          const total = req.uncachedIn + req.cachedIn + req.totalOut;
          if (total <= 0) continue;
          const cost = estimateRequestCostUsd(req);
          convTokens += total;
          convCost += cost.totalUsd;
          convSaved += cost.savedUsd;
          convReqs += 1;
          convActiveSec += (req.ttft || 0) + (req.streaming || 0);

          addRequestToBucket(rawTotals.all, req, cost, snap.conversationId);
          const dk = dateKeyLocal(req.atMs);
          if (dk === todayKey) addRequestToBucket(rawTotals.today, req, cost, snap.conversationId);
          if (req.atMs >= day7Cutoff) addRequestToBucket(rawTotals.week, req, cost, snap.conversationId);
          if (req.atMs >= day30Cutoff) addRequestToBucket(rawTotals.month, req, cost, snap.conversationId);

          if (byDay84.has(dk)) {
            const d = byDay84.get(dk);
            d.tokens += total;
            d.cached += req.cachedIn;
            d.uncached += req.uncachedIn;
            d.output += req.totalOut;
            d.requests += 1;
            d.costUsd += cost.totalUsd;
            d.savedUsd += cost.savedUsd;
            d._sessions.add(snap.conversationId);
          }
        }

        for (const ev of snap.toolEvents || []) {
          convActiveSec += ev.durationSec || 0;
          addToolToBucket(rawTotals.all, ev);
          const dk = dateKeyLocal(ev.atMs);
          if (dk === todayKey) addToolToBucket(rawTotals.today, ev);
          if (ev.atMs >= day7Cutoff) addToolToBucket(rawTotals.week, ev);
          if (ev.atMs >= day30Cutoff) addToolToBucket(rawTotals.month, ev);
        }

        // Attribute turns to active buckets
        if (snap.userTurns > 0) {
          rawTotals.all.turns += snap.userTurns;
          if (dateKeyLocal(snap.lastUpdatedMs) === todayKey) rawTotals.today.turns += snap.userTurns;
          if (snap.lastUpdatedMs >= day7Cutoff) rawTotals.week.turns += snap.userTurns;
          if (snap.lastUpdatedMs >= day30Cutoff) rawTotals.month.turns += snap.userTurns;
        }

        if (convTokens > 0 || (snap.toolEvents?.length || 0) > 0) {
          const ws = byWorkspace.get(workspace) || { name: workspace, sessions: 0, tokens: 0, costUsd: 0, toolCalls: 0 };
          ws.sessions += 1;
          ws.tokens += convTokens;
          ws.costUsd += convCost;
          ws.toolCalls += snap.toolEvents?.length || 0;
          byWorkspace.set(workspace, ws);

          allConversations.push({
            id: snap.conversationId,
            title,
            workspace,
            model: normalizeModelFamily(snap.modelName),
            tokens: convTokens,
            costUsd: roundUsd(convCost),
            savedUsd: roundUsd(convSaved),
            requests: convReqs,
            turns: snap.userTurns || 0,
            steps: snap.totalSteps || meta?.stepCount || 0,
            toolCalls: snap.toolEvents?.length || 0,
            activeSec: roundSec(convActiveSec),
            usedContext: snap.usedContext || 0,
            maxContext: snap.maxContext || 200_000,
            contextPct: snap.contextPct || 0,
            lastUpdatedMs: snap.lastUpdatedMs,
          });
        }
      }
    }

    const totals = {
      today: finalizeBucket(rawTotals.today),
      week: finalizeBucket(rawTotals.week),
      month: finalizeBucket(rawTotals.month),
      all: finalizeBucket(rawTotals.all),
    };

    const heatmap = [...byDay84.values()].map(({ _sessions, ...d }) => ({
      ...d,
      sessions: _sessions.size,
      costUsd: roundUsd(d.costUsd),
      savedUsd: roundUsd(d.savedUsd),
    }));
    const daily14 = heatmap.slice(-14);
    const sortedConvs = allConversations.sort((a, b) => b.costUsd - a.costUsd);

    return {
      scannedConversations,
      updatedAt: now,
      totals,
      achievement: computeAchievement(totals.all.tokens, totals.all.output),
      daily14,
      heatmap,
      byModel: totals.all.byModel,
      byWorkspace: [...byWorkspace.values()]
        .map(w => ({ ...w, costUsd: roundUsd(w.costUsd) }))
        .sort((a, b) => b.costUsd - a.costUsd)
        .slice(0, 12),
      conversations: sortedConvs,
      topConversations: sortedConvs.slice(0, 6),
    };
  };

  const fetchQuota = async () => {
    const now = Date.now();
    if (now - quotaCache.fetchedAt < 12_000 && quotaCache.groups.length) return quotaCache.groups;
    const addr = process.env.ANTIGRAVITY_LS_ADDRESS;
    const csrf = process.env.ANTIGRAVITY_CSRF_TOKEN;
    if (!addr || !csrf) return quotaCache.groups;
    try {
      const res = await loopbackFetch(`http://${addr}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-codeium-csrf-token': csrf },
        body: '{}',
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return quotaCache.groups;
      const data = await res.json();
      const groups = parseQuotaGroups(data);
      quotaCache = { groups, fetchedAt: now };
      return groups;
    } catch {
      return quotaCache.groups;
    }
  };

  return { getConversationMetrics, getUsageDashboard, fetchQuota };
}
