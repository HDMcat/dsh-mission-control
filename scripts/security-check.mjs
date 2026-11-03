#!/usr/bin/env node
/**
 * Security regression checks for the compact 7799 and full 7800 servers.
 * No external network, no DSH, no Chrome, no process launch.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startTelemetryServer } from '../src/server.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FULL_SERVER = path.join(ROOT, 'dashboard', 'server.mjs');
const cleanups = [];

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

function request(base, pathname, { method = 'GET', headers = {}, body = '' } = {}) {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: u.port,
      path: pathname,
      method,
      headers,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
    if (body) req.write(body);
    req.end();
  });
}

function cookieFrom(headers) {
  const raw = headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  assert.ok(value, 'expected Set-Cookie on HUD page');
  assert.match(value, /HttpOnly/i);
  assert.match(value, /SameSite=Strict/i);
  return value.split(';')[0];
}

async function waitForHealth(base) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await request(base, '/api/health');
      if (r.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('full server did not become healthy');
}

async function inspectCompact() {
  const watch = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-sec-compact-'));
  const server = startTelemetryServer({
    port: 0,
    demoMode: true,
    watchDir: watch,
    enableFileWatch: false,
    allowedOrigins: ['http://127.0.0.1:9999'],
  });
  cleanups.push(() => server.close());
  await new Promise((r) => setTimeout(r, 300));
  const port = server.server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const plain = await request(base, '/api/snapshot');
  assert.equal(plain.status, 200);
  assert.equal(plain.headers['access-control-allow-origin'], undefined);

  const bad = await request(base, '/api/snapshot', { headers: { Origin: 'http://evil.example' } });
  assert.equal(bad.status, 403, 'disallowed origin must be rejected');

  const good = await request(base, '/api/snapshot', { headers: { Origin: 'http://127.0.0.1:9999' } });
  assert.equal(good.status, 200);
  assert.equal(good.headers['access-control-allow-origin'], 'http://127.0.0.1:9999');

  const probe = await request(base, '/api/open-full', { headers: { Origin: 'http://127.0.0.1:9999' } });
  assert.equal(probe.status, 200);

  const badProbe = await request(base, '/api/open-full', { headers: { Origin: 'http://evil.example' } });
  assert.equal(badProbe.status, 403);

  const badHost = await request(base, '/api/health', { headers: { Host: 'evil.example' } });
  assert.equal(badHost.status, 403, 'DNS-rebinding Host must be rejected');
}

async function inspectFull() {
  const port = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-sec-full-'));
  const stateDir = path.join(tmp, 'state');
  const watchDir = path.join(tmp, 'workspace');
  const dshHome = path.join(tmp, 'dsh');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(watchDir, { recursive: true });
  fs.mkdirSync(dshHome, { recursive: true });

  const child = spawn(process.execPath, [FULL_SERVER], {
    cwd: path.dirname(FULL_SERVER),
    env: {
      ...process.env,
      MC_FULL_PORT: String(port),
      MC_STATE_DIR: stateDir,
      MC_WATCH_DIR: watchDir,
      DSH_HOME: dshHome,
      MC_READONLY: '1',
      MC_ALLOW_PROC: '0',
      DEEPSEEK_API_KEY: 'should-not-be-sent',
      MC_BALANCE_URL: '',
      MC_BALANCE_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  cleanups.push(() => {
    try { child.kill(); } catch { /* ignore */ }
  });
  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(base);

  const page = await request(base, '/');
  assert.equal(page.status, 200);
  const cookie = cookieFrom(page.headers);

  const unauth = await request(base, '/api/state');
  assert.equal(unauth.status, 401);

  const auth = await request(base, '/api/state', { headers: { Cookie: cookie } });
  assert.equal(auth.status, 200);
  assert.equal(JSON.parse(auth.body).controlToken, undefined);

  const streamUnauth = await request(base, '/api/stream');
  assert.equal(streamUnauth.status, 401);

  const noOrigin = await request(base, '/api/open-file', {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'x' }),
  });
  assert.equal(noOrigin.status, 403);

  const badOrigin = await request(base, '/api/open-file', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: 'http://evil.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'x' }),
  });
  assert.equal(badOrigin.status, 403);

  const sameOrigin = `http://127.0.0.1:${port}`;
  const selectGet = await request(base, '/api/select', { headers: { Cookie: cookie } });
  assert.equal(selectGet.status, 405);

  const selectPost = await request(base, '/api/select', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: sameOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'auto' }),
  });
  assert.equal(selectPost.status, 200);

  const badHost = await request(base, '/api/health', { headers: { Host: 'evil.example' } });
  assert.equal(badHost.status, 403);

  const balance = await request(base, '/api/balance', { headers: { Cookie: cookie } });
  assert.equal(balance.status, 200);
  assert.equal(JSON.parse(balance.body).code, 'not_configured');
}

try {
  await inspectCompact();
  await inspectFull();
  console.log('[security] OK: compact allowlist, HUD cookie, CSRF, host, no implicit balance');
} catch (error) {
  console.error('[security] FAIL:', error?.stack || error);
  process.exitCode = 1;
} finally {
  for (const fn of cleanups.reverse()) {
    try { await fn(); } catch { /* ignore */ }
  }
}
