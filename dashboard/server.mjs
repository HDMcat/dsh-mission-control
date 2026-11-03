#!/usr/bin/env node
/**
 * MISSION CONTROL — backend
 * ------------------------------------------------------------------
 *  A zero-dependency Node.js telemetry server that watches:
 *    1. the live DeepSeek Harness (DSH) session  (zstd JSONL event log)
 *    2. the Windows host                          (CPU / RAM / GPU / procs)
 *    3. a configurable workspace                  (filesystem events + git)
 *
 *  Serves the full paper/ink HUD over HTTP + Server-Sent-Events.
 *
 *  Run:  node server.mjs        ->  http://127.0.0.1:7800
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  allowedOriginSet, cookieValue, isLoopbackHost, mutationOriginAllowed,
  randomToken, safeEqualString, setHudCookie, setSecurityHeaders,
} from '../src/http-security.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = process.env.MC_STATE_DIR || __dirname;
const SETTINGS_PATH = process.env.MC_SETTINGS_PATH || path.join(STATE_DIR, 'settings.json');
let ROOT = process.env.MC_WATCH_DIR || process.cwd();
try {
  const saved = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  if (saved.root && fs.existsSync(saved.root) && fs.statSync(saved.root).isDirectory()) ROOT = path.resolve(saved.root);
} catch { /* first run / invalid settings */ }
const PORT = Number(process.env.MC_FULL_PORT || 7800);
const HOST = '127.0.0.1';
const DASH_VERSION = '3.0';
const READONLY = process.env.MC_READONLY === '1' || process.env.MC_ALLOW_PROC !== '1';
const HUD_TOKEN = randomToken(32);
const HUD_ORIGINS = allowedOriginSet([
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
]);
const ALLOWED_PROCS = new Set(['python', 'pythonw', 'node', 'pwsh', 'powershell']);
const HOME = os.homedir();
const DSH = process.env.DSH_HOME || path.join(HOME, '.dsh');
const SESSIONS_DIR = path.join(DSH, 'sessions');
const PROJ_DIR = path.join(DSH, 'storages', 'session_projcache', 'sessions');
const NODE_BIN = process.execPath;
const NVSMI = fs.existsSync('C:\\Windows\\System32\\nvidia-smi.exe')
  ? 'C:\\Windows\\System32\\nvidia-smi.exe'
  : 'nvidia-smi';

const T0 = Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v) => (Number.isFinite(v) ? v : 0);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ================================================================== */
/*  ONE-TIME HARDWARE BENCHMARK                                        */
/* ================================================================== */
let BENCH_RESULT = null;
let BENCH_PROMISE = null;

function speedToMbps(value) {
  const m = String(value || '').match(/([\d.]+)\s*(Gbps|Mbps|Kbps)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2].toLowerCase() === 'gbps') return Math.round(n * 1000);
  if (m[2].toLowerCase() === 'kbps') return +(n / 1000).toFixed(1);
  return Math.round(n);
}

function readLinkCapacity() {
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      "$a=Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | Sort-Object LinkSpeed -Descending | Select-Object -First 1 Name,LinkSpeed,InterfaceDescription; $a | ConvertTo-Json -Compress",
    ], { timeout: 8000, windowsHide: true, encoding: 'utf8' });
    const data = JSON.parse(String(out || '{}'));
    return {
      name: data.Name || data.InterfaceDescription || 'adapter',
      linkMbps: speedToMbps(data.LinkSpeed),
      linkLabel: data.LinkSpeed || null,
    };
  } catch {
    return { name: null, linkMbps: null, linkLabel: null };
  }
}

async function runBenchmark() {
  const result = {
    at: new Date().toISOString(),
    cpuMops: null,
    memGBs: null,
    diskReadMBs: null,
    diskWriteMBs: null,
    net: readLinkCapacity(),
    diskPath: null,
  };

  // CPU: 4M integer ops, single thread.
  try {
    const n = 4_000_000;
    const t0 = process.hrtime.bigint();
    let x = 1;
    for (let i = 0; i < n; i++) x = (x * 1664525 + 1013904223) >>> 0;
    const sec = Number(process.hrtime.bigint() - t0) / 1e9;
    result.cpuMops = +(n / sec / 1e6).toFixed(1);
    result.cpuProbe = x;
  } catch { /* ignore */ }

  // Memory: 64 MiB copy.
  try {
    const size = 64 * 1024 * 1024;
    const src = Buffer.alloc(size, 0xa5);
    const dst = Buffer.alloc(size);
    const t0 = process.hrtime.bigint();
    dst.set(src);
    const sec = Number(process.hrtime.bigint() - t0) / 1e9;
    result.memGBs = +((size / 1e9) / sec).toFixed(2);
  } catch { /* ignore */ }

  // Disk: 32 MiB sequential write+fsync, then read.
  const tmp = path.join(STATE_DIR, `mc-bench-${process.pid}.tmp`);
  result.diskPath = tmp;
  try {
    const size = 32 * 1024 * 1024;
    const buf = Buffer.alloc(size, 0x5a);
    const fd = fs.openSync(tmp, 'w');
    const tw0 = process.hrtime.bigint();
    fs.writeSync(fd, buf, 0, size, 0);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    const tw = Number(process.hrtime.bigint() - tw0) / 1e9;
    result.diskWriteMBs = +((size / 1e6) / tw).toFixed(0);
    const tr0 = process.hrtime.bigint();
    const read = fs.readFileSync(tmp);
    const tr = Number(process.hrtime.bigint() - tr0) / 1e9;
    result.diskReadMBs = +((read.length / 1e6) / tr).toFixed(0);
  } catch (error) {
    result.diskError = String(error?.message || error).slice(0, 200);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }

  result.net.peakMbps = null;
  return result;
}

function benchmarkSnapshot() {
  if (BENCH_RESULT) return BENCH_RESULT;
  if (!BENCH_PROMISE) {
    BENCH_PROMISE = runBenchmark()
      .then((r) => { BENCH_RESULT = r; return r; })
      .finally(() => { BENCH_PROMISE = null; });
  }
  return BENCH_PROMISE;
}


/* ================================================================== */
/*  SYSTEM TELEMETRY                                                   */
/* ================================================================== */
class SystemTelemetry {
  constructor() {
    this.cpu = { pct: 0, model: os.cpus()[0]?.model?.trim() || 'CPU', cores: os.cpus().length, speed: 0, perCore: [], history: [], winPct: null, winAt: 0 };
    this.mem = { total: os.totalmem(), used: 0, pct: 0 };
    this.gpu = null; this.gpuHistory = [];
    this.procs = []; this.prevProc = new Map(); this.procBusy = false;
    this.net = null; this.netPrev = new Map(); this.netPeakMbps = 0;
    this.netLinkMbps = null; this.netLinkName = null; this.netLinkBusy = false;
    this.disk = { total: 0, free: 0, used: 0, pct: 0 };
    this.disks = {};
    this.diskIo = {}; this.diskIoPeak = {}; this.diskIoPrev = {}; this.diskIoBusy = false; this.lastDiskIoAt = 0;
    this.lastCpuSample = this.cpuTimes();
    this.lastCoreTimes = os.cpus().map((c) => ({ ...c.times }));
    this.lastCpuAt = Date.now();
    this.emaCpu = 0;
    this.readDisk();
    this.readDiskIo();
    this.readNetLink();
  }
  cpuTimes() {
    let idle = 0, total = 0;
    for (const c of os.cpus()) {
      const t = c.times;
      idle += t.idle;
      total += t.user + t.nice + t.sys + t.idle + t.irq;
    }
    return { idle, total };
  }
  readNetLink() {
    if (this.netLinkBusy) return;
    this.netLinkBusy = true;
    try {
      const info = readLinkCapacity();
      this.netLinkMbps = info.linkMbps;
      this.netLinkName = info.name;
      this.netLinkLabel = info.linkLabel;
    } catch { /* keep null */ }
    this.netLinkBusy = false;
  }
  sampleCpu() {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const c of cpus) {
      const t = c.times;
      idle += t.idle;
      total += t.user + t.nice + t.sys + t.idle + t.irq;
    }
    const dt = total - this.lastCpuSample.total;
    const di = idle - this.lastCpuSample.idle;
    this.lastCpuSample = { idle, total };
    if (dt >= 500 && di >= 0) {
      const raw = clamp((1 - di / dt) * 100, 0, 100);
      this.emaCpu = this.emaCpu ? this.emaCpu * 0.45 + raw * 0.55 : raw;
      this.cpu.pct = +this.emaCpu.toFixed(1);
    }
    const per = [];
    for (let i = 0; i < cpus.length; i++) {
      const t = cpus[i].times, p = this.lastCoreTimes[i];
      if (!p) { per.push(0); continue; }
      const cdt = (t.user + t.nice + t.sys + t.idle + t.irq) - (p.user + p.nice + p.sys + p.idle + p.irq);
      const cdi = t.idle - p.idle;
      per.push(cdt >= 500 && cdi >= 0 ? +clamp((1 - cdi / cdt) * 100, 0, 100).toFixed(1) : 0);
    }
    this.lastCoreTimes = cpus.map((c) => ({ ...c.times }));
    this.cpu.perCore = per;
    this.cpu.speed = cpus[0]?.speed || 0;
    // memory
    const free = os.freemem();
    this.mem.total = os.totalmem();
    this.mem.used = this.mem.total - free;
    this.mem.pct = +((this.mem.used / this.mem.total) * 100).toFixed(1);
  }
  readDisk() {
    let drives = this.driveList;
    if (!drives) {
      drives = ['E:', 'C:', 'D:'];
      if (process.platform === 'win32') {
        try {
          const out = execFileSync('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-Command',
            'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object -ExpandProperty DeviceID',
          ], { timeout: 4000, windowsHide: true, encoding: 'utf8' });
          const found = String(out || '').split(/\r?\n/)
            .map((s) => s.trim().toUpperCase())
            .filter((s) => /^[A-Z]:$/.test(s));
          if (found.length) drives = [...new Set(found)];
        } catch { /* keep fallback */ }
      }
      this.driveList = drives.slice().sort();
    }
    const next = {};
    for (const drive of drives) {
      try {
        const st = fs.statfsSync(drive + '\\');
        const total = st.blocks * st.bsize;
        const free = st.bavail * st.bsize;
        const used = total - free;
        next[drive] = { total, free, used, pct: +((used / total) * 100).toFixed(1) };
        if (drive === 'E:') this.disk = next[drive];
      } catch { /* drive missing */ }
    }
    this.disks = next;
    if (!this.disk || !this.disks['E:']) this.disk = this.disks[Object.keys(this.disks)[0]] || this.disk;
  }
  readDiskIo() {
    if (this.diskIoBusy || Date.now() - (this.lastDiskIoAt || 0) < 1200) return;
    this.diskIoBusy = true;
    this.lastDiskIoAt = Date.now();
    const ps = [
      '$OutputEncoding=[Console]::OutputEncoding=[Text.Encoding]::UTF8;',
      'Get-CimInstance Win32_PerfRawData_PerfDisk_LogicalDisk |',
      'Select-Object Name,Timestamp_PerfTime,Frequency_PerfTime,DiskReadBytesPersec,DiskWriteBytesPersec | ConvertTo-Json -Compress',
    ].join(' ');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { timeout: 7000, windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
        this.diskIoBusy = false;
        if (err || !stdout) return;
        try {
          let rows = JSON.parse(String(stdout || '{}'));
          if (!Array.isArray(rows)) rows = [rows];
          for (const row of rows) {
            const name = String(row?.Name || '').toUpperCase();
            if (!/^[A-Z]:$/.test(name)) continue;
            const t = Number(row.Timestamp_PerfTime);
            const freq = Number(row.Frequency_PerfTime) || 1e7;
            const readTotal = Math.max(0, Number(row.DiskReadBytesPersec) || 0);
            const writeTotal = Math.max(0, Number(row.DiskWriteBytesPersec) || 0);
            const prev = this.diskIoPrev[name];
            this.diskIoPrev[name] = { t, readTotal, writeTotal };
            if (!prev || !Number.isFinite(t) || t <= prev.t) continue;
            const seconds = (t - prev.t) / freq;
            if (!(seconds > 0.2 && seconds < 30)) continue;
            const readBps = Math.max(0, (readTotal - prev.readTotal) / seconds);
            const writeBps = Math.max(0, (writeTotal - prev.writeTotal) / seconds);
            this.diskIo[name] = { readBps, writeBps, at: Date.now() };
            this.diskIoPeak[name] = Math.max(this.diskIoPeak[name] || 0, readBps);
          }
        } catch { /* counters can be unavailable; keep last sample */ }
      });
  }
  readGpu() {
    return new Promise((resolve) => {
      execFile(NVSMI, [
        '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.sm,fan.speed,utilization.memory,utilization.encoder,utilization.decoder,clocks.max.sm,power.limit',
        '--format=csv,noheader,nounits',
      ], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err || !stdout) return resolve(false);
        const line = stdout.trim().split(/\r?\n/)[0];
        const parts = line.split(',').map((s) => s.trim());
        const g = {
          name: parts[0] || 'GPU',
          util: num(parseFloat(parts[1])),
          memUsed: num(parseFloat(parts[2])) * 1024 * 1024,
          memTotal: num(parseFloat(parts[3])) * 1024 * 1024,
          temp: num(parseFloat(parts[4])),
          power: num(parseFloat(parts[5])),
          clock: num(parseFloat(parts[6])),
          fan: num(parseFloat(parts[7])),
          memUtil: num(parseFloat(parts[8])),
          encUtil: num(parseFloat(parts[9])),
          decUtil: num(parseFloat(parts[10])),
          clockMax: num(parseFloat(parts[11])),
          powerLimit: num(parseFloat(parts[12])),
        };
        g.memPct = g.memTotal ? +((g.memUsed / g.memTotal) * 100).toFixed(1) : 0;
        this.gpu = g;
        resolve(true);
      });
    });
  }
  readProcs() {
    if (this.procBusy) return;
    if (Date.now() - (this.lastProcsAt || 0) < 5000) return;
    this.lastProcsAt = Date.now();
    this.procBusy = true;
    const ps = [
      '$OutputEncoding=[Console]::OutputEncoding=[Text.Encoding]::UTF8;',
      "$p=Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match '^(python|pythonw|node|pwsh|powershell)$' };",
      "$n=Get-NetAdapterStatistics -ErrorAction SilentlyContinue | Select-Object Name,ReceivedBytes,SentBytes;",
      `$wp=Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe' OR Name='node.exe' OR Name='pwsh.exe' OR Name='powershell.exe'" -ErrorAction SilentlyContinue | Select-Object ProcessId,CommandLine;`,
      "$c=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq '_Total' } | Select-Object PercentProcessorTime,PercentIdleTime,PercentUserTime,PercentPrivilegedTime;",
      '@{procs=@($p | Sort-Object CPU -Descending | Select-Object -First 14 Id,ProcessName,CPU,WorkingSet64,Path,StartTime);net=@($n);winproc=@($wp);cpu=@($c)} | ConvertTo-Json -Compress -Depth 4',
    ].join(' ');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { timeout: 12000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        this.procBusy = false;
        if (err || !stdout) return;
        let payload;
        try { payload = JSON.parse(stdout); } catch { return; }
        let arr = payload.procs || [];
        if (!Array.isArray(arr)) arr = [arr];
        const now = Date.now();
        // Windows' own CPU counter (matches Task Manager / perfmon better than os.cpus on some builds)
        const cpuArr = Array.isArray(payload.cpu) ? payload.cpu : (payload.cpu ? [payload.cpu] : []);
        const wc = cpuArr[0];
        if (wc && Number.isFinite(Number(wc.PercentProcessorTime))) {
          this.cpu.winPct = clamp(num(wc.PercentProcessorTime), 0, 100);
          this.cpu.winAt = now;
        }
        const cores = os.cpus().length || 1;
        const cmdMap = new Map();
        const winprocs = Array.isArray(payload.winproc) ? payload.winproc : (payload.winproc ? [payload.winproc] : []);
        for (const wp of winprocs) {
          if (wp && wp.ProcessId) cmdMap.set(Number(wp.ProcessId), wp.CommandLine || '');
        }
        const out = [];
        for (const p of arr) {
          if (!p || !p.Id) continue;
          const prev = this.prevProc.get(p.Id);
          const dt = prev ? (now - prev.at) / 1000 : 0;
          let pct = 0;
          if (prev && dt > 0) {
            const used = Math.max(0, num(p.CPU) - prev.cpu);
            pct = clamp((used / dt) * (100 / cores), 0, 100);
          }
          this.prevProc.set(p.Id, { cpu: num(p.CPU), at: now });
          const cmd = cmdMap.get(Number(p.Id)) || '';
          // Hide the dashboard's own short-lived telemetry probe shell.
          if (cmd.includes('Win32_PerfFormattedData_PerfOS_Processor')) continue;
          out.push({
            pid: p.Id,
            name: p.ProcessName,
            pct: +pct.toFixed(1),
            mem: num(p.WorkingSet64),
            exe: p.Path || '',
            cmd,
            started: p.StartTime ? Date.parse(p.StartTime) || 0 : 0,
            self: Number(p.Id) === process.pid,
            parent: Number(p.Id) === process.ppid,
          });
        }
        // drop stale
        for (const id of this.prevProc.keys()) if (now - this.prevProc.get(id).at > 60000) this.prevProc.delete(id);
        out.sort((a, b) => (b.pct - a.pct) || (b.mem - a.mem));
        this.procs = out.slice(0, 20);

        // network throughput from cumulative adapter counters
        const nets = Array.isArray(payload.net) ? payload.net : (payload.net ? [payload.net] : []);
        let best = null;
        for (const n of nets) {
          if (!n || !n.Name) continue;
          const prev = this.netPrev.get(n.Name);
          const dt = prev ? (now - prev.at) / 1000 : 0;
          if (prev && dt > 0) {
            const rx = Math.max(0, (num(n.ReceivedBytes) - prev.rx) / dt);
            const tx = Math.max(0, (num(n.SentBytes) - prev.tx) / dt);
            if (!best || rx + tx > best.rx + best.tx) best = { name: n.Name, rx, tx };
          }
          this.netPrev.set(n.Name, { rx: num(n.ReceivedBytes), tx: num(n.SentBytes), at: now });
        }
        if (best) {
          const peakMbps = (best.rx + best.tx) * 8 / 1e6;
          this.netPeakMbps = Math.max(this.netPeakMbps || 0, peakMbps);
          this.net = {
            name: best.name,
            rx: best.rx,
            tx: best.tx,
            peakMbps: +this.netPeakMbps.toFixed(1),
            linkMbps: this.netLinkMbps,
            linkLabel: this.netLinkLabel || null,
          };
        }
      });
  }
  displayCpu() {
    const fresh = this.cpu.winAt && Date.now() - this.cpu.winAt < 12000;
    if (fresh && Number.isFinite(this.cpu.winPct)) return +clamp(this.cpu.winPct, 0, 100).toFixed(1);
    return this.cpu.pct;
  }
  tick() {
    this.sampleCpu();
    this.readGpu();
    this.readProcs();
    this.readDiskIo();
    const g = this.gpu;
    pushSeries('cpu', this.displayCpu());
    pushSeries('mem', this.mem.pct);
    pushSeries('gpu', g ? g.util : 0);
    pushSeries('temp', g ? g.temp : 0);
    pushSeries('vram', g ? g.memPct : 0);
  }
  snapshot() {
    const g = this.gpu;
    const disksOut = {};
    for (const [drive, d] of Object.entries(this.disks || {})) {
      const io = this.diskIo?.[drive] || {};
      disksOut[drive] = {
        ...d,
        readBps: Math.max(0, num(io.readBps || 0)),
        writeBps: Math.max(0, num(io.writeBps || 0)),
        peakReadBps: Math.max(0, num(this.diskIoPeak?.[drive] || 0)),
        ioAt: io.at || null,
      };
    }
    const diskOut = disksOut['E:'] || this.disk;
    return {
      cpu: {
        pct: this.displayCpu(), nodePct: this.cpu.pct, winPct: this.cpu.winPct, winAt: this.cpu.winAt,
        model: this.cpu.model.replace(/\s+/g, ' '), cores: this.cpu.cores, speed: this.cpu.speed, perCore: this.cpu.perCore || [],
      },
      mem: { total: this.mem.total, used: this.mem.used, pct: this.mem.pct },
      gpu: g ? {
        name: g.name, util: g.util, memUsed: g.memUsed, memTotal: g.memTotal, memPct: g.memPct,
        temp: g.temp, power: g.power, clock: g.clock, fan: g.fan, memUtil: g.memUtil,
        encUtil: g.encUtil, decUtil: g.decUtil, clockMax: g.clockMax, powerLimit: g.powerLimit,
      } : null,
      procs: this.procs,
      disk: diskOut,
      disks: disksOut,
      diskBenchReadMBs: BENCH_RESULT?.diskReadMBs ?? null,
      net: this.net,
      uptime: os.uptime(),
    };
  }
}

const SERIES_MAX = 95;
const SAMPLE_MS = 2000;
const series = { cpu: [], mem: [], gpu: [], temp: [], vram: [] };
function pushSeries(k, v) {
  const a = series[k];
  a.push(Number.isFinite(v) ? +Number(v).toFixed(1) : 0);
  if (a.length > SERIES_MAX) a.shift();
}

/* ================================================================== */
/*  DSH SESSION                                                        */
/* ================================================================== */
const str = (s, n = 240) => {
  if (!s) return '';
  s = String(s).replace(/\r/g, '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const collapse = (s, n = 240) => str(s, n);

function extractText(parts) {
  if (!Array.isArray(parts)) return '';
  return parts.filter((p) => p && (p.type === 'text' || p.type === 'reasoning')).map((p) => p.text || '').join('\n');
}

function summarizeTool(name, argsRaw) {
  let a = {};
  try { a = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : (argsRaw || {}); } catch { /* keep raw */ }
  const base = (p) => (p ? String(p).replace(/\\/g, '/').split('/').pop() : '');
  switch (name) {
    case 'pwsh': return str(a.description || (a.command || '').split('\n')[0], 170);
    case 'read': return `${base(a.file_path) || a.file_path || ''}${a.offset ? ` @${a.offset}` : ''}`;
    case 'write': return base(a.file_path) || a.file_path || '';
    case 'edit': return `${base(a.file_path) || a.file_path || ''}${a.replace_all ? ' (all)' : ''}`;
    case 'glob': return `${a.pattern || ''}${a.path ? '  ' + a.path : ''}`;
    case 'grep': return `/${str(a.pattern, 60)}/${a.include ? '  ' + a.include : ''}`;
    case 'present': return (a.files || []).map((f) => base(f.path) || f.path).join(', ');
    case 'job_output': return `job ${a.job_id || ''}${a.wait ? ' (wait)' : ''}`;
    case 'job_kill': return `kill ${a.job_id || ''}`;
    case 'ask_user_question': return str((a.questions || [])[0]?.question || '', 120);
    case 'todo_write': return `${(a.todos || []).length} items`;
    case 'skill': return a.name || '';
    case 'web_search': return (a.queries || []).join(' | ');
    case 'web_fetch': return a.url || '';
    case 'subagent_fork': return str(a.description || a.prompt || '', 90);
    case 'send_message': return `→ ${a.agent_id || ''}`;
    case 'workflow': return str(a.meta?.name || '', 60);
    default: {
      const v = Object.values(a).find((x) => typeof x === 'string');
      return str(v || '', 150);
    }
  }
}

function previewResult(data) {
  const msg = data?.message || {};
  let text = '';
  if (Array.isArray(msg.content)) text = msg.content.map((c) => c?.text || '').join(' ');
  else if (typeof msg.content === 'string') text = msg.content;
  if (!text && typeof data?.output === 'string') text = data.output;
  return str(text, 200);
}

class SessionTracker {
  constructor() {
    this.id = null; this.title = ''; this.cwd = ''; this.file = null;
    this.offset = 0; this.partial = ''; this.events = [];
    this.entries = []; this.byCall = new Map();
    this.calls = 0; this.errors = 0; this.stuck = 0;
    this.meta = null; this.projMtime = 0; this.logMtime = 0;
    this.candidates = new Map();      // sessionId -> { id, projMtime, logMtime, title }
    this.listCache = null;
    this.listAt = 0;
    this.index = new Map();           // sessionId -> log path
    this.indexAt = 0;
    this.scanning = false; this.lastScan = 0;
    this.pinned = null;
    this.watch = null;
    this.jobs = new Map();
    this.timelineVersion = 0;
    this.watchProjDir();
    setTimeout(() => this.scan(true), 30);
    setTimeout(() => this.scanIndex(), 60);
  }

  watchProjDir() {
    try {
      this.watch = fs.watch(PROJ_DIR, (type, fn) => {
        if (!fn || !fn.endsWith('.json')) return;
        const id = fn.slice(0, -5);
        if (!id.startsWith('session-')) return;
        fs.stat(path.join(PROJ_DIR, fn), (err, st) => {
          if (!err && st) this.touchCandidate(id, st.mtimeMs);
        });
      });
    } catch (e) { log('[session] proj watch failed', e.message); }
  }

  touchCandidate(id, mtime) {
    const c = this.candidates.get(id) || { id };
    c.projMtime = Math.max(c.projMtime || 0, mtime || 0);
    this.candidates.set(id, c);
  }

  async scanIndex() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const wsDirs = await fsp.readdir(SESSIONS_DIR, { withFileTypes: true });
      const map = new Map();
      for (const w of wsDirs) {
        if (!w.isDirectory()) continue;
        let sub = [];
        try { sub = await fsp.readdir(path.join(SESSIONS_DIR, w.name), { withFileTypes: true }); } catch { continue; }
        for (const d of sub) {
          if (!d.isDirectory() || !d.name.startsWith('session-')) continue;
          map.set(d.name, path.join(SESSIONS_DIR, w.name, d.name, 'session.v4.jsonl.zstd'));
        }
      }
      this.index = map;
      this.indexAt = Date.now();
    } catch (e) { log('[session] index failed', e.message); }
    this.scanning = false;
  }

  async scan(force) {
    if (this.scanning || (!force && Date.now() - this.lastScan < 8000)) return;
    this.scanning = true; this.lastScan = Date.now();
    try {
      const files = await fsp.readdir(PROJ_DIR);
      let scanned = 0;
      for (const f of files) {
        if (!f.startsWith('session-') || !f.endsWith('.json')) continue;
        const id = f.slice(0, -5);
        try {
          const st = await fsp.stat(path.join(PROJ_DIR, f));
          const c = this.candidates.get(id) || { id };
          c.projMtime = st.mtimeMs;
          this.candidates.set(id, c);
          scanned++;
        } catch { /* race */ }
      }
      log('[session] scanned', scanned, 'session caches');
    } catch (e) { log('[session] scan failed', e.message); }
    this.scanning = false;
  }

  async pickActive() {
    if (this.pinned) return this.pinned;
    if (!this.candidates.size) await this.scan(true);
    let best = null;
    const cutoff = Date.now() - 6 * 3600e3;
    for (const c of this.candidates.values()) {
      if ((c.projMtime || 0) < cutoff) continue;
      if (!best || c.projMtime > best.projMtime) best = c;
    }
    if (!best) {
      // fall back to the newest candidate regardless of age
      for (const c of this.candidates.values()) if (!best || (c.projMtime || 0) > (best.projMtime || 0)) best = c;
    }
    return best ? best.id : null;
  }

  logPath(id) {
    return this.index.get(id) || null;
  }

  reset(id, file) {
    this.id = id; this.file = file;
    this.offset = 0; this.partial = ''; this.events = [];
    this.entries = []; this.byCall = new Map();
    this.calls = 0; this.errors = 0; this.stuck = 0; this.lastSeq = -1;
    log('[session] tracking', id);
  }

  readMeta() {
    try {
      const p = path.join(PROJ_DIR, this.id + '.json');
      const st = fs.statSync(p);
      const raw = fs.readFileSync(p, 'utf8');
      const j = JSON.parse(raw);
      this.meta = j?.record?.rows || null;
      this.projMtime = st.mtimeMs;
    } catch { /* mid-write */ }
  }

  ensureIndex(id) {
    if (this.index.has(id)) return;
    if (Date.now() - this.indexAt < 15000) return;
    this.scanIndex();
  }

  async poll() {
    const active = await this.pickActive();
    if (!active) return;
    if (active !== this.id) {
      this.ensureIndex(active);
      let file = this.logPath(active);
      if (!file) {
        await this.scanIndex();
        file = this.logPath(active);
      }
      if (file && fs.existsSync(file)) this.reset(active, file);
      else if (!this.file) {
        // metadata-only session (no log yet)
        this.id = active; this.meta = null;
      }
    }
    if (!this.id) return;
    this.readMeta();
    if (this.file) this.readNew();
    if (Date.now() - (this.lastScan || 0) > 120000) this.scan(false);
  }

  readNew() {
    let st;
    try { st = fs.statSync(this.file); } catch { return; }
    this.logMtime = st.mtimeMs;
    if (st.size < this.offset) { this.reset(this.id, this.file); return; }
    if (st.size === this.offset) return;
    const len = st.size - this.offset;
    let chunk;
    try {
      const fd = fs.openSync(this.file, 'r');
      chunk = Buffer.allocUnsafe(len);
      const read = fs.readSync(fd, chunk, 0, len, this.offset);
      fs.closeSync(fd);
      if (read < len) chunk = chunk.subarray(0, read);
    } catch { return; }
    let off = 0, text = '';
    while (off < chunk.length) {
      const e = frameEnd(chunk, off);
      if (e <= off || e > chunk.length) break;
      try { text += zlib.zstdDecompressSync(chunk.subarray(off, e)).toString('utf8'); } catch { break; }
      off = e;
    }
    if (off === 0) {
      if (++this.stuck > 8) { this.offset = st.size; this.stuck = 0; log('[session] skipping unreadable frames'); }
      return;
    }
    this.stuck = 0;
    this.offset += off;
    this.partial += text;
    const lines = this.partial.split('\n');
    this.partial = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      this.onEvent(ev);
    }
  }

  onEvent(ev) {
    if (!ev || typeof ev.type !== 'string') return;
    const t = ev.time || Date.now();
    if (typeof ev.seq === 'number') {
      if (this.lastSeq >= 0 && ev.seq < this.lastSeq) { /* rewrite */ }
      this.lastSeq = ev.seq;
    }
    const d = ev.data || {};
    switch (ev.type) {
      case 'user/message': {
        const text = extractText(d.content);
        const approval = d.source && d.source.kind === 'user-approval';
        // Skip harness-injected context (runtime snapshot, skill catalog, time sample).
        if (!approval && /^(<system-reminder>|Current runtime context|Time sampled while preparing|The approval policy changed)/.test(text.trim())) break;
        this.push({
          id: 'u' + ev.seq, kind: approval ? 'system' : 'user', tag: approval ? '系统' : '用户',
          text: collapse(text, 260), t, turn: d.turn, step: d.step,
        });
        break;
      }
      case 'assistant/message': {
        const content = d.message?.content || [];
        const text = extractText(content.filter((c) => c.type === 'text'));
        const reasoning = extractText(content.filter((c) => c.type === 'reasoning'));
        if (!text && !reasoning) break;
        this.push({
          id: 'a' + ev.seq, kind: 'assistant', tag: '助手',
          text: collapse(text || reasoning, 300), t, turn: d.turn, step: d.step,
          reason: !text,
        });
        break;
      }
      case 'tool/call': {
        const entry = {
          id: 'c' + ev.seq, kind: 'tool', tag: '工具', tool: d.name,
          text: summarizeTool(d.name, d.arguments), t, turn: d.turn, step: d.step,
          status: 'running', callId: d.callId,
        };
        this.calls++;
        this.byCall.set(d.callId, entry);
        this.push(entry);
        break;
      }
      case 'tool/result': {
        const callId = d.toolCallId || d.message?.toolCallId || d.callId;
        const e = this.byCall.get(callId);
        if (e) {
          const ended = t;
          e.ms = Math.max(0, ended - e.t);
          e.status = d.message?.isError ? 'error' : 'ok';
          e.result = previewResult(d);
          if (e.status === 'error') this.errors++;
          e.t2 = ended;
        }
        break;
      }
      case 'job/registered': {
        this.jobs.set(d.jobId, { id: d.jobId, kind: d.kind, label: str(d.label, 160), t });
        break;
      }
      case 'job/settled': {
        const j = this.jobs.get(d.jobId);
        if (j) { j.settled = t; }
        break;
      }
      case 'goal/change': {
        const g = d.goal || {};
        this.push({
          id: 'g' + ev.seq, kind: 'goal', tag: '目标',
          text: collapse(d.operation === 'create' ? `新目标 · ${g.objective}` : `${d.operation} · ${g.objective}`, 220), t,
        });
        break;
      }
      case 'step/start': {
        this.openStep = { turn: d.turn, step: d.step, t };
        break;
      }
      case 'step/end': {
        if (this.openStep && this.openStep.step === d.step) {
          this.openStep = null;
        }
        break;
      }
      case 'error': {
        this.errors++;
        this.push({ id: 'e' + ev.seq, kind: 'error', tag: '异常', text: collapse(d.message || d.error || JSON.stringify(d), 240), t });
        break;
      }
      case 'session/title': {
        if (d.title) this.title = d.title;
        break;
      }
      default: break;
    }
  }

  push(entry) {
    this.entries.push(entry);
    if (this.entries.length > 320) this.entries.splice(0, this.entries.length - 320);
    this.timelineVersion++;
  }

  summary() {
    const m = this.meta || {};
    const val = (k) => m[k]?.val;
    const tok = val('tokenUsage') || {};
    const totals = tok.totals || {};
    const last = tok.last?.buckets || {};
    const ctx = val('contextPressure') || {};
    const breakdown = val('contextBreakdown')?.breakdown || {};
    const stats = val('sessionStats') || {};
    const goalWrap = val('goal')?.current || {};
    const goal = goalWrap.goal || {};
    const model = val('modelSelection')?.lastUsed || {};
    const title = val('title') || this.title || '';
    const cwd = val('workingDirectory') || '';
    const decodeTps = stats.decodeMs > 0 ? (stats.decodeTokens / (stats.decodeMs / 1000)) : 0;
    const running = this.entries.filter((e) => e.status === 'running' && Date.now() - e.t < 15 * 60e3);
    const openStep = stats.openStep || this.openStep || null;
    return {
      id: this.id,
      title: collapse(title, 90),
      cwd: cwd ? path.basename(path.resolve(cwd)) : '',
      model: { provider: model.provider || '', model: model.model || '', effort: model.reasoningEffort || '' },
      goal: {
        objective: collapse(goal.objective || '', 260),
        phase: goal.phase || '',
        rounds: goalWrap.roundsStarted || 0,
        maxRounds: goal.maxGoalRounds || 0,
      },
      tokens: {
        input: num(totals.uncachedInputTokens), output: num(totals.outputTokens),
        cacheRead: num(totals.cacheReadTokens), cacheWrite: num(totals.cacheWriteTokens),
        lastInput: num(last.uncachedInputTokens), lastOutput: num(last.outputTokens),
        lastCache: num(last.cacheReadTokens),
      },
      context: {
        surface: num(ctx.surfaceTokens), window: num(ctx.contextWindow),
        pressure: num(ctx.pressureTokens),
        pct: ctx.contextWindow ? +((num(ctx.pressureTokens) / ctx.contextWindow) * 100).toFixed(2) : 0,
        system: num(breakdown.systemTokens), tools: num(breakdown.toolsTokens), messages: num(breakdown.messageTokens),
      },
      stats: {
        turns: num(stats.turns), steps: num(stats.steps),
        llmMs: num(stats.llmMs), toolMs: num(stats.toolMs),
        ttftMs: num(stats.ttftMs),
        ttftAvg: stats.ttftSteps ? Math.round(num(stats.ttftMs) / num(stats.ttftSteps)) : num(stats.ttftMs),
        decodeTps: +decodeTps.toFixed(1),
        calls: this.calls, errors: this.errors,
        openStep: openStep ? { turn: num(openStep.turn), step: num(openStep.step), elapsed: Math.max(0, Date.now() - num(openStep.startTime || openStep.t || Date.now())) } : null,
      },
      running: running.map((e) => ({ id: e.id, tool: e.tool, text: e.text, t: e.t, turn: e.turn, step: e.step })),
      jobs: [...this.jobs.values()].filter((j) => !j.settled).slice(-5).map((j) => ({ id: j.id, kind: j.kind, label: j.label, t: j.t })),
      timeline: this.entries.slice(-90).map(({ callId, ...rest }) => rest),
      permissions: {
        sandbox: val('permissions')?.sandbox || '',
        approval: val('permissions')?.approval || '',
      },
      live: Math.max(this.logMtime || 0, this.projMtime || 0) > Date.now() - 25000,
      logMtime: this.logMtime,
    };
  }

  list() {
    if (this.listCache && Date.now() - this.listAt < 10000) {
      return this.listCache.map((x) => ({ ...x, active: x.id === this.id }));
    }
    const arr = [...this.candidates.values()].filter((c) => c.projMtime).sort((a, b) => b.projMtime - a.projMtime).slice(0, 10);
    const out = [];
    for (const c of arr) {
      let title = '';
      try {
        const j = JSON.parse(fs.readFileSync(path.join(PROJ_DIR, c.id + '.json'), 'utf8'));
        title = j?.record?.rows?.title?.val || '';
      } catch { /* ignore */ }
      out.push({ id: c.id, title: collapse(title, 60), mtime: c.projMtime, active: c.id === this.id });
    }
    this.listCache = out;
    this.listAt = Date.now();
    return out;
  }

  setPinned(id) {
    this.pinned = id || null;
    if (id && id !== this.id) {
      const file = this.logPath(id);
      if (file && fs.existsSync(file)) this.reset(id, file);
    }
  }
}

function frameEnd(b, off) {
  if (b.length - off < 8) return -1;
  const magic = b.readUInt32LE(off);
  if (magic !== 0xFD2FB528) {
    if ((magic & 0xFFFFFFF0) === 0x184D2A50) {
      if (b.length - off < 8) return -1;
      const size = b.readUInt32LE(off + 4);
      const end = off + 8 + size;
      return end <= b.length ? end : -1;
    }
    return -2;
  }
  let p = off + 4;
  if (p >= b.length) return -1;
  const fhd = b[p++];
  const fcsFlag = fhd >> 6, single = (fhd >> 5) & 1, reserved = (fhd >> 3) & 1, checksum = (fhd >> 2) & 1, dictFlag = fhd & 3;
  if (reserved) return -2;
  if (!single) {
    if (p >= b.length) return -1;
    p++;
  }
  const dictSize = [0, 1, 2, 4][dictFlag];
  if (b.length < p + dictSize) return -1;
  p += dictSize;
  const fcsSize = single ? 1 : [0, 2, 4, 8][fcsFlag];
  if (b.length < p + fcsSize) return -1;
  p += fcsSize;
  for (;;) {
    if (b.length < p + 3) return -1;
    const h = b[p] | (b[p + 1] << 8) | (b[p + 2] << 16);
    p += 3;
    const last = h & 1, type = (h >> 1) & 3, size = h >> 3;
    if (type === 3) return -2;
    const adv = type === 1 ? 1 : size;
    if (b.length < p + adv) return -1;
    p += adv;
    if (last) break;
  }
  if (checksum) {
    if (b.length < p + 4) return -1;
    p += 4;
  }
  return p;
}

/* ================================================================== */
/*  FILESYSTEM RADAR                                                   */
/* ================================================================== */
const IGNORE_RE = /(^|\\)(\.git|\.venv|\.venv_cu128|__pycache__|node_modules|\.cache|_env|\.dsh-office[^\\]*)(\\|$)/i;
const SELF_IGNORE_RE = /(^|\\)dashboard\\(activity\.jsonl|server\.log|server\.err\.log|server\.pid)(\\|$)/i;
const IGNORE_EXT_RE = /\.(pyc|pyo|tmp|temp|tmpdir|swp|swx|lock|part|crdownload|log\.\d+)$/i;
const AREA_COLORS = ['#B43A2B', '#A06A42', '#2E4C66', '#C39367', '#5A7A93', '#D0604A', '#3D4E5C', '#8E2A1F', '#6E6455', '#9A8E7C'];
function areaColor(a) {
  let h = 0;
  for (let i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
  return AREA_COLORS[h % AREA_COLORS.length];
}
function areaOf(rel) {
  const parts = rel.split('\\');
  if (parts.length === 1) return 'ROOT';
  const top = parts[0];
  if (top === 'runs' && parts.length >= 4) return parts.slice(0, 3).join('/');
  if (top === 'assets' && parts.length >= 3) return 'assets/' + parts[1];
  if (top === 'data' && parts.length >= 3) return 'data/' + parts[1];
  if (top === '10_论文' && parts.length >= 3) return '10_论文/' + parts[1];
  if (top === '50_双地标参数化') return top;
  return top;
}

class FsRadar {
  constructor() {
    this.feed = [];
    this.pending = new Map();
    this.areas = new Map();
    this.buckets = new Array(60).fill(0);   // 5s buckets, 5 minutes
    this.bucketAt = Math.floor(Date.now() / 5000) - (this.buckets.length - 1);
    this.total = 0;
    this.startedAt = Date.now();
    this.git = null;
    this.watching = false;
    this.lastFlush = 0;
    this.recentPaths = new Map();
    this.journalPath = path.join(STATE_DIR, 'activity.jsonl');
    this.journalAt = Date.now();
    this.loadJournal();
    this.start();
    setInterval(() => this.flush(), 400);
    setInterval(() => this.rollBuckets(), 5000);
    this.readGit();
    setInterval(() => this.readGit(), 30000);
  }

  applyHistorical(e) {
    const area = e.area || areaOf(e.rel);
    const color = areaColor(area);
    this.feed.push({
      rel: e.rel, area, color, kind: e.kind || 'modify', size: e.size || 0,
      count: e.count || 1, t: e.t,
    });
    const a = this.areas.get(area) || { name: area, color, count: 0, bytes: 0, last: 0, times: [] };
    a.count += e.count || 1;
    a.bytes += e.size || 0;
    a.last = Math.max(a.last, e.t);
    a.times.push(e.t);
    this.areas.set(area, a);
    const bi = Math.floor(e.t / 5000) - this.bucketAt;
    if (bi >= 0 && bi < this.buckets.length) this.buckets[bi] += e.count || 1;
    this.total += e.count || 1;
  }

  loadJournal() {
    try {
      if (!fs.existsSync(this.journalPath)) return;
      const raw = fs.readFileSync(this.journalPath, 'utf8');
      const cutoff = Date.now() - 20 * 60e3;
      const kept = [];
      for (const line of raw.split('\n')) {
        if (!line) continue;
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        if (!e.t || e.t < cutoff) continue;
        kept.push(e);
        this.applyHistorical(e);
      }
      const byRel = new Map();
      for (const f of this.feed) {
        const cur = byRel.get(f.rel);
        if (!cur || f.t >= cur.t) byRel.set(f.rel, f);
      }
      this.feed = [...byRel.values()].sort((a, b) => b.t - a.t).slice(0, 300);
      fs.writeFileSync(this.journalPath, kept.slice(-4000).map((x) => JSON.stringify(x)).join('\n') + (kept.length ? '\n' : ''));
      if (kept.length) log('[fs] journal restored', kept.length, 'events');
    } catch (e) { log('[fs] journal load failed:', e.message); }
  }

  trimJournal() {
    try {
      const st = fs.statSync(this.journalPath);
      if (st.size < 1.2e6) return;
      const cutoff = Date.now() - 20 * 60e3;
      const raw = fs.readFileSync(this.journalPath, 'utf8');
      const kept = raw.split('\n').filter(Boolean).filter((l) => {
        try { return JSON.parse(l).t >= cutoff; } catch { return false; }
      }).slice(-4000);
      fs.writeFileSync(this.journalPath, kept.join('\n') + (kept.length ? '\n' : ''));
    } catch { /* ignore */ }
  }

  start() {
    try {
      this.watcher = fs.watch(ROOT, { recursive: true }, (type, fn) => this.ingest(type, fn));
      this.watching = true;
      log('[fs] watching', ROOT);
    } catch (e) {
      log('[fs] watch failed:', e.message);
      this.watching = false;
    }
  }

  setRoot(newRoot) {
    const target = path.resolve(newRoot);
    if (this.watcher) {
      try { this.watcher.close(); } catch { /* ignore */ }
      this.watcher = null;
    }
    this.watching = false;
    ROOT = target;
    this.feed = [];
    this.pending.clear();
    this.areas.clear();
    this.buckets = new Array(60).fill(0);
    this.bucketAt = Math.floor(Date.now() / 5000) - (this.buckets.length - 1);
    this.total = 0;
    this.startedAt = Date.now();
    this.recentPaths.clear();
    this.git = null;
    try { fs.writeFileSync(this.journalPath, ''); } catch { /* ignore */ }
    this.start();
    this.readGit();
    log('[fs] root changed', ROOT, 'watching=', this.watching);
  }

  ingest(type, fn) {
    if (!fn) return;
    const rel = String(fn).replace(/\//g, '\\');
    if (IGNORE_RE.test('\\' + rel + '\\')) return;
    if (SELF_IGNORE_RE.test('\\' + rel)) return;
    if (IGNORE_EXT_RE.test(rel)) return;
    if (/(^|\\)(thumbs\.db|desktop\.ini|~\$[^\\]*)$/i.test(rel)) return;
    let rec = this.pending.get(rel);
    if (!rec) {
      rec = { rel, kind: type, count: 0, first: Date.now(), last: Date.now() };
      this.pending.set(rel, rec);
    }
    if (type === 'change') rec.kind = 'change';
    rec.count++;
    rec.last = Date.now();
  }

  flush() {
    if (!this.pending.size) return;
    const batch = [...this.pending.values()];
    this.pending.clear();
    const now = Date.now();
    this.lastFlush = now;
    const bi = Math.floor(now / 5000) - this.bucketAt;
    const journal = [];
    let accepted = 0;
    for (const rec of batch) {
      const abs = path.join(ROOT, rec.rel);
      let st = null;
      try { st = fs.statSync(abs); } catch { /* gone */ }
      if (st && st.isDirectory()) continue;   // directory events are noise
      const exists = !!st;
      const size = st ? st.size : 0;
      const kind = rec.kind === 'change' ? 'modify' : (exists ? 'add' : 'del');
      const area = areaOf(rec.rel);
      const item = {
        rel: rec.rel, area, color: areaColor(area), kind, size,
        count: rec.count, t: rec.last,
      };
      accepted += rec.count;
      if (bi >= 0 && bi < this.buckets.length) this.buckets[bi] += rec.count;
      journal.push(JSON.stringify({ rel: item.rel, area, kind, size, count: item.count, t: item.t }));
      const prevIdx = this.feed.findIndex((x) => x.rel === rec.rel);
      if (prevIdx >= 0) this.feed.splice(prevIdx, 1);
      this.feed.unshift(item);
      const a = this.areas.get(area) || { name: area, color: item.color, count: 0, bytes: 0, last: 0, times: [] };
      a.count += rec.count; a.bytes += size; a.last = rec.last;
      a.times.push(rec.last);
      if (a.times.length > 4000) a.times.splice(0, a.times.length - 4000);
      this.areas.set(area, a);
      this.recentPaths.set(rec.rel, rec.last);
    }
    if (this.feed.length > 300) this.feed.length = 300;
    this.total += accepted;
    if (journal.length) {
      fs.appendFile(this.journalPath, journal.join('\n') + '\n', () => { /* best effort */ });
    }
    if (now - this.journalAt > 5 * 60e3) {
      this.journalAt = now;
      this.trimJournal();
    }
  }

  rollBuckets() {
    const nowIdx = Math.floor(Date.now() / 5000);
    const lastIdx = this.bucketAt + this.buckets.length - 1;
    const shift = nowIdx - lastIdx;
    if (shift <= 0) return;
    if (shift >= this.buckets.length) this.buckets = new Array(this.buckets.length).fill(0);
    else {
      for (let i = 0; i < shift; i++) { this.buckets.shift(); this.buckets.push(0); }
    }
    this.bucketAt = nowIdx - (this.buckets.length - 1);
  }

  readGit() {
    execFile('git', ['-C', ROOT, 'status', '--porcelain=v1', '-z'], { timeout: 30000, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) { this.git = { ...(this.git || {}), error: true }; return; }
      const parts = stdout.split('\0').filter(Boolean);
      let modified = 0, added = 0, deleted = 0, untracked = 0, renamed = 0;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p || p.length < 3) continue;
        const x = p[0], y = p[1];
        if (x === '?' || y === '?') { untracked++; continue; }
        if (x === 'R' || y === 'R') { renamed++; i++; continue; }
        if (x === 'A' || y === 'A') added++;
        else if (x === 'D' || y === 'D') deleted++;
        else modified++;
      }
      this.git = {
        branch: this.git?.branch || '', modified, added, deleted, untracked, renamed,
        dirty: modified + added + deleted + renamed + untracked, at: Date.now(),
      };
      execFile('git', ['-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 8000, windowsHide: true }, (e2, out2) => {
        if (!e2 && this.git) this.git.branch = out2.trim();
      });
      execFile('git', ['-C', ROOT, 'log', '-1', '--format=%h%x1f%s%x1f%ct'], { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 }, (e3, out3) => {
        if (!e3 && this.git) {
          const [hash, subject, ct] = out3.trim().split('\x1f');
          this.git.head = { hash, subject, t: Number(ct) * 1000 };
        }
      });
    });
  }

  recentCount(area, windowMs = 5 * 60e3) {
    const cutoff = Date.now() - windowMs;
    const a = this.areas.get(area);
    if (!a) return 0;
    let n = 0;
    for (let i = a.times.length - 1; i >= 0 && a.times[i] >= cutoff; i--) n++;
    return n;
  }

  snapshot() {
    const areas = [...this.areas.values()]
      .map((a) => ({
        name: a.name, color: a.color,
        count: this.recentCount(a.name, 5 * 60e3),
        total: a.count, last: a.last,
      }))
      .filter((a) => a.count > 0 || a.total > 0)
      .sort((a, b) => b.count - a.count || b.total - a.total)
      .slice(0, 8);
    const perMin = this.buckets.slice(-12).reduce((s, v) => s + v, 0);
    const hot = areas[0] ? { name: areas[0].name, count: areas[0].count, color: areas[0].color } : null;
    return {
      feed: this.feed.slice(0, 40),
      areas,
      rate: this.buckets.slice(),
      perMin,
      total: this.total,
      since: this.startedAt,
      git: this.git,
      hot,
      watching: this.watching,
    };
  }
}

/* ================================================================== */
/*  HTTP + SSE                                                         */
/* ================================================================== */
const sys = new SystemTelemetry();
const session = new SessionTracker();
const radar = new FsRadar();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8',
};

function buildState() {
  return {
    type: 'state',
    now: Date.now(),
    boot: T0,
    root: ROOT,
    port: PORT,
    system: sys.snapshot(),
    series,
    sampleMs: SAMPLE_MS,
    session: session.summary(),
    sessions: session.list(),
    pinned: session.pinned || null,
    readonly: READONLY,
    workspace: radar.snapshot(),
  };
}

let stateJson = '{}';
function refreshState() {
  try { stateJson = JSON.stringify(buildState()); } catch (e) { log('[state]', e.message); }
}

const clients = new Set();

async function balanceSnapshot() {
  const url = String(process.env.MC_BALANCE_URL || '').trim();
  const key = process.env.MC_BALANCE_KEY
    || (process.env.MC_BALANCE_USE_DSH_KEY === '1' ? process.env.DEEPSEEK_API_KEY : '');
  if (!url) {
    return {
      ok: false,
      code: 'not_configured',
      message: '余额接口未配置：显式设置 MC_BALANCE_URL / MC_BALANCE_KEY 才会出站',
    };
  }
  if (!/^https:\/\//i.test(url) && process.env.MC_ALLOW_INSECURE_BALANCE !== '1') {
    return {
      ok: false,
      code: 'insecure_url',
      message: '余额接口必须是 https；本地测试需显式 MC_ALLOW_INSECURE_BALANCE=1',
    };
  }
  try {
    const headers = { Accept: 'application/json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, code: `http_${response.status}`, message: '余额服务返回错误', provider: 'deepseek' };
    }
    const infos = Array.isArray(body.balance_infos) ? body.balance_infos : [];
    const items = infos.map((item) => ({
      currency: item.currency || '',
      total_balance: item.total_balance ?? item.balance ?? null,
      granted_balance: item.granted_balance ?? null,
      topped_up_balance: item.topped_up_balance ?? null,
    }));
    if (items.length) {
      return {
        ok: true,
        provider: 'deepseek',
        available: body.is_available !== false,
        items,
        balance: items[0].total_balance,
      };
    }
    const balance = body.balance ?? body.data?.balance ?? body.data?.total_balance ?? null;
    if (balance != null) {
      return { ok: true, provider: 'custom', available: true, balance, items: [] };
    }
    return { ok: false, code: 'empty', message: '余额服务未返回可识别的字段' };
  } catch (error) {
    return {
      ok: false,
      code: error?.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      message: '余额查询失败',
    };
  }
}

function moduleStatus() {
  return {
    schema: 'dsh.mission_control.module_status/v1',
    generated_at: new Date().toISOString(),
    source: 'dashboard/server.mjs',
    crs: 'local',
    status: 'provisional',
    data: {
      version: DASH_VERSION,
      listen: `http://${HOST}:${PORT}`,
      root: ROOT,
      uptime_s: Math.round((Date.now() - T0) / 1000),
      sample_ms: SAMPLE_MS,
      file_batch_ms: 400,
      sse_clients: clients.size,
      settings_file: 'dashboard/settings.json',
      theme_palettes: 21,
      full_window: true,
      inputs: [
        '~/.dsh/storages/session_projcache/sessions/*.json',
        '~/.dsh/sessions/**/session.v4.jsonl.zstd',
        'configured workspace filesystem events + git status',
        'nvidia-smi + Windows performance counters + Get-Process',
      ],
      outputs: [
        'GET / full-window HUD',
        'GET /api/state',
        'GET /api/stream (SSE)',
        'GET /api/module/status',
        'POST /api/settings (root switch)',
        'activity.jsonl',
        'trace export (client-side download)',
        '21 client-side palettes (7 groups × 3)',
      ],
      control: {
        endpoint: '/api/proc/kill',
        enabled: !READONLY,
        readonly: READONLY,
        allowlist: [...ALLOWED_PROCS],
        boundary: 'opt-in host operator action; no source/artifact writes',
      },
      cross_module: {
        connected: false,
        expected: '',
        schema: '',
        state: 'not configured in the open-source full-window port',
        modules: [],
      },
    },
    evidence: [
      'dashboard/server.mjs',
      'dashboard/public/index.html',
      'dashboard/public/app.js',
      'README.md',
      'docs/VERIFICATION.md',
    ],
    not_claimed: [
      'not a source of truth for other modules',
      'cross-module metrics/status are not ingested',
      'process termination is disabled unless MC_ALLOW_PROC=1',
      'UI palette uses the paper/ink reference values; no external canonical claim',
    ],
  };
}

function broadcast() {
  if (!clients.size) return;
  refreshState();
  const frame = `data: ${stateJson}\n\n`;
  for (const res of clients) {
    try { res.write(frame); } catch { clients.delete(res); }
  }
}

setInterval(() => sys.tick(), SAMPLE_MS);
setInterval(() => session.poll().catch((e) => log('[session] poll', e.message)), SAMPLE_MS);
setInterval(broadcast, 1000);

setTimeout(() => { sys.tick(); }, 1200);
setInterval(() => sys.readDisk(), 60000);

/* ---------------- process control (localhost + token) ---------------- */
function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function hudAuthed(req) {
  return safeEqualString(cookieValue(req, 'mc_hud'), HUD_TOKEN);
}

function requireHudRead(req, res) {
  if (hudAuthed(req)) return true;
  sendJson(res, 401, { ok: false, error: 'hud authentication required' });
  return false;
}

function requireHudMutation(req, res) {
  if (!hudAuthed(req)) {
    sendJson(res, 401, { ok: false, error: 'hud authentication required' });
    return false;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'POST only' });
    return false;
  }
  if (!mutationOriginAllowed(req, HUD_ORIGINS)) {
    sendJson(res, 403, { ok: false, error: 'same-origin required' });
    return false;
  }
  return true;
}

function folderTarget(rel) {
  const safeRel = String(rel || '').replace(/^[/\\]+/, '');
  const target = path.resolve(ROOT, safeRel);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
  return target;
}

async function listProjectFolders(rel) {
  const target = folderTarget(rel);
  if (!target) return { ok: false, code: 'outside_root', error: 'path outside workspace' };
  try {
    const entries = await fsp.readdir(target, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => a.localeCompare(b));
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      let size = null;
      let mtime = null;
      try {
        const st = await fsp.stat(path.join(target, entry.name));
        size = st.size;
        mtime = st.mtimeMs;
      } catch { /* metadata unavailable */ }
      files.push({ name: entry.name, size, mtime });
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    return {
      ok: true,
      root: ROOT,
      path: target,
      rel: path.relative(ROOT, target).replace(/\\/g, '/'),
      dirs,
      files,
    };
  } catch (error) {
    return { ok: false, code: 'read_failed', error: String(error?.message || error) };
  }
}

function openProjectFolder(target) {
  execFile('explorer.exe', [target], { windowsHide: false }, () => {});
}

function openProjectFile(target) {
  // ShellExecute-equivalent: let Windows pick the default app and bring it up.
  // The path is passed through an environment variable, never interpolated into
  // the PowerShell command, so spaces/unicode/shell metacharacters are safe.
  const child = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    'Start-Process -FilePath $env:MC_OPEN_FILE',
  ], {
    env: { ...process.env, MC_OPEN_FILE: target },
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function revealProjectFile(target) {
  execFile('explorer.exe', [`/select,${target}`], { windowsHide: false }, () => {});
}

function readBody(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
function execP(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) { err.stdout = stdout; err.stderr = stderr; reject(err); } else resolve(stdout);
    });
  });
}
const killTimes = [];
async function handleProcKill(req, res) {
  if (READONLY) return sendJson(res, 403, { ok: false, error: 'dashboard is read-only (MC_READONLY=1)' });
  let body;
  try { body = await readBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'invalid body' }); }

  const pid = Number(body.pid);
  if (!Number.isInteger(pid) || pid < 8) return sendJson(res, 400, { ok: false, error: 'invalid pid' });
  if (pid === process.pid || pid === process.ppid) return sendJson(res, 400, { ok: false, error: 'protected process' });

  const now = Date.now();
  while (killTimes.length && now - killTimes[0] > 10000) killTimes.shift();
  if (killTimes.length >= 8) return sendJson(res, 429, { ok: false, error: 'rate limited' });

  const target = sys.procs.find((x) => x.pid === pid);
  if (!target) return sendJson(res, 404, { ok: false, error: 'process not found' });
  if (target.self || target.parent) return sendJson(res, 400, { ok: false, error: 'protected process' });
  if (!ALLOWED_PROCS.has(String(target.name).toLowerCase())) {
    return sendJson(res, 400, { ok: false, error: `process ${target.name} is not in the allow list` });
  }

  // Re-check the live PID/name to avoid killing a recycled PID.
  let actual = '';
  try {
    const out = await execP('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { timeout: 5000, windowsHide: true });
    const first = String(out).trim().split(/\r?\n/)[0] || '';
    const m = first.match(/^"([^"]+)"/);
    if (m) actual = m[1].replace(/\.exe$/i, '').toLowerCase();
  } catch { /* not running */ }
  if (!actual) return sendJson(res, 404, { ok: false, error: 'process already exited' });
  if (actual !== String(target.name).toLowerCase()) {
    return sendJson(res, 409, { ok: false, error: `pid name mismatch (${actual})` });
  }

  try {
    await execP('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: 10000, windowsHide: true });
    killTimes.push(Date.now());
    sys.procs = sys.procs.filter((x) => x.pid !== pid);
    log('[control] terminated', target.name, '#' + pid);
    return sendJson(res, 200, { ok: true, pid, name: target.name });
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || 'taskkill failed').toString().trim().slice(0, 300);
    log('[control] kill failed', target.name, pid, msg);
    return sendJson(res, 500, { ok: false, error: msg });
  }
}

async function handleSettings(req, res) {
  let body;
  try { body = await readBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'invalid body' }); }

  const requested = String(body.root || '').trim();
  if (!requested || requested.length > 500) return sendJson(res, 400, { ok: false, error: 'invalid root' });
  const target = path.resolve(requested);
  let st;
  try { st = fs.statSync(target); } catch { return sendJson(res, 404, { ok: false, error: 'directory not found' }); }
  if (!st.isDirectory()) return sendJson(res, 400, { ok: false, error: 'not a directory' });
  if (target === ROOT) return sendJson(res, 200, { ok: true, root: ROOT, watching: radar.watching });

  try {
    radar.setRoot(target);
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ root: target }, null, 2) + '\n');
    refreshState();
    log('[settings] root =', target);
    return sendJson(res, 200, { ok: true, root: ROOT, watching: radar.watching });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: e.message });
  }
}


const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);
  if (!isLoopbackHost(req.headers.host, PORT)) {
    return sendJson(res, 403, { ok: false, error: 'host not allowed' });
  }
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  const p = url.pathname;

  if (p === '/api/proc/kill') {
    if (!requireHudMutation(req, res)) return;
    return handleProcKill(req, res);
  }
  if (p === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'dsh-mission-control-full',
      version: DASH_VERSION,
      readonly: READONLY,
      root: ROOT,
      uptime_s: Math.round((Date.now() - T0) / 1000),
    });
  }
  if (p.startsWith('/api/') && !requireHudRead(req, res)) return;
  if (p === '/api/balance') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' });
    const data = await balanceSnapshot();
    return sendJson(res, data.ok ? 200 : 200, data);
  }
  if (p === '/api/benchmark') {
    try {
      const data = await benchmarkSnapshot();
      return sendJson(res, 200, { ok: true, ...data });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: String(error?.message || error).slice(0, 300) });
    }
  }
  if (p === '/api/folders') {
    const rel = url.searchParams.get('path') || '';
    return sendJson(res, 200, await listProjectFolders(rel));
  }
  if (p === '/api/open-folder') {
    if (!requireHudMutation(req, res)) return;
    let body;
    try { body = await readBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'invalid body' }); }
    const target = folderTarget(body.path || '');
    if (!target) return sendJson(res, 403, { ok: false, error: 'path outside workspace' });
    try { openProjectFolder(target); return sendJson(res, 200, { ok: true, path: target }); }
    catch (error) { return sendJson(res, 500, { ok: false, error: String(error?.message || error) }); }
  }
  if (p === '/api/open-file') {
    if (!requireHudMutation(req, res)) return;
    let body;
    try { body = await readBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'invalid body' }); }
    const target = folderTarget(body.path || '');
    if (!target) return sendJson(res, 403, { ok: false, error: 'path outside workspace' });
    try {
      const st = fs.statSync(target);
      if (!st.isFile()) return sendJson(res, 400, { ok: false, error: 'not a file' });
      if (body.mode === 'reveal') {
        revealProjectFile(target);
        return sendJson(res, 200, { ok: true, path: target, mode: 'reveal' });
      }
      openProjectFile(target);
      return sendJson(res, 200, { ok: true, path: target, mode: 'open' });
    } catch (error) {
      return sendJson(res, 500, { ok: false, error: String(error?.message || error) });
    }
  }
  if (p === '/api/settings') {
    if (!requireHudMutation(req, res)) return;
    return handleSettings(req, res);
  }
  if (p === '/api/module/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(moduleStatus(), null, 2));
  }
  if (p === '/api/state') {
    refreshState();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(stateJson);
  }
  if (p === '/api/select') {
    if (!requireHudMutation(req, res)) return;
    let body;
    try { body = await readBody(req); } catch { return sendJson(res, 400, { ok: false, error: 'invalid body' }); }
    const id = String(body.id || '').trim();
    session.setPinned(!id || id === 'auto' ? null : id);
    refreshState();
    return sendJson(res, 200, { ok: true, pinned: session.pinned });
  }
  if (p === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    refreshState();
    res.write(`data: ${stateJson}\n\n`);
    clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* ignore */ } }, 15000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  if (p === '/favicon.ico') {
    res.writeHead(204); return res.end();
  }

  // static
  let rel = p === '/' ? '/index.html' : p;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(__dirname, 'public', rel);
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end('forbidden'); }
  if (p === '/' || p === '/index.html') setHudCookie(res, HUD_TOKEN);
  try {
    const data = await fsp.readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    log(`port ${PORT} already in use — dashboard is already running at http://${HOST}:${PORT}`);
    process.exit(0);
  }
  throw e;
});

server.listen(PORT, HOST, () => {
  log(`MISSION CONTROL  ->  http://${HOST}:${PORT}`);
  log(`watching ${ROOT} | node ${process.version}`);
  try { fs.writeFileSync(path.join(STATE_DIR, 'server.pid'), String(process.pid)); } catch { /* ignore */ }
  setTimeout(() => { refreshState(); }, 2500);
});

process.on('SIGINT', () => { try { fs.unlinkSync(path.join(STATE_DIR, 'server.pid')); } catch { /* ignore */ } process.exit(0); });
process.on('SIGTERM', () => process.exit(0));
process.on('uncaughtException', (e) => log('[uncaught]', e.stack || e.message));
process.on('unhandledRejection', (e) => log('[rejection]', e?.stack || e));
