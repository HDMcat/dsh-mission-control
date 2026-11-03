#!/usr/bin/env node
/**
 * Smoke-test the Host plugin's apply/cleanup path without DSH.
 * Starts the collector on 127.0.0.1:7809 with synthetic data.
 */
import { apply } from '../index.js';

const BASE = 'http://127.0.0.1:7809';
const cleanups = [];
const ctx = {
  effect(fn) {
    const dispose = fn();
    if (typeof dispose === 'function') cleanups.push(dispose);
    return dispose;
  },
};

apply(ctx, { port: 7809, watchDir: process.cwd(), pollMs: 400, demoMode: true, enableFileWatch: false, fullWindow: false });
await new Promise((resolve) => setTimeout(resolve, 800));

let failed = false;
try {
  const health = await fetch(`${BASE}/api/health`);
  if (!health.ok) throw new Error(`health HTTP ${health.status}`);
  const body = await health.json();
  if (!body.ok || body.demo !== true) throw new Error('health payload must report demo=true');

  const snapRes = await fetch(`${BASE}/api/snapshot`);
  const snap = await snapRes.json();
  if (snap.schema !== 'dsh.mission_control.snapshot/v1') throw new Error('unexpected schema');
  if (snap.demo !== true) throw new Error('snapshot must be demo in demo mode');
  if (snap.cpu?.model !== 'Demo CPU') throw new Error('demo snapshot leaked a real CPU model');
  if (snap.host?.platform !== 'demo') throw new Error('demo snapshot leaked a real platform');
  if (snap.watch?.label !== 'demo-workspace') throw new Error('unexpected watch label');
  if (!Array.isArray(snap.files)) throw new Error('files must be an array');
  const serialized = JSON.stringify(snap);
  if (/[A-Za-z]:[\\/]+(Users|E:|D:)/i.test(serialized)) throw new Error('snapshot contains an absolute Windows path');
  const cors = snapRes.headers.get('access-control-allow-origin');
  if (cors !== '*') throw new Error('missing CORS header');

  const page = await fetch(`${BASE}/`);
  const root = await page.json();
  if (!page.ok || root.name !== 'dsh-mission-control') throw new Error('host root payload missing');

  console.log('[smoke] host OK', {
    schema: snap.schema,
    cpu: snap.cpu.model,
    platform: snap.host.platform,
    files: snap.files.length,
  });
} catch (error) {
  failed = true;
  console.error('[smoke] FAIL', error.message);
} finally {
  for (const dispose of cleanups.reverse()) {
    try { await dispose(); } catch { /* ignore */ }
  }
}

process.exit(failed ? 1 : 0);
