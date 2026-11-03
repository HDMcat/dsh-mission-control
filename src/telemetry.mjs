/**
 * Generic, sanitized telemetry collector.
 *
 * Design rules:
 * - No absolute user paths in snapshots; only a display label and relative event paths.
 * - No session logs, process command lines, API keys, hostnames, or per-user identifiers.
 * - Every collector is optional and failure-tolerant: a missing GPU or unavailable
 *   filesystem returns null instead of throwing or inventing data.
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const MAX_SERIES = 90;
const MAX_EVENTS = 80;
const IGNORE_RE = /(^|[\\/])(\.git|\.hg|\.svn|node_modules|\.venv|venv|__pycache__|\.cache|\.next|dist|build|coverage)([\\/]|$)/i;
const DEMO_NAMES = [
  'src/app.js', 'src/ui/panel.js', 'src/lib/metrics.js',
  'docs/README.md', 'tests/smoke.test.js',
];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function pctOf(part, total) {
  return total > 0 ? clamp((part / total) * 100, 0, 100) : 0;
}

function readCpuTimes() {
  return os.cpus().map((cpu) => ({
    idle: cpu.times.idle,
    total: Object.values(cpu.times).reduce((a, b) => a + b, 0),
  }));
}

let previousCpu = null;

function sampleCpu() {
  const now = readCpuTimes();
  if (!now.length) return { pct: 0, cores: [] };
  if (!previousCpu || previousCpu.length !== now.length) {
    previousCpu = now;
    return { pct: 0, cores: now.map(() => 0) };
  }
  let idle = 0;
  let total = 0;
  const cores = now.map((cur, i) => {
    const prev = previousCpu[i];
    const dTotal = Math.max(0, cur.total - prev.total);
    const dIdle = Math.max(0, cur.idle - prev.idle);
    idle += dIdle;
    total += dTotal;
    return dTotal > 0 ? clamp((1 - dIdle / dTotal) * 100, 0, 100) : 0;
  });
  previousCpu = now;
  return {
    pct: total > 0 ? clamp((1 - idle / total) * 100, 0, 100) : 0,
    cores,
  };
}

function queryGpu() {
  return new Promise((resolve) => {
    const args = [
      '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.gr',
      '--format=csv,noheader,nounits',
    ];
    execFile('nvidia-smi', args, { timeout: 1500, windowsHide: true }, (error, stdout) => {
      if (error || !stdout) return resolve(null);
      const line = stdout.trim().split(/\r?\n/)[0];
      if (!line) return resolve(null);
      const parts = line.split(',').map((s) => s.trim());
      const [name, util, used, total, temp, power, clock] = parts;
      if (!name || util === undefined || total === undefined) return resolve(null);
      const usedMiB = Number(used);
      const totalMiB = Number(total);
      resolve({
        name,
        pct: clamp(Number(util) || 0, 0, 100),
        memUsed: Number.isFinite(usedMiB) ? usedMiB * 1024 * 1024 : null,
        memTotal: Number.isFinite(totalMiB) ? totalMiB * 1024 * 1024 : null,
        memPct: Number.isFinite(usedMiB) && Number.isFinite(totalMiB) && totalMiB > 0
          ? pctOf(usedMiB, totalMiB) : null,
        temp: Number.isFinite(Number(temp)) ? Number(temp) : null,
        power: Number.isFinite(Number(power)) ? Number(power) : null,
        clock: Number.isFinite(Number(clock)) ? Number(clock) : null,
      });
    });
  });
}

function sampleDisk(root) {
  try {
    const st = fs.statfsSync(root);
    const total = Number(st.bsize) * Number(st.blocks);
    const free = Number(st.bsize) * Number(st.bavail);
    if (!Number.isFinite(total) || total <= 0) return null;
    return { total, free, used: total - free, pct: pctOf(total - free, total) };
  } catch {
    return null;
  }
}

function baseSnapshot({ demoMode, watchLabel }) {
  if (demoMode) {
    const total = 32 * 1024 ** 3;
    return {
      schema: 'dsh.mission_control.snapshot/v1',
      ts: Date.now(),
      demo: true,
      host: { platform: 'demo', arch: 'x64', release: 'demo', uptime_s: 3600, load: [0, 0, 0] },
      cpu: { pct: 0, cores: Array.from({ length: 16 }, () => 0), model: 'Demo CPU' },
      mem: { pct: 68.7, used: 22 * 1024 ** 3, total },
      gpu: null,
      disk: null,
      watch: { enabled: true, label: 'demo-workspace', recent: 0 },
      files: [],
      series: { cpu: [], mem: [], gpu: [] },
    };
  }
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const cpus = os.cpus();
  return {
    schema: 'dsh.mission_control.snapshot/v1',
    ts: Date.now(),
    demo: false,
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      uptime_s: Math.round(os.uptime()),
      load: os.loadavg().map((n) => Math.round(n * 100) / 100),
    },
    cpu: { pct: 0, cores: cpus.map(() => 0), model: cpus[0]?.model || '' },
    mem: {
      pct: pctOf(memTotal - memFree, memTotal),
      used: memTotal - memFree,
      total: memTotal,
    },
    gpu: null,
    disk: null,
    watch: { enabled: false, label: watchLabel, recent: 0 },
    files: [],
    series: { cpu: [], mem: [], gpu: [] },
  };
}

function normalizeRelative(value) {
  return String(value)
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

export function createHub({
  watchDir = process.cwd(),
  pollMs = 2000,
  enableFileWatch = true,
  demoMode = false,
} = {}) {
  const root = path.resolve(watchDir || process.cwd());
  const rootLabel = path.basename(root) || path.parse(root).root || 'workspace';
  let latest = baseSnapshot({ demoMode, watchLabel: demoMode ? 'demo-workspace' : rootLabel });
  let timer = null;
  let watcher = null;
  let inFlight = false;
  let closed = false;
  let eventSeq = 0;
  const events = [];

  function pushEvent(kind, rel) {
    const normalized = normalizeRelative(rel);
    if (!normalized || IGNORE_RE.test('/' + normalized)) return;
    const now = Date.now();
    const last = events[0];
    if (last && last.rel === normalized && now - last.t < 180) {
      last.t = now;
      return;
    }
    events.unshift({
      id: ++eventSeq,
      t: now,
      kind,
      rel: normalized,
      area: normalized.split('/')[0] || 'workspace',
    });
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  }

  function demoEvent() {
    const name = DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
    pushEvent('change', name);
  }

  function startWatch() {
    if (demoMode) {
      pushEvent('change', 'src/app.js');
      latest.watch = { enabled: true, label: 'demo-workspace', recent: 0 };
      return;
    }
    if (!enableFileWatch) return;
    try {
      if (!fs.statSync(root).isDirectory()) return;
      watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        const kind = eventType === 'rename' ? 'rename' : 'change';
        pushEvent(kind, filename);
      });
      watcher.on('error', () => { /* keep serving the last snapshot */ });
      latest.watch = { enabled: true, label: rootLabel, recent: 0 };
    } catch {
      latest.watch = { enabled: false, label: rootLabel, recent: 0 };
    }
  }

  function pushSeries(snapshot) {
    const series = latest.series;
    series.cpu.push(Math.round(snapshot.cpu.pct));
    series.mem.push(Math.round(snapshot.mem.pct));
    series.gpu.push(snapshot.gpu ? Math.round(snapshot.gpu.pct) : 0);
    for (const key of Object.keys(series)) {
      if (series[key].length > MAX_SERIES) series[key].splice(0, series[key].length - MAX_SERIES);
    }
  }

  async function refresh() {
    if (inFlight || closed) return;
    inFlight = true;
    try {
      const demoTotal = 32 * 1024 ** 3;
      const demoUsed = (18 + Math.sin(Date.now() / 9000) * 4) * 1024 ** 3;
      const cpu = demoMode
        ? { pct: 34 + Math.sin(Date.now() / 7000) * 17, cores: Array.from({ length: 16 }, (_, i) => 35 + Math.sin(Date.now() / 5000 + i) * 25) }
        : sampleCpu();
      const memTotal = demoMode ? demoTotal : os.totalmem();
      const memFree = demoMode ? demoTotal - demoUsed : os.freemem();
      const gpu = demoMode ? {
        name: 'Demo GPU',
        pct: 38 + Math.round(Math.sin(Date.now() / 8000) * 22),
        memUsed: 6.2 * 1024 ** 3,
        memTotal: 12 * 1024 ** 3,
        memPct: 52,
        temp: 61,
        power: 92,
        clock: 2110,
      } : await queryGpu();
      const disk = demoMode
        ? { total: 1.8 * 1024 ** 4, free: 0.62 * 1024 ** 4, used: 1.18 * 1024 ** 4, pct: 65.5 }
        : sampleDisk(path.parse(root).root);
      const memPct = pctOf(memTotal - memFree, memTotal);
      const snapshot = {
        ...latest,
        ts: Date.now(),
        demo: !!demoMode,
        host: demoMode
          ? { platform: 'demo', arch: 'x64', release: 'demo', uptime_s: 3600, load: [0, 0, 0] }
          : {
            platform: process.platform,
            arch: process.arch,
            release: os.release(),
            uptime_s: Math.round(os.uptime()),
            load: os.loadavg().map((n) => Math.round(n * 100) / 100),
          },
        cpu: { pct: cpu.pct, cores: cpu.cores, model: demoMode ? 'Demo CPU' : (os.cpus()[0]?.model || '') },
        mem: { pct: memPct, used: memTotal - memFree, total: memTotal },
        gpu,
        disk,
        watch: { ...latest.watch, recent: events.length },
        files: events.slice(0, 30),
      };
      pushSeries(snapshot);
      snapshot.series = {
        cpu: [...latest.series.cpu],
        mem: [...latest.series.mem],
        gpu: [...latest.series.gpu],
      };
      latest = snapshot;
      if (demoMode && Math.random() < 0.35) demoEvent();
    } catch {
      /* keep the last good snapshot */
    } finally {
      inFlight = false;
    }
  }

  startWatch();

  return {
    start() {
      if (timer) return;
      refresh();
      timer = setInterval(refresh, Math.max(500, Number(pollMs) || 2000));
    },
    stop() {
      closed = true;
      if (timer) clearInterval(timer);
      timer = null;
      try { watcher?.close(); } catch { /* ignore */ }
      watcher = null;
    },
    snapshot() {
      return latest;
    },
    events() {
      return latest.files || [];
    },
  };
}
